import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundReceiptMessage } from "@/lib/receipts/ingest-email";
import { processReceiptExtraction } from "@/lib/receipts/process";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const db = createAdminClient();
  let inboundProcessed = 0;
  let inboundFailed = 0;
  let extractions = 0;
  let extractFailed = 0;

  const { data: inbound, error: inboundError } = await db.rpc(
    "claim_pending_receipt_inbound",
    { p_limit: 10 }
  );
  if (inboundError) {
    return NextResponse.json({ error: inboundError.message }, { status: 500 });
  }

  for (const row of inbound || []) {
    const result = await processInboundReceiptMessage(db, row.id);
    if (result.ok) inboundProcessed += 1;
    else inboundFailed += 1;
  }

  const { data: pendingReceipts, error: pendingError } = await db.rpc(
    "claim_pending_receipt_extractions",
    { p_limit: 10 }
  );
  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  for (const row of pendingReceipts || []) {
    const result = await processReceiptExtraction(db, row.id);
    if (result.ok) extractions += 1;
    else extractFailed += 1;
  }

  return NextResponse.json({
    ok: true,
    inboundProcessed,
    inboundFailed,
    extractions,
    extractFailed,
  });
}
