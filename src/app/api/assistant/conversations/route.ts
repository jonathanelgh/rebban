import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import {
  getOrCreateInAppConversation,
  getPrimaryInAppConversation,
  listInAppMessages,
} from "@/lib/assistant/in-app";
import { parseMessageComponents } from "@/lib/assistant/components";
import { formatTicketRef, getTicketForUser } from "@/lib/support/tickets";

export const runtime = "nodejs";

async function serializePrimary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  conversation: {
    id: string;
    title: string | null;
    pending_action: unknown;
    support_ticket_id: string | null;
    updated_at: string;
    created_at: string;
  } | null
) {
  if (!conversation) {
    return {
      conversation: null,
      ticket: null,
      messages: [] as {
        id: string;
        role: string;
        agent: string;
        body: string;
        components: ReturnType<typeof parseMessageComponents>;
        createdAt: string;
      }[],
    };
  }

  const messages = await listInAppMessages(supabase, conversation.id);

  let ticket = null;
  if (conversation.support_ticket_id) {
    const t = await getTicketForUser(
      supabase,
      conversation.support_ticket_id,
      userId
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

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title || "Rebban",
      updatedAt: conversation.updated_at,
      createdAt: conversation.created_at,
    },
    ticket,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      agent: m.role === "user" ? "user" : "ai",
      body: m.content,
      components: parseMessageComponents(m.metadata),
      createdAt: m.created_at,
    })),
  };
}

/** Load the user's single primary in-app thread (+ scrollback). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const primary = await getPrimaryInAppConversation(supabase, user.id);
    return NextResponse.json(await serializePrimary(supabase, user.id, primary));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Idempotent: return (or create) the primary in-app thread. */
export async function POST() {
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

  try {
    const conversation = await getOrCreateInAppConversation({
      db: supabase,
      userId: user.id,
      organizationId,
    });
    return NextResponse.json(
      await serializePrimary(supabase, user.id, conversation)
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not open chat.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
