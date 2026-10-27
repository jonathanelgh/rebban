"use client";

import React from "react";

export const STATUS_PILL: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-[#EFF6FF] text-[#2563EB]",
  viewed: "bg-[#F5F3FF] text-violet-700",
  accepted: "bg-[#F3FAF6] text-emerald-700",
  declined: "bg-[#FEF2F2] text-red-700",
  paid: "bg-[#F3FAF6] text-emerald-700",
  overdue: "bg-[#FEF2F2] text-red-700",
  void: "bg-gray-100 text-gray-500",
  active: "bg-[#EFF6FF] text-[#2563EB]",
  idle: "bg-gray-100 text-gray-600",
  prospect: "bg-[#F5F3FF] text-violet-700",
  new: "bg-[#EFF6FF] text-[#2563EB]",
  contacted: "bg-[#F5F3FF] text-violet-700",
  proposal_sent: "bg-[#EFF6FF] text-[#2563EB]",
  won: "bg-[#F3FAF6] text-emerald-700",
  lost: "bg-gray-100 text-gray-500",
  on_hold: "bg-amber-50 text-amber-800",
  completed: "bg-[#F3FAF6] text-emerald-700",
  archived: "bg-gray-100 text-gray-500",
  backlog: "bg-gray-100 text-gray-600",
  todo: "bg-[#EFF6FF] text-[#2563EB]",
  in_progress: "bg-amber-50 text-amber-800",
  review: "bg-[#F5F3FF] text-violet-700",
  done: "bg-[#F3FAF6] text-emerald-700",
};

export function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ChatCardShell({
  title,
  subtitle,
  status,
  children,
  actions,
}: {
  title: string;
  subtitle?: string | null;
  status?: string | null;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const tone =
    (status && STATUS_PILL[status]) || "bg-gray-100 text-gray-700";
  return (
    <div
      className="mt-2 w-full max-w-[320px] overflow-hidden rounded-xl border border-line bg-white text-left shadow-sm"
      role="region"
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-gray-900">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[12px] text-gray-500">
              {subtitle}
            </p>
          ) : null}
        </div>
        {status ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
          >
            {statusLabel(status)}
          </span>
        ) : null}
      </div>
      {children ? (
        <div className="space-y-1.5 px-3 py-2.5 text-[13px]">{children}</div>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap gap-1.5 border-t border-line bg-[#FAFBFC] px-2.5 py-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function CardBtn({
  children,
  onClick,
  href,
  primary,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const className = primary
    ? "rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
    : danger
      ? "rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
      : "rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60";

  if (href) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
}

export function MetaRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span
        className={
          bold ? "font-semibold text-gray-900" : "text-gray-800 text-right"
        }
      >
        {value}
      </span>
    </div>
  );
}
