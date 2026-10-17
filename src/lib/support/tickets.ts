import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Enums } from "@/types/database";

type Db = SupabaseClient<Database>;

export type SupportAgent = Enums<"support_agent">;
export type SupportTicketStatus = Enums<"support_ticket_status">;
export type SupportTicketPriority = Enums<"support_ticket_priority">;

export type SupportTicketRow = Database["public"]["Tables"]["support_tickets"]["Row"];
export type SupportMessageRow = Database["public"]["Tables"]["support_messages"]["Row"];

export function formatTicketRef(ticketNumber: number) {
  return `RB-${ticketNumber}`;
}

function previewText(body: string, max = 140) {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function subjectFromMessage(body: string) {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Support chat";
  if (cleaned.length <= 72) return cleaned;
  return `${cleaned.slice(0, 71)}…`;
}

export async function getTicketForUser(
  db: Db,
  ticketId: string,
  userId: string
) {
  const { data, error } = await db
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listUserTickets(db: Db, userId: string, limit = 20) {
  const { data, error } = await db
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, status, priority, assigned_agent, last_message_at, last_message_preview, message_count, escalated_at, sla_due_at, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getOrCreateOpenTicket(options: {
  db: Db;
  userId: string;
  organizationId: string;
  requesterEmail?: string | null;
  requesterName?: string | null;
  firstMessage?: string | null;
  ticketId?: string | null;
}) {
  const { db, userId, organizationId } = options;

  if (options.ticketId) {
    const existing = await getTicketForUser(db, options.ticketId, userId);
    if (existing && existing.status !== "closed") {
      return existing;
    }
  }

  const { data: active } = await db
    .from("support_tickets")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["open", "awaiting_human", "awaiting_user"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active) return active;

  const subject = subjectFromMessage(options.firstMessage || "Support chat");
  const { data: created, error } = await db
    .from("support_tickets")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      subject,
      status: "open",
      assigned_agent: "ai",
      requester_email: options.requesterEmail || null,
      requester_name: options.requesterName || null,
      channel: "in_app_chat",
    })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(error?.message || "Could not create support ticket.");
  }

  await db.from("support_ticket_events").insert({
    ticket_id: created.id,
    event_type: "created",
    agent: "system",
    actor_user_id: userId,
    payload: { channel: "in_app_chat" },
  });

  return created;
}

export async function appendTicketMessage(options: {
  db: Db;
  ticketId: string;
  agent: SupportAgent;
  body: string;
  authorUserId?: string | null;
  isInternal?: boolean;
  metadata?: Record<string, unknown>;
  emailSentAt?: string | null;
}) {
  const body = options.body.trim();
  if (!body) throw new Error("Message body is required.");

  const { data: message, error } = await options.db
    .from("support_messages")
    .insert({
      ticket_id: options.ticketId,
      agent: options.agent,
      author_user_id: options.authorUserId || null,
      body,
      is_internal: options.isInternal || false,
      email_sent_at: options.emailSentAt || null,
      metadata: (options.metadata || {}) as Database["public"]["Tables"]["support_messages"]["Insert"]["metadata"],
    })
    .select("*")
    .single();

  if (error || !message) {
    throw new Error(error?.message || "Could not save support message.");
  }

  if (!options.isInternal) {
    const now = new Date().toISOString();
    const { data: ticket } = await options.db
      .from("support_tickets")
      .select("message_count, status, assigned_agent, subject")
      .eq("id", options.ticketId)
      .maybeSingle();

    const updates: Database["public"]["Tables"]["support_tickets"]["Update"] = {
      last_message_at: now,
      last_message_preview: previewText(body),
      message_count: (ticket?.message_count || 0) + 1,
    };

    if (
      options.agent === "user" &&
      (!ticket?.subject ||
        ticket.subject === "Support chat" ||
        ticket.subject === "New conversation")
    ) {
      updates.subject = subjectFromMessage(body);
    }

    if (options.agent === "user" && ticket?.status === "awaiting_user") {
      updates.status =
        ticket.assigned_agent === "human" ? "awaiting_human" : "open";
    }
    if (options.agent === "human") {
      updates.status = "awaiting_user";
      updates.assigned_agent = "human";
    }
    if (options.agent === "ai" && ticket?.status === "open") {
      updates.assigned_agent = "ai";
    }

    await options.db
      .from("support_tickets")
      .update(updates)
      .eq("id", options.ticketId);
  }

  return message;
}

export async function listTicketMessages(
  db: Db,
  ticketId: string,
  options?: { includeInternal?: boolean }
) {
  let query = db
    .from("support_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (!options?.includeInternal) {
    query = query.eq("is_internal", false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function escalateTicket(options: {
  db: Db;
  ticketId: string;
  reason: string;
  priority?: SupportTicketPriority;
  actorUserId?: string | null;
}) {
  const reason = options.reason.trim().slice(0, 2000);
  if (!reason) throw new Error("Escalation reason is required.");

  const { data: existing } = await options.db
    .from("support_tickets")
    .select("*")
    .eq("id", options.ticketId)
    .maybeSingle();

  if (
    existing?.status === "awaiting_human" &&
    existing.assigned_agent === "human" &&
    existing.escalated_at
  ) {
    return { ticket: existing, newlyEscalated: false };
  }

  const now = new Date();
  const slaDue = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: ticket, error } = await options.db
    .from("support_tickets")
    .update({
      status: "awaiting_human",
      assigned_agent: "human",
      escalation_reason: reason,
      escalated_at: now.toISOString(),
      sla_due_at: slaDue.toISOString(),
      priority: options.priority || "high",
    })
    .eq("id", options.ticketId)
    .select("*")
    .single();

  if (error || !ticket) {
    throw new Error(error?.message || "Could not escalate ticket.");
  }

  await options.db.from("support_ticket_events").insert({
    ticket_id: options.ticketId,
    event_type: "escalated",
    agent: "ai",
    actor_user_id: options.actorUserId || null,
    payload: {
      reason,
      sla_due_at: slaDue.toISOString(),
      priority: ticket.priority,
    },
  });

  await appendTicketMessage({
    db: options.db,
    ticketId: options.ticketId,
    agent: "system",
    body: `Escalated to a human agent. We'll email you within 24 hours. Ticket ${formatTicketRef(ticket.ticket_number)}.`,
    metadata: { kind: "escalation_notice" },
  });

  return { ticket, newlyEscalated: true };
}

export async function resolveTicket(options: {
  db: Db;
  ticketId: string;
  actorUserId?: string | null;
  agent?: SupportAgent;
}) {
  const now = new Date().toISOString();
  const { data: ticket, error } = await options.db
    .from("support_tickets")
    .update({
      status: "resolved",
      resolved_at: now,
    })
    .eq("id", options.ticketId)
    .select("*")
    .single();

  if (error || !ticket) {
    throw new Error(error?.message || "Could not resolve ticket.");
  }

  await options.db.from("support_ticket_events").insert({
    ticket_id: options.ticketId,
    event_type: "resolved",
    agent: options.agent || "human",
    actor_user_id: options.actorUserId || null,
    payload: {},
  });

  return ticket;
}
