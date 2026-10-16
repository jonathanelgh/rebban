export const OUTREACH_INTENTS = [
  "interested",
  "curious",
  "using_competitor",
  "happy_with_current_setup",
  "not_interested",
  "not_now",
  "question",
  "trial_request",
  "unsubscribe",
  "other",
] as const;

export type OutreachIntent = (typeof OUTREACH_INTENTS)[number];

export type OutreachAiAnalysisResult = {
  temperature: "hot" | "warm" | "cold";
  score: number;
  intent: OutreachIntent;
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  current_tools: string[];
  pain_points: string[];
  competitors_mentioned: string[];
  feature_requests: string[];
  objections: string[];
  positive_signals: string[];
  recommended_action: string;
  suggested_reply: string;
  confidence: number;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
}

function clampScore(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function parseOutreachAiAnalysis(raw: unknown): {
  ok: true;
  data: OutreachAiAnalysisResult;
} | {
  ok: false;
  error: string;
} {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "AI response is not an object." };
  }
  const obj = raw as Record<string, unknown>;

  const temperatureRaw = String(obj.temperature || "").toLowerCase();
  if (
    temperatureRaw !== "hot" &&
    temperatureRaw !== "warm" &&
    temperatureRaw !== "cold"
  ) {
    return { ok: false, error: "Invalid temperature." };
  }

  const intentRaw = String(obj.intent || "other").toLowerCase();
  const intent = (OUTREACH_INTENTS.includes(intentRaw as OutreachIntent)
    ? intentRaw
    : "other") as OutreachIntent;

  const sentimentRaw = String(obj.sentiment || "neutral").toLowerCase();
  const sentiment =
    sentimentRaw === "positive" || sentimentRaw === "negative"
      ? sentimentRaw
      : "neutral";

  let score = clampScore(Number(obj.score));
  // Keep score bands aligned with temperature when model drifts.
  if (temperatureRaw === "hot" && score < 75) score = 75;
  if (temperatureRaw === "warm" && (score < 40 || score > 74)) {
    score = Math.min(74, Math.max(40, score || 55));
  }
  if (temperatureRaw === "cold" && score > 39) score = 39;

  // Unsubscribe overrides temperature/selling.
  if (intent === "unsubscribe") {
    return {
      ok: true,
      data: {
        temperature: "cold",
        score: 0,
        intent,
        sentiment: "negative",
        summary:
          typeof obj.summary === "string" && obj.summary.trim()
            ? obj.summary.trim()
            : "Lead asked not to be contacted.",
        current_tools: asStringArray(obj.current_tools),
        pain_points: asStringArray(obj.pain_points),
        competitors_mentioned: asStringArray(obj.competitors_mentioned),
        feature_requests: asStringArray(obj.feature_requests),
        objections: asStringArray(obj.objections),
        positive_signals: [],
        recommended_action: "Mark do not contact and stop outreach.",
        suggested_reply:
          typeof obj.suggested_reply === "string" && obj.suggested_reply.trim()
            ? obj.suggested_reply.trim()
            : "Thanks for letting me know — I won't reach out again. Appreciate you taking the time.",
        confidence: clampScore(Number(obj.confidence ?? 90)) / 100,
      },
    };
  }

  const suggested =
    typeof obj.suggested_reply === "string" ? obj.suggested_reply.trim() : "";
  if (!suggested) {
    return { ok: false, error: "Missing suggested_reply." };
  }

  return {
    ok: true,
    data: {
      temperature: temperatureRaw,
      score,
      intent,
      sentiment,
      summary:
        typeof obj.summary === "string" && obj.summary.trim()
          ? obj.summary.trim()
          : "No summary provided.",
      current_tools: asStringArray(obj.current_tools),
      pain_points: asStringArray(obj.pain_points),
      competitors_mentioned: asStringArray(obj.competitors_mentioned),
      feature_requests: asStringArray(obj.feature_requests),
      objections: asStringArray(obj.objections),
      positive_signals: asStringArray(obj.positive_signals),
      recommended_action:
        typeof obj.recommended_action === "string" &&
        obj.recommended_action.trim()
          ? obj.recommended_action.trim()
          : "Review and reply.",
      suggested_reply: suggested,
      confidence: clampScore(Number(obj.confidence ?? 70)) / 100,
    },
  };
}
