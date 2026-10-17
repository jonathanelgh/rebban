import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  analyzeInboundReply,
  isOutreachAiConfigured,
} from "@/lib/outreach/analyze";

/** Generate / regenerate AI analysis + suggested reply for the latest inbound. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  if (!isOutreachAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured. Add it to .env.local (and Vercel), then restart.",
      },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  const { data: lead } = await gate.db
    .from("outreach_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const { data: messages } = await gate.db
    .from("outreach_messages")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });

  const inbound = [...(messages || [])]
    .reverse()
    .find((m) => m.direction === "inbound");
  if (!inbound) {
    return NextResponse.json(
      { error: "No inbound message to analyze." },
      { status: 400 }
    );
  }

  try {
    const analysis = await analyzeInboundReply({
      db: gate.db,
      lead,
      inbound,
      history: messages || [],
    });
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    console.error("[outreach] analyze failed", { leadId: id, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
