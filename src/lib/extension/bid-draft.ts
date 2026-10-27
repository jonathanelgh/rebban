export function isBidDraftAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

const SYSTEM_PROMPT = `You write freelance marketplace cover letters / proposals (Upwork, Freelancer.com, and similar).

Return ONLY valid JSON:
{
  "draft": string,
  "jobTitle": string | null
}

Writing rules:
- Write a ready-to-paste cover letter / proposal message for the job posting.
- Sound human and specific. No corporate filler, no "I am writing to express my interest".
- Never use em dashes (—). Use commas, periods, or colons instead.
- Plain text only. Never use Markdown or chat formatting: no **bold**, *italics*, __underscores__, # headings, or [link](url) syntax. Marketplace chat strips it.
- Open with a concrete hook tied to the job (problem, stack, or outcome), not a greeting dump.
- Mirror the client's language lightly. Address 2-4 real requirements from the post.
- Keep it scannable: short paragraphs. Prefer line breaks over bullet characters when possible.
- Length: usually 120-220 words unless the job asks for something longer.
- If About me notes are provided, only claim skills/experience stated there. Do not invent years, clients, or stack.
- If About me is thin, stay honest and focus on how you would approach the work.
- Do not include fake portfolio links or made-up metrics.
- Upwork: do NOT include personal websites, portfolio URLs, or domain links (e.g. samjameson.dev). Clients dislike outbound links in proposals. You may still reference relevant experience without pasting a URL.
- Freelancer.com / other: you may include a real portfolio URL only if it appears in About me.
- Do not auto-submit language ("I have applied"). This is a draft for the freelancer to paste.
- jobTitle: short title inferred from the posting, or null.
- Match platform tone when hinted (Upwork: concise client-focused; Freelancer: clear scope + fit).`;

export type BidDraftResult = {
  draft: string;
  jobTitle: string | null;
};

export async function generateMarketplaceBidDraft(options: {
  jobText: string;
  platform?: string | null;
  aboutMe?: string | null;
  freelancerName?: string | null;
  organizationName?: string | null;
  title?: string | null;
}): Promise<BidDraftResult> {
  const jobText = options.jobText.trim();
  if (jobText.length < 40) {
    throw new Error(
      "Paste more of the job description (at least a short paragraph)."
    );
  }
  if (jobText.length > 40000) {
    throw new Error("Job text is too long (max about 40,000 characters).");
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const model =
    process.env.OPENAI_PROPOSAL_MODEL ||
    process.env.OPENAI_SUPPORT_MODEL ||
    "gpt-4o-mini";

  const platform = (options.platform || "marketplace").trim() || "marketplace";
  const isUpwork = platform.toLowerCase().includes("upwork");
  const aboutMe = (options.aboutMe || "").trim();
  const name = (options.freelancerName || "").trim();
  const org = (options.organizationName || "").trim();
  const roleTitle = (options.title || "").trim();

  const prompt = `Platform: ${platform}
Freelancer name: ${name || "Freelancer"}
Studio / brand: ${org || "n/a"}
Role / title: ${roleTitle || "n/a"}
${
  isUpwork
    ? "\nIMPORTANT for Upwork: plain text only (no Markdown). Do not include any personal website or portfolio URLs.\n"
    : "\nIMPORTANT: plain text only (no Markdown formatting).\n"
}
--- ABOUT ME (only use facts from here) ---
${aboutMe || "(none provided — stay cautious, do not invent credentials)"}
--- END ABOUT ME ---

--- JOB POSTING (pasted by the freelancer) ---
${jobText.slice(0, 35000)}
--- END JOB POSTING ---

Write the cover letter draft now.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 1200,
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
        "OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local / Vercel."
      );
    }
    throw new Error(detail);
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI bid draft response.");

  let parsed: { draft?: unknown; jobTitle?: unknown };
  try {
    parsed = JSON.parse(content) as { draft?: unknown; jobTitle?: unknown };
  } catch {
    throw new Error("AI returned invalid JSON for the bid draft.");
  }

  let draft = sanitizeMarketplaceDraft(String(parsed.draft || "").trim(), {
    stripUrls: isUpwork,
  });
  if (draft.length < 40) {
    throw new Error("AI returned an empty bid draft. Try again.");
  }

  const jobTitleRaw = parsed.jobTitle;
  const jobTitle =
    typeof jobTitleRaw === "string" && jobTitleRaw.trim()
      ? jobTitleRaw.trim().slice(0, 160)
      : null;

  return { draft, jobTitle };
}

/** Strip Markdown / chat markup (and optional URLs) so drafts paste cleanly. */
export function sanitizeMarketplaceDraft(
  draft: string,
  options?: { stripUrls?: boolean }
): string {
  let text = draft
    // [label](url) → label
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, "$1")
    // **bold** / __bold__ / *italic* / _italic_
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1")
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "$1")
    // headings / blockquotes
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "");

  if (options?.stripUrls) {
    text = text
      .replace(/https?:\/\/[^\s)\]>"']+/gi, "")
      .replace(/\bwww\.[^\s)\]>"']+/gi, "")
      // bare personal sites often pasted without scheme (e.g. samjameson.dev)
      .replace(
        /\b(?:[a-z0-9-]+\.)+(?:dev|design|studio|me|app|io|ai|com|net|org|co)\b(?:\/[^\s)\]>"']*)?/gi,
        (match) => (match.includes("@") ? match : "")
      )
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ ?([,.;:])/g, "$1")
      .replace(/\(\s*\)/g, "");
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}
