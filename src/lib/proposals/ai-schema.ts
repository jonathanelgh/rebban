import {
  mergeElementStyles,
  type ProposalContentSnapshot,
} from "@/lib/proposals/content";

export type ProposalAiCopy = {
  title: string;
  headerSubtitle?: string;
  summary: string;
  goalsIntro?: string;
  goals: string[];
  scopeIntro?: string;
  scopeIncluded: string[];
  scopeExcluded: string[];
  deliverablesIntro?: string;
  deliverables: string[];
  approachIntro?: string;
  approachSteps: Array<{ title: string; description: string }>;
  timelineIntro?: string;
  timelinePhases: Array<{ week: string; title: string; detail: string }>;
  pricingType: "fixed" | "hourly" | "daily" | "retainer" | "mixed";
  lineItems: Array<{
    title: string;
    description: string;
    qty: number;
    price: number;
    unit: "hr" | "flat" | "day";
  }>;
  paymentIntro?: string;
  paymentMilestones: Array<{ label: string; pct: string; when: string }>;
  paymentTermsNote?: string;
  revisionsText?: string;
  responsibilitiesIntro?: string;
  clientResponsibilities: string[];
  termsIntro?: string;
  termEntries: Array<{ title: string; body: string }>;
  nextStepsText?: string;
  signatureIntro?: string;
  estimatedTotal?: number;
  currency?: string;
};

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asStringArray(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, max);
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function parseProposalAiCopy(raw: unknown): ProposalAiCopy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("AI returned an invalid proposal payload.");
  }
  const o = raw as Record<string, unknown>;

  const pricingRaw = asString(o.pricingType || o.pricing_type, "fixed").toLowerCase();
  const pricingType = (
    ["fixed", "hourly", "daily", "retainer", "mixed"].includes(pricingRaw)
      ? pricingRaw
      : "fixed"
  ) as ProposalAiCopy["pricingType"];

  const lineItemsRaw = Array.isArray(o.lineItems)
    ? o.lineItems
    : Array.isArray(o.line_items)
      ? o.line_items
      : [];

  const lineItems = lineItemsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const unitRaw = asString(row.unit, "flat").toLowerCase();
      const unit = (
        unitRaw === "hr" || unitRaw === "hour" || unitRaw === "hourly"
          ? "hr"
          : unitRaw === "day" || unitRaw === "daily"
            ? "day"
            : "flat"
      ) as "hr" | "flat" | "day";
      const title = asString(row.title);
      if (!title) return null;
      return {
        title,
        description: asString(row.description),
        qty: Math.max(1, asNumber(row.qty, 1)),
        price: Math.max(0, asNumber(row.price, 0)),
        unit,
      };
    })
    .filter(Boolean) as ProposalAiCopy["lineItems"];

  const approachRaw = Array.isArray(o.approachSteps)
    ? o.approachSteps
    : Array.isArray(o.approach_steps)
      ? o.approach_steps
      : [];
  const approachSteps = approachRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = asString(row.title);
      if (!title) return null;
      return {
        title,
        description: asString(row.description || row.detail),
      };
    })
    .filter(Boolean) as ProposalAiCopy["approachSteps"];

  const timelineRaw = Array.isArray(o.timelinePhases)
    ? o.timelinePhases
    : Array.isArray(o.timeline_phases)
      ? o.timeline_phases
      : [];
  const timelinePhases = timelineRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = asString(row.title);
      if (!title) return null;
      return {
        week: asString(row.week, "Phase"),
        title,
        detail: asString(row.detail || row.description),
      };
    })
    .filter(Boolean) as ProposalAiCopy["timelinePhases"];

  const paymentRaw = Array.isArray(o.paymentMilestones)
    ? o.paymentMilestones
    : Array.isArray(o.payment_milestones)
      ? o.payment_milestones
      : [];
  const paymentMilestones = paymentRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = asString(row.label || row.title);
      if (!label) return null;
      return {
        label,
        pct: asString(row.pct || row.percent, "50%"),
        when: asString(row.when || row.due),
      };
    })
    .filter(Boolean) as ProposalAiCopy["paymentMilestones"];

  const termsRaw = Array.isArray(o.termEntries)
    ? o.termEntries
    : Array.isArray(o.terms)
      ? o.terms
      : [];
  const termEntries = termsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = asString(row.title);
      const body = asString(row.body || row.text);
      if (!title || !body) return null;
      return { title, body };
    })
    .filter(Boolean) as ProposalAiCopy["termEntries"];

  const title = asString(o.title, "Project proposal");
  const summary = asString(o.summary);
  if (!summary) {
    throw new Error("AI proposal is missing a summary.");
  }

  return {
    title,
    headerSubtitle: asString(o.headerSubtitle || o.header_subtitle) || undefined,
    summary,
    goalsIntro: asString(o.goalsIntro || o.goals_intro) || undefined,
    goals: asStringArray(o.goals, 8),
    scopeIntro: asString(o.scopeIntro || o.scope_intro) || undefined,
    scopeIncluded: asStringArray(o.scopeIncluded || o.scope_included, 12),
    scopeExcluded: asStringArray(o.scopeExcluded || o.scope_excluded, 10),
    deliverablesIntro:
      asString(o.deliverablesIntro || o.deliverables_intro) || undefined,
    deliverables: asStringArray(o.deliverables, 10),
    approachIntro: asString(o.approachIntro || o.approach_intro) || undefined,
    approachSteps:
      approachSteps.length > 0
        ? approachSteps.slice(0, 8)
        : [
            { title: "Discover", description: "Align on goals, constraints, and success metrics." },
            { title: "Design", description: "Shape the solution and review together." },
            { title: "Build", description: "Execute, iterate, and quality-check." },
            { title: "Launch", description: "Ship, hand off, and support go-live." },
          ],
    timelineIntro: asString(o.timelineIntro || o.timeline_intro) || undefined,
    timelinePhases:
      timelinePhases.length > 0
        ? timelinePhases.slice(0, 8)
        : [
            {
              week: "Week 1",
              title: "Kickoff",
              detail: "Align on goals, access, and timeline.",
            },
            {
              week: "Week 2–3",
              title: "Build",
              detail: "Core delivery and review cycles.",
            },
            {
              week: "Final week",
              title: "Launch",
              detail: "Polish, handoff, and go-live support.",
            },
          ],
    pricingType,
    lineItems:
      lineItems.length > 0
        ? lineItems.slice(0, 12)
        : [
            {
              title: "Project engagement",
              description: "Full scope as described in this proposal.",
              qty: 1,
              price: asNumber(o.estimatedTotal || o.estimated_total, 0),
              unit: "flat" as const,
            },
          ],
    paymentIntro: asString(o.paymentIntro || o.payment_intro) || undefined,
    paymentMilestones:
      paymentMilestones.length > 0
        ? paymentMilestones.slice(0, 6)
        : [
            { label: "Deposit", pct: "50%", when: "Due on proposal acceptance" },
            { label: "Final", pct: "50%", when: "Due before final delivery" },
          ],
    paymentTermsNote:
      asString(o.paymentTermsNote || o.payment_terms_note) || undefined,
    revisionsText: asString(o.revisionsText || o.revisions_text) || undefined,
    responsibilitiesIntro:
      asString(o.responsibilitiesIntro || o.responsibilities_intro) ||
      undefined,
    clientResponsibilities: asStringArray(
      o.clientResponsibilities || o.client_responsibilities,
      8
    ),
    termsIntro: asString(o.termsIntro || o.terms_intro) || undefined,
    termEntries:
      termEntries.length > 0
        ? termEntries.slice(0, 8)
        : [
            {
              title: "Validity",
              body: "This proposal is valid for 30 days from the sent date unless otherwise agreed in writing.",
            },
            {
              title: "Ownership",
              body: "Final deliverables transfer to the client upon full payment.",
            },
            {
              title: "Cancellation",
              body: "Either party may cancel with 14 days written notice. Work completed to date will be invoiced and due immediately.",
            },
          ],
    nextStepsText: asString(o.nextStepsText || o.next_steps_text) || undefined,
    signatureIntro:
      asString(o.signatureIntro || o.signature_intro) || undefined,
    estimatedTotal: asNumber(o.estimatedTotal || o.estimated_total, 0) || undefined,
    currency: asString(o.currency).toUpperCase() || undefined,
  };
}

const STANDARD_BLOCKS = [
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
] as const;

function styleContent(
  key: string,
  content: string,
  base?: Record<string, unknown>
) {
  return {
    ...(base || {}),
    content,
  };
}

export function buildProposalContentFromAi(options: {
  copy: ProposalAiCopy;
  clientName: string;
  organizationName?: string | null;
  brief: string;
  currency?: string;
}): ProposalContentSnapshot {
  const { copy } = options;
  const currency = (copy.currency || options.currency || "USD").toUpperCase();

  const elementStyles: Record<string, unknown> = {
    "header-logo-name": styleContent(
      "header-logo-name",
      options.organizationName || "Your studio"
    ),
    "header-title": styleContent("header-title", copy.title),
    "header-client": styleContent("header-client", options.clientName),
    "header-subtitle": styleContent(
      "header-subtitle",
      copy.headerSubtitle || "Proposal"
    ),
    "summary-heading": styleContent("summary-heading", "Executive summary"),
    "summary-text": styleContent("summary-text", copy.summary),
    "goals-heading": styleContent("goals-heading", "Project goals"),
    "goals-intro": styleContent(
      "goals-intro",
      copy.goalsIntro ||
        "The outcomes this engagement is designed to achieve."
    ),
    "scope-heading": styleContent("scope-heading", "Scope of work"),
    "scope-intro": styleContent(
      "scope-intro",
      copy.scopeIntro ||
        "Exactly what is included in this engagement so expectations stay aligned."
    ),
    "deliverables-heading": styleContent("deliverables-heading", "Deliverables"),
    "deliverables-intro": styleContent(
      "deliverables-intro",
      copy.deliverablesIntro ||
        "Concrete assets and outputs you will receive."
    ),
    "approach-heading": styleContent("approach-heading", "Approach"),
    "approach-intro": styleContent(
      "approach-intro",
      copy.approachIntro ||
        "How the work will be done, without unnecessary complexity."
    ),
    "timeline-heading": styleContent(
      "timeline-heading",
      "Timeline & milestones"
    ),
    "timeline-intro": styleContent(
      "timeline-intro",
      copy.timelineIntro ||
        "Estimated schedule from kickoff to delivery. Dates may shift if feedback or assets are delayed."
    ),
    "payment-heading": styleContent("payment-heading", "Payment schedule"),
    "payment-intro": styleContent(
      "payment-intro",
      copy.paymentIntro ||
        "Invoices are issued at each milestone below. Payment is due within 14 days of invoice date."
    ),
    "payment-terms-note": styleContent(
      "payment-terms-note",
      copy.paymentTermsNote ||
        "Work may pause if a milestone remains unpaid more than 7 days past due."
    ),
    "exclusions-heading": styleContent(
      "exclusions-heading",
      "What’s not included"
    ),
    "exclusions-intro": styleContent(
      "exclusions-intro",
      "Items outside this agreement. These can be scoped separately if needed."
    ),
    "responsibilities-heading": styleContent(
      "responsibilities-heading",
      "Client responsibilities"
    ),
    "responsibilities-intro": styleContent(
      "responsibilities-intro",
      copy.responsibilitiesIntro ||
        "What we need from you to keep the project on schedule."
    ),
    "revisions-heading": styleContent(
      "revisions-heading",
      "Revisions & change requests"
    ),
    "revisions-text": styleContent(
      "revisions-text",
      copy.revisionsText ||
        "This engagement includes two rounds of revisions per major deliverable. Feedback should be consolidated and returned within five business days of each review. Additional rounds or out-of-scope changes are billed after written approval."
    ),
    "terms-heading": styleContent("terms-heading", "Terms & conditions"),
    "terms-intro": styleContent(
      "terms-intro",
      copy.termsIntro ||
        "Acceptance of this proposal constitutes agreement to the following terms."
    ),
    "next-steps-heading": styleContent("next-steps-heading", "Next steps"),
    "next-steps-text": styleContent(
      "next-steps-text",
      copy.nextStepsText ||
        "To proceed: accept this proposal and return the signed acceptance below. We’ll invoice the deposit and schedule kickoff once payment is received."
    ),
    "signature-heading": styleContent("signature-heading", "Acceptance"),
    "signature-intro": styleContent(
      "signature-intro",
      copy.signatureIntro ||
        "By signing below, the client agrees to this proposal, the scope described, and the attached terms."
    ),
  };

  const totalFromLines = copy.lineItems.reduce(
    (sum, item) => sum + item.qty * item.price,
    0
  );

  return {
    version: 1,
    headerTheme: "classic",
    blockTypes: [...STANDARD_BLOCKS],
    blocks: STANDARD_BLOCKS.map((type) => ({ type, variant: null })),
    elementStyles,
    currency,
    pricingType: copy.pricingType,
    lineItems: copy.lineItems.map((item) => ({
      id: uid("li"),
      ...item,
    })),
    projectGoals: copy.goals.map((text) => ({ id: uid("goal"), text })),
    keyDeliverables: copy.deliverables.map((text) => ({
      id: uid("del"),
      text,
    })),
    scopeIncluded: copy.scopeIncluded.map((text) => ({
      id: uid("scope-in"),
      text,
    })),
    scopeExcluded: copy.scopeExcluded.map((text) => ({
      id: uid("scope-ex"),
      text,
    })),
    approachSteps: copy.approachSteps.map((step) => ({
      id: uid("ap"),
      title: step.title,
      description: step.description,
    })),
    timelinePhases: copy.timelinePhases.map((phase) => ({
      id: uid("tl"),
      week: phase.week,
      title: phase.title,
      detail: phase.detail,
    })),
    paymentMilestones: copy.paymentMilestones.map((m) => ({
      id: uid("pay"),
      label: m.label,
      pct: m.pct,
      when: m.when,
    })),
    termEntries: copy.termEntries.map((t) => ({
      id: uid("term"),
      title: t.title,
      body: t.body,
    })),
    clientResponsibilities: copy.clientResponsibilities.map((text) => ({
      id: uid("resp"),
      text,
    })),
    meta: {
      creationMode: "ai",
      aiBrief: options.brief.slice(0, 8000),
      aiGeneratedAt: new Date().toISOString(),
      estimatedTotal: copy.estimatedTotal || totalFromLines || 0,
    },
  };
}

export function estimatedAmountFromContent(
  content: ProposalContentSnapshot,
  fallback = 0
): number {
  const metaTotal = Number(
    (content.meta as { estimatedTotal?: number } | undefined)?.estimatedTotal
  );
  if (Number.isFinite(metaTotal) && metaTotal > 0) return metaTotal;

  if (!Array.isArray(content.lineItems)) return fallback;
  let sum = 0;
  for (const item of content.lineItems) {
    if (!item || typeof item !== "object") continue;
    const row = item as { qty?: number; price?: number };
    sum += Number(row.qty || 0) * Number(row.price || 0);
  }
  return sum > 0 ? sum : fallback;
}

/** Keep AI-authored copy when a visual template is applied. */
export function mergeTemplateWithExistingContent(
  existing: ProposalContentSnapshot,
  template: ProposalContentSnapshot,
  headerTheme?: ProposalContentSnapshot["headerTheme"]
): ProposalContentSnapshot {
  const existingStyles =
    existing.elementStyles && typeof existing.elementStyles === "object"
      ? (existing.elementStyles as Record<string, unknown>)
      : {};
  const templateStyles =
    template.elementStyles && typeof template.elementStyles === "object"
      ? (template.elementStyles as Record<string, unknown>)
      : {};

  const preferExistingLists = Boolean(
    existing.meta?.creationMode === "ai" ||
      (existing.elementStyles &&
        typeof (existing.elementStyles as Record<string, { content?: string }>)[
          "summary-text"
        ]?.content === "string" &&
        (existing.elementStyles as Record<string, { content?: string }>)[
          "summary-text"
        ]?.content)
  );

  return {
    ...template,
    ...existing,
    version: 1,
    headerTheme:
      headerTheme || template.headerTheme || existing.headerTheme || "classic",
    headerLayout: template.headerLayout || existing.headerLayout,
    blockTypes: template.blockTypes?.length
      ? template.blockTypes
      : existing.blockTypes,
    blocks: template.blocks?.length ? template.blocks : existing.blocks,
    elementStyles: preferExistingLists
      ? mergeElementStyles(templateStyles, existingStyles)
      : mergeElementStyles(existingStyles, templateStyles),
    lineItems:
      preferExistingLists && existing.lineItems?.length
        ? existing.lineItems
        : template.lineItems || existing.lineItems,
    currency: existing.currency || template.currency,
    pricingType: existing.pricingType || template.pricingType,
    scopeIncluded:
      preferExistingLists && existing.scopeIncluded?.length
        ? existing.scopeIncluded
        : template.scopeIncluded || existing.scopeIncluded,
    scopeExcluded:
      preferExistingLists && existing.scopeExcluded?.length
        ? existing.scopeExcluded
        : template.scopeExcluded || existing.scopeExcluded,
    timelinePhases:
      preferExistingLists && existing.timelinePhases?.length
        ? existing.timelinePhases
        : template.timelinePhases || existing.timelinePhases,
    paymentMilestones:
      preferExistingLists && existing.paymentMilestones?.length
        ? existing.paymentMilestones
        : template.paymentMilestones || existing.paymentMilestones,
    termEntries:
      preferExistingLists && existing.termEntries?.length
        ? existing.termEntries
        : template.termEntries || existing.termEntries,
    projectGoals:
      preferExistingLists && existing.projectGoals?.length
        ? existing.projectGoals
        : template.projectGoals || existing.projectGoals,
    keyDeliverables:
      preferExistingLists && existing.keyDeliverables?.length
        ? existing.keyDeliverables
        : template.keyDeliverables || existing.keyDeliverables,
    approachSteps:
      preferExistingLists && existing.approachSteps?.length
        ? existing.approachSteps
        : template.approachSteps || existing.approachSteps,
    clientResponsibilities:
      preferExistingLists && existing.clientResponsibilities?.length
        ? existing.clientResponsibilities
        : template.clientResponsibilities || existing.clientResponsibilities,
    aboutStats: existing.aboutStats || template.aboutStats,
    sectionStyles: template.sectionStyles || existing.sectionStyles,
    sectionElements: template.sectionElements || existing.sectionElements,
    meta: {
      ...(existing.meta || {}),
      ...(template.meta || {}),
      creationMode: existing.meta?.creationMode || template.meta?.creationMode,
      aiBrief: existing.meta?.aiBrief,
      aiGeneratedAt: existing.meta?.aiGeneratedAt,
    },
  };
}
