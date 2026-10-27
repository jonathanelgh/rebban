export type BillingCadence =
  | "weekly"
  | "biweekly"
  | "monthly_first"
  | "monthly_last";

export type BillingWeekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type AssistantBillingSchedule = {
  enabled: boolean;
  cadence: BillingCadence;
  /** Required for weekly / biweekly */
  weekday: BillingWeekday;
  /** Local hour 0–23 */
  hour: number;
  /**
   * For biweekly: any YYYY-MM-DD that falls on an "on" occurrence
   * (same weekday). Weeks alternate from this anchor.
   */
  biweekly_anchor_ymd: string | null;
};

export const DEFAULT_BILLING_SCHEDULE: AssistantBillingSchedule = {
  enabled: true,
  cadence: "weekly",
  weekday: "Mon",
  hour: 8,
  biweekly_anchor_ymd: null,
};

const DEFAULT_TZ = "Europe/Stockholm";

function resolveTimezone(timezone?: string | null): string {
  const candidate = (timezone || "").trim() || DEFAULT_TZ;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TZ;
  }
}

const WEEKDAYS: BillingWeekday[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

export function isBillingWeekday(value: string): value is BillingWeekday {
  return (WEEKDAYS as string[]).includes(value);
}

export function isBillingCadence(value: string): value is BillingCadence {
  return (
    value === "weekly" ||
    value === "biweekly" ||
    value === "monthly_first" ||
    value === "monthly_last"
  );
}

export function clampHour(hour: number) {
  if (!Number.isFinite(hour)) return DEFAULT_BILLING_SCHEDULE.hour;
  return Math.min(23, Math.max(0, Math.round(hour)));
}

export function parseBillingSchedule(raw: unknown): AssistantBillingSchedule {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_BILLING_SCHEDULE };
  }
  const obj = raw as Record<string, unknown>;
  const cadence = isBillingCadence(String(obj.cadence || ""))
    ? (obj.cadence as BillingCadence)
    : DEFAULT_BILLING_SCHEDULE.cadence;
  const weekdayRaw = String(obj.weekday || DEFAULT_BILLING_SCHEDULE.weekday);
  const weekday = isBillingWeekday(weekdayRaw)
    ? weekdayRaw
    : DEFAULT_BILLING_SCHEDULE.weekday;
  const hour = clampHour(Number(obj.hour));
  const enabled = obj.enabled === false ? false : true;
  const anchor =
    typeof obj.biweekly_anchor_ymd === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(obj.biweekly_anchor_ymd)
      ? obj.biweekly_anchor_ymd
      : null;

  return {
    enabled,
    cadence,
    weekday,
    hour,
    biweekly_anchor_ymd: anchor,
  };
}

/** Read schedule from profiles.notification_prefs JSON. */
export function billingScheduleFromPrefs(prefs: unknown): AssistantBillingSchedule {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
    return { ...DEFAULT_BILLING_SCHEDULE };
  }
  const nested = (prefs as Record<string, unknown>).assistant_billing;
  return parseBillingSchedule(nested);
}

export function mergeBillingScheduleIntoPrefs(
  prefs: unknown,
  schedule: AssistantBillingSchedule
): Record<string, unknown> {
  const base =
    prefs && typeof prefs === "object" && !Array.isArray(prefs)
      ? { ...(prefs as Record<string, unknown>) }
      : {};
  base.assistant_billing = schedule;
  return base;
}

export function describeBillingSchedule(schedule: AssistantBillingSchedule): string {
  if (!schedule.enabled) return "Invoicing reminders are off.";
  const time = `${String(schedule.hour).padStart(2, "0")}:00`;
  switch (schedule.cadence) {
    case "weekly":
      return `Every ${schedule.weekday} at ${time} (your timezone).`;
    case "biweekly":
      return `Every other ${schedule.weekday} at ${time} (your timezone).`;
    case "monthly_first":
      return `First day of each month at ${time} (your timezone).`;
    case "monthly_last":
      return `Last day of each month at ${time} (your timezone).`;
    default:
      return `Scheduled at ${time}.`;
  }
}

function localParts(timeZone: string, now: Date) {
  const zone = resolveTimezone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";
  return {
    zone,
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday") as BillingWeekday | string,
    hour: Number(get("hour")),
    day: Number(get("day")),
    month: Number(get("month")),
    year: Number(get("year")),
  };
}

function daysBetweenYmd(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aUtc = Date.UTC(ay, am - 1, ad);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((bUtc - aUtc) / (1000 * 60 * 60 * 24));
}

function isLastDayOfMonth(year: number, month: number, day: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day === last;
}

function isBiweeklyOn(
  ymd: string,
  weekday: string,
  scheduleWeekday: BillingWeekday,
  anchorYmd: string | null
) {
  if (weekday !== scheduleWeekday) return false;
  const anchor = anchorYmd || ymd;
  const deltaWeeks = Math.floor(daysBetweenYmd(anchor, ymd) / 7);
  return deltaWeeks % 2 === 0;
}

/**
 * True when local clock is in the send hour on a schedule-matching day.
 */
export function isBillingScheduleWindow(
  schedule: AssistantBillingSchedule,
  timeZone: string,
  now = new Date()
): boolean {
  if (!schedule.enabled) return false;
  const local = localParts(timeZone, now);
  if (local.hour !== schedule.hour) return false;

  switch (schedule.cadence) {
    case "weekly":
      return local.weekday === schedule.weekday;
    case "biweekly":
      return isBiweeklyOn(
        local.ymd,
        local.weekday,
        schedule.weekday,
        schedule.biweekly_anchor_ymd
      );
    case "monthly_first":
      return local.day === 1;
    case "monthly_last":
      return isLastDayOfMonth(local.year, local.month, local.day);
    default:
      return false;
  }
}

/** Minimum cooldown days between sends for a cadence (safety net). */
export function billingCooldownDays(cadence: BillingCadence): number {
  switch (cadence) {
    case "weekly":
      return 5;
    case "biweekly":
      return 12;
    case "monthly_first":
    case "monthly_last":
      return 25;
    default:
      return 5;
  }
}

/** Suggest biweekly anchor as today's local YMD when enabling biweekly. */
export function defaultBiweeklyAnchor(timeZone: string, now = new Date()) {
  return localParts(timeZone, now).ymd;
}
