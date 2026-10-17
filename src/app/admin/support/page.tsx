"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Clock3, Search, UserRound } from "lucide-react";

type TicketRow = {
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
  slaDueAt: string | null;
  slaBreached: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  messageCount: number;
  updatedAt: string;
};

type Counts = {
  awaitingHuman: number;
  open: number;
  awaitingUser: number;
  breached: number;
};

function statusTone(status: string) {
  switch (status) {
    case "awaiting_human":
      return "bg-amber-50 text-amber-800";
    case "awaiting_user":
      return "bg-blue-50 text-blue-700";
    case "resolved":
      return "bg-emerald-50 text-emerald-700";
    case "closed":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

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

function labelStatus(status: string) {
  return status.replace(/_/g, " ");
}

export default function AdminSupportPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [status, setStatus] = useState("awaiting_human");
  const [agent, setAgent] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (agent !== "all") params.set("agent", agent);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/support?${params.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load tickets.");
      setLoading(false);
      return;
    }
    setTickets(json.tickets || []);
    setCounts(json.counts || null);
    setError(null);
    setLoading(false);
  }, [status, agent, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
          Support
        </h1>
        <p className="text-gray-500 mt-1.5 text-[15px]">
          Tickets from in-app AI chat. Escalate to Human when needed; reply by
          email within 24 hours.
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Needs human"
          value={counts ? String(counts.awaitingHuman) : "—"}
        />
        <StatCard label="AI open" value={counts ? String(counts.open) : "—"} />
        <StatCard
          label="Waiting on user"
          value={counts ? String(counts.awaitingUser) : "—"}
        />
        <StatCard
          label="SLA breached"
          value={counts ? String(counts.breached) : "—"}
          danger={(counts?.breached || 0) > 0}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subject, email, reason…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-line bg-white text-sm outline-none focus:border-gray-300"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-gray-700"
        >
          <option value="awaiting_human">Awaiting human</option>
          <option value="open">Open (AI)</option>
          <option value="awaiting_user">Awaiting user</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
          <option value="all">All statuses</option>
        </select>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-gray-700"
        >
          <option value="all">All agents</option>
          <option value="human">Human</option>
          <option value="ai">AI</option>
        </select>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="surface-panel overflow-hidden">
        {loading ? (
          <div className="p-5 text-sm text-gray-400">Loading…</div>
        ) : !tickets.length ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No tickets match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[780px]">
              <thead className="bg-[#FAFBFC] border-b border-line text-[12px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Ticket</th>
                  <th className="px-4 py-3 font-medium">Requester</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">SLA</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/admin/support/${t.id}`)}
                    className="hover:bg-[#FAFBFC] cursor-pointer"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-gray-900">
                        {t.ticketRef}
                      </div>
                      <div className="text-[13px] text-gray-500 truncate max-w-[280px]">
                        {t.subject}
                      </div>
                      {t.escalationReason && (
                        <div className="text-[12px] text-amber-700 mt-0.5 truncate max-w-[280px]">
                          {t.escalationReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-gray-800">
                        {t.requesterName || "—"}
                      </div>
                      <div className="text-[12px] text-gray-400">
                        {t.requesterEmail || t.organizationName || ""}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-700">
                        {t.assignedAgent === "human" ? (
                          <UserRound className="w-3.5 h-3.5 text-gray-500" />
                        ) : (
                          <Bot className="w-3.5 h-3.5 text-gray-500" />
                        )}
                        {t.assignedAgent === "human" ? "Human" : "AI"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusTone(t.status)}`}
                      >
                        {labelStatus(t.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {t.slaDueAt ? (
                        <span
                          className={`inline-flex items-center gap-1 text-[12px] ${
                            t.slaBreached
                              ? "text-red-600 font-medium"
                              : "text-gray-500"
                          }`}
                        >
                          <Clock3 className="w-3.5 h-3.5" />
                          {formatWhen(t.slaDueAt)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 text-[13px]">
                      {formatWhen(t.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-[12px] text-gray-400">
        Tip: default view shows tickets waiting on a human.{" "}
        <Link href="/admin/support?status=all" className="text-gray-500 underline">
          See all
        </Link>
      </p>
    </main>
  );
}

function StatCard({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="bg-white border border-line rounded-2xl p-5">
      <span className="text-xs font-medium text-gray-500 tracking-wide">
        {label}
      </span>
      <h3
        className={`text-2xl font-semibold tracking-tight mt-2 ${
          danger ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </h3>
    </div>
  );
}
