import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  availableSlotsForDay,
  normalizeBusyRanges,
  slotsForDay,
  type AvailabilityRule,
} from "@/lib/booking/slots";
import { mergeGoogleBusyForToken } from "@/lib/booking/google-calendar";
import { addDaysYmd, zonedLocalToUtc } from "@/lib/booking/timezone";

type PublicLink = {
  token: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  timezone: string;
  slot_interval_minutes: number;
  location_type?: "in_person" | "online" | null;
  online_provider?: "google_meet" | "zoom" | null;
  location_details?: string | null;
  availability: AvailabilityRule[];
  host?: { name: string | null; avatar_path: string | null };
  organization: { name: string | null; logo_url: string | null };
};

function resolveAvatarUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/avatars/${pathOrUrl}`;
}

function publicLinkPayload(link: PublicLink, timeZone: string) {
  return {
    title: link.title,
    description: link.description,
    duration_minutes: link.duration_minutes,
    /** Host availability timezone (slots are generated in this zone). */
    timezone: timeZone,
    host_timezone: timeZone,
    location_type: link.location_type || "online",
    online_provider: link.online_provider || null,
    location_details: link.location_details || null,
    host: {
      name: link.host?.name ?? null,
      avatar_url: resolveAvatarUrl(link.host?.avatar_path),
    },
    organization: link.organization,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const url = new URL(request.url);
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: linkData, error: linkError } = await supabase.rpc(
    "get_public_booking_link",
    { p_token: token }
  );

  if (linkError || !linkData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const link = linkData as PublicLink;
  const timeZone = link.timezone || "Europe/Stockholm";
  const linkPayload = publicLinkPayload(link, timeZone);

  // Month overview: return which dates have open (non-booked) slots
  if (
    from &&
    to &&
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to)
  ) {
    const rangeStart = zonedLocalToUtc(from, "00:00", timeZone);
    const rangeEnd = zonedLocalToUtc(addDaysYmd(to, 1), "00:00", timeZone);

    const { data: busyData } = await supabase.rpc("get_public_booking_busy", {
      p_token: token,
      p_from: rangeStart.toISOString(),
      p_to: rangeEnd.toISOString(),
    });
    const busy = await mergeGoogleBusyForToken({
      token,
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      existing: normalizeBusyRanges(busyData),
    });

    const availableDates: string[] = [];
    let cursor = from;
    while (cursor <= to) {
      const open = availableSlotsForDay({
        ymd: cursor,
        timeZone,
        durationMinutes: link.duration_minutes,
        intervalMinutes: link.slot_interval_minutes,
        availability: link.availability || [],
        busy,
      });
      if (open.length) availableDates.push(cursor);
      cursor = addDaysYmd(cursor, 1);
    }

    return NextResponse.json({
      link: linkPayload,
      available_dates: availableDates,
    });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Provide date=YYYY-MM-DD or from/to range" },
      { status: 400 }
    );
  }

  const dayStart = zonedLocalToUtc(date, "00:00", timeZone);
  const dayEnd = zonedLocalToUtc(addDaysYmd(date, 1), "00:00", timeZone);

  const { data: busyData } = await supabase.rpc("get_public_booking_busy", {
    p_token: token,
    p_from: dayStart.toISOString(),
    p_to: dayEnd.toISOString(),
  });
  const busy = await mergeGoogleBusyForToken({
    token,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    existing: normalizeBusyRanges(busyData),
  });

  const slots = slotsForDay({
    ymd: date,
    timeZone,
    durationMinutes: link.duration_minutes,
    intervalMinutes: link.slot_interval_minutes,
    availability: link.availability || [],
    busy,
  });

  return NextResponse.json({
    link: linkPayload,
    date,
    slots,
  });
}
