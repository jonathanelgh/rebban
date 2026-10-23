import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateAssistantReply,
  isAssistantAiConfigured,
} from "@/lib/assistant/chat";
import {
  parsePendingAction,
  pendingActionToJson,
  type AssistantPendingAction,
} from "@/lib/assistant/tools";
import { getAppUrl } from "@/lib/email/resend";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";

export type InboundWhatsAppPayload = {
  from: string;
  chatId?: string;
  body: string;
  messageId?: string | null;
  timestamp?: number;
  type?: string;
};

function verifyWebhookAuth(request: Request, rawBody: string): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  if (!secret) return false;

  const headerSecret = request.headers.get("x-rebban-webhook-secret")?.trim();
  if (headerSecret && headerSecret === secret) return true;

  const signature = request.headers.get("x-rebban-signature")?.trim();
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export function assertWhatsAppWebhook(
  request: Request,
  rawBody: string
): boolean {
  return verifyWebhookAuth(request, rawBody);
}

async function tryVerifyCode(
  phone: string,
  body: string
): Promise<string | null> {
  const code = body.replace(/\s+/g, "").match(/\b(\d{6})\b/)?.[1];
  if (!code) return null;

  const db = createAdminClient();
  const { data: link } = await db
    .from("assistant_whatsapp_links")
    .select(
      "id, verification_code, verification_expires_at, verified_at, phone_e164"
    )
    .eq("phone_e164", phone)
    .maybeSingle();

  if (!link || link.verified_at) return null;
  if (!link.verification_code || link.verification_code !== code) return null;
  if (
    link.verification_expires_at &&
    new Date(link.verification_expires_at).getTime() < Date.now()
  ) {
    return "That verification code expired. Request a new one in Rebban Settings → Integrations.";
  }

  await db
    .from("assistant_whatsapp_links")
    .update({
      verified_at: new Date().toISOString(),
      verification_code: null,
      verification_expires_at: null,
    })
    .eq("id", link.id);

  return "You're connected to Rebban Assistant. Try: Add Sarah from Studio North as a lead.";
}

export async function processWhatsAppInbound(
  payload: InboundWhatsAppPayload
): Promise<{ reply: string | null; skipped?: boolean }> {
  const phone = normalizeWhatsAppPhone(payload.from);
  const body = (payload.body || "").trim();
  if (!phone || !body) {
    return { reply: null, skipped: true };
  }

  const chatId = payload.chatId || `${phone}@c.us`;
  const db = createAdminClient();

  const verifyReply = await tryVerifyCode(phone, body);
  if (verifyReply) {
    await sendWhatsAppMessage({ to: phone, message: verifyReply });
    return { reply: verifyReply };
  }

  const { data: link } = await db
    .from("assistant_whatsapp_links")
    .select("id, user_id, organization_id, verified_at")
    .eq("phone_e164", phone)
    .maybeSingle();

  if (!link || !link.verified_at) {
    const appUrl = getAppUrl();
    const reply = `Hi! To use Rebban Assistant, connect this WhatsApp number in Rebban:\n${appUrl}/settings?section=assistant\n\nSettings → Assistant.`;
    await sendWhatsAppMessage({ to: phone, message: reply });
    return { reply };
  }

  if (!isAssistantAiConfigured()) {
    const reply =
      "Rebban Assistant is temporarily unavailable. Please try again later or use the dashboard.";
    await sendWhatsAppMessage({ to: phone, message: reply });
    return { reply };
  }

  let { data: conversation } = await db
    .from("assistant_conversations")
    .select("id, pending_action")
    .eq("link_id", link.id)
    .eq("wa_chat_id", chatId)
    .maybeSingle();

  if (!conversation) {
    const { data: created, error } = await db
      .from("assistant_conversations")
      .insert({
        link_id: link.id,
        wa_chat_id: chatId,
        pending_action: null,
      })
      .select("id, pending_action")
      .single();
    if (error || !created) {
      throw new Error(error?.message || "Could not create conversation.");
    }
    conversation = created;
  }

  await db.from("assistant_messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: body.slice(0, 8000),
    wa_message_id: payload.messageId || null,
  });

  const { data: historyRows } = await db
    .from("assistant_messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(16);

  const messages = (historyRows || [])
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const { data: profile } = await db
    .from("profiles")
    .select("full_name")
    .eq("id", link.user_id)
    .maybeSingle();

  let pendingAction = parsePendingAction(conversation.pending_action);

  const setPendingAction = async (action: AssistantPendingAction | null) => {
    pendingAction = action;
    await db
      .from("assistant_conversations")
      .update({ pending_action: pendingActionToJson(action) })
      .eq("id", conversation!.id);
  };

  const { reply } = await generateAssistantReply({
    messages,
    userName: profile?.full_name,
    toolContext: {
      db,
      userId: link.user_id,
      organizationId: link.organization_id,
      conversationId: conversation.id,
      pendingAction,
      setPendingAction,
    },
  });

  const safeReply = reply.slice(0, 4000);

  await db.from("assistant_messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: safeReply,
  });

  // Keep history lean
  const { data: oldIds } = await db
    .from("assistant_messages")
    .select("id")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .range(40, 200);

  if (oldIds?.length) {
    await db
      .from("assistant_messages")
      .delete()
      .in(
        "id",
        oldIds.map((r) => r.id)
      );
  }

  await sendWhatsAppMessage({ to: phone, message: safeReply });
  return { reply: safeReply };
}
