import { asProposalContent } from "@/lib/proposals/content";
import type { Enums } from "@/types/database";

export type ProjectBillingType = Enums<"project_billing_type">;

export type InvoiceKind = "none" | "deposit" | "retainer" | "full";

export function billingTypeFromProposalContent(
  content: unknown,
  fallback: ProjectBillingType = "fixed"
): ProjectBillingType {
  const snapshot = asProposalContent(content as never);
  const raw = snapshot.pricingType;
  if (
    raw === "fixed" ||
    raw === "hourly" ||
    raw === "daily" ||
    raw === "retainer" ||
    raw === "mixed"
  ) {
    return raw;
  }
  return fallback;
}

export function defaultDepositAmount(total: number, content: unknown) {
  const amount = Math.max(0, Number(total) || 0);
  const snapshot = asProposalContent(content as never);
  const milestones = Array.isArray(snapshot.paymentMilestones)
    ? snapshot.paymentMilestones
    : [];
  for (const raw of milestones) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const label = String(item.label || item.title || "").toLowerCase();
    const pctRaw = String(item.pct || item.percent || "").replace(/[^\d.]/g, "");
    const pct = Number(pctRaw);
    if (label.includes("deposit") && pct > 0 && pct <= 100) {
      return Math.round(amount * (pct / 100) * 100) / 100;
    }
  }
  if (amount <= 0) return 0;
  return Math.round(amount * 0.3 * 100) / 100;
}

export function nextRetainerInvoiceAt(dayOfMonth: number, from = new Date()) {
  const day = Math.min(28, Math.max(1, Math.floor(dayOfMonth) || 1));
  const base = new Date(from);
  let year = base.getUTCFullYear();
  let month = base.getUTCMonth();
  // If today's day is on/after billing day, schedule next month.
  if (base.getUTCDate() >= day) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return new Date(Date.UTC(year, month, day, 9, 0, 0));
}

export function advanceRetainerInvoiceAt(dayOfMonth: number, fromIso: string) {
  const from = new Date(fromIso);
  const day = Math.min(28, Math.max(1, Math.floor(dayOfMonth) || 1));
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth() + 1;
  if (month > 11) {
    month = 0;
    year += 1;
  }
  return new Date(Date.UTC(year, month, day, 9, 0, 0));
}

export function billingTypeLabel(type: ProjectBillingType) {
  switch (type) {
    case "retainer":
      return "Retainer";
    case "hourly":
      return "Hourly";
    case "daily":
      return "Daily";
    case "mixed":
      return "Mixed";
    default:
      return "Fixed";
  }
}
