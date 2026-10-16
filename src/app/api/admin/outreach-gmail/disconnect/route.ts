import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { disconnectOutreachGmail } from "@/lib/email/outreach-gmail";

export async function POST() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    await disconnectOutreachGmail(gate.user.id);
    console.info("[outreach] gmail disconnected", { userId: gate.user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Disconnect failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
