import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  parseOutreachAiAnalysis,
  type OutreachAiAnalysisResult,
} from "@/lib/outreach/ai-schema";

type Db = SupabaseClient<Database>;
type Lead = Database["public"]["Tables"]["outreach_leads"]["Row"];
type Message = Database["public"]["Tables"]["outreach_messages"]["Row"];

const SIGNUP_URL = "https://app.rebban.com/signup";

const SYSTEM_PROMPT = `You are helping Jonathan, founder of Rebban, analyze replies from freelance prospects.

Rebban helps freelancers manage proposals, time tracking, invoices, payments and follow-ups.
Signup / get started: ${SIGNUP_URL}
Pricing:
- 7-day free trial
- No card required at signup
- Then $29.99 USD / month

Return ONLY valid JSON matching this schema:
{
  "temperature": "hot" | "warm" | "cold",
  "score": number,
  "intent": "interested" | "curious" | "using_competitor" | "happy_with_current_setup" | "not_interested" | "not_now" | "question" | "trial_request" | "unsubscribe" | "other",
  "sentiment": "positive" | "neutral" | "negative",
  "summary": string,
  "current_tools": string[],
  "pain_points": string[],
  "competitors_mentioned": string[],
  "feature_requests": string[],
  "objections": string[],
  "positive_signals": string[],
  "recommended_action": string,
  "suggested_reply": string,
  "confidence": number
}

Temperature scoring:
- HOT 75-100: asks for access/signup/pricing, wants to try, clear pain, product questions
- WARM 40-74: thoughtful answer, mentions tools, interested but not ready
- COLD 0-39: satisfied, not interested, polite rejection

If they ask not to be contacted, intent must be "unsubscribe".

Suggested reply style:
- Sound like Jonathan texting a fellow freelancer: personal, warm, human
- Continue the conversation: read the full thread and pick up where it left off
- Never re-thank or re-acknowledge something already covered (e.g. do not say "thanks for your interest" again if we already welcomed them)
- Answer the newest question first; skip preamble
- Short: usually 2-5 sentences. One clear next step.
- Learning first, selling second
- No corporate tone, no fake compliments, no pressure, no "I hope this email finds you well"
- Never use em dashes (—). Use commas, periods, or colons instead.
- Do not dump a feature list
- If they mention a tool, ask why they chose it or what they like/dislike
- If they want to try / get started / sign up, include the signup link ${SIGNUP_URL} (do not invent other URLs or say you will "send a link later")
- If they ask about pricing, trial, or cost: 7-day free trial, no card needed to sign up, then $29.99 USD/month. Say it casually; do not invent other prices or plans
- Emojis: rare and optional, but use a real Unicode emoji (e.g. 😊), never text emoticons like :) or :-)
- At most one soft smile emoji near the end of a friendly line; never mid-sentence with pricing/links, never stacked, never hype emojis like 🚀🎉🔥`

export function isOutreachAiConfigured() {
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key);
}

async function callOpenAiJson(prompt: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const model = process.env.OPENAI_OUTREACH_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
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
        `OpenAI rejected the API key (${detail}). Check OPENAI_API_KEY in .env.local / Vercel.`
      );
    }
    throw new Error(detail);
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response.");
  return JSON.parse(content) as unknown;
}

export async function analyzeInboundReply(options: {
  db: Db;
  lead: Lead;
  inbound: Message;
  history: Message[];
}): Promise<OutreachAiAnalysisResult> {
  const { db, lead, inbound, history } = options;

  const historyText = history
    .map((m) => {
      const when = m.sent_at || m.received_at || m.created_at;
      return `[${m.direction.toUpperCase()} ${when}]\n${m.body_text || ""}`;
    })
    .join("\n\n");

  const prompt = `Lead:
Name: ${lead.display_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown"}
Email: ${lead.email}
Role: ${lead.role || "—"}
Location: ${lead.location || "—"}
Website summary: ${lead.website_summary || "—"}
Personalized opener: ${lead.personalized_opener || "—"}
Why Rebban fits: ${lead.rebban_fit || "—"}

Full email thread (oldest → newest):
${historyText || "(none)"}

Newest inbound reply (focus analysis on this):
${inbound.body_text || ""}

Analyze the newest inbound reply in context of the full thread, and draft Jonathan's next reply.
If they ask how to get started / try Rebban, include ${SIGNUP_URL}.`;

  const raw = await callOpenAiJson(prompt);
  const parsed = parseOutreachAiAnalysis(raw);
  if (!parsed.ok) {
    console.error("[outreach] AI analysis failed", { error: parsed.error });
    throw new Error(parsed.error);
  }

  const analysis = parsed.data;

  const { error: insertError } = await db.from("outreach_ai_analyses").insert({
    lead_id: lead.id,
    message_id: inbound.id,
    temperature: analysis.temperature,
    score: analysis.score,
    intent: analysis.intent,
    sentiment: analysis.sentiment,
    summary: analysis.summary,
    current_tools: analysis.current_tools,
    pain_points: analysis.pain_points,
    competitors_mentioned: analysis.competitors_mentioned,
    feature_requests: analysis.feature_requests,
    objections: analysis.objections,
    positive_signals: analysis.positive_signals,
    recommended_action: analysis.recommended_action,
    suggested_reply: analysis.suggested_reply,
    confidence: analysis.confidence,
    raw_output: raw as Database["public"]["Tables"]["outreach_ai_analyses"]["Insert"]["raw_output"],
  });

  if (insertError) throw new Error(insertError.message);

  const leadPatch: Database["public"]["Tables"]["outreach_leads"]["Update"] = {
    temperature: analysis.temperature,
    temperature_score: analysis.score,
    temperature_reason: analysis.summary,
    current_tools: analysis.current_tools,
    pain_points: analysis.pain_points,
    competitors_mentioned: analysis.competitors_mentioned,
    feature_requests: analysis.feature_requests,
    objections: analysis.objections,
    positive_signals: analysis.positive_signals,
    outreach_status: "replied",
  };

  if (analysis.intent === "unsubscribe") {
    leadPatch.do_not_contact = true;
    leadPatch.unsubscribed_at = new Date().toISOString();
    leadPatch.unsubscribe_reason = analysis.summary;
    leadPatch.ready_to_send = false;
    leadPatch.queued_at = null;
    leadPatch.next_follow_up_at = null;
    console.info("[outreach] lead opted out", { leadId: lead.id });
  }

  const { error: leadError } = await db
    .from("outreach_leads")
    .update(leadPatch)
    .eq("id", lead.id);
  if (leadError) throw new Error(leadError.message);

  await db
    .from("outreach_messages")
    .update({ ai_processed_at: new Date().toISOString() })
    .eq("id", inbound.id);

  console.info("[outreach] AI analysis completed", {
    leadId: lead.id,
    messageId: inbound.id,
    temperature: analysis.temperature,
    score: analysis.score,
  });

  return analysis;
}

export async function generateFollowUpDraft(options: {
  lead: Lead;
  followUpNumber: number;
}): Promise<{ subject: string; body: string }> {
  const { lead, followUpNumber } = options;
  const firstName = lead.first_name || lead.display_name?.split(/\s+/)[0] || "there";

  if (!isOutreachAiConfigured()) {
    const subject =
      lead.subject_line?.startsWith("Re:")
        ? lead.subject_line
        : `Re: ${lead.subject_line || `Quick question, ${firstName}`}`;
    const body =
      followUpNumber === 1
        ? `Hi ${firstName},\n\nJust floating this back up in case it got buried.\n\nCurious what you use today for proposals, time tracking, invoices and follow-ups. Totally fine if now isn't a good time.\n\nBest,\nJonathan\nFounder, Rebban\nrebban.com`
        : `Hi ${firstName},\n\nLast note from me. If managing proposals/time/invoices across tools is still a pain, I'd love to hear what setup you're on.\n\nEither way, appreciate your time.\n\nBest,\nJonathan\nFounder, Rebban\nrebban.com`;
    return { subject, body };
  }

  const raw = await callOpenAiJson(
    `Write a short follow-up #${followUpNumber} from Jonathan (founder of Rebban) to ${firstName}.
Lead role: ${lead.role || "freelancer"}
Website summary: ${lead.website_summary || "—"}
Original subject: ${lead.subject_line || "—"}
Original email: ${lead.initial_email_body || "—"}

Return JSON: { "subject": string, "body": string }
No em dashes. Curious and brief. Learning first.`
  );

  const obj = raw as { subject?: string; body?: string };
  if (!obj.subject?.trim() || !obj.body?.trim()) {
    throw new Error("Invalid follow-up AI response.");
  }
  return { subject: obj.subject.trim(), body: obj.body.trim() };
}
