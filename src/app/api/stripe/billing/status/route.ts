import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getPlatformPriceId,
  getPlatformYearlyPriceId,
  isStripeConfigured,
} from "@/lib/stripe/client";
import {
  getActiveOrganizationId,
  getOrganizationStripeState,
} from "@/lib/stripe/org";
import {
  computeEntitlement,
  isPaidSubscriptionStatus,
} from "@/lib/billing/plan";
import { platformBillingCurrencyForCountry } from "@/lib/stripe/billing-currency";
import { fetchPlatformPricing } from "@/lib/stripe/prices";
import { syncOrgSubscriptionFromStripe } from "@/lib/stripe/sync-subscription";

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

  let org = await getOrganizationStripeState(supabase, organizationId);
  const billingCurrency = platformBillingCurrencyForCountry(org?.country);
  const pricing = await fetchPlatformPricing({ currency: billingCurrency });

  let cancelAtPeriodEnd = false;
  let currentPeriodEnd: string | null = null;
  let paymentMethodLabel: string | null = null;
  let status = org?.stripe_subscription_status || null;
  let subscriptionId = org?.stripe_subscription_id ?? null;
  let priceId = org?.stripe_price_id ?? null;

  // If we have a Stripe customer but DB looks unpaid/stale (common when webhooks
  // lag or billing webhook secret isn't set), hydrate from Stripe.
  const needsStripeSync =
    isStripeConfigured() &&
    Boolean(org?.stripe_customer_id) &&
    (!subscriptionId || !isPaidSubscriptionStatus(status));

  if (needsStripeSync && org?.stripe_customer_id) {
    try {
      const synced = await syncOrgSubscriptionFromStripe({
        organizationId,
        customerId: org.stripe_customer_id,
        knownSubscriptionId: subscriptionId,
        supabase,
      });
      if (synced.status) {
        status = synced.status;
        subscriptionId = synced.subscriptionId;
        priceId = synced.priceId;
        cancelAtPeriodEnd = synced.cancelAtPeriodEnd;
        currentPeriodEnd = synced.currentPeriodEnd;
        paymentMethodLabel = synced.paymentMethodLabel;
        org = await getOrganizationStripeState(supabase, organizationId);
      }
    } catch (err) {
      console.error("[billing/status] sync from Stripe failed", err);
    }
  } else if (
    isStripeConfigured() &&
    org?.stripe_customer_id &&
    subscriptionId &&
    isPaidSubscriptionStatus(status)
  ) {
    try {
      const synced = await syncOrgSubscriptionFromStripe({
        organizationId,
        customerId: org.stripe_customer_id,
        knownSubscriptionId: subscriptionId,
        supabase,
      });
      cancelAtPeriodEnd = synced.cancelAtPeriodEnd;
      currentPeriodEnd = synced.currentPeriodEnd;
      paymentMethodLabel = synced.paymentMethodLabel;
      status = synced.status || status;
      priceId = synced.priceId || priceId;
    } catch (err) {
      console.error("[billing/status] subscription lookup failed", err);
    }
  }

  const entitlement = computeEntitlement({
    subscriptionStatus: status,
    trialEndsAt: org?.trial_ends_at,
    complimentaryPro: org?.complimentary_pro,
  });

  return NextResponse.json({
    configured: isStripeConfigured() && Boolean(getPlatformPriceId()),
    yearlyConfigured: Boolean(getPlatformYearlyPriceId() && pricing.yearly),
    hasCustomer: Boolean(org?.stripe_customer_id),
    subscriptionId,
    status,
    priceId,
    trialEndsAt: org?.trial_ends_at ?? null,
    trialDaysLeft: entitlement.trialDaysLeft,
    trialActive: entitlement.trialActive,
    trialExpired: entitlement.trialExpired,
    entitled: entitlement.entitled,
    active: entitlement.paid,
    complimentaryPro: entitlement.complimentaryPro,
    planLabel: entitlement.planLabel,
    pricing,
    billingCurrency: pricing.currency,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    paymentMethodLabel,
  });
}
