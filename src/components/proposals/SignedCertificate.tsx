import React from "react";

export type CertificateEvent = {
  event_type: string;
  actor_name?: string | null;
  actor_email?: string | null;
  ip_address?: string | null;
  created_at: string;
};

export type CertificateSignature = {
  id: string;
  signer_name: string;
  signer_email: string;
  signer_title?: string | null;
  signer_company?: string | null;
  signed_at: string;
  document_hash: string;
  signature_type: string;
  signature_text?: string | null;
  signature_image?: string | null;
  consent_text?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

function formatStamp(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function eventLabel(type: string) {
  switch (type) {
    case "sent":
      return "Proposal sent";
    case "viewed":
    case "opened":
      return "Proposal opened";
    case "signed":
      return "Electronically signed";
    case "accepted":
      return "Proposal accepted";
    case "declined":
      return "Proposal declined";
    default:
      return type.replace(/_/g, " ");
  }
}

function RebbanSigilBadge({ size = 96 }: { size?: number }) {
  const id = `sigil-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <path
          id={`${id}-top`}
          d="M 60,60 m -42,0 a 42,42 0 1,1 84,0"
          fill="none"
        />
        <path
          id={`${id}-bottom`}
          d="M 60,60 m 42,0 a 42,42 0 1,1 -84,0"
          fill="none"
        />
      </defs>
      <circle cx="60" cy="60" r="58" fill="#EFF6FF" />
      <circle
        cx="60"
        cy="60"
        r="54"
        fill="none"
        stroke="#1A1D23"
        strokeWidth="2.5"
      />
      <circle
        cx="60"
        cy="60"
        r="43"
        fill="none"
        stroke="#2563EB"
        strokeWidth="1.5"
      />
      <circle
        cx="60"
        cy="60"
        r="40.5"
        fill="none"
        stroke="#1A1D23"
        strokeWidth="0.75"
        opacity="0.35"
      />
      <text
        fill="#1A1D23"
        fontSize="7.5"
        fontWeight="700"
        letterSpacing="1.5"
        fontFamily="system-ui, sans-serif"
      >
        <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
          REBBAN.COM
        </textPath>
      </text>
      <text
        fill="#1A1D23"
        fontSize="7.5"
        fontWeight="700"
        letterSpacing="1.5"
        fontFamily="system-ui, sans-serif"
      >
        <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">
          VERIFIED
        </textPath>
      </text>
      <rect x="36" y="36" width="48" height="48" rx="12" fill="#111827" />
      <text
        x="60"
        y="66"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize="22"
        fontWeight="700"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        R.
      </text>
    </svg>
  );
}

export function SignedCertificate({
  title,
  organizationName,
  amountLabel,
  signature,
  events,
  publicUrl,
}: {
  title: string;
  organizationName: string;
  amountLabel?: string | null;
  signature: CertificateSignature;
  events: CertificateEvent[];
  publicUrl?: string | null;
}) {
  const rows: Array<[string, string]> = [
    ["Title", title],
    ["Issued by", organizationName],
  ];
  if (amountLabel) rows.push(["Amount", amountLabel]);
  rows.push(
    ["Signature ID", signature.id],
    ["Document hash (SHA-256)", signature.document_hash],
    ["Signed at", formatStamp(signature.signed_at)]
  );
  if (publicUrl) rows.push(["Public record link", publicUrl]);

  const signerRows: Array<[string, string]> = [
    ["Full legal name", signature.signer_name],
    ["Email", signature.signer_email],
  ];
  if (signature.signer_title) signerRows.push(["Title", signature.signer_title]);
  if (signature.signer_company)
    signerRows.push(["Company", signature.signer_company]);
  signerRows.push([
    "Signature method",
    signature.signature_type === "drawn"
      ? "Drawn electronic signature"
      : "Typed electronic signature",
  ]);
  if (signature.ip_address) signerRows.push(["IP address", signature.ip_address]);
  if (signature.user_agent) signerRows.push(["User agent", signature.user_agent]);

  return (
    <section
      className="print-certificate mx-auto w-full max-w-[850px] bg-white border border-line overflow-hidden break-before-page"
      style={{ pageBreakBefore: "always" }}
    >
      <div className="h-1.5 bg-[#2563EB]" />
      <div className="p-8 sm:p-12">
        <div className="rounded-2xl border border-line bg-[#F8FAFC] px-5 py-5 sm:px-6 flex gap-5 items-center">
          <RebbanSigilBadge size={104} />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.12em] text-[#2563EB] uppercase">
              Rebban.com verification badge
            </div>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-gray-900">
              Certificate of Completion
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-gray-500">
              This proposal was electronically signed through Rebban. The sigil
              certifies the document fingerprint and signing audit log on this
              page.
            </p>
          </div>
        </div>

        <h3 className="mt-10 text-[15px] font-semibold text-gray-900">Document</h3>
        <dl className="mt-4 space-y-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {label}
              </dt>
              <dd className="mt-0.5 text-[13px] text-gray-900 break-all">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <h3 className="mt-10 text-[15px] font-semibold text-gray-900">Signer</h3>
        <dl className="mt-4 space-y-3">
          {signerRows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {label}
              </dt>
              <dd className="mt-0.5 text-[13px] text-gray-900 break-all">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <h3 className="mt-10 text-[15px] font-semibold text-gray-900">Signature</h3>
        <div className="mt-3">
          {signature.signature_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signature.signature_image}
              alt="Signature"
              className="h-16 w-auto max-w-full object-contain"
            />
          ) : signature.signature_text ? (
            <div
              className="text-[28px] text-gray-900"
              style={{ fontFamily: "Georgia, serif" }}
            >
              {signature.signature_text}
            </div>
          ) : (
            <div className="text-sm text-gray-400">—</div>
          )}
        </div>

        {signature.consent_text ? (
          <>
            <h3 className="mt-10 text-[15px] font-semibold text-gray-900">
              Consent
            </h3>
            <p className="mt-3 text-[13px] leading-relaxed text-gray-500">
              {signature.consent_text}
            </p>
          </>
        ) : null}

        <h3 className="mt-10 text-[15px] font-semibold text-gray-900">Audit log</h3>
        <ul className="mt-4 space-y-3">
          {(events.length
            ? events
            : [
                {
                  event_type: "signed",
                  actor_name: signature.signer_name,
                  actor_email: signature.signer_email,
                  ip_address: signature.ip_address,
                  created_at: signature.signed_at,
                },
              ]
          ).map((event, index) => {
            const actor = [event.actor_name, event.actor_email]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={`${event.event_type}-${event.created_at}-${index}`}
                className="border border-line rounded-xl px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[13px] font-semibold text-gray-900">
                    {eventLabel(event.event_type)}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {formatStamp(event.created_at)}
                  </div>
                </div>
                {(actor || event.ip_address) && (
                  <div className="mt-1 text-[12px] text-gray-500">
                    {[actor, event.ip_address ? `IP ${event.ip_address}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-10 pt-6 border-t border-line">
          <p className="text-[11px] leading-relaxed text-gray-400">
            Electronic signature notice: The parties agree that this electronic
            signature is the legal equivalent of a handwritten signature under
            applicable law, including the U.S. ESIGN Act and similar electronic
            commerce frameworks (including eIDAS where applicable). Rebban
            records the document fingerprint, signer identity, consent
            statement, timestamps, and network metadata above to support
            authenticity and non-repudiation. Do not alter this PDF; any change
            invalidates the document hash verification.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <RebbanSigilBadge size={44} />
            <div className="text-[11px] text-gray-400">
              Verified by Rebban.com · Signature {signature.id.slice(0, 8)}… ·
              Hash {signature.document_hash.slice(0, 12)}…
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
