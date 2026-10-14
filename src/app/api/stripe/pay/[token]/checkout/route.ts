import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import type { Database } from "@/types/database";
import {
  appOriginFromRequest,
  getStripe,
  getStripePublishableKey,
  isStripeConfigured,
  toStripeAmount,
} from "@/lib/stripe/client";

type RouteContext = { params: Promise<{ token: string }> };

function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public env vars are not configured.");
  }
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type PublicInvoicePayload = {
  invoice: {
    id: string;
    number: string | null;
    status: string;
    currency: string;
    total: number;
    notes: string | null;
    organization_id: string;
    client_id: string | null;
  };
  organization: {
    id: string;
    name: string | null;
    currency: string | null;
    stripe_account_id: string | null;
    stripe_charges_enabled: boolean | null;
  } | null;
  client: {
    email: string | null;
    name: string | null;
    company: string | null;
  } | null;
};

/** Public: create embedded Checkout Session for an invoice payment token. */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Payments unavailable" }, { status: 503 });
    }

    const publishableKey = getStripePublishableKey();
    if (!publishableKey) {
      return NextResponse.json(
        { error: "Stripe publishable key is not configured." },
        { status: 503 }
      );
    }

    const { token } = await context.params;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("get_public_invoice", {
      p_token: token.trim(),
    });

    if (error || !data) {
      const message = error?.message || "Invoice not found";
      const status = /not found/i.test(message) ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const payload = data as unknown as PublicInvoicePayload;
    const invoice = payload.invoice;
    const org = payload.organization;
    const client = payload.client;

    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "Already paid", alreadyPaid: true },
        { status: 400 }
      );
    }
    if (invoice.status === "void" || invoice.status === "draft") {
      return NextResponse.json(
        { error: "Invoice is not payable yet" },
        { status: 400 }
      );
    }

    if (!org?.stripe_account_id || !org.stripe_charges_enabled) {
      return NextResponse.json(
        { error: "This business is not ready to accept card payments yet." },
        { status: 400 }
      );
    }

    const amount = toStripeAmount(invoice.total);
    if (amount < 50) {
      return NextResponse.json({ error: "Invalid invoice amount" }, { status: 400 });
    }

    const origin = appOriginFromRequest(request);
    const stripe = getStripe();
    const currency = (invoice.currency || org.currency || "eur").toLowerCase();
    const description = invoice.number
      ? `Invoice ${invoice.number}`
      : `Invoice ${invoice.id.slice(0, 8)}`;

    const returnUrl = `${origin}/pay/${token}?status=success&session_id={CHECKOUT_SESSION_ID}`;

    const billingName =
      client?.name?.trim() ||
      client?.company?.trim() ||
      client?.email?.trim() ||
      "Customer";
    const billingCountry = countryFromCurrency(
      invoice.currency || org.currency || "USD"
    );

    const session = await stripe.checkout.sessions.create(
      {
        ui_mode: "elements",
        mode: "payment",
        customer_email: client?.email || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: amount,
              product_data: {
                name: description,
              },
            },
          },
        ],
        return_url: returnUrl,
        integration_identifier: `rebban_invoice_pay_${nanoid(8)}`,
        metadata: {
          rebban_invoice_id: invoice.id,
          rebban_organization_id: invoice.organization_id,
          rebban_payment_token: token,
        },
        payment_intent_data: {
          metadata: {
            rebban_invoice_id: invoice.id,
            rebban_organization_id: invoice.organization_id,
          },
        },
        ...(process.env.STRIPE_TAX_ENABLED === "true"
          ? { automatic_tax: { enabled: true } }
          : {}),
      },
      { stripeAccount: org.stripe_account_id }
    );

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Checkout Session is missing a client secret." },
        { status: 500 }
      );
    }

    await supabase.rpc("set_public_invoice_checkout", {
      p_token: token.trim(),
      p_session_id: session.id,
      p_payment_status: session.payment_status || "unpaid",
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      publishableKey,
      stripeAccountId: org.stripe_account_id,
      sessionId: session.id,
      returnUrl: `${origin}/pay/${token}?status=success`,
      billing: {
        name: billingName,
        email: client?.email || null,
        country: billingCountry,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function countryFromCurrency(currency: string) {
  switch (currency.toUpperCase()) {
    case "USD":
      return "US";
    case "GBP":
      return "GB";
    case "SEK":
      return "SE";
    case "NOK":
      return "NO";
    case "DKK":
      return "DK";
    case "EUR":
      return "DE";
    default:
      return "US";
  }
}
