import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { computeEntitlement } from "@/lib/billing/plan";
import { getActiveOrganizationId } from "@/lib/stripe/org";

type Client = SupabaseClient<Database>;

/**
 * Ensures the user's active org is on a paid plan or an active trial.
 * Returns organizationId when entitled; otherwise a 402 JSON response.
 */
export async function requireOrgEntitlement(
  supabase: Client,
  userId: string
): Promise<{ organizationId: string } | { response: NextResponse }> {
  const organizationId = await getActiveOrganizationId(supabase, userId);
  if (!organizationId) {
    return {
      response: NextResponse.json({ error: "No organization" }, { status: 400 }),
    };
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_subscription_status, trial_ends_at, complimentary_pro")
    .eq("id", organizationId)
    .maybeSingle();

  const entitlement = computeEntitlement({
    subscriptionStatus: org?.stripe_subscription_status,
    trialEndsAt: org?.trial_ends_at,
    complimentaryPro: org?.complimentary_pro,
  });

  if (!entitlement.entitled) {
    return {
      response: NextResponse.json(
        {
          error: "Your free trial has ended. Upgrade to Pro to continue.",
          code: "trial_expired",
        },
        { status: 402 }
      ),
    };
  }

  return { organizationId };
}
