import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { computeEntitlement } from "@/lib/billing/plan";
import { normalizeEmail } from "@/lib/outreach/safety-core";

type Db = SupabaseClient<Database>;

export type LeadSignupInfo = {
  signedUp: boolean;
  userId: string | null;
  signedUpAt: string | null;
  onboardingCompletedAt: string | null;
  fullName: string | null;
  /** Stripe subscription active / past_due (actually paying). */
  paying: boolean;
  /** Product trial active without a paid subscription. */
  onTrial: boolean;
  planLabel: string | null;
};

const EMPTY: LeadSignupInfo = {
  signedUp: false,
  userId: null,
  signedUpAt: null,
  onboardingCompletedAt: null,
  fullName: null,
  paying: false,
  onTrial: false,
  planLabel: null,
};

async function enrichBilling(
  db: Db,
  byEmail: Map<string, LeadSignupInfo>
): Promise<void> {
  const userIds = Array.from(
    new Set(
      Array.from(byEmail.values())
        .map((s) => s.userId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (!userIds.length) return;

  const { data: profiles } = await db
    .from("profiles")
    .select("id, active_organization_id")
    .in("id", userIds);

  const { data: memberships } = await db
    .from("organization_members")
    .select("user_id, organization_id, status")
    .in("user_id", userIds)
    .eq("status", "active");

  const orgIds = new Set<string>();
  const activeOrgByUser = new Map<string, string>();
  for (const p of profiles || []) {
    if (p.active_organization_id) {
      activeOrgByUser.set(p.id, p.active_organization_id);
      orgIds.add(p.active_organization_id);
    }
  }
  const memberOrgByUser = new Map<string, string>();
  for (const m of memberships || []) {
    if (!memberOrgByUser.has(m.user_id)) {
      memberOrgByUser.set(m.user_id, m.organization_id);
    }
    orgIds.add(m.organization_id);
  }

  if (!orgIds.size) return;

  const { data: orgs } = await db
    .from("organizations")
    .select("id, stripe_subscription_status, trial_ends_at, complimentary_pro")
    .in("id", Array.from(orgIds));

  const orgById = new Map((orgs || []).map((o) => [o.id, o] as const));

  for (const info of byEmail.values()) {
    if (!info.userId) continue;
    const orgId =
      activeOrgByUser.get(info.userId) || memberOrgByUser.get(info.userId);
    if (!orgId) continue;
    const org = orgById.get(orgId);
    if (!org) continue;

    const entitlement = computeEntitlement({
      subscriptionStatus: org.stripe_subscription_status,
      trialEndsAt: org.trial_ends_at,
      complimentaryPro: org.complimentary_pro,
    });
    const status = org.stripe_subscription_status;
    info.paying =
      status === "active" ||
      status === "past_due" ||
      entitlement.complimentaryPro;
    info.onTrial = entitlement.trialActive && !info.paying;
    info.planLabel = entitlement.planLabel;
  }
}

/** Match lead emails to platform profiles (case-insensitive). */
export async function lookupSignupsByEmails(
  db: Db,
  emails: Array<string | null | undefined>
): Promise<Map<string, LeadSignupInfo>> {
  const normalized = Array.from(
    new Set(
      emails
        .map((e) => (e ? normalizeEmail(e) : ""))
        .filter((e) => e.length > 0)
    )
  );

  const result = new Map<string, LeadSignupInfo>();
  if (!normalized.length) return result;

  // Prefer exact match on normalized addresses (auth emails are usually lowercased).
  const { data, error } = await db
    .from("profiles")
    .select("id, email, created_at, onboarding_completed_at, full_name")
    .is("deleted_at", null)
    .in("email", normalized);

  if (error) {
    console.error("[outreach] signup lookup failed", error.message);
    return result;
  }

  for (const row of data || []) {
    if (!row.email) continue;
    result.set(normalizeEmail(row.email), {
      ...EMPTY,
      signedUp: true,
      userId: row.id,
      signedUpAt: row.created_at,
      onboardingCompletedAt: row.onboarding_completed_at,
      fullName: row.full_name,
    });
  }

  // Catch mixed-case profile emails not returned by .in().
  const missing = normalized.filter((e) => !result.has(e));
  if (missing.length && missing.length <= 50) {
    const orFilter = missing
      .map((e) => `email.ilike."${e.replace(/"/g, "")}"`)
      .join(",");
    const { data: extra } = await db
      .from("profiles")
      .select("id, email, created_at, onboarding_completed_at, full_name")
      .is("deleted_at", null)
      .or(orFilter);
    for (const row of extra || []) {
      if (!row.email) continue;
      result.set(normalizeEmail(row.email), {
        ...EMPTY,
        signedUp: true,
        userId: row.id,
        signedUpAt: row.created_at,
        onboardingCompletedAt: row.onboarding_completed_at,
        fullName: row.full_name,
      });
    }
  }

  await enrichBilling(db, result);
  return result;
}

export function signupForEmail(
  map: Map<string, LeadSignupInfo>,
  email: string | null | undefined
): LeadSignupInfo {
  if (!email) return EMPTY;
  return map.get(normalizeEmail(email)) || EMPTY;
}

/** Emails of leads that have a matching profile (for list filters). */
export async function signedUpLeadEmails(db: Db): Promise<Set<string>> {
  const { data: leads, error: leadsError } = await db
    .from("outreach_leads")
    .select("email_normalized")
    .not("email_normalized", "is", null);

  if (leadsError) {
    console.error("[outreach] signed-up lead emails failed", leadsError.message);
    return new Set();
  }

  const emails = (leads || [])
    .map((l) => l.email_normalized)
    .filter((e): e is string => Boolean(e));

  const map = await lookupSignupsByEmails(db, emails);
  return new Set(map.keys());
}

/** Emails of leads that are paying customers (active/past_due Stripe). */
export async function payingLeadEmails(db: Db): Promise<Set<string>> {
  const { data: leads, error: leadsError } = await db
    .from("outreach_leads")
    .select("email_normalized")
    .not("email_normalized", "is", null);

  if (leadsError) {
    console.error("[outreach] paying lead emails failed", leadsError.message);
    return new Set();
  }

  const emails = (leads || [])
    .map((l) => l.email_normalized)
    .filter((e): e is string => Boolean(e));

  const map = await lookupSignupsByEmails(db, emails);
  const paying = new Set<string>();
  for (const [email, info] of map) {
    if (info.paying) paying.add(email);
  }
  return paying;
}
