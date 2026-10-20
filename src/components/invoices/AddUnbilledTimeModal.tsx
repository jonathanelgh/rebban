"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock, X } from "lucide-react";
import {
  entryLineDescription,
  summarizeUnbilled,
  type UnbilledTimeEntry,
} from "@/lib/invoices/unbilled";
import { formatDurationMinutes, toISODateLocal } from "@/lib/time-entries";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import { ModalOverlay, modalPanelClass } from "@/components/ModalFrame";

function entryDay(startedAt: string) {
  try {
    return toISODateLocal(new Date(startedAt));
  } catch {
    return "";
  }
}

function inDateRange(startedAt: string, fromDate: string, toDate: string) {
  const day = entryDay(startedAt);
  if (!day) return true;
  if (fromDate && day < fromDate) return false;
  if (toDate && day > toDate) return false;
  return true;
}

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
  onConfirm: (
    selected: UnbilledTimeEntry[],
    options: { consolidateWithSpecification: boolean }
  ) => void | Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [consolidateWithSpecification, setConsolidateWithSpecification] =
    useState(true);

  useEffect(() => {
    if (!open) return;
    setFromDate("");
    setToDate("");
    setConsolidateWithSpecification(true);
  }, [open]);

  const filtered = useMemo(
    () =>
      entries.filter((e) => inDateRange(e.startedAt, fromDate, toDate)),
    [entries, fromDate, toDate]
  );

  // Reset selection when the modal opens or the filter set changes — not on
  // every parent re-render (unstable `filtered` array identity).
  const filteredIdsKey = filtered.map((e) => e.id).join(",");
  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(filteredIdsKey ? filteredIdsKey.split(",") : []));
  }, [open, filteredIdsKey]);

  const selected = useMemo(
    () => filtered.filter((e) => selectedIds.has(e.id)),
    [filtered, selectedIds]
  );
  const summary = summarizeUnbilled(selected);
  const allSelected =
    filtered.length > 0 && selectedIds.size === filtered.length;

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
    else setSelectedIds(new Set(filtered.map((e) => e.id)));
  }

  function updateFrom(value: string) {
    setFromDate(value);
    if (toDate && value && toDate < value) setToDate(value);
  }

  function updateTo(value: string) {
    setToDate(value);
    if (fromDate && value && fromDate > value) setFromDate(value);
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

        {entries.length > 0 && !loading && (
          <div className="px-5 sm:px-6 py-3 border-b border-line shrink-0">
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
              <span className="shrink-0">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => updateFrom(e.target.value)}
                className="border border-line rounded-lg px-2 py-1 text-gray-800 bg-white"
              />
              <span className="shrink-0">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => updateTo(e.target.value)}
                className="border border-line rounded-lg px-2 py-1 text-gray-800 bg-white"
              />
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                  }}
                  className="text-[12px] font-medium text-[#2563EB] hover:text-[#1d4ed8] ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        <div className="px-5 sm:px-6 py-3 border-b border-line flex items-center justify-between gap-3 shrink-0 bg-[#FAFBFC]">
          <button
            type="button"
            onClick={toggleAll}
            disabled={filtered.length === 0 || loading}
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

        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              Loading time entries…
            </div>
          ) : entries.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              No unbilled billable hours for this client.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              No entries in this date range.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((entry) => {
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

        <div className="px-5 sm:px-6 py-4 border-t border-line shrink-0 space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consolidateWithSpecification}
              onChange={(e) =>
                setConsolidateWithSpecification(e.target.checked)
              }
              className="mt-0.5 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-gray-900">
                One line item with detailed specification
              </span>
              <span className="block text-[12px] text-gray-500 mt-0.5">
                Total hours on one line; hour-by-hour breakdown in invoice notes.
              </span>
            </span>
          </label>
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (busy || selected.length === 0) return;
                void onConfirm(selected, { consolidateWithSpecification });
              }}
              className="btn-primary px-5 py-2.5 rounded-full text-sm disabled:opacity-50"
            >
              {busy
                ? "Adding…"
                : `Add ${selected.length} ${selected.length === 1 ? "entry" : "entries"}`}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
