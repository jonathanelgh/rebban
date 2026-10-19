import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import {
  appOriginFromRequest,
  getStripe,
  isStripeConfigured,
  toStripeAmount,
} from "@/lib/stripe/client";
import { getOrganizationStripeState } from "@/lib/stripe/org";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const { id: invoiceId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entitlement = await requireOrgEntitlement(supabase, user.id);
  if ("response" in entitlement) return entitlement.response;
  const organizationId = entitlement.organizationId;

  const org = await getOrganizationStripeState(supabase, organizationId);
  if (!org?.stripe_account_id || !org.stripe_charges_enabled) {
    return NextResponse.json(
      {
        error:
          "Connect Stripe and finish onboarding before creating payment links.",
      },
      { status: 400 }
    );
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, number, status, currency, total, notes, payment_token, client_id, deleted_at"
    )
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }
  if (!invoice || invoice.deleted_at) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
  }
  if (invoice.status === "void" || invoice.status === "draft") {
    return NextResponse.json(
      { error: "Mark the invoice as sent before collecting payment." },
      { status: 400 }
    );
  }

  const amount = toStripeAmount(invoice.total);
  if (amount < 50) {
    return NextResponse.json(
      { error: "Invoice total must be at least 0.50 in the invoice currency." },
      { status: 400 }
    );
  }

  let paymentToken = invoice.payment_token;
  if (!paymentToken) {
    paymentToken = nanoid(24);
    const { error: tokenError } = await supabase
      .from("invoices")
      .update({ payment_token: paymentToken })
      .eq("id", invoiceId);
    if (tokenError) {
      return NextResponse.json({ error: tokenError.message }, { status: 500 });
    }
  }

  const { data: client } = await supabase
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
              description:
                invoice.notes?.slice(0, 400) ||
                `Payment to ${org.name}${client?.company || client?.name ? ` for ${client.company || client.name}` : ""}`,
            },
          },
        },
      ],
      success_url: `${origin}/pay/${paymentToken}?status=success`,
      cancel_url: `${origin}/pay/${paymentToken}?status=cancelled`,
      metadata: {
        rebban_invoice_id: invoice.id,
        rebban_organization_id: organizationId,
        rebban_payment_token: paymentToken,
      },
      payment_intent_data: {
        metadata: {
          rebban_invoice_id: invoice.id,
          rebban_organization_id: organizationId,
        },
      },
      ...(process.env.STRIPE_TAX_ENABLED === "true"
        ? { automatic_tax: { enabled: true } }
        : {}),
    },
    { stripeAccount: org.stripe_account_id }
  );

  await supabase
    .from("invoices")
    .update({
      stripe_checkout_session_id: session.id,
      stripe_payment_status: session.payment_status || "unpaid",
    })
    .eq("id", invoiceId);

  return NextResponse.json({
    url: session.url,
    paymentUrl: `${origin}/pay/${paymentToken}`,
    sessionId: session.id,
  });
}
