/** Local-time window for the weekly assistant needs-attention digest. */

export const DEFAULT_DIGEST_TIMEZONE = "Europe/Stockholm";
/** Send during this local hour (8:00–8:59). */
export const DIGEST_LOCAL_HOUR = 8;
/** Monday in en-US short weekday form. */
export const DIGEST_WEEKDAY = "Mon";

export function resolveDigestTimezone(timezone?: string | null): string {
  const candidate = (timezone || "").trim() || DEFAULT_DIGEST_TIMEZONE;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_DIGEST_TIMEZONE;
  }
}

/**
 * True when `now` falls on Monday during DIGEST_LOCAL_HOUR in `timeZone`.
 * Used by the hourly cron so each user gets the digest at ~8am local.
 */
export function isDigestSendWindow(
  timeZone: string,
  now = new Date()
): boolean {
  const zone = resolveDigestTimezone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value || "-1");
  return weekday === DIGEST_WEEKDAY && hour === DIGEST_LOCAL_HOUR;
}
