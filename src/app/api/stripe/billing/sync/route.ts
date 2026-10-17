import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  getActiveOrganizationId,
  getOrganizationStripeState,
} from "@/lib/stripe/org";
import { computeEntitlement } from "@/lib/billing/plan";
import { syncOrgSubscriptionFromStripe } from "@/lib/stripe/sync-subscription";

/** Force-pull subscription from Stripe after checkout (webhook may lag). */
export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

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
  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing customer yet." },
      { status: 400 }
    );
  }

  try {
    const synced = await syncOrgSubscriptionFromStripe({
      organizationId,
      customerId: org.stripe_customer_id,
      knownSubscriptionId: org.stripe_subscription_id,
      supabase,
    });

    const entitlement = computeEntitlement({
      subscriptionStatus: synced.status,
      trialEndsAt: org.trial_ends_at,
      complimentaryPro: org.complimentary_pro,
    });

    return NextResponse.json({
      ok: true,
      ...synced,
      active: entitlement.paid,
      planLabel: entitlement.planLabel,
      entitled: entitlement.entitled,
    });
  } catch (error) {
    console.error("[billing/sync]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not sync subscription.",
      },
      { status: 500 }
    );
  }
}
