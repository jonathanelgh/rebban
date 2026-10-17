"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  FileText,
  ShieldCheck,
  Loader2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  formatMoneyLabel,
  hashProposalDocument,
} from "@/lib/proposals/documentHash";
import { PublicProposalDocument } from "@/components/proposals/PublicProposalDocument";
import { SignaturePad } from "@/components/proposals/SignaturePad";
import {
  ModalOverlay,
  modalBodyClass,
  modalFooterClass,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";

type PublicProposalPayload = {
  token: string;
  recipient_email: string | null;
  recipient_name: string | null;
  proposal: {
    id: string;
    title: string;
    status: "draft" | "sent" | "viewed" | "accepted" | "declined";
    currency: string;
    amount: number;
    content: unknown;
    sent_at: string | null;
    viewed_at: string | null;
    accepted_at: string | null;
    declined_at: string | null;
    expires_at?: string | null;
  };
  organization: {
    id: string;
    name: string;
    logo_url: string | null;
    description: string | null;
  };
  client: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
  } | null;
  sender: { full_name: string | null; email: string | null } | null;
  signature: {
    id: string;
    signer_name: string;
    signer_email: string;
    signed_at: string;
    document_hash: string;
    signature_type: string;
    signature_text: string | null;
    signature_image?: string | null;
  } | null;
};

const CONSENT_TEXT =
  "By signing electronically, I confirm that I am authorized to accept this proposal, that I have reviewed the scope, pricing, and terms, and that this electronic signature is the legal equivalent of my handwritten signature.";

export default function PublicProposalPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";

  const [data, setData] = useState<PublicProposalPayload | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "decline" | "sign">("view");
  const [submitting, setSubmitting] = useState(false);

  const [declineReason, setDeclineReason] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signerCompany, setSignerCompany] = useState("");
  const [signatureMode, setSignatureMode] = useState<"drawn" | "typed">(
    "drawn"
  );
  const [signatureText, setSignatureText] = useState("");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data: payload, error: rpcError } = await supabase.rpc(
        "get_public_proposal",
        { p_token: token }
      );

      if (cancelled) return;

      if (rpcError || !payload) {
        setError(rpcError?.message || "This proposal link is invalid or expired.");
        setLoading(false);
        return;
      }

      const parsed = payload as PublicProposalPayload;
      setData(parsed);
      setSignerName(
        personNameForSigning(
          parsed.client?.name,
          parsed.recipient_name,
          parsed.client?.company
        )
      );
      setSignerEmail(parsed.recipient_email || parsed.client?.email || "");
      setSignerCompany(parsed.client?.company?.trim() || "");
      setLoading(false);

      if (!parsed.organization.logo_url) {
        setLogoUrl(null);
      } else if (/^https?:\/\//i.test(parsed.organization.logo_url)) {
        setLogoUrl(parsed.organization.logo_url);
      } else {
        const logoRes = await fetch(`/api/p/${token}/logo`);
        const logoJson = await logoRes.json().catch(() => ({}));
        setLogoUrl(
          logoRes.ok && typeof logoJson.url === "string" ? logoJson.url : null
        );
      }

      void fetch(`/api/p/${token}/view`, { method: "POST" });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const amountLabel = useMemo(() => {
    if (!data) return "";
    return formatMoneyLabel(
      Number(data.proposal.amount || 0),
      data.proposal.currency || "USD"
    );
  }, [data]);

  const status = data?.proposal.status;
  const isFinal = status === "accepted" || status === "declined";

  async function handleDecline() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/p/${token}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: declineReason,
        name: signerName,
        email: signerEmail,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error || "Could not decline proposal.");
      return;
    }
    setMode("view");
    setData((prev) =>
      prev
        ? {
            ...prev,
            proposal: {
              ...prev.proposal,
              status: "declined",
              declined_at: new Date().toISOString(),
            },
          }
        : prev
    );
  }

  async function handleSign() {
    if (!token || !data) return;
    if (!consent) {
      setError("Please confirm the consent statement to continue.");
      return;
    }
    if (!signerName.trim() || !signerEmail.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (signatureMode === "typed" && !signatureText.trim()) {
      setError("Please type your signature.");
      return;
    }
    if (signatureMode === "drawn" && !signatureImage) {
      setError("Please draw your signature.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const documentHash = await hashProposalDocument({
      proposalId: data.proposal.id,
      title: data.proposal.title,
      amount: data.proposal.amount,
      currency: data.proposal.currency,
      content: data.proposal.content,
    });

    const res = await fetch(`/api/p/${token}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signerName: signerName.trim(),
        signerEmail: signerEmail.trim(),
        signerTitle: signerTitle.trim(),
        signerCompany: signerCompany.trim(),
        signatureType: signatureMode,
        signatureText:
          signatureMode === "typed" ? signatureText.trim() : undefined,
        signatureImage:
          signatureMode === "drawn" ? signatureImage : undefined,
        consentText: CONSENT_TEXT,
        documentHash,
      }),
    });
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(json.error || "Could not sign proposal.");
      return;
    }

    setMode("view");
    setData((prev) =>
      prev
        ? {
            ...prev,
            proposal: {
              ...prev.proposal,
              status: "accepted",
              accepted_at: json.signed_at || new Date().toISOString(),
            },
            signature: {
              id: json.signature_id,
              signer_name: json.signer_name,
              signer_email: signerEmail.trim(),
              signed_at: json.signed_at || new Date().toISOString(),
              document_hash: json.document_hash,
              signature_type: signatureMode,
              signature_text:
                signatureMode === "typed" ? signatureText.trim() : null,
              signature_image:
                signatureMode === "drawn" ? signatureImage : null,
            },
          }
        : prev
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F3F4F6] flex items-center justify-center">
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading proposal…
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-6">
        <div className="bg-white border border-line rounded-3xl p-8 max-w-md text-center">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900">Link unavailable</h1>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="min-h-screen bg-[#F3F4F6]">
      <div className="max-w-[920px] mx-auto px-4 py-8 sm:py-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-gray-500">
              Proposal from {data.organization.name}
              {data.sender?.full_name ? ` · ${data.sender.full_name}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full bg-white border border-line px-2.5 py-1 font-medium text-gray-600">
              {amountLabel || "—"}
            </span>
            <span className="rounded-full bg-white border border-line px-2.5 py-1 font-medium text-gray-600 capitalize">
              {data.proposal.status}
            </span>
          </div>
        </div>

        <div className="mb-6">
          <PublicProposalDocument
            content={data.proposal.content}
            currency={data.proposal.currency || "USD"}
            organizationName={data.organization.name}
            organizationLogoUrl={logoUrl}
            clientLabel={
              data.client?.company ||
              data.client?.name ||
              data.recipient_name ||
              null
            }
            sentAt={data.proposal.sent_at}
            expiresAt={data.proposal.expires_at}
          />
        </div>

        <div className="bg-white border border-line rounded-3xl p-5 mb-6">
          <p className="inline-flex items-start gap-2 text-sm text-gray-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            Acceptance requires an electronic signature with your name, email,
            consent, timestamp, and a document fingerprint for auditability.
          </p>
        </div>

        {data.signature && (
          <div className="bg-white border border-emerald-200 rounded-3xl p-7 mb-6">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-5 h-5" />
              Electronically signed
            </div>
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-400">Signer</dt>
                <dd className="text-gray-900 mt-0.5">{data.signature.signer_name}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Email</dt>
                <dd className="text-gray-900 mt-0.5">{data.signature.signer_email}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Signed at</dt>
                <dd className="text-gray-900 mt-0.5">
                  {new Date(data.signature.signed_at).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Document hash</dt>
                <dd className="text-gray-900 mt-0.5 break-all text-[12px]">
                  {data.signature.document_hash}
                </dd>
              </div>
              {(data.signature.signature_image ||
                data.signature.signature_text) && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-400">Signature</dt>
                  <dd className="mt-1">
                    {data.signature.signature_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={data.signature.signature_image}
                        alt="Signature"
                        className="h-16 w-auto max-w-full object-contain"
                      />
                    ) : (
                      <span
                        className="text-2xl text-gray-900"
                        style={{ fontFamily: "Georgia, serif" }}
                      >
                        {data.signature.signature_text}
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {status === "declined" && (
          <div className="bg-white border border-red-200 rounded-3xl p-7 mb-6 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900">Proposal declined</div>
              <p className="text-sm text-gray-500 mt-1">
                This proposal was marked as declined
                {data.proposal.declined_at
                  ? ` on ${new Date(data.proposal.declined_at).toLocaleString()}`
                  : ""}
                .
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="mb-4 text-[13px] text-red-600">{error}</p>
        )}

        {!isFinal && mode === "view" && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSignatureMode("drawn");
                setSignatureText("");
                setSignatureImage(null);
                setConsent(false);
                setMode("sign");
              }}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm"
            >
              Accept & e-sign
            </button>
            <button
              type="button"
              onClick={() => setMode("decline")}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border border-line bg-white text-gray-700 hover:bg-gray-50"
            >
              Decline
            </button>
          </div>
        )}

        {mode === "decline" && !isFinal && (
          <div className="bg-white border border-line rounded-3xl p-7 mt-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Decline proposal</h2>
            <Field label="Your name">
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
              />
            </Field>
            <Field label="Reason (optional)">
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300 resize-none"
                placeholder="Share a short reason…"
              />
            </Field>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setMode("view")}
                className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDecline()}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? "Declining…" : "Confirm decline"}
              </button>
            </div>
          </div>
        )}

      </div>

      {mode === "sign" && !isFinal && (
        <ModalOverlay onClose={submitting ? undefined : () => setMode("view")}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-proposal-title"
            className={modalPanelClass("max-w-[560px]")}
          >
            <div className={modalHeaderClass}>
              <div className="min-w-0">
                <h2
                  id="sign-proposal-title"
                  className="text-xl font-semibold text-gray-900 tracking-tight"
                >
                  Accept & e-sign
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Complete the fields below to create a binding electronic
                  acceptance record for this proposal.
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setMode("view")}
                className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`${modalBodyClass} space-y-4`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Full legal name">
                  <input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                  />
                </Field>
                <Field label="Title (optional)">
                  <input
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                  />
                </Field>
                <Field label="Company (optional)">
                  <input
                    value={signerCompany}
                    onChange={(e) => setSignerCompany(e.target.value)}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                  />
                </Field>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-[13px] font-medium text-gray-700">
                    Signature
                  </span>
                  <div className="inline-flex rounded-lg border border-line p-0.5 bg-[#F8F9FA]">
                    <button
                      type="button"
                      onClick={() => setSignatureMode("drawn")}
                      className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                        signatureMode === "drawn"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      Draw
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignatureMode("typed")}
                      className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                        signatureMode === "typed"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      Type
                    </button>
                  </div>
                </div>
                {signatureMode === "drawn" ? (
                  <SignaturePad
                    disabled={submitting}
                    onChange={setSignatureImage}
                  />
                ) : (
                  <input
                    value={signatureText}
                    onChange={(e) => setSignatureText(e.target.value)}
                    placeholder={signerName || "Your full name"}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 outline-none focus:border-gray-300"
                    style={{ fontFamily: "Georgia, serif", fontSize: 22 }}
                  />
                )}
              </div>
              <label className="flex items-start gap-3 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1"
                />
                <span>{CONSENT_TEXT}</span>
              </label>
              {error ? (
                <p className="text-[13px] text-red-600">{error}</p>
              ) : null}
            </div>

            <div className={modalFooterClass}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setMode("view")}
                className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSign()}
                className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {submitting ? "Signing…" : "Sign & accept"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </main>
  );
}

function personNameForSigning(
  clientName: string | null | undefined,
  recipientName: string | null | undefined,
  company: string | null | undefined
) {
  const fromClient = clientName?.trim() || "";
  if (fromClient) return fromClient;

  const raw = recipientName?.trim() || "";
  if (!raw) return "";

  const org = company?.trim() || "";
  if (org) {
    const suffix = ` · ${org}`;
    if (raw.endsWith(suffix)) return raw.slice(0, -suffix.length).trim();
  }

  const sep = " · ";
  const idx = raw.indexOf(sep);
  if (idx > 0) return raw.slice(0, idx).trim();
  return raw;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
