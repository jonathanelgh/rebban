export type LocalClock = {
  date: string; // YYYY-MM-DD in timezone
  hours: number;
  minutes: number;
  hhmm: string;
};

export function getLocalClock(timeZone: string, now = new Date()): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "00";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hours = Number(get("hour"));
  const minutes = Number(get("minute"));
  const hhmm = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  return {
    date: `${year}-${month}-${day}`,
    hours,
    minutes,
    hhmm,
  };
}

export function normalizePublishTimes(times: string[] | null | undefined) {
  const cleaned = (times || [])
    .map((t) => String(t || "").trim())
    .filter((t) => /^\d{2}:\d{2}$/.test(t))
    .slice(0, 4);
  return cleaned.length ? cleaned : ["08:30", "17:30"];
}

/** True when local clock is within [slot, slot + windowMinutes). */
export function isSlotOpen(
  slotHhmm: string,
  clock: LocalClock,
  windowMinutes = 25
) {
  const [sh, sm] = slotHhmm.split(":").map(Number);
  const slotMins = sh * 60 + sm;
  const nowMins = clock.hours * 60 + clock.minutes;
  return nowMins >= slotMins && nowMins < slotMins + windowMinutes;
}

export function activeSlotsForSettings(options: {
  postsPerDay: number;
  publishTimes: string[];
}) {
  return normalizePublishTimes(options.publishTimes).slice(
    0,
    Math.max(1, Math.min(4, options.postsPerDay || 2))
  );
}
