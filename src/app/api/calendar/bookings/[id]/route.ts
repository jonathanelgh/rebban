import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { DURATION_OPTIONS } from "@/lib/booking/slots";
import { zonedLocalToUtc } from "@/lib/booking/timezone";
import {
  getOrgBooking,
  updateOrgBooking,
} from "@/lib/booking/manage";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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
    title?: string;
    guest_name?: string;
    guest_email?: string;
    guest_notes?: string | null;
    date?: string;
    time?: string;
    duration_minutes?: number;
    location_details?: string | null;
    notify_guest?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const booking = await getOrgBooking(organizationId, id);
  if (!booking) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("timezone")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const timeZone = settings?.timezone || "Europe/Stockholm";

  const patch: {
    title?: string;
    guest_name?: string;
    guest_email?: string;
    guest_notes?: string | null;
    starts_at?: string;
    ends_at?: string;
    location_details?: string | null;
  } = {};

  if (body.title !== undefined) patch.title = body.title;
  if (body.guest_name !== undefined) patch.guest_name = body.guest_name;
  if (body.guest_email !== undefined) patch.guest_email = body.guest_email;
  if (body.guest_notes !== undefined) patch.guest_notes = body.guest_notes;
  if (body.location_details !== undefined) {
    patch.location_details = body.location_details;
  }

  const date = (body.date || "").trim();
  const time = (body.time || "").trim();
  if (date || time || body.duration_minutes !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return NextResponse.json(
        { error: "Date and time are required" },
        { status: 400 }
      );
    }
    const durationMinutes =
      Number(body.duration_minutes) ||
      Math.max(
        15,
        Math.round(
          (new Date(booking.ends_at).getTime() -
            new Date(booking.starts_at).getTime()) /
            60_000
        )
      );
    if (!(DURATION_OPTIONS as readonly number[]).includes(durationMinutes)) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
    }
    const startsAt = zonedLocalToUtc(date, time, timeZone);
    if (Number.isNaN(startsAt.getTime())) {
      return NextResponse.json(
        { error: "Invalid date or time" },
        { status: 400 }
      );
    }
    patch.starts_at = startsAt.toISOString();
    patch.ends_at = new Date(
      startsAt.getTime() + durationMinutes * 60_000
    ).toISOString();
  }

  try {
    const updated = await updateOrgBooking({
      organizationId,
      userId: user.id,
      booking,
      patch,
      notifyGuest: Boolean(body.notify_guest),
    });
    return NextResponse.json({ ok: true, booking: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update meeting";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
