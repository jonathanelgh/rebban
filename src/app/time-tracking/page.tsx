"use client";

import React from "react";
import {
  Calendar,
  DollarSign,
  MoreHorizontal,
  Building2,
} from "lucide-react";
import { TimerStartForm } from "@/components/TimerStartForm";
import { useTimeTracking } from "@/components/TimeTrackingContext";

const TODAY_ENTRIES = [
  {
    id: 1,
    description: "Homepage wireframes in Figma",
    client: "Acme Studio",
    project: "Website Redesign",
    start: "09:15",
    end: "11:40",
    duration: "2:25:00",
    billable: true,
  },
  {
    id: 2,
    description: "Client kickoff call notes",
    client: "Acme Studio",
    project: "Website Redesign",
    start: "13:00",
    end: "13:45",
    duration: "0:45:00",
    billable: true,
  },
  {
    id: 3,
    description: "Proposal scope refinement",
    client: "Globex Inc",
    project: "Brand Identity",
    start: "14:10",
    end: "15:30",
    duration: "1:20:00",
    billable: true,
  },
  {
    id: 4,
    description: "Admin / invoicing",
    client: "Internal",
    project: "Ops",
    start: "16:00",
    end: "16:35",
    duration: "0:35:00",
    billable: false,
  },
];

const WEEK_DAYS = [
  { day: "Mon", hours: "6:10", pct: 78 },
  { day: "Tue", hours: "7:45", pct: 95 },
  { day: "Wed", hours: "5:20", pct: 65 },
  { day: "Thu", hours: "5:05", pct: 62 },
  { day: "Fri", hours: "—", pct: 0 },
  { day: "Sat", hours: "—", pct: 0 },
  { day: "Sun", hours: "—", pct: 0 },
];

export default function TimeTrackingPage() {
  const { isTracking, selectedClient, workDescription } = useTimeTracking();

  return (
    <main className="w-full p-8 pb-32 pt-10 max-w-5xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Time Tracking
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Track billable hours and turn them into invoices.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-white border border-[#EEF0F3] rounded-full px-4 py-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          Oct 6 – Oct 12
        </div>
      </div>

      {/* Start / Active timer */}
      <div className="mb-8">
        <TimerStartForm variant="page" />
        {isTracking && selectedClient && (
          <p className="text-xs text-emerald-600 mt-2.5 ml-1 flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Tracking for {selectedClient.name}
            {workDescription ? ` · ${workDescription}` : ""}
          </p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard label="Today" value="5:05" hint="4 entries" accent="bg-[#F3FAF6]" />
        <StatCard label="This week" value="24:20" hint="Target 32h" accent="bg-[#F5F8FF]" />
        <StatCard label="Billable" value="22:10" hint="91% of total" accent="bg-white" />
        <StatCard label="Unbilled" value="$1,885" hint="At $85/hr" accent="bg-[#FFF9D6]" />
      </div>

      {/* Week overview — softer bars */}
      <div className="surface-panel p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">This week</h2>
          <span className="text-sm text-gray-400">24h 20m tracked</span>
        </div>
        <div className="grid grid-cols-7 gap-3">
          {WEEK_DAYS.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-2">
              <span className="text-xs font-medium text-gray-400">{d.day}</span>
              <div className="w-full h-20 bg-[#FAFBFC] rounded-xl flex items-end p-1.5 border border-[#EEF0F3]">
                <div
                  className={`w-full rounded-lg transition-all ${
                    d.pct > 0 ? "bg-[#3B82F6]/70" : "bg-transparent"
                  }`}
                  style={{ height: `${Math.max(d.pct, 0)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-700">{d.hours}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Today's entries */}
      <div className="surface-panel overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Today</h2>
            <p className="text-sm text-gray-400 mt-0.5">Thursday, Oct 8 · 5h 5m</p>
          </div>
        </div>

        <div>
          {TODAY_ENTRIES.map((entry) => (
            <div
              key={entry.id}
              className="px-6 py-4 flex items-center gap-4 border-t border-[#EEF0F3] hover:bg-[#FAFBFC] transition-colors group"
            >
              <div className="w-9 h-9 rounded-2xl bg-[#EAF3FF] text-[#3B82F6] flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {entry.description}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{entry.client}</span>
                  <span className="text-gray-300">·</span>
                  <span>{entry.project}</span>
                  {entry.billable ? (
                    <span className="ml-1 inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      <DollarSign className="w-2.5 h-2.5" />
                      Billable
                    </span>
                  ) : (
                    <span className="ml-1 text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">
                      Non-billable
                    </span>
                  )}
                </div>
              </div>

              <div className="text-sm text-gray-400 tabular-nums shrink-0 hidden sm:block">
                {entry.start} – {entry.end}
              </div>

              <div className="text-sm font-semibold text-gray-900 font-mono tabular-nums w-20 text-right shrink-0">
                {entry.duration}
              </div>

              <button className="p-2 text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = "bg-white",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className={`${accent} border border-[#EEF0F3] rounded-[1.25rem] p-5`}>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      <h3 className="text-2xl font-semibold tracking-tight text-gray-900 font-mono mt-2">
        {value}
      </h3>
      {hint && <p className="text-xs mt-1.5 text-gray-400">{hint}</p>}
    </div>
  );
}
