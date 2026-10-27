import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import {
  actionsForClientStatus,
  actionsForLeadStatus,
  actionsForProjectStatus,
  actionsForProposalStatus,
  actionsForTaskStatus,
  type AssistantChatComponent,
  type ClientChatComponent,
  type LeadChatComponent,
  type ProjectChatComponent,
  type ProposalChatComponent,
  type TaskChatComponent,
} from "@/lib/assistant/components";

type Db = SupabaseClient<Database>;

export type CardKind =
  | "proposal"
  | "client"
  | "lead"
  | "project"
  | "task";

function formatHours(minutes: number) {
  const hours = minutes / 60;
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  return `${Math.round(hours * 10) / 10}h`;
}

export async function loadProposalCard(
  db: Db,
  organizationId: string,
  id: string
): Promise<ProposalChatComponent | null> {
  const { data: proposal } = await db
    .from("proposals")
    .select(
      "id, title, status, currency, amount, expires_at, client_id, deleted_at"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!proposal || proposal.deleted_at) return null;

  let clientLabel = "Unknown";
  if (proposal.client_id) {
    const { data: client } = await db
      .from("clients")
      .select("name, company")
      .eq("id", proposal.client_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    clientLabel = client?.company || client?.name || clientLabel;
  }

  const currency = proposal.currency || "EUR";
  return {
    type: "proposal_card",
    entityId: proposal.id,
    actions: actionsForProposalStatus(proposal.status),
    snapshot: {
      client: clientLabel,
      title: proposal.title,
      amount: formatInvoiceMoney(Number(proposal.amount) || 0, currency),
      amountRaw: Number(proposal.amount) || 0,
      currency,
      status: proposal.status,
      expiresAt: proposal.expires_at,
    },
  };
}

export async function loadClientCard(
  db: Db,
  organizationId: string,
  id: string
): Promise<ClientChatComponent | null> {
  const { data: client } = await db
    .from("clients")
    .select("id, name, company, email, phone, website, status, deleted_at")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!client || client.deleted_at) return null;
  return {
    type: "client_card",
    entityId: client.id,
    actions: actionsForClientStatus(client.status),
    snapshot: {
      name: client.name,
      company: client.company,
      email: client.email,
      phone: client.phone,
      website: client.website,
      status: client.status,
    },
  };
}

export async function loadLeadCard(
  db: Db,
  organizationId: string,
  id: string
): Promise<LeadChatComponent | null> {
  const { data: lead } = await db
    .from("leads")
    .select(
      "id, name, company, email, phone, status, notes, source, deleted_at"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!lead || lead.deleted_at) return null;
  return {
    type: "lead_card",
    entityId: lead.id,
    actions: actionsForLeadStatus(lead.status),
    snapshot: {
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      notes: lead.notes,
      followUpAt: null,
      source: lead.source,
    },
  };
}

export async function loadProjectCard(
  db: Db,
  organizationId: string,
  id: string
): Promise<ProjectChatComponent | null> {
  const { data: project } = await db
    .from("projects")
    .select(
      "id, name, status, billing_type, client_id, deleted_at"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!project || project.deleted_at) return null;

  let clientLabel = "Unknown";
  if (project.client_id) {
    const { data: client } = await db
      .from("clients")
      .select("name, company")
      .eq("id", project.client_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    clientLabel = client?.company || client?.name || clientLabel;
  }

  const [{ count: doneCount }, { count: openCount }, { data: timeRows }] =
    await Promise.all([
      db
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("project_id", project.id)
        .eq("column_id", "done")
        .is("deleted_at", null),
      db
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("project_id", project.id)
        .neq("column_id", "done")
        .is("deleted_at", null),
      db
        .from("time_entries")
        .select("duration_minutes")
        .eq("organization_id", organizationId)
        .eq("project_id", project.id)
        .is("deleted_at", null)
        .limit(500),
    ]);

  const minutes = (timeRows || []).reduce(
    (sum, row) => sum + (Number(row.duration_minutes) || 0),
    0
  );

  return {
    type: "project_card",
    entityId: project.id,
    actions: actionsForProjectStatus(project.status),
    snapshot: {
      name: project.name,
      client: clientLabel,
      status: project.status,
      billingType: project.billing_type,
      tasksDone: doneCount ?? 0,
      tasksOpen: openCount ?? 0,
      trackedHours: formatHours(minutes),
    },
  };
}

export async function loadTaskCard(
  db: Db,
  organizationId: string,
  id: string
): Promise<TaskChatComponent | null> {
  const { data: task } = await db
    .from("tasks")
    .select(
      "id, title, column_id, priority, due_date, client_id, project_id, deleted_at"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!task || task.deleted_at) return null;

  let clientLabel: string | null = null;
  let projectName: string | null = null;
  if (task.client_id) {
    const { data: client } = await db
      .from("clients")
      .select("name, company")
      .eq("id", task.client_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    clientLabel = client?.company || client?.name || null;
  }
  if (task.project_id) {
    const { data: project } = await db
      .from("projects")
      .select("name")
      .eq("id", task.project_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    projectName = project?.name || null;
  }

  return {
    type: "task_card",
    entityId: task.id,
    actions: actionsForTaskStatus(task.column_id),
    snapshot: {
      title: task.title,
      project: projectName,
      client: clientLabel,
      dueDate: task.due_date,
      status: task.column_id,
      priority: task.priority,
    },
  };
}

export async function loadEntityCard(
  db: Db,
  organizationId: string,
  kind: CardKind,
  id: string
): Promise<AssistantChatComponent | null> {
  switch (kind) {
    case "proposal":
      return loadProposalCard(db, organizationId, id);
    case "client":
      return loadClientCard(db, organizationId, id);
    case "lead":
      return loadLeadCard(db, organizationId, id);
    case "project":
      return loadProjectCard(db, organizationId, id);
    case "task":
      return loadTaskCard(db, organizationId, id);
    default:
      return null;
  }
}
