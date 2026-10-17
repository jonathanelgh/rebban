import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import {
  formatTicketRef,
  getOrCreateOpenTicket,
  listUserTickets,
} from "@/lib/support/tickets";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tickets = await listUserTickets(supabase, user.id);
    return NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticket_number,
        ticketRef: formatTicketRef(t.ticket_number),
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        assignedAgent: t.assigned_agent,
        lastMessageAt: t.last_message_at,
        lastMessagePreview: t.last_message_preview,
        messageCount: t.message_count,
        escalatedAt: t.escalated_at,
        slaDueAt: t.sla_due_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load tickets.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    forceNew?: boolean;
  } | null;

  const organizationId = await getActiveOrganizationId(supabase, user.id);
  if (!organizationId) {
    return NextResponse.json(
      { error: "No active workspace found." },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (body?.forceNew) {
    // Close previous open tickets so a fresh chat starts
    await supabase
      .from("support_tickets")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .in("status", ["open", "awaiting_human", "awaiting_user", "resolved"]);
  }

  try {
    const ticket = await getOrCreateOpenTicket({
      db: supabase,
      userId: user.id,
      organizationId,
      requesterEmail: user.email,
      requesterName: profile?.full_name || user.email?.split("@")[0] || null,
      firstMessage: "New conversation",
    });

    return NextResponse.json({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        ticketRef: formatTicketRef(ticket.ticket_number),
        subject: ticket.subject,
        status: ticket.status,
        assignedAgent: ticket.assigned_agent,
        slaDueAt: ticket.sla_due_at,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create ticket.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
