"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
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
  type LucideIcon,
} from "lucide-react";
import { TimerStartForm } from "@/components/TimerStartForm";
import { useTimeTracking } from "@/components/TimeTrackingContext";
import { useProfile } from "@/components/ProfileContext";
import { useBilling } from "@/components/BillingContext";
import { createClient } from "@/lib/supabase/client";
import { PAID_PLAN, formatPlanMoney } from "@/lib/billing/plan";
import { formatDurationMinutes } from "@/lib/time-entries";

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

type AttentionRow = {
  id: string;
  text: string;
  action: string;
  href: string;
  icon: LucideIcon;
};

type WorkRow = {
  id: string;
  client: string;
  project: string;
  progress: string;
  href: string;
};

type ActivityRow = {
  id: string;
  title: string;
  body: string;
  time: string;
  href: string | null;
  icon: LucideIcon;
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

function relativeTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysOverdue(dueDate: string | null) {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

function activityIcon(type: string): LucideIcon {
  if (type.includes("paid") || type.includes("payment")) return CheckCircle2;
  if (type.includes("view") || type.includes("opened")) return Eye;
  if (type.includes("remind") || type.includes("followup")) return Send;
  if (type.includes("sent")) return Send;
  return FileText;
}

export default function Dashboard() {
  const { isTracking, selectedClient, workDescription } = useTimeTracking();
  const {
    userId,
    fullName,
    email,
    organizationId,
    organizationCurrency,
    loading: profileLoading,
  } = useProfile();
  const {
    trialExpired,
    trialActive,
    trialDaysLeft,
    paid,
    openUpgradeModal,
    loading: billingLoading,
    pricing,
  } = useBilling();
  const [greeting, setGreeting] = useState("Good morning");
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const [attention, setAttention] = useState<AttentionRow[]>([]);
  const [activeWork, setActiveWork] = useState<WorkRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

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
      setAttention([]);
      setActiveWork([]);
      setActivity([]);
      setStatsLoading(false);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    async function loadDashboard() {
      setStatsLoading(true);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      const day = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));

      const [
        invoicesRes,
        proposalsRes,
        timeEntriesRes,
        billedLinesRes,
        notificationsRes,
        projectsRes,
      ] = await Promise.all([
        supabase
          .from("invoices")
          .select(
            "id, number, total, status, paid_at, due_date, clients(name, company)"
          )
          .eq("organization_id", organizationId!)
          .is("deleted_at", null),
        supabase
          .from("proposals")
          .select("id, title, amount, status, clients(name, company)")
          .eq("organization_id", organizationId!)
          .is("deleted_at", null)
          .in("status", ["sent", "viewed"]),
        supabase
          .from("time_entries")
          .select(
            "id, duration_minutes, hourly_rate, billable, ended_at, started_at, client_id, project_id, clients(name, company), projects(id, name)"
          )
          .eq("organization_id", organizationId!)
          .is("deleted_at", null)
          .eq("billable", true)
          .not("ended_at", "is", null),
        supabase
          .from("invoice_line_items")
          .select("time_entry_id")
          .eq("organization_id", organizationId!)
          .not("time_entry_id", "is", null),
        userId
          ? supabase
              .from("notifications")
              .select("id, title, body, type, link, created_at")
              .eq("organization_id", organizationId!)
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(8)
          : Promise.resolve({ data: [] as never[] }),
        supabase
          .from("projects")
          .select("id, name, clients(name, company)")
          .eq("organization_id", organizationId!)
          .is("deleted_at", null)
          .limit(20),
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
      const unbilledByClient = new Map<
        string,
        { name: string; minutes: number; amount: number }
      >();

      for (const entry of timeEntriesRes.data ?? []) {
        if (billedEntryIds.has(entry.id)) continue;
        const minutes = Number(entry.duration_minutes || 0);
        unbilledMinutes += minutes;
        const rate = Number(entry.hourly_rate || 0);
        const amount = (minutes / 60) * rate;
        unbilled += amount;

        const clientRel = entry.clients as
          | { name: string; company: string | null }
          | null
          | undefined;
        const key = entry.client_id || "none";
        const name =
          clientRel?.company || clientRel?.name || "No client";
        const current = unbilledByClient.get(key) || {
          name,
          minutes: 0,
          amount: 0,
        };
        current.minutes += minutes;
        current.amount += amount;
        unbilledByClient.set(key, current);
      }

      const attentionItems: AttentionRow[] = [];

      for (const inv of outstandingInvoices) {
        const overdueDays =
          inv.status === "overdue"
            ? daysOverdue(inv.due_date)
            : inv.due_date && daysOverdue(inv.due_date) > 0
              ? daysOverdue(inv.due_date)
              : 0;
        if (inv.status !== "overdue" && overdueDays <= 0) continue;
        const clientRel = inv.clients as
          | { name: string; company: string | null }
          | null
          | undefined;
        const clientName =
          clientRel?.company || clientRel?.name || "Client";
        const label = inv.number || "Invoice";
        attentionItems.push({
          id: `inv-${inv.id}`,
          text:
            overdueDays > 0
              ? `${clientName} · ${label} · ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`
              : `${clientName} · ${label} is overdue`,
          action: "Open invoice",
          href: `/invoices/${inv.id}/edit`,
          icon: AlertCircle,
        });
      }

      const topUnbilled = Array.from(unbilledByClient.entries())
        .filter(([, row]) => row.minutes >= 30)
        .sort((a, b) => b[1].minutes - a[1].minutes)
        .slice(0, 3);
      for (const [clientId, row] of topUnbilled) {
        attentionItems.push({
          id: `unbilled-${clientId}`,
          text: `${formatDurationMinutes(row.minutes)} unbilled for ${row.name}`,
          action: "Create invoice",
          href:
            clientId === "none"
              ? "/invoices?new=1"
              : `/invoices?new=1&clientId=${clientId}`,
          icon: Clock,
        });
      }

      for (const proposal of proposals.filter((p) => p.status === "viewed").slice(0, 3)) {
        const clientRel = proposal.clients as
          | { name: string; company: string | null }
          | null
          | undefined;
        const clientName =
          clientRel?.company || clientRel?.name || "Client";
        attentionItems.push({
          id: `prop-${proposal.id}`,
          text: `${clientName} viewed “${proposal.title || "your proposal"}”`,
          action: "View proposal",
          href: `/proposals/${proposal.id}/edit`,
          icon: Eye,
        });
      }

      const weekMinutesByProject = new Map<
        string,
        { name: string; client: string; minutes: number }
      >();
      for (const entry of timeEntriesRes.data ?? []) {
        if (!entry.started_at || new Date(entry.started_at) < weekStart) continue;
        const projectRel = entry.projects as
          | { id: string; name: string }
          | null
          | undefined;
        const clientRel = entry.clients as
          | { name: string; company: string | null }
          | null
          | undefined;
        if (!projectRel?.id) continue;
        const current = weekMinutesByProject.get(projectRel.id) || {
          name: projectRel.name,
          client: clientRel?.company || clientRel?.name || "Client",
          minutes: 0,
        };
        current.minutes += Number(entry.duration_minutes || 0);
        weekMinutesByProject.set(projectRel.id, current);
      }

      let workRows: WorkRow[] = Array.from(weekMinutesByProject.entries())
        .sort((a, b) => b[1].minutes - a[1].minutes)
        .slice(0, 5)
        .map(([id, row]) => ({
          id,
          client: row.client,
          project: row.name,
          progress: `${formatDurationMinutes(row.minutes)} this week`,
          href: `/clients`,
        }));

      if (workRows.length === 0) {
        workRows = (projectsRes.data ?? []).slice(0, 5).map((project) => {
          const clientRel = project.clients as
            | { name: string; company: string | null }
            | null
            | undefined;
          return {
            id: project.id,
            client: clientRel?.company || clientRel?.name || "Client",
            project: project.name,
            progress: "No time this week",
            href: `/clients`,
          };
        });
      }

      const activityRows: ActivityRow[] = (notificationsRes.data ?? []).map(
        (row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          time: relativeTime(row.created_at),
          href: row.link,
          icon: activityIcon(row.type),
        })
      );

      setStats({
        outstanding,
        outstandingCount: outstandingInvoices.length,
        unbilled,
        unbilledMinutes,
        openProposals,
        openProposalCount: proposals.length,
        collected,
      });
      setAttention(attentionItems.slice(0, 6));
      setActiveWork(workRows);
      setActivity(activityRows);
      setStatsLoading(false);
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [organizationId, profileLoading, userId]);

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
    <main className="h-full min-h-0 w-full flex justify-center gap-8 px-4 sm:px-8 overflow-x-hidden">
      <div className="w-full max-w-6xl min-w-0 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar">
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

          {!billingLoading && (trialExpired || trialActive) && !paid && (
            <div
              className={`mb-8 rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 ${
                trialExpired
                  ? "border-[#BFDBFE] bg-gradient-to-br from-[#EFF6FF] to-white"
                  : "border-line bg-[#FAFBFC]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-gray-900 tracking-tight">
                  {trialExpired
                    ? "Your free trial has ended"
                    : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial`}
                </div>
                <p className="text-[14px] text-gray-500 mt-1 leading-relaxed">
                  {trialExpired
                    ? `Upgrade to ${PAID_PLAN.name} to keep proposals, invoices, and automated reminders running${
                        pricing?.monthly
                          ? ` from ${formatPlanMoney(
                              pricing.monthly.amount,
                              pricing.monthly.currency
                            )}/month`
                          : ""
                      }.`
                    : `Enjoy full access while you explore. After the trial, upgrade to ${PAID_PLAN.name} to keep everything unlocked.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openUpgradeModal()}
                className="btn-primary shrink-0 px-5 py-2.5 rounded-full text-sm"
              >
                {trialExpired ? "Upgrade to Pro" : "View plans"}
              </button>
            </div>
          )}

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
                {statsLoading ? (
                  <EmptyFeed text="Loading…" />
                ) : attention.length === 0 ? (
                  <EmptyFeed text="You're all caught up. Nothing needs attention right now." />
                ) : (
                  attention.map((item) => (
                    <AttentionItem
                      key={item.id}
                      icon={<item.icon className="w-4 h-4 text-gray-900" />}
                      text={item.text}
                      action={item.action}
                      href={item.href}
                    />
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-900 tracking-tight mb-4 flex items-center justify-between">
                Active work
                <Link
                  href="/clients"
                  className="text-gray-400 hover:text-gray-900 transition-colors"
                  aria-label="Add client or project"
                >
                  <Plus className="w-4 h-4" />
                </Link>
              </h2>
              <div className="rounded-2xl border border-line divide-y divide-line bg-white">
                {statsLoading ? (
                  <div className="p-4 text-sm text-gray-400">Loading…</div>
                ) : activeWork.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">
                    No active projects yet.{" "}
                    <Link href="/clients" className="text-[#2563EB] font-medium">
                      Add a client
                    </Link>{" "}
                    to get started.
                  </div>
                ) : (
                  activeWork.map((item) => (
                    <WorkItem
                      key={item.id}
                      client={item.client}
                      project={item.project}
                      progress={item.progress}
                      href={item.href}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mb-10 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 tracking-tight mb-4">
              Your money flow
            </h2>
            <div className="rounded-2xl border border-line bg-white p-4 sm:p-6 min-w-0 overflow-hidden">
              {/* Mobile: two rows so steps never push the page sideways */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:hidden">
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
                <FlowStep
                  icon={Clock}
                  label="Unbilled"
                  amount={unbilledValue}
                  count={unbilledHint ?? "—"}
                  tone="amber"
                />
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
                <FlowStep
                  icon={CheckCircle2}
                  label="Paid"
                  amount={collectedValue}
                  count="This month"
                  tone="emerald"
                />
              </div>
              <div className="hidden sm:flex items-center justify-between gap-2 min-w-0">
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
              {statsLoading ? (
                <div className="p-4 text-sm text-gray-400">Loading…</div>
              ) : activity.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  Activity from proposals, invoices, and payments will show up here.
                </div>
              ) : (
                activity.map((item, index) => (
                  <ActivityItem
                    key={item.id}
                    icon={<item.icon className="w-4 h-4" />}
                    title={item.title}
                    body={item.body}
                    time={item.time}
                    href={item.href}
                    last={index === activity.length - 1}
                  />
                ))
              )}
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

function EmptyFeed({ text }: { text: string }) {
  return (
    <div className="p-3.5 rounded-2xl border border-dashed border-line bg-white text-[14px] text-gray-500">
      {text}
    </div>
  );
}

function AttentionItem({
  icon,
  text,
  action,
  href,
}: {
  icon: React.ReactNode;
  text: string;
  action: string;
  href: string;
}) {
  return (
    <div className="p-3.5 rounded-2xl border border-line bg-white flex items-center justify-between gap-4 hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          {icon}
        </div>
        <span className="font-medium text-[14px] text-gray-900 truncate">{text}</span>
      </div>
      <Link
        href={href}
        className="shrink-0 text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] flex items-center gap-1 transition-colors"
      >
        {action} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function WorkItem({
  client,
  project,
  progress,
  href,
}: {
  client: string;
  project: string;
  progress: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="p-4 flex justify-between items-center hover:bg-gray-50/80 transition-colors group"
    >
      <div>
        <div className="font-medium text-[15px] text-gray-900 group-hover:text-gray-700 transition-colors">
          {client}
        </div>
        <div className="text-[13px] text-gray-500">{project}</div>
      </div>
      <div className="text-[14px] font-medium text-gray-600">{progress}</div>
    </Link>
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
    <div className="flex flex-col items-center flex-1 min-w-0 w-full text-center group cursor-pointer">
      <div
        className={`w-11 h-11 rounded-full flex items-center justify-center mb-3 transition-transform group-hover:scale-105 ${FLOW_TONES[tone]}`}
      >
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <div className="text-[11px] font-medium text-gray-400 tracking-wide mb-1">{label}</div>
      <div className="text-[15px] sm:text-[17px] font-semibold tracking-tight text-gray-900 truncate max-w-full px-1">
        {amount}
      </div>
      <div className="text-[12px] text-gray-400 mt-0.5 truncate max-w-full px-1">{count}</div>
    </div>
  );
}

function ActivityItem({
  icon,
  title,
  body,
  time,
  href,
  last = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  time: string;
  href?: string | null;
  last?: boolean;
}) {
  const content = (
    <>
      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-[15px] font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-500 mt-0.5">{body}</p>
        <p className="text-xs text-gray-400 mt-1.5">{time}</p>
      </div>
    </>
  );

  const className = `p-4 flex items-start gap-4 ${last ? "" : "border-b border-line"} ${
    href ? "hover:bg-gray-50/80 transition-colors" : ""
  }`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
