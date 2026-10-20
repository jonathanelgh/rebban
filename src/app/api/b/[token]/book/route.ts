import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  availableSlotsForDay,
  normalizeBusyRanges,
  type AvailabilityRule,
} from "@/lib/booking/slots";
import { mergeGoogleBusyForToken } from "@/lib/booking/google-calendar";
import { fulfillBookingAfterCreate } from "@/lib/booking/fulfill";
import { addDaysYmd, getZonedParts, zonedLocalToUtc } from "@/lib/booking/timezone";

type PublicLink = {
  duration_minutes: number;
  timezone: string;
  slot_interval_minutes: number;
  availability: AvailabilityRule[];
  title: string;
  location_type?: "in_person" | "online" | null;
  online_provider?: "google_meet" | "zoom" | null;
  location_details?: string | null;
  host?: { id?: string | null; name?: string | null } | null;
  organization?: { name?: string | null } | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    starts_at?: string;
    guest_name?: string;
    guest_email?: string;
    guest_notes?: string;
    guest_timezone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const startsAt = body.starts_at ? new Date(body.starts_at) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "Start time is required" }, { status: 400 });
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
  const ymd = getZonedParts(startsAt, timeZone).date;

  const dayStart = zonedLocalToUtc(ymd, "00:00", timeZone);
  const dayEnd = zonedLocalToUtc(addDaysYmd(ymd, 1), "00:00", timeZone);

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

  const open = availableSlotsForDay({
    ymd,
    timeZone,
    durationMinutes: link.duration_minutes,
    intervalMinutes: link.slot_interval_minutes,
    availability: link.availability || [],
    busy,
  });

  const match = open.find(
    (s) => new Date(s.starts_at).getTime() === startsAt.getTime()
  );
  if (!match) {
    return NextResponse.json(
      { error: "That time is no longer available" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase.rpc("create_public_booking", {
    p_token: token,
    p_starts_at: startsAt.toISOString(),
    p_guest_name: body.guest_name || "",
    p_guest_email: body.guest_email || "",
    p_guest_notes: body.guest_notes || null,
  });

  if (error) {
    const message = error.message || "Could not create booking";
    const status = message.includes("no longer available") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const booking = data as {
    ok?: boolean;
    booking_id?: string;
    starts_at?: string;
    ends_at?: string;
    title?: string;
    duration_minutes?: number;
    created_by?: string | null;
    location_type?: "in_person" | "online" | null;
    online_provider?: "google_meet" | "zoom" | null;
    location_details?: string | null;
  };

  let meetingUrl: string | null = null;
  if (booking.booking_id && booking.starts_at && booking.ends_at) {
    try {
      const result = await fulfillBookingAfterCreate({
        token,
        hostUserId: booking.created_by || link.host?.id || null,
        bookingId: booking.booking_id,
        title: booking.title || link.title,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        durationMinutes: booking.duration_minutes || link.duration_minutes,
        timeZone,
        guestName: body.guest_name || "Guest",
        guestEmail: body.guest_email || "",
        guestNotes: body.guest_notes || null,
        locationType:
          booking.location_type || link.location_type || "online",
        onlineProvider:
          booking.online_provider ||
          link.online_provider ||
          "google_meet",
        locationDetails:
          booking.location_details || link.location_details || null,
        hostName: link.host?.name || null,
        organizationName: link.organization?.name || null,
        guestTimeZone: body.guest_timezone || null,
      });
      meetingUrl = result.meetingUrl;
    } catch (fulfillError) {
      console.error("[booking] fulfill failed", fulfillError);
    }
  }

  return NextResponse.json({
    ...booking,
    meeting_url: meetingUrl,
    location_type: link.location_type || "online",
    online_provider: link.online_provider || null,
    location_details: link.location_details || null,
  });
}
