import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";

/**
 * GDPR account erasure for a user.
 * Soft-deletes owned workspaces, scrubs profile PII, cancels Stripe, removes auth user.
 */
export async function deleteUserAccount(userId: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: ownedOrgs, error: orgsError } = await admin
    .from("organizations")
    .select("id, stripe_subscription_id")
    .eq("created_by", userId)
    .is("deleted_at", null);

  if (orgsError) {
    throw new Error(orgsError.message);
  }

  if (isStripeConfigured()) {
    const stripe = getStripe();
    for (const org of ownedOrgs || []) {
      if (!org.stripe_subscription_id) continue;
      try {
        await stripe.subscriptions.cancel(org.stripe_subscription_id);
      } catch (err) {
        console.error("[delete-account] cancel subscription failed", {
          orgId: org.id,
          err,
        });
      }
    }
  }

  for (const org of ownedOrgs || []) {
    const { error } = await admin
      .from("organizations")
      .update({
        deleted_at: now,
        stripe_subscription_status: "canceled",
        complimentary_pro: false,
        name: "Deleted workspace",
        legal_name: null,
        org_number: null,
        address: null,
        tax_id: null,
        website: null,
        description: null,
        logo_url: null,
        payment_iban: null,
        payment_bankgiro: null,
        payment_swish: null,
        payment_mbway: null,
        updated_at: now,
      })
      .eq("id", org.id);
    if (error) throw new Error(error.message);
  }

  await admin.from("gmail_connections").delete().eq("user_id", userId);
  await admin.from("outlook_connections").delete().eq("user_id", userId);
  await admin.from("outreach_gmail_connections").delete().eq("user_id", userId);

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      deleted_at: now,
      email: null,
      full_name: "Deleted user",
      avatar_url: null,
      title: null,
      industry: null,
      active_organization_id: null,
      marketing_consent: false,
      marketing_consent_at: null,
      notification_prefs: {},
      updated_at: now,
    })
    .eq("id", userId);

  if (profileError) throw new Error(profileError.message);

  await admin
    .from("organization_members")
    .update({ status: "removed", updated_at: now })
    .eq("user_id", userId);

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    throw new Error(authError.message || "Could not delete auth user.");
  }

  return { ok: true as const, deletedOrgCount: (ownedOrgs || []).length };
}
