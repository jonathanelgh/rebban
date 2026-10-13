import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAppUrl,
  sendProposalAcceptedEmail,
} from "@/lib/email/resend";
import { formatMoneyLabel } from "@/lib/proposals/documentHash";

function clientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const body = (await request.json()) as {
      signerName?: string;
      signerEmail?: string;
      signerTitle?: string;
      signerCompany?: string;
      signatureType?: "typed" | "drawn";
      signatureText?: string;
      signatureImage?: string;
      consentText?: string;
      documentHash?: string;
    };
    const { ip, userAgent } = clientMeta(request);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("sign_public_proposal", {
      p_token: token,
      p_signer_name: body.signerName || "",
      p_signer_email: body.signerEmail || "",
      p_signer_title: body.signerTitle || undefined,
      p_signer_company: body.signerCompany || undefined,
      p_signature_type: body.signatureType || "typed",
      p_signature_text: body.signatureText || undefined,
      p_signature_image: body.signatureImage || undefined,
      p_consent_text: body.consentText || "",
      p_document_hash: body.documentHash || "",
      p_ip: ip || undefined,
      p_user_agent: userAgent || undefined,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const result = data as {
      ok: boolean;
      status: string;
      signature_id: string;
      proposal_id: string;
      title: string;
      amount: number;
      currency: string;
      signer_name: string;
      signer_email: string;
      document_hash: string;
      accepted_at?: string;
      notify_email?: string | null;
      notify_name?: string | null;
      organization_name?: string | null;
    };

    if (result.notify_email) {
      try {
        await sendProposalAcceptedEmail({
          to: result.notify_email,
          freelancerName: result.notify_name,
          signerName: result.signer_name,
          signerEmail: result.signer_email,
          proposalTitle: result.title,
          organizationName: result.organization_name || "Your workspace",
          amountLabel: formatMoneyLabel(
            Number(result.amount || 0),
            result.currency || "USD"
          ),
          signedAt: result.accepted_at || new Date().toISOString(),
          documentHash: result.document_hash,
          proposalUrl: `${getAppUrl()}/proposals/${result.proposal_id}/edit`,
        });
      } catch {
        // Signature already saved.
      }
    }

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      signature_id: result.signature_id,
      proposal_id: result.proposal_id,
      title: result.title,
      signer_name: result.signer_name,
      signed_at: result.accepted_at,
      document_hash: result.document_hash,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sign proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
