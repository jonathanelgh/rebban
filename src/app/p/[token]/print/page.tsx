import React from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PublicProposalDocument } from "@/components/proposals/PublicProposalDocument";
import { SignedCertificate } from "@/components/proposals/SignedCertificate";
import { formatMoneyLabel } from "@/lib/proposals/documentHash";
import { getAppUrl } from "@/lib/email/resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ token: string }> };

function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public env vars are not configured.");
  }
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveLogoUrl(
  logoPath: string | null | undefined
): Promise<string | null> {
  if (!logoPath) return null;
  if (/^https?:\/\//i.test(logoPath)) return logoPath;
  const supabase = createAnonClient();
  const { data, error } = await supabase.storage
    .from("org-assets")
    .createSignedUrl(logoPath, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export default async function PublicProposalPrintPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_signed_proposal_bundle", {
    p_token: token,
  });

  if (error || !data) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center p-8">
        <p className="text-sm text-gray-500">
          {error?.message || "Signed proposal unavailable."}
        </p>
      </main>
    );
  }

  const bundle = data as {
    proposal: {
      title: string;
      currency: string;
      amount: number;
      content: unknown;
      sent_at: string | null;
      expires_at: string | null;
    };
    organization: { name: string; logo_url: string | null };
    client: { name: string; company: string | null } | null;
    signature: {
      id: string;
      signer_name: string;
      signer_email: string;
      signer_title: string | null;
      signer_company: string | null;
      signed_at: string;
      document_hash: string;
      signature_type: string;
      signature_text: string | null;
      signature_image: string | null;
      consent_text: string | null;
      ip_address: string | null;
      user_agent: string | null;
    };
    events: Array<{
      event_type: string;
      actor_name: string | null;
      actor_email: string | null;
      ip_address: string | null;
      created_at: string;
    }>;
  };

  const logoUrl = await resolveLogoUrl(bundle.organization.logo_url);
  const clientLabel =
    bundle.client?.company ||
    bundle.client?.name ||
    bundle.signature.signer_name;
  const amountLabel = formatMoneyLabel(
    Number(bundle.proposal.amount) || 0,
    bundle.proposal.currency || "USD"
  );

  return (
    <main className="min-h-screen bg-white print:bg-white">
      <style>{`
        @page { margin: 12mm; size: A4; }
        @media print {
          html, body { background: #fff !important; }
          .print-hide { display: none !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[920px] px-0 py-0">
        <PublicProposalDocument
          content={bundle.proposal.content}
          currency={bundle.proposal.currency || "USD"}
          organizationName={bundle.organization.name}
          organizationLogoUrl={logoUrl}
          clientLabel={clientLabel}
          sentAt={bundle.proposal.sent_at}
          expiresAt={bundle.proposal.expires_at}
        />
        <SignedCertificate
          title={bundle.proposal.title}
          organizationName={bundle.organization.name}
          amountLabel={amountLabel}
          signature={bundle.signature}
          events={bundle.events || []}
          publicUrl={`${getAppUrl()}/p/${token}`}
        />
      </div>
    </main>
  );
}
