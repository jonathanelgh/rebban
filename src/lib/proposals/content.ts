import type { Json } from "@/types/database";

export type ProposalHeaderTheme =
  | "cover"
  | "classic"
  | "pastel"
  | "alpine"
  | "splash"
  | "auburn";

export type ProposalContentSnapshot = {
  version: 1;
  headerTheme?: ProposalHeaderTheme;
  headerLayout?: Record<string, unknown>;
  blockTypes?: string[];
  blocks?: Array<{ type: string; variant?: string | null }>;
  elementStyles?: Record<string, unknown>;
  lineItems?: unknown[];
  currency?: string;
  pricingType?: "fixed" | "hourly" | "daily" | "retainer" | "mixed";
  scopeIncluded?: unknown[];
  scopeExcluded?: unknown[];
  timelinePhases?: unknown[];
  paymentMilestones?: unknown[];
  termEntries?: unknown[];
  projectGoals?: unknown[];
  keyDeliverables?: unknown[];
  approachSteps?: unknown[];
  clientResponsibilities?: unknown[];
  aboutStats?: unknown[];
  sectionStyles?: Record<string, unknown>;
  sectionElements?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export function asProposalContent(value: Json | null | undefined): ProposalContentSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: 1 };
  }
  return { version: 1, ...(value as Record<string, unknown>) } as ProposalContentSnapshot;
}

export function toProposalContentJson(
  snapshot: ProposalContentSnapshot
): Json {
  return snapshot as unknown as Json;
}

export function blockTypesFromContent(content: ProposalContentSnapshot): string[] {
  if (content.blocks?.length) {
    return content.blocks.map((b) => b.type);
  }
  if (content.blockTypes?.length) {
    return content.blockTypes;
  }
  return [
    "summary",
    "goals",
    "scope",
    "deliverables",
    "approach",
    "timeline",
    "pricing",
    "payment",
    "exclusions",
    "responsibilities",
    "revisions",
    "terms",
    "next-steps",
    "signature",
  ];
}
