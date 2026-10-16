import type { Database } from "@/types/database";

export type OutreachStatus = Database["public"]["Enums"]["outreach_status"];
export type OutreachTemperature =
  Database["public"]["Enums"]["outreach_temperature"];
export type OutreachLeadTier = Database["public"]["Enums"]["outreach_lead_tier"];
export type OutreachResearchConfidence =
  Database["public"]["Enums"]["outreach_research_confidence"];

export const OUTREACH_STATUSES: OutreachStatus[] = [
  "new",
  "ready",
  "queued",
  "contacted",
  "replied",
  "not_interested",
  "bounced",
];

export const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  new: "New",
  ready: "Ready",
  queued: "Queued",
  contacted: "Contacted",
  replied: "Replied",
  not_interested: "Not interested",
  bounced: "Bounced",
};

export const TEMPERATURE_LABELS: Record<OutreachTemperature, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export const TIER_LABELS: Record<OutreachLeadTier, string> = {
  a: "A",
  b: "B",
  c: "C",
};

export { normalizeEmail, isValidEmail } from "./safety-core";

export function statusTone(status: OutreachStatus) {
  switch (status) {
    case "ready":
    case "queued":
      return "bg-[#EFF6FF] text-[#2563EB]";
    case "contacted":
      return "bg-violet-50 text-violet-700";
    case "replied":
      return "bg-emerald-50 text-emerald-700";
    case "not_interested":
    case "bounced":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-[#FAFBFC] text-gray-600";
  }
}

export function temperatureTone(temp: OutreachTemperature | null | undefined) {
  if (temp === "hot") return "bg-red-50 text-red-700";
  if (temp === "warm") return "bg-amber-50 text-amber-800";
  if (temp === "cold") return "bg-sky-50 text-sky-700";
  return "bg-gray-100 text-gray-500";
}
