"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Enums } from "@/types/database";

export type ClientStatus = Enums<"client_status">;

const OPTIONS: {
  value: ClientStatus;
  label: string;
  description: string;
  tone: string;
  dot: string;
}[] = [
  {
    value: "active",
    label: "Active",
    description: "Currently working together",
    tone: "bg-[#F3FAF6] text-emerald-700",
    dot: "bg-emerald-500",
  },
  {
    value: "idle",
    label: "Idle",
    description: "Quiet for a while",
    tone: "bg-gray-100 text-gray-600",
    dot: "bg-gray-400",
  },
  {
    value: "prospect",
    label: "Prospect",
    description: "Not a client yet",
    tone: "bg-[#EFF6FF] text-[#2563EB]",
    dot: "bg-[#2563EB]",
  },
];

function optionFor(value: ClientStatus) {
  return OPTIONS.find((o) => o.value === value) ?? OPTIONS[2];
}

export function ClientStatusDropdown({
  value,
  onChange,
  disabled = false,
  variant = "pill",
}: {
  value: ClientStatus;
  onChange: (value: ClientStatus) => void;
  disabled?: boolean;
  variant?: "pill" | "field";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = optionFor(value);

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
      className={`relative text-left ${variant === "field" ? "block w-full" : "inline-block"}`}
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
        className={
          variant === "pill"
            ? `inline-flex items-center gap-2 rounded-full border border-black/[0.06] pl-3 pr-2.5 py-2 text-sm font-medium capitalize transition-colors disabled:opacity-50 ${selected.tone} hover:brightness-[0.98]`
            : `w-full inline-flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-colors disabled:opacity-50 hover:border-gray-300 ${
                open ? "border-gray-300" : ""
              }`
        }
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${selected.dot}`} />
          <span className="truncate">{selected.label}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${
            variant === "pill" ? "opacity-70" : "text-gray-400"
          } ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Client status"
          className={`absolute z-50 mt-2 rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_12px_40px_rgba(16,24,40,0.14)] ${
            variant === "field" ? "left-0 right-0" : "right-0 w-[240px]"
          }`}
        >
          {OPTIONS.map((option) => {
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
                className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left transition-colors ${
                  active ? "bg-[#FAFBFC]" : "hover:bg-[#FAFBFC]"
                }`}
              >
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${option.dot}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-medium text-gray-900">
                      {option.label}
                    </span>
                    {active && (
                      <Check
                        className="w-4 h-4 text-[#2563EB] shrink-0"
                        strokeWidth={2}
                      />
                    )}
                  </span>
                  <span className="block text-[12px] text-gray-400 mt-0.5 leading-snug">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
