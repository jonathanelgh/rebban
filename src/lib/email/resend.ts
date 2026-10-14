import { Resend } from "resend";
import {
  emailDetailCard,
  escapeHtml as brandEscapeHtml,
  rebbanEmailLayout,
} from "@/lib/email/brand";
import {
  getGmailConnectionStatus,
  sendEmailViaGmail,
} from "@/lib/email/gmail";
import { DEFAULT_INVOICE_SEND_MESSAGE } from "@/lib/invoices/send";

export function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local to send proposal emails."
    );
  }
  return new Resend(key);
}

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

async function sendHtmlEmail(options: {
  to: string;
  subject: string;
  html: string;
  fromUserId?: string | null;
  fromName?: string | null;
  useAdmin?: boolean;
  /** When set, always send via Resend (Gmail MIME path has no attachments yet). */
  attachments?: EmailAttachment[];
}) {
  const hasAttachments = Boolean(options.attachments?.length);

  if (options.fromUserId && !hasAttachments) {
    const gmailResult = await sendEmailViaGmail({
      userId: options.fromUserId,
      to: options.to,
      subject: options.subject,
      html: options.html,
      fromName: options.fromName,
      useAdmin: options.useAdmin,
    });
    // null = not connected → fall back to Resend
    // throw = connected but broken → surface to user (no silent Resend)
    if (gmailResult) return gmailResult;
  }

  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments?.map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
    })),
  });
  if (error) throw new Error(error.message);
  return { provider: "resend" as const, id: data?.id || null, from: getFromEmail() };
}

export function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL || "Rebban <onboarding@resend.dev>";
}

function firstName(full?: string | null) {
  const value = full?.trim();
  if (!value || value.includes("@")) return null;
  const token = value.split(/\s+/)[0];
  return token || null;
}

export async function sendProposalInviteEmail(options: {
  to: string;
  recipientName?: string | null;
  senderName?: string | null;
  organizationName: string;
  proposalTitle: string;
  proposalUrl: string;
  message?: string | null;
  fromUserId?: string | null;
}) {
  const recipientFirst = firstName(options.recipientName);
  const senderFirst = firstName(options.senderName);
  const title = options.proposalTitle?.trim() || "your project";

  const gmail =
    options.fromUserId
      ? await getGmailConnectionStatus(options.fromUserId)
      : null;
  const fromGmail = Boolean(gmail?.canSend);

  if (fromGmail) {
    const greeting = recipientFirst ? `Hi ${recipientFirst},` : "Hi,";
    const note = options.message?.trim();
    const signOff = senderFirst || options.senderName?.trim() || "Thanks";
    const subject = recipientFirst
      ? `${recipientFirst}, here's a proposal for ${title}`
      : `Here's a proposal for ${title}`;
    const body = note
      ? note
      : `I put together a proposal for ${title}. Take a look when you have a moment. Happy to walk through any questions.`;

    const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.55;color:#111827;max-width:540px;margin:0 auto;padding:8px 0;">
    <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(body)}</p>
    <p style="margin:24px 0;">
      <a href="${options.proposalUrl}" style="color:#1d4ed8;font-weight:600;">
        Open the proposal →
      </a>
    </p>
    <p style="margin:28px 0 0;">
      Best,<br/>
      ${escapeHtml(signOff)}
    </p>
  </div>`;

    return sendHtmlEmail({
      to: options.to,
      subject,
      html,
      fromUserId: options.fromUserId,
      fromName: options.senderName,
    });
  }

  const greeting = recipientFirst ? `Hi ${recipientFirst},` : "Hi,";
  const fromLine = options.senderName?.trim()
    ? `${options.senderName.trim()} at ${options.organizationName}`
    : options.organizationName;

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
    <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;">${escapeHtml(fromLine)} sent you a proposal${
      options.proposalTitle ? `: <strong>${escapeHtml(options.proposalTitle)}</strong>` : "."
    }</p>
    ${
      options.message
        ? `<p style="margin:0 0 16px;padding:12px 14px;background:#F9FAFB;border-radius:12px;">${escapeHtml(options.message)}</p>`
        : ""
    }
    <p style="margin:24px 0;">
      <a href="${options.proposalUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">
        View proposal
      </a>
    </p>
    <p style="margin:24px 0 0;font-size:13px;color:#6B7280;">
      Or open this link: <a href="${options.proposalUrl}" style="color:#2563EB;">${options.proposalUrl}</a>
    </p>
  </div>`;

  return sendHtmlEmail({
    to: options.to,
    subject: `Proposal: ${options.proposalTitle}`,
    html,
    fromUserId: options.fromUserId,
    fromName: options.senderName,
  });
}

export async function sendInvoiceInviteEmail(options: {
  to: string;
  recipientName?: string | null;
  senderName?: string | null;
  organizationName: string;
  invoiceNumber?: string | null;
  invoiceUrl: string;
  amountLabel?: string | null;
  message?: string | null;
  fromUserId?: string | null;
}) {
  const recipientFirst = firstName(options.recipientName);
  const senderFirst = firstName(options.senderName);
  const invoiceLabel = options.invoiceNumber?.trim()
    ? `Invoice ${options.invoiceNumber.trim()}`
    : "your invoice";

  const gmail = options.fromUserId
    ? await getGmailConnectionStatus(options.fromUserId)
    : null;
  const fromGmail = Boolean(gmail?.canSend);

  if (fromGmail) {
    const greeting = recipientFirst ? `Hi ${recipientFirst},` : "Hi,";
    const note = options.message?.trim() || DEFAULT_INVOICE_SEND_MESSAGE;
    const signOff = senderFirst || options.senderName?.trim() || "Thanks";
    const subject = recipientFirst
      ? `${recipientFirst}, here's ${invoiceLabel}`
      : `Here's ${invoiceLabel}`;

    const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.55;color:#111827;max-width:540px;margin:0 auto;padding:8px 0;">
    <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(note)}</p>
    ${
      options.amountLabel
        ? `<p style="margin:0 0 16px;">Amount due: <strong>${escapeHtml(options.amountLabel)}</strong></p>`
        : ""
    }
    <p style="margin:24px 0;">
      <a href="${options.invoiceUrl}" style="color:#1d4ed8;font-weight:600;">
        View &amp; pay invoice →
      </a>
    </p>
    <p style="margin:28px 0 0;">
      Best,<br/>
      ${escapeHtml(signOff)}
    </p>
  </div>`;

    return sendHtmlEmail({
      to: options.to,
      subject,
      html,
      fromUserId: options.fromUserId,
      fromName: options.senderName,
    });
  }

  const greeting = recipientFirst ? `Hi ${recipientFirst},` : "Hi,";
  const fromLine = options.senderName?.trim()
    ? `${options.senderName.trim()} at ${options.organizationName}`
    : options.organizationName;

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
    <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;">${escapeHtml(fromLine)} sent you ${escapeHtml(invoiceLabel)}.</p>
    ${
      options.amountLabel
        ? `<p style="margin:0 0 16px;">Amount due: <strong>${escapeHtml(options.amountLabel)}</strong></p>`
        : ""
    }
    ${
      options.message
        ? `<p style="margin:0 0 16px;padding:12px 14px;background:#F9FAFB;border-radius:12px;white-space:pre-wrap;">${escapeHtml(options.message)}</p>`
        : ""
    }
    <p style="margin:24px 0;">
      <a href="${options.invoiceUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">
        View &amp; pay invoice
      </a>
    </p>
    <p style="margin:24px 0 0;font-size:13px;color:#6B7280;">
      Or open this link: <a href="${options.invoiceUrl}" style="color:#2563EB;">${options.invoiceUrl}</a>
    </p>
  </div>`;

  return sendHtmlEmail({
    to: options.to,
    subject: invoiceLabel,
    html,
    fromUserId: options.fromUserId,
    fromName: options.senderName,
  });
}

export async function sendProposalAcceptedEmail(options: {
  to: string;
  freelancerName?: string | null;
  signerName: string;
  signerEmail: string;
  proposalTitle: string;
  organizationName: string;
  amountLabel?: string | null;
  signedAt: string;
  documentHash: string;
  proposalUrl: string;
}) {
  const resend = getResend();
  const greeting = options.freelancerName?.trim()
    ? `Hi ${options.freelancerName.trim()},`
    : "Hi,";

  const html = `
  <div style="font-family:Inter,system-ui,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">
      <strong>${escapeHtml(options.signerName)}</strong> (${escapeHtml(options.signerEmail)})
      accepted and e-signed <strong>${escapeHtml(options.proposalTitle)}</strong>.
    </p>
    ${
      options.amountLabel
        ? `<p style="margin:0 0 16px;">Amount: <strong>${escapeHtml(options.amountLabel)}</strong></p>`
        : ""
    }
    <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">Signed at: ${escapeHtml(options.signedAt)}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6B7280;">Document hash: ${escapeHtml(options.documentHash)}</p>
    <p style="margin:24px 0;">
      <a href="${options.proposalUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">
        Open proposal
      </a>
    </p>
  </div>`;

  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: options.to,
    subject: `Signed: ${options.proposalTitle}`,
    html,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function sendInvoicePaidFreelancerEmail(options: {
  to: string;
  freelancerName?: string | null;
  clientName?: string | null;
  invoiceNumber?: string | null;
  amountLabel: string;
  paidAtLabel: string;
  invoiceUrl: string;
}) {
  const esc = brandEscapeHtml;
  const freelancerFirst = firstName(options.freelancerName);
  const greeting = freelancerFirst ? `Hi ${freelancerFirst},` : "Hi,";
  const invoiceLabel = options.invoiceNumber?.trim()
    ? `Invoice ${options.invoiceNumber.trim()}`
    : "Your invoice";
  const clientLabel = options.clientName?.trim() || "your client";

  const bodyHtml = `
    <p style="margin:0 0 12px;">${esc(greeting)}</p>
    <p style="margin:0;">
      Great news — <strong>${esc(clientLabel)}</strong> just paid
      <strong>${esc(invoiceLabel)}</strong>.
    </p>
    ${emailDetailCard([
      { label: "Amount", value: options.amountLabel },
      { label: "Paid", value: options.paidAtLabel },
      { label: "Client", value: clientLabel },
    ])}
    <p style="margin:20px 0 0;font-size:14px;color:#6B7280;">
      Funds settle to your connected Stripe account per your payout schedule.
    </p>`;

  const html = rebbanEmailLayout({
    preheader: `${invoiceLabel} was paid — ${options.amountLabel}`,
    title: "Payment received",
    bodyHtml,
    cta: { label: "View invoice", url: options.invoiceUrl },
    footerNote: null,
  });

  return sendHtmlEmail({
    to: options.to,
    subject: `Paid: ${invoiceLabel} · ${options.amountLabel}`,
    html,
  });
}

export async function sendInvoicePaidClientEmail(options: {
  to: string;
  clientName?: string | null;
  organizationName: string;
  invoiceNumber?: string | null;
  amountLabel: string;
  paidAtLabel: string;
  fromName?: string | null;
  pdf: Buffer;
  pdfFilename: string;
}) {
  const esc = brandEscapeHtml;
  const clientFirst = firstName(options.clientName);
  const greeting = clientFirst ? `Hi ${clientFirst},` : "Hi,";
  const invoiceLabel = options.invoiceNumber?.trim()
    ? `Invoice ${options.invoiceNumber.trim()}`
    : "your invoice";
  const biz = options.organizationName.trim() || "your freelancer";

  const bodyHtml = `
    <p style="margin:0 0 12px;">${esc(greeting)}</p>
    <p style="margin:0;">
      This confirms your payment to <strong>${esc(biz)}</strong> for
      <strong>${esc(invoiceLabel)}</strong>. A PDF copy is attached for your records.
    </p>
    ${emailDetailCard([
      { label: "Amount paid", value: options.amountLabel },
      { label: "Paid on", value: options.paidAtLabel },
      { label: "Paid to", value: biz },
    ])}
    <p style="margin:20px 0 0;font-size:14px;color:#6B7280;">
      Keep the attached PDF with your bookkeeping. No further action is needed.
    </p>`;

  const html = rebbanEmailLayout({
    preheader: `Payment confirmation for ${invoiceLabel} — ${options.amountLabel}`,
    title: "Payment confirmation",
    bodyHtml,
    cta: null,
    footerNote: `Receipt from ${biz}`,
  });

  return sendHtmlEmail({
    to: options.to,
    subject: `Payment confirmation · ${invoiceLabel}`,
    html,
    fromName: options.fromName || biz,
    attachments: [
      {
        filename: options.pdfFilename,
        content: options.pdf,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendProposalFollowUpEmail(options: {
  to: string;
  recipientName?: string | null;
  senderName?: string | null;
  organizationName: string;
  proposalTitle: string;
  proposalUrl: string;
  subject: string;
  body: string;
  fromUserId?: string | null;
  useAdmin?: boolean;
}) {
  const recipientFirst = firstName(options.recipientName);
  const greeting = recipientFirst ? `Hi ${recipientFirst},` : "Hi,";
  const signOff =
    firstName(options.senderName) ||
    options.senderName?.trim() ||
    options.organizationName;

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:8px 0;">
    <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(options.body)}</p>
    <p style="margin:24px 0;">
      <a href="${options.proposalUrl}" style="color:#1d4ed8;font-weight:600;">
        Open the proposal →
      </a>
    </p>
    <p style="margin:28px 0 0;">
      ${escapeHtml(signOff)}
    </p>
  </div>`;

  return sendHtmlEmail({
    to: options.to,
    subject: options.subject,
    html,
    fromUserId: options.fromUserId,
    fromName: options.senderName,
    useAdmin: options.useAdmin,
  });
}

export async function sendProposalDeclinedEmail(options: {
  to: string;
  freelancerName?: string | null;
  actorName?: string | null;
  proposalTitle: string;
  reason?: string | null;
  proposalUrl: string;
}) {
  const resend = getResend();
  const greeting = options.freelancerName?.trim()
    ? `Hi ${options.freelancerName.trim()},`
    : "Hi,";

  const html = `
  <div style="font-family:Inter,system-ui,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">
      ${options.actorName ? `<strong>${escapeHtml(options.actorName)}</strong> declined` : "A client declined"}
      <strong>${escapeHtml(options.proposalTitle)}</strong>.
    </p>
    ${
      options.reason
        ? `<p style="margin:0 0 16px;padding:12px 14px;background:#FEF2F2;border-radius:12px;">Reason: ${escapeHtml(options.reason)}</p>`
        : ""
    }
    <p style="margin:24px 0;">
      <a href="${options.proposalUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">
        Open proposal
      </a>
    </p>
  </div>`;

  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: options.to,
    subject: `Declined: ${options.proposalTitle}`,
    html,
  });

  if (error) throw new Error(error.message);
  return data;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
