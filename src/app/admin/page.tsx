"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AdminOverview } from "@/lib/platform-admin";

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

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch("/api/admin/overview");
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error || "Could not load admin overview.");
        setLoading(false);
        return;
      }
      setData(json as AdminOverview);
      setError(null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-6 pr-16 md:pr-28">
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
          Admin
        </h1>
        <p className="text-gray-500 mt-1.5 text-[15px]">
          Snapshot of workspaces, plans, and recent signups across Rebban.
        </p>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <StatCard label="Users" value={loading ? "—" : String(data?.users ?? 0)} />
        <StatCard
          label="Workspaces"
          value={loading ? "—" : String(data?.organizations ?? 0)}
        />
        <StatCard
          label="Paid"
          value={loading ? "—" : String(data?.paid ?? 0)}
          hint={
            loading
              ? undefined
              : `${data?.trial ?? 0} on trial · ${data?.free ?? 0} free`
          }
        />
        <StatCard
          label="New (7 days)"
          value={loading ? "—" : String(data?.signupsLast7Days ?? 0)}
          hint={
            loading
              ? undefined
              : `${data?.solo ?? 0} solo · ${data?.agency ?? 0} agency`
          }
        />
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 tracking-tight">
          Recent workspaces
        </h2>
        <Link
          href="/admin/users"
          className="text-[13px] font-medium text-[#2563EB] hover:text-[#1d4ed8] inline-flex items-center gap-1"
        >
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="surface-panel overflow-hidden">
        {loading ? (
          <div className="p-5 text-sm text-gray-400">Loading…</div>
        ) : !data?.recentOrgs.length ? (
          <div className="p-5 text-sm text-gray-500">No workspaces yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[640px]">
              <thead className="bg-[#FAFBFC] border-b border-line text-[12px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Workspace</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.recentOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50/80">
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
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white border border-line rounded-2xl p-5">
      <span className="text-xs font-medium text-gray-500 tracking-wide">
        {label}
      </span>
      <h3 className="text-2xl font-semibold tracking-tight mt-2 text-gray-900">
        {value}
      </h3>
      {hint ? <p className="text-[13px] text-gray-400 mt-1.5">{hint}</p> : null}
    </div>
  );
}
