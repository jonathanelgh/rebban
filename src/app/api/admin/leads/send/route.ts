import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { sendInitialOutreachEmail } from "@/lib/outreach/send";

const MAX_MANUAL_BATCH = 25;

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await request.json().catch(() => null)) as {
    ids?: string[];
  } | null;

  const ids = Array.isArray(body?.ids)
    ? [...new Set(body!.ids.filter((id) => typeof id === "string" && id.length > 0))]
    : [];

  if (!ids.length) {
    return NextResponse.json({ error: "No leads selected." }, { status: 400 });
  }
  if (ids.length > MAX_MANUAL_BATCH) {
    return NextResponse.json(
      {
        error: `Manual send is limited to ${MAX_MANUAL_BATCH} leads at a time.`,
      },
      { status: 400 }
    );
  }

  const results: {
    id: string;
    ok: boolean;
    alreadySent?: boolean;
    error?: string;
  }[] = [];

  // Sequential on purpose — low-volume founder outreach, respect Gmail.
  for (const leadId of ids) {
    try {
      const result = await sendInitialOutreachEmail({
        db: gate.db,
        userId: gate.user.id,
        leadId,
      });
      if (result.ok) {
        results.push({
          id: leadId,
          ok: true,
          alreadySent: result.alreadySent,
        });
      } else {
        results.push({
          id: leadId,
          ok: false,
          error: result.error,
        });
      }
    } catch (err) {
      results.push({
        id: leadId,
        ok: false,
        error: err instanceof Error ? err.message : "Send failed.",
      });
    }
  }

  const sent = results.filter((r) => r.ok && !r.alreadySent).length;
  const alreadySent = results.filter((r) => r.ok && r.alreadySent).length;
  const failed = results.filter((r) => !r.ok).length;

  console.info("[outreach] manual batch send", {
    selected: ids.length,
    sent,
    alreadySent,
    failed,
  });

  return NextResponse.json({
    sent,
    alreadySent,
    failed,
    results,
  });
}
