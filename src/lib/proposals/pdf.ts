import PDFDocument from "pdfkit";
import { drawRebbanSigil } from "@/lib/brand/rebban-sigil";
import {
  asProposalContent,
  blockTypesFromContent,
  type ProposalContentSnapshot,
} from "@/lib/proposals/content";
import { formatMoneyLabel } from "@/lib/proposals/documentHash";

export type SignedProposalPdfEvent = {
  event_type: string;
  actor_type?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
};

export type SignedProposalPdfInput = {
  title: string;
  amount: number;
  currency: string;
  content: unknown;
  organizationName: string;
  senderName?: string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  sentAt?: string | null;
  expiresAt?: string | null;
  signature: {
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
  events: SignedProposalPdfEvent[];
  publicUrl?: string | null;
};

type StyleMap = Record<string, { content?: string }>;

/** Read copy from proposal elementStyles only — no theme/React deps (email/PDF route safe). */
function elementStyleMap(content: ProposalContentSnapshot): StyleMap {
  const raw = content.elementStyles;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StyleMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const contentValue = (value as { content?: unknown }).content;
    if (typeof contentValue === "string") {
      out[key] = { content: contentValue };
    }
  }
  return out;
}

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

function formatStamp(iso: string | null | undefined) {
  if (!iso) return "—";
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

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
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
      return "Proposal opened";
    case "signed":
      return "Electronically signed";
    case "accepted":
      return "Proposal accepted";
    case "declined":
      return "Proposal declined";
    case "followup_sent":
    case "follow_up_sent":
      return "Follow-up sent";
    default:
      return type.replace(/_/g, " ");
  }
}

function dataUrlToBuffer(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match?.[2]) return null;
  try {
    return Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
}

function ensureSpace(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  needed: number,
  bottom = 72
) {
  if (y + needed <= doc.page.height - bottom) return y;
  doc.addPage();
  return doc.page.margins.top;
}

type Section = { heading: string; body?: string; bullets?: string[] };

function collectSections(
  snapshot: ProposalContentSnapshot,
  styles: StyleMap,
  currency: string
): Section[] {
  const sections: Section[] = [];
  const blocks = blockTypesFromContent(snapshot).filter(
    (type) => !["image", "content", "header", "two-column", "media-text"].includes(type)
  );

  for (const type of blocks) {
    switch (type) {
      case "summary":
        sections.push({
          heading: styleContent(styles, "summary-heading", "Executive summary"),
          body: styleContent(styles, "summary-text"),
        });
        break;
      case "goals":
        sections.push({
          heading: styleContent(styles, "goals-heading", "Project goals"),
          body: styleContent(styles, "goals-intro"),
          bullets: asEntries(snapshot.projectGoals)
            .map((item) => textOf(item))
            .filter(Boolean),
        });
        break;
      case "scope":
        sections.push({
          heading: styleContent(styles, "scope-heading", "Scope of work"),
          body: styleContent(styles, "scope-intro"),
          bullets: asEntries(snapshot.scopeIncluded)
            .map((item) => textOf(item))
            .filter(Boolean),
        });
        break;
      case "exclusions":
        sections.push({
          heading: styleContent(styles, "exclusions-heading", "What’s not included"),
          body: styleContent(styles, "exclusions-intro"),
          bullets: asEntries(snapshot.scopeExcluded)
            .map((item) => textOf(item))
            .filter(Boolean),
        });
        break;
      case "deliverables":
        sections.push({
          heading: styleContent(styles, "deliverables-heading", "Deliverables"),
          body: styleContent(styles, "deliverables-intro"),
          bullets: asEntries(snapshot.keyDeliverables)
            .map((item) => textOf(item))
            .filter(Boolean),
        });
        break;
      case "approach": {
        const steps = asEntries(snapshot.approachSteps)
          .map((item) => {
            const title = textOf(item, ["title", "text"]);
            const description = textOf(item, ["description", "detail"]);
            return [title, description].filter(Boolean).join(" — ");
          })
          .filter(Boolean);
        sections.push({
          heading: styleContent(styles, "approach-heading", "Approach"),
          body: styleContent(styles, "approach-intro"),
          bullets: steps,
        });
        break;
      }
      case "timeline": {
        const phases = asEntries(snapshot.timelinePhases)
          .map((item) => {
            const week = textOf(item, ["week"]);
            const title = textOf(item, ["title", "text"]);
            const detail = textOf(item, ["detail", "description"]);
            return [week, title, detail].filter(Boolean).join(" — ");
          })
          .filter(Boolean);
        sections.push({
          heading: styleContent(
            styles,
            "timeline-heading",
            "Timeline & milestones"
          ),
          body: styleContent(styles, "timeline-intro"),
          bullets: phases,
        });
        break;
      }
      case "pricing": {
        const lines = asEntries(snapshot.lineItems)
          .map((item) => {
            const title = textOf(item, ["title", "description"]);
            const qty = Number(item.qty || 1) || 1;
            const price = Number(item.price || 0) || 0;
            if (!title) return "";
            return `${title} — ${qty} × ${formatMoneyLabel(price, currency)} = ${formatMoneyLabel(qty * price, currency)}`;
          })
          .filter(Boolean);
        const total = asEntries(snapshot.lineItems).reduce((sum, item) => {
          const qty = Number(item.qty || 1) || 1;
          const price = Number(item.price || 0) || 0;
          return sum + qty * price;
        }, 0);
        sections.push({
          heading: "Pricing",
          body: lines.length
            ? `Total: ${formatMoneyLabel(total, currency)}`
            : undefined,
          bullets: lines,
        });
        break;
      }
      case "payment": {
        const milestones = asEntries(snapshot.paymentMilestones)
          .map((item) => {
            const label = textOf(item, ["label", "title"]);
            const pct = textOf(item, ["pct", "percent"]);
            const when = textOf(item, ["when", "due"]);
            return [label, pct, when].filter(Boolean).join(" — ");
          })
          .filter(Boolean);
        sections.push({
          heading: styleContent(styles, "payment-heading", "Payment schedule"),
          body: [
            styleContent(styles, "payment-intro"),
            styleContent(styles, "payment-terms-note"),
          ]
            .filter(Boolean)
            .join("\n\n"),
          bullets: milestones,
        });
        break;
      }
      case "responsibilities":
        sections.push({
          heading: styleContent(
            styles,
            "responsibilities-heading",
            "Client responsibilities"
          ),
          body: styleContent(styles, "responsibilities-intro"),
          bullets: asEntries(snapshot.clientResponsibilities)
            .map((item) => textOf(item))
            .filter(Boolean),
        });
        break;
      case "revisions":
        sections.push({
          heading: styleContent(
            styles,
            "revisions-heading",
            "Revisions & change requests"
          ),
          body: styleContent(styles, "revisions-text"),
        });
        break;
      case "terms": {
        const terms = asEntries(snapshot.termEntries)
          .map((item) => {
            const title = textOf(item, ["title"]);
            const body = textOf(item, ["body", "text"]);
            return [title, body].filter(Boolean).join(" — ");
          })
          .filter(Boolean);
        sections.push({
          heading: styleContent(styles, "terms-heading", "Terms & conditions"),
          body: styleContent(styles, "terms-intro"),
          bullets: terms,
        });
        break;
      }
      case "next-steps":
        sections.push({
          heading: styleContent(styles, "next-steps-heading", "Next steps"),
          body: styleContent(styles, "next-steps-text"),
        });
        break;
      case "signature":
        sections.push({
          heading: styleContent(styles, "signature-heading", "Acceptance"),
          body: styleContent(
            styles,
            "signature-intro",
            "By signing, the client agrees to this proposal, the scope described, and the attached terms."
          ),
        });
        break;
      case "about":
        sections.push({
          heading: styleContent(styles, "about-heading", "About"),
          body: styleContent(styles, "about-text"),
        });
        break;
      default:
        break;
    }
  }

  return sections.filter(
    (section) =>
      section.heading ||
      section.body ||
      (section.bullets && section.bullets.length > 0)
  );
}

export async function buildSignedProposalPdf(
  input: SignedProposalPdfInput
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: `${input.title} (Signed)`,
        Author: input.organizationName,
        Creator: "Rebban",
        Subject: "Electronically signed proposal",
        Keywords: `rebban,e-signature,${input.signature.id},${input.signature.document_hash}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const accent = "#2563EB";
    const ink = "#1A1D23";
    const muted = "#6B7280";
    const rule = "#E2E5EA";
    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    const snapshot = asProposalContent(input.content as never);
    const styles = elementStyleMap(snapshot);
    const currency = snapshot.currency || input.currency || "USD";
    const amountLabel = formatMoneyLabel(Number(input.amount || 0), currency);
    const preparedFor =
      input.clientCompany &&
      input.clientName &&
      input.clientCompany !== input.clientName
        ? `${input.clientName} · ${input.clientCompany}`
        : input.clientCompany || input.clientName || input.signature.signer_name;

    // ── Cover / proposal body ──────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 6).fill(accent);

    let y = doc.page.margins.top;
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(9)
      .text("PROPOSAL", left, y);
    y = doc.y + 10;

    doc
      .fillColor(ink)
      .font("Helvetica-Bold")
      .fontSize(22)
      .text(input.title || "Proposal", left, y, { width: pageWidth });
    y = doc.y + 10;

    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(10)
      .text(`From ${input.organizationName}`, left, y, { width: pageWidth * 0.6 });
    doc.text(amountLabel, left + pageWidth * 0.55, y, {
      width: pageWidth * 0.45,
      align: "right",
    });
    y = Math.max(doc.y, y + 14) + 4;

    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(10)
      .text(`Prepared for ${preparedFor}`, left, y, { width: pageWidth });
    y = doc.y + 4;
    doc.text(
      `Proposal date ${formatDate(input.sentAt)} · Valid until ${formatDate(input.expiresAt)}`,
      left,
      y,
      { width: pageWidth }
    );
    y = doc.y + 14;

    doc
      .moveTo(left, y)
      .lineTo(left + pageWidth, y)
      .strokeColor(rule)
      .lineWidth(1)
      .stroke();
    y += 18;

    const sections = collectSections(snapshot, styles, currency);
    for (const section of sections) {
      y = ensureSpace(doc, y, 80);
      doc
        .fillColor(ink)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(section.heading, left, y, { width: pageWidth });
      y = doc.y + 6;

      if (section.body?.trim()) {
        y = ensureSpace(doc, y, 40);
        doc
          .fillColor(ink)
          .font("Helvetica")
          .fontSize(10)
          .text(section.body.trim(), left, y, {
            width: pageWidth,
            lineGap: 2,
          });
        y = doc.y + 8;
      }

      if (section.bullets?.length) {
        for (const bullet of section.bullets) {
          y = ensureSpace(doc, y, 28);
          doc
            .fillColor(ink)
            .font("Helvetica")
            .fontSize(10)
            .text(`•  ${bullet}`, left + 4, y, {
              width: pageWidth - 4,
              lineGap: 1.5,
            });
          y = doc.y + 4;
        }
        y += 6;
      } else {
        y += 6;
      }
    }

    // ── Certificate / verification page ────────────────────────────────
    doc.addPage();
    doc.rect(0, 0, doc.page.width, 6).fill(accent);
    y = doc.page.margins.top;

    // Verification badge row: Rebban.com sigil + certificate title
    const stampX = left;
    const stampW = pageWidth;
    const bannerH = 124;
    doc.roundedRect(stampX, y, stampW, bannerH, 14).fill("#F8FAFC");
    doc
      .roundedRect(stampX, y, stampW, bannerH, 14)
      .lineWidth(1)
      .strokeColor(rule)
      .stroke();

    const sigilCx = stampX + 70;
    const sigilCy = y + bannerH / 2;
    drawRebbanSigil(doc, sigilCx, sigilCy, 48, {
      fill: ink,
      ink,
      accent,
    });

    const copyX = stampX + 130;
    const copyW = stampW - 148;
    doc
      .fillColor(accent)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("REBBAN.COM VERIFICATION BADGE", copyX, y + 28, {
        width: copyW,
        characterSpacing: 0.8,
      });
    doc
      .fillColor(ink)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("Certificate of Completion", copyX, y + 44, {
        width: copyW,
      });
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(10)
      .text(
        "This proposal was electronically signed through Rebban. The sigil certifies the document fingerprint and signing audit log on this page.",
        copyX,
        y + 68,
        { width: copyW, lineGap: 1.5 }
      );
    y += bannerH + 22;

    doc
      .fillColor(ink)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Document", left, y);
    y = doc.y + 8;

    const metaRows: Array<[string, string]> = [
      ["Title", input.title || "Proposal"],
      ["Issued by", input.organizationName],
      ["Amount", amountLabel],
      ["Signature ID", input.signature.id],
      ["Document hash (SHA-256)", input.signature.document_hash],
      ["Signed at", formatStamp(input.signature.signed_at)],
    ];
    if (input.publicUrl) {
      metaRows.push(["Public record link", input.publicUrl]);
    }

    for (const [label, value] of metaRows) {
      y = ensureSpace(doc, y, 28);
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(8)
        .text(label.toUpperCase(), left, y);
      y = doc.y + 2;
      doc
        .fillColor(ink)
        .font("Helvetica")
        .fontSize(9)
        .text(value, left, y, { width: pageWidth });
      y = doc.y + 8;
    }

    y += 6;
    y = ensureSpace(doc, y, 120);
    doc
      .fillColor(ink)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Signer", left, y);
    y = doc.y + 8;

    const signerRows: Array<[string, string]> = [
      ["Full legal name", input.signature.signer_name],
      ["Email", input.signature.signer_email],
    ];
    if (input.signature.signer_title) {
      signerRows.push(["Title", input.signature.signer_title]);
    }
    if (input.signature.signer_company) {
      signerRows.push(["Company", input.signature.signer_company]);
    }
    signerRows.push([
      "Signature method",
      input.signature.signature_type === "drawn"
        ? "Drawn electronic signature"
        : "Typed electronic signature",
    ]);
    if (input.signature.ip_address) {
      signerRows.push(["IP address", input.signature.ip_address]);
    }
    if (input.signature.user_agent) {
      signerRows.push(["User agent", input.signature.user_agent]);
    }

    for (const [label, value] of signerRows) {
      y = ensureSpace(doc, y, 28);
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(8)
        .text(label.toUpperCase(), left, y);
      y = doc.y + 2;
      doc
        .fillColor(ink)
        .font("Helvetica")
        .fontSize(9)
        .text(value, left, y, { width: pageWidth });
      y = doc.y + 8;
    }

    y += 4;
    y = ensureSpace(doc, y, 100);
    doc
      .fillColor(ink)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Signature", left, y);
    y = doc.y + 8;

    const imageBuf = dataUrlToBuffer(input.signature.signature_image);
    if (imageBuf) {
      try {
        doc.image(imageBuf, left, y, { height: 56, fit: [220, 56] });
        y += 64;
      } catch {
        // fall through to typed text
      }
    }
    if (!imageBuf && input.signature.signature_text) {
      doc
        .fillColor(ink)
        .font("Times-Italic")
        .fontSize(22)
        .text(input.signature.signature_text, left, y, { width: pageWidth });
      y = doc.y + 10;
    }

    if (input.signature.consent_text?.trim()) {
      y = ensureSpace(doc, y, 70);
      doc
        .fillColor(ink)
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("Consent", left, y);
      y = doc.y + 6;
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(9)
        .text(input.signature.consent_text.trim(), left, y, {
          width: pageWidth,
          lineGap: 1.5,
        });
      y = doc.y + 14;
    }

    y = ensureSpace(doc, y, 100);
    doc
      .fillColor(ink)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Audit log", left, y);
    y = doc.y + 8;

    const events =
      input.events?.length > 0
        ? input.events
        : [
            {
              event_type: "signed",
              actor_name: input.signature.signer_name,
              actor_email: input.signature.signer_email,
              ip_address: input.signature.ip_address,
              created_at: input.signature.signed_at,
            },
          ];

    for (const event of events) {
      y = ensureSpace(doc, y, 42);
      doc
        .fillColor(ink)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(eventLabel(event.event_type), left, y, { width: pageWidth * 0.55 });
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(8)
        .text(formatStamp(event.created_at), left + pageWidth * 0.55, y, {
          width: pageWidth * 0.45,
          align: "right",
        });
      y = doc.y + 2;
      const actor = [event.actor_name, event.actor_email]
        .filter(Boolean)
        .join(" · ");
      const detail = [actor, event.ip_address ? `IP ${event.ip_address}` : null]
        .filter(Boolean)
        .join(" · ");
      if (detail) {
        doc
          .fillColor(muted)
          .font("Helvetica")
          .fontSize(8)
          .text(detail, left, y, { width: pageWidth });
        y = doc.y + 8;
      } else {
        y += 8;
      }
    }

    y = ensureSpace(doc, y, 90);
    y += 8;
    doc
      .moveTo(left, y)
      .lineTo(left + pageWidth, y)
      .strokeColor(rule)
      .stroke();
    y += 12;
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Electronic signature notice: The parties agree that this electronic signature is the legal equivalent of a handwritten signature under applicable law, including the U.S. ESIGN Act and similar electronic commerce frameworks (including eIDAS where applicable). Rebban records the document fingerprint, signer identity, consent statement, timestamps, and network metadata above to support authenticity and non-repudiation. Do not alter this PDF; any change invalidates the document hash verification.",
        left,
        y,
        { width: pageWidth, lineGap: 1.5 }
      );

    // Compact sigil stamp in the footer corner
    drawRebbanSigil(doc, left + 28, doc.page.height - 52, 22, {
      fill: ink,
      ink,
      accent,
    });
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(8)
      .text(
        `Verified by Rebban.com · Signature ${input.signature.id.slice(0, 8)}… · Hash ${input.signature.document_hash.slice(0, 12)}…`,
        left + 58,
        doc.page.height - 56,
        { width: pageWidth - 58 }
      );

    doc.end();
  });
}

export function signedProposalPdfFilename(title: string) {
  const base = (title || "proposal")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
  return `${base || "proposal"}_signed.pdf`;
}
