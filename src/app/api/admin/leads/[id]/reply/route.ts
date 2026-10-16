import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { sendApprovedReply } from "@/lib/outreach/reply-send";
import { analyzeInboundReply, isOutreachAiConfigured } from "@/lib/outreach/analyze";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    body?: string;
    subject?: string;
  } | null;

  if (!body?.body?.trim()) {
    return NextResponse.json({ error: "Reply body is required." }, { status: 400 });
  }

  const result = await sendApprovedReply({
    db: gate.db,
    userId: gate.user.id,
    leadId: id,
    body: body.body,
    subject: body.subject,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}

/** Re-run AI analysis on the latest inbound message. */
export async function PUT(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  if (!isOutreachAiConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
