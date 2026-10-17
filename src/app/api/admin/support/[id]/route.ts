import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { sendSupportHumanReplyEmail } from "@/lib/support/email";
import {
  appendTicketMessage,
  formatTicketRef,
  listTicketMessages,
  resolveTicket,
} from "@/lib/support/tickets";
import type { Database, Json } from "@/types/database";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const { data: ticket, error } = await auth.db
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const [{ data: org }, { data: events }, messages] = await Promise.all([
    auth.db
      .from("organizations")
      .select("id, name")
      .eq("id", ticket.organization_id)
      .maybeSingle(),
    auth.db
      .from("support_ticket_events")
      .select("*")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true }),
    listTicketMessages(auth.db, ticket.id, { includeInternal: true }),
  ]);

  return NextResponse.json({
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticket_number,
      ticketRef: formatTicketRef(ticket.ticket_number),
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      assignedAgent: ticket.assigned_agent,
      channel: ticket.channel,
      requesterEmail: ticket.requester_email,
      requesterName: ticket.requester_name,
      userId: ticket.user_id,
      organizationId: ticket.organization_id,
      organizationName: org?.name || null,
      escalationReason: ticket.escalation_reason,
      escalatedAt: ticket.escalated_at,
      slaDueAt: ticket.sla_due_at,
      firstHumanReplyAt: ticket.first_human_reply_at,
      resolvedAt: ticket.resolved_at,
      closedAt: ticket.closed_at,
      tags: ticket.tags,
      messageCount: ticket.message_count,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    },
    messages: messages.map((m) => ({
      id: m.id,
      agent: m.agent,
      authorUserId: m.author_user_id,
      body: m.body,
      isInternal: m.is_internal,
      emailSentAt: m.email_sent_at,
      createdAt: m.created_at,
    })),
    events: (events || []).map((e) => ({
      id: e.id,
      eventType: e.event_type,
      agent: e.agent,
      actorUserId: e.actor_user_id,
      payload: e.payload,
      createdAt: e.created_at,
    })),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    status?: string;
    priority?: string;
    resolve?: boolean;
  } | null;

  if (body?.resolve) {
    try {
      const ticket = await resolveTicket({
        db: auth.db,
        ticketId: id,
        actorUserId: auth.user.id,
        agent: "human",
      });
      return NextResponse.json({
        ticket: {
          id: ticket.id,
          status: ticket.status,
          ticketRef: formatTicketRef(ticket.ticket_number),
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not resolve ticket.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const updates: Database["public"]["Tables"]["support_tickets"]["Update"] = {};
  if (
    body?.status &&
    ["open", "awaiting_human", "awaiting_user", "resolved", "closed"].includes(
      body.status
    )
  ) {
    updates.status = body.status as Database["public"]["Enums"]["support_ticket_status"];
    if (body.status === "resolved") updates.resolved_at = new Date().toISOString();
    if (body.status === "closed") updates.closed_at = new Date().toISOString();
  }
  if (
    body?.priority &&
    ["low", "normal", "high", "urgent"].includes(body.priority)
  ) {
    updates.priority =
      body.priority as Database["public"]["Enums"]["support_ticket_priority"];
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await auth.db
    .from("support_tickets")
    .update(updates)
    .eq("id", id)
    .select("id, ticket_number, status, priority")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Update failed." },
      { status: 500 }
    );
  }

  await auth.db.from("support_ticket_events").insert({
    ticket_id: id,
    event_type: "updated",
    agent: "human",
    actor_user_id: auth.user.id,
    payload: updates as Json,
  });

  return NextResponse.json({
    ticket: {
      id: data.id,
      ticketRef: formatTicketRef(data.ticket_number),
      status: data.status,
      priority: data.priority,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    body?: string;
    isInternal?: boolean;
    sendEmail?: boolean;
  } | null;

  const text = body?.body?.trim() || "";
  if (!text) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (text.length > 8000) {
    return NextResponse.json({ error: "Message too long." }, { status: 400 });
  }

  const { data: ticket, error: ticketError } = await auth.db
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (ticketError) {
    return NextResponse.json({ error: ticketError.message }, { status: 500 });
  }
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const isInternal = Boolean(body?.isInternal);
  let emailSentAt: string | null = null;

  if (!isInternal && body?.sendEmail !== false && ticket.requester_email) {
    try {
      await sendSupportHumanReplyEmail({
        ticketNumber: ticket.ticket_number,
        ticketId: ticket.id,
        subject: ticket.subject,
        replyBody: text,
        requesterEmail: ticket.requester_email,
        requesterName: ticket.requester_name,
      });
      emailSentAt = new Date().toISOString();
    } catch (err) {
      console.error("[support] human reply email failed", err);
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Could not send email to requester.",
        },
        { status: 500 }
      );
    }
  }

  try {
    const message = await appendTicketMessage({
      db: auth.db,
      ticketId: ticket.id,
      agent: "human",
      body: text,
      authorUserId: auth.user.id,
      isInternal,
      emailSentAt,
    });

    if (!isInternal && !ticket.first_human_reply_at) {
      await auth.db
        .from("support_tickets")
        .update({ first_human_reply_at: new Date().toISOString() })
        .eq("id", ticket.id);
    }

    await auth.db.from("support_ticket_events").insert({
      ticket_id: ticket.id,
      event_type: isInternal ? "internal_note" : "human_reply",
      agent: "human",
      actor_user_id: auth.user.id,
      payload: { messageId: message.id, emailSent: Boolean(emailSentAt) },
    });

    return NextResponse.json({
      message: {
        id: message.id,
        agent: message.agent,
        body: message.body,
        isInternal: message.is_internal,
        emailSentAt: message.email_sent_at,
        createdAt: message.created_at,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save reply.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
