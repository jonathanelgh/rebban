import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingGuestEmail } from "@/lib/booking/emails";
import { isBookingReminderEnabled } from "@/lib/booking/email-templates";
import { formatInZone } from "@/lib/booking/timezone";

export const runtime = "nodejs";

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const querySecret = new URL(request.url).searchParams.get("secret");
  return bearer === secret || querySecret === secret;
}

async function processReminders() {
  const supabase = createAdminClient();
  const now = Date.now();
  const in25h = new Date(now + 25 * 60 * 60 * 1000).toISOString();
  const in23h = new Date(now + 23 * 60 * 60 * 1000).toISOString();
  const in70m = new Date(now + 70 * 60 * 1000).toISOString();
  const in50m = new Date(now + 50 * 60 * 1000).toISOString();

  const [{ data: dayRows }, { data: hourRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, guest_name, guest_email, starts_at, ends_at, meeting_url, location_type, online_provider, location_details, booking_link_id, organization_id, title"
      )
      .eq("status", "scheduled")
      .is("reminder_1d_sent_at", null)
      .gte("starts_at", in23h)
      .lte("starts_at", in25h)
      .limit(40),
    supabase
      .from("bookings")
      .select(
        "id, guest_name, guest_email, starts_at, ends_at, meeting_url, location_type, online_provider, location_details, booking_link_id, organization_id, title"
      )
      .eq("status", "scheduled")
      .is("reminder_1h_sent_at", null)
      .gte("starts_at", in50m)
      .lte("starts_at", in70m)
      .limit(40),
  ]);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  async function sendFor(
    row: NonNullable<typeof dayRows>[number],
    kind: "reminder_1d" | "reminder_1h"
  ) {
    const [{ data: link }, { data: settings }, { data: org }] =
      await Promise.all([
        row.booking_link_id
          ? supabase
              .from("booking_links")
              .select("title, created_by")
              .eq("id", row.booking_link_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("booking_settings")
          .select(
            "timezone, confirmation_email_subject, confirmation_email_body, reminder_1d_enabled, reminder_1d_subject, reminder_1d_body, reminder_1h_enabled, reminder_1h_subject, reminder_1h_body"
          )
          .eq("organization_id", row.organization_id)
          .maybeSingle(),
        supabase
          .from("organizations")
          .select("name")
          .eq("id", row.organization_id)
          .maybeSingle(),
      ]);

    if (!isBookingReminderEnabled(kind, settings)) {
      // Mark as sent so we don't keep retrying disabled reminders.
      const stamp = new Date().toISOString();
      await supabase
        .from("bookings")
        .update(
          kind === "reminder_1d"
            ? { reminder_1d_sent_at: stamp, updated_at: stamp }
            : { reminder_1h_sent_at: stamp, updated_at: stamp }
        )
        .eq("id", row.id);
      skipped += 1;
      return;
    }

    const timeZone = settings?.timezone || "Europe/Stockholm";
    const whenLabel = formatInZone(row.starts_at, timeZone, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    let hostName: string | null = null;
    if (link?.created_by) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", link.created_by)
        .maybeSingle();
      hostName = profile?.full_name || null;
    }

    try {
      await sendBookingGuestEmail({
        kind,
        to: row.guest_email,
        guestName: row.guest_name,
        hostName,
        organizationName: org?.name || null,
        title: row.title || link?.title || "Meeting",
        whenLabel,
        timezone: timeZone,
        locationType: row.location_type,
        onlineProvider: row.online_provider,
        locationDetails: row.location_details,
        meetingUrl: row.meeting_url,
        fromUserId: link?.created_by || null,
        emailSettings: settings,
      });

      const stamp = new Date().toISOString();
      await supabase
        .from("bookings")
        .update(
          kind === "reminder_1d"
            ? { reminder_1d_sent_at: stamp, updated_at: stamp }
            : { reminder_1h_sent_at: stamp, updated_at: stamp }
        )
        .eq("id", row.id);
      sent += 1;
    } catch (error) {
      console.error(`[booking-reminders] ${kind} failed`, row.id, error);
      failed += 1;
    }
  }

  for (const row of dayRows || []) {
    await sendFor(row, "reminder_1d");
  }
  for (const row of hourRows || []) {
    await sendFor(row, "reminder_1h");
  }

  return {
    sent,
    failed,
    skipped,
    day: dayRows?.length || 0,
    hour: hourRows?.length || 0,
  };
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
