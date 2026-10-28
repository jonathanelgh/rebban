import {
  assertAllowedOrigin,
  freeInvoiceCorsHeaders,
  freeInvoiceOptions,
  freeInvoicePdfFilename,
  hashToken,
  payloadFromJson,
} from "@/lib/free-invoice/public";
import { buildInvoicePdf } from "@/lib/invoices/pdf";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const METHODS = "GET, OPTIONS";

export async function OPTIONS(request: Request) {
  return freeInvoiceOptions(request, METHODS);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get("origin");
  const headers = freeInvoiceCorsHeaders(origin, METHODS);

  if (!assertAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Type": "application/json",
      },
    });
  }

  const { id } = await context.params;
  const draftId = String(id || "").trim();
  const token = new URL(request.url).searchParams.get("token")?.trim() || "";

  if (!draftId || !token) {
    return new Response(JSON.stringify({ error: "Missing download token." }), {
      status: 400,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Type": "application/json",
      },
    });
  }

  const admin = createAdminClient();
  const { data: draft, error } = await admin
    .from("free_invoice_drafts")
    .select(
      "id, invoice_number, payload, email, expires_at, download_token_hash, download_token_expires_at"
    )
    .eq("id", draftId)
    .maybeSingle();

  if (error || !draft) {
    return new Response(JSON.stringify({ error: "Invoice not found." }), {
      status: 404,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Type": "application/json",
      },
    });
  }

  if (!draft.email || !draft.download_token_hash) {
    return new Response(
      JSON.stringify({ error: "Enter your email to unlock the download." }),
      {
        status: 403,
        headers: {
          ...Object.fromEntries(headers.entries()),
          "Content-Type": "application/json",
        },
      }
    );
  }

  if (new Date(draft.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ error: "This invoice has expired." }), {
      status: 410,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Type": "application/json",
      },
    });
  }

  if (
    !draft.download_token_expires_at ||
    new Date(draft.download_token_expires_at).getTime() < Date.now()
  ) {
    return new Response(
      JSON.stringify({ error: "Download link expired. Request the PDF again." }),
      {
        status: 410,
        headers: {
          ...Object.fromEntries(headers.entries()),
          "Content-Type": "application/json",
        },
      }
    );
  }

  if (hashToken(token) !== draft.download_token_hash) {
    return new Response(JSON.stringify({ error: "Invalid download token." }), {
      status: 403,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Type": "application/json",
      },
    });
  }

  const payload = payloadFromJson(draft.payload);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Invoice data is invalid." }), {
      status: 500,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Type": "application/json",
      },
    });
  }

  try {
    const pdf = await buildInvoicePdf(payload);
    const filename = freeInvoicePdfFilename(draft.invoice_number);
    const responseHeaders = freeInvoiceCorsHeaders(origin, METHODS);
    responseHeaders.set("Content-Type", "application/pdf");
    responseHeaders.set(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    responseHeaders.set("Cache-Control", "private, no-store");
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (pdfError) {
    console.error("[free-invoice/download]", pdfError);
    return new Response(JSON.stringify({ error: "Could not build the PDF." }), {
      status: 500,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Type": "application/json",
      },
    });
  }
}
