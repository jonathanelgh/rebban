import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInboxByRecipient } from "@/lib/receipts/inbox";
import { processInboundReceiptMessage } from "@/lib/receipts/ingest-email";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReceivedPayload = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    received_for?: string[];
    message_id?: string;
    subject?: string;
    attachments?: unknown[];
  };
};

function collectRecipients(data: ReceivedPayload["data"]) {
  const list: string[] = [];
  for (const key of ["to", "cc", "bcc", "received_for"] as const) {
    const values = data?.[key];
    if (Array.isArray(values)) {
      for (const v of values) {
        if (typeof v === "string" && v.trim()) list.push(v.trim());
      }
    }
  }
  return list;
}

function getInboundWebhookSecret() {
  return (
    process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() ||
    process.env.RESEND_WEBHOOK_SECRET?.trim() ||
    ""
  );
}

function verifyAndParsePayload(
  request: Request,
  rawBody: string
): ReceivedPayload {
  const secret = getInboundWebhookSecret();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  // Production / configured: verify Resend Svix signature (whsec_…)
  if (secret) {
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new Error("Missing Svix webhook headers.");
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    return resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret: secret,
    }) as ReceivedPayload;
  }

  // Local/dev only when no secret is configured
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "RESEND_INBOUND_WEBHOOK_SECRET (or RESEND_WEBHOOK_SECRET) is not set."
    );
  }
  return JSON.parse(rawBody) as ReceivedPayload;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let payload: ReceivedPayload;
    try {
      payload = verifyAndParsePayload(request, rawBody);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invalid webhook signature.";
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (payload.type && payload.type !== "email.received") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const emailId = payload.data?.email_id;
    if (!emailId) {
      return NextResponse.json(
        { error: "Missing email_id" },
        { status: 400 }
      );
    }

    const recipients = collectRecipients(payload.data);
    const db = createAdminClient();
    const resolved = await resolveInboxByRecipient(db, recipients);

    if (!resolved) {
      // Acknowledge so Resend doesn't retry forever for unknown addresses
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "no_matching_inbox",
      });
    }

    const { data: inserted, error } = await db
      .from("receipt_inbound_messages")
      .upsert(
        {
          organization_id: resolved.inbox.organization_id,
          inbox_id: resolved.inbox.id,
          provider: "resend",
          provider_email_id: emailId,
          message_id: payload.data?.message_id || null,
          sender: payload.data?.from || null,
          recipient: resolved.recipient,
          subject: payload.data?.subject || null,
          received_at: payload.data?.created_at || new Date().toISOString(),
          status: "received",
          raw_metadata: (payload.data || {}) as Json,
        },
        { onConflict: "provider,provider_email_id", ignoreDuplicates: true }
      )
      .select("id, status")
      .maybeSingle();

    if (error) {
      // Unique race — fetch existing
      const { data: existing } = await db
        .from("receipt_inbound_messages")
        .select("id, status")
        .eq("provider", "resend")
        .eq("provider_email_id", emailId)
        .maybeSingle();

      if (!existing) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (existing.status === "processed") {
        return NextResponse.json({ ok: true, deduped: true });
      }

      // Process if still pending
      if (existing.status === "received" || existing.status === "failed") {
        await db
          .from("receipt_inbound_messages")
          .update({ status: "processing", error: null })
          .eq("id", existing.id);
        const result = await processInboundReceiptMessage(db, existing.id);
        return NextResponse.json({ ...result, deduped: true });
      }

      return NextResponse.json({ ok: true, deduped: true });
    }

    if (!inserted) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    // Process inline for MVP (cron also retries stuck jobs)
    await db
      .from("receipt_inbound_messages")
      .update({ status: "processing" })
      .eq("id", inserted.id);

    const result = await processInboundReceiptMessage(db, inserted.id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Inbound webhook failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
