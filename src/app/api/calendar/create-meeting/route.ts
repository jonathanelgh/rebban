import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { fulfillBookingAfterCreate } from "@/lib/booking/fulfill";
import { DURATION_OPTIONS } from "@/lib/booking/slots";
import { zonedLocalToUtc } from "@/lib/booking/timezone";

type LocationType = "in_person" | "online";
type OnlineProvider = "google_meet" | "zoom";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireOrgEntitlement(supabase, user.id);
  if ("response" in gate) return gate.response;
  const { organizationId } = gate;

  let body: {
    guest_name?: string;
    guest_email?: string;
    guest_notes?: string;
    title?: string;
    date?: string;
    time?: string;
    duration_minutes?: number;
    location_type?: LocationType;
    online_provider?: OnlineProvider | null;
    location_details?: string | null;
    booking_link_id?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const guestName = (body.guest_name || "").trim();
  const guestEmail = (body.guest_email || "").trim().toLowerCase();
  const title = (body.title || "").trim();
  const date = (body.date || "").trim();
  const time = (body.time || "").trim();
  const durationMinutes = Number(body.duration_minutes) || 30;
  const locationType: LocationType =
    body.location_type === "in_person" ? "in_person" : "online";
  const onlineProvider: OnlineProvider | null =
    locationType === "online"
      ? body.online_provider === "zoom"
        ? "zoom"
        : "google_meet"
      : null;

  if (!guestName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 }
    );
  }
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json(
      { error: "Date and time are required" },
      { status: 400 }
    );
  }
  if (!(DURATION_OPTIONS as readonly number[]).includes(durationMinutes)) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("timezone")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const timeZone = settings?.timezone || "Europe/Stockholm";

  const startsAt = zonedLocalToUtc(date, time, timeZone);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "Invalid date or time" }, { status: 400 });
  }
  if (startsAt.getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { error: "That time is in the past" },
      { status: 400 }
    );
  }
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  let bookingLinkId: string | null = body.booking_link_id || null;
  if (bookingLinkId) {
    const { data: link } = await supabase
      .from("booking_links")
      .select("id")
      .eq("id", bookingLinkId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!link) bookingLinkId = null;
  }

  const { data: booking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      organization_id: organizationId,
      booking_link_id: bookingLinkId,
      title,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      guest_name: guestName,
      guest_email: guestEmail,
      guest_notes: (body.guest_notes || "").trim() || null,
      status: "scheduled",
      location_type: locationType,
      online_provider: onlineProvider,
      location_details:
        locationType === "in_person"
          ? (body.location_details || "").trim() || null
          : null,
    })
    .select(
      "id, starts_at, ends_at, guest_name, guest_email, guest_notes, status, booking_link_id, title"
    )
    .single();

  if (insertError || !booking) {
    const message = insertError?.message || "Could not create meeting";
    const status = message.includes("no longer available") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  let meetingUrl: string | null = null;
  try {
    const result = await fulfillBookingAfterCreate({
      hostUserId: user.id,
      bookingId: booking.id,
      title,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      durationMinutes,
      timeZone,
      guestName,
      guestEmail,
      guestNotes: booking.guest_notes,
      locationType,
      onlineProvider,
      locationDetails:
        locationType === "in_person"
          ? (body.location_details || "").trim() || null
          : null,
    });
    meetingUrl = result.meetingUrl;
  } catch (error) {
    console.error("[calendar] create meeting fulfill failed", error);
  }

  return NextResponse.json({
    ok: true,
    booking,
    meeting_url: meetingUrl,
  });
}
