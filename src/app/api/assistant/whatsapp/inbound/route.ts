import { NextResponse } from "next/server";
import {
  assertWhatsAppWebhook,
  processWhatsAppInbound,
  type InboundWhatsAppPayload,
} from "@/lib/assistant/process-inbound";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!assertWhatsAppWebhook(request, rawBody)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: InboundWhatsAppPayload;
  try {
    payload = JSON.parse(rawBody) as InboundWhatsAppPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload?.from || !payload?.body) {
    return NextResponse.json(
      { error: "Missing from or body" },
      { status: 400 }
    );
  }

  try {
    const result = await processWhatsAppInbound(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[assistant/whatsapp/inbound]", error);
    const message =
      error instanceof Error ? error.message : "Inbound processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
