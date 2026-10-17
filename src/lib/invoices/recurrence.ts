export type InvoiceRecurrenceInterval =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly";

export const RECURRENCE_INTERVAL_OPTIONS: {
  value: InvoiceRecurrenceInterval;
  label: string;
}[] = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

export function isWeekInterval(interval: InvoiceRecurrenceInterval) {
  return interval === "weekly" || interval === "biweekly";
}

export function isMonthInterval(interval: InvoiceRecurrenceInterval) {
  return interval === "monthly" || interval === "quarterly";
}

function atUtcHour(date: Date, hour = 9) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
      0,
      0
    )
  );
}

/** Next occurrence of weekday (0=Sun..6=Sat), strictly after `from` if same day. */
function nextWeekday(from: Date, weekday: number, weeksAhead = 1) {
  const day = ((weekday % 7) + 7) % 7;
  const base = atUtcHour(from);
  const current = base.getUTCDay();
  let delta = (day - current + 7) % 7;
  if (delta === 0) delta = 7 * Math.max(1, weeksAhead);
  else if (weeksAhead > 1) {
    // land on weekday, then add remaining weeks
    delta += 7 * (weeksAhead - 1);
  }
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + delta);
  return atUtcHour(next);
}

function nextDayOfMonth(
  from: Date,
  dayOfMonth: number,
  monthsAhead: number
) {
  const day = Math.min(28, Math.max(1, Math.floor(dayOfMonth) || 1));
  const base = atUtcHour(from);
  let year = base.getUTCFullYear();
  let month = base.getUTCMonth();

  // If today is on/after billing day, start from next month block.
  if (base.getUTCDate() >= day) {
    month += 1;
  }

  month += Math.max(0, monthsAhead - 1);
  while (month > 11) {
    month -= 12;
    year += 1;
  }

  return new Date(Date.UTC(year, month, day, 9, 0, 0));
}

/**
 * First scheduled send after creating/configuring recurrence.
 * Skips "today" so the invoice the freelancer just created is the first;
 * automation starts on the next interval occurrence.
 */
export function firstRecurrenceAt(input: {
  interval: InvoiceRecurrenceInterval;
  weekday?: number | null;
  dayOfMonth?: number | null;
  from?: Date;
}) {
  const from = input.from || new Date();
  if (isWeekInterval(input.interval)) {
    const weekday =
      input.weekday === 0 || input.weekday
        ? input.weekday
        : from.getUTCDay();
    // First send is the next chosen weekday; biweekly spacing applies after that.
    return nextWeekday(from, weekday, 1);
  }
  const day =
    input.dayOfMonth && input.dayOfMonth >= 1
      ? input.dayOfMonth
      : Math.min(28, from.getUTCDate());
  return nextDayOfMonth(
    from,
    day,
    input.interval === "quarterly" ? 3 : 1
  );
}

/** Advance from a known send (or previous next_at) to the following occurrence. */
export function advanceRecurrenceAt(input: {
  interval: InvoiceRecurrenceInterval;
  weekday?: number | null;
  dayOfMonth?: number | null;
  fromIso: string;
}) {
  const from = new Date(input.fromIso);
  if (Number.isNaN(from.getTime())) {
    return firstRecurrenceAt(input);
  }

  if (input.interval === "weekly") {
    const weekday =
      input.weekday === 0 || input.weekday ? input.weekday : from.getUTCDay();
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + 7);
    // Snap to weekday in case of drift
    const delta = (weekday - next.getUTCDay() + 7) % 7;
    if (delta) next.setUTCDate(next.getUTCDate() + delta);
    return atUtcHour(next);
  }

  if (input.interval === "biweekly") {
    const weekday =
      input.weekday === 0 || input.weekday ? input.weekday : from.getUTCDay();
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + 14);
    const delta = (weekday - next.getUTCDay() + 7) % 7;
    if (delta) next.setUTCDate(next.getUTCDate() + delta);
    return atUtcHour(next);
  }

  const day =
    input.dayOfMonth && input.dayOfMonth >= 1
      ? input.dayOfMonth
      : Math.min(28, from.getUTCDate());

  if (input.interval === "quarterly") {
    return nextDayOfMonth(from, day, 3);
  }
  return nextDayOfMonth(from, day, 1);
}

export function recurrenceLabel(input: {
  interval: InvoiceRecurrenceInterval;
  weekday?: number | null;
  dayOfMonth?: number | null;
}) {
  const intervalLabel =
    RECURRENCE_INTERVAL_OPTIONS.find((o) => o.value === input.interval)
      ?.label || input.interval;
  if (isWeekInterval(input.interval)) {
    const day =
      WEEKDAY_OPTIONS.find((o) => o.value === input.weekday)?.label ||
      "chosen day";
    return `${intervalLabel} on ${day}`;
  }
  const dom = input.dayOfMonth || 1;
  return `${intervalLabel} on day ${dom}`;
}
