"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderKanban,
  Search,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  type TimerClient,
  type TimerProject,
} from "@/components/TimeTrackingContext";
import {
  DEFAULT_HOURLY_RATE,
  toISODateLocal,
} from "@/lib/time-entries";

const inputClass =
  "w-full rounded-xl border border-line bg-[#FAFBFC] px-3.5 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-300 focus:bg-white";

const triggerClass =
  "w-full flex items-center gap-2.5 rounded-xl border border-line bg-[#FAFBFC] px-3.5 py-2.5 text-sm text-left transition-colors hover:bg-white focus:outline-none focus:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed";

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="block">
      <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block text-[12px] text-gray-400 mt-1">{hint}</span>
      ) : null}
    </div>
  );
}

function localDateAndTimeToIso(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;
  // Construct in local timezone (avoid string parse treating as UTC).
  const value = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function parseLocalDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const startOffset = first.getDay(); // Sunday = 0
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatDateLabel(isoDate: string) {
  const date = parseLocalDate(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(date);
  that.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((today.getTime() - that.getTime()) / 86400000);
  const label = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (dayDiff === 0) return `Today · ${label}`;
  if (dayDiff === 1) return `Yesterday · ${label}`;
  return label;
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    function handle(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onOutside, active]);
}

function DatePickerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(parseLocalDate(value)));
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), open);

  const selected = parseLocalDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells = buildMonthCells(month);
  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const monthLabel = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function pick(date: Date) {
    onChange(toISODateLocal(date));
    setOpen(false);
  }

  function shiftDays(days: number) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    onChange(toISODateLocal(d));
    setMonth(startOfMonth(d));
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setMonth(startOfMonth(parseLocalDate(value)));
          setOpen((v) => !v);
        }}
        className={triggerClass}
      >
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="flex-1 font-medium text-gray-900 truncate">
          {formatDateLabel(value)}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-line bg-white shadow-[0_16px_40px_-12px_rgba(16,24,40,0.18)] overflow-hidden">
          <div className="p-3 border-b border-line flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => shiftDays(0)}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium border border-line text-gray-600 hover:bg-gray-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftDays(-1)}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium border border-line text-gray-600 hover:bg-gray-50"
            >
              Yesterday
            </button>
          </div>

          <div className="p-3">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <button
                type="button"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1)
                  )
                }
                className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-[#FAFBFC]"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[14px] font-semibold text-gray-900">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1)
                  )
                }
                className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-[#FAFBFC]"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekdays.map((day) => (
                <div
                  key={day}
                  className="h-8 flex items-center justify-center text-[11px] font-semibold text-gray-400"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="h-9" />;
                }
                const isSelected = sameDay(date, selected);
                const isToday = sameDay(date, today);
                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => pick(date)}
                    className={`h-9 rounded-xl text-[13px] font-medium transition-colors ${
                      isSelected
                        ? "bg-[#2563EB] text-white"
                        : isToday
                          ? "bg-[#EFF6FF] text-[#2563EB]"
                          : "text-gray-700 hover:bg-[#FAFBFC]"
                    }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientPicker({
  clients,
  selectedId,
  onChange,
}: {
  clients: TimerClient[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), open);

  const selected = clients.find((c) => c.id === selectedId) || null;
  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
        {selected ? (
          <span className="flex-1 min-w-0">
            <span className="block font-medium text-gray-900 truncate">
              {selected.name}
            </span>
            {selected.company && (
              <span className="block text-[12px] text-gray-400 truncate">
                {selected.company}
              </span>
            )}
          </span>
        ) : (
          <span className="flex-1 text-gray-400">Select client…</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-line bg-white shadow-[0_16px_40px_-12px_rgba(16,24,40,0.18)] overflow-hidden">
          <div className="p-3 border-b border-line flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="w-full text-sm outline-none placeholder:text-gray-400 font-medium bg-transparent"
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto p-2 space-y-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-400">
                {clients.length === 0 ? "No clients yet." : "No matches."}
              </p>
            ) : (
              filtered.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => {
                    onChange(client.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-[#FAFBFC] text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {client.name}
                      </div>
                      {client.company && (
                        <div className="text-[12px] text-gray-400 truncate">
                          {client.company}
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedId === client.id && (
                    <Check className="w-4 h-4 text-[#2563EB] shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectPicker({
  projects,
  selectedId,
  onChange,
  disabled,
  emptyLabel,
}: {
  projects: TimerProject[];
  selectedId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), open);

  const selected = projects.find((p) => p.id === selectedId) || null;
  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={triggerClass}
      >
        <FolderKanban className="w-4 h-4 text-gray-400 shrink-0" />
        <span
          className={`flex-1 truncate font-medium ${
            selected ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {selected ? selected.name : emptyLabel}
        </span>
        {!disabled && (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-line bg-white shadow-[0_16px_40px_-12px_rgba(16,24,40,0.18)] overflow-hidden">
          {projects.length > 0 && (
            <div className="p-3 border-b border-line flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="w-full text-sm outline-none placeholder:text-gray-400 font-medium bg-transparent"
              />
            </div>
          )}
          <div className="max-h-[220px] overflow-y-auto p-2 space-y-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                setSearch("");
              }}
              className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-[#FAFBFC] text-left text-sm text-gray-500"
            >
              No project
              {!selectedId && <Check className="w-4 h-4 text-[#2563EB]" />}
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-400">
                {projects.length === 0
                  ? "No projects for this client."
                  : "No matches."}
              </p>
            ) : (
              filtered.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    onChange(project.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-[#FAFBFC] text-left"
                >
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {project.name}
                  </span>
                  {selectedId === project.id && (
                    <Check className="w-4 h-4 text-[#2563EB] shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AddManualTimeModal({
  clients,
  projects,
  onClose,
  onSaved,
}: {
  clients: TimerClient[];
  projects: TimerProject[];
  onClose: () => void;
  onSaved: (startedDate: string) => void;
}) {
  const { organizationId, userId } = useProfile();
  const now = new Date();
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => toISODateLocal(now));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [billable, setBillable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientProjects = useMemo(
    () => (clientId ? projects.filter((p) => p.clientId === clientId) : []),
    [projects, clientId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId || !userId) {
      setError("Workspace isn’t ready yet. Refresh and try again.");
      return;
    }
    if (!description.trim()) {
      setError("Add a short description of the work.");
      return;
    }
    if (!clientId) {
      setError("Choose a client.");
      return;
    }

    const startedAt = localDateAndTimeToIso(date, startTime);
    const endedAt = localDateAndTimeToIso(date, endTime);
    if (!startedAt || !endedAt) {
      setError("Enter a valid date and time.");
      return;
    }
    if (new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
      setError("End time must be after start time.");
      return;
    }

    const projectValid =
      projectId && clientProjects.some((p) => p.id === projectId)
        ? projectId
        : null;

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("time_entries").insert({
      organization_id: organizationId,
      user_id: userId,
      client_id: clientId,
      project_id: projectValid,
      description: description.trim(),
      started_at: startedAt,
      ended_at: endedAt,
      billable,
      hourly_rate: DEFAULT_HOURLY_RATE,
    });
    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    onSaved(date);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="relative bg-white rounded-t-[1.75rem] sm:rounded-[2rem] border border-line w-full max-w-[520px] max-h-[90vh] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)] flex flex-col"
      >
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-line flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                Add worked time
              </h2>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Log hours manually for a client. Project is optional.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
          <Field label="Description">
            <input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              className={inputClass}
            />
          </Field>

          <Field label="Date">
            <DatePickerField value={date} onChange={setDate} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Started">
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={`${inputClass} pl-10`}
                  required
                />
              </div>
            </Field>
            <Field label="Ended">
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={`${inputClass} pl-10`}
                  required
                />
              </div>
            </Field>
          </div>

          <Field label="Client">
            <ClientPicker
              clients={clients}
              selectedId={clientId}
              onChange={(id) => {
                setClientId(id);
                setProjectId("");
              }}
            />
          </Field>

          <Field
            label="Project"
            hint="Optional — leave blank if this was just for the client."
          >
            <ProjectPicker
              projects={clientProjects}
              selectedId={projectId}
              onChange={setProjectId}
              disabled={!clientId}
              emptyLabel={
                !clientId
                  ? "Select a client first"
                  : clientProjects.length === 0
                    ? "No projects for this client"
                    : "No project"
              }
            />
          </Field>

          <label className="flex items-center gap-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="rounded border-line"
            />
            Billable
          </label>

          {error && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-5 py-2.5 rounded-full text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add time"}
          </button>
        </div>
      </form>
    </div>
  );
}
