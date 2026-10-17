import {
  emailDetailCard,
  escapeHtml,
  rebbanEmailLayout,
} from "@/lib/email/brand";
import { getAppUrl, getFromEmail, getResend } from "@/lib/email/resend";
import { formatTicketRef } from "@/lib/support/tickets";

function supportNotifyEmail() {
  return (
    process.env.SUPPORT_NOTIFY_EMAIL?.trim() ||
    process.env.SUPPORT_EMAIL?.trim() ||
    "jonathan@rebban.com"
  );
}

async function sendResendHtml(options: {
  to: string;
  subject: string;
  html: string;
}) {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
  if (error) throw new Error(error.message);
  return { id: data?.id || null };
}

export async function sendSupportEscalationEmails(options: {
  ticketNumber: number;
  ticketId: string;
  subject: string;
  reason: string;
  requesterEmail?: string | null;
  requesterName?: string | null;
  organizationName?: string | null;
  slaDueAt: string;
}) {
  const ref = formatTicketRef(options.ticketNumber);
  const adminUrl = `${getAppUrl()}/admin/support/${options.ticketId}`;
  const due = new Date(options.slaDueAt);
  const dueLabel = Number.isNaN(due.getTime())
    ? "within 24 hours"
    : due.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

  const notifyTo = supportNotifyEmail();
  await sendResendHtml({
    to: notifyTo,
    subject: `[Support] ${ref} escalated: ${options.subject}`,
    html: rebbanEmailLayout({
      title: `Ticket ${ref} needs a human`,
      preheader: options.reason.slice(0, 120),
      bodyHtml: `
        <p style="margin:0 0 16px;">A conversation was escalated from AI support.</p>
        ${emailDetailCard([
          { label: "Ticket", value: ref },
          { label: "Subject", value: options.subject },
          {
            label: "Requester",
            value:
              [options.requesterName, options.requesterEmail]
                .filter(Boolean)
                .join(" · ") || "Unknown",
          },
          {
            label: "Workspace",
            value: options.organizationName || "—",
          },
          { label: "Reason", value: options.reason },
          { label: "SLA", value: `Reply by ${dueLabel}` },
        ])}
      `,
      cta: { label: "Open ticket", url: adminUrl },
      footerNote: "Platform admin support inbox",
    }),
  });

  if (options.requesterEmail) {
    const first =
      options.requesterName?.trim().split(/\s+/)[0] || "there";
    await sendResendHtml({
      to: options.requesterEmail,
      subject: `We're on it · ${ref}`,
      html: rebbanEmailLayout({
        title: "A human will follow up",
        preheader: `We'll reply within 24 hours (${ref})`,
        bodyHtml: `
          <p style="margin:0 0 12px;">Hi ${escapeHtml(first)},</p>
          <p style="margin:0 0 12px;">
            Your support chat was escalated to a human agent. We'll email you
            within <strong>24 hours</strong> (by ${escapeHtml(dueLabel)}).
          </p>
          <p style="margin:0;">
            Ticket reference: <strong>${escapeHtml(ref)}</strong>
          </p>
        `,
        footerNote: "You can also keep chatting in the Rebban app.",
      }),
    });
  }
}

export async function sendSupportHumanReplyEmail(options: {
  ticketNumber: number;
  ticketId: string;
  subject: string;
  replyBody: string;
  requesterEmail: string;
  requesterName?: string | null;
}) {
  const ref = formatTicketRef(options.ticketNumber);
  const first =
    options.requesterName?.trim().split(/\s+/)[0] || "there";
  const appUrl = getAppUrl();

  await sendResendHtml({
    to: options.requesterEmail,
    subject: `Re: ${options.subject} · ${ref}`,
    html: rebbanEmailLayout({
      title: `Reply on ${ref}`,
      preheader: options.replyBody.slice(0, 120),
      bodyHtml: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(first)},</p>
        <p style="margin:0 0 16px;">A human agent replied to your support ticket:</p>
        <div style="margin:0 0 16px;padding:14px 16px;background:#F3F4F6;border-radius:12px;white-space:pre-wrap;font-size:14px;line-height:1.55;color:#1A1D23;">
${escapeHtml(options.replyBody)}
        </div>
        <p style="margin:0;font-size:13px;color:#6B7280;">
          You can continue the conversation in the Rebban support chat.
        </p>
      `,
      cta: { label: "Open Rebban", url: appUrl },
      footerNote: `Ticket ${ref}`,
    }),
  });
}
