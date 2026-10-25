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
  phone?: string | null;
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

async function replyToSender(options: {
  chatId?: string | null;
  phone?: string | null;
  message: string;
}) {
  const result = await sendWhatsAppMessage({
    chatId: options.chatId,
    to: options.phone || undefined,
    message: options.message,
  });
  if (!result.ok) {
    console.error("[assistant] WhatsApp reply failed:", result.error);
  }
  return result;
}

async function tryVerifyCode(options: {
  phone: string | null;
  chatId: string;
  body: string;
}): Promise<string | null> {
  const code = options.body.replace(/\s+/g, "").match(/\b(\d{6})\b/)?.[1];
  if (!code) return null;

  const db = createAdminClient();

  let linkQuery = db
    .from("assistant_whatsapp_links")
    .select(
      "id, verification_code, verification_expires_at, verified_at, phone_e164, wa_chat_id"
    );

  if (options.phone) {
    linkQuery = linkQuery.eq("phone_e164", options.phone);
  } else if (options.chatId) {
    linkQuery = linkQuery.eq("wa_chat_id", options.chatId);
  } else {
    return null;
  }

  const { data: link } = await linkQuery.maybeSingle();

  if (!link || link.verified_at) return null;
  if (!link.verification_code || link.verification_code !== code) return null;
  if (
    link.verification_expires_at &&
    new Date(link.verification_expires_at).getTime() < Date.now()
  ) {
    return "That verification code expired. Request a new one in Rebban Settings → Assistant.";
  }

  await db
    .from("assistant_whatsapp_links")
    .update({
      verified_at: new Date().toISOString(),
      verification_code: null,
      verification_expires_at: null,
      wa_chat_id: options.chatId || link.wa_chat_id,
    })
    .eq("id", link.id);

  return "You're connected to Rebban Assistant. Try: Add Sarah from Studio North as a lead.";
}

async function resolveLink(options: {
  phone: string | null;
  chatId: string;
}) {
  const db = createAdminClient();

  if (options.phone) {
    const { data: byPhone } = await db
      .from("assistant_whatsapp_links")
      .select("id, user_id, organization_id, verified_at, phone_e164, wa_chat_id")
      .eq("phone_e164", options.phone)
      .maybeSingle();
    if (byPhone) {
      if (
        options.chatId &&
        byPhone.wa_chat_id !== options.chatId &&
        byPhone.verified_at
      ) {
        await db
          .from("assistant_whatsapp_links")
          .update({ wa_chat_id: options.chatId })
          .eq("id", byPhone.id);
        byPhone.wa_chat_id = options.chatId;
      }
      return byPhone;
    }
  }

  if (options.chatId) {
    const { data: byChat } = await db
      .from("assistant_whatsapp_links")
      .select("id, user_id, organization_id, verified_at, phone_e164, wa_chat_id")
      .eq("wa_chat_id", options.chatId)
      .maybeSingle();
    if (byChat) return byChat;
  }

  return null;
}

export async function processWhatsAppInbound(
  payload: InboundWhatsAppPayload
): Promise<{ reply: string | null; skipped?: boolean }> {
  const chatId = (payload.chatId || "").trim();
  const phone = normalizeWhatsAppPhone(
    payload.phone || payload.from || ""
  );
  const body = (payload.body || "").trim();
  if (!body || (!phone && !chatId)) {
    return { reply: null, skipped: true };
  }

  const replyTarget = {
    chatId: chatId || null,
    phone: phone || null,
  };

  const verifyReply = await tryVerifyCode({
    phone: phone || null,
    chatId,
    body,
  });
  if (verifyReply) {
    await replyToSender({ ...replyTarget, message: verifyReply });
    return { reply: verifyReply };
  }

  const link = await resolveLink({ phone: phone || null, chatId });

  if (!link || !link.verified_at) {
    const appUrl = getAppUrl();
    const reply = `Hi! To use Rebban Assistant, connect this WhatsApp number in Rebban:\n${appUrl}/settings?section=assistant\n\nSettings → Assistant.`;
    await replyToSender({ ...replyTarget, message: reply });
    return { reply };
  }

  if (!isAssistantAiConfigured()) {
    const reply =
      "Rebban Assistant is temporarily unavailable. Please try again later or use the dashboard.";
    await replyToSender({ ...replyTarget, message: reply });
    return { reply };
  }

  const db = createAdminClient();
  const conversationChatId = chatId || `${link.phone_e164}@c.us`;

  let { data: conversation } = await db
    .from("assistant_conversations")
    .select("id, pending_action")
    .eq("link_id", link.id)
    .eq("wa_chat_id", conversationChatId)
    .maybeSingle();

  if (!conversation) {
    const { data: created, error } = await db
      .from("assistant_conversations")
      .insert({
        channel: "whatsapp",
        link_id: link.id,
        wa_chat_id: conversationChatId,
        user_id: link.user_id,
        organization_id: link.organization_id,
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
      channel: "whatsapp",
    },
  });

  const safeReply = reply.slice(0, 4000);

  await db.from("assistant_messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: safeReply,
  });

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

  await replyToSender({ ...replyTarget, message: safeReply });
  return { reply: safeReply };
}
