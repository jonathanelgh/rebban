"use client";

import React, { useEffect, useState } from "react";
import { Activity, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type EventRow = {
  id: string;
  event_type: string;
  actor_name: string | null;
  actor_email: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const LABELS: Record<string, string> = {
  sent: "Sent to client",
  opened: "Opened by client",
  viewed: "Viewed again",
  reminder_sent: "Payment reminder sent",
  paid: "Paid by client",
  voided: "Voided",
};

function ActivityList({
  events,
  loading,
  compact = false,
}: {
  events: EventRow[];
  loading: boolean;
  compact?: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>;
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        No activity yet. Send the invoice to start tracking.
      </p>
    );
  }

  return (
    <ul className={compact ? "space-y-2.5" : "space-y-3"}>
      {events.map((event) => (
        <li
          key={event.id}
          className={
            compact
              ? "rounded-xl border border-line bg-white px-3.5 py-3"
              : "rounded-2xl border border-line px-4 py-3"
          }
        >
          <div className="text-[14px] font-medium text-gray-900">
            {LABELS[event.event_type] || event.event_type}
          </div>
          <div className="text-[12px] text-gray-400 mt-1">
            {new Date(event.created_at).toLocaleString()}
            {event.actor_name || event.actor_email
              ? ` · ${event.actor_name || event.actor_email}`
              : ""}
          </div>
          {event.event_type === "sent" &&
            typeof event.metadata?.recipient_email === "string" && (
              <p className="text-[12px] text-gray-500 mt-2">
                To {event.metadata.recipient_email}
                {typeof event.metadata?.reminder_count === "number" &&
                event.metadata.reminder_count > 0
                  ? ` · ${event.metadata.reminder_count} reminder${
                      event.metadata.reminder_count === 1 ? "" : "s"
                    } scheduled`
                  : ""}
              </p>
            )}
        </li>
      ))}
    </ul>
  );
}

function useInvoiceEvents(
  invoiceId: string,
  enabled: boolean,
  refreshKey = 0
) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !invoiceId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("invoice_events")
        .select("id, event_type, actor_name, actor_email, created_at, metadata")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setEvents((data as EventRow[]) || []);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, invoiceId, refreshKey]);

  return { events, loading };
}

export function InvoiceActivityLog({
  invoiceId,
  open,
  onClose,
  variant = "modal",
  refreshKey = 0,
}: {
  invoiceId: string;
  open: boolean;
  onClose?: () => void;
  variant?: "modal" | "panel" | "inline";
  refreshKey?: number;
}) {
  const { events, loading } = useInvoiceEvents(invoiceId, open, refreshKey);

  if (variant === "inline") {
    if (!open) return null;
    return (
      <div className="border-b border-line">
        <div className="px-5 py-3.5 flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#2563EB]" />
          <h3 className="text-sm font-semibold text-gray-900">Activity</h3>
        </div>
        <div className="px-5 pb-5">
          <ActivityList events={events} loading={loading} compact />
        </div>
      </div>
    );
  }

  if (variant === "panel") {
    if (!open) return null;
    return (
      <div className="flex flex-col min-h-0 h-full animate-in fade-in duration-200">
        <div className="bg-white border-b border-line px-6 py-5 shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2563EB]" />
            <h3 className="font-semibold text-gray-900">Activity</h3>
          </div>
          <p className="text-[12px] text-gray-400 mt-1.5 leading-snug">
            Sends and payment activity for this invoice.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 min-h-0">
          <ActivityList events={events} loading={loading} compact />
        </div>
      </div>
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-3xl border border-line w-full max-w-[480px] max-h-[80vh] overflow-hidden shadow-[0_24px_60px_rgba(16,24,40,0.16)] flex flex-col">
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-3 border-b border-line">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#2563EB]" />
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
              Activity
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          <ActivityList events={events} loading={loading} />
        </div>
      </div>
    </div>
  );
}
