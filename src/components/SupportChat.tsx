"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  ChevronLeft,
  History,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  UserRound,
  X,
} from "lucide-react";
import type { AssistantChatComponent } from "@/lib/assistant/components";
import { ChatComponentRenderer } from "@/components/assistant/ChatComponentRenderer";

type Agent = "ai" | "human" | "user" | "system";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  agent: Agent;
  content: string;
  components?: AssistantChatComponent[];
};

type TicketMeta = {
  id: string;
  ticketRef: string;
  status: string;
  assignedAgent: string;
  slaDueAt?: string | null;
  subject?: string;
};

type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: string;
  ticket: {
    id: string;
    ticketRef: string;
    status: string;
    assignedAgent: string;
  } | null;
};

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  a: ({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-[#2563EB] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-white/80 px-1 py-0.5 text-[12px]">
      {children}
    </code>
  ),
};

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  agent: "ai",
  content:
    "Hey 👋 I’m Rebban Assistant.\n\nI can help you run your workspace (add a client, draft an invoice or proposal, create a task) or walk you through how to use Rebban — same capabilities as WhatsApp. What do you need?",
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export function SupportChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketMeta | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    []
  );
  const [loadingHistory, setLoadingHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const sendingRef = useRef(false);

  const hide =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/f/");

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, sending, view]);

  useEffect(() => {
    if (open && view === "chat") {
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 767px)");
    if (!mobile.matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/assistant/conversations/${id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Could not load chat.");
    setConversationId(json.conversation?.id || id);
    setTicket(json.ticket || null);
    const mapped: ChatMessage[] = (json.messages || []).map(
      (m: {
        id: string;
        agent: Agent;
        body: string;
        components?: AssistantChatComponent[];
      }) => ({
        id: m.id,
        agent: m.agent,
        role:
          m.agent === "user"
            ? "user"
            : m.agent === "system"
              ? "system"
              : "assistant",
        content: m.body,
        components: m.components || [],
      })
    );
    setMessages(mapped.length ? mapped : [WELCOME]);
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/assistant/conversations");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not load chats.");
      setConversations(json.conversations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history.");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  async function startNewConversation() {
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not start chat.");
      setConversationId(json.conversation?.id || null);
      setTicket(null);
      setMessages([WELCOME]);
      setView("chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start chat.");
    } finally {
      setSending(false);
    }
  }

  if (hide) return null;

  async function send() {
    const text = input.trim();
    if (!text || sending || sendingRef.current) return;
    sendingRef.current = true;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      agent: "user",
      content: text,
    };
    const next = [...messages.filter((m) => m.id !== "welcome"), userMsg];
    setMessages((prev) =>
      prev.length === 1 && prev[0].id === "welcome"
        ? [userMsg]
        : [...prev, userMsg]
    );
    setInput("");
    setSending(true);
    setError(null);

    try {
      const historyForApi = next
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          conversationId: conversationId || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not get a reply.");
        return;
      }

      if (json.conversationId) setConversationId(json.conversationId);
      if (json.ticket) setTicket(json.ticket);
      else if (!json.escalated) setTicket(null);

      if (json.conversationId) {
        try {
          await loadConversation(json.conversationId);
          return;
        } catch {
          // fall through
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: json.messageId || uid(),
          role: "assistant",
          agent: "ai",
          content: String(json.reply || "").trim() || "Sorry, empty reply.",
          components: Array.isArray(json.components) ? json.components : [],
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 md:bottom-6 md:right-6">
      {open && (
        <div className="pointer-events-auto fixed inset-0 z-[60] flex h-[100dvh] w-screen flex-col overflow-hidden border-0 bg-white md:absolute md:inset-auto md:bottom-0 md:right-0 md:h-[min(560px,calc(100vh-7rem))] md:w-[min(400px,calc(100vw-2rem))] md:rounded-2xl md:border md:border-line md:shadow-[0_12px_40px_rgba(16,24,40,0.14)]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shrink-0">
            <div className="min-w-0">
              {view === "history" ? (
                <button
                  type="button"
                  onClick={() => setView("chat")}
                  className="inline-flex items-center gap-1 text-[14px] font-semibold text-gray-900"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Chats
                </button>
              ) : (
                <>
                  <div className="text-[14px] font-semibold text-gray-900">
                    Assistant
                    {ticket?.ticketRef ? (
                      <span className="ml-2 text-[12px] font-medium text-gray-400">
                        {ticket.ticketRef}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-gray-400">
                    {ticket?.assignedAgent === "human" ? (
                      <>
                        <UserRound className="h-3 w-3" />
                        Human · {statusLabel(ticket.status)}
                      </>
                    ) : (
                      <>
                        <Bot className="h-3 w-3" />
                        AI assistant
                        {ticket?.status === "awaiting_human"
                          ? " · escalated"
                          : ""}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {view === "chat" && (
                <>
                  <button
                    type="button"
                    aria-label="Chat history"
                    onClick={() => {
                      setView("history");
                      void loadHistory();
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  >
                    <History className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    aria-label="New conversation"
                    onClick={() => void startNewConversation()}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </>
              )}
              <button
                type="button"
                aria-label="Close assistant chat"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-800 md:h-8 md:w-8"
              >
                <X className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {view === "history" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {loadingHistory ? (
                <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : !conversations.length ? (
                <p className="px-2 py-8 text-center text-[13px] text-gray-500">
                  No chats yet. Start a conversation and it will show up here.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        void (async () => {
                          setError(null);
                          setView("chat");
                          try {
                            await loadConversation(c.id);
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Could not open chat."
                            );
                          }
                        })();
                      }}
                      className="w-full rounded-xl border border-transparent px-3 py-2.5 text-left hover:border-line hover:bg-[#FAFBFC]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-gray-900">
                          {c.title}
                        </span>
                        {c.ticket ? (
                          <span className="shrink-0 text-[11px] text-gray-400">
                            {c.ticket.ticketRef}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                        {c.ticket?.assignedAgent === "human" ? (
                          <>
                            <UserRound className="h-3 w-3" /> Support
                          </>
                        ) : (
                          <>
                            <Bot className="h-3 w-3" /> Assistant
                          </>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {ticket?.status === "awaiting_human" && (
                <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[12px] text-amber-900">
                  Escalated to a human. We’ll email you within 24 hours
                  {ticket.slaDueAt
                    ? ` (by ${new Date(ticket.slaDueAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })})`
                    : ""}
                  .
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div className="max-w-[85%]">
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                          m.role === "user"
                            ? "bg-gray-900 text-white whitespace-pre-wrap"
                            : m.agent === "system"
                              ? "border border-dashed border-line bg-white text-gray-500"
                              : "bg-[#F3F4F6] text-gray-800"
                        }`}
                      >
                        {m.role !== "user" && (
                          <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            {m.agent === "human" ? (
                              <>
                                <UserRound className="h-3 w-3" /> Human
                              </>
                            ) : m.agent === "system" ? (
                              "System"
                            ) : (
                              <>
                                <Bot className="h-3 w-3" /> AI
                              </>
                            )}
                          </div>
                        )}
                        {m.role === "assistant" || m.agent === "system" ? (
                          m.agent === "system" ? (
                            m.content
                          ) : (
                            <ReactMarkdown components={markdownComponents}>
                              {m.content}
                            </ReactMarkdown>
                          )
                        ) : (
                          m.content
                        )}
                      </div>
                      {m.role === "assistant" && m.components?.length ? (
                        <ChatComponentRenderer
                          components={m.components}
                          conversationId={conversationId}
                          onError={setError}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl bg-[#F3F4F6] px-3.5 py-2.5 text-[13px] text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Thinking…
                    </div>
                  </div>
                )}
                {error && (
                  <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {error}
                  </p>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    rows={2}
                    placeholder="Draft an invoice for Acme, or ask how to…"
                    className="min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-gray-300"
                  />
                  <button
                    type="button"
                    disabled={sending || !input.trim()}
                    onClick={() => void send()}
                    aria-label="Send message"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        aria-label={open ? "Close assistant chat" : "Open assistant chat"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-[0_8px_24px_rgba(16,24,40,0.22)] transition-transform hover:scale-[1.03] hover:bg-gray-800 active:scale-[0.98] ${
          open ? "hidden md:inline-flex" : ""
        }`}
      >
        {open ? (
          <X className="h-6 w-6" strokeWidth={1.75} />
        ) : (
          <MessageCircle className="h-6 w-6" strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
}
