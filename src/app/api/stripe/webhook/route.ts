import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStripe,
  getStripeWebhookSecret,
  isStripeConfigured,
} from "@/lib/stripe/client";

export const runtime = "nodejs";

async function alreadyProcessed(eventId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  return Boolean(data);
}

async function markProcessed(event: Stripe.Event) {
  const admin = createAdminClient();
  await admin.from("stripe_webhook_events").upsert({
    id: event.id,
    type: event.type,
    payload: JSON.parse(JSON.stringify(event)),
  });
}

async function markInvoicePaid(options: {
  invoiceId: string;
  sessionId?: string | null;
  paymentIntentId?: string | null;
  paymentStatus?: string | null;
}) {
  const admin = createAdminClient();
  await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_checkout_session_id: options.sessionId || undefined,
      stripe_payment_intent_id: options.paymentIntentId || undefined,
      stripe_payment_status: options.paymentStatus || "paid",
    })
    .eq("id", options.invoiceId)
    .neq("status", "paid");
}

async function syncSubscriptionFromSession(session: Stripe.Checkout.Session) {
  const organizationId =
    session.metadata?.organization_id || session.client_reference_id;
  if (!organizationId || session.mode !== "subscription") return;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  const admin = createAdminClient();
  const stripe = getStripe();

  let status: string | null = null;
  let priceId: string | null = null;
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    status = sub.status;
    priceId = sub.items.data[0]?.price?.id || null;
  }

  await admin
    .from("organizations")
    .update({
      stripe_customer_id: customerId || undefined,
      stripe_subscription_id: subscriptionId || undefined,
      stripe_subscription_status: status,
      stripe_price_id: priceId,
    })
    .eq("id", organizationId);
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organization_id;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const admin = createAdminClient();
  const priceId = subscription.items.data[0]?.price?.id || null;

  if (organizationId) {
    await admin
      .from("organizations")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_subscription_status: subscription.status,
        stripe_price_id: priceId,
      })
      .eq("id", organizationId);
    return;
  }

  await admin
    .from("organizations")
    .update({
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: subscription.status,
      stripe_price_id: priceId,
    })
    .eq("stripe_customer_id", customerId);
}

async function syncConnectAccount(account: Stripe.Account) {
  if (!account.id) return;
  const admin = createAdminClient();
  await admin
    .from("organizations")
    .update({
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_details_submitted: Boolean(account.details_submitted),
    })
    .eq("stripe_account_id", account.id);
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const secret = getStripeWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set" },
      { status: 503 }
    );
  }

  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (await alreadyProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment") {
          const invoiceId = session.metadata?.rebban_invoice_id;
          if (invoiceId && session.payment_status === "paid") {
            const paymentIntentId =
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id || null;
            await markInvoicePaid({
              invoiceId,
              sessionId: session.id,
              paymentIntentId,
              paymentStatus: session.payment_status,
            });
          }
        } else if (session.mode === "subscription") {
          await syncSubscriptionFromSession(session);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "account.updated": {
        await syncConnectAccount(event.data.object as Stripe.Account);
        break;
      }
      default:
        break;
    }

    await markProcessed(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler failed";
    console.error("[stripe webhook]", event.type, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
