import {
  emailDetailCard,
  escapeHtml,
  rebbanEmailLayout,
} from "@/lib/email/brand";
import { getResend, getFromEmail } from "@/lib/email/resend";
import { sendEmailViaGmail } from "@/lib/email/gmail";
import { sendEmailViaOutlook } from "@/lib/email/outlook";
import {
  resolveBookingEmailCopy,
  type BookingEmailKind,
  type BookingEmailSettings,
} from "@/lib/booking/email-templates";

export type { BookingEmailKind };

async function sendBookingHtmlEmail(options: {
  to: string;
  subject: string;
  html: string;
  fromUserId?: string | null;
  fromName?: string | null;
}) {
  // Prefer the host's connected mailbox (Gmail, then Outlook). Fall back to Resend.
  if (options.fromUserId) {
    try {
      const gmailResult = await sendEmailViaGmail({
        userId: options.fromUserId,
        to: options.to,
        subject: options.subject,
        html: options.html,
        fromName: options.fromName,
        useAdmin: true,
      });
      if (gmailResult) return gmailResult;
    } catch (error) {
      console.error(
        "[booking-email] Gmail send failed, trying Outlook/Resend",
        error
      );
    }

    try {
      const outlookResult = await sendEmailViaOutlook({
        userId: options.fromUserId,
        to: options.to,
        subject: options.subject,
        html: options.html,
        fromName: options.fromName,
        useAdmin: true,
      });
      if (outlookResult) return outlookResult;
    } catch (error) {
      console.error(
        "[booking-email] Outlook send failed, falling back to Resend",
        error
      );
    }
  }

  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
  if (error) throw new Error(error.message);
  return { provider: "resend" as const, id: data?.id || null };
}

function locationLabel(options: {
  locationType?: string | null;
  onlineProvider?: string | null;
  locationDetails?: string | null;
}) {
  if (options.locationType === "in_person") {
    return options.locationDetails?.trim() || "In person";
  }
  if (options.onlineProvider === "zoom") return "Zoom";
  if (options.onlineProvider === "google_meet") return "Google Meet";
  return "Online";
}

function bodyToHtml(body: string) {
  return escapeHtml(body).replace(/\n/g, "<br/>");
}

export async function sendBookingGuestEmail(options: {
  kind: BookingEmailKind;
  to: string;
  guestName: string;
  hostName?: string | null;
  organizationName?: string | null;
  title: string;
  whenLabel: string;
  timezone: string;
  locationType?: string | null;
  onlineProvider?: string | null;
  locationDetails?: string | null;
  meetingUrl?: string | null;
  fromUserId?: string | null;
  emailSettings?: Partial<BookingEmailSettings> | null;
}) {
  const host = options.hostName || options.organizationName || "your host";
  const where = locationLabel(options);
  const vars = {
    guest_name: options.guestName,
    host_name: host,
    title: options.title,
    when: options.whenLabel,
    timezone: options.timezone,
    where,
    meeting_url: options.meetingUrl || "",
    organization: options.organizationName || host,
  };

  const { subject, body } = resolveBookingEmailCopy(
    options.kind,
    options.emailSettings,
    vars
  );

  const bodyAlreadyHasLink =
    Boolean(options.meetingUrl) && body.includes(options.meetingUrl!);

  const meetingLine = options.meetingUrl
    ? bodyAlreadyHasLink
      ? ""
      : `<p style="margin:16px 0 0;">${
          options.kind === "reminder_1h"
            ? "Here's your meeting link again:"
            : "Join link:"
        } <a href="${escapeHtml(options.meetingUrl)}" style="color:#2563EB;text-decoration:underline;">${escapeHtml(options.meetingUrl)}</a></p>`
    : options.locationType === "in_person" && options.locationDetails
      ? `<p style="margin:16px 0 0;">Location: ${escapeHtml(options.locationDetails)}</p>`
      : "";

  const cta = options.meetingUrl
    ? {
        label:
          options.kind === "reminder_1h"
            ? options.onlineProvider === "zoom"
              ? "Join Zoom now"
              : options.onlineProvider === "google_meet"
                ? "Join Google Meet now"
                : "Join meeting now"
            : options.onlineProvider === "zoom"
              ? "Join Zoom"
              : options.onlineProvider === "google_meet"
                ? "Join Google Meet"
                : "Join meeting",
        url: options.meetingUrl,
      }
    : null;

  const html = rebbanEmailLayout({
    preheader: subject,
    title: subject,
    bodyHtml: `
      <p style="margin:0 0 12px;">${bodyToHtml(body)}</p>
      ${emailDetailCard([
        { label: "Meeting", value: options.title },
        { label: "When", value: `${options.whenLabel} (${options.timezone})` },
        { label: "Where", value: where },
      ])}
      ${meetingLine}
    `,
    cta,
    footerNote: "If you need to reschedule, reply to this email.",
  });

  return sendBookingHtmlEmail({
    to: options.to,
    subject,
    html,
    fromUserId: options.fromUserId,
    fromName: host,
  });
}

export async function sendBookingCancellationEmail(options: {
  to: string;
  guestName: string;
  hostName?: string | null;
  organizationName?: string | null;
  title: string;
  whenLabel: string;
  timezone: string;
  fromUserId?: string | null;
}) {
  const host = options.hostName || options.organizationName || "your host";
  const subject = `Cancelled: ${options.title}`;
  const html = rebbanEmailLayout({
    preheader: subject,
    title: subject,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(options.guestName)}, ${escapeHtml(host)} cancelled this meeting.</p>
      ${emailDetailCard([
        { label: "Meeting", value: options.title },
        { label: "When", value: `${options.whenLabel} (${options.timezone})` },
      ])}
      <p style="margin:16px 0 0;">If you still need to meet, reply to this email to reschedule.</p>
    `,
    footerNote: "No further action is needed if this cancellation was expected.",
  });

  return sendBookingHtmlEmail({
    to: options.to,
    subject,
    html,
    fromUserId: options.fromUserId,
    fromName: host,
  });
}

export async function sendBookingLinkInviteEmail(options: {
  to: string;
  guestName: string;
  hostName?: string | null;
  organizationName?: string | null;
  title: string;
  durationMinutes: number;
  bookingUrl: string;
  locationType?: string | null;
  onlineProvider?: string | null;
  locationDetails?: string | null;
  fromUserId?: string | null;
}) {
  const host = options.hostName || options.organizationName || "your host";
  const where = locationLabel(options);
  const subject = `Book a time: ${options.title}`;
  const html = rebbanEmailLayout({
    preheader: subject,
    title: subject,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(options.guestName)}, ${escapeHtml(host)} invited you to book a meeting.</p>
      ${emailDetailCard([
        { label: "Meeting", value: options.title },
        { label: "Duration", value: `${options.durationMinutes} minutes` },
        { label: "Where", value: where },
      ])}
      <p style="margin:16px 0 0;">Pick a time that works for you using the button below.</p>
    `,
    cta: { label: "Choose a time", url: options.bookingUrl },
    footerNote: "If the link doesn’t work, reply to this email.",
  });

  return sendBookingHtmlEmail({
    to: options.to,
    subject,
    html,
    fromUserId: options.fromUserId,
    fromName: host,
  });
}
