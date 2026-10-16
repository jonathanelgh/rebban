"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  RefreshCw,
  Send,
  UserRound,
} from "lucide-react";
import { useProfile } from "@/components/ProfileContext";
import { UserAvatar } from "@/components/UserAvatar";
import {
  OUTREACH_STATUSES,
  OUTREACH_STATUS_LABELS,
  TEMPERATURE_LABELS,
  TIER_LABELS,
  statusTone,
  temperatureTone,
  type OutreachStatus,
  type OutreachLeadTier,
  type OutreachResearchConfidence,
} from "@/lib/outreach/constants";
import type { LeadSignupInfo } from "@/lib/outreach/signup";
import type { Database } from "@/types/database";

type Lead = Database["public"]["Tables"]["outreach_leads"]["Row"];
type Message = Database["public"]["Tables"]["outreach_messages"]["Row"];
type Analysis = Database["public"]["Tables"]["outreach_ai_analyses"]["Row"];
type Followup = Database["public"]["Tables"]["outreach_followups"]["Row"];
type TabId = "conversation" | "details";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function leadDisplayName(lead: Lead) {
  return (
    lead.display_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    lead.email
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function AdminLeadDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const { avatarUrl, fullName } = useProfile();
  const [tab, setTab] = useState<TabId>("conversation");
  const [lead, setLead] = useState<Lead | null>(null);
  const [signup, setSignup] = useState<LeadSignupInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [followupDraft, setFollowupDraft] = useState<{
    id: string;
    subject: string;
    body: string;
  } | null>(null);
  const [followupSending, setFollowupSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [suggestedReply, setSuggestedReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/admin/leads/${id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load lead.");
      setLoading(false);
      return;
    }
    const nextMessages = (json.messages || []) as Message[];
    setLead(json.lead as Lead);
    setSignup((json.signup as LeadSignupInfo) || null);
    setDraft(json.lead as Lead);
    setMessages(nextMessages);
    const nextAnalyses = (json.analyses || []) as Analysis[];
    const nextFollowups = (json.followups || []) as Followup[];
    setAnalyses(nextAnalyses);
    setFollowups(nextFollowups);
    setSuggestedReply(nextAnalyses[0]?.suggested_reply || "");
    const due = nextFollowups.find((f) => f.status === "due");
    setFollowupDraft(
      due
        ? {
            id: due.id,
            subject: due.subject || "",
            body: due.body || "",
          }
        : null
    );
    // Expand the latest message by default (Gmail-style).
    if (nextMessages.length) {
      setExpandedIds(new Set([nextMessages[nextMessages.length - 1].id]));
    }
    setError(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch?: Partial<Lead>) {
    if (!id) return;
    setSaving(true);
    setNotice(null);
    const body = patch || draft;
    const res = await fetch(`/api/admin/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Save failed.");
      return;
    }
    setLead(json.lead as Lead);
    setDraft(json.lead as Lead);
    setNotice("Saved.");
    setError(null);
  }

  async function sendNow() {
    if (
      !id ||
      !confirm("Send the initial outreach email via your connected Gmail?")
    ) {
      return;
    }
    setSending(true);
    setNotice(null);
    const res = await fetch(`/api/admin/leads/${id}/send`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(json.error || "Send failed.");
      return;
    }
    setNotice(
      json.alreadySent
        ? "Already sent previously (idempotent)."
        : "Email sent via Gmail."
    );
    setTab("conversation");
    void load();
  }

  async function syncThread() {
    if (!id) return;
    setSyncing(true);
    setNotice(null);
    setError(null);
    const res = await fetch("/api/admin/leads/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id, analyze: true }),
    });
    const json = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok) {
      setError(json.error || "Sync failed.");
      return;
    }
    setNotice(
      `Synced · ${json.imported ?? 0} new message(s) · ${json.analyzed ?? 0} analyzed`
    );
    void load();
  }

  async function regenerateAnalysis() {
    if (!id) return;
    setRegenerating(true);
    setError(null);
    const res = await fetch(`/api/admin/leads/${id}/reply`, { method: "PUT" });
    const json = await res.json().catch(() => ({}));
    setRegenerating(false);
    if (!res.ok) {
      setError(json.error || "Regenerate failed.");
      return;
    }
    setNotice("AI analysis regenerated.");
    void load();
  }

  async function approveAndSendReply() {
    if (!id || !suggestedReply.trim()) return;
    if (!confirm("Send this reply in the same Gmail thread?")) return;
    setReplySending(true);
    setError(null);
    const res = await fetch(`/api/admin/leads/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: suggestedReply }),
    });
    const json = await res.json().catch(() => ({}));
    setReplySending(false);
    if (!res.ok) {
      setError(json.error || "Reply send failed.");
      return;
    }
    setNotice("Reply sent in Gmail thread.");
    setSuggestedReply("");
    void load();
  }

  async function approveAndSendFollowup() {
    if (!followupDraft) return;
    if (!confirm("Send this follow-up in the Gmail thread?")) return;
    setFollowupSending(true);
    setError(null);
    const res = await fetch("/api/admin/leads/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send",
        followupId: followupDraft.id,
        subject: followupDraft.subject,
        body: followupDraft.body,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setFollowupSending(false);
    if (!res.ok) {
      setError(json.error || "Follow-up send failed.");
      return;
    }
    setNotice("Follow-up sent.");
    setFollowupDraft(null);
    void load();
  }

  function setField<K extends keyof Lead>(key: K, value: Lead[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleExpanded(messageId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  const latestAnalysis = analyses[0] || null;
  const name = lead ? leadDisplayName(lead) : "Lead";
  const subject =
    messages.find((m) => m.subject)?.subject ||
    lead?.subject_line ||
    "(no subject)";
  const canSendInitial =
    lead &&
    !lead.do_not_contact &&
    !lead.last_contacted_at &&
    !lead.gmail_message_id;

  if (loading) {
    return (
      <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  if (!lead) {
    return (
      <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto">
        <p className="text-sm text-red-600">{error || "Lead not found."}</p>
      </main>
    );
  }

  return (
    <main className="w-full px-4 sm:px-8 pt-8 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-5">
        <Link
          href="/admin/leads"
          className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to leads
        </Link>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight truncate">
              {name}
            </h1>
            <p className="text-gray-500 mt-1 text-[14px] sm:text-[15px] truncate">
              {lead.email}
              {lead.role ? ` · ${lead.role}` : ""}
              {lead.location ? ` · ${lead.location}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span
                className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${statusTone(lead.outreach_status)}`}
              >
                {OUTREACH_STATUS_LABELS[lead.outreach_status]}
              </span>
              {lead.temperature && (
                <span
                  className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${temperatureTone(lead.temperature)}`}
                >
                  {TEMPERATURE_LABELS[lead.temperature]}
                  {lead.temperature_score != null
                    ? ` ${lead.temperature_score}`
                    : ""}
                </span>
              )}
              {lead.do_not_contact && (
                <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-50 text-red-700">
                  Do not contact
                </span>
              )}
              {signup?.signedUp && (
                <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700">
                  Signed up
                  {signup.onboardingCompletedAt ? " · onboarded" : ""}
                </span>
              )}
              <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600">
                Tier {TIER_LABELS[lead.lead_tier]}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {tab === "details" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="px-3.5 py-2 rounded-xl text-sm font-medium border border-line bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            <button
              type="button"
              disabled={syncing || !lead.gmail_thread_id}
              onClick={() => void syncThread()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border border-line bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync replies"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void save({
                  outreach_status: "ready",
                  ready_to_send: true,
                })
              }
              className="px-3.5 py-2 rounded-xl text-sm font-medium border border-line bg-white hover:bg-gray-50"
            >
              Mark ready
            </button>
            <button
              type="button"
              disabled={sending || !canSendInitial}
              onClick={() => void sendNow()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
              {sending ? "Sending…" : "Send now"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
          {notice}
        </p>
      )}

      <nav className="flex gap-1 border-b border-line mb-5">
        {(
          [
            { id: "conversation" as const, label: "Conversation", icon: Mail },
            { id: "details" as const, label: "Details", icon: UserRound },
          ] as const
        ).map(({ id: tabId, label, icon: Icon }) => {
          const active = tab === tabId;
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => setTab(tabId)}
              className={`inline-flex items-center gap-2 px-3.5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-[#2563EB] text-[#2563EB]"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              {label}
            </button>
          );
        })}
      </nav>

      {tab === "conversation" ? (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
          <section className="surface-panel overflow-hidden min-w-0">
            <div className="px-5 sm:px-6 py-4 border-b border-line">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight leading-snug">
                {subject}
              </h2>
              <p className="text-[13px] text-gray-500 mt-1">
                {messages.length
                  ? `${messages.length} message${messages.length === 1 ? "" : "s"}`
                  : "Draft not sent yet"}
                {lead.gmail_thread_id ? " · Gmail thread linked" : ""}
              </p>
            </div>

            {!messages.length ? (
              <div className="px-5 sm:px-6 py-6">
                <div className="rounded-2xl border border-dashed border-line bg-[#FAFBFC] p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <UserAvatar
                      src={avatarUrl}
                      alt={fullName || "You"}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <span className="text-[14px] font-semibold text-gray-900">
                            {fullName || "You"}
                          </span>
                          <span className="text-[13px] text-gray-400 ml-2">
                            Draft
                          </span>
                        </div>
                        <span className="text-[12px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium">
                          Not sent
                        </span>
                      </div>
                      <p className="text-[13px] text-gray-500 mt-0.5">
                        to {lead.email}
                      </p>
                    </div>
                  </div>
                  <p className="text-[14px] font-medium text-gray-900 mb-3">
                    {lead.subject_line || "(no subject)"}
                  </p>
                  <pre className="whitespace-pre-wrap text-[14px] text-gray-700 font-sans leading-relaxed">
                    {lead.initial_email_body || "No initial email drafted yet."}
                  </pre>
                  {canSendInitial && (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void sendNow()}
                      className="mt-5 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
                    >
                      <Send className="w-4 h-4" />
                      {sending ? "Sending…" : "Send this email"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {messages.map((msg, index) => {
                  const expanded =
                    expandedIds.has(msg.id) || messages.length === 1;
                  const isOutbound = msg.direction === "outbound";
                  const fromLabel = isOutbound
                    ? fullName || msg.from_email || "You"
                    : msg.from_email || name;
                  const toLabel = isOutbound
                    ? (msg.to_emails || []).join(", ") || lead.email
                    : "you";
                  const preview = (msg.body_text || "")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 120);

                  return (
                    <article key={msg.id} className="px-5 sm:px-6 py-4">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(msg.id)}
                        className="w-full text-left flex items-start gap-3"
                      >
                        {isOutbound ? (
                          <UserAvatar
                            src={avatarUrl}
                            alt={fullName || "You"}
                            size="sm"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0 bg-gray-100 text-gray-700">
                            {initials(fromLabel)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[14px] font-semibold text-gray-900 truncate">
                                  {fromLabel}
                                </span>
                                <span
                                  className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                                    isOutbound
                                      ? "bg-[#EFF6FF] text-[#2563EB]"
                                      : "bg-emerald-50 text-emerald-700"
                                  }`}
                                >
                                  {isOutbound ? "Sent" : "Received"}
                                </span>
                              </div>
                              {!expanded && (
                                <p className="text-[13px] text-gray-500 truncate mt-0.5">
                                  {preview || "(empty)"}
                                </p>
                              )}
                              {expanded && (
                                <p className="text-[13px] text-gray-500 mt-0.5">
                                  to {toLabel}
                                </p>
                              )}
                            </div>
                            <time className="text-[12px] text-gray-400 whitespace-nowrap shrink-0">
                              {formatDateTime(msg.sent_at || msg.received_at)}
                            </time>
                          </div>
                        </div>
                      </button>

                      {expanded && (
                        <div className="mt-4 pl-[52px]">
                          {msg.subject && index === 0 && (
                            <p className="text-[13px] text-gray-500 mb-3">
                              Subject: {msg.subject}
                            </p>
                          )}
                          <pre className="whitespace-pre-wrap text-[14px] text-gray-800 font-sans leading-relaxed">
                            {msg.body_text || "(empty)"}
                          </pre>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="border-t border-line px-5 sm:px-6 py-5 bg-[#FAFBFC]">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
                  Suggested reply
                </div>
                <button
                  type="button"
                  disabled={regenerating || !messages.some((m) => m.direction === "inbound")}
                  onClick={() => void regenerateAnalysis()}
                  className="text-[12px] font-medium text-[#2563EB] disabled:opacity-40"
                >
                  {regenerating ? "Regenerating…" : "Regenerate"}
                </button>
              </div>
              <textarea
                value={suggestedReply}
                onChange={(e) => setSuggestedReply(e.target.value)}
                placeholder={
                  messages.some((m) => m.direction === "inbound")
                    ? "AI suggested reply will appear here after sync/analysis. You can edit before sending."
                    : "Sync replies after the prospect responds, then AI will draft a reply here."
                }
                rows={7}
                className="w-full border border-line rounded-xl px-3.5 py-3 text-sm bg-white text-gray-700 resize-y"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    replySending ||
                    !suggestedReply.trim() ||
                    lead.do_not_contact ||
                    !lead.gmail_thread_id
                  }
                  onClick={() => void approveAndSendReply()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                  {replySending ? "Sending…" : "Approve & Send"}
                </button>
                <button
                  type="button"
                  disabled={!suggestedReply}
                  onClick={() => setSuggestedReply("")}
                  className="px-3.5 py-2 rounded-xl text-sm font-medium border border-line bg-white disabled:opacity-40"
                >
                  Discard
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="surface-panel p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                AI analysis
              </h3>
              {!latestAnalysis ? (
                <p className="text-[13px] text-gray-400 leading-relaxed">
                  Reply analysis will appear here after sync + scoring.
                </p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${temperatureTone(latestAnalysis.temperature)}`}
                    >
                      {TEMPERATURE_LABELS[latestAnalysis.temperature]}{" "}
                      {latestAnalysis.score}
                    </span>
                    {latestAnalysis.intent && (
                      <span className="text-[12px] text-gray-500">
                        {latestAnalysis.intent}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-gray-700 leading-relaxed">
                    {latestAnalysis.summary}
                  </p>
                  <ChipList label="Tools" items={latestAnalysis.current_tools} />
                  <ChipList
                    label="Pain points"
                    items={latestAnalysis.pain_points}
                  />
                  <p className="text-[13px] text-gray-600">
                    <span className="font-medium text-gray-800">Next: </span>
                    {latestAnalysis.recommended_action || "—"}
                  </p>
                </div>
              )}
            </div>

            {followupDraft && (
              <div className="surface-panel p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Follow-up due
                </h3>
                <input
                  value={followupDraft.subject}
                  onChange={(e) =>
                    setFollowupDraft({
                      ...followupDraft,
                      subject: e.target.value,
                    })
                  }
                  className="w-full border border-line rounded-xl px-3 py-2 text-sm mb-2"
                  placeholder="Subject"
                />
                <textarea
                  value={followupDraft.body}
                  onChange={(e) =>
                    setFollowupDraft({
                      ...followupDraft,
                      body: e.target.value,
                    })
                  }
                  rows={6}
                  className="w-full border border-line rounded-xl px-3 py-2 text-sm mb-3"
                />
                <button
                  type="button"
                  disabled={followupSending || lead.do_not_contact}
                  onClick={() => void approveAndSendFollowup()}
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                  {followupSending ? "Sending…" : "Approve & send follow-up"}
                </button>
              </div>
            )}

            <div className="surface-panel p-4 text-[13px] text-gray-600 space-y-2">
              <div className="flex justify-between gap-3">
                <span className="text-gray-400">Signed up</span>
                <span
                  className={
                    signup?.signedUp
                      ? "font-medium text-emerald-700"
                      : "text-gray-500"
                  }
                >
                  {signup?.signedUp ? "Yes" : "No"}
                </span>
              </div>
              {signup?.signedUp && (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">Signup date</span>
                    <span>{formatDate(signup.signedUpAt)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">Onboarding</span>
                    <span>
                      {signup.onboardingCompletedAt
                        ? formatDate(signup.onboardingCompletedAt)
                        : "Not finished"}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-gray-400">Last contact</span>
                <span>{formatDateTime(lead.last_contacted_at)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-400">Last reply</span>
                <span>{formatDateTime(lead.last_replied_at)}</span>
              </div>
              <div className="pt-1">
                <div className="text-gray-400 mb-1">Thread ID</div>
                <div className="font-mono text-[11px] break-all text-gray-500">
                  {lead.gmail_thread_id || "—"}
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Section title="Signup status">
            {signup?.signedUp ? (
              <div className="space-y-2 text-sm text-gray-700">
                <p>
                  <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 mr-2">
                    Signed up
                  </span>
                  This email matches a Rebban account
                  {signup.fullName ? ` (${signup.fullName})` : ""}.
                </p>
                <p className="text-[13px] text-gray-500">
                  Joined {formatDate(signup.signedUpAt)}
                  {signup.onboardingCompletedAt
                    ? ` · onboarded ${formatDate(signup.onboardingCompletedAt)}`
                    : " · onboarding not finished"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No Rebban account found for this email yet.
              </p>
            )}
          </Section>

          <Section title="Lead information">
            <Field
              label="Display name"
              value={draft.display_name || ""}
              onChange={(v) => setField("display_name", v || null)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="First name"
                value={draft.first_name || ""}
                onChange={(v) => setField("first_name", v || null)}
              />
              <Field
                label="Last name"
                value={draft.last_name || ""}
                onChange={(v) => setField("last_name", v || null)}
              />
            </div>
            <Field
              label="Business"
              value={draft.business_name || ""}
              onChange={(v) => setField("business_name", v || null)}
            />
            <Field
              label="Email"
              value={draft.email || ""}
              onChange={(v) => setField("email", v)}
            />
            <Field
              label="Role"
              value={draft.role || ""}
              onChange={(v) => setField("role", v || null)}
            />
            <Field
              label="Location"
              value={draft.location || ""}
              onChange={(v) => setField("location", v || null)}
            />
            <Field
              label="Website"
              value={draft.website_url || ""}
              onChange={(v) => setField("website_url", v || null)}
            />
            {(draft.website_url || lead.website_url) && (
              <a
                href={draft.website_url || lead.website_url || "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[13px] text-[#2563EB]"
              >
                Open site <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </Section>

          <Section title="Research">
            <TextArea
              label="Website summary"
              value={draft.website_summary || ""}
              onChange={(v) => setField("website_summary", v || null)}
              rows={4}
            />
            <TextArea
              label="Personalized opener"
              value={draft.personalized_opener || ""}
              onChange={(v) => setField("personalized_opener", v || null)}
              rows={3}
            />
            <TextArea
              label="Why Rebban fits"
              value={draft.rebban_fit || ""}
              onChange={(v) => setField("rebban_fit", v || null)}
              rows={3}
            />
            <Field
              label="Source URL"
              value={draft.source_url || ""}
              onChange={(v) => setField("source_url", v || null)}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[12px] font-medium text-gray-500">
                  Tier
                </span>
                <select
                  value={draft.lead_tier || "b"}
                  onChange={(e) =>
                    setField("lead_tier", e.target.value as OutreachLeadTier)
                  }
                  className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
                >
                  <option value="a">A</option>
                  <option value="b">B</option>
                  <option value="c">C</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-gray-500">
                  Research confidence
                </span>
                <select
                  value={draft.research_confidence || "unknown"}
                  onChange={(e) =>
                    setField(
                      "research_confidence",
                      e.target.value as OutreachResearchConfidence
                    )
                  }
                  className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
            </div>
          </Section>

          <Section title="Outreach">
            <label className="block">
              <span className="text-[12px] font-medium text-gray-500">
                Status
              </span>
              <select
                value={draft.outreach_status || "new"}
                onChange={(e) =>
                  setField("outreach_status", e.target.value as OutreachStatus)
                }
                className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
              >
                {OUTREACH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {OUTREACH_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Subject"
              value={draft.subject_line || ""}
              onChange={(v) => setField("subject_line", v || null)}
            />
            <TextArea
              label="Initial email"
              value={draft.initial_email_body || ""}
              onChange={(v) => setField("initial_email_body", v || null)}
              rows={12}
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(draft.do_not_contact)}
                onChange={(e) => setField("do_not_contact", e.target.checked)}
              />
              Do not contact
            </label>
            <TextArea
              label="Caution note"
              value={draft.caution_note || ""}
              onChange={(v) => setField("caution_note", v || null)}
              rows={2}
            />
          </Section>

          <Section title="Product research">
            <ChipList label="Current tools" items={lead.current_tools} />
            <ChipList label="Pain points" items={lead.pain_points} />
            <ChipList
              label="Competitors"
              items={lead.competitors_mentioned}
            />
            <ChipList label="Feature requests" items={lead.feature_requests} />
            <ChipList label="Objections" items={lead.objections} />
            <ChipList label="Positive signals" items={lead.positive_signals} />
            {!lead.current_tools.length &&
              !lead.pain_points.length &&
              !lead.competitors_mentioned.length && (
                <p className="text-sm text-gray-400">
                  Structured research fills in after replies are analyzed.
                </p>
              )}
          </Section>
        </div>
      )}
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel p-5">
      <h2 className="text-sm font-semibold text-gray-900 tracking-tight mb-4">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-300"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-300 resize-y"
      />
    </label>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-[12px] font-medium text-gray-400 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="px-2 py-0.5 rounded-md text-[11px] bg-gray-100 text-gray-700"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
