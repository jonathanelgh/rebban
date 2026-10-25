import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import {
  createInAppConversation,
  listInAppConversations,
} from "@/lib/assistant/in-app";
import { formatTicketRef, getTicketForUser } from "@/lib/support/tickets";

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
    const conversations = await listInAppConversations(supabase, user.id);
    const withTickets = await Promise.all(
      conversations.map(async (c) => {
        let ticket = null;
        if (c.support_ticket_id) {
          const t = await getTicketForUser(
            supabase,
            c.support_ticket_id,
            user.id
          );
          if (t) {
            ticket = {
              id: t.id,
              ticketRef: formatTicketRef(t.ticket_number),
              status: t.status,
              assignedAgent: t.assigned_agent,
            };
          }
        }
        return {
          id: c.id,
          title: c.title || "Chat",
          updatedAt: c.updated_at,
          createdAt: c.created_at,
          ticket,
        };
      })
    );
    return NextResponse.json({ conversations: withTickets });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load conversations.";
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

  const organizationId = await getActiveOrganizationId(supabase, user.id);
  if (!organizationId) {
    return NextResponse.json(
      { error: "No active workspace found." },
      { status: 400 }
    );
  }

  void request;

  try {
    const conversation = await createInAppConversation({
      db: supabase,
      userId: user.id,
      organizationId,
      title: "New chat",
    });
    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title || "New chat",
        updatedAt: conversation.updated_at,
        createdAt: conversation.created_at,
        ticket: null,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not start chat.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
