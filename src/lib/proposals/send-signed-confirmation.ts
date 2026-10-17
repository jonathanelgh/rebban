import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getAppUrl,
  sendProposalSignedClientEmail,
} from "@/lib/email/resend";
import { formatMoneyLabel } from "@/lib/proposals/documentHash";
import {
  buildSignedProposalPdfForProposal,
  uploadSignedProposalPdf,
} from "@/lib/proposals/signed-pdf-store";

type Db = SupabaseClient<Database>;

/** Build PDF, store on proposal when possible, email the signer. */
export async function sendSignedProposalConfirmation(
  db: Db,
  proposalId: string,
  options?: {
    storeWith?: Db | null;
    request?: Request | null;
    origin?: string;
  }
) {
  const built = await buildSignedProposalPdfForProposal(db, proposalId, {
    request: options?.request,
    origin: options?.origin,
  });
  const storeDb = options?.storeWith ?? db;

  try {
    await uploadSignedProposalPdf(storeDb, {
      organizationId: built.organizationId,
      proposalId,
      signatureId: built.signatureId,
      title: built.title,
      pdf: built.pdf,
    });
  } catch (err) {
    console.error(
      "[signed confirmation] PDF store failed",
      err instanceof Error ? err.message : err
    );
  }

  const amountLabel = formatMoneyLabel(
    built.input.amount,
    built.input.currency
  );

  await sendProposalSignedClientEmail({
    to: built.input.signature.signer_email,
    signerName: built.input.signature.signer_name,
    organizationName: built.input.organizationName,
    proposalTitle: built.title,
    amountLabel,
    signedAt: built.input.signature.signed_at,
    documentHash: built.input.signature.document_hash,
    proposalUrl:
      built.input.publicUrl || `${getAppUrl()}/proposals/${proposalId}/edit`,
    pdf: built.pdf,
    pdfFilename: built.filename,
  });

  return {
    to: built.input.signature.signer_email,
    filename: built.filename,
    signatureId: built.signatureId,
  };
}
