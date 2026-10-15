"use client";

import React, { useEffect, useState } from "react";
import { X, Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ModalOverlay, modalPanelClass } from "@/components/ModalFrame";

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
  declined: "Declined",
  signed: "E-signed",
  accepted: "Accepted",
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
    return (
      <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        No activity yet. Send the proposal to start tracking.
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
          {event.event_type === "declined" &&
            typeof event.metadata?.reason === "string" &&
            event.metadata.reason && (
              <p className="text-[13px] text-gray-600 mt-2">
                Reason: {event.metadata.reason}
              </p>
            )}
          {event.event_type === "signed" &&
            typeof event.metadata?.document_hash === "string" && (
              <p className="text-[11px] text-gray-400 mt-2 break-all">
                Hash: {event.metadata.document_hash}
              </p>
            )}
          {event.event_type === "sent" &&
            typeof event.metadata?.recipient_email === "string" && (
              <p className="text-[12px] text-gray-500 mt-2">
                To {event.metadata.recipient_email}
              </p>
            )}
        </li>
      ))}
    </ul>
  );
}

function useProposalEvents(
  proposalId: string,
  enabled: boolean,
  refreshKey = 0
) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !proposalId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("proposal_events")
        .select("id, event_type, actor_name, actor_email, created_at, metadata")
        .eq("proposal_id", proposalId)
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
  }, [enabled, proposalId, refreshKey]);

  return { events, loading };
}

export function ProposalActivityLog({
  proposalId,
  open,
  onClose,
  variant = "modal",
  refreshKey = 0,
}: {
  proposalId: string;
  open: boolean;
  onClose?: () => void;
  variant?: "modal" | "panel";
  refreshKey?: number;
}) {
  const { events, loading } = useProposalEvents(proposalId, open, refreshKey);

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
            Opens, sends, and client decisions for this proposal.
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
    <ModalOverlay onClose={onClose}>
      <div className={modalPanelClass("max-w-[480px]")}>
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="w-5 h-5 text-[#2563EB] shrink-0" />
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
              Activity
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-4 overflow-y-auto flex-1 min-h-0">
          <ActivityList events={events} loading={loading} />
        </div>
      </div>
    </ModalOverlay>
  );
}
