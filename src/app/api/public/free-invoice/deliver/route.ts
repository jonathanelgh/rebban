import {
  escapeHtml,
  rebbanEmailLayout,
} from "@/lib/email/brand";
import { getAppUrl, sendHtmlEmail } from "@/lib/email/resend";
import {
  assertAllowedOrigin,
  clientMeta,
  createDownloadToken,
  freeInvoiceOptions,
  freeInvoicePdfFilename,
  hashIp,
  hashToken,
  isValidEmail,
  jsonWithCors,
  payloadFromJson,
} from "@/lib/free-invoice/public";
import { buildInvoicePdf } from "@/lib/invoices/pdf";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const METHODS = "POST, OPTIONS";
const DELIVER_LIMIT_PER_HOUR = 20;
const DOWNLOAD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function OPTIONS(request: Request) {
  return freeInvoiceOptions(request, METHODS);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!assertAllowedOrigin(origin)) {
    return jsonWithCors(origin, METHODS, { error: "Origin not allowed" }, {
      status: 403,
    });
  }

  const { ip } = clientMeta(request);
  const ipHash = hashIp(ip);
  const admin = createAdminClient();

  if (ipHash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("free_invoice_drafts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .not("pdf_sent_at", "is", null)
      .gte("pdf_sent_at", since);
    if ((count || 0) >= DELIVER_LIMIT_PER_HOUR) {
      return jsonWithCors(
        origin,
        METHODS,
        { error: "Too many email requests. Try again later." },
        { status: 429 }
      );
    }
  }

  const body = (await request.json().catch(() => null)) as {
    draftId?: string;
    email?: string;
  } | null;

  const draftId = String(body?.draftId || "").trim();
  const email = String(body?.email || "")
    .trim()
    .toLowerCase()
    .slice(0, 254);

  if (!draftId) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Missing invoice draft." },
      { status: 400 }
    );
  }
  if (!isValidEmail(email)) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  const { data: draft, error } = await admin
    .from("free_invoice_drafts")
    .select(
      "id, invoice_number, payload, email, expires_at, download_token_hash, download_token_expires_at"
    )
    .eq("id", draftId)
    .maybeSingle();

  if (error || !draft) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Invoice not found or expired." },
      { status: 404 }
    );
  }

  if (new Date(draft.expires_at).getTime() < Date.now()) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: "This invoice has expired. Generate a new one." },
      { status: 410 }
    );
  }

  const payload = payloadFromJson(draft.payload);
  if (!payload) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Invoice data is invalid." },
      { status: 500 }
    );
  }

  const token = createDownloadToken();
  const tokenHash = hashToken(token);
  const tokenExpiresAt = new Date(
    Date.now() + DOWNLOAD_TOKEN_TTL_MS
  ).toISOString();

  let pdf: Buffer;
  try {
    pdf = await buildInvoicePdf(payload);
  } catch (pdfError) {
    console.error("[free-invoice/deliver] pdf", pdfError);
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Could not build the PDF." },
      { status: 500 }
    );
  }

  const filename = freeInvoicePdfFilename(draft.invoice_number);
  const appUrl = getAppUrl();
  const downloadUrl = `${appUrl}/api/public/free-invoice/${draft.id}/download?token=${token}`;

  const html = rebbanEmailLayout({
    preheader: `Your invoice PDF: ${draft.invoice_number}`,
    title: "Your invoice is ready",
    bodyHtml: `<p style="margin:0 0 12px;">Thanks for trying Rebban’s free invoice generator.</p>
      <p style="margin:0 0 12px;"><strong>${escapeHtml(draft.invoice_number)}</strong> is attached as a PDF.</p>
      <p style="margin:0;">You can also download it from the page where you entered this email.</p>`,
    cta: {
      label: "Create free Rebban account",
      url: `${appUrl}/signup`,
    },
    footerNote:
      "Sent because you requested a PDF from the free invoice tool on rebban.com.",
  });

  try {
    await sendHtmlEmail({
      to: email,
      subject: `Your invoice: ${draft.invoice_number}`,
      html,
      attachments: [
        {
          filename,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (mailError) {
    console.error("[free-invoice/deliver] email", mailError);
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Could not send the email. Please try again." },
      { status: 502 }
    );
  }

  const { error: updateError } = await admin
    .from("free_invoice_drafts")
    .update({
      email,
      pdf_sent_at: new Date().toISOString(),
      download_token_hash: tokenHash,
      download_token_expires_at: tokenExpiresAt,
    })
    .eq("id", draft.id);

  if (updateError) {
    console.error("[free-invoice/deliver] update", updateError);
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Email sent, but download unlock failed. Check your inbox." },
      { status: 500 }
    );
  }

  return jsonWithCors(origin, METHODS, {
    ok: true,
    downloadUrl,
    number: draft.invoice_number,
    filename,
  });
}
