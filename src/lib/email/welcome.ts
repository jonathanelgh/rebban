import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOutreachEmailViaGmail } from "@/lib/email/outreach-gmail";

type Db = SupabaseClient<Database>;

const WELCOME_BATCH_LIMIT = 25;

function firstNameFrom(fullName: string | null | undefined) {
  const part = (fullName || "").trim().split(/\s+/)[0];
  return part || null;
}

export function buildWelcomeEmail(options: {
  fullName?: string | null;
  email: string;
}) {
  const first = firstNameFrom(options.fullName);
  const greeting = first ? `Hey ${first} 👋` : "Hey 👋";
  // Keep subject ASCII-only so Gmail clients never show mojibake from header encoding.
  const subject = first
    ? `${first}, welcome to Rebban`
    : "Welcome to Rebban";

  const bodyText = [
    greeting,
    "",
    "I'm Jonathan, the founder of Rebban. Wanted to say welcome personally - glad you signed up.",
    "",
    "I built Rebban for freelancers who want the client loop to stay simple: proposal > project > tracked time > invoice > paid, without stitching five tools together.",
    "",
    "If anything feels off, confusing, or you want a tip for your setup, just reply to this email. I read them.",
    "",
    "Talk soon,",
    "Jonathan",
    "Founder, Rebban",
  ].join("\n");

  return { subject, bodyText };
}

async function getOutreachSender(admin: Db) {
  const { data: connection } = await admin
    .from("outreach_gmail_connections")
    .select("user_id, email")
    .is("revoked_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return connection;
}

/**
 * Cron worker: send due founder welcome emails (~75 minutes after signup).
 */
export async function processDueWelcomeEmails(options?: { limit?: number }) {
  const admin = createAdminClient();
  const limit = options?.limit ?? WELCOME_BATCH_LIMIT;
  const nowIso = new Date().toISOString();

  const { data: due, error } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .is("welcome_email_sent_at", null)
    .not("welcome_email_due_at", "is", null)
    .lte("welcome_email_due_at", nowIso)
    .is("deleted_at", null)
    .order("welcome_email_due_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = due || [];
  if (rows.length === 0) {
    return { scanned: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const connection = await getOutreachSender(admin);
  if (!connection?.user_id) {
    console.warn("[welcome] outreach Gmail not connected; skipping batch", {
      due: rows.length,
    });
    return {
      scanned: rows.length,
      sent: 0,
      failed: 0,
      skipped: rows.length,
      reason: "no_outreach_gmail" as const,
    };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const profile of rows) {
    const to = profile.email?.trim();
    if (!to || !to.includes("@")) {
      // Mark sent so we don't retry forever on incomplete profiles.
      await admin
        .from("profiles")
        .update({
          welcome_email_sent_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", profile.id)
        .is("welcome_email_sent_at", null);
      skipped += 1;
      continue;
    }

    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("profiles")
      .update({ welcome_email_sent_at: claimedAt, updated_at: claimedAt })
      .eq("id", profile.id)
      .is("welcome_email_sent_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("[welcome] claim failed", {
        userId: profile.id,
        error: claimError.message,
      });
      failed += 1;
      continue;
    }
    if (!claimed) {
      skipped += 1;
      continue;
    }

    const { subject, bodyText } = buildWelcomeEmail({
      fullName: profile.full_name,
      email: to,
    });

    try {
      const result = await sendOutreachEmailViaGmail({
        userId: connection.user_id,
        to,
        subject,
        bodyText,
        fromName: "Jonathan",
        db: admin,
      });

      if (!result) {
        await admin
          .from("profiles")
          .update({
            welcome_email_sent_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", profile.id);
        failed += 1;
        continue;
      }

      console.info("[welcome] sent", {
        userId: profile.id,
        to,
        from: result.from,
        messageId: result.messageId,
      });
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Welcome send failed.";
      await admin
        .from("profiles")
        .update({
          welcome_email_sent_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      console.error("[welcome] send failed", {
        userId: profile.id,
        error: message,
      });
      failed += 1;
    }
  }

  return { scanned: rows.length, sent, failed, skipped };
}
