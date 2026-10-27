import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import type { AttentionItem } from "@/lib/assistant/needs-attention-format";
export type {
  AttentionItem,
  AttentionKind,
} from "@/lib/assistant/needs-attention-format";
export { formatAttentionDigest } from "@/lib/assistant/needs-attention-format";

type Db = SupabaseClient<Database>;

const STALE_PROPOSAL_DAYS = 5;
const UNPAID_SENT_DAYS = 7;
const PROJECT_DEADLINE_DAYS = 7;

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysFromNowIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, to = new Date()) {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  return Math.max(
    0,
    Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  );
}

/**
 * Deterministic workspace health scan for the assistant (chat tool + digest cron).
 */
export async function collectNeedsAttention(
  db: Db,
  organizationId: string,
  options?: { limit?: number }
): Promise<AttentionItem[]> {
  const limit = Math.min(25, Math.max(1, options?.limit || 12));
  const items: AttentionItem[] = [];

  const staleBefore = daysAgoIso(STALE_PROPOSAL_DAYS);
  const unpaidBefore = daysAgoIso(UNPAID_SENT_DAYS);
  const deadlineUntil = daysFromNowIso(PROJECT_DEADLINE_DAYS);
  const today = new Date().toISOString().slice(0, 10);

  const [proposalsRes, overdueRes, unpaidRes, projectsRes] = await Promise.all([
    db
      .from("proposals")
      .select(
        "id, title, status, sent_at, updated_at, amount, currency, client_id, clients(name, company)"
      )
      .eq("organization_id", organizationId)
      .in("status", ["sent", "viewed"])
      .is("deleted_at", null)
      .lt("sent_at", staleBefore)
      .order("sent_at", { ascending: true })
      .limit(10),
    db
      .from("invoices")
      .select(
        "id, number, status, total, currency, due_date, client_id, clients(name, company)"
      )
      .eq("organization_id", organizationId)
      .eq("status", "overdue")
      .is("deleted_at", null)
      .order("due_date", { ascending: true })
      .limit(10),
    db
      .from("invoices")
      .select(
        "id, number, status, total, currency, sent_at, due_date, client_id, clients(name, company)"
      )
      .eq("organization_id", organizationId)
      .in("status", ["sent", "viewed"])
      .is("deleted_at", null)
      .lt("sent_at", unpaidBefore)
      .order("sent_at", { ascending: true })
      .limit(10),
    db
      .from("projects")
      .select(
        "id, name, status, end_date, client_id, clients(name, company)"
      )
      .eq("organization_id", organizationId)
      .in("status", ["active", "on_hold"])
      .is("deleted_at", null)
      .not("end_date", "is", null)
      .gte("end_date", today)
      .lte("end_date", deadlineUntil)
      .order("end_date", { ascending: true })
      .limit(10),
  ]);

  const clientLabel = (row: {
    clients?: { name: string; company: string | null } | null;
  }) => {
    const c = row.clients;
    if (!c) return null;
    return c.company?.trim() || c.name;
  };

  for (const p of proposalsRes.data || []) {
    const sentAt = p.sent_at || p.updated_at;
    const age = daysBetween(sentAt);
    items.push({
      id: `stale_proposal:${p.id}`,
      kind: "stale_proposal",
      priority: 40 + Math.min(age, 30),
      title: p.title || "Proposal",
      detail: `No reply in ${age} days (${p.status}).`,
      suggested_action: "Draft a follow-up or check proposal status.",
      entity_type: "proposal",
      entity_id: p.id,
      client: clientLabel(p as never),
    });
  }

  for (const inv of overdueRes.data || []) {
    items.push({
      id: `overdue_invoice:${inv.id}`,
      kind: "overdue_invoice",
      priority: 90,
      title: inv.number || "Invoice",
      detail: `Overdue · ${formatInvoiceMoney(Number(inv.total) || 0, inv.currency || "EUR")}${inv.due_date ? ` · due ${inv.due_date}` : ""}`,
      suggested_action: "Send a payment reminder or mark paid if settled.",
      entity_type: "invoice",
      entity_id: inv.id,
      client: clientLabel(inv as never),
    });
  }

  for (const inv of unpaidRes.data || []) {
    if (items.some((i) => i.entity_id === inv.id && i.kind === "overdue_invoice")) {
      continue;
    }
    const age = inv.sent_at ? daysBetween(inv.sent_at) : UNPAID_SENT_DAYS;
    items.push({
      id: `unpaid_invoice:${inv.id}`,
      kind: "unpaid_invoice",
      priority: 60 + Math.min(age, 20),
      title: inv.number || "Invoice",
      detail: `Unpaid for ${age} days · ${formatInvoiceMoney(Number(inv.total) || 0, inv.currency || "EUR")}`,
      suggested_action: "Nudge the client or confirm payment status.",
      entity_type: "invoice",
      entity_id: inv.id,
      client: clientLabel(inv as never),
    });
  }

  for (const project of projectsRes.data || []) {
    items.push({
      id: `project_deadline:${project.id}`,
      kind: "project_deadline",
      priority: 55,
      title: project.name,
      detail: `Deadline ${project.end_date}.`,
      suggested_action: "Review tasks or message the client about timeline.",
      entity_type: "project",
      entity_id: project.id,
      client: clientLabel(project as never),
    });
  }

  const { data: unbilledRows } = await db
    .from("time_entries")
    .select(
      "id, duration_minutes, client_id, clients(name, company)"
    )
    .eq("organization_id", organizationId)
    .eq("billable", true)
    .is("deleted_at", null)
    .is("invoice_id", null)
    .not("ended_at", "is", null)
    .gt("duration_minutes", 0)
    .limit(300);

  const unbilledByClient = new Map<
    string,
    { label: string; minutes: number }
  >();
  for (const row of unbilledRows || []) {
    if (!row.client_id) continue;
    const clients = row.clients as
      | { name: string; company: string | null }
      | null
      | undefined;
    const label =
      clients?.company?.trim() || clients?.name || "Client";
    const prev = unbilledByClient.get(row.client_id) || {
      label,
      minutes: 0,
    };
    prev.minutes += Number(row.duration_minutes) || 0;
    unbilledByClient.set(row.client_id, prev);
  }

  for (const [clientId, row] of Array.from(unbilledByClient.entries())
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 5)) {
    if (row.minutes < 30) continue;
    const hours = Math.round((row.minutes / 60) * 10) / 10;
    items.push({
      id: `unbilled_hours:${clientId}`,
      kind: "unbilled_hours",
      priority: 50 + Math.min(hours, 20),
      title: row.label,
      detail: `${hours}h unbilled ready to invoice.`,
      suggested_action: "Create an invoice draft from unbilled hours.",
      entity_type: "client",
      entity_id: clientId,
      client: row.label,
    });
  }

  items.sort((a, b) => b.priority - a.priority);
  return items.slice(0, limit);
}
