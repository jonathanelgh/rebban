"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type MenuSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  className = "",
}: {
  value: T | null;
  options: MenuSelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`relative w-full min-w-0 max-w-full text-left ${className}`}
    >
      {/* Native control on mobile — reliable inside overflow-clipped modals */}
      <select
        disabled={disabled}
        value={value ?? ""}
        aria-label={placeholder}
        onChange={(e) => {
          const next = e.target.value as T;
          if (next) onChange(next);
        }}
        className="sm:hidden w-full min-w-0 appearance-none border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none bg-white text-gray-900 disabled:opacity-50"
      >
        {!value && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
        className={`hidden sm:flex w-full items-center justify-between border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none bg-white text-left transition-colors disabled:opacity-50 hover:border-gray-300 ${
          open ? "border-gray-300 ring-2 ring-blue-100" : ""
        }`}
      >
        <span
          className={`min-w-0 truncate ${
            selected ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {selected?.label ?? placeholder}
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
          className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_12px_40px_rgba(16,24,40,0.14)] max-h-60 overflow-y-auto hidden sm:block"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? "bg-[#FAFBFC] text-gray-900"
                    : "text-gray-700 hover:bg-[#FAFBFC]"
                }`}
              >
                <span className="font-medium min-w-0 truncate">
                  {option.label}
                </span>
                {active && (
                  <Check
                    className="w-4 h-4 text-[#2563EB] shrink-0"
                    strokeWidth={2}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
