import {
  addDaysYmd,
  formatHm,
  getZonedParts,
  isoWeekdayFromYmd,
  parseHmToMinutes,
  zonedLocalToUtc,
} from "./timezone";

export type AvailabilityRule = {
  weekday: number;
  start_time: string;
  end_time: string;
};

export type BusyRange = {
  starts_at: string;
  ends_at: string;
};

export type SlotOption = {
  starts_at: string;
  label: string;
  available: boolean;
};

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

/** Normalize busy ranges from RPC/json payloads. */
export function normalizeBusyRanges(raw: unknown): BusyRange[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const starts =
        typeof row.starts_at === "string"
          ? row.starts_at
          : typeof row.startsAt === "string"
            ? row.startsAt
            : null;
      const ends =
        typeof row.ends_at === "string"
          ? row.ends_at
          : typeof row.endsAt === "string"
            ? row.endsAt
            : null;
      if (!starts || !ends) return null;
      const startMs = new Date(starts).getTime();
      const endMs = new Date(ends).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) {
        return null;
      }
      return { starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString() };
    })
    .filter((r): r is BusyRange => r !== null);
}
export const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const COMMON_TIMEZONES = [
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Warsaw",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
] as const;

export function detectBrowserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && typeof tz === "string" ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

/** Ensure detected / host zones appear in the picker even if not in the common list. */
export function timeZonesForPicker(...extra: Array<string | null | undefined>) {
  const set = new Set<string>(COMMON_TIMEZONES);
  for (const tz of extra) {
    if (tz) set.add(tz);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function defaultWeekdayAvailability(): AvailabilityRule[] {
  return [0, 1, 2, 3, 4].map((weekday) => ({
    weekday,
    start_time: "09:00",
    end_time: "17:00",
  }));
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
) {
  return aStart < bEnd && aEnd > bStart;
}

/** Build open slots for a single local calendar day. */
export function slotsForDay(options: {
  ymd: string;
  timeZone: string;
  durationMinutes: number;
  intervalMinutes: number;
  availability: AvailabilityRule[];
  busy: BusyRange[];
  now?: Date;
}): SlotOption[] {
  const {
    ymd,
    timeZone,
    durationMinutes,
    intervalMinutes,
    availability,
    busy,
    now = new Date(),
  } = options;

  const weekday = isoWeekdayFromYmd(ymd, timeZone);
  const windows = availability.filter((r) => r.weekday === weekday);
  if (!windows.length) return [];

  const busyMs = busy.map((b) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));

  const todayLocal = getZonedParts(now, timeZone).date;
  const slots: SlotOption[] = [];

  for (const win of windows) {
    const startMin = parseHmToMinutes(win.start_time);
    const endMin = parseHmToMinutes(win.end_time);

    for (
      let cursor = startMin;
      cursor + durationMinutes <= endMin;
      cursor += intervalMinutes
    ) {
      const hm = formatHm(cursor);
      const starts = zonedLocalToUtc(ymd, hm, timeZone);
      const ends = new Date(starts.getTime() + durationMinutes * 60_000);

      if (ymd < todayLocal) continue;
      if (ymd === todayLocal && starts.getTime() <= now.getTime()) continue;

      const startMs = starts.getTime();
      const endMs = ends.getTime();
      const blocked = busyMs.some((b) =>
        overlaps(startMs, endMs, b.start, b.end)
      );

      slots.push({
        starts_at: starts.toISOString(),
        label: hm,
        available: !blocked,
      });
    }
  }

  return slots;
}

export function availableSlotsForDay(
  options: Parameters<typeof slotsForDay>[0]
) {
  return slotsForDay(options).filter((s) => s.available);
}

/** Whether a YMD date has any available slot (for calendar day highlighting). */
export function dateHasAvailability(options: {
  ymd: string;
  timeZone: string;
  durationMinutes: number;
  intervalMinutes: number;
  availability: AvailabilityRule[];
  busy: BusyRange[];
  now?: Date;
}) {
  return availableSlotsForDay(options).length > 0;
}

export function enumerateMonthDays(year: number, monthIndex: number) {
  const days: string[] = [];
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    days.push(
      `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  return days;
}

export function monthGridStartYmd(year: number, monthIndex: number): string {
  // Monday-start grid
  const first = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const wd = isoWeekdayFromYmd(first, "UTC");
  return addDaysYmd(first, -wd);
}
