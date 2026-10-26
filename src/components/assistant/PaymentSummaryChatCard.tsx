"use client";

import React from "react";
import Link from "next/link";
import type { PaymentSummaryChatComponent } from "@/lib/assistant/components";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  component: PaymentSummaryChatComponent;
};

export function PaymentSummaryChatCard({ component }: Props) {
  const invoices = component.invoices || [];

  return (
    <div
      className="mt-2 w-full max-w-[340px] overflow-hidden rounded-xl border border-line bg-white text-left shadow-sm"
      role="region"
      aria-label="Outstanding invoices"
    >
      <div className="border-b border-line px-3 py-2.5">
        <p className="text-[13px] font-semibold text-gray-900">
          Outstanding invoices
        </p>
        <p className="mt-0.5 text-[12px] text-gray-500">
          {invoices.length} unpaid
          {component.totalOutstanding
            ? ` · ~${component.totalOutstanding} total`
            : ""}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {invoices.map((inv) => (
          <li key={inv.entityId}>
            <Link
              href={`/invoices/${inv.entityId}/edit`}
              className="flex items-start justify-between gap-2 px-3 py-2.5 text-[13px] hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">
                  {inv.client}
                </p>
                <p className="mt-0.5 text-[12px] text-gray-500">
                  {inv.number ? `#${inv.number}` : "Invoice"} · Due{" "}
                  {formatDate(inv.dueDate)}
                  {inv.daysOverdue
                    ? ` · ${inv.daysOverdue}d overdue`
                    : ""}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-gray-900">
                {inv.amount}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
