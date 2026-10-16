import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { sendInitialOutreachEmail } from "@/lib/outreach/send";
import { getOutreachSettings } from "@/lib/outreach/followups";

type Db = SupabaseClient<Database>;

function inSendWindow(settings: {
  timezone: string;
  allowed_weekdays: number[];
  send_window_start: string;
  send_window_end: string;
  sending_enabled: boolean;
}) {
  if (!settings.sending_enabled) return false;

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone || "Europe/Stockholm",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[parts.find((p) => p.type === "weekday")?.value || ""];
  if (weekday == null || !settings.allowed_weekdays?.includes(weekday)) {
    return false;
  }

  const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
  const mins = hour * 60 + minute;

  const [startH, startM] = String(settings.send_window_start)
    .slice(0, 5)
    .split(":")
    .map(Number);
  const [endH, endM] = String(settings.send_window_end)
    .slice(0, 5)
    .split(":")
    .map(Number);
  const startMins = startH * 60 + (startM || 0);
  const endMins = endH * 60 + (endM || 0);
  return mins >= startMins && mins <= endMins;
}

async function sentCountToday(db: Db, timezone: string) {
  // Approximate: count send_log sent in last 24h — good enough for MVP.
  // Could refine with timezone day bounds later.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from("outreach_send_log")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .like("idempotency_key", "initial:%")
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  void timezone;
  return count || 0;
}

/** Process queued initial outreach emails within daily limit / window. */
export async function processLeadSendQueue(options: {
  db: Db;
  userId: string;
  limit?: number;
}) {
  const { db, userId } = options;
  const settings = await getOutreachSettings(db);
  if (!settings) {
    return { sent: 0, skipped: 0, reason: "missing_settings" as const };
  }

  if (!inSendWindow(settings)) {
    return { sent: 0, skipped: 0, reason: "outside_window" as const };
  }

  const already = await sentCountToday(db, settings.timezone);
  const remaining = Math.max(0, settings.daily_send_limit - already);
  if (remaining <= 0) {
    return { sent: 0, skipped: 0, reason: "daily_limit" as const };
  }

  const batch = Math.min(options.limit || 5, remaining);
  const { data: queued, error } = await db
    .from("outreach_leads")
    .select("id")
    .eq("outreach_status", "queued")
    .eq("do_not_contact", false)
    .is("last_contacted_at", null)
    .order("queued_at", { ascending: true })
    .limit(batch);

  if (error) throw new Error(error.message);

  let sent = 0;
  let skipped = 0;
  for (const row of queued || []) {
    const result = await sendInitialOutreachEmail({
      db,
      userId,
      leadId: row.id,
    });
    if (result.ok && !result.alreadySent) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped, reason: "ok" as const };
}
