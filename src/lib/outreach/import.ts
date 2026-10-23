import type { Database } from "@/types/database";
import {
  isValidEmail,
  normalizeEmail,
  type OutreachLeadTier,
  type OutreachResearchConfidence,
  type OutreachStatus,
} from "@/lib/outreach/constants";

export type OutreachLeadInsert =
  Database["public"]["Tables"]["outreach_leads"]["Insert"];

export type CsvImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  email: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  location: string | null;
  sourceUrl: string | null;
  leadTier: OutreachLeadTier;
  researchConfidence: OutreachResearchConfidence;
  websiteSummary: string | null;
  personalizedOpener: string | null;
  subjectLine: string | null;
  initialEmailBody: string | null;
  readyToSend: boolean;
  cautionNote: string | null;
  outreachStatus: OutreachStatus;
  valid: boolean;
  errors: string[];
};

export type CsvImportPreview = {
  rows: CsvImportRow[];
  headers: string[];
};

/** RFC4180-ish CSV parse — keeps newlines inside quoted fields. */
function parseCsv(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    if (ch === "\n" && !inQuotes) {
      cells.push(current.trim());
      if (cells.some((c) => c.length > 0)) rows.push(cells);
      cells = [];
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  if (cells.some((c) => c.length > 0)) rows.push(cells);
  return rows;
}

function headerKey(h: string) {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[?#()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADER_MAP: Record<string, keyof CsvImportRow | "skip"> = {
  "#": "skip",
  name: "displayName",
  "name / studio": "displayName",
  "display name": "displayName",
  "first name": "firstName",
  "last name": "lastName",
  email: "email",
  "public contact": "email",
  role: "role",
  location: "location",
  "source url": "sourceUrl",
  "lead tier": "leadTier",
  tier: "leadTier",
  // Prefer the dedicated confidence column when both exist (later wins in row loop).
  "research status": "researchConfidence",
  "research confidence": "researchConfidence",
  "website summary": "websiteSummary",
  "website / work summary": "websiteSummary",
  "personalized opener": "personalizedOpener",
  subject: "subjectLine",
  "subject launch version": "subjectLine",
  "first outreach email": "initialEmailBody",
  "first outreach email launch version": "initialEmailBody",
  "outreach email": "initialEmailBody",
  "ready to send": "readyToSend",
  caution: "cautionNote",
  "caution / next check": "cautionNote",
  "outreach status": "outreachStatus",
  status: "outreachStatus",
  "updated email review": "skip",
};

function mapTier(value: string): OutreachLeadTier {
  const v = value.trim().toLowerCase();
  if (v === "a" || v === "tier a" || v === "1") return "a";
  if (v === "c" || v === "tier c" || v === "3") return "c";
  return "b";
}

function mapConfidence(value: string): OutreachResearchConfidence {
  const v = value.trim().toLowerCase();
  if (v.includes("high")) return "high";
  if (v.includes("medium") || v.includes("med")) return "medium";
  if (v.includes("low")) return "low";
  return "unknown";
}

function mapStatus(value: string): OutreachStatus {
  const v = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (v === "ready") return "ready";
  if (v === "queued") return "queued";
  if (v === "contacted" || v === "sent") return "contacted";
  if (v === "replied") return "replied";
  if (v === "not_interested" || v === "not interested") return "not_interested";
  if (v === "bounced") return "bounced";
  return "new";
}

function truthy(value: string) {
  const v = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "ready"].includes(v);
}

function splitName(display: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!display) return { firstName: null, lastName: null };
  const parts = display.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function previewOutreachCsv(text: string): CsvImportPreview {
  const matrix = parseCsv(text);
  if (matrix.length < 2) {
    return { headers: matrix[0] || [], rows: [] };
  }
  const headers = matrix[0];
  const keyIndex = headers.map((h) => HEADER_MAP[headerKey(h)] || null);

  const rows: CsvImportRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = cells[idx] ?? "";
    });

    let email = "";
    let displayName: string | null = null;
    let firstName: string | null = null;
    let lastName: string | null = null;
    let role: string | null = null;
    let location: string | null = null;
    let sourceUrl: string | null = null;
    let leadTier: OutreachLeadTier = "b";
    let researchConfidence: OutreachResearchConfidence = "unknown";
    let websiteSummary: string | null = null;
    let personalizedOpener: string | null = null;
    let subjectLine: string | null = null;
    let initialEmailBody: string | null = null;
    let readyToSend = false;
    let cautionNote: string | null = null;
    let outreachStatus: OutreachStatus = "new";

    keyIndex.forEach((mapped, idx) => {
      if (!mapped || mapped === "skip") return;
      const value = (cells[idx] ?? "").trim();
      if (!value) return;
      switch (mapped) {
        case "email":
          email = value;
          break;
        case "displayName":
          displayName = value;
          break;
        case "firstName":
          firstName = value;
          break;
        case "lastName":
          lastName = value;
          break;
        case "role":
          role = value;
          break;
        case "location":
          location = value;
          break;
        case "sourceUrl":
          sourceUrl = value;
          break;
        case "leadTier":
          leadTier = mapTier(value);
          break;
        case "researchConfidence":
          researchConfidence = mapConfidence(value);
          break;
        case "websiteSummary":
          websiteSummary = value;
          break;
        case "personalizedOpener":
          personalizedOpener = value;
          break;
        case "subjectLine":
          subjectLine = value;
          break;
        case "initialEmailBody":
          initialEmailBody = value;
          break;
        case "readyToSend":
          readyToSend = truthy(value);
          break;
        case "cautionNote":
          cautionNote = value;
          break;
        case "outreachStatus":
          outreachStatus = mapStatus(value);
          break;
        default:
          break;
      }
    });

    if (!firstName && !lastName && displayName) {
      const split = splitName(displayName);
      firstName = split.firstName;
      lastName = split.lastName;
    }
    if (!displayName) {
      displayName = [firstName, lastName].filter(Boolean).join(" ") || null;
    }

    const errors: string[] = [];
    const contactRaw = email;
    const hasRealEmail = Boolean(email) && isValidEmail(email);

    // Contact-form / phone-only rows: keep the lead, mark not sendable.
    if (!hasRealEmail) {
      const slug = (displayName || sourceUrl || `row-${i + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48);
      email = `nopublic+${i + 1}-${slug || "lead"}@import.rebban.invalid`;
      readyToSend = false;
      outreachStatus = "new";
      const note = contactRaw
        ? `No public email — contact listed as: ${contactRaw}`
        : "No public email on research sheet";
      cautionNote = cautionNote ? `${cautionNote} · ${note}` : note;
    }

    if (readyToSend && outreachStatus === "new") outreachStatus = "ready";

    rows.push({
      rowNumber: i + 1,
      raw,
      email,
      displayName,
      firstName,
      lastName,
      role,
      location,
      sourceUrl,
      leadTier,
      researchConfidence,
      websiteSummary,
      personalizedOpener,
      subjectLine,
      initialEmailBody,
      readyToSend,
      cautionNote,
      outreachStatus,
      valid: errors.length === 0,
      errors,
    });
  }

  return { headers, rows };
}

export function rowToLeadInsert(
  row: CsvImportRow,
  userId: string | null
): OutreachLeadInsert {
  const websiteUrl =
    row.sourceUrl && /^https?:\/\//i.test(row.sourceUrl) ? row.sourceUrl : null;
  return {
    email: normalizeEmail(row.email),
    display_name: row.displayName,
    first_name: row.firstName,
    last_name: row.lastName,
    role: row.role,
    location: row.location,
    source_url: row.sourceUrl,
    website_url: websiteUrl,
    source_type: "csv_import",
    lead_tier: row.leadTier,
    research_confidence: row.researchConfidence,
    website_summary: row.websiteSummary,
    personalized_opener: row.personalizedOpener,
    subject_line: row.subjectLine,
    initial_email_body: row.initialEmailBody,
    ready_to_send: row.readyToSend,
    caution_note: row.cautionNote,
    outreach_status: row.outreachStatus,
    created_by: userId,
  };
}
