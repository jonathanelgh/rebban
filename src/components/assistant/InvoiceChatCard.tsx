"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  actionsForInvoiceStatus,
  type ChatComponentAction,
  type InvoiceCardSnapshot,
  type InvoiceChatComponent,
} from "@/lib/assistant/components";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-[#EFF6FF] text-[#2563EB]",
  viewed: "bg-[#F5F3FF] text-violet-700",
  paid: "bg-[#F3FAF6] text-emerald-700",
  overdue: "bg-[#FEF2F2] text-red-700",
  void: "bg-gray-100 text-gray-500",
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type Props = {
  component: InvoiceChatComponent;
  conversationId?: string | null;
  onUpdated?: (next: InvoiceChatComponent | null) => void;
  onError?: (message: string) => void;
};

export function InvoiceChatCard({
  component,
  conversationId,
  onUpdated,
  onError,
}: Props) {
  const [data, setData] = useState<InvoiceChatComponent>(component);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/assistant/invoices/${component.entityId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Could not load invoice.");
      }
      const next = json.component as InvoiceChatComponent;
      setData(next);
      onUpdated?.(next);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load invoice.";
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  }, [component.entityId, onError, onUpdated]);

  useEffect(() => {
    setData(component);
    void refresh();
  }, [component.entityId]); // eslint-disable-line react-hooks/exhaustive-deps -- refresh on id change

  async function runAction(action: ChatComponentAction) {
    if (action === "view" || action === "edit") return;
    setActing(action);
    setError(null);
    try {
      const res = await fetch("/api/assistant/actions/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          invoiceId: data.entityId,
          conversationId: conversationId || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Action failed.");
      }
      if (action === "cancel_draft") {
        setData((prev) => ({
          ...prev,
          actions: ["view"],
          snapshot: {
            ...prev.snapshot,
            status: "void",
          },
        }));
        onUpdated?.(null);
        return;
      }
      if (json.component) {
        setData(json.component);
        onUpdated?.(json.component);
      } else {
        await refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      setError(message);
      onError?.(message);
    } finally {
      setActing(null);
    }
  }

  const snap: InvoiceCardSnapshot = data.snapshot || {};
  const status = String(snap.status || "draft");
  const actions =
    data.actions?.length > 0
      ? data.actions
      : actionsForInvoiceStatus(status);

  return (
    <div
      className="mt-2 w-full max-w-[320px] overflow-hidden rounded-xl border border-line bg-white text-left shadow-sm"
      role="region"
      aria-label="Invoice card"
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-gray-900">
            {snap.client || "Client"}
          </p>
          <p className="mt-0.5 text-[12px] text-gray-500">
            {snap.number ? `Invoice ${snap.number}` : "Draft invoice"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            STATUS_STYLES[status] || STATUS_STYLES.draft
          }`}
        >
          {statusLabel(status)}
        </span>
      </div>

      <div className="space-y-1.5 px-3 py-2.5 text-[13px]">
        {loading && !snap.amount ? (
          <p className="text-gray-400">Loading…</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-gray-500">Amount</span>
              <span className="font-semibold text-gray-900">
                {snap.amount || "—"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-gray-500">Due</span>
              <span className="text-gray-800">{formatDate(snap.dueDate)}</span>
            </div>
            {snap.description ? (
              <p className="line-clamp-2 pt-1 text-[12px] text-gray-600">
                {snap.description}
              </p>
            ) : null}
          </>
        )}
        {error ? (
          <p className="text-[12px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-line bg-[#FAFBFC] px-2.5 py-2">
        {actions.includes("approve_and_send") ? (
          <button
            type="button"
            disabled={Boolean(acting)}
            onClick={() => void runAction("approve_and_send")}
            className="rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            {acting === "approve_and_send" ? "Sending…" : "Approve & Send"}
          </button>
        ) : null}
        {actions.includes("edit") ? (
          <Link
            href={`/invoices/${data.entityId}/edit`}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-800 hover:bg-gray-50"
          >
            Edit
          </Link>
        ) : null}
        {actions.includes("view") ? (
          <Link
            href={`/invoices/${data.entityId}/edit`}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-800 hover:bg-gray-50"
          >
            View Invoice
          </Link>
        ) : null}
        {actions.includes("cancel_draft") ? (
          <button
            type="button"
            disabled={Boolean(acting)}
            onClick={() => void runAction("cancel_draft")}
            className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {acting === "cancel_draft" ? "Cancelling…" : "Cancel Draft"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
