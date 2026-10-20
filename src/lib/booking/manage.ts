import { createClient } from "@/lib/supabase/server";
import {
  deleteGoogleCalendarEvent,
  resolveBookingCalendarUserId,
  updateGoogleCalendarEvent,
} from "@/lib/booking/google-calendar";
import { deleteZoomMeeting, updateZoomMeeting } from "@/lib/booking/zoom";
import {
  sendBookingCancellationEmail,
  sendBookingGuestEmail,
} from "@/lib/booking/emails";
import type { BookingEmailSettings } from "@/lib/booking/email-templates";
import { formatInZone } from "@/lib/booking/timezone";

export type ManagedBooking = {
  id: string;
  organization_id: string;
  booking_link_id: string | null;
  title: string | null;
  guest_name: string;
  guest_email: string;
  guest_notes: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  location_type: "in_person" | "online" | null;
  online_provider: "google_meet" | "zoom" | null;
  location_details: string | null;
  meeting_url: string | null;
  meeting_id: string | null;
  google_event_id: string | null;
};

const BOOKING_SELECT =
  "id, organization_id, booking_link_id, title, guest_name, guest_email, guest_notes, starts_at, ends_at, status, location_type, online_provider, location_details, meeting_url, meeting_id, google_event_id";

export async function getOrgBooking(
  organizationId: string,
  bookingId: string
): Promise<ManagedBooking | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as ManagedBooking | null) || null;
}

async function resolveHostContext(options: {
  organizationId: string;
  userId: string;
  bookingLinkId?: string | null;
}) {
  const supabase = await createClient();
  let preferredUserId = options.userId;
  if (options.bookingLinkId) {
    const { data: link } = await supabase
      .from("booking_links")
      .select("created_by")
      .eq("id", options.bookingLinkId)
      .maybeSingle();
    if (link?.created_by) preferredUserId = link.created_by;
  }

  const hostUserId = await resolveBookingCalendarUserId({
    organizationId: options.organizationId,
    preferredUserId,
  });

  const [{ data: profile }, { data: org }, { data: settings }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", options.userId)
        .maybeSingle(),
      supabase
        .from("organizations")
        .select("name")
        .eq("id", options.organizationId)
        .maybeSingle(),
      supabase
        .from("booking_settings")
        .select(
          "timezone, confirmation_email_subject, confirmation_email_body, reminder_1d_enabled, reminder_1d_subject, reminder_1d_body, reminder_1h_enabled, reminder_1h_subject, reminder_1h_body"
        )
        .eq("organization_id", options.organizationId)
        .maybeSingle(),
    ]);

  return {
    hostUserId: hostUserId || options.userId,
    hostName: profile?.full_name || null,
    organizationName: org?.name || null,
    timeZone: settings?.timezone || "Europe/Stockholm",
    emailSettings: settings as Partial<BookingEmailSettings> | null,
  };
}

function bookingTitle(booking: ManagedBooking) {
  return booking.title?.trim() || "Meeting";
}

export async function cancelOrgBooking(options: {
  organizationId: string;
  userId: string;
  booking: ManagedBooking;
  notifyGuest?: boolean;
}) {
  const supabase = await createClient();
  const ctx = await resolveHostContext({
    organizationId: options.organizationId,
    userId: options.userId,
    bookingLinkId: options.booking.booking_link_id,
  });

  if (options.booking.google_event_id && ctx.hostUserId) {
    try {
      await deleteGoogleCalendarEvent({
        userId: ctx.hostUserId,
        eventId: options.booking.google_event_id,
      });
    } catch (error) {
      console.error("[booking] cancel google event failed", error);
    }
  }

  if (
    options.booking.online_provider === "zoom" &&
    options.booking.meeting_id &&
    ctx.hostUserId
  ) {
    try {
      await deleteZoomMeeting({
        userId: ctx.hostUserId,
        meetingId: options.booking.meeting_id,
      });
    } catch (error) {
      console.error("[booking] cancel zoom meeting failed", error);
    }
  }

  const { error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.booking.id)
    .eq("organization_id", options.organizationId);

  if (error) throw new Error(error.message);

  if (options.notifyGuest !== false) {
    const whenLabel = formatInZone(options.booking.starts_at, ctx.timeZone, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    try {
      await sendBookingCancellationEmail({
        to: options.booking.guest_email,
        guestName: options.booking.guest_name,
        hostName: ctx.hostName,
        organizationName: ctx.organizationName,
        title: bookingTitle(options.booking),
        whenLabel,
        timezone: ctx.timeZone,
        fromUserId: ctx.hostUserId,
      });
    } catch (error) {
      console.error("[booking] cancellation email failed", error);
    }
  }
}

export async function resendOrgBookingInvite(options: {
  organizationId: string;
  userId: string;
  booking: ManagedBooking;
}) {
  if (options.booking.status !== "scheduled") {
    throw new Error("Only scheduled meetings can be resent");
  }

  const ctx = await resolveHostContext({
    organizationId: options.organizationId,
    userId: options.userId,
    bookingLinkId: options.booking.booking_link_id,
  });

  const whenLabel = formatInZone(options.booking.starts_at, ctx.timeZone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  await sendBookingGuestEmail({
    kind: "confirmation",
    to: options.booking.guest_email,
    guestName: options.booking.guest_name,
    hostName: ctx.hostName,
    organizationName: ctx.organizationName,
    fromUserId: ctx.hostUserId,
    title: bookingTitle(options.booking),
    whenLabel,
    timezone: ctx.timeZone,
    locationType: options.booking.location_type,
    onlineProvider: options.booking.online_provider,
    locationDetails: options.booking.location_details,
    meetingUrl: options.booking.meeting_url,
    emailSettings: ctx.emailSettings,
  });

  const supabase = await createClient();
  await supabase
    .from("bookings")
    .update({
      confirmation_email_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.booking.id);
}

export async function updateOrgBooking(options: {
  organizationId: string;
  userId: string;
  booking: ManagedBooking;
  patch: {
    title?: string;
    guest_name?: string;
    guest_email?: string;
    guest_notes?: string | null;
    starts_at?: string;
    ends_at?: string;
    location_details?: string | null;
  };
  notifyGuest?: boolean;
}): Promise<ManagedBooking> {
  if (options.booking.status !== "scheduled") {
    throw new Error("Only scheduled meetings can be edited");
  }

  const supabase = await createClient();
  const ctx = await resolveHostContext({
    organizationId: options.organizationId,
    userId: options.userId,
    bookingLinkId: options.booking.booking_link_id,
  });

  const next: ManagedBooking = {
    ...options.booking,
    title:
      options.patch.title !== undefined
        ? options.patch.title.trim() || null
        : options.booking.title,
    guest_name:
      options.patch.guest_name !== undefined
        ? options.patch.guest_name.trim()
        : options.booking.guest_name,
    guest_email:
      options.patch.guest_email !== undefined
        ? options.patch.guest_email.trim().toLowerCase()
        : options.booking.guest_email,
    guest_notes:
      options.patch.guest_notes !== undefined
        ? options.patch.guest_notes?.trim() || null
        : options.booking.guest_notes,
    starts_at: options.patch.starts_at || options.booking.starts_at,
    ends_at: options.patch.ends_at || options.booking.ends_at,
    location_details:
      options.patch.location_details !== undefined
        ? options.patch.location_details?.trim() || null
        : options.booking.location_details,
  };

  if (!next.guest_name) throw new Error("Name is required");
  if (!next.guest_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.guest_email)) {
    throw new Error("A valid email is required");
  }
  if (new Date(next.ends_at).getTime() <= new Date(next.starts_at).getTime()) {
    throw new Error("End time must be after start time");
  }

  const timeChanged =
    next.starts_at !== options.booking.starts_at ||
    next.ends_at !== options.booking.ends_at;
  const durationMinutes = Math.max(
    1,
    Math.round(
      (new Date(next.ends_at).getTime() - new Date(next.starts_at).getTime()) /
        60_000
    )
  );
  const summary = `${bookingTitle(next)} with ${next.guest_name}`;

  if (ctx.hostUserId && next.google_event_id) {
    try {
      await updateGoogleCalendarEvent({
        userId: ctx.hostUserId,
        eventId: next.google_event_id,
        summary,
        description: [
          next.guest_notes,
          next.online_provider === "zoom" && next.meeting_url
            ? `Zoom: ${next.meeting_url}`
            : null,
        ]
          .filter(Boolean)
          .join("\n") || null,
        startsAt: next.starts_at,
        endsAt: next.ends_at,
        timeZone: ctx.timeZone,
        attendeeEmail: next.guest_email,
        attendeeName: next.guest_name,
        location:
          next.location_type === "in_person"
            ? next.location_details
            : next.meeting_url,
      });
    } catch (error) {
      console.error("[booking] update google event failed", error);
    }
  }

  if (
    ctx.hostUserId &&
    next.online_provider === "zoom" &&
    next.meeting_id
  ) {
    try {
      await updateZoomMeeting({
        userId: ctx.hostUserId,
        meetingId: next.meeting_id,
        topic: summary,
        startsAt: next.starts_at,
        durationMinutes,
        agenda: next.guest_notes,
        timeZone: ctx.timeZone,
      });
    } catch (error) {
      console.error("[booking] update zoom meeting failed", error);
    }
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({
      title: next.title,
      guest_name: next.guest_name,
      guest_email: next.guest_email,
      guest_notes: next.guest_notes,
      starts_at: next.starts_at,
      ends_at: next.ends_at,
      location_details: next.location_details,
      updated_at: new Date().toISOString(),
      ...(timeChanged
        ? { reminder_1d_sent_at: null, reminder_1h_sent_at: null }
        : {}),
    })
    .eq("id", next.id)
    .eq("organization_id", options.organizationId)
    .select(BOOKING_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not update meeting");
  }

  const updated = data as ManagedBooking;

  if (options.notifyGuest) {
    const whenLabel = formatInZone(updated.starts_at, ctx.timeZone, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    try {
      await sendBookingGuestEmail({
        kind: "confirmation",
        to: updated.guest_email,
        guestName: updated.guest_name,
        hostName: ctx.hostName,
        organizationName: ctx.organizationName,
        fromUserId: ctx.hostUserId,
        title: bookingTitle(updated),
        whenLabel,
        timezone: ctx.timeZone,
        locationType: updated.location_type,
        onlineProvider: updated.online_provider,
        locationDetails: updated.location_details,
        meetingUrl: updated.meeting_url,
        emailSettings: ctx.emailSettings,
      });
      await supabase
        .from("bookings")
        .update({
          confirmation_email_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", updated.id);
    } catch (error) {
      console.error("[booking] update notify email failed", error);
    }
  }

  return updated;
}
