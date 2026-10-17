import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getPlatformPriceId,
  getPlatformYearlyPriceId,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe/client";
import {
  getActiveOrganizationId,
  getOrganizationStripeState,
} from "@/lib/stripe/org";
import { computeEntitlement } from "@/lib/billing/plan";
import { fetchPlatformPricing } from "@/lib/stripe/prices";
import { subscriptionPeriodEndIso } from "@/lib/stripe/billing-customer";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = await getActiveOrganizationId(supabase, user.id);
  if (!organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const org = await getOrganizationStripeState(supabase, organizationId);
  const status = org?.stripe_subscription_status || null;
  const entitlement = computeEntitlement({
    subscriptionStatus: status,
    trialEndsAt: org?.trial_ends_at,
    complimentaryPro: org?.complimentary_pro,
  });
  const pricing = await fetchPlatformPricing();

  let cancelAtPeriodEnd = false;
  let currentPeriodEnd: string | null = null;
  let paymentMethodLabel: string | null = null;

  if (
    isStripeConfigured() &&
    org?.stripe_subscription_id &&
    entitlement.paid
  ) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(
        org.stripe_subscription_id,
        { expand: ["default_payment_method"] }
      );
      cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
      currentPeriodEnd = subscriptionPeriodEndIso(sub);
      const pm = sub.default_payment_method;
      if (pm && typeof pm !== "string" && pm.type === "card" && pm.card) {
        paymentMethodLabel = `${pm.card.brand?.toUpperCase() || "Card"} ···· ${pm.card.last4}`;
      }
    } catch (err) {
      console.error("[billing/status] subscription lookup failed", err);
    }
  }

  return NextResponse.json({
    configured: isStripeConfigured() && Boolean(getPlatformPriceId()),
    yearlyConfigured: Boolean(getPlatformYearlyPriceId() && pricing.yearly),
    hasCustomer: Boolean(org?.stripe_customer_id),
    subscriptionId: org?.stripe_subscription_id ?? null,
    status,
    priceId: org?.stripe_price_id ?? null,
    trialEndsAt: org?.trial_ends_at ?? null,
    trialDaysLeft: entitlement.trialDaysLeft,
    trialActive: entitlement.trialActive,
    trialExpired: entitlement.trialExpired,
    entitled: entitlement.entitled,
    active: entitlement.paid,
    complimentaryPro: entitlement.complimentaryPro,
    planLabel: entitlement.planLabel,
    pricing,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    paymentMethodLabel,
  });
}
