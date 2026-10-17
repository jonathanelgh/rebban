import { createClient } from "@/lib/supabase/server";
import { computeEntitlement } from "@/lib/billing/plan";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

export async function getIsPlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false, supabase };

  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) {
    console.error("is_platform_admin failed", error.message);
    return { user, isAdmin: false, supabase };
  }
  return { user, isAdmin: Boolean(data), supabase };
}

export async function requirePlatformAdmin() {
  const { user, isAdmin, supabase } = await getIsPlatformAdmin();
  if (!user) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  if (!isAdmin) {
    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  }
  // Platform-admin RLS already allows cross-tenant reads — no service role needed.
  return { ok: true as const, user, db: supabase };
}

export type AdminOrgRow = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  planLabel: string;
  entitled: boolean;
  paid: boolean;
  complimentaryPro: boolean;
  trialActive: boolean;
  memberCount: number;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currency: string | null;
  country: string | null;
  address: string | null;
};

export type AdminOverview = {
  users: number;
  organizations: number;
  paid: number;
  trial: number;
  free: number;
  solo: number;
  agency: number;
  recentOrgs: AdminOrgRow[];
  signupsLast7Days: number;
};

function planFromOrg(org: {
  stripe_subscription_status: string | null;
  trial_ends_at: string | null;
  complimentary_pro?: boolean | null;
}) {
  return computeEntitlement({
    subscriptionStatus: org.stripe_subscription_status,
    trialEndsAt: org.trial_ends_at,
    complimentaryPro: org.complimentary_pro,
  });
}

export async function loadAdminOrganizations(db: DbClient) {
  const { data: orgs, error } = await db
    .from("organizations")
    .select(
      "id, name, type, created_at, trial_ends_at, stripe_subscription_status, stripe_customer_id, stripe_subscription_id, complimentary_pro, created_by, currency, country, address"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const orgIds = (orgs || []).map((o) => o.id);
  const ownerIds = Array.from(
    new Set(
      (orgs || [])
        .map((o) => o.created_by)
        .filter((id): id is string => Boolean(id))
    )
  );

  const membersRes = orgIds.length
    ? await db
        .from("organization_members")
        .select("organization_id, user_id, status")
        .in("organization_id", orgIds)
        .eq("status", "active")
    : { data: [] as { organization_id: string }[], error: null };

  if (membersRes.error) throw new Error(membersRes.error.message);

  const profilesRes = ownerIds.length
    ? await db
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ownerIds)
    : {
        data: [] as {
          id: string;
          email: string | null;
          full_name: string | null;
        }[],
        error: null,
      };

  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const members = membersRes.data;
  const profiles = profilesRes.data;

  const memberCountByOrg = new Map<string, number>();
  for (const row of members || []) {
    memberCountByOrg.set(
      row.organization_id,
      (memberCountByOrg.get(row.organization_id) || 0) + 1
    );
  }

  const profileById = new Map(
    (profiles || []).map((p) => [p.id, p] as const)
  );

  return (orgs || []).map((org): AdminOrgRow => {
    const entitlement = planFromOrg(org);
    const owner = org.created_by ? profileById.get(org.created_by) : null;
    return {
      id: org.id,
      name: org.name,
      type: org.type,
      createdAt: org.created_at,
      trialEndsAt: org.trial_ends_at,
      subscriptionStatus: org.stripe_subscription_status,
      planLabel: entitlement.planLabel,
      entitled: entitlement.entitled,
      paid: entitlement.paid,
      complimentaryPro: entitlement.complimentaryPro,
      trialActive: entitlement.trialActive,
      memberCount: memberCountByOrg.get(org.id) || 0,
      ownerEmail: owner?.email || null,
      ownerName: owner?.full_name || null,
      ownerId: org.created_by,
      stripeCustomerId: org.stripe_customer_id,
      stripeSubscriptionId: org.stripe_subscription_id,
      currency: org.currency,
      country: org.country,
      address: org.address,
    };
  });
}

export async function loadAdminOverview(db: DbClient): Promise<AdminOverview> {
  const [{ count: users, error: usersError }, orgRows] = await Promise.all([
    db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    loadAdminOrganizations(db),
  ]);

  if (usersError) throw new Error(usersError.message);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let paid = 0;
  let trial = 0;
  let free = 0;
  let solo = 0;
  let agency = 0;
  let signupsLast7Days = 0;

  for (const org of orgRows) {
    if (org.paid) paid += 1;
    else if (org.trialActive) trial += 1;
    else free += 1;
    if (org.type === "agency") agency += 1;
    else solo += 1;
    if (new Date(org.createdAt).getTime() >= weekAgo) signupsLast7Days += 1;
  }

  return {
    users: users || 0,
    organizations: orgRows.length,
    paid,
    trial,
    free,
    solo,
    agency,
    recentOrgs: orgRows.slice(0, 8),
    signupsLast7Days,
  };
}
