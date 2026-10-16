import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  loadOutreachActionFeed,
  loadOutreachInsights,
} from "@/lib/outreach/insights";

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const [insights, feed] = await Promise.all([
      loadOutreachInsights(gate.db),
      loadOutreachActionFeed(gate.db),
    ]);
    return NextResponse.json({ insights, feed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load insights.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
