import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { sendOutreachEmailViaGmail } from "@/lib/email/outreach-gmail";
import {
  canSendInitialOutreach,
  initialSendIdempotencyKey,
} from "@/lib/outreach/safety";

type Db = SupabaseClient<Database>;

export async function sendInitialOutreachEmail(options: {
  db: Db;
  userId: string;
  leadId: string;
}) {
  const { db, userId, leadId } = options;
  // Always pass db so cron/service-role jobs can refresh tokens without a cookie session.
  const idempotencyKey = initialSendIdempotencyKey(leadId);

  const { data: existingLog } = await db
    .from("outreach_send_log")
    .select("id, status, message_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingLog?.status === "sent") {
    return {
      ok: true as const,
      alreadySent: true,
      messageId: existingLog.message_id,
    };
  }

  if (existingLog?.status === "queued") {
    return {
      ok: false as const,
      error: "Send already in progress for this lead.",
      reason: "already_contacted" as const,
    };
  }

  const { data: lead, error: leadError } = await db
    .from("outreach_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) throw new Error(leadError.message);
  if (!lead) throw new Error("Lead not found.");

  const gate = canSendInitialOutreach(lead);
  if (!gate.ok) {
    await db.from("outreach_send_log").insert({
      lead_id: leadId,
      status: "skipped",
      error: gate.message,
    });
    return { ok: false as const, error: gate.message, reason: gate.reason };
  }

  // Claim or reclaim after a previous failure.
  if (existingLog?.status === "failed") {
    const { error: reclaimError } = await db
      .from("outreach_send_log")
      .update({ status: "queued", error: null })
      .eq("id", existingLog.id)
      .eq("status", "failed");
    if (reclaimError) throw new Error(reclaimError.message);
  } else {
    const { error: claimError } = await db.from("outreach_send_log").insert({
      lead_id: leadId,
      status: "queued",
      idempotency_key: idempotencyKey,
    });

    if (claimError) {
      if (claimError.code === "23505") {
        const { data: race } = await db
          .from("outreach_send_log")
          .select("status, message_id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (race?.status === "sent") {
          return {
            ok: true as const,
            alreadySent: true,
            messageId: race.message_id,
          };
        }
        return {
          ok: false as const,
          error: "Send already in progress for this lead.",
          reason: "already_contacted" as const,
        };
      }
      throw new Error(claimError.message);
    }
  }

  console.info("[outreach] email queued", { leadId, email: lead.email });

  try {
    const result = await sendOutreachEmailViaGmail({
      userId,
      to: lead.email,
      subject: lead.subject_line!.trim(),
      bodyText: lead.initial_email_body!.trim(),
      fromName: "Jonathan",
      db,
    });

    if (!result) {
      throw new Error(
        "Outreach Gmail is not connected. Connect it in Admin → Leads → Settings."
      );
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
        subject: lead.subject_line,
        body_text: lead.initial_email_body,
        from_email: result.from,
        to_emails: [lead.email],
        sent_at: sentAt,
        created_by: userId,
      })
      .select("id")
      .single();

    if (msgError) throw new Error(msgError.message);

    const { error: leadUpdateError } = await db
      .from("outreach_leads")
      .update({
        outreach_status: "contacted",
        ready_to_send: false,
        queued_at: null,
        last_contacted_at: sentAt,
        gmail_thread_id: result.threadId,
        gmail_message_id: result.messageId,
      })
      .eq("id", leadId);

    if (leadUpdateError) throw new Error(leadUpdateError.message);

    await db
      .from("outreach_send_log")
      .update({
        status: "sent",
        message_id: message.id,
        error: null,
      })
      .eq("idempotency_key", idempotencyKey);

    console.info("[outreach] email sent", {
      leadId,
      messageId: result.messageId,
      threadId: result.threadId,
    });

    return {
      ok: true as const,
      alreadySent: false,
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

    console.error("[outreach] email failed", { leadId, error: message });
    return { ok: false as const, error: message };
  }
}
