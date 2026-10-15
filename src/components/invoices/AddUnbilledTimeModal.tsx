"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock, X } from "lucide-react";
import {
  entryLineDescription,
  summarizeUnbilled,
  type UnbilledTimeEntry,
} from "@/lib/invoices/unbilled";
import { formatDurationMinutes } from "@/lib/time-entries";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import { ModalOverlay, modalPanelClass } from "@/components/ModalFrame";

export function AddUnbilledTimeModal({
  open,
  entries,
  currency,
  loading,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  entries: UnbilledTimeEntry[];
  currency: string;
  loading?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (selected: UnbilledTimeEntry[]) => void | Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(entries.map((e) => e.id)));
  }, [open, entries]);

  const selected = useMemo(
    () => entries.filter((e) => selectedIds.has(e.id)),
    [entries, selectedIds]
  );
  const summary = summarizeUnbilled(selected);
  const allSelected = entries.length > 0 && selectedIds.size === entries.length;

  if (!open) return null;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map((e) => e.id)));
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className={modalPanelClass("max-w-[560px]")}>
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-line flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                  Add billable time
                </h2>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  Choose unbilled hours to add as line items.
                </p>
              </div>
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

        <div className="px-5 sm:px-6 py-3 border-b border-line flex items-center justify-between gap-3 shrink-0 bg-[#FAFBFC]">
          <button
            type="button"
            onClick={toggleAll}
            disabled={entries.length === 0 || loading}
            className="text-[13px] font-medium text-[#2563EB] hover:text-[#1d4ed8] disabled:opacity-40"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <div className="text-[13px] text-gray-600 text-right">
            <span className="font-medium text-gray-900">
              {summary.totalHours}h
            </span>
            {" · "}
            {formatInvoiceMoney(summary.totalAmount, currency)}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              Loading time entries…
            </div>
          ) : entries.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              No unbilled billable hours for this client.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((entry) => {
                const checked = selectedIds.has(entry.id);
                const dateLabel = new Date(entry.startedAt).toLocaleDateString(
                  undefined,
                  { weekday: "short", month: "short", day: "numeric" }
                );
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => toggle(entry.id)}
                      className="w-full text-left px-5 sm:px-6 py-3.5 flex items-start gap-3 hover:bg-[#FAFBFC] transition-colors"
                    >
                      <span
                        className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          checked
                            ? "bg-[#2563EB] border-[#2563EB] text-white"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium text-gray-900 truncate">
                          {entryLineDescription(entry)}
                        </div>
                        <div className="mt-0.5 text-[12px] text-gray-500 flex flex-wrap gap-x-2">
                          <span>{dateLabel}</span>
                          {entry.projectName && <span>· {entry.projectName}</span>}
                          <span>· {formatDurationMinutes(entry.durationMinutes)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[13px] font-semibold text-gray-900">
                          {formatInvoiceMoney(entry.amount, currency)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {entry.hours}h × {formatInvoiceMoney(entry.hourlyRate, currency)}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || selected.length === 0}
            onClick={() => void onConfirm(selected)}
            className="btn-primary px-5 py-2.5 rounded-full text-sm disabled:opacity-50"
          >
            {busy
              ? "Adding…"
              : `Add ${selected.length} ${selected.length === 1 ? "entry" : "entries"}`}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
