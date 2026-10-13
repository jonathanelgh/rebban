"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Building2,
  Mail,
  MoreHorizontal,
  FolderKanban,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  ClientFormModal,
  uploadClientLogo,
  type ClientFormValues,
} from "@/components/ClientFormModal";
import type { Enums } from "@/types/database";

type ClientStatus = Enums<"client_status">;

type ClientRow = {
  id: string;
  name: string;
  company: string;
  email: string;
  projects: number;
  outstanding: number;
  unbilledMinutes: number;
  status: ClientStatus;
  lastActivityAt: string | null;
};

const STATUS_STYLES: Record<ClientStatus, string> = {
  active: "bg-[#F3FAF6] text-emerald-700",
  idle: "bg-gray-100 text-gray-600",
  prospect: "bg-[#EFF6FF] text-[#2563EB]",
};

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString()}`;
  }
}

function formatHoursShort(minutes: number) {
  const hours = minutes / 60;
  if (hours === 0) return "0h";
  if (hours < 10) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded}h`;
  }
  return `${Math.round(hours)}h`;
}

function formatRelativeActivity(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThatDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff} days ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function displayCompany(client: Pick<ClientRow, "company" | "name">) {
  return client.company || client.name;
}

export default function ClientsPage() {
  const router = useRouter();
  const {
    organizationId,
    organizationCurrency,
    loading: profileLoading,
  } = useProfile();
  const currency = organizationCurrency || "USD";

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    if (!organizationId) {
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [clientsRes, projectsRes, invoicesRes, timeEntriesRes, billedLinesRes] =
      await Promise.all([
        supabase
          .from("clients")
          .select("id, name, company, email, status, updated_at, created_at")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("projects")
          .select("id, client_id")
          .eq("organization_id", organizationId)
          .is("deleted_at", null),
        supabase
          .from("invoices")
          .select("client_id, total, status, updated_at, paid_at, sent_at")
          .eq("organization_id", organizationId)
          .is("deleted_at", null),
        supabase
          .from("time_entries")
          .select(
            "id, client_id, duration_minutes, billable, ended_at, updated_at, started_at"
          )
          .eq("organization_id", organizationId)
          .is("deleted_at", null),
        supabase
          .from("invoice_line_items")
          .select("time_entry_id")
          .eq("organization_id", organizationId)
          .not("time_entry_id", "is", null),
      ]);

    if (clientsRes.error) {
      setError(clientsRes.error.message);
      setClients([]);
      setLoading(false);
      return;
    }

    const projectCountByClient = new Map<string, number>();
    for (const project of projectsRes.data ?? []) {
      if (!project.client_id) continue;
      projectCountByClient.set(
        project.client_id,
        (projectCountByClient.get(project.client_id) ?? 0) + 1
      );
    }

    const outstandingByClient = new Map<string, number>();
    const activityByClient = new Map<string, number>();

    for (const invoice of invoicesRes.data ?? []) {
      if (!invoice.client_id) continue;
      if (["sent", "viewed", "overdue"].includes(invoice.status)) {
        outstandingByClient.set(
          invoice.client_id,
          (outstandingByClient.get(invoice.client_id) ?? 0) +
            Number(invoice.total || 0)
        );
      }
      const stamp = invoice.paid_at || invoice.sent_at || invoice.updated_at;
      if (stamp) {
        const ts = new Date(stamp).getTime();
        activityByClient.set(
          invoice.client_id,
          Math.max(activityByClient.get(invoice.client_id) ?? 0, ts)
        );
      }
    }

    const billedEntryIds = new Set(
      (billedLinesRes.data ?? [])
        .map((row) => row.time_entry_id)
        .filter((id): id is string => Boolean(id))
    );

    const unbilledMinutesByClient = new Map<string, number>();
    for (const entry of timeEntriesRes.data ?? []) {
      if (!entry.client_id) continue;
      const stamp = entry.updated_at || entry.ended_at || entry.started_at;
      if (stamp) {
        const ts = new Date(stamp).getTime();
        activityByClient.set(
          entry.client_id,
          Math.max(activityByClient.get(entry.client_id) ?? 0, ts)
        );
      }

      if (!entry.billable || !entry.ended_at || billedEntryIds.has(entry.id)) {
        continue;
      }
      unbilledMinutesByClient.set(
        entry.client_id,
        (unbilledMinutesByClient.get(entry.client_id) ?? 0) +
          Number(entry.duration_minutes || 0)
      );
    }

    const rows: ClientRow[] = (clientsRes.data ?? []).map((client) => {
      const lastFromRelated = activityByClient.get(client.id) ?? 0;
      const updated = new Date(client.updated_at).getTime();
      const created = new Date(client.created_at).getTime();
      const lastActivityAt = new Date(
        Math.max(lastFromRelated, updated, created)
      ).toISOString();

      return {
        id: client.id,
        name: client.name,
        company: client.company || client.name,
        email: client.email || "",
        projects: projectCountByClient.get(client.id) ?? 0,
        outstanding: outstandingByClient.get(client.id) ?? 0,
        unbilledMinutes: unbilledMinutesByClient.get(client.id) ?? 0,
        status: client.status,
        lastActivityAt,
      };
    });

    setClients(rows);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (profileLoading) return;
    void loadClients();
  }, [profileLoading, loadClients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((client) => {
      if (filter !== "all" && client.status !== filter) return false;
      if (!q) return true;
      return (
        client.name.toLowerCase().includes(q) ||
        client.company.toLowerCase().includes(q) ||
        client.email.toLowerCase().includes(q)
      );
    });
  }, [clients, search, filter]);

  const activeCount = clients.filter((c) => c.status === "active").length;
  const outstandingTotal = clients.reduce((sum, c) => sum + c.outstanding, 0);
  const unbilledMinutesTotal = clients.reduce(
    (sum, c) => sum + c.unbilledMinutes,
    0
  );

  async function handleCreate(values: ClientFormValues, logoFile: File | null) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("You need to be signed in to create a client.");
    }

    let orgId = organizationId;
    if (!orgId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("active_organization_id")
        .eq("id", user.id)
        .maybeSingle();
      orgId = profile?.active_organization_id ?? null;
    }
    if (!orgId) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      orgId = membership?.organization_id ?? null;
    }

    if (!orgId) {
      throw new Error("No workspace found. Try signing out and back in.");
    }

    const { data, error: insertError } = await supabase
      .from("clients")
      .insert({
        organization_id: orgId,
        name: values.name,
        company: values.company || null,
        email: values.email || null,
        phone: values.phone || null,
        website: values.website || null,
        status: values.status,
        notes: values.notes || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    if (!data) {
      throw new Error("Client was not created. Please try again.");
    }

    if (logoFile) {
      await uploadClientLogo({
        organizationId: orgId,
        clientId: data.id,
        file: logoFile,
      });
    }

    setModalOpen(false);
    setError(null);
    await loadClients();
  }

  return (
    <main className="w-full px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="flex justify-between items-start mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Clients
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            People and companies you bill, track time for, and send proposals to.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn-primary px-5 py-2.5 rounded-full text-sm flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New client
        </button>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600">{error}</p>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Clients"
          value={loading ? "—" : String(clients.length)}
        />
        <StatCard
          label="Active"
          value={loading ? "—" : String(activeCount)}
          hint="With open work"
        />
        <StatCard
          label="Outstanding"
          value={loading ? "—" : formatMoney(outstandingTotal, currency)}
          hint="Across invoices"
        />
        <StatCard
          label="Unbilled"
          value={loading ? "—" : formatHoursShort(unbilledMinutesTotal)}
          hint="Ready to invoice"
        />
      </div>

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="relative w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-line rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["idle", "Idle"],
              ["prospect", "Prospects"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                filter === key
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-gray-400 font-medium">
              <tr className="border-b border-line">
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th className="px-6 py-3 font-medium">Projects</th>
                <th className="px-6 py-3 font-medium">Outstanding</th>
                <th className="px-6 py-3 font-medium">Unbilled</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Activity</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <p className="text-sm text-gray-400">Loading clients…</p>
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((client) => {
                  const company = displayCompany(client);
                  return (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/clients/${client.id}`)}
                      className="border-b border-line last:border-0 hover:bg-[#FAFBFC] transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center text-[12px] font-bold shrink-0">
                            {company.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {company}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5 truncate">
                              {client.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {client.email ? (
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{client.email}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-gray-700">
                          <FolderKanban className="w-3.5 h-3.5 text-gray-400" />
                          {client.projects}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {formatMoney(client.outstanding, currency)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-gray-700">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {formatHoursShort(client.unbilledMinutes)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-[12px] font-medium capitalize ${STATUS_STYLES[client.status]}`}
                        >
                          {client.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <span className="text-gray-400">
                            {formatRelativeActivity(client.lastActivityAt)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Building2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">
                      {clients.length === 0
                        ? "No clients yet"
                        : "No clients found"}
                    </p>
                    <p className="text-[13px] text-gray-400 mt-1">
                      {clients.length === 0
                        ? "Add your first client to get started."
                        : "Try another search, or add a new client."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <ClientFormModal
          mode="create"
          onClose={() => setModalOpen(false)}
          onSave={handleCreate}
        />
      )}
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
      {hint && <p className="text-[13px] text-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
}
