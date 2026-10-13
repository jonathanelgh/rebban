"use client";

import React, { useMemo } from "react";
import {
  Calendar,
  DollarSign,
  MoreHorizontal,
  Building2,
} from "lucide-react";
import { TimerStartForm } from "@/components/TimerStartForm";
import { useTimeTracking } from "@/components/TimeTrackingContext";

type TimeEntry = {
  id: string;
  description: string;
  client: string;
  project: string;
  start: string;
  end: string;
  duration: string;
  durationMinutes: number;
  billable: boolean;
  date: string;
  dayLabel: string;
};

const ENTRIES: TimeEntry[] = [
  {
    id: "1",
    description: "Homepage wireframes in Figma",
    client: "Acme Studio",
    project: "Website Redesign",
    start: "09:15",
    end: "11:40",
    duration: "2:25:00",
    durationMinutes: 145,
    billable: true,
    date: "2026-10-12",
    dayLabel: "Today · Mon, Oct 12",
  },
  {
    id: "2",
    description: "Client kickoff call notes",
    client: "Acme Studio",
    project: "Website Redesign",
    start: "13:00",
    end: "13:45",
    duration: "0:45:00",
    durationMinutes: 45,
    billable: true,
    date: "2026-10-12",
    dayLabel: "Today · Mon, Oct 12",
  },
  {
    id: "3",
    description: "Proposal scope refinement",
    client: "Globex Inc",
    project: "Brand Identity",
    start: "14:10",
    end: "15:30",
    duration: "1:20:00",
    durationMinutes: 80,
    billable: true,
    date: "2026-10-12",
    dayLabel: "Today · Mon, Oct 12",
  },
  {
    id: "4",
    description: "Admin / invoicing",
    client: "Internal",
    project: "Ops",
    start: "16:00",
    end: "16:35",
    duration: "0:35:00",
    durationMinutes: 35,
    billable: false,
    date: "2026-10-12",
    dayLabel: "Today · Mon, Oct 12",
  },
  {
    id: "5",
    description: "Design system tokens",
    client: "Acme Studio",
    project: "Website Redesign",
    start: "10:00",
    end: "12:30",
    duration: "2:30:00",
    durationMinutes: 150,
    billable: true,
    date: "2026-10-11",
    dayLabel: "Yesterday · Sun, Oct 11",
  },
  {
    id: "6",
    description: "Milestone 2 presentation draft",
    client: "Globex Inc",
    project: "Brand Identity",
    start: "13:15",
    end: "16:00",
    duration: "2:45:00",
    durationMinutes: 165,
    billable: true,
    date: "2026-10-11",
    dayLabel: "Yesterday · Sun, Oct 11",
  },
  {
    id: "7",
    description: "Consulting workshop prep",
    client: "Stark Industries",
    project: "Consulting",
    start: "09:00",
    end: "11:15",
    duration: "2:15:00",
    durationMinutes: 135,
    billable: true,
    date: "2026-10-10",
    dayLabel: "Fri, Oct 10",
  },
  {
    id: "8",
    description: "Retainer check-in call",
    client: "Wayne Enterprises",
    project: "Retainer",
    start: "15:00",
    end: "15:45",
    duration: "0:45:00",
    durationMinutes: 45,
    billable: true,
    date: "2026-10-10",
    dayLabel: "Fri, Oct 10",
  },
  {
    id: "9",
    description: "Invoice follow-up admin",
    client: "Internal",
    project: "Ops",
    start: "16:00",
    end: "16:40",
    duration: "0:40:00",
    durationMinutes: 40,
    billable: false,
    date: "2026-10-10",
    dayLabel: "Fri, Oct 10",
  },
  {
    id: "10",
    description: "Landing page revisions",
    client: "Acme Studio",
    project: "Website Redesign",
    start: "11:00",
    end: "14:20",
    duration: "3:20:00",
    durationMinutes: 200,
    billable: true,
    date: "2026-10-09",
    dayLabel: "Thu, Oct 9",
  },
];

function formatTotal(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export default function TimeTrackingPage() {
  const { isTracking, selectedClient, workDescription } = useTimeTracking();

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; entries: TimeEntry[]; totalMinutes: number }>();
    for (const entry of ENTRIES) {
      if (!map.has(entry.date)) {
        map.set(entry.date, { label: entry.dayLabel, entries: [], totalMinutes: 0 });
      }
      const group = map.get(entry.date)!;
      group.entries.push(entry);
      group.totalMinutes += entry.durationMinutes;
    }
    return Array.from(map.entries()).map(([date, group]) => ({ date, ...group }));
  }, []);

  const weekTotal = ENTRIES.reduce((sum, e) => sum + e.durationMinutes, 0);
  const billableTotal = ENTRIES.filter((e) => e.billable).reduce(
    (sum, e) => sum + e.durationMinutes,
    0
  );

  return (
    <main className="w-full px-8 pt-10 pb-8 pr-36 max-w-7xl mx-auto">
      <div className="flex justify-between items-start mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Time tracking
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Track billable hours and turn them into invoices.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-white border border-line rounded-full px-4 py-2 shrink-0">
          <Calendar className="w-4 h-4 text-gray-400" />
          Oct 6 – Oct 12
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

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <StatCard label="This week" value={formatTotal(weekTotal)} hint="10 entries" />
        <StatCard
          label="Billable"
          value={formatTotal(billableTotal)}
          hint={`${Math.round((billableTotal / weekTotal) * 100)}% of total`}
        />
        <StatCard label="Unbilled" value="$1,885" hint="At $85/hr" />
        <StatCard label="Days logged" value={`${grouped.length}`} hint="This week" />
      </div>

      <div className="space-y-5">
        {grouped.map((group) => (
          <section
            key={group.date}
            className="rounded-2xl border border-line bg-white overflow-hidden"
          >
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-line bg-[#FAFBFC]">
              <h2 className="text-sm font-semibold text-gray-900">{group.label}</h2>
              <span className="text-[13px] font-medium text-gray-500 tabular-nums">
                {formatTotal(group.totalMinutes)} · {group.entries.length}{" "}
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
                        {entry.client}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                        {entry.project}
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 tabular-nums whitespace-nowrap">
                        {entry.start} – {entry.end}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-900 font-mono tabular-nums whitespace-nowrap">
                        {entry.duration}
                      </td>
                      <td className="px-5 py-3.5">
                        {entry.billable ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                            <DollarSign className="w-3 h-3" />
                            Billable
                          </span>
                        ) : (
                          <span className="inline-flex text-[11px] font-medium text-gray-400 bg-gray-50 border border-line px-2 py-0.5 rounded-full">
                            Non-billable
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <button
                          type="button"
                          className="p-1.5 text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
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
