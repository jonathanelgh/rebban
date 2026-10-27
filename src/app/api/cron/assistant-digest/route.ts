import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/email/resend";
import {
  collectNeedsAttention,
  formatAttentionDigest,
} from "@/lib/assistant/needs-attention";
import {
  isDigestSendWindow,
  resolveDigestTimezone,
} from "@/lib/assistant/digest-schedule";
import {
  isWhatsAppConfigured,
  sendWhatsAppMessage,
} from "@/lib/whatsapp/client";

export const runtime = "nodejs";

/** Minimum days between digests per user. */
const DIGEST_COOLDOWN_DAYS = 6;
/** Only send when at least this many attention items exist. */
const MIN_ITEMS = 1;
const MAX_LINKS_PER_RUN = 200;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const querySecret = new URL(request.url).searchParams.get("secret");
  return bearer === secret || querySecret === secret;
}

function cooldownCutoffIso() {
  const d = new Date();
  d.setDate(d.getDate() - DIGEST_COOLDOWN_DAYS);
  return d.toISOString();
}

async function processDigests(options?: { force?: boolean }) {
  const supabase = createAdminClient();
  const appUrl = getAppUrl();
  const waReady = isWhatsAppConfigured();
  const cutoff = cooldownCutoffIso();
  const now = new Date();
  const force = Boolean(options?.force);

  const { data: links, error: linksError } = await supabase
    .from("assistant_whatsapp_links")
    .select("id, user_id, organization_id, phone_e164, wa_chat_id, verified_at")
    .not("verified_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(MAX_LINKS_PER_RUN);

  if (linksError) throw new Error(linksError.message);

  const userIds = [
    ...new Set(
      (links || [])
        .map((l) => l.user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const timezoneByUser = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, timezone")
      .in("id", userIds);
    for (const profile of profiles || []) {
      timezoneByUser.set(profile.id, resolveDigestTimezone(profile.timezone));
    }
  }

  const seenUsers = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let skippedTimezone = 0;
  let failed = 0;

  for (const link of links || []) {
    if (!link.organization_id || !link.user_id) {
      skipped += 1;
      continue;
    }
    if (seenUsers.has(link.user_id)) {
      skipped += 1;
      continue;
    }
    seenUsers.add(link.user_id);

    const timeZone =
      timezoneByUser.get(link.user_id) || resolveDigestTimezone(null);

    if (!force && !isDigestSendWindow(timeZone, now)) {
      skippedTimezone += 1;
      continue;
    }

    const { data: recent } = await supabase
      .from("assistant_digest_sends")
      .select("id")
      .eq("user_id", link.user_id)
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();

    if (recent) {
      skipped += 1;
      continue;
    }

    const items = await collectNeedsAttention(
      supabase,
      link.organization_id,
      { limit: 8 }
    );

    if (items.length < MIN_ITEMS) {
      skipped += 1;
      continue;
    }

    const message = formatAttentionDigest(items, {
      maxItems: 6,
      appUrl,
    });

    let waOk = false;
    if (waReady) {
      const result = await sendWhatsAppMessage({
        to: link.phone_e164,
        chatId: link.wa_chat_id,
        message,
      });
      waOk = result.ok;
      if (!result.ok) {
        console.error("[assistant-digest] WA send failed", {
          org: link.organization_id,
          user: link.user_id,
          error: result.error,
        });
      }
    }

    const chatId = link.wa_chat_id || `${link.phone_e164}@c.us`;
    let { data: conversation } = await supabase
      .from("assistant_conversations")
      .select("id")
      .eq("link_id", link.id)
      .eq("wa_chat_id", chatId)
      .maybeSingle();

    if (!conversation) {
      const { data: created } = await supabase
        .from("assistant_conversations")
        .insert({
          channel: "whatsapp",
          link_id: link.id,
          wa_chat_id: chatId,
          user_id: link.user_id,
          organization_id: link.organization_id,
          pending_action: null,
        })
        .select("id")
        .maybeSingle();
      conversation = created;
    }

    if (conversation?.id) {
      await supabase.from("assistant_messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: message.slice(0, 4000),
      });
    }

    await supabase.rpc("create_user_notification", {
      p_organization_id: link.organization_id,
      p_user_id: link.user_id,
      p_type: "assistant_digest",
      p_title: "Needs attention",
      p_body: `${items.length} item${items.length === 1 ? "" : "s"} need your attention. Open Assistant or reply on WhatsApp.`,
      p_link: "/settings?section=assistant",
      p_entity_type: "organization",
      p_entity_id: link.organization_id,
    });

    const { error: logError } = await supabase
      .from("assistant_digest_sends")
      .insert({
        organization_id: link.organization_id,
        user_id: link.user_id,
        channel: waOk ? "whatsapp" : "in_app",
        item_count: items.length,
        payload: {
          kinds: items.map((i) => i.kind),
          item_ids: items.map((i) => i.id),
          wa_sent: waOk,
          timezone: timeZone,
          forced: force,
        },
      });

    if (logError) {
      console.error("[assistant-digest] log insert failed", logError.message);
      failed += 1;
      continue;
    }

    sent += 1;
    if (waReady && !waOk) failed += 1;
  }

  return {
    sent,
    skipped,
    skippedTimezone,
    failed,
    users: seenUsers.size,
  };
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force =
    new URL(request.url).searchParams.get("force") === "1";

  try {
    const result = await processDigests({ force });
    return NextResponse.json({ ok: true, force, ...result });
  } catch (err) {
    console.error("[assistant-digest]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Digest cron failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
