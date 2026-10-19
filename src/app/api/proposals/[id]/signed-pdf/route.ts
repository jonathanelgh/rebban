import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import {
  buildSignedProposalPdfForProposal,
  PROPOSAL_FILES_BUCKET,
  signedProposalStoragePath,
  uploadSignedProposalPdf,
} from "@/lib/proposals/signed-pdf-store";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

async function signedUrlForPath(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  path: string,
  filename: string
) {
  const { data, error } = await db.storage
    .from(PROPOSAL_FILES_BUCKET)
    .createSignedUrl(path, 60 * 10, {
      download: filename,
    });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not create download link.");
  }
  return data.signedUrl as string;
}

/** Org members: regenerate the designed signed PDF and download it. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: proposalId } = await context.params;
    if (!proposalId) {
      return NextResponse.json({ error: "Missing proposal id." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    const { data: signature, error: sigError } = await supabase
      .from("proposal_signatures")
      .select("id, organization_id, proposal_id")
      .eq("proposal_id", proposalId)
      .maybeSingle();

    if (sigError) {
      return NextResponse.json({ error: sigError.message }, { status: 400 });
    }
    if (!signature) {
      return NextResponse.json(
        { error: "No signed document for this proposal yet." },
        { status: 404 }
      );
    }

    const built = await buildSignedProposalPdfForProposal(supabase, proposalId, {
      request,
    });
    const stored = await uploadSignedProposalPdf(supabase, {
      organizationId: built.organizationId,
      proposalId,
      signatureId: built.signatureId,
      title: built.title,
      pdf: built.pdf,
    });

    const url = await signedUrlForPath(
      supabase,
      stored.path ||
        signedProposalStoragePath({
          organizationId: built.organizationId,
          proposalId,
          signatureId: built.signatureId,
        }),
      stored.filename
    );

    return NextResponse.redirect(url);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not download signed PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
