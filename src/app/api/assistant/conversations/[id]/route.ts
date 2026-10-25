import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getInAppConversationForUser,
  listInAppMessages,
} from "@/lib/assistant/in-app";
import { formatTicketRef, getTicketForUser } from "@/lib/support/tickets";

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
    const conversation = await getInAppConversationForUser(
      supabase,
      id,
      user.id
    );
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const messages = await listInAppMessages(supabase, conversation.id);

    let ticket = null;
    if (conversation.support_ticket_id) {
      const t = await getTicketForUser(
        supabase,
        conversation.support_ticket_id,
        user.id
      );
      if (t) {
        ticket = {
          id: t.id,
          ticketNumber: t.ticket_number,
          ticketRef: formatTicketRef(t.ticket_number),
          status: t.status,
          assignedAgent: t.assigned_agent,
          slaDueAt: t.sla_due_at,
          subject: t.subject,
        };
      }
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title || "Chat",
        updatedAt: conversation.updated_at,
        createdAt: conversation.created_at,
      },
      ticket,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        agent: m.role === "user" ? "user" : "ai",
        body: m.content,
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
