"use client";

import React, { useState } from "react";
import { FolderKanban, Loader2, X } from "lucide-react";
import {
  ModalOverlay,
  modalFooterClass,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";
import { createClient } from "@/lib/supabase/client";
import type { ProjectBillingType } from "@/lib/projects/billing";
import { billingTypeLabel } from "@/lib/projects/billing";

const BILLING_OPTIONS: ProjectBillingType[] = [
  "fixed",
  "hourly",
  "daily",
  "retainer",
  "mixed",
];

export function CreateProjectModal({
  organizationId,
  userId,
  clients,
  initialClientId,
  onClose,
  onCreated,
}: {
  organizationId: string;
  userId: string;
  clients: { id: string; name: string }[];
  initialClientId?: string | null;
  onClose: () => void;
  onCreated: (project: {
    id: string;
    name: string;
    clientId: string;
    clientName: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(
    () => initialClientId || clients[0]?.id || ""
  );
  const [billingType, setBillingType] = useState<ProjectBillingType>("fixed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a project name.");
      return;
    }
    if (!clientId) {
      setError("Select a client.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("projects")
        .insert({
          organization_id: organizationId,
          client_id: clientId,
          name: trimmed,
          created_by: userId,
          status: "active",
          billing_type: billingType,
        })
        .select("id, name, client_id")
        .single();

      if (insertError || !data) {
        setError(insertError?.message || "Could not create project.");
        return;
      }

      const clientName =
        clients.find((c) => c.id === data.client_id)?.name || "Client";
      onCreated({
        id: data.id,
        name: data.name,
        clientId: data.client_id,
        clientName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClose={busy ? undefined : onClose} zClass="z-[70]">
      <div className={modalPanelClass("max-w-[440px]")}>
        <div className={`${modalHeaderClass} border-b border-line`}>
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-gray-900">
                New project
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Organize tasks under a client engagement.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 shrink-0 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
          {error && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}

          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Project name
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Website redesign"
              className="mt-1.5 w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Client</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1.5 w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300 bg-white"
            >
              {clients.length === 0 ? (
                <option value="">No clients</option>
              ) : (
                clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Billing type
            </span>
            <select
              value={billingType}
              onChange={(e) =>
                setBillingType(e.target.value as ProjectBillingType)
              }
              className="mt-1.5 w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300 bg-white"
            >
              {BILLING_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {billingTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={modalFooterClass}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 mr-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !clientId}
            onClick={() => void handleCreate()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <FolderKanban className="w-4 h-4" />
                Create project
              </>
            )}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
