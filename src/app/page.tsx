"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Eye,
  Send,
  Timer,
  Clock,
  ArrowRight,
  Receipt,
  FileText,
} from "lucide-react";
import { TimerStartForm } from "@/components/TimerStartForm";
import { useTimeTracking } from "@/components/TimeTrackingContext";
import { useProfile } from "@/components/ProfileContext";
import { createClient } from "@/lib/supabase/client";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstNameFrom(fullName: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString()}`;
  }
}

function formatHours(minutes: number) {
  const hours = minutes / 60;
  if (hours === 0) return "0 hours";
  if (hours < 10) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
  }
  return `${Math.round(hours)} hours`;
}

type DashboardStats = {
  outstanding: number;
  outstandingCount: number;
  unbilled: number;
  unbilledMinutes: number;
  openProposals: number;
  openProposalCount: number;
  collected: number;
};

const EMPTY_STATS: DashboardStats = {
  outstanding: 0,
  outstandingCount: 0,
  unbilled: 0,
  unbilledMinutes: 0,
  openProposals: 0,
  openProposalCount: 0,
  collected: 0,
};

export default function Dashboard() {
  const { isTracking, selectedClient, workDescription } = useTimeTracking();
  const {
    fullName,
    email,
    organizationId,
    organizationCurrency,
    loading: profileLoading,
  } = useProfile();
  const [greeting, setGreeting] = useState("Good morning");
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);

  const firstName =
    firstNameFrom(fullName) || firstNameFrom(email?.split("@")[0] ?? null);
  const currency = organizationCurrency || "USD";

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  useEffect(() => {
    if (profileLoading) return;

    if (!organizationId) {
      setStats(EMPTY_STATS);
      setStatsLoading(false);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    async function loadStats() {
      setStatsLoading(true);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [
        invoicesRes,
        proposalsRes,
        timeEntriesRes,
        billedLinesRes,
      ] = await Promise.all([
        supabase
          .from("invoices")
          .select("total, status, paid_at")
          .eq("organization_id", organizationId!)
          .is("deleted_at", null),
        supabase
          .from("proposals")
          .select("amount, status")
          .eq("organization_id", organizationId!)
          .is("deleted_at", null)
          .in("status", ["sent", "viewed"]),
        supabase
          .from("time_entries")
          .select("id, duration_minutes, hourly_rate, billable, ended_at")
          .eq("organization_id", organizationId!)
          .is("deleted_at", null)
          .eq("billable", true)
          .not("ended_at", "is", null),
        supabase
          .from("invoice_line_items")
          .select("time_entry_id")
          .eq("organization_id", organizationId!)
          .not("time_entry_id", "is", null),
      ]);

      if (cancelled) return;

      const invoices = invoicesRes.data ?? [];
      const outstandingInvoices = invoices.filter((inv) =>
        ["sent", "viewed", "overdue"].includes(inv.status)
      );
      const outstanding = outstandingInvoices.reduce(
        (sum, inv) => sum + Number(inv.total || 0),
        0
      );

      const collected = invoices
        .filter(
          (inv) =>
            inv.status === "paid" &&
            inv.paid_at &&
            new Date(inv.paid_at) >= monthStart
        )
        .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

      const proposals = proposalsRes.data ?? [];
      const openProposals = proposals.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );

      const billedEntryIds = new Set(
        (billedLinesRes.data ?? [])
          .map((row) => row.time_entry_id)
          .filter((id): id is string => Boolean(id))
      );

      let unbilledMinutes = 0;
      let unbilled = 0;
      for (const entry of timeEntriesRes.data ?? []) {
        if (billedEntryIds.has(entry.id)) continue;
        const minutes = Number(entry.duration_minutes || 0);
        unbilledMinutes += minutes;
        const rate = Number(entry.hourly_rate || 0);
        unbilled += (minutes / 60) * rate;
      }

      setStats({
        outstanding,
        outstandingCount: outstandingInvoices.length,
        unbilled,
        unbilledMinutes,
        openProposals,
        openProposalCount: proposals.length,
        collected,
      });
      setStatsLoading(false);
    }

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [organizationId, profileLoading]);

  const outstandingValue = statsLoading
    ? "—"
    : formatMoney(stats.outstanding, currency);
  const unbilledValue = statsLoading
    ? "—"
    : formatMoney(stats.unbilled, currency);
  const unbilledHint = statsLoading
    ? undefined
    : formatHours(stats.unbilledMinutes);
  const proposalsValue = statsLoading
    ? "—"
    : formatMoney(stats.openProposals, currency);
  const proposalsHint = statsLoading
    ? undefined
    : `${stats.openProposalCount} waiting`;
  const collectedValue = statsLoading
    ? "—"
    : formatMoney(stats.collected, currency);

  return (
    <main className="h-full min-h-0 w-full flex justify-center gap-8 px-8">
      <div className="w-full max-w-6xl min-w-0 min-h-0 overflow-y-auto no-scrollbar">
        <div className="pt-10 pb-10">
          <div className="mb-10 pr-28">
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
              {greeting}
              {firstName ? `, ${firstName}` : ""} 👋
            </h1>
            <p className="text-gray-500 mt-1.5 text-[15px]">
              Here&apos;s what needs your attention today.
            </p>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-10">
            <StatCard label="Outstanding" value={outstandingValue} />
            <StatCard
              label="Unbilled"
              value={unbilledValue}
              hint={unbilledHint}
            />
            <StatCard
              label="Open proposals"
              value={proposalsValue}
              hint={proposalsHint}
            />
            <StatCard
              label="Collected"
              value={collectedValue}
              hint="This month"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 tracking-tight mb-4">
                Needs your attention
              </h2>
              <div className="space-y-2">
                <AttentionItem
                  icon={<AlertCircle className="w-4 h-4 text-gray-900" />}
                  text="Acme invoice 11 days overdue"
                  action="Send reminder"
                />
                <AttentionItem
                  icon={<Clock className="w-4 h-4 text-gray-900" />}
                  text="22h unbilled for Globex"
                  action="Create invoice"
                />
                <AttentionItem
                  icon={<Eye className="w-4 h-4 text-gray-900" />}
                  text="Globex viewed your proposal"
                  action="View proposal"
                />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-900 tracking-tight mb-4 flex items-center justify-between">
                Active work
                <button className="text-gray-400 hover:text-gray-900 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </h2>
              <div className="rounded-2xl border border-line divide-y divide-line bg-white">
                <WorkItem client="Acme" project="Website redesign" progress="24/40h" />
                <WorkItem client="Globex" project="Branding" progress="Milestone 2" />
                <WorkItem client="Stark" project="Consulting" progress="7.5h this week" />
              </div>
            </div>
          </div>

          <div className="mb-10">
            <h2 className="text-sm font-semibold text-gray-900 tracking-tight mb-4">
              Your money flow
            </h2>
            <div className="rounded-2xl border border-line bg-white p-6">
              <div className="flex items-center justify-between gap-2">
                <FlowStep
                  icon={FileText}
                  label="Proposals"
                  amount={proposalsValue}
                  count={
                    statsLoading
                      ? "—"
                      : `${stats.openProposalCount} active`
                  }
                  tone="violet"
                />
                <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" strokeWidth={1.5} />
                <FlowStep
                  icon={Clock}
                  label="Unbilled"
                  amount={unbilledValue}
                  count={unbilledHint ?? "—"}
                  tone="amber"
                />
                <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" strokeWidth={1.5} />
                <FlowStep
                  icon={Receipt}
                  label="Outstanding"
                  amount={outstandingValue}
                  count={
                    statsLoading
                      ? "—"
                      : `${stats.outstandingCount} invoice${stats.outstandingCount === 1 ? "" : "s"}`
                  }
                  tone="blue"
                />
                <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" strokeWidth={1.5} />
                <FlowStep
                  icon={CheckCircle2}
                  label="Paid"
                  amount={collectedValue}
                  count="This month"
                  tone="emerald"
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-900 tracking-tight mb-4">
              Recent activity
            </h2>
            <div className="rounded-2xl border border-line bg-white">
              <ActivityItem
                icon={<CheckCircle2 className="w-4 h-4" />}
                title="Payment received"
                body="Stark Industries paid $5,000.00 for INV-1041. Funds are on the way to your Stripe account."
                time="2 hours ago"
              />
              <ActivityItem
                icon={<Eye className="w-4 h-4" />}
                title="Proposal viewed"
                body="Globex Inc viewed the Brand Identity proposal."
                time="Yesterday"
              />
              <ActivityItem
                icon={<Send className="w-4 h-4" />}
                title="Reminder sent"
                body="Automated reminder sent to Wayne Enterprises for INV-1044."
                time="Oct 10"
                last
              />
            </div>
          </div>
        </div>
      </div>

      <aside className="hidden lg:flex w-[280px] shrink-0 min-h-0 h-full flex-col justify-end pb-8">
        <div
          className={`rounded-2xl border p-5 transition-colors ${
            isTracking ? "border-gray-900 bg-gray-50" : "border-line bg-white"
          }`}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`size-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isTracking
                  ? "bg-[#2563EB] text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-[15px]">Time tracking</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isTracking ? "Timer is running" : "Start a timer for billable work"}
              </p>
            </div>
          </div>

          <TimerStartForm variant="sidebar" />

          {isTracking && selectedClient && (
            <p className="text-xs text-gray-700 mt-3 leading-relaxed">
              {selectedClient.name}
              {workDescription ? ` · ${workDescription}` : ""}
            </p>
          )}
        </div>
      </aside>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white border border-line rounded-2xl p-5">
      <span className="text-xs font-medium text-gray-500 tracking-wide">{label}</span>
      <h3 className="text-2xl font-semibold tracking-tight mt-2 text-gray-900">{value}</h3>
      {hint && <p className="text-[13px] text-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
}

function AttentionItem({
  icon,
  text,
  action,
}: {
  icon: React.ReactNode;
  text: string;
  action: string;
}) {
  return (
    <div className="p-3.5 rounded-2xl border border-line bg-white flex items-center justify-between gap-4 hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          {icon}
        </div>
        <span className="font-medium text-[14px] text-gray-900 truncate">{text}</span>
      </div>
      <button className="shrink-0 text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] flex items-center gap-1 transition-colors">
        {action} <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function WorkItem({
  client,
  project,
  progress,
}: {
  client: string;
  project: string;
  progress: string;
}) {
  return (
    <div className="p-4 flex justify-between items-center hover:bg-gray-50/80 transition-colors cursor-pointer group">
      <div>
        <div className="font-medium text-[15px] text-gray-900 group-hover:text-gray-700 transition-colors">
          {client}
        </div>
        <div className="text-[13px] text-gray-500">{project}</div>
      </div>
      <div className="text-[14px] font-medium text-gray-600">{progress}</div>
    </div>
  );
}

const FLOW_TONES = {
  violet: "bg-[#7C3AED] text-white shadow-[0_6px_16px_rgba(124,58,237,0.3)]",
  amber: "bg-[#D97706] text-white shadow-[0_6px_16px_rgba(217,119,6,0.3)]",
  blue: "bg-[#2563EB] text-white shadow-[0_6px_16px_rgba(37,99,235,0.3)]",
  emerald: "bg-[#059669] text-white shadow-[0_6px_16px_rgba(5,150,105,0.3)]",
} as const;

function FlowStep({
  icon: Icon,
  label,
  amount,
  count,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  amount: string;
  count: string;
  tone: keyof typeof FLOW_TONES;
}) {
  return (
    <div className="flex flex-col items-center flex-1 text-center group cursor-pointer">
      <div
        className={`w-11 h-11 rounded-full flex items-center justify-center mb-3 transition-transform group-hover:scale-105 ${FLOW_TONES[tone]}`}
      >
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <div className="text-[11px] font-medium text-gray-400 tracking-wide mb-1">{label}</div>
      <div className="text-[17px] font-semibold tracking-tight text-gray-900">{amount}</div>
      <div className="text-[12px] text-gray-400 mt-0.5">{count}</div>
    </div>
  );
}

function ActivityItem({
  icon,
  title,
  body,
  time,
  last = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  time: string;
  last?: boolean;
}) {
  return (
    <div
      className={`p-4 flex items-start gap-4 ${last ? "" : "border-b border-line"}`}
    >
      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-[15px] font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-500 mt-0.5">{body}</p>
        <p className="text-xs text-gray-400 mt-1.5">{time}</p>
      </div>
    </div>
  );
}
