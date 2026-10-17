import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { getAppUrl } from "@/lib/email/resend";
import {
  buildSignedProposalPdf,
  signedProposalPdfFilename,
  type SignedProposalPdfEvent,
  type SignedProposalPdfInput,
} from "@/lib/proposals/pdf";
import { renderSignedProposalPrintPdf } from "@/lib/proposals/html-to-pdf";

export const PROPOSAL_FILES_BUCKET = "proposal-files";

type Db = SupabaseClient<Database>;

export function signedProposalStoragePath(input: {
  organizationId: string;
  proposalId: string;
  signatureId: string;
}) {
  return `${input.organizationId}/proposals/${input.proposalId}/signed/v2-${input.signatureId}.pdf`;
}

export async function uploadSignedProposalPdf(
  db: Db,
  input: {
    organizationId: string;
    proposalId: string;
    signatureId: string;
    title: string;
    pdf: Buffer;
  }
) {
  const filename = signedProposalPdfFilename(input.title);
  const path = signedProposalStoragePath({
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    signatureId: input.signatureId,
  });

  const { error: uploadError } = await db.storage
    .from(PROPOSAL_FILES_BUCKET)
    .upload(path, input.pdf, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Could not store signed PDF.");
  }

  const { error: updateError } = await db
    .from("proposal_signatures")
    .update({
      pdf_path: path,
      pdf_filename: filename,
      pdf_byte_size: input.pdf.byteLength,
      pdf_stored_at: new Date().toISOString(),
    })
    .eq("id", input.signatureId);

  if (updateError) {
    throw new Error(updateError.message || "Could not attach PDF to signature.");
  }

  return { path, filename, byteSize: input.pdf.byteLength };
}

function asEvents(value: unknown): SignedProposalPdfEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SignedProposalPdfEvent =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as SignedProposalPdfEvent).event_type === "string" &&
      typeof (item as SignedProposalPdfEvent).created_at === "string"
  );
}

/** Build the signed PDF from live proposal + signature + audit rows. */
export async function buildSignedProposalPdfForProposal(
  db: Db,
  proposalId: string,
  options?: { request?: Request | null; origin?: string }
): Promise<{
  pdf: Buffer;
  filename: string;
  organizationId: string;
  signatureId: string;
  title: string;
  input: SignedProposalPdfInput;
}> {
  const { data: proposal, error: proposalError } = await db
    .from("proposals")
    .select(
      "id, title, amount, currency, content, sent_at, expires_at, organization_id, client_id, created_by, status"
    )
    .eq("id", proposalId)
    .is("deleted_at", null)
    .maybeSingle();

  if (proposalError || !proposal) {
    throw new Error(proposalError?.message || "Proposal not found.");
  }

  if (proposal.status !== "accepted") {
    throw new Error("Proposal is not signed yet.");
  }

  const [{ data: signature }, { data: org }, { data: client }, { data: sender }, { data: events }] =
    await Promise.all([
      db
        .from("proposal_signatures")
        .select(
          "id, signer_name, signer_email, signer_title, signer_company, signed_at, document_hash, signature_type, signature_text, signature_image, consent_text, ip_address, user_agent, pdf_path, pdf_filename"
        )
        .eq("proposal_id", proposalId)
        .maybeSingle(),
      db
        .from("organizations")
        .select("id, name")
        .eq("id", proposal.organization_id)
        .maybeSingle(),
      proposal.client_id
        ? db
            .from("clients")
            .select("name, company")
            .eq("id", proposal.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      proposal.created_by
        ? db
            .from("profiles")
            .select("full_name, email")
            .eq("id", proposal.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from("proposal_events")
        .select(
          "event_type, actor_type, actor_name, actor_email, ip_address, user_agent, created_at"
        )
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: true }),
    ]);

  if (!signature) {
    throw new Error("Signature not found.");
  }

  const { data: shareLink } = await db
    .from("proposal_share_links")
    .select("token")
    .eq("proposal_id", proposalId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const input: SignedProposalPdfInput = {
    title: proposal.title,
    amount: Number(proposal.amount) || 0,
    currency: proposal.currency || "USD",
    content: proposal.content as Json,
    organizationName: org?.name || "Workspace",
    senderName: sender?.full_name,
    clientName: client?.name,
    clientCompany: client?.company,
    sentAt: proposal.sent_at,
    expiresAt: proposal.expires_at,
    signature: {
      id: signature.id,
      signer_name: signature.signer_name,
      signer_email: signature.signer_email,
      signer_title: signature.signer_title,
      signer_company: signature.signer_company,
      signed_at: signature.signed_at,
      document_hash: signature.document_hash,
      signature_type: signature.signature_type,
      signature_text: signature.signature_text,
      signature_image: signature.signature_image,
      consent_text: signature.consent_text,
      ip_address: signature.ip_address,
      user_agent: signature.user_agent,
    },
    events: asEvents(events),
    publicUrl: shareLink?.token ? `${getAppUrl()}/p/${shareLink.token}` : null,
  };

  let pdf: Buffer | null = null;
  if (shareLink?.token) {
    try {
      pdf = await renderSignedProposalPrintPdf({
        token: shareLink.token,
        request: options?.request,
        origin: options?.origin,
      });
    } catch (err) {
      console.error(
        "[signed pdf] designed render failed; falling back",
        err instanceof Error ? err.message : err
      );
    }
  }

  if (!pdf) {
    pdf = await buildSignedProposalPdf(input);
  }

  return {
    pdf,
    filename: signature.pdf_filename || signedProposalPdfFilename(proposal.title),
    organizationId: proposal.organization_id,
    signatureId: signature.id,
    title: proposal.title,
    input,
  };
}
