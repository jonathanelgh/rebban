import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  pendingActionToJson,
  type AssistantPendingAction,
} from "@/lib/assistant/tools";
import {
  isWhatsAppConfigured,
  sendWhatsAppMessage,
} from "@/lib/whatsapp/client";

type Db = SupabaseClient<Database>;

/**
 * Push a proactive assistant WhatsApp (+ optional in-app notification).
 * Prefers the given userId's verified link; falls back to any verified org link.
 */
export async function sendAssistantOutbound(options: {
  db: Db;
  organizationId: string;
  userId: string;
  message: string;
  pendingAction?: AssistantPendingAction | null;
  notification?: {
    type: string;
    title: string;
    body: string;
    link?: string | null;
    entityType?: string | null;
    entityId?: string | null;
  };
}): Promise<{ ok: boolean; waSent: boolean; error?: string }> {
  const {
    db,
    organizationId,
    userId,
    message,
    pendingAction = null,
    notification,
  } = options;

  let { data: link } = await db
    .from("assistant_whatsapp_links")
    .select("id, user_id, organization_id, phone_e164, wa_chat_id, verified_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .not("verified_at", "is", null)
    .maybeSingle();

  if (!link) {
    const { data: fallback } = await db
      .from("assistant_whatsapp_links")
      .select(
        "id, user_id, organization_id, phone_e164, wa_chat_id, verified_at"
      )
      .eq("organization_id", organizationId)
      .not("verified_at", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    link = fallback;
  }

  let waSent = false;
  if (link && isWhatsAppConfigured()) {
    const result = await sendWhatsAppMessage({
      to: link.phone_e164,
      chatId: link.wa_chat_id,
      message,
    });
    waSent = result.ok;
    if (!result.ok) {
      console.error("[assistant outbound] WA failed", result.error);
    }
  }

  if (link) {
    const chatId = link.wa_chat_id || `${link.phone_e164}@c.us`;
    let { data: conversation } = await db
      .from("assistant_conversations")
      .select("id")
      .eq("link_id", link.id)
      .eq("wa_chat_id", chatId)
      .maybeSingle();

    if (!conversation) {
      const { data: created } = await db
        .from("assistant_conversations")
        .insert({
          channel: "whatsapp",
          link_id: link.id,
          wa_chat_id: chatId,
          user_id: link.user_id,
          organization_id: organizationId,
          pending_action: pendingActionToJson(pendingAction),
        })
        .select("id")
        .maybeSingle();
      conversation = created;
    } else {
      await db
        .from("assistant_conversations")
        .update({
          pending_action: pendingActionToJson(pendingAction),
        })
        .eq("id", conversation.id);
    }

    if (conversation?.id) {
      await db.from("assistant_messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: message.slice(0, 4000),
      });
    }
  }

  if (notification) {
    await db.rpc("create_user_notification", {
      p_organization_id: organizationId,
      p_user_id: userId,
      p_type: notification.type,
      p_title: notification.title,
      p_body: notification.body,
      p_link: notification.link ?? undefined,
      p_entity_type: notification.entityType ?? undefined,
      p_entity_id: notification.entityId ?? undefined,
    });
  }

  return {
    ok: true,
    waSent,
    error: link ? undefined : "No verified WhatsApp link",
  };
}
