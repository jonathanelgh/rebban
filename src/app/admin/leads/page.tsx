"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Send, Upload } from "lucide-react";
import {
  OUTREACH_STATUSES,
  OUTREACH_STATUS_LABELS,
  TEMPERATURE_LABELS,
  TIER_LABELS,
  statusTone,
  temperatureTone,
  type OutreachStatus,
  type OutreachTemperature,
  type OutreachLeadTier,
} from "@/lib/outreach/constants";
import type { LeadSignupInfo } from "@/lib/outreach/signup";
import type { Database } from "@/types/database";

type Lead = Database["public"]["Tables"]["outreach_leads"]["Row"] & {
  signup?: LeadSignupInfo;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function leadName(lead: Lead) {
  return (
    lead.display_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    lead.email
  );
}

function nextAction(lead: Lead) {
  if (lead.do_not_contact) return "Do not contact";
  if (lead.last_replied_at && !lead.temperature) return "Review reply";
  if (lead.last_replied_at) return "Respond";
  if (lead.outreach_status === "queued") return "In send queue";
  if (lead.ready_to_send || lead.outreach_status === "ready") return "Ready to send";
  if (lead.next_follow_up_at && new Date(lead.next_follow_up_at) <= new Date()) {
    return "Follow-up due";
  }
  if (lead.outreach_status === "contacted") return "Awaiting reply";
  return "Research";
}

export default function AdminLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | OutreachStatus>("");
  const [temperature, setTemperature] = useState<"" | OutreachTemperature>("");
  const [tier, setTier] = useState<"" | OutreachLeadTier>("");
  const [quickFilter, setQuickFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (temperature) params.set("temperature", temperature);
    if (tier) params.set("tier", tier);
    switch (quickFilter) {
      case "ready":
        params.set("ready", "1");
        break;
      case "replied":
        params.set("replied", "1");
        break;
      case "no_reply":
        params.set("replied", "0");
        break;
      case "follow_up_due":
        params.set("followUpDue", "1");
        break;
      case "do_not_contact":
        params.set("doNotContact", "1");
        break;
      case "signed_up":
        params.set("signedUp", "1");
        break;
      case "not_signed_up":
        params.set("signedUp", "0");
        break;
      case "paying":
        params.set("paying", "1");
        break;
      default:
        break;
    }

    const res = await fetch(`/api/admin/leads?${params.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load leads.");
      setLoading(false);
      return;
    }
    setLeads((json.leads || []) as Lead[]);
    setTotal(json.total || 0);
    setError(null);
    setLoading(false);
  }, [page, q, status, temperature, tier, quickFilter]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [load]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [q, status, temperature, tier, quickFilter]);

  async function bulk(action: string, extra?: Record<string, string>) {
    if (!selected.size) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/admin/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: Array.from(selected),
        action,
        ...extra,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Bulk update failed.");
      return;
    }
    setSelected(new Set());
    void load();
  }

  async function sendSelected() {
    if (!selected.size) return;
    const count = selected.size;
    if (
      !confirm(
        `Send the initial outreach email to ${count} selected lead${count === 1 ? "" : "s"} via your connected Gmail?`
      )
    ) {
      return;
    }
    setSending(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/leads/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(json.error || "Send failed.");
      return;
    }
    const parts = [
      `${json.sent ?? 0} sent`,
      json.alreadySent ? `${json.alreadySent} already sent` : null,
      json.failed ? `${json.failed} failed` : null,
    ].filter(Boolean);
    setNotice(parts.join(" · "));
    if (json.failed) {
      const firstFail = (json.results || []).find(
        (r: { ok: boolean; error?: string }) => !r.ok
      );
      if (firstFail?.error) {
        setError(`Some sends failed. Example: ${firstFail.error}`);
      }
    }
    setSelected(new Set());
    void load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allOnPageSelected =
    leads.length > 0 && leads.every((l) => selected.has(l.id));

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-6 pr-16 md:pr-28 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Leads
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Founder outreach — personalized, low volume.
          </p>
        </div>
        <Link
          href="/admin/leads/import"
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </Link>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, role, location…"
              className="w-full border border-line rounded-xl pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-gray-300 bg-white"
            />
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | OutreachStatus)}
            className="border border-line rounded-xl px-3 py-2.5 text-sm bg-white"
          >
            <option value="">All statuses</option>
            {OUTREACH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OUTREACH_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={temperature}
            onChange={(e) =>
              setTemperature(e.target.value as "" | OutreachTemperature)
            }
            className="border border-line rounded-xl px-3 py-2.5 text-sm bg-white"
          >
            <option value="">All temps</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as "" | OutreachLeadTier)}
            className="border border-line rounded-xl px-3 py-2.5 text-sm bg-white"
          >
            <option value="">All tiers</option>
            <option value="a">Tier A</option>
            <option value="b">Tier B</option>
            <option value="c">Tier C</option>
          </select>
          <select
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            className="border border-line rounded-xl px-3 py-2.5 text-sm bg-white min-w-[160px]"
          >
            <option value="">All leads</option>
            <option value="ready">Ready to send</option>
            <option value="replied">Replied</option>
            <option value="no_reply">No reply</option>
            <option value="follow_up_due">Follow-up due</option>
            <option value="do_not_contact">Do not contact</option>
            <option value="signed_up">Signed up</option>
            <option value="not_signed_up">Not signed up</option>
            <option value="paying">Paying</option>
          </select>
        </div>
      </div>

      {notice && (
        <p className="mb-4 text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
          {notice}
        </p>
      )}

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 p-3 rounded-xl border border-line bg-[#FAFBFC]">
          <span className="text-[13px] text-gray-600 mr-1">
            {selected.size} selected
          </span>
          <button
            type="button"
            disabled={busy || sending}
            onClick={() => void sendSelected()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? "Sending…" : "Send email"}
          </button>
          <button
            type="button"
            disabled={busy || sending}
            onClick={() => void bulk("mark_ready")}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white border border-line hover:bg-gray-50 disabled:opacity-50"
          >
            Mark ready
          </button>
          <button
            type="button"
            disabled={busy || sending}
            onClick={() => void bulk("queue")}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white border border-line hover:bg-gray-50 disabled:opacity-50"
          >
            Queue
          </button>
          <button
            type="button"
            disabled={busy || sending}
            onClick={() => void bulk("do_not_contact")}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white border border-line text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Do not contact
          </button>
        </div>
      )}

      <div className="surface-panel overflow-hidden">
        {loading ? (
          <div className="p-5 text-sm text-gray-400">Loading…</div>
        ) : !leads.length ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 mb-3">No leads yet.</p>
            <Link
              href="/admin/leads/import"
              className="text-[13px] font-medium text-[#2563EB]"
            >
              Import your first CSV
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[900px]">
              <thead className="bg-[#FAFBFC] border-b border-line text-[12px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelected(new Set(leads.map((l) => l.id)));
                        } else {
                          setSelected(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Temp</th>
                  <th className="px-4 py-3 font-medium">Last contact</th>
                  <th className="px-4 py-3 font-medium">Last reply</th>
                  <th className="px-4 py-3 font-medium">Next</th>
                  <th className="px-4 py-3 font-medium">Tools</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-[#FAFBFC] cursor-pointer"
                    onClick={() => router.push(`/admin/leads/${lead.id}`)}
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(lead.id);
                          else next.delete(lead.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <div className="font-medium text-gray-900 truncate">
                          {leadName(lead)}
                        </div>
                        {lead.signup?.paying ? (
                          <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700">
                            Paying
                          </span>
                        ) : lead.signup?.onTrial ? (
                          <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">
                            Trial
                          </span>
                        ) : lead.signup?.signedUp ? (
                          <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                            Signed up
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[12px] text-gray-400">{lead.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {lead.role || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {lead.location || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-medium text-gray-700">
                        {TIER_LABELS[lead.lead_tier]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${statusTone(lead.outreach_status)}`}
                      >
                        {OUTREACH_STATUS_LABELS[lead.outreach_status]}
                      </span>
                      {lead.do_not_contact && (
                        <span className="ml-1 inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-50 text-red-700">
                          DNC
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.temperature ? (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${temperatureTone(lead.temperature)}`}
                        >
                          {TEMPERATURE_LABELS[lead.temperature]}
                          {lead.temperature_score != null
                            ? ` ${lead.temperature_score}`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(lead.last_contacted_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(lead.last_replied_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-[13px]">
                      {nextAction(lead)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-[12px] max-w-[140px] truncate">
                      {lead.current_tools?.length
                        ? lead.current_tools.slice(0, 3).join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            {total} lead{total === 1 ? "" : "s"} · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-line disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-line disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

