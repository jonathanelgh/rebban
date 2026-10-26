import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import {
  generateAssistantReply,
  isAssistantAiConfigured,
} from "@/lib/assistant/chat";
import {
  appendInAppMessage,
  getOrCreateInAppConversation,
  listInAppMessages,
  readPendingAction,
  trimInAppMessages,
  writePendingAction,
} from "@/lib/assistant/in-app";
import { messageMetadataToJson } from "@/lib/assistant/components";
import type { AssistantPendingAction } from "@/lib/assistant/tools";
import {
  appendTicketMessage,
  formatTicketRef,
  getTicketForUser,
} from "@/lib/support/tickets";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAssistantAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "Assistant is not configured yet. Email jonathan@rebban.com and we’ll help.",
      },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    messages?: ChatMessage[];
    conversationId?: string | null;
  } | null;

  const messages = Array.isArray(body?.messages) ? body!.messages : [];
  const cleaned = messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-20);

  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Send a user message to continue." },
      { status: 400 }
    );
  }

  const lastUser = cleaned[cleaned.length - 1].content.trim();
  if (lastUser.length > 4000) {
    return NextResponse.json(
      { error: "Message is too long (max 4000 characters)." },
      { status: 400 }
    );
  }

  const organizationId = await getActiveOrganizationId(supabase, user.id);
  if (!organizationId) {
    return NextResponse.json(
      { error: "No active workspace found for this user." },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const requesterName =
    profile?.full_name || user.email?.split("@")[0] || null;

  let conversation;
  try {
    conversation = await getOrCreateInAppConversation({
      db: supabase,
      userId: user.id,
      organizationId,
      conversationId: body?.conversationId || null,
      firstMessage: lastUser,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not open conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    await appendInAppMessage({
      db: supabase,
      conversationId: conversation.id,
      role: "user",
      content: lastUser,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save message.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // If this chat was previously escalated, mirror to the ticket and skip AI.
  const linkedTicket = conversation.support_ticket_id
    ? await getTicketForUser(supabase, conversation.support_ticket_id, user.id)
    : null;

  if (linkedTicket?.assigned_agent === "human") {
    try {
      await appendTicketMessage({
        db: supabase,
        ticketId: linkedTicket.id,
        agent: "user",
        body: lastUser,
        authorUserId: user.id,
      });
    } catch {
      // conversation message already saved
    }
    return NextResponse.json({
      reply:
        "Got it — your message is saved. A human agent will follow up by email.",
      toolsUsed: [],
      conversationId: conversation.id,
      ticketId: linkedTicket.id,
      ticketRef: formatTicketRef(linkedTicket.ticket_number),
      ticket: {
        id: linkedTicket.id,
        ticketNumber: linkedTicket.ticket_number,
        ticketRef: formatTicketRef(linkedTicket.ticket_number),
        status: linkedTicket.status,
        assignedAgent: linkedTicket.assigned_agent,
        slaDueAt: linkedTicket.sla_due_at,
        subject: linkedTicket.subject,
      },
      messageId: null,
      escalated: true,
    });
  }

  let modelMessages = cleaned;
  try {
    const stored = await listInAppMessages(supabase, conversation.id);
    const mapped = stored
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    if (mapped.length) modelMessages = mapped.slice(-20);
  } catch {
    // fall back to client messages
  }

  let pendingAction = readPendingAction(conversation);
  const setPendingAction = async (action: AssistantPendingAction | null) => {
    pendingAction = action;
    await writePendingAction(supabase, conversation.id, action);
  };

  try {
    // Same engine as WhatsApp — no support ticket unless already escalated above.
    const result = await generateAssistantReply({
      messages: modelMessages,
      userName: requesterName,
      toolContext: {
        db: supabase,
        userId: user.id,
        organizationId,
        conversationId: conversation.id,
        pendingAction,
        setPendingAction,
        channel: "in_app",
      },
    });

    const components = result.components || [];
    const aiMessage = await appendInAppMessage({
      db: supabase,
      conversationId: conversation.id,
      role: "assistant",
      content: result.reply,
      metadata: messageMetadataToJson(components) as unknown as Json,
    });

    await trimInAppMessages(supabase, conversation.id);

    return NextResponse.json({
      reply: result.reply,
      toolsUsed: result.toolsUsed,
      components,
      conversationId: conversation.id,
      messageId: aiMessage.id,
      escalated: false,
      ticketId: null,
      ticketRef: null,
      ticket: null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Assistant failed.";
    console.error("[assistant] in-app chat failed", {
      userId: user.id,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
