import { createHash, randomBytes } from "crypto";
import type { InvoicePdfInput, InvoicePdfLine } from "@/lib/invoices/pdf";
import {
  computeInvoiceTotals,
  formatInvoiceMoney,
  lineAmount,
} from "@/lib/invoices/totals";
import type { Json } from "@/types/database";
import {
  assertAllowedOrigin,
  freeProposalCorsHeaders,
  freeProposalOptions,
  isValidEmail,
  jsonWithCors,
} from "@/lib/free-proposal/public";

export {
  assertAllowedOrigin,
  freeProposalCorsHeaders as freeInvoiceCorsHeaders,
  freeProposalOptions as freeInvoiceOptions,
  isValidEmail,
  jsonWithCors,
};

export function clientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}

export function hashIp(ip: string | null) {
  if (!ip) return null;
  return createHash("sha256").update(`free-invoice:${ip}`).digest("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createDownloadToken() {
  return randomBytes(32).toString("hex");
}

export type FreeInvoiceLineInput = {
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
};

export type FreeInvoiceGenerateBody = {
  fromName?: string;
  fromEmail?: string;
  fromAddress?: string;
  taxId?: string;
  billToName?: string;
  billToCompany?: string;
  billToEmail?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  notes?: string;
  taxEnabled?: boolean;
  taxRate?: number | string;
  lines?: FreeInvoiceLineInput[];
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(value: string | undefined, fallback: string) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
}

export function buildInvoicePayload(
  body: FreeInvoiceGenerateBody
): { payload: InvoicePdfInput; error?: string } {
  const fromName = String(body.fromName || "").trim().slice(0, 160);
  const fromEmail = String(body.fromEmail || "").trim().slice(0, 254);
  const fromAddress = String(body.fromAddress || "").trim().slice(0, 400);
  const taxId = String(body.taxId || "").trim().slice(0, 80);
  const billToName = String(body.billToName || "").trim().slice(0, 160);
  const billToCompany = String(body.billToCompany || "").trim().slice(0, 160);
  const billToEmail = String(body.billToEmail || "").trim().slice(0, 254);
  const currency = String(body.currency || "USD")
    .trim()
    .toUpperCase()
    .slice(0, 8);
  const notes = String(body.notes || "").trim().slice(0, 2000);
  const invoiceNumber =
    String(body.invoiceNumber || "").trim().slice(0, 40) ||
    `INV-${Date.now().toString().slice(-6)}`;
  const issueDate = parseDate(body.issueDate, todayIsoDate());
  const dueDate = parseDate(body.dueDate, issueDate);
  const taxEnabled = Boolean(body.taxEnabled);
  const taxRate = Math.min(100, Math.max(0, Number(body.taxRate) || 0));

  if (!fromName) {
    return { payload: null as never, error: "Your name / business is required." };
  }
  if (!billToName && !billToCompany) {
    return {
      payload: null as never,
      error: "Client name or company is required.",
    };
  }

  const rawLines = Array.isArray(body.lines) ? body.lines.slice(0, 40) : [];
  const lines: InvoicePdfLine[] = [];
  for (const line of rawLines) {
    const description = String(line?.description || "").trim().slice(0, 300);
    const quantity = Number(line?.quantity);
    const unitPrice = Number(line?.unitPrice);
    if (!description) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) continue;
    lines.push({
      description,
      quantity,
      unitPrice,
      amount: lineAmount(quantity, unitPrice),
    });
  }

  if (lines.length === 0) {
    return {
      payload: null as never,
      error: "Add at least one line item with description, quantity, and price.",
    };
  }

  const totals = computeInvoiceTotals(lines, {
    taxEnabled,
    taxRate,
    pricesIncludeTax: false,
  });

  const payload: InvoicePdfInput = {
    number: invoiceNumber,
    issueDate,
    dueDate,
    currency: currency || "USD",
    notes: notes || null,
    fromName,
    fromAddress: fromAddress || null,
    fromEmail: fromEmail || null,
    taxId: taxId || null,
    showTaxId: Boolean(taxId),
    billToName: billToName || null,
    billToCompany: billToCompany || null,
    billToEmail: billToEmail || null,
    lines,
    subtotal: totals.subtotal,
    taxEnabled,
    taxRate,
    taxTotal: totals.taxTotal,
    total: totals.total,
    pricesIncludeTax: false,
  };

  return { payload };
}

export function payloadToJson(payload: InvoicePdfInput): Json {
  return payload as unknown as Json;
}

export function payloadFromJson(value: Json | null | undefined): InvoicePdfInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.lines) || typeof raw.fromName !== "string") return null;
  return value as unknown as InvoicePdfInput;
}

export function buildInvoicePreview(payload: InvoicePdfInput) {
  return {
    number: payload.number,
    fromName: payload.fromName,
    billTo:
      payload.billToCompany &&
      payload.billToName &&
      payload.billToCompany !== payload.billToName
        ? `${payload.billToName} · ${payload.billToCompany}`
        : payload.billToCompany || payload.billToName || "Client",
    currency: payload.currency,
    totalLabel: formatInvoiceMoney(payload.total, payload.currency),
    lineCount: payload.lines.length,
    issueDate: payload.issueDate,
    dueDate: payload.dueDate,
  };
}

export function freeInvoicePdfFilename(number: string | null) {
  const base = (number || "invoice")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
  return `${base || "invoice"}.pdf`;
}
