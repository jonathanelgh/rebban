import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listActiveOutreachGmailConnections } from "@/lib/email/outreach-gmail";
import { processLeadSendQueue } from "@/lib/outreach/queue";

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
    const connections = await listActiveOutreachGmailConnections(db);
    if (!connections.length) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        reason: "no_gmail_connection",
      });
    }

    const result = await processLeadSendQueue({
      db,
      userId: connections[0].user_id,
      limit: 5,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron failed";
    console.error("[outreach] queue cron failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
