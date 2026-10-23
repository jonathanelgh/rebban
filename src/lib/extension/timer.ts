import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  DEFAULT_HOURLY_RATE,
  clientDisplayName,
} from "@/lib/time-entries";

type Db = SupabaseClient<Database>;

export async function resolveTimerWorkspace(db: Db, userId: string) {
  const { data: profile } = await db
    .from("profiles")
    .select("full_name, email, active_organization_id")
    .eq("id", userId)
    .maybeSingle();

  let organizationId = profile?.active_organization_id ?? null;
  if (!organizationId) {
    const { data: membership } = await db
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    organizationId = membership?.organization_id ?? null;
  }

  return {
    organizationId,
    fullName: profile?.full_name ?? null,
    email: profile?.email ?? null,
  };
}

export async function loadTimerState(db: Db, userId: string, organizationId: string) {
  const [clientsRes, projectsRes, orgRes, runningRes] = await Promise.all([
    db
      .from("clients")
      .select("id, name, company")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("name"),
    db
      .from("projects")
      .select("id, name, client_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("name"),
    db
      .from("organizations")
      .select("default_hourly_rate")
      .eq("id", organizationId)
      .maybeSingle(),
    db
      .from("time_entries")
      .select(
        "id, description, started_at, client_id, project_id, clients(id, name, company), projects(id, name, client_id)"
      )
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .is("ended_at", null)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rate = Number(orgRes.data?.default_hourly_rate);
  const defaultHourlyRate =
    Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_HOURLY_RATE;

  const runningRow = runningRes.data;
  const clientRel = runningRow?.clients as
    | { id: string; name: string; company: string | null }
    | { id: string; name: string; company: string | null }[]
    | null
    | undefined;
  const projectRel = runningRow?.projects as
    | { id: string; name: string; client_id: string }
    | { id: string; name: string; client_id: string }[]
    | null
    | undefined;
  const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
  const project = Array.isArray(projectRel) ? projectRel[0] : projectRel;

  return {
    defaultHourlyRate,
    clients: (clientsRes.data ?? []).map((c) => ({
      id: c.id,
      name: clientDisplayName(c),
    })),
    projects: (projectsRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.client_id,
    })),
    running: runningRow
      ? {
          id: runningRow.id,
          startedAt: runningRow.started_at,
          description: runningRow.description,
          clientId: runningRow.client_id,
          projectId: runningRow.project_id,
          clientName: client ? clientDisplayName(client) : null,
          projectName: project?.name ?? null,
        }
      : null,
  };
}

export async function startTimerEntry(
  db: Db,
  options: {
    userId: string;
    organizationId: string;
    clientId: string | null;
    projectId: string | null;
    description: string | null;
    defaultHourlyRate: number;
  }
) {
  const nowIso = new Date().toISOString();
  const { data: openRows } = await db
    .from("time_entries")
    .select("id")
    .eq("organization_id", options.organizationId)
    .eq("user_id", options.userId)
    .is("ended_at", null)
    .is("deleted_at", null);

  for (const row of openRows ?? []) {
    await db.from("time_entries").update({ ended_at: nowIso }).eq("id", row.id);
  }

  const { data, error } = await db
    .from("time_entries")
    .insert({
      organization_id: options.organizationId,
      user_id: options.userId,
      client_id: options.clientId,
      project_id: options.projectId,
      description: options.description,
      started_at: nowIso,
      ended_at: null,
      billable: true,
      hourly_rate: options.defaultHourlyRate,
    })
    .select("id, started_at, description, client_id, project_id")
    .single();

  return { data, error };
}

export async function stopTimerEntry(
  db: Db,
  options: {
    userId: string;
    organizationId: string;
    description: string | null;
  }
) {
  const { data: running } = await db
    .from("time_entries")
    .select("id")
    .eq("organization_id", options.organizationId)
    .eq("user_id", options.userId)
    .is("ended_at", null)
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!running) {
    return { error: "No active timer to stop." as const, data: null };
  }

  const { error } = await db
    .from("time_entries")
    .update({
      ended_at: new Date().toISOString(),
      description: options.description,
    })
    .eq("id", running.id)
    .eq("organization_id", options.organizationId)
    .eq("user_id", options.userId);

  return { error: error?.message ?? null, data: { id: running.id } };
}
