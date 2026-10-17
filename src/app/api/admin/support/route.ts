import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { formatTicketRef } from "@/lib/support/tickets";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const agent = url.searchParams.get("agent");
  const q = url.searchParams.get("q")?.trim() || "";

  let query = auth.db
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, status, priority, assigned_agent, requester_email, requester_name, organization_id, escalation_reason, escalated_at, sla_due_at, first_human_reply_at, last_message_at, last_message_preview, message_count, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (status && status !== "all") {
    query = query.eq(
      "status",
      status as
        | "open"
        | "awaiting_human"
        | "awaiting_user"
        | "resolved"
        | "closed"
    );
  }
  if (agent === "ai" || agent === "human") {
    query = query.eq("assigned_agent", agent);
  }
  if (q) {
    query = query.or(
      `subject.ilike.%${q}%,requester_email.ilike.%${q}%,requester_name.ilike.%${q}%,escalation_reason.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orgIds = Array.from(
    new Set((data || []).map((t) => t.organization_id).filter(Boolean))
  );
  const orgNames = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await auth.db
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    for (const org of orgs || []) orgNames.set(org.id, org.name);
  }

  const now = Date.now();
  const tickets = (data || []).map((t) => {
    const slaDue = t.sla_due_at ? new Date(t.sla_due_at).getTime() : null;
    const slaBreached =
      t.status === "awaiting_human" &&
      !t.first_human_reply_at &&
      slaDue != null &&
      slaDue < now;

    return {
      id: t.id,
      ticketNumber: t.ticket_number,
      ticketRef: formatTicketRef(t.ticket_number),
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      assignedAgent: t.assigned_agent,
      requesterEmail: t.requester_email,
      requesterName: t.requester_name,
      organizationId: t.organization_id,
      organizationName: orgNames.get(t.organization_id) || null,
      escalationReason: t.escalation_reason,
      escalatedAt: t.escalated_at,
      slaDueAt: t.sla_due_at,
      firstHumanReplyAt: t.first_human_reply_at,
      slaBreached,
      lastMessageAt: t.last_message_at,
      lastMessagePreview: t.last_message_preview,
      messageCount: t.message_count,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  });

  const counts = {
    awaitingHuman: tickets.filter((t) => t.status === "awaiting_human").length,
    open: tickets.filter((t) => t.status === "open").length,
    awaitingUser: tickets.filter((t) => t.status === "awaiting_user").length,
    breached: tickets.filter((t) => t.slaBreached).length,
  };

  return NextResponse.json({ tickets, counts });
}
