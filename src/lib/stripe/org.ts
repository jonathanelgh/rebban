import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type OrgStripeRow = {
  id: string;
  name: string;
  currency: string;
  country: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_price_id: string | null;
  trial_ends_at: string | null;
  complimentary_pro: boolean;
};

export async function getActiveOrganizationId(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.active_organization_id) {
    return profile.active_organization_id;
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return membership?.organization_id ?? null;
}

export async function getOrganizationStripeState(
  supabase: SupabaseClient<Database>,
  organizationId: string
) {
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, currency, country, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_price_id, trial_ends_at, complimentary_pro"
    )
    .eq("id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return (data as OrgStripeRow | null) ?? null;
}
