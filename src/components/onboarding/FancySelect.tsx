"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type FancySelectOption = {
  value: string;
  label: string;
};

export function FancySelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchable = false,
  searchPlaceholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly FancySelectOption[] | FancySelectOption[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, search]);

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
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((prev) => !prev);
          if (open) setSearch("");
        }}
        className={`w-full flex items-center gap-2.5 border rounded-xl px-3.5 py-2.5 text-sm text-left transition-colors outline-none ${
          open
            ? "border-gray-300 bg-white shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
            : "border-line bg-white hover:border-gray-300"
        }`}
      >
        <span
          className={`flex-1 min-w-0 truncate ${
            selected ? "text-gray-900 font-medium" : "text-gray-400"
          }`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-line bg-white shadow-[0_16px_40px_-12px_rgba(16,24,40,0.18)] overflow-hidden"
        >
          {searchable && (
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
          )}
          <div className="max-h-[240px] overflow-y-auto p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-400">
                No matches.
              </p>
            ) : (
              filtered.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-[#EFF6FF] text-gray-900"
                        : "text-gray-800 hover:bg-[#FAFBFC]"
                    }`}
                  >
                    <span className="font-medium truncate">{option.label}</span>
                    {isSelected && (
                      <Check
                        className="w-4 h-4 text-[#2563EB] shrink-0"
                        strokeWidth={2.5}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
