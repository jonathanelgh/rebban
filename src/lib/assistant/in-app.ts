import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import {
  parsePendingAction,
  pendingActionToJson,
  type AssistantPendingAction,
} from "@/lib/assistant/tools";

type Db = SupabaseClient<Database>;

export type InAppConversation = {
  id: string;
  title: string | null;
  pending_action: Json | null;
  support_ticket_id: string | null;
  updated_at: string;
  created_at: string;
};

function titleFromMessage(body: string) {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  if (cleaned.length <= 72) return cleaned;
  return `${cleaned.slice(0, 71)}…`;
}

export async function getInAppConversationForUser(
  db: Db,
  conversationId: string,
  userId: string
) {
  const { data, error } = await db
    .from("assistant_conversations")
    .select(
      "id, title, pending_action, support_ticket_id, updated_at, created_at, user_id, channel"
    )
    .eq("id", conversationId)
    .eq("user_id", userId)
    .eq("channel", "in_app")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listInAppConversations(
  db: Db,
  userId: string,
  limit = 30
) {
  const { data, error } = await db
    .from("assistant_conversations")
    .select(
      "id, title, pending_action, support_ticket_id, updated_at, created_at"
    )
    .eq("user_id", userId)
    .eq("channel", "in_app")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as InAppConversation[];
}

export async function createInAppConversation(options: {
  db: Db;
  userId: string;
  organizationId: string;
  title?: string | null;
}) {
  const { data, error } = await options.db
    .from("assistant_conversations")
    .insert({
      channel: "in_app",
      user_id: options.userId,
      organization_id: options.organizationId,
      link_id: null,
      wa_chat_id: null,
      pending_action: null,
      title: options.title || "New chat",
    })
    .select(
      "id, title, pending_action, support_ticket_id, updated_at, created_at"
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Could not create conversation.");
  }
  return data as InAppConversation;
}

export async function getOrCreateInAppConversation(options: {
  db: Db;
  userId: string;
  organizationId: string;
  conversationId?: string | null;
  firstMessage?: string | null;
}) {
  if (options.conversationId) {
    const existing = await getInAppConversationForUser(
      options.db,
      options.conversationId,
      options.userId
    );
    if (existing) return existing as InAppConversation;
  }

  return createInAppConversation({
    db: options.db,
    userId: options.userId,
    organizationId: options.organizationId,
    title: options.firstMessage
      ? titleFromMessage(options.firstMessage)
      : "New chat",
  });
}

export async function listInAppMessages(db: Db, conversationId: string) {
  const { data, error } = await db
    .from("assistant_messages")
    .select("id, role, content, metadata, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function appendInAppMessage(options: {
  db: Db;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Json | null;
}) {
  const content = options.content.trim().slice(0, 8000);
  if (!content) throw new Error("Message is required.");

  const { data, error } = await options.db
    .from("assistant_messages")
    .insert({
      conversation_id: options.conversationId,
      role: options.role,
      content,
      metadata: (options.metadata || {}) as Json,
    })
    .select("id, role, content, metadata, created_at")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Could not save message.");
  }

  await options.db
    .from("assistant_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", options.conversationId);

  return data;
}

export async function trimInAppMessages(db: Db, conversationId: string) {
  const { data: oldIds } = await db
    .from("assistant_messages")
    .select("id")
    .eq("conversation_id", conversationId)
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
}

export function readPendingAction(conversation: {
  pending_action: Json | null;
}) {
  return parsePendingAction(conversation.pending_action);
}

export async function writePendingAction(
  db: Db,
  conversationId: string,
  action: AssistantPendingAction | null
) {
  const { error } = await db
    .from("assistant_conversations")
    .update({ pending_action: pendingActionToJson(action) })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
}

export async function linkConversationTicket(
  db: Db,
  conversationId: string,
  ticketId: string
) {
  const { error } = await db
    .from("assistant_conversations")
    .update({ support_ticket_id: ticketId })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
}
