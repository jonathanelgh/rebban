"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  MoreHorizontal,
  Building2,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import { TimerStartForm } from "@/components/TimerStartForm";
import { AddManualTimeModal } from "@/components/AddManualTimeModal";
import { useTimeTracking } from "@/components/TimeTrackingContext";
import { useProfile } from "@/components/ProfileContext";
import { createClient } from "@/lib/supabase/client";
import {
  clientDisplayName,
  dayLabelForDate,
  endOfWeek,
  formatClockTime,
  formatDurationClock,
  formatDurationMinutes,
  formatWeekRange,
  startOfWeek,
  toISODateLocal,
} from "@/lib/time-entries";
import { formatInvoiceMoney } from "@/lib/invoices/totals";

type TimeEntryRow = {
  id: string;
  description: string;
  clientId: string | null;
  clientName: string;
  projectName: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  billable: boolean;
  hourlyRate: number;
  date: string;
  dayLabel: string;
};

export default function TimeTrackingPage() {
  const {
    isTracking,
    selectedClient,
    workDescription,
    entriesVersion,
    clients,
    projects,
    defaultHourlyRate,
  } = useTimeTracking();
  const {
    organizationId,
    organizationCurrency,
    userId,
    loading: profileLoading,
  } = useProfile();

  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [billedIds, setBilledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const weekStart = useMemo(() => startOfWeek(weekAnchor), [weekAnchor]);
  const weekEnd = useMemo(() => endOfWeek(weekAnchor), [weekAnchor]);
  const currency = organizationCurrency || "USD";
  const isCurrentWeek = useMemo(() => {
    const now = new Date();
    return (
      startOfWeek(now).getTime() === weekStart.getTime() &&
      endOfWeek(now).getTime() === weekEnd.getTime()
    );
  }, [weekStart, weekEnd]);

  function shiftWeek(delta: number) {
    setWeekAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * 7);
      return next;
    });
  }

  const loadEntries = useCallback(async () => {
    if (!organizationId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [entriesRes, billedRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select(
          "id, description, started_at, ended_at, duration_minutes, billable, hourly_rate, clients(id, name, company), projects(id, name)"
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .gte("started_at", weekStart.toISOString())
        .lte("started_at", weekEnd.toISOString())
        .order("started_at", { ascending: false }),
      supabase
        .from("invoice_line_items")
        .select("time_entry_id")
        .eq("organization_id", organizationId)
        .not("time_entry_id", "is", null),
    ]);

    if (entriesRes.error) {
      setError(entriesRes.error.message);
      setEntries([]);
      setLoading(false);
      return;
    }

    const billed = new Set(
      (billedRes.data ?? [])
        .map((row) => row.time_entry_id)
        .filter((id): id is string => Boolean(id))
    );
    setBilledIds(billed);

    setEntries(
      (entriesRes.data ?? [])
        .filter((row) => row.ended_at) // hide still-running from history list
        .map((row) => {
          const clientRel = row.clients as
            | { id: string; name: string; company: string | null }
            | null
            | undefined;
          const projectRel = row.projects as
            | { id: string; name: string }
            | null
            | undefined;
          const date = toISODateLocal(new Date(row.started_at));
          const minutes =
            Number(row.duration_minutes) ||
            (row.ended_at
              ? Math.round(
                  (new Date(row.ended_at).getTime() -
                    new Date(row.started_at).getTime()) /
                    60000
                )
              : 0);

          return {
            id: row.id,
            description: row.description?.trim() || "Untitled",
            clientId: clientRel?.id ?? null,
            clientName: clientRel ? clientDisplayName(clientRel) : "No client",
            projectName: projectRel?.name || "-",
            startedAt: row.started_at,
            endedAt: row.ended_at,
            durationMinutes: Math.max(0, minutes),
            billable: Boolean(row.billable),
            hourlyRate: Number(row.hourly_rate || defaultHourlyRate),
            date,
            dayLabel: dayLabelForDate(date),
          };
        })
    );
    setLoading(false);
  }, [organizationId, weekStart, weekEnd, defaultHourlyRate]);

  useEffect(() => {
    if (profileLoading) return;
    void loadEntries();
  }, [profileLoading, loadEntries, entriesVersion]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { label: string; entries: TimeEntryRow[]; totalMinutes: number }
    >();
    for (const entry of entries) {
      if (!map.has(entry.date)) {
        map.set(entry.date, {
          label: entry.dayLabel,
          entries: [],
          totalMinutes: 0,
        });
      }
      const group = map.get(entry.date)!;
      group.entries.push(entry);
      group.totalMinutes += entry.durationMinutes;
    }
    return Array.from(map.entries()).map(([date, group]) => ({ date, ...group }));
  }, [entries]);

  const weekTotal = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const billableTotal = entries
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + e.durationMinutes, 0);
  const unbilledEntries = useMemo(
    () => entries.filter((e) => e.billable && !billedIds.has(e.id) && e.clientId),
    [entries, billedIds]
  );
  const unbilledAmount = unbilledEntries.reduce(
    (sum, e) => sum + (e.durationMinutes / 60) * e.hourlyRate,
    0
  );

  const topUnbilledClientId = useMemo(() => {
    const byClient = new Map<string, number>();
    for (const entry of unbilledEntries) {
      if (!entry.clientId) continue;
      byClient.set(
        entry.clientId,
        (byClient.get(entry.clientId) || 0) + entry.durationMinutes
      );
    }
    let best: string | null = null;
    let bestMinutes = 0;
    for (const [id, minutes] of byClient) {
      if (minutes > bestMinutes) {
        best = id;
        bestMinutes = minutes;
      }
    }
    return best;
  }, [unbilledEntries]);

  async function createInvoiceFromUnbilled() {
    if (!organizationId || !userId || !topUnbilledClientId) return;
    setInvoiceBusy(true);
    setError(null);
    try {
      const { nanoid } = await import("nanoid");
      const { nextInvoiceNumber } = await import("@/lib/invoices/numbering");
      const { addDaysISO, todayISODate } = await import("@/lib/invoices/totals");
      const supabase = createClient();
      const issueDate = todayISODate();
      const number = await nextInvoiceNumber(supabase, organizationId);
      const { data: orgTax } = await supabase
        .from("organizations")
        .select(
          "default_tax_enabled, default_tax_rate, default_prices_include_tax, tax_id, currency"
        )
        .eq("id", organizationId)
        .maybeSingle();

      const taxEnabled = Boolean(orgTax?.default_tax_enabled);
      const taxRate = Number(orgTax?.default_tax_rate || 0);
      const pricesIncludeTax = Boolean(orgTax?.default_prices_include_tax);

      const { data, error: insertError } = await supabase
        .from("invoices")
        .insert({
          organization_id: organizationId,
          client_id: topUnbilledClientId,
          number,
          status: "draft",
          currency: orgTax?.currency || currency,
          issue_date: issueDate,
          due_date: addDaysISO(issueDate, 14),
          created_by: userId,
          subtotal: 0,
          tax_total: 0,
          total: 0,
          payment_token: nanoid(24),
          tax_enabled: taxEnabled,
          tax_rate: taxEnabled ? taxRate : 0,
          prices_include_tax: taxEnabled ? pricesIncludeTax : false,
          show_tax_id: taxEnabled,
          tax_id: taxEnabled ? orgTax?.tax_id || null : null,
          show_logo: true,
        })
        .select("id")
        .single();

      if (insertError || !data) {
        setError(insertError?.message || "Could not create invoice.");
        return;
      }

      window.location.assign(`/invoices/${data.id}/edit?addUnbilled=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invoice.");
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function softDelete(id: string) {
    if (!organizationId) return;
    const supabase = createClient();
    await supabase
      .from("time_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId);
    setMenuOpenId(null);
    await loadEntries();
  }

  async function toggleBillable(entry: TimeEntryRow) {
    if (!organizationId) return;
    const supabase = createClient();
    await supabase
      .from("time_entries")
      .update({ billable: !entry.billable })
      .eq("id", entry.id)
      .eq("organization_id", organizationId);
    setMenuOpenId(null);
    await loadEntries();
  }

  return (
    <main className="w-full px-4 md:px-8 pt-10 pb-8 md:pr-36 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight">
            Time tracking
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Track billable hours and turn them into invoices.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start">
          <div className="flex items-center gap-1 bg-white border border-line rounded-full pl-1.5 pr-1.5 py-1">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-50"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-600 px-1 min-w-[9.5rem] justify-center">
              <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="tabular-nums whitespace-nowrap">
                {formatWeekRange(weekStart, weekEnd)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-50"
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => setWeekAnchor(new Date())}
                className="ml-0.5 px-2.5 py-1 rounded-full text-[12px] font-medium text-[#2563EB] hover:bg-[#EFF6FF]"
              >
                Today
              </button>
            )}
          </div>
          {unbilledAmount > 0 && topUnbilledClientId && (
            <button
              type="button"
              disabled={invoiceBusy}
              onClick={() => void createInvoiceFromUnbilled()}
              className="px-4 py-2.5 rounded-full text-sm font-medium border border-line bg-white text-gray-800 hover:bg-[#FAFBFC] flex items-center gap-2 disabled:opacity-50"
            >
              <Receipt className="w-4 h-4" />
              {invoiceBusy ? "Creating…" : "Invoice unbilled"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn-primary px-5 py-2.5 rounded-full text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add time
          </button>
        </div>
      </div>

      <div className="mb-8">
        <TimerStartForm variant="page" />
        {isTracking && selectedClient && (
          <p className="text-xs text-gray-600 mt-2.5 ml-1 flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-gray-900" />
            </span>
            Tracking for {selectedClient.name}
            {workDescription ? ` · ${workDescription}` : ""}
          </p>
        )}
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="This week"
          value={loading ? "—" : formatDurationMinutes(weekTotal)}
          hint={loading ? undefined : `${entries.length} entries`}
        />
        <StatCard
          label="Billable"
          value={loading ? "—" : formatDurationMinutes(billableTotal)}
          hint={
            loading || weekTotal === 0
              ? undefined
              : `${Math.round((billableTotal / weekTotal) * 100)}% of total`
          }
        />
        <StatCard
          label="Unbilled"
          value={loading ? "—" : formatInvoiceMoney(unbilledAmount, currency)}
          hint={
            unbilledAmount > 0
              ? "Ready to invoice"
              : `Default ${defaultHourlyRate}/hr`
          }
        />
        <StatCard
          label="Days logged"
          value={loading ? "—" : String(grouped.length)}
          hint="This week"
        />
      </div>

      <div className="space-y-5">
        {loading && (
          <div className="rounded-2xl border border-line bg-white px-5 py-16 text-center text-sm text-gray-400">
            Loading time entries…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-16 text-center">
            <p className="text-sm font-medium text-gray-700">No time logged this week</p>
            <p className="text-[13px] text-gray-400 mt-1">
              Start the timer above,{" "}
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="text-[#2563EB] font-medium"
              >
                add worked time
              </button>
              , or{" "}
              <Link href="/clients" className="text-[#2563EB] font-medium">
                add a client
              </Link>{" "}
              first.
            </p>
          </div>
        )}

        {!loading &&
          grouped.map((group) => (
            <section
              key={group.date}
              className="rounded-2xl border border-line bg-white overflow-hidden"
            >
              <div className="px-5 py-3.5 flex items-center justify-between border-b border-line bg-[#FAFBFC]">
                <h2 className="text-sm font-semibold text-gray-900">{group.label}</h2>
                <span className="text-[13px] font-medium text-gray-500 tabular-nums">
                  {formatDurationMinutes(group.totalMinutes)} · {group.entries.length}{" "}
                  {group.entries.length === 1 ? "entry" : "entries"}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[720px]">
                  <thead>
                    <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <th className="px-5 py-2.5 font-semibold">Description</th>
                      <th className="px-5 py-2.5 font-semibold">Client</th>
                      <th className="px-5 py-2.5 font-semibold">Project</th>
                      <th className="px-5 py-2.5 font-semibold">Time</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Duration</th>
                      <th className="px-5 py-2.5 font-semibold">Type</th>
                      <th className="px-3 py-2.5 font-semibold w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-line last:border-0 hover:bg-[#FAFBFC] transition-colors group"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
                              <Building2 className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-medium text-gray-900 truncate">
                              {entry.description}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-gray-700 whitespace-nowrap">
                          {entry.clientName}
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                          {entry.projectName}
                        </td>
                        <td className="px-5 py-3.5 text-gray-400 tabular-nums whitespace-nowrap">
                          {formatClockTime(entry.startedAt)}
                          {entry.endedAt
                            ? ` – ${formatClockTime(entry.endedAt)}`
                            : " – …"}
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-gray-900 font-mono tabular-nums whitespace-nowrap">
                          {formatDurationClock(entry.durationMinutes)}
                        </td>
                        <td className="px-5 py-3.5">
                          {entry.billable ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                              <DollarSign className="w-3 h-3" />
                              {billedIds.has(entry.id) ? "Billed" : "Billable"}
                            </span>
                          ) : (
                            <span className="inline-flex text-[11px] font-medium text-gray-400 bg-gray-50 border border-line px-2 py-0.5 rounded-full">
                              Non-billable
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 relative">
                          <button
                            type="button"
                            onClick={() =>
                              setMenuOpenId((id) => (id === entry.id ? null : entry.id))
                            }
                            className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {menuOpenId === entry.id && (
                            <div className="absolute right-3 top-10 z-20 w-44 rounded-xl border border-line bg-white shadow-lg py-1">
                              <button
                                type="button"
                                onClick={() => void toggleBillable(entry)}
                                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                              >
                                Mark {entry.billable ? "non-billable" : "billable"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void softDelete(entry.id)}
                                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 inline-flex items-center gap-2"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
      </div>

      {showAddModal && (
        <AddManualTimeModal
          clients={clients}
          projects={projects}
          onClose={() => setShowAddModal(false)}
          onSaved={(startedDate) => {
            setShowAddModal(false);
            // Jump the week view so the new entry is visible (list is week-scoped).
            // loadEntries runs via useEffect when weekStart/weekEnd update.
            const [y, m, d] = startedDate.split("-").map(Number);
            if (y && m && d) {
              setWeekAnchor(new Date(y, m - 1, d, 12, 0, 0, 0));
            } else {
              void loadEntries();
            }
          }}
        />
      )}
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
      <h3 className="text-2xl font-semibold tracking-tight text-gray-900 font-mono mt-2">
        {value}
      </h3>
      {hint && <p className="text-[13px] mt-1.5 text-gray-400">{hint}</p>}
    </div>
  );
}
