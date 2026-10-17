"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Loader2,
  Send,
  UserRound,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

type Ticket = {
  id: string;
  ticketRef: string;
  subject: string;
  status: string;
  priority: string;
  assignedAgent: string;
  requesterEmail: string | null;
  requesterName: string | null;
  organizationName: string | null;
  escalationReason: string | null;
  escalatedAt: string | null;
  slaDueAt: string | null;
  firstHumanReplyAt: string | null;
  createdAt: string;
};

type Message = {
  id: string;
  agent: string;
  body: string;
  isInternal: boolean;
  emailSentAt: string | null;
  createdAt: string;
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function agentLabel(agent: string) {
  if (agent === "ai") return "AI";
  if (agent === "human") return "Human";
  if (agent === "user") return "User";
  return "System";
}

export default function AdminSupportTicketPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/support/${id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load ticket.");
      setLoading(false);
      return;
    }
    setTicket(json.ticket);
    setMessages(json.messages || []);
    setError(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReply() {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/support/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: text,
        isInternal: internal,
        sendEmail: !internal && sendEmail,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(json.error || "Could not send reply.");
      return;
    }
    setReply("");
    setNotice(
      internal
        ? "Internal note saved."
        : sendEmail
          ? "Reply sent and emailed to the user."
          : "Reply saved in the ticket."
    );
    await load();
  }

  async function markResolved() {
    setSending(true);
    const res = await fetch(`/api/admin/support/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolve: true }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(json.error || "Could not resolve.");
      return;
    }
    setNotice("Ticket marked resolved.");
    await load();
  }

  if (loading && !ticket) {
    return (
      <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-5xl mx-auto">
        <p className="text-sm text-gray-400">Loading ticket…</p>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-5xl mx-auto">
        <p className="text-sm text-red-600">{error || "Ticket not found."}</p>
        <Link
          href="/admin/support"
          className="inline-flex items-center gap-1.5 text-[13px] text-gray-600 mt-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to support
        </Link>
      </main>
    );
  }

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-5xl mx-auto">
      <Link
        href="/admin/support"
        className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 mb-5"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Support inbox
      </Link>

      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="flex-1 min-w-0">
          <div className="mb-5">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                {ticket.ticketRef}
              </h1>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 capitalize">
                {ticket.status.replace(/_/g, " ")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {ticket.assignedAgent === "human" ? (
                  <UserRound className="w-3 h-3" />
                ) : (
                  <Bot className="w-3 h-3" />
                )}
                {ticket.assignedAgent === "human" ? "Human" : "AI"}
              </span>
            </div>
            <p className="text-gray-600 text-[15px]">{ticket.subject}</p>
          </div>

          {error && (
            <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}
          {notice && (
            <p className="mb-4 text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
              {notice}
            </p>
          )}

          <div className="surface-panel overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.agent === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      m.agent === "user"
                        ? "bg-gray-900 text-white whitespace-pre-wrap"
                        : m.isInternal
                          ? "bg-amber-50 border border-amber-100 text-amber-950"
                          : m.agent === "system"
                            ? "bg-white border border-dashed border-line text-gray-500"
                            : "bg-[#F3F4F6] text-gray-800"
                    }`}
                  >
                    <div
                      className={`mb-1 text-[11px] font-medium ${
                        m.agent === "user" ? "text-white/60" : "text-gray-400"
                      }`}
                    >
                      {agentLabel(m.agent)}
                      {m.isInternal ? " · internal" : ""}
                      {m.emailSentAt ? " · emailed" : ""}
                      {" · "}
                      {formatWhen(m.createdAt)}
                    </div>
                    {m.agent === "ai" || m.agent === "human" ? (
                      <ReactMarkdown>{m.body}</ReactMarkdown>
                    ) : (
                      m.body
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-line p-4 space-y-3">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                placeholder="Reply as Human…"
                className="w-full resize-y rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-gray-300"
              />
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-[13px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />
                  Internal note
                </label>
                {!internal && (
                  <label className="inline-flex items-center gap-2 text-[13px] text-gray-600">
                    <input
                      type="checkbox"
                      checked={sendEmail}
                      onChange={(e) => setSendEmail(e.target.checked)}
                    />
                    Email user
                  </label>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={sending || ticket.status === "resolved"}
                    onClick={() => void markResolved()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Resolve
                  </button>
                  <button
                    type="button"
                    disabled={sending || !reply.trim()}
                    onClick={() => void submitReply()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                  >
                    {sending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    {internal ? "Save note" : "Send as Human"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="w-full lg:w-72 shrink-0 space-y-3">
          <div className="bg-white border border-line rounded-2xl p-4 space-y-3 text-[13px]">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">
                Requester
              </div>
              <div className="font-medium text-gray-900">
                {ticket.requesterName || "—"}
              </div>
              <div className="text-gray-500">{ticket.requesterEmail || "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">
                Workspace
              </div>
              <div className="text-gray-800">
                {ticket.organizationName || "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">
                Priority
              </div>
              <div className="capitalize text-gray-800">{ticket.priority}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">
                SLA due
              </div>
              <div className="text-gray-800">{formatWhen(ticket.slaDueAt)}</div>
            </div>
            {ticket.escalationReason && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">
                  Escalation reason
                </div>
                <div className="text-gray-800 whitespace-pre-wrap">
                  {ticket.escalationReason}
                </div>
              </div>
            )}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">
                Created
              </div>
              <div className="text-gray-800">
                {formatWhen(ticket.createdAt)}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
