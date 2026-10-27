import { MONTH_NAMES } from "./constants";

const MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function parseReceiptMonthYear(args: {
  year?: unknown;
  month?: unknown;
  month_query?: unknown;
}):
  | { ok: true; year: number; month: number; label: string }
  | { ok: false; error: string } {
  const now = new Date();
  let year =
    typeof args.year === "number" && Number.isFinite(args.year)
      ? Math.round(args.year)
      : typeof args.year === "string" && /^\d{4}$/.test(args.year.trim())
        ? Number(args.year.trim())
        : now.getFullYear();

  let month: number | null = null;
  if (typeof args.month === "number" && Number.isFinite(args.month)) {
    month = Math.round(args.month);
  } else if (typeof args.month === "string" && args.month.trim()) {
    const raw = args.month.trim().toLowerCase();
    if (/^\d{1,2}$/.test(raw)) month = Number(raw);
    else month = MONTH_ALIASES[raw] || null;
  }

  const query = String(args.month_query || "").trim().toLowerCase();
  if (month == null && query) {
    // "october 2026" / "oct 2025" / "2026-10"
    const iso = query.match(/^(\d{4})-(\d{1,2})$/);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
    } else {
      const named = query.match(
        /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/
      );
      const yearMatch = query.match(/\b(20\d{2})\b/);
      if (named) month = MONTH_ALIASES[named[1]] || null;
      if (yearMatch) year = Number(yearMatch[1]);
    }
  }

  if (month == null) {
    month = now.getMonth() + 1;
  }

  if (month < 1 || month > 12) {
    return { ok: false, error: "Month must be between 1 and 12." };
  }
  if (year < 2000 || year > 2100) {
    return { ok: false, error: "Year looks invalid." };
  }

  // If they said "October" in January without a year, prefer last October.
  if (
    args.year == null &&
    !String(args.month_query || "").match(/\b20\d{2}\b/) &&
    month > now.getMonth() + 1
  ) {
    year = now.getFullYear() - 1;
  }

  return {
    ok: true,
    year,
    month,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}
