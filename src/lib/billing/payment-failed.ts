import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import { sendSubscriptionPaymentFailedEmail } from "@/lib/email/resend";

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parentSub = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSub === "string") return parentSub;
  if (parentSub && typeof parentSub === "object" && "id" in parentSub) {
    return parentSub.id;
  }
  // Legacy / older payloads may still include top-level subscription.
  const legacy = (invoice as { subscription?: string | Stripe.Subscription | null })
    .subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object" && "id" in legacy) return legacy.id;
  return null;
}

/**
 * Sync org to past_due (or current sub status) and email the workspace owner.
 * Idempotent per Stripe event via stripe_webhook_events.
 */
export async function handleSubscriptionInvoicePaymentFailed(
  invoice: Stripe.Invoice
) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return;

  const subId = subscriptionIdFromInvoice(invoice);
  // Ignore one-off invoices that aren't tied to a subscription.
  if (!subId && invoice.billing_reason !== "subscription_cycle" && invoice.billing_reason !== "subscription_update" && invoice.billing_reason !== "subscription_create") {
    return;
  }

  const admin = createAdminClient();
  const stripe = getStripe();

  let status = "past_due";
  let priceId: string | null = null;

  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      status = sub.status;
      priceId = sub.items.data[0]?.price?.id || null;
    } catch (err) {
      console.error("[billing] retrieve subscription after payment_failed", err);
    }
  }

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, created_by")
    .eq("stripe_customer_id", customerId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!org) {
    console.warn("[billing] payment_failed: no org for customer", customerId);
    return;
  }

  await admin
    .from("organizations")
    .update({
      stripe_subscription_status: status,
      ...(subId ? { stripe_subscription_id: subId } : {}),
      ...(priceId ? { stripe_price_id: priceId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", org.id);

  let to: string | null = null;
  let recipientName: string | null = null;

  if (org.created_by) {
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", org.created_by)
      .maybeSingle();
    to = profile?.email || null;
    recipientName = profile?.full_name || null;
  }

  if (!to) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted && customer.email) {
        to = customer.email;
        recipientName = customer.name || recipientName;
      }
    } catch {
      // ignore
    }
  }

  if (!to) {
    console.warn("[billing] payment_failed: no email for org", org.id);
    return;
  }

  const amount = (invoice.amount_due || invoice.total || 0) / 100;
  const currency = (invoice.currency || "usd").toUpperCase();
  const amountLabel = formatInvoiceMoney(amount, currency);

  try {
    await sendSubscriptionPaymentFailedEmail({
      to,
      recipientName,
      organizationName: org.name,
      amountLabel,
      invoiceNumber: invoice.number,
      attemptCount: invoice.attempt_count || 1,
    });
  } catch (err) {
    console.error("[billing] payment_failed email failed", err);
  }
}
