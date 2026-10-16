import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { generateFollowUpDraft } from "@/lib/outreach/analyze";
import { sendApprovedReply } from "@/lib/outreach/reply-send";

type Db = SupabaseClient<Database>;

export async function getOutreachSettings(db: Db) {
  const { data, error } = await db
    .from("outreach_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Mark follow-ups as due and generate draft copy for manual approval. */
export async function prepareDueFollowups(db: Db) {
  const settings = await getOutreachSettings(db);
  if (!settings) {
    return { prepared: 0, errors: [] as string[] };
  }

  const now = new Date();
  const maxFollowUps = settings.max_follow_ups || 0;
  if (maxFollowUps <= 0) {
    return { prepared: 0, errors: [] as string[] };
  }

  // Leads contacted, no reply, not opted out, under max follow-ups.
  const { data: leads, error } = await db
    .from("outreach_leads")
    .select("*")
    .eq("do_not_contact", false)
    .is("last_replied_at", null)
    .not("last_contacted_at", "is", null)
    .neq("outreach_status", "not_interested")
    .neq("outreach_status", "bounced")
    .lt("follow_up_count", maxFollowUps)
    .limit(100);

  if (error) throw new Error(error.message);

  let prepared = 0;
  const errors: string[] = [];

  for (const lead of leads || []) {
    const nextNumber = (lead.follow_up_count || 0) + 1;
    if (nextNumber > maxFollowUps) continue;

    const days =
      nextNumber === 1
        ? settings.follow_up_1_days
        : settings.follow_up_2_days;
    const contactedAt = lead.last_contacted_at
      ? new Date(lead.last_contacted_at)
      : null;
    if (!contactedAt) continue;

    const dueAt = new Date(
      contactedAt.getTime() + days * 24 * 60 * 60 * 1000
    );
    if (dueAt > now) {
      // Store next_follow_up_at for UI even if not due yet.
      if (
        !lead.next_follow_up_at ||
        new Date(lead.next_follow_up_at).getTime() !== dueAt.getTime()
      ) {
        await db
          .from("outreach_leads")
          .update({ next_follow_up_at: dueAt.toISOString() })
          .eq("id", lead.id);
      }
      continue;
    }

    const { data: existing } = await db
      .from("outreach_followups")
      .select("id, status")
      .eq("lead_id", lead.id)
      .eq("follow_up_number", nextNumber)
      .maybeSingle();

    if (existing && ["due", "sent", "scheduled"].includes(existing.status)) {
      if (existing.status === "scheduled") {
        await db
          .from("outreach_followups")
          .update({ status: "due" })
          .eq("id", existing.id);
      }
      continue;
    }

    try {
      const draft = await generateFollowUpDraft({
        lead,
        followUpNumber: nextNumber,
      });

      const { error: insertError } = await db.from("outreach_followups").insert({
        lead_id: lead.id,
        scheduled_for: dueAt.toISOString(),
        follow_up_number: nextNumber,
        status: "due",
        subject: draft.subject,
        body: draft.body,
      });

      if (insertError) throw new Error(insertError.message);

      await db
        .from("outreach_leads")
        .update({ next_follow_up_at: dueAt.toISOString() })
        .eq("id", lead.id);

      prepared += 1;
      console.info("[outreach] follow-up generated", {
        leadId: lead.id,
        followUpNumber: nextNumber,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Follow-up failed";
      errors.push(`${lead.email}: ${message}`);
    }
  }

  return { prepared, errors };
}

export async function approveAndSendFollowup(options: {
  db: Db;
  userId: string;
  followupId: string;
  subject?: string;
  body?: string;
}) {
  const { db, userId, followupId } = options;
  const { data: followup, error } = await db
    .from("outreach_followups")
    .select("*")
    .eq("id", followupId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!followup) return { ok: false as const, error: "Follow-up not found." };
  if (followup.status === "sent") {
    return { ok: false as const, error: "Follow-up already sent." };
  }
  if (followup.status === "cancelled") {
    return { ok: false as const, error: "Follow-up was cancelled." };
  }

  const { data: lead } = await db
    .from("outreach_leads")
    .select("*")
    .eq("id", followup.lead_id)
    .maybeSingle();

  if (!lead) return { ok: false as const, error: "Lead not found." };
  if (lead.do_not_contact) {
    return { ok: false as const, error: "Lead is do not contact." };
  }
  if (lead.last_replied_at) {
    await db
      .from("outreach_followups")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "Lead already replied",
      })
      .eq("id", followupId);
    return { ok: false as const, error: "Lead already replied." };
  }

  const subject = options.subject?.trim() || followup.subject || "";
  const body = options.body?.trim() || followup.body || "";
  if (!body) return { ok: false as const, error: "Follow-up body is empty." };

  const result = await sendApprovedReply({
    db,
    userId,
    leadId: lead.id,
    subject,
    body,
  });

  if (!result.ok) return result;

  await db
    .from("outreach_followups")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      subject,
      body,
    })
    .eq("id", followupId);

  await db
    .from("outreach_leads")
    .update({
      follow_up_count: followup.follow_up_number,
      next_follow_up_at: null,
    })
    .eq("id", lead.id);

  return { ok: true as const, messageId: result.messageId };
}
