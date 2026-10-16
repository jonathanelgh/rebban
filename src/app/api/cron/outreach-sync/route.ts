import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOutreachReplies } from "@/lib/outreach/sync";
import { prepareDueFollowups } from "@/lib/outreach/followups";

export const runtime = "nodejs";

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const querySecret = new URL(request.url).searchParams.get("secret");
  return bearer === secret || querySecret === secret;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    const sync = await syncOutreachReplies({ db, analyze: true });
    const followups = await prepareDueFollowups(db);

    return NextResponse.json({
      ok: true,
      sync,
      followups,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron failed";
    console.error("[outreach] sync cron failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
