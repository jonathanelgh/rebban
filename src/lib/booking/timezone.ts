/** Booking helpers for timezone-aware local ↔ UTC conversion (no date-fns). */

export function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "00";

  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekdayShort: get("weekday"),
  };
}

/** ISO weekday: 0 = Monday … 6 = Sunday */
export function isoWeekdayFromYmd(ymd: string, timeZone: string): number {
  // Noon UTC on that calendar day avoids DST edge ambiguity for weekday.
  const [y, m, d] = ymd.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(probe);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[wd] ?? 0;
}

function offsetMsAt(instant: Date, timeZone: string): number {
  const z = getZonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    Number(z.date.slice(0, 4)),
    Number(z.date.slice(5, 7)) - 1,
    Number(z.date.slice(8, 10)),
    z.hour,
    z.minute,
    z.second
  );
  return asUtc - instant.getTime();
}

/** Convert a local wall time in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(
  ymd: string,
  hm: string,
  timeZone: string
): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  let utc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const offset = offsetMsAt(utc, timeZone);
  utc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0) - offset);
  const offset2 = offsetMsAt(utc, timeZone);
  if (offset2 !== offset) {
    utc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0) - offset2);
  }
  return utc;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatHm(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function formatInZone(
  iso: string | Date,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions
) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    ...options,
  }).format(date);
}
