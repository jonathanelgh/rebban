import { createAdminClient } from "@/lib/supabase/admin";
import {
  createGoogleCalendarEvent,
  getHostUserIdForBookingToken,
  resolveBookingCalendarUserId,
} from "@/lib/booking/google-calendar";
import { createZoomMeeting } from "@/lib/booking/zoom";
import { sendBookingGuestEmail } from "@/lib/booking/emails";
import type { BookingEmailSettings } from "@/lib/booking/email-templates";
import { formatInZone } from "@/lib/booking/timezone";

export type BookingFulfillInput = {
  /** Public booking token — used to resolve host when hostUserId is omitted. */
  token?: string | null;
  /** Prefer passing the authenticated host when creating from the calendar UI. */
  hostUserId?: string | null;
  organizationId?: string | null;
  bookingId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  timeZone: string;
  guestName: string;
  guestEmail: string;
  guestNotes?: string | null;
  locationType: "in_person" | "online" | null;
  onlineProvider: "google_meet" | "zoom" | null;
  locationDetails?: string | null;
  hostName?: string | null;
  organizationName?: string | null;
  /** Guest's timezone for confirmation email wording (falls back to host). */
  guestTimeZone?: string | null;
};

function tryAdmin() {
  try {
    return createAdminClient();
  } catch (error) {
    console.error(
      "[booking] admin client unavailable — Meet/calendar sync and mailbox send need SUPABASE_SERVICE_ROLE_KEY",
      error
    );
    return null;
  }
}

export async function fulfillBookingAfterCreate(input: BookingFulfillInput) {
  const admin = tryAdmin();

  let hostUserId =
    input.hostUserId ||
    (input.token ? await getHostUserIdForBookingToken(input.token) : null);

  if (!hostUserId && input.organizationId && admin) {
    hostUserId = await resolveBookingCalendarUserId({
      organizationId: input.organizationId,
      preferredUserId: input.hostUserId,
    });
  }

  let meetingUrl: string | null = null;
  let meetingId: string | null = null;
  let googleEventId: string | null = null;

  const summary = `${input.title} with ${input.guestName}`;
  const description = input.guestNotes || undefined;

  if (hostUserId) {
    try {
      if (input.locationType === "online" && input.onlineProvider === "zoom") {
        const zoom = await createZoomMeeting({
          userId: hostUserId,
          topic: summary,
          startsAt: input.startsAt,
          durationMinutes: input.durationMinutes,
          agenda: description,
          timeZone: input.timeZone,
        });
        if (zoom) {
          meetingUrl = zoom.joinUrl;
          meetingId = zoom.meetingId;
        }
        const cal = await createGoogleCalendarEvent({
          userId: hostUserId,
          summary,
          description: [
            description,
            meetingUrl ? `Zoom: ${meetingUrl}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timeZone: input.timeZone,
          attendeeEmail: input.guestEmail,
          attendeeName: input.guestName,
          location: meetingUrl,
          createGoogleMeet: false,
        });
        googleEventId = cal?.eventId || null;
      } else if (
        input.locationType === "online" &&
        input.onlineProvider === "google_meet"
      ) {
        const cal = await createGoogleCalendarEvent({
          userId: hostUserId,
          summary,
          description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timeZone: input.timeZone,
          attendeeEmail: input.guestEmail,
          attendeeName: input.guestName,
          createGoogleMeet: true,
        });
        googleEventId = cal?.eventId || null;
        meetingUrl = cal?.meetUrl || null;
        meetingId = cal?.eventId || null;
        if (!meetingUrl) {
          console.error(
            "[booking] Google Meet link missing after calendar event create",
            { bookingId: input.bookingId, eventId: googleEventId }
          );
        }
      } else {
        const cal = await createGoogleCalendarEvent({
          userId: hostUserId,
          summary,
          description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timeZone: input.timeZone,
          attendeeEmail: input.guestEmail,
          attendeeName: input.guestName,
          location: input.locationDetails || null,
          createGoogleMeet: false,
        });
        googleEventId = cal?.eventId || null;
      }
    } catch (error) {
      console.error("[booking] meeting/calendar provision failed", error);
    }
  } else {
    console.error(
      "[booking] no host user resolved — cannot create Meet/Zoom or send from mailbox",
      { bookingId: input.bookingId, token: input.token }
    );
  }

  if (admin) {
    const { error: updateError } = await admin
      .from("bookings")
      .update({
        location_type: input.locationType,
        online_provider: input.onlineProvider,
        location_details: input.locationDetails || null,
        meeting_url: meetingUrl,
        meeting_id: meetingId,
        google_event_id: googleEventId,
        title: input.title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.bookingId);
    if (updateError) {
      console.error("[booking] failed to persist meeting fields", updateError);
    }
  }

  const emailTimeZone =
    input.guestTimeZone?.trim() || input.timeZone;
  const whenLabel = formatInZone(input.startsAt, emailTimeZone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  let emailSettings: Partial<BookingEmailSettings> | null = null;

  if (admin) {
    const orgId =
      input.organizationId ||
      (
        await admin
          .from("bookings")
          .select("organization_id")
          .eq("id", input.bookingId)
          .maybeSingle()
      ).data?.organization_id;
    if (orgId) {
      const { data } = await admin
        .from("booking_settings")
        .select(
          "confirmation_email_subject, confirmation_email_body, reminder_1d_enabled, reminder_1d_subject, reminder_1d_body, reminder_1h_enabled, reminder_1h_subject, reminder_1h_body"
        )
        .eq("organization_id", orgId)
        .maybeSingle();
      emailSettings = data;
    }
  }

  let confirmationSent = false;
  try {
    await sendBookingGuestEmail({
      kind: "confirmation",
      to: input.guestEmail,
      guestName: input.guestName,
      hostName: input.hostName,
      organizationName: input.organizationName,
      fromUserId: hostUserId,
      title: input.title,
      whenLabel,
      timezone: emailTimeZone,
      locationType: input.locationType,
      onlineProvider: input.onlineProvider,
      locationDetails: input.locationDetails,
      meetingUrl,
      emailSettings,
    });
    confirmationSent = true;
  } catch (error) {
    console.error("[booking] confirmation email failed", error);
  }

  if (admin && confirmationSent) {
    await admin
      .from("bookings")
      .update({
        confirmation_email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.bookingId);
  }

  return { meetingUrl, meetingId, googleEventId };
}
