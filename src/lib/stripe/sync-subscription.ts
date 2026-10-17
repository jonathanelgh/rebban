import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { subscriptionPeriodEndIso } from "@/lib/stripe/billing-customer";
import { isPaidSubscriptionStatus } from "@/lib/billing/plan";

export type SyncedSubscription = {
  subscriptionId: string | null;
  status: string | null;
  priceId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  paymentMethodLabel: string | null;
};

function paymentMethodLabelFrom(
  pm: string | Stripe.PaymentMethod | null | undefined
) {
  if (!pm || typeof pm === "string") return null;
  if (pm.type === "card" && pm.card) {
    return `${pm.card.brand?.toUpperCase() || "Card"} ···· ${pm.card.last4}`;
  }
  return null;
}

function getWriteClient(fallback?: SupabaseClient<Database>) {
  try {
    return createAdminClient();
  } catch (err) {
    if (fallback) {
      console.warn(
        "[billing] service role unavailable; writing subscription with user client",
        err
      );
      return fallback;
    }
    throw err;
  }
}

/**
 * Pull the latest subscription for a Stripe customer and persist it on the org.
 * Used when webhooks are delayed/missing so Settings reflects a successful checkout.
 */
export async function syncOrgSubscriptionFromStripe(options: {
  organizationId: string;
  customerId: string;
  knownSubscriptionId?: string | null;
  /** Fallback DB client when SUPABASE_SERVICE_ROLE_KEY is not set. */
  supabase?: SupabaseClient<Database>;
}): Promise<SyncedSubscription> {
  const stripe = getStripe();
  const db = getWriteClient(options.supabase);
  let sub: Stripe.Subscription | null = null;

  if (options.knownSubscriptionId) {
    try {
      sub = await stripe.subscriptions.retrieve(options.knownSubscriptionId, {
        expand: ["default_payment_method"],
      });
    } catch (err) {
      console.error("[billing] known subscription retrieve failed", err);
    }
  }

  if (!sub) {
    const list = await stripe.subscriptions.list({
      customer: options.customerId,
      status: "all",
      limit: 10,
      expand: ["data.default_payment_method"],
    });
    // Prefer active / past_due / trialing, then most recent.
    const ranked = [...list.data].sort((a, b) => {
      const score = (s: Stripe.Subscription) =>
        isPaidSubscriptionStatus(s.status) ? 2 : s.status === "incomplete" ? 1 : 0;
      const byStatus = score(b) - score(a);
      if (byStatus !== 0) return byStatus;
      return (b.created || 0) - (a.created || 0);
    });
    sub = ranked[0] || null;
  }

  if (!sub) {
    return {
      subscriptionId: null,
      status: null,
      priceId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      paymentMethodLabel: null,
    };
  }

  const priceId = sub.items.data[0]?.price?.id || null;
  const { error } = await db
    .from("organizations")
    .update({
      stripe_customer_id: options.customerId,
      stripe_subscription_id: sub.id,
      stripe_subscription_status: sub.status,
      stripe_price_id: priceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.organizationId);

  if (error) {
    throw new Error(`Could not persist subscription: ${error.message}`);
  }

  return {
    subscriptionId: sub.id,
    status: sub.status,
    priceId,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    currentPeriodEnd: subscriptionPeriodEndIso(sub),
    paymentMethodLabel: paymentMethodLabelFrom(sub.default_payment_method),
  };
}
