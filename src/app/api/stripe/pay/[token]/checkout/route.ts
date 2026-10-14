import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  appOriginFromRequest,
  getStripe,
  isStripeConfigured,
  toStripeAmount,
} from "@/lib/stripe/client";

type RouteContext = { params: Promise<{ token: string }> };

/** Public: create Checkout on the connected account for an invoice payment token. */
export async function POST(request: Request, context: RouteContext) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Payments unavailable" }, { status: 503 });
  }

  const { token } = await context.params;
  const admin = createAdminClient();

  const { data: invoice, error } = await admin
    .from("invoices")
    .select(
      "id, number, status, currency, total, notes, client_id, organization_id, deleted_at, stripe_checkout_session_id"
    )
    .eq("payment_token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!invoice || invoice.deleted_at) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Already paid", alreadyPaid: true }, { status: 400 });
  }
  if (invoice.status === "void" || invoice.status === "draft") {
    return NextResponse.json({ error: "Invoice is not payable yet" }, { status: 400 });
  }

  const { data: org } = await admin
    .from("organizations")
    .select(
      "id, name, stripe_account_id, stripe_charges_enabled, currency"
    )
    .eq("id", invoice.organization_id)
    .maybeSingle();

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

  const { data: client } = await admin
    .from("clients")
    .select("email, name, company")
    .eq("id", invoice.client_id)
    .maybeSingle();

  const origin = appOriginFromRequest(request);
  const stripe = getStripe();
  const currency = (invoice.currency || org.currency || "eur").toLowerCase();
  const description = invoice.number
    ? `Invoice ${invoice.number}`
    : `Invoice ${invoice.id.slice(0, 8)}`;

  const session = await stripe.checkout.sessions.create(
    {
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
              description: `Payment to ${org.name}`,
            },
          },
        },
      ],
      success_url: `${origin}/pay/${token}?status=success`,
      cancel_url: `${origin}/pay/${token}?status=cancelled`,
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

  await admin
    .from("invoices")
    .update({
      stripe_checkout_session_id: session.id,
      stripe_payment_status: session.payment_status || "unpaid",
    })
    .eq("id", invoice.id);

  return NextResponse.json({ url: session.url });
}
