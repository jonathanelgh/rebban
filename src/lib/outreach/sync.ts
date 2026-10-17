import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  fetchGmailThreadMessages,
  listActiveOutreachGmailConnections,
  markOutreachGmailSynced,
} from "@/lib/email/outreach-gmail";
import { analyzeInboundReply, isOutreachAiConfigured } from "@/lib/outreach/analyze";
import { normalizeEmail } from "@/lib/outreach/safety-core";

type Db = SupabaseClient<Database>;
type Lead = Database["public"]["Tables"]["outreach_leads"]["Row"];
type Message = Database["public"]["Tables"]["outreach_messages"]["Row"];

function extractEmail(fromHeader: string | null) {
  if (!fromHeader) return null;
  const match = fromHeader.match(/<([^>]+)>/);
  return normalizeEmail(match?.[1] || fromHeader);
}

async function analyzeUnprocessedInbound(options: {
  db: Db;
  lead: Lead;
  errors: string[];
}) {
  const { db, lead, errors } = options;
  const { data: history, error } = await db
    .from("outreach_messages")
    .select("*")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const pending = (history || []).filter(
    (m) => m.direction === "inbound" && !m.ai_processed_at
  );
  if (!pending.length) return 0;

  // One new suggestion per sync: always score the newest inbound with full thread.
  const inbound = pending[pending.length - 1] as Message;
  try {
    await analyzeInboundReply({
      db,
      lead,
      inbound,
      history: history || [],
    });

    // Older unprocessed inbounds are covered by this thread-level suggestion.
    const olderIds = pending
      .filter((m) => m.id !== inbound.id)
      .map((m) => m.id);
    if (olderIds.length) {
      await db
        .from("outreach_messages")
        .update({ ai_processed_at: new Date().toISOString() })
        .in("id", olderIds);
    }

    return 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI analysis failed";
    console.error("[outreach] AI analysis failed", {
      leadId: lead.id,
      error: message,
    });
    errors.push(`${lead.email}: ${message}`);
    return 0;
  }
}

export async function syncOutreachReplies(options: {
  db: Db;
  /** Prefer this connection user; otherwise use first active connection. */
  userId?: string;
  leadId?: string;
  analyze?: boolean;
}) {
  const { db } = options;
  const wantAnalyze = options.analyze !== false;
  const aiConfigured = isOutreachAiConfigured();
  const connections = await listActiveOutreachGmailConnections(db);
  if (!connections.length) {
    return {
      ok: false as const,
      error: "No outreach Gmail connection found.",
      imported: 0,
      analyzed: 0,
      aiConfigured,
      errors: [] as string[],
    };
  }

  const connection =
    (options.userId
      ? connections.find((c) => c.user_id === options.userId)
      : null) || connections[0];

  let leadQuery = db
    .from("outreach_leads")
    .select("*")
    .not("gmail_thread_id", "is", null);

  if (options.leadId) {
    leadQuery = leadQuery.eq("id", options.leadId);
  }

  const { data: leads, error: leadsError } = await leadQuery.limit(100);
  if (leadsError) throw new Error(leadsError.message);

  let imported = 0;
  let analyzed = 0;
  let pendingAnalysis = 0;
  const errors: string[] = [];

  for (const lead of leads || []) {
    if (!lead.gmail_thread_id) continue;
    try {
      const threadMessages = await fetchGmailThreadMessages({
        userId: connection.user_id,
        threadId: lead.gmail_thread_id,
        db,
      });

      const { data: existing } = await db
        .from("outreach_messages")
        .select("id, provider_message_id")
        .eq("lead_id", lead.id);

      const existingIds = new Set(
        (existing || [])
          .map((m) => m.provider_message_id)
          .filter(Boolean) as string[]
      );

      const connectionEmail = normalizeEmail(connection.email);

      for (const msg of threadMessages) {
        if (existingIds.has(msg.id)) continue;

        const fromEmail = extractEmail(msg.from);
        const isOutbound =
          Boolean(fromEmail && fromEmail === connectionEmail) ||
          msg.id === lead.gmail_message_id;

        const direction = isOutbound ? "outbound" : "inbound";
        const receivedOrSent = msg.internalDate || new Date().toISOString();

        const { data: inserted, error: insertError } = await db
          .from("outreach_messages")
          .insert({
            lead_id: lead.id,
            direction,
            provider: "gmail",
            provider_message_id: msg.id,
            provider_thread_id: msg.threadId,
            subject: msg.subject,
            body_text: msg.bodyText,
            from_email: fromEmail,
            to_emails: msg.to,
            sent_at: direction === "outbound" ? receivedOrSent : null,
            received_at: direction === "inbound" ? receivedOrSent : null,
          })
          .select("*")
          .single();

        if (insertError) {
          if (insertError.code === "23505") continue;
          throw new Error(insertError.message);
        }

        imported += 1;
        existingIds.add(msg.id);
        console.info("[outreach] reply detected", {
          leadId: lead.id,
          direction,
          messageId: msg.id,
        });

        if (direction === "inbound" && inserted) {
          await db
            .from("outreach_leads")
            .update({
              outreach_status: "replied",
              last_replied_at: receivedOrSent,
              next_follow_up_at: null,
            })
            .eq("id", lead.id);

          await db
            .from("outreach_followups")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              cancellation_reason: "Lead replied",
            })
            .eq("lead_id", lead.id)
            .in("status", ["scheduled", "due"]);
        }
      }

      // Analyze any inbound that still lacks AI (new or previously skipped).
      if (wantAnalyze) {
        const { count } = await db
          .from("outreach_messages")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id)
          .eq("direction", "inbound")
          .is("ai_processed_at", null);
        const needsAi = (count || 0) > 0;
        if (needsAi) {
          if (!aiConfigured) {
            pendingAnalysis += 1;
          } else {
            // Reload lead in case status fields changed above.
            const { data: freshLead } = await db
              .from("outreach_leads")
              .select("*")
              .eq("id", lead.id)
              .maybeSingle();
            analyzed += await analyzeUnprocessedInbound({
              db,
              lead: freshLead || lead,
              errors,
            });
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      console.error("[outreach] thread sync failed", {
        leadId: lead.id,
        error: message,
      });
      errors.push(`${lead.email}: ${message}`);
    }
  }

  if (wantAnalyze && !aiConfigured && pendingAnalysis > 0) {
    errors.push(
      "OPENAI_API_KEY is not configured — replies imported but not analyzed."
    );
  }

  await markOutreachGmailSynced(db, connection.id);

  return {
    ok: true as const,
    imported,
    analyzed,
    pendingAnalysis,
    aiConfigured,
    errors,
    connectionEmail: connection.email,
  };
}
