import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  formatTicketRef,
  getTicketForUser,
  listTicketMessages,
} from "@/lib/support/tickets";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ticket = await getTicketForUser(supabase, id, user.id);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const messages = await listTicketMessages(supabase, ticket.id);

    return NextResponse.json({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        ticketRef: formatTicketRef(ticket.ticket_number),
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        assignedAgent: ticket.assigned_agent,
        escalatedAt: ticket.escalated_at,
        slaDueAt: ticket.sla_due_at,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
      },
      messages: messages.map((m) => ({
        id: m.id,
        agent: m.agent,
        body: m.body,
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load ticket.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
