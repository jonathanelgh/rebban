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
import { computeEntitlement } from "@/lib/billing/plan";
import { fetchPlatformPricing } from "@/lib/stripe/prices";

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
  });
  const pricing = await fetchPlatformPricing();

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
    planLabel: entitlement.planLabel,
    pricing,
  });
}
