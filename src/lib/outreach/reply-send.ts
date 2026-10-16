import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { sendOutreachEmailViaGmail } from "@/lib/email/outreach-gmail";

type Db = SupabaseClient<Database>;

export async function sendApprovedReply(options: {
  db: Db;
  userId: string;
  leadId: string;
  body: string;
  subject?: string | null;
}) {
  const { db, userId, leadId } = options;
  const body = options.body.trim();
  if (!body) {
    return { ok: false as const, error: "Reply body is empty." };
  }

  const { data: lead, error: leadError } = await db
    .from("outreach_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) throw new Error(leadError.message);
  if (!lead) return { ok: false as const, error: "Lead not found." };
  if (lead.do_not_contact) {
    return { ok: false as const, error: "Lead is marked do not contact." };
  }
  if (!lead.gmail_thread_id) {
    return {
      ok: false as const,
      error: "No Gmail thread on this lead. Send initial outreach first.",
    };
  }

  const subject =
    options.subject?.trim() ||
    (lead.subject_line?.startsWith("Re:")
      ? lead.subject_line
      : `Re: ${lead.subject_line || "your note"}`);

  const idempotencyKey = `reply:${leadId}:${Date.now()}`;

  const { error: logError } = await db.from("outreach_send_log").insert({
    lead_id: leadId,
    status: "queued",
    idempotency_key: idempotencyKey,
  });
  if (logError) throw new Error(logError.message);

  try {
    const result = await sendOutreachEmailViaGmail({
      userId,
      to: lead.email,
      subject,
      bodyText: body,
      fromName: "Jonathan",
      threadId: lead.gmail_thread_id,
      db,
    });

    if (!result) {
      throw new Error("Outreach Gmail is not connected.");
    }

    const sentAt = new Date().toISOString();
    const { data: message, error: msgError } = await db
      .from("outreach_messages")
      .insert({
        lead_id: leadId,
        direction: "outbound",
        provider: "gmail",
        provider_message_id: result.messageId,
        provider_thread_id: result.threadId,
        subject,
        body_text: body,
        from_email: result.from,
        to_emails: [lead.email],
        sent_at: sentAt,
        created_by: userId,
      })
      .select("id")
      .single();

    if (msgError) throw new Error(msgError.message);

    await db
      .from("outreach_leads")
      .update({
        last_contacted_at: sentAt,
        gmail_message_id: result.messageId || lead.gmail_message_id,
        gmail_thread_id: result.threadId || lead.gmail_thread_id,
      })
      .eq("id", leadId);

    await db
      .from("outreach_send_log")
      .update({ status: "sent", message_id: message.id, error: null })
      .eq("idempotency_key", idempotencyKey);

    console.info("[outreach] reply sent", {
      leadId,
      messageId: result.messageId,
      threadId: result.threadId,
    });

    return {
      ok: true as const,
      messageId: message.id,
      providerMessageId: result.messageId,
      threadId: result.threadId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed.";
    await db
      .from("outreach_send_log")
      .update({ status: "failed", error: message })
      .eq("idempotency_key", idempotencyKey);
    console.error("[outreach] reply send failed", { leadId, error: message });
    return { ok: false as const, error: message };
  }
}
