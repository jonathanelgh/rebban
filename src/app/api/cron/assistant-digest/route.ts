import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/email/resend";
import {
  collectNeedsAttention,
  collectUnbilledClients,
} from "@/lib/assistant/needs-attention";
import { formatBillingDigest } from "@/lib/assistant/billing-digest";
import {
  billingCooldownDays,
  billingScheduleFromPrefs,
  isBillingScheduleWindow,
} from "@/lib/assistant/billing-schedule";
import { resolveDigestTimezone } from "@/lib/assistant/digest-schedule";
import { pendingActionToJson } from "@/lib/assistant/tools";
import {
  isWhatsAppConfigured,
  sendWhatsAppMessage,
} from "@/lib/whatsapp/client";

export const runtime = "nodejs";

const MAX_LINKS_PER_RUN = 200;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const querySecret = new URL(request.url).searchParams.get("secret");
  return bearer === secret || querySecret === secret;
}

async function processDigests(options?: { force?: boolean }) {
  const supabase = createAdminClient();
  const appUrl = getAppUrl();
  const waReady = isWhatsAppConfigured();
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

  const profileByUser = new Map<
    string,
    {
      timezone: string;
      fullName: string | null;
      schedule: ReturnType<typeof billingScheduleFromPrefs>;
    }
  >();

  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, timezone, full_name, notification_prefs")
      .in("id", userIds);
    for (const profile of profiles || []) {
      profileByUser.set(profile.id, {
        timezone: resolveDigestTimezone(profile.timezone),
        fullName: profile.full_name,
        schedule: billingScheduleFromPrefs(profile.notification_prefs),
      });
    }
  }

  const seenUsers = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let skippedTimezone = 0;
  let skippedDisabled = 0;
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

    const profile = profileByUser.get(link.user_id) || {
      timezone: resolveDigestTimezone(null),
      fullName: null as string | null,
      schedule: billingScheduleFromPrefs(null),
    };

    if (!profile.schedule.enabled) {
      skippedDisabled += 1;
      continue;
    }

    if (
      !force &&
      !isBillingScheduleWindow(profile.schedule, profile.timezone, now)
    ) {
      skippedTimezone += 1;
      continue;
    }

    const cooldownDays = billingCooldownDays(profile.schedule.cadence);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cooldownDays);

    const { data: recent } = await supabase
      .from("assistant_digest_sends")
      .select("id")
      .eq("user_id", link.user_id)
      .gte("created_at", cutoff.toISOString())
      .limit(1)
      .maybeSingle();

    if (recent) {
      skipped += 1;
      continue;
    }

    const [unbilled, attention] = await Promise.all([
      collectUnbilledClients(supabase, link.organization_id, {
        limit: 8,
        minMinutes: 15,
      }),
      collectNeedsAttention(supabase, link.organization_id, { limit: 8 }),
    ]);

    const attentionExtras = attention.filter((a) => a.kind !== "unbilled_hours");
    if (!unbilled.length && !attentionExtras.length) {
      skipped += 1;
      continue;
    }

    const message = formatBillingDigest({
      unbilled,
      attention: attentionExtras,
      appUrl,
      userName: profile.fullName,
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
      const pending =
        unbilled.length > 0
          ? pendingActionToJson({
              type: "propose_unbilled_invoices",
              clients: unbilled.map((c) => ({
                client_id: c.client_id,
                label: c.label,
              })),
            })
          : null;

      await supabase
        .from("assistant_conversations")
        .update({ pending_action: pending })
        .eq("id", conversation.id);

      await supabase.from("assistant_messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: message.slice(0, 4000),
      });
    }

    await supabase.rpc("create_user_notification", {
      p_organization_id: link.organization_id,
      p_user_id: link.user_id,
      p_type: "assistant_billing_digest",
      p_title: "Invoicing check-in",
      p_body: unbilled.length
        ? `${unbilled.length} client${unbilled.length === 1 ? "" : "s"} with unbilled hours. Reply on WhatsApp to create drafts.`
        : "Something needs attention — open Assistant or reply on WhatsApp.",
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
        item_count: unbilled.length + attentionExtras.length,
        payload: {
          cadence: profile.schedule.cadence,
          timezone: profile.timezone,
          unbilled_client_ids: unbilled.map((c) => c.client_id),
          attention_kinds: attentionExtras.map((a) => a.kind),
          wa_sent: waOk,
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
    skippedDisabled,
    failed,
    users: seenUsers.size,
  };
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";

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
