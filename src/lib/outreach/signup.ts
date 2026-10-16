import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { normalizeEmail } from "@/lib/outreach/safety-core";

type Db = SupabaseClient<Database>;

export type LeadSignupInfo = {
  signedUp: boolean;
  userId: string | null;
  signedUpAt: string | null;
  onboardingCompletedAt: string | null;
  fullName: string | null;
};

const EMPTY: LeadSignupInfo = {
  signedUp: false,
  userId: null,
  signedUpAt: null,
  onboardingCompletedAt: null,
  fullName: null,
};

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
        signedUp: true,
        userId: row.id,
        signedUpAt: row.created_at,
        onboardingCompletedAt: row.onboarding_completed_at,
        fullName: row.full_name,
      });
    }
  }

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
