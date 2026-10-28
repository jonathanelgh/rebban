import {
  assertAllowedOrigin,
  freeProposalCorsHeaders,
  freeProposalOptions,
  hashToken,
} from "@/lib/free-proposal/public";
import {
  buildFreeProposalPdf,
  freeProposalPdfFilename,
} from "@/lib/proposals/pdf";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const METHODS = "GET, OPTIONS";

export async function OPTIONS(request: Request) {
  return freeProposalOptions(request, METHODS);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get("origin");
  const headers = freeProposalCorsHeaders(origin, METHODS);

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
    .from("free_proposal_drafts")
    .select(
      "id, title, content, amount, currency, client_name, client_company, freelancer_name, email, expires_at, download_token_hash, download_token_expires_at"
    )
    .eq("id", draftId)
    .maybeSingle();

  if (error || !draft) {
    return new Response(JSON.stringify({ error: "Proposal not found." }), {
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
    return new Response(JSON.stringify({ error: "This proposal has expired." }), {
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

  try {
    const pdf = await buildFreeProposalPdf({
      title: draft.title,
      amount: Number(draft.amount) || 0,
      currency: draft.currency || "USD",
      content: draft.content,
      organizationName: draft.freelancer_name || "Freelance studio",
      clientName: draft.client_name,
      clientCompany: draft.client_company,
    });
    const filename = freeProposalPdfFilename(draft.title);
    const responseHeaders = freeProposalCorsHeaders(origin, METHODS);
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
    console.error("[free-proposal/download]", pdfError);
    return new Response(JSON.stringify({ error: "Could not build the PDF." }), {
      status: 500,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Type": "application/json",
      },
    });
  }
}
