import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillInvoiceCheckoutPaid } from "@/lib/invoices/fulfill-paid";
import { handleSubscriptionInvoicePaymentFailed } from "@/lib/billing/payment-failed";
import { notifyNewSubscription } from "@/lib/email/lifecycle-notify";
import {
  getStripe,
  getStripeWebhookSecrets,
  isStripeConfigured,
} from "@/lib/stripe/client";

export const runtime = "nodejs";

async function alreadyProcessed(eventId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    throw new Error(`stripe_webhook_events read failed: ${error.message}`);
  }
  return Boolean(data);
}

async function markProcessed(event: Stripe.Event) {
  const admin = createAdminClient();
  const { error } = await admin.from("stripe_webhook_events").upsert({
    id: event.id,
    type: event.type,
    payload: JSON.parse(JSON.stringify(event)),
  });
  if (error) {
    throw new Error(`stripe_webhook_events write failed: ${error.message}`);
  }
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

  try {
    const [{ data: org }, { data: ownerMember }] = await Promise.all([
      admin
        .from("organizations")
        .select("name, created_by")
        .eq("id", organizationId)
        .maybeSingle(),
      admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("role", "owner")
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);
    const ownerId = ownerMember?.user_id || org?.created_by || null;
    const { data: profile } = ownerId
      ? await admin
          .from("profiles")
          .select("full_name, email")
          .eq("id", ownerId)
          .maybeSingle()
      : { data: null };

    const interval =
      session.metadata?.billing_interval ||
      (priceId && process.env.STRIPE_PRICE_ID_YEARLY === priceId
        ? "year"
        : priceId
          ? "month"
          : null);

    await notifyNewSubscription({
      fullName: profile?.full_name,
      email: profile?.email || session.customer_details?.email || session.customer_email,
      organizationName: org?.name,
      organizationId,
      planInterval: interval,
      subscriptionStatus: status,
    });
  } catch (error) {
    console.error("[stripe webhook] subscription notify failed", error);
  }
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
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe not configured" },
        { status: 503 }
      );
    }

    const secrets = getStripeWebhookSecrets();
    if (secrets.length === 0) {
      return NextResponse.json(
        {
          error:
            "No Stripe webhook secrets set. Add STRIPE_WEBHOOK_SECRET (Connect) and/or STRIPE_BILLING_WEBHOOK_SECRET (Pro billing).",
        },
        { status: 503 }
      );
    }

    const stripe = getStripe();
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const rawBody = await request.text();
    let event: Stripe.Event | null = null;
    let lastError: string | null = null;
    for (const secret of secrets) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, secret);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Invalid signature";
      }
    }
    if (!event) {
      return NextResponse.json(
        { error: lastError || "Invalid signature" },
        { status: 400 }
      );
    }

    if (await alreadyProcessed(event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment") {
          await fulfillInvoiceCheckoutPaid(session);
        } else if (
          event.type === "checkout.session.completed" &&
          session.mode === "subscription"
        ) {
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
      case "invoice.payment_failed": {
        await handleSubscriptionInvoicePaymentFailed(
          event.data.object as Stripe.Invoice
        );
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
    return NextResponse.json({ received: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Webhook handler failed";
    console.error("[stripe webhook]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
