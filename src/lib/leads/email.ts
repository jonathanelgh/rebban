import { escapeHtml as brandEscapeHtml } from "@/lib/email/brand";

export function isLeadEmailAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function plainTextToEmailHtml(text: string) {
  const escaped = brandEscapeHtml(text.trim());
  if (!escaped) return "<p></p>";
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;line-height:1.6;">${block.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return paragraphs;
}

export type LeadEmailAiContext = {
  freelancer: {
    name: string | null;
    email: string | null;
    title: string | null;
    industry: string | null;
    organizationName: string | null;
  };
  lead: {
    name: string;
    email: string | null;
    company: string | null;
    phone: string | null;
    website: string | null;
    notes: string | null;
    status: string;
    source: string;
    formName: string | null;
  };
  formSubmission: Record<string, unknown> | null;
  instruction?: string | null;
};

const SYSTEM_PROMPT = `You write short, personal outreach emails from freelancers / indie agencies to sales leads.

Return ONLY valid JSON:
{
  "subject": string,
  "body": string
}

Rules:
- Write as the freelancer, first person.
- Warm, clear, and human. Not salesy or corporate.
- Never use em dashes (—).
- Keep body to about 80-160 words unless the instruction asks for longer.
- Use plain text with blank lines between paragraphs. No HTML.
- Ground the email in the provided lead and form details. Do not invent facts.
- If form answers are present, reference the most relevant ones naturally.
- Include a light next step (call, reply, share availability) without being pushy.
- Sign off with the freelancer first name when available.
- Subject should be specific and short (under 70 characters).`;

export async function generateLeadEmailDraft(context: LeadEmailAiContext) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const model =
    process.env.OPENAI_LEAD_EMAIL_MODEL ||
    process.env.OPENAI_PROPOSAL_MODEL ||
    process.env.OPENAI_SUPPORT_MODEL ||
    "gpt-4o-mini";

  const formLines = context.formSubmission
    ? Object.entries(context.formSubmission)
        .filter(([, value]) => value != null && String(value).trim())
        .map(([key, value]) => {
          const rendered =
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
              ? String(value)
              : JSON.stringify(value);
          return `- ${key}: ${rendered}`;
        })
        .join("\n")
    : "(none)";

  const prompt = `Write a follow-up / outreach email.

Freelancer:
- Name: ${context.freelancer.name || "Unknown"}
- Email: ${context.freelancer.email || "Unknown"}
- Title: ${context.freelancer.title || "Unknown"}
- Industry: ${context.freelancer.industry || "Unknown"}
- Workspace: ${context.freelancer.organizationName || "Unknown"}

Lead:
- Name: ${context.lead.name}
- Email: ${context.lead.email || "Unknown"}
- Company: ${context.lead.company || "Unknown"}
- Phone: ${context.lead.phone || "Unknown"}
- Website: ${context.lead.website || "Unknown"}
- Status: ${context.lead.status}
- Source: ${context.lead.source}
- Form: ${context.lead.formName || "None"}
- Notes: ${context.lead.notes || "None"}

Form submission details:
${formLines}

Extra instruction from freelancer:
${context.instruction?.trim() || "None. Write a natural first reply."}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      max_tokens: 900,
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
    throw new Error(json.error?.message || `OpenAI error (${res.status}).`);
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI email response.");

  const parsed = JSON.parse(content) as {
    subject?: unknown;
    body?: unknown;
  };

  const subject =
    typeof parsed.subject === "string" ? parsed.subject.trim() : "";
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";

  if (!subject || !body) {
    throw new Error("AI did not return a usable subject and body.");
  }

  return { subject, body };
}
