"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Building2,
  CreditCard,
  Settings,
  ExternalLink,
  Gift,
  Ban,
  Trash2,
} from "lucide-react";
import type { AdminOrgRow } from "@/lib/platform-admin";

type TabId = "details" | "billing" | "settings";

type PaymentRow = {
  id: string;
  number: string | null;
  status: string;
  amountLabel: string;
  currency: string;
  createdAt: string;
  hostedInvoiceUrl: string | null;
};

const TABS: { id: TabId; label: string; icon: typeof Building2 }[] = [
  { id: "details", label: "Details", icon: Building2 },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "settings", label: "Settings", icon: Settings },
];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function planTone(label: string) {
  if (label === "Pro") return "bg-emerald-50 text-emerald-700";
  if (label === "Trial") return "bg-amber-50 text-amber-800";
  return "bg-gray-100 text-gray-600";
}

export function AdminUserDrawer({
  orgId,
  onClose,
  onChanged,
}: {
  orgId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<TabId>("details");
  const [org, setOrg] = useState<AdminOrgRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [entered, setEntered] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/organizations/${orgId}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load user.");
      setLoading(false);
      return;
    }
    setOrg(json.organization as AdminOrgRow);
    setPayments((json.payments || []) as PaymentRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [orgId]);

  async function billingAction(
    action: "grant_pro" | "revoke_pro" | "cancel_subscription"
  ) {
    if (!org) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/organizations/${org.id}/billing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Action failed.");
      return;
    }
    setOrg((prev) =>
      prev
        ? {
            ...prev,
            complimentaryPro: Boolean(json.complimentaryPro),
            planLabel: json.planLabel || prev.planLabel,
            paid: Boolean(json.paid),
            subscriptionStatus: json.subscriptionStatus ?? null,
            stripeSubscriptionId: json.stripeSubscriptionId ?? null,
            stripeCustomerId: json.stripeCustomerId ?? prev.stripeCustomerId,
          }
        : prev
    );
    onChanged();
    if (action === "cancel_subscription") void load();
  }

  async function deleteUser() {
    if (!org) return;
    if (deleteConfirm.trim().toLowerCase() !== "delete") {
      setError('Type "delete" to confirm.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/organizations/${org.id}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not delete user.");
      return;
    }
    onChanged();
    onClose();
  }

  const content = (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close"
        className={`absolute inset-0 bg-black/25 transition-opacity duration-300 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="User details"
        className={`absolute top-3 bottom-3 right-3 w-[min(440px,calc(100vw-1.5rem))] rounded-2xl border border-line bg-white shadow-[0_24px_64px_rgba(16,24,40,0.22)] flex flex-col overflow-hidden transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-[110%]"
        }`}
      >
        <div className="px-5 pt-5 pb-4 border-b border-line flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight truncate">
              {org?.name || "User"}
            </h2>
            <p className="text-[13px] text-gray-500 mt-0.5 truncate">
              {org?.ownerEmail || org?.ownerName || "Loading…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 shrink-0 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 shrink-0">
          <div className="flex gap-1 p-1 rounded-xl border border-line bg-[#FAFBFC]">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-semibold transition-colors ${
                    active
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !org ? (
            <p className="text-sm text-red-600">{error || "Not found"}</p>
          ) : (
            <>
              {error && (
                <p className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              {tab === "details" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${planTone(org.planLabel)}`}
                    >
                      {org.planLabel}
                    </span>
                    {org.complimentaryPro && (
                      <span className="text-[11px] font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                        Complimentary
                      </span>
                    )}
                  </div>
                  <dl className="space-y-3 text-[13px]">
                    <Row label="Workspace" value={org.name} />
                    <Row label="Type" value={org.type} />
                    <Row label="Owner" value={org.ownerName || "—"} />
                    <Row label="Email" value={org.ownerEmail || "—"} />
                    <Row label="Members" value={String(org.memberCount)} />
                    <Row label="Country" value={org.country || "—"} />
                    <Row label="Currency" value={org.currency || "—"} />
                    <Row
                      label="Address"
                      value={org.address || "—"}
                      multiline
                    />
                    <Row label="Created" value={formatDate(org.createdAt)} />
                    <Row
                      label="Trial ends"
                      value={formatDate(org.trialEndsAt)}
                    />
                  </dl>
                </div>
              )}

              {tab === "billing" && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-line bg-[#FAFBFC] p-4 space-y-2">
                    <div className="text-[13px] font-semibold text-gray-900">
                      Plan
                    </div>
                    <p className="text-[13px] text-gray-600">
                      {org.planLabel}
                      {org.complimentaryPro ? " · complimentary Pro" : ""}
                      {org.subscriptionStatus
                        ? ` · Stripe ${org.subscriptionStatus}`
                        : ""}
                    </p>
                    {org.stripeCustomerId && (
                      <p className="text-[11px] font-mono text-gray-400 break-all">
                        {org.stripeCustomerId}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {org.complimentaryPro ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void billingAction("revoke_pro")}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Ban className="w-4 h-4" />
                        Revoke complimentary Pro
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void billingAction("grant_pro")}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <Gift className="w-4 h-4" />
                        Give free Pro
                      </button>
                    )}
                    {org.stripeSubscriptionId &&
                      org.subscriptionStatus &&
                      !["canceled", "incomplete_expired"].includes(
                        org.subscriptionStatus
                      ) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Cancel this Stripe subscription immediately?"
                              )
                            ) {
                              void billingAction("cancel_subscription");
                            }
                          }}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <Ban className="w-4 h-4" />
                          Cancel subscription
                        </button>
                      )}
                  </div>

                  <div>
                    <div className="text-[13px] font-semibold text-gray-900 mb-2">
                      Payments
                    </div>
                    {payments.length === 0 ? (
                      <p className="text-[13px] text-gray-400">
                        No Stripe payments found.
                      </p>
                    ) : (
                      <ul className="divide-y divide-line rounded-2xl border border-line overflow-hidden">
                        {payments.map((p) => (
                          <li
                            key={p.id}
                            className="px-3.5 py-3 flex items-start justify-between gap-3 bg-white"
                          >
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium text-gray-900">
                                {p.amountLabel}
                              </div>
                              <div className="text-[11px] text-gray-400 mt-0.5">
                                {p.number || p.id.slice(0, 12)} · {p.status} ·{" "}
                                {formatDate(p.createdAt)}
                              </div>
                            </div>
                            {p.hostedInvoiceUrl && (
                              <a
                                href={p.hostedInvoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-50 shrink-0"
                                aria-label="Open invoice"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {tab === "settings" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
                    <div className="text-[14px] font-semibold text-red-900">
                      Delete user
                    </div>
                    <p className="text-[13px] text-red-800/80 mt-1 leading-relaxed">
                      Soft-deletes this workspace and the owner profile. Any
                      active Stripe subscription is canceled. This cannot be
                      undone from the app.
                    </p>
                    <label className="block mt-3">
                      <span className="block text-[12px] font-medium text-red-900 mb-1.5">
                        Type delete to confirm
                      </span>
                      <input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        className="w-full border border-red-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-red-300"
                        placeholder="delete"
                        autoComplete="off"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteUser()}
                      className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      {busy ? "Deleting…" : "Delete user"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
      <dt className="text-gray-400">{label}</dt>
      <dd
        className={`text-gray-900 font-medium ${
          multiline ? "whitespace-pre-line" : "truncate"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
