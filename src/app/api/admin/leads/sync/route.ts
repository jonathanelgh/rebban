import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { syncOutreachReplies } from "@/lib/outreach/sync";

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    leadId?: string;
    analyze?: boolean;
  };

  try {
    const result = await syncOutreachReplies({
      db: gate.db,
      userId: gate.user.id,
      leadId: body.leadId,
      analyze: body.analyze !== false,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    console.error("[outreach] manual sync failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
