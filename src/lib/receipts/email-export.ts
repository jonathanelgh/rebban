import { sendHtmlEmail } from "@/lib/email/resend";

export async function sendReceiptExportEmail(options: {
  to: string;
  recipientName?: string | null;
  senderName?: string | null;
  monthLabel: string;
  receiptCount: number;
  zipBytes: Buffer;
  filename: string;
}) {
  const to = options.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    throw new Error("A valid recipient email is required.");
  }

  const countLabel =
    options.receiptCount === 1
      ? "1 receipt"
      : `${options.receiptCount} receipts`;
  const sender = options.senderName?.trim() || "Rebban";

  return sendHtmlEmail({
    to,
    subject: `Receipts for ${options.monthLabel}`,
    html: `
      <p>Hi${options.recipientName ? ` ${options.recipientName.split(" ")[0]}` : ""},</p>
      <p>${sender} sent you a ZIP of ${countLabel} for <strong>${options.monthLabel}</strong>.</p>
      <p>The package includes the original files and a CSV manifest.</p>
      <p style="color:#6b7280;font-size:13px;">Sent via Rebban Receipts.</p>
    `,
    attachments: [
      {
        filename: options.filename,
        content: options.zipBytes,
        contentType: "application/zip",
      },
    ],
  });
}
