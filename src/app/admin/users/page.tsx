"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { AdminOrgRow } from "@/lib/platform-admin";
import { AdminUserDrawer } from "@/components/admin/AdminUserDrawer";

function formatDate(iso: string) {
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

export default function AdminUsersPage() {
  const [orgs, setOrgs] = useState<AdminOrgRow[]>([]);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<"all" | "paid" | "trial" | "ended">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (plan !== "all") params.set("plan", plan);
    const res = await fetch(`/api/admin/organizations?${params.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load users.");
      setLoading(false);
      return;
    }
    setOrgs((json.organizations || []) as AdminOrgRow[]);
    setError(null);
    setLoading(false);
  }, [q, plan]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (!cancelled) void load();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [load]);

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-6 pr-16 md:pr-28">
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
          Users
        </h1>
        <p className="text-gray-500 mt-1.5 text-[15px]">
          Workspaces and owners across Rebban, with plan details.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <label className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, owner, email…"
            className="w-full border border-line rounded-xl pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-gray-300 bg-white"
          />
        </label>
        <div className="flex gap-1 p-1 rounded-xl border border-line bg-white shrink-0 overflow-x-auto">
          {(
            [
              ["all", "All"],
              ["paid", "Paid"],
              ["trial", "Trial"],
              ["ended", "Trial ended"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPlan(value)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                plan === value
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="surface-panel overflow-hidden">
        {loading ? (
          <div className="p-5 text-sm text-gray-400">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">No matching users.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead className="bg-[#FAFBFC] border-b border-line text-[12px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Workspace</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Stripe</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orgs.map((org) => (
                  <tr
                    key={org.id}
                    onClick={() => setSelectedOrgId(org.id)}
                    className="hover:bg-gray-50/80 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{org.name}</div>
                      <div className="text-[12px] text-gray-400 capitalize">
                        {org.type}
                        {org.memberCount
                          ? ` · ${org.memberCount} member${org.memberCount === 1 ? "" : "s"}`
                          : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800">{org.ownerName || "—"}</div>
                      <div className="text-[12px] text-gray-400">
                        {org.ownerEmail || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${planTone(org.planLabel)}`}
                      >
                        {org.planLabel}
                      </span>
                      {org.complimentaryPro ? (
                        <div className="text-[11px] text-violet-600 mt-1">
                          Complimentary
                        </div>
                      ) : org.subscriptionStatus ? (
                        <div className="text-[11px] text-gray-400 mt-1">
                          {org.subscriptionStatus}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-500 font-mono">
                      {org.stripeCustomerId
                        ? `${org.stripeCustomerId.slice(0, 14)}…`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(org.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedOrgId && (
        <AdminUserDrawer
          orgId={selectedOrgId}
          onClose={() => setSelectedOrgId(null)}
          onChanged={() => void load()}
        />
      )}
    </main>
  );
}
