"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  resolveLeadSource,
  type LeadSourceRow,
} from "@/lib/leads/sources";
import { LeadSourceIcon } from "@/components/leads/LeadSourceIcons";

export function LeadSourceSelect({
  value,
  onChange,
  sources,
  placeholder = "Select source…",
  searchPlaceholder = "Search sources…",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  sources: LeadSourceRow[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = useMemo(() => {
    if (!value) return null;
    return resolveLeadSource(sources, value);
  }, [sources, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((option) => {
      const haystack = [option.name, option.id, ...option.keywords]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [search, sources]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative min-w-0 max-w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          if (open) setSearch("");
        }}
        className={`w-full flex items-center gap-2.5 border rounded-xl px-3.5 py-2.5 text-sm text-left transition-colors outline-none disabled:opacity-50 ${
          open
            ? "border-gray-300 bg-white shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
            : "border-line bg-white hover:border-gray-300"
        }`}
      >
        {selected ? (
          <span className="shrink-0 w-4 h-4 flex items-center justify-center">
            <LeadSourceIcon source={selected} className="w-4 h-4" />
          </span>
        ) : null}
        <span
          className={`flex-1 min-w-0 truncate ${
            selected ? "text-gray-900 font-medium" : "text-gray-400"
          }`}
        >
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-line bg-white shadow-[0_16px_40px_-12px_rgba(16,24,40,0.18)] overflow-hidden"
        >
          <div className="p-3 border-b border-line flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full text-sm outline-none placeholder:text-gray-400 font-medium bg-transparent text-gray-900"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-400">
                No matches.
              </p>
            ) : (
              filtered.map((option) => {
                const isSelected = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-[#EFF6FF] text-gray-900"
                        : "text-gray-800 hover:bg-[#FAFBFC]"
                    }`}
                  >
                    <span className="shrink-0 w-4 h-4 flex items-center justify-center">
                      <LeadSourceIcon source={option} className="w-4 h-4" />
                    </span>
                    <span className="font-medium truncate flex-1">
                      {option.name}
                    </span>
                    {isSelected ? (
                      <Check
                        className="w-4 h-4 text-[#2563EB] shrink-0"
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LeadSourceBadge({
  source,
  sources,
}: {
  source: string;
  sources: LeadSourceRow[];
}) {
  const meta = resolveLeadSource(sources, source);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
      <LeadSourceIcon source={meta} className="w-3.5 h-3.5" />
      {meta.name}
    </span>
  );
}
