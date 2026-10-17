import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import {
  generateSupportReply,
  isSupportAiConfigured,
  type SupportChatMessage,
} from "@/lib/support/chat";
import { resolveSupportToolContext } from "@/lib/support/tools";
import {
  appendTicketMessage,
  formatTicketRef,
  getOrCreateOpenTicket,
  listTicketMessages,
} from "@/lib/support/tickets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupportAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "Support AI is not configured yet. Email jonathan@rebban.com and we’ll help.",
      },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    messages?: SupportChatMessage[];
    ticketId?: string | null;
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

  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  const requesterName =
    profile?.full_name || user.email?.split("@")[0] || null;

  let ticket;
  try {
    ticket = await getOrCreateOpenTicket({
      db: supabase,
      userId: user.id,
      organizationId,
      requesterEmail: user.email,
      requesterName,
      firstMessage: lastUser,
      ticketId: body?.ticketId || null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not open support ticket.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    await appendTicketMessage({
      db: supabase,
      ticketId: ticket.id,
      agent: "user",
      body: lastUser,
      authorUserId: user.id,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save message.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const toolContext = await resolveSupportToolContext(supabase, user.id, {
    ticketId: ticket.id,
    requesterEmail: user.email,
    requesterName,
    organizationName: org?.name || null,
  });
  if ("error" in toolContext) {
    return NextResponse.json({ error: toolContext.error }, { status: 400 });
  }

  let modelMessages = cleaned;
  try {
    const stored = await listTicketMessages(supabase, ticket.id);
    const mapped = stored
      .filter(
        (m) => m.agent === "user" || m.agent === "ai" || m.agent === "human"
      )
      .map((m) => ({
        role: (m.agent === "user" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: m.body,
      }));
    if (mapped.length) modelMessages = mapped.slice(-20);
  } catch {
    // fall back to client messages
  }

  try {
    const result = await generateSupportReply({
      messages: modelMessages,
      userName: requesterName,
      toolContext,
    });

    const aiMessage = await appendTicketMessage({
      db: supabase,
      ticketId: ticket.id,
      agent: "ai",
      body: result.reply,
      metadata: { toolsUsed: result.toolsUsed },
    });

    const { data: freshTicket } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticket.id)
      .maybeSingle();

    const t = freshTicket || ticket;

    return NextResponse.json({
      reply: result.reply,
      toolsUsed: result.toolsUsed,
      ticketId: t.id,
      ticketRef: formatTicketRef(t.ticket_number),
      ticket: {
        id: t.id,
        ticketNumber: t.ticket_number,
        ticketRef: formatTicketRef(t.ticket_number),
        status: t.status,
        assignedAgent: t.assigned_agent,
        slaDueAt: t.sla_due_at,
        subject: t.subject,
      },
      messageId: aiMessage.id,
      escalated: result.toolsUsed.includes("escalate_to_human"),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Support AI failed.";
    console.error("[support] chat failed", { userId: user.id, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
