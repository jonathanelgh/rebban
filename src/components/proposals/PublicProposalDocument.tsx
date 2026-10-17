"use client";

import React from "react";
import {
  asProposalContent,
  blockTypesFromContent,
  type ProposalContentSnapshot,
} from "@/lib/proposals/content";
import { formatMoneyLabel } from "@/lib/proposals/documentHash";
import {
  getProposalTextStyle,
  headerUsesLightText,
  resolveElementStyles,
  resolveHeaderLayout,
} from "@/lib/proposals/theme";

type StyleMap = ReturnType<typeof resolveElementStyles>;

function styleContent(styles: StyleMap, key: string, fallback = "") {
  const value = styles[key]?.content;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asEntries(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

function textOf(item: Record<string, unknown>, keys: string[] = ["text"]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function formatDateLabel(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return <div className="px-10 sm:px-16 py-10 sm:py-12">{children}</div>;
}

function Heading({
  styles,
  id,
  className,
  fallback,
}: {
  styles: StyleMap;
  id: string;
  className?: string;
  fallback: string;
}) {
  const text = styleContent(styles, id, fallback);
  if (!text) return null;
  return (
    <h2 className={className} style={getProposalTextStyle(styles, id)}>
      {text}
    </h2>
  );
}

function BodyText({
  styles,
  id,
  className,
  fallback = "",
}: {
  styles: StyleMap;
  id: string;
  className?: string;
  fallback?: string;
}) {
  const text = styleContent(styles, id, fallback);
  if (!text) return null;
  return (
    <p
      className={`whitespace-pre-wrap ${className || ""}`}
      style={getProposalTextStyle(styles, id)}
    >
      {text}
    </p>
  );
}

function BulletList({ items, color }: { items: string[]; color?: string }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li
          key={`${index}-${item.slice(0, 24)}`}
          className="flex gap-3 text-[15px] leading-relaxed"
          style={{ color: color || "#374151" }}
        >
          <span
            className="mt-2 h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: color || "#9CA3AF" }}
          />
          <span className="whitespace-pre-wrap">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ThemedHeader({
  styles,
  layout,
  logoUrl,
  studioName,
  clientLabel,
  proposalDate,
  validUntil,
}: {
  styles: StyleMap;
  layout: ReturnType<typeof resolveHeaderLayout>["layout"];
  logoUrl?: string | null;
  studioName: string;
  clientLabel: string;
  proposalDate: string;
  validUntil: string;
}) {
  const {
    backgroundImage,
    overlayOpacity,
    shellBackgroundColor,
    contentBackgroundColor,
    contentPadding,
    contentBorderRadius,
  } = layout;

  const contentIsTransparent =
    !contentBackgroundColor ||
    contentBackgroundColor === "transparent" ||
    contentBackgroundColor === "rgba(0,0,0,0)";
  const hasImage = Boolean(backgroundImage);
  const useLightText = headerUsesLightText(layout);

  const muted = useLightText ? "text-white/60" : "text-gray-400";
  const label = useLightText ? "text-white/50" : "text-gray-400";
  const rule = useLightText ? "border-white/15" : "border-line";

  const titleStyle = useLightText
    ? { ...getProposalTextStyle(styles, "header-title"), color: "#FFFFFF", fontSize: 40 }
    : getProposalTextStyle(styles, "header-title");
  const clientStyle = useLightText
    ? { ...getProposalTextStyle(styles, "header-client"), color: "#E5E7EB" }
    : getProposalTextStyle(styles, "header-client");
  const logoStyle = useLightText
    ? { ...getProposalTextStyle(styles, "header-logo-name"), color: "#FFFFFF" }
    : getProposalTextStyle(styles, "header-logo-name");
  const dateStyle = useLightText
    ? { ...getProposalTextStyle(styles, "header-date"), color: "#F3F4F6" }
    : getProposalTextStyle(styles, "header-date");
  const validityStyle = useLightText
    ? { ...getProposalTextStyle(styles, "header-validity"), color: "#F3F4F6" }
    : getProposalTextStyle(styles, "header-validity");
  const subtitleStyle = useLightText
    ? { ...getProposalTextStyle(styles, "header-subtitle"), color: "#D1D5DB" }
    : getProposalTextStyle(styles, "header-subtitle");

  return (
    <div
      className="relative overflow-hidden border-b border-line"
      style={{ backgroundColor: shellBackgroundColor }}
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backgroundImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      ) : null}
      {(hasImage || overlayOpacity > 0) && (
        <div
          className="absolute inset-0 pointer-events-none bg-black"
          style={{ opacity: Math.min(100, Math.max(0, overlayOpacity)) / 100 }}
        />
      )}

      <div className="relative z-10 px-6 sm:px-12 py-10 sm:py-14 flex justify-center">
        <div
          className="w-full max-w-3xl"
          style={{
            backgroundColor: contentIsTransparent
              ? "transparent"
              : contentBackgroundColor,
            padding: contentPadding,
            borderRadius: contentBorderRadius,
          }}
        >
          <div className="flex items-center justify-between gap-6 mb-12">
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 bg-white/10 border border-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : null}
              <div style={logoStyle} className="truncate">
                {studioName || styleContent(styles, "header-logo-name")}
              </div>
            </div>
            <div
              className={`text-right shrink-0 ${muted}`}
              style={subtitleStyle}
            >
              {styleContent(styles, "header-subtitle", "Proposal")}
            </div>
          </div>

          <h1 className="tracking-tight mb-3 max-w-3xl" style={titleStyle}>
            {styleContent(styles, "header-title", "Proposal")}
          </h1>

          <div className={`flex items-baseline gap-2 mb-10 text-[15px] ${muted}`}>
            <span className={label}>Prepared for</span>
            <div style={clientStyle}>
              {clientLabel || styleContent(styles, "header-client", "Client")}
            </div>
          </div>

          <div className={`grid grid-cols-2 gap-10 pt-8 border-t ${rule} max-w-xl`}>
            <div>
              <div
                className={`text-[11px] font-medium uppercase tracking-wide mb-1.5 ${label}`}
              >
                Proposal date
              </div>
              <div style={dateStyle}>
                {styleContent(styles, "header-date") ||
                  proposalDate ||
                  formatDateLabel(new Date().toISOString())}
              </div>
            </div>
            <div>
              <div
                className={`text-[11px] font-medium uppercase tracking-wide mb-1.5 ${label}`}
              >
                Valid until
              </div>
              <div style={validityStyle}>
                {styleContent(styles, "header-validity") ||
                  validUntil ||
                  "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderBlock(
  type: string,
  content: ProposalContentSnapshot,
  styles: StyleMap,
  currency: string
) {
  const textColor = styles["summary-text"]?.color || "#374151";

  switch (type) {
    case "summary":
      return (
        <SectionBody key={type}>
          <Heading styles={styles} id="summary-heading" className="mb-3" fallback="Executive summary" />
          <BodyText styles={styles} id="summary-text" className="max-w-3xl" />
        </SectionBody>
      );

    case "goals":
      return (
        <SectionBody key={type}>
          <Heading styles={styles} id="goals-heading" className="mb-2" fallback="Project goals" />
          <BodyText styles={styles} id="goals-intro" className="mb-8 max-w-2xl" />
          <BulletList
            color={textColor}
            items={asEntries(content.projectGoals)
              .map((item) => textOf(item))
              .filter(Boolean)}
          />
        </SectionBody>
      );

    case "scope":
      return (
        <SectionBody key={type}>
          <div className="mb-8 max-w-2xl">
            <Heading styles={styles} id="scope-heading" className="mb-2" fallback="Scope of work" />
            <BodyText styles={styles} id="scope-intro" />
          </div>
          <BulletList
            color={textColor}
            items={asEntries(content.scopeIncluded)
              .map((item) => textOf(item))
              .filter(Boolean)}
          />
        </SectionBody>
      );

    case "exclusions":
      return (
        <SectionBody key={type}>
          <Heading styles={styles} id="exclusions-heading" className="mb-2" fallback="What’s not included" />
          <BodyText styles={styles} id="exclusions-intro" className="mb-8 max-w-2xl" />
          <BulletList
            color={textColor}
            items={asEntries(content.scopeExcluded)
              .map((item) => textOf(item))
              .filter(Boolean)}
          />
        </SectionBody>
      );

    case "deliverables":
      return (
        <SectionBody key={type}>
          <div className="mb-8 max-w-2xl">
            <Heading styles={styles} id="deliverables-heading" className="mb-2" fallback="Deliverables" />
            <BodyText styles={styles} id="deliverables-intro" />
          </div>
          <BulletList
            color={textColor}
            items={asEntries(content.keyDeliverables)
              .map((item) => textOf(item))
              .filter(Boolean)}
          />
        </SectionBody>
      );

    case "approach": {
      const steps = asEntries(content.approachSteps)
        .map((item) => ({
          title: textOf(item, ["title", "text"]),
          description: textOf(item, ["description", "detail"]),
        }))
        .filter((item) => item.title || item.description);
      return (
        <SectionBody key={type}>
          <div className="mb-8 max-w-2xl">
            <Heading styles={styles} id="approach-heading" className="mb-2" fallback="Approach" />
            <BodyText styles={styles} id="approach-intro" />
          </div>
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li key={`${index}-${step.title}`} className="flex gap-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-[12px] font-semibold text-gray-600">
                  {index + 1}
                </span>
                <div>
                  <div
                    className="font-semibold"
                    style={{
                      ...getProposalTextStyle(styles, "approach-heading"),
                      fontSize: 16,
                      color: "#111827",
                    }}
                  >
                    {step.title}
                  </div>
                  {step.description ? (
                    <p
                      className="mt-1 whitespace-pre-wrap"
                      style={getProposalTextStyle(styles, "approach-intro")}
                    >
                      {step.description}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </SectionBody>
      );
    }

    case "timeline": {
      const phases = asEntries(content.timelinePhases)
        .map((item) => ({
          week: textOf(item, ["week"]),
          title: textOf(item, ["title", "text"]),
          detail: textOf(item, ["detail", "description"]),
        }))
        .filter((item) => item.title || item.detail);
      return (
        <SectionBody key={type}>
          <div className="mb-8 max-w-2xl">
            <Heading styles={styles} id="timeline-heading" className="mb-2" fallback="Timeline & milestones" />
            <BodyText styles={styles} id="timeline-intro" />
          </div>
          <div className="space-y-3">
            {phases.map((phase, index) => (
              <div
                key={`${index}-${phase.title}`}
                className="rounded-2xl border border-line bg-[#FAFBFC] px-5 py-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {phase.week ? (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {phase.week}
                    </span>
                  ) : null}
                  <span className="text-[15px] font-semibold text-gray-900">
                    {phase.title}
                  </span>
                </div>
                {phase.detail ? (
                  <p
                    className="mt-1.5 whitespace-pre-wrap"
                    style={getProposalTextStyle(styles, "timeline-intro")}
                  >
                    {phase.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionBody>
      );
    }

    case "pricing": {
      const lines = asEntries(content.lineItems)
        .map((item) => ({
          title: textOf(item, ["title", "description"]),
          description: textOf(item, ["description"]),
          qty: Number(item.qty || 1) || 1,
          price: Number(item.price || 0) || 0,
          unit: textOf(item, ["unit"]) || "flat",
        }))
        .filter((item) => item.title);
      if (!lines.length) return null;
      const total = lines.reduce((sum, line) => sum + line.qty * line.price, 0);
      return (
        <SectionBody key={type}>
          <h2
            className="mb-6"
            style={getProposalTextStyle(styles, "summary-heading")}
          >
            Pricing
          </h2>
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#FAFBFC] text-gray-400 uppercase tracking-wide text-[11px]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium text-right">Qty</th>
                  <th className="px-4 py-2.5 font-medium text-right">Price</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lines.map((line, index) => (
                  <tr key={`${index}-${line.title}`}>
                    <td className="px-4 py-3.5 align-top">
                      <div className="font-medium text-gray-900">{line.title}</div>
                      {line.description && line.description !== line.title ? (
                        <div className="mt-0.5 text-gray-500 whitespace-pre-wrap">
                          {line.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 text-right text-gray-600 tabular-nums whitespace-nowrap">
                      {line.qty}
                      {line.unit && line.unit !== "flat" ? ` ${line.unit}` : ""}
                    </td>
                    <td className="px-4 py-3.5 text-right text-gray-600 tabular-nums">
                      {formatMoneyLabel(line.price, currency)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-gray-900 tabular-nums">
                      {formatMoneyLabel(line.qty * line.price, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-[#FAFBFC]">
                  <td
                    colSpan={3}
                    className="px-4 py-3.5 text-right text-[13px] font-medium text-gray-500"
                  >
                    Total
                  </td>
                  <td className="px-4 py-3.5 text-right text-[16px] font-semibold text-gray-900 tabular-nums">
                    {formatMoneyLabel(total, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionBody>
      );
    }

    case "payment": {
      const milestones = asEntries(content.paymentMilestones)
        .map((item) => ({
          label: textOf(item, ["label", "title"]),
          pct: textOf(item, ["pct", "percent"]),
          when: textOf(item, ["when", "due"]),
        }))
        .filter((item) => item.label);
      return (
        <SectionBody key={type}>
          <Heading styles={styles} id="payment-heading" className="mb-2" fallback="Payment schedule" />
          <BodyText styles={styles} id="payment-intro" className="mb-6 max-w-2xl" />
          <div className="space-y-2">
            {milestones.map((m, index) => (
              <div
                key={`${index}-${m.label}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-line px-4 py-3.5"
              >
                <div>
                  <div className="text-[15px] font-semibold text-gray-900">
                    {m.label}
                  </div>
                  {m.when ? (
                    <div className="text-[13px] text-gray-500 mt-0.5">{m.when}</div>
                  ) : null}
                </div>
                {m.pct ? (
                  <div className="text-[15px] font-semibold text-gray-900">
                    {m.pct}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <BodyText styles={styles} id="payment-terms-note" className="mt-4" />
        </SectionBody>
      );
    }

    case "responsibilities":
      return (
        <SectionBody key={type}>
          <Heading
            styles={styles}
            id="responsibilities-heading"
            className="mb-2"
            fallback="Client responsibilities"
          />
          <BodyText styles={styles} id="responsibilities-intro" className="mb-8 max-w-2xl" />
          <BulletList
            color={textColor}
            items={asEntries(content.clientResponsibilities)
              .map((item) => textOf(item))
              .filter(Boolean)}
          />
        </SectionBody>
      );

    case "revisions":
      return (
        <SectionBody key={type}>
          <Heading
            styles={styles}
            id="revisions-heading"
            className="mb-3"
            fallback="Revisions & change requests"
          />
          <BodyText styles={styles} id="revisions-text" className="max-w-3xl" />
        </SectionBody>
      );

    case "terms": {
      const terms = asEntries(content.termEntries)
        .map((item) => ({
          title: textOf(item, ["title"]),
          body: textOf(item, ["body", "text"]),
        }))
        .filter((item) => item.title || item.body);
      return (
        <SectionBody key={type}>
          <Heading styles={styles} id="terms-heading" className="mb-2" fallback="Terms & conditions" />
          <BodyText styles={styles} id="terms-intro" className="mb-6 max-w-2xl" />
          <div className="space-y-5">
            {terms.map((term, index) => (
              <div key={`${index}-${term.title}`}>
                {term.title ? (
                  <h3 className="text-[15px] font-semibold text-gray-900">
                    {term.title}
                  </h3>
                ) : null}
                {term.body ? (
                  <p
                    className="mt-1 whitespace-pre-wrap"
                    style={getProposalTextStyle(styles, "terms-intro")}
                  >
                    {term.body}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionBody>
      );
    }

    case "next-steps":
      return (
        <SectionBody key={type}>
          <Heading styles={styles} id="next-steps-heading" className="mb-3" fallback="Next steps" />
          <BodyText styles={styles} id="next-steps-text" className="max-w-3xl" />
        </SectionBody>
      );

    case "signature":
      return (
        <SectionBody key={type}>
          <Heading styles={styles} id="signature-heading" className="mb-3" fallback="Acceptance" />
          <BodyText
            styles={styles}
            id="signature-intro"
            className="max-w-3xl"
            fallback="By signing below, the client agrees to this proposal, the scope described, and the attached terms."
          />
        </SectionBody>
      );

    case "about":
      return (
        <SectionBody key={type}>
          <Heading styles={styles} id="about-heading" className="mb-3" fallback="About" />
          <BodyText styles={styles} id="about-text" className="max-w-3xl" />
        </SectionBody>
      );

    default:
      return null;
  }
}

export function PublicProposalDocument({
  content,
  currency,
  organizationName,
  organizationLogoUrl,
  clientLabel,
  sentAt,
  expiresAt,
}: {
  content: unknown;
  currency: string;
  organizationName?: string | null;
  organizationLogoUrl?: string | null;
  clientLabel?: string | null;
  sentAt?: string | null;
  expiresAt?: string | null;
}) {
  const snapshot = asProposalContent(content as never);
  const styles = resolveElementStyles(snapshot);
  const { layout } = resolveHeaderLayout(snapshot);
  const blocks = blockTypesFromContent(snapshot).filter(
    (type) => type !== "image" && type !== "content"
  );
  const docCurrency = snapshot.currency || currency || "USD";

  return (
    <article className="mx-auto w-full max-w-[850px] bg-white shadow-sm border border-line overflow-hidden">
      <ThemedHeader
        styles={styles}
        layout={layout}
        logoUrl={organizationLogoUrl}
        studioName={
          organizationName || styleContent(styles, "header-logo-name") || ""
        }
        clientLabel={
          clientLabel || styleContent(styles, "header-client") || ""
        }
        proposalDate={formatDateLabel(sentAt)}
        validUntil={formatDateLabel(expiresAt)}
      />
      <div className="divide-y divide-line">
        {blocks.map((type) => renderBlock(type, snapshot, styles, docCurrency))}
      </div>
    </article>
  );
}
