"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  FileText,
  Users,
  FolderKanban,
  FileSpreadsheet,
  ListTodo,
} from "lucide-react";
import { useBilling } from "@/components/BillingContext";

const CREATE_ITEMS = [
  {
    href: "/proposals?new=1",
    label: "New proposal",
    description: "Scope, pricing, and send for acceptance",
    icon: FileText,
  },
  {
    href: "/clients?new=1",
    label: "New client",
    description: "Add a client to your workspace",
    icon: Users,
  },
  {
    href: "/tasks?new=1",
    label: "New task",
    description: "Add work to your board or list",
    icon: ListTodo,
  },
  {
    href: "/time-tracking?new=1",
    label: "Track time",
    description: "Start a timer for client work",
    icon: FolderKanban,
  },
  {
    href: "/invoices?new=1",
    label: "New invoice",
    description: "Bill for time or accepted proposals",
    icon: FileSpreadsheet,
  },
] as const;

const CREATE_BUTTON_CLASS =
  "group inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 ease-out bg-[#2563EB] shadow-sm hover:bg-[#1d4ed8] hover:shadow-[0_8px_20px_rgba(37,99,235,0.35)] hover:scale-[1.03] active:scale-[0.98]";

/** Page-specific primary CTA for the mobile chrome slot (same place as dashboard Create). */
export function PageChromeCta({
  label,
  href,
}: {
  label: string;
  href: string;
}) {
  const { entitled, loading, openUpgradeModal } = useBilling();

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (!loading && !entitled) {
          e.preventDefault();
          openUpgradeModal();
        }
      }}
      className={CREATE_BUTTON_CLASS}
    >
      <Plus className="w-4 h-4 transition-transform duration-200 ease-out group-hover:rotate-90" />
      {label}
    </Link>
  );
}

export function CreateMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { entitled, loading, openUpgradeModal } = useBilling();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!loading && !entitled) {
            openUpgradeModal();
            return;
          }
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${CREATE_BUTTON_CLASS} ${
          open
            ? "!bg-[#1d4ed8] shadow-[0_8px_20px_rgba(37,99,235,0.4)] scale-[1.02]"
            : ""
        }`}
      >
        <Plus className={`w-4 h-4 transition-transform duration-200 ease-out ${open ? "rotate-45" : "group-hover:rotate-90"}`} />
        Create
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[min(280px,calc(100vw-2rem))] rounded-2xl border border-line bg-white py-2 shadow-[0_12px_40px_rgba(16,24,40,0.12)]"
        >
          {CREATE_ITEMS.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 px-3.5 py-2.5 mx-1.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="mt-0.5 w-9 h-9 rounded-xl bg-[#FAFBFC] border border-line flex items-center justify-center shrink-0 text-gray-700">
                <Icon className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-gray-900">{label}</div>
                <div className="text-[12px] text-gray-500 leading-snug mt-0.5">
                  {description}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
