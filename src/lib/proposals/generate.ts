import {
  buildProposalContentFromAi,
  parseProposalAiCopy,
  type ProposalAiCopy,
} from "@/lib/proposals/ai-schema";
import type { ProposalContentSnapshot } from "@/lib/proposals/content";

export function isProposalAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

const SYSTEM_PROMPT = `You write complete freelance / agency client proposals from rough notes.

Return ONLY valid JSON matching this schema:
{
  "title": string,
  "headerSubtitle": string,
  "summary": string,
  "goalsIntro": string,
  "goals": string[],
  "scopeIntro": string,
  "scopeIncluded": string[],
  "scopeExcluded": string[],
  "deliverablesIntro": string,
  "deliverables": string[],
  "approachIntro": string,
  "approachSteps": [{ "title": string, "description": string }],
  "timelineIntro": string,
  "timelinePhases": [{ "week": string, "title": string, "detail": string }],
  "pricingType": "fixed" | "hourly" | "daily" | "retainer" | "mixed",
  "lineItems": [{ "title": string, "description": string, "qty": number, "price": number, "unit": "hr" | "flat" | "day" }],
  "paymentIntro": string,
  "paymentMilestones": [{ "label": string, "pct": string, "when": string }],
  "paymentTermsNote": string,
  "revisionsText": string,
  "responsibilitiesIntro": string,
  "clientResponsibilities": string[],
  "termsIntro": string,
  "termEntries": [{ "title": string, "body": string }],
  "nextStepsText": string,
  "signatureIntro": string,
  "estimatedTotal": number,
  "currency": string
}

Writing rules:
- Professional, clear, client-ready. Sound human, not corporate filler.
- Never use em dashes (—). Use commas, periods, or colons instead.
- Ground every section in the provided notes. Do not invent client facts, metrics, or brands not supported by the notes.
- If pricing is missing, infer a reasonable single line item from scope and set estimatedTotal, or use 0 and keep lineItems honest.
- Prefer concrete deliverables and scope over vague buzzwords.
- Keep summary to 2-4 short paragraphs (as one string with newlines if needed).
- goals: 3-6 items. scopeIncluded: 4-8. scopeExcluded: 3-6. deliverables: 3-6.
- approachSteps: 3-5. timelinePhases: 3-5. paymentMilestones: 2-4. termEntries: 3-5.
- Match currency to the one provided when possible.
- Title should be a crisp project name, not "Proposal for X" unless needed.`;

async function callOpenAiJson(prompt: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const model =
    process.env.OPENAI_PROPOSAL_MODEL ||
    process.env.OPENAI_SUPPORT_MODEL ||
    "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.45,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const detail = json.error?.message || `OpenAI error (${res.status}).`;
    if (res.status === 401) {
      throw new Error(
        `OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local / Vercel.`
      );
    }
    throw new Error(detail);
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI proposal response.");
  return JSON.parse(content) as unknown;
}

export type GenerateProposalResult = {
  copy: ProposalAiCopy;
  content: ProposalContentSnapshot;
  title: string;
  amount: number;
  currency: string;
  pricingType: ProposalAiCopy["pricingType"];
};

export async function generateProposalFromBrief(options: {
  brief: string;
  clientName: string;
  clientCompany?: string | null;
  organizationName?: string | null;
  category?: string | null;
  currency?: string | null;
  pricingHint?: string | null;
}): Promise<GenerateProposalResult> {
  const brief = options.brief.trim();
  if (brief.length < 40) {
    throw new Error(
      "Add more project details (at least a short paragraph) so AI can write the proposal."
    );
  }
  if (brief.length > 60000) {
    throw new Error("Brief is too long (max about 60,000 characters).");
  }

  const currency = (options.currency || "USD").toUpperCase();
  const clientLabel = [options.clientName, options.clientCompany]
    .filter(Boolean)
    .join(" · ");

  const prompt = `Write a complete proposal for this engagement.

Client: ${clientLabel || "Client"}
Workspace / studio: ${options.organizationName || "Freelance studio"}
Category hint: ${options.category || "general"}
Preferred currency: ${currency}
Pricing hint: ${options.pricingHint || "infer from notes"}

--- PROJECT NOTES / BRIEF ---
${brief.slice(0, 50000)}
--- END ---`;

  const raw = await callOpenAiJson(prompt);
  const copy = parseProposalAiCopy(raw);
  if (!copy.currency) copy.currency = currency;

  const content = buildProposalContentFromAi({
    copy,
    clientName: options.clientCompany || options.clientName,
    organizationName: options.organizationName,
    brief,
    currency,
  });

  const amount =
    copy.estimatedTotal && copy.estimatedTotal > 0
      ? copy.estimatedTotal
      : copy.lineItems.reduce((s, i) => s + i.qty * i.price, 0);

  return {
    copy,
    content,
    title: copy.title,
    amount,
    currency: copy.currency || currency,
    pricingType: copy.pricingType,
  };
}
