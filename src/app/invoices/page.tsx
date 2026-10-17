"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  FileSpreadsheet,
  X,
  ChevronDown,
  Check,
  Building2,
  Send,
  CheckCircle2,
  MoreHorizontal,
  ExternalLink,
  Ban,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { MenuSelect } from "@/components/MenuSelect";
import { FancySelect } from "@/components/onboarding/FancySelect";
import { nanoid } from "nanoid";
import {
  addDaysISO,
  formatInvoiceMoney,
  todayISODate,
} from "@/lib/invoices/totals";
import {
  firstRecurrenceAt,
  isMonthInterval,
  isWeekInterval,
  RECURRENCE_INTERVAL_OPTIONS,
  WEEKDAY_OPTIONS,
  type InvoiceRecurrenceInterval,
} from "@/lib/invoices/recurrence";
import { unlockTimeEntriesForInvoice } from "@/lib/invoices/unbilled";
import type { Enums } from "@/types/database";
import {
  ModalOverlay,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";

type InvoiceStatus = Enums<"invoice_status">;

type ClientOption = {
  id: string;
  name: string;
  company: string | null;
};

type InvoiceRow = {
  id: string;
  number: string | null;
  total: number;
  currency: string;
  status: InvoiceStatus;
  dueDate: string | null;
  issueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  clientId: string | null;
  clientName: string;
  clientCompany: string | null;
};

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "SEK", label: "SEK (kr)" },
] as const;

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-[#EFF6FF] text-[#2563EB]",
  viewed: "bg-[#F5F3FF] text-violet-700",
  paid: "bg-[#F3FAF6] text-emerald-700",
  overdue: "bg-[#FEF2F2] text-red-700",
  void: "bg-gray-100 text-gray-500",
};

function statusLabel(status: InvoiceStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clientLabel(client: Pick<ClientOption, "name" | "company">) {
  return client.company?.trim() || client.name;
}

export default function InvoicesPage() {
  return (
    <Suspense
      fallback={
        <main className="w-full px-4 md:px-8 pt-10 pb-8 max-w-7xl mx-auto text-sm text-gray-500">
          Loading invoices…
        </main>
      }
    >
      <InvoicesPageInner />
    </Suspense>
  );
}

function InvoicesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    organizationId,
    organizationCurrency,
    userId,
    loading: profileLoading,
  } = useProfile();

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [preselectClientId, setPreselectClientId] = useState<string | null>(
    null
  );
  const [sentBanner, setSentBanner] = useState<{
    to: string;
    number: string;
  } | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setPreselectClientId(searchParams.get("clientId"));
      setModalOpen(true);
      router.replace("/invoices", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (searchParams.get("sent") !== "1") return;
    setSentBanner({
      to: searchParams.get("to") || "",
      number: searchParams.get("number") || "Invoice",
    });
    router.replace("/invoices", { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (!sentBanner) return;
    const timer = window.setTimeout(() => setSentBanner(null), 3000);
    return () => window.clearTimeout(timer);
  }, [sentBanner]);

  async function voidInvoice(invoice: InvoiceRow) {
    if (!organizationId) return;
    if (
      !window.confirm(
        "Void this invoice? Clients will no longer be able to pay it."
      )
    ) {
      return;
    }
    setActionBusyId(invoice.id);
    setError(null);
    const supabase = createClient();
    try {
      await unlockTimeEntriesForInvoice(supabase, {
        organizationId,
        invoiceId: invoice.id,
      });
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          status: "void",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("organization_id", organizationId);
      if (updateError) throw updateError;
      await supabase.rpc("cancel_invoice_reminders", {
        p_invoice_id: invoice.id,
      });
      await supabase.from("invoice_events").insert({
        organization_id: organizationId,
        invoice_id: invoice.id,
        event_type: "voided",
        actor_type: "freelancer",
        metadata: {},
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not void invoice.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function deleteInvoice(invoice: InvoiceRow) {
    if (!organizationId) return;
    if (
      !window.confirm("Delete this draft invoice? This cannot be undone easily.")
    ) {
      return;
    }
    setActionBusyId(invoice.id);
    setError(null);
    const supabase = createClient();
    try {
      await unlockTimeEntriesForInvoice(supabase, {
        organizationId,
        invoiceId: invoice.id,
      });
      const { error: updateError } = await supabase
        .from("invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", invoice.id)
        .eq("organization_id", organizationId);
      if (updateError) throw updateError;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete invoice.");
    } finally {
      setActionBusyId(null);
    }
  }

  const load = useCallback(async () => {
    if (!organizationId) {
      setInvoices([]);
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [invoicesRes, clientsRes] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, number, total, currency, status, due_date, issue_date, sent_at, paid_at, client_id, clients(id, name, company)"
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
      supabase
        .from("clients")
        .select("id, name, company")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
    ]);

    if (clientsRes.error) {
      setError(clientsRes.error.message);
    } else {
      setClients(clientsRes.data ?? []);
    }

    if (invoicesRes.error) {
      setError(invoicesRes.error.message);
      setInvoices([]);
    } else {
      setInvoices(
        (invoicesRes.data ?? []).map((row) => {
          const client = row.clients as
            | { id: string; name: string; company: string | null }
            | null
            | undefined;
          return {
            id: row.id,
            number: row.number,
            total: Number(row.total || 0),
            currency: row.currency || organizationCurrency || "USD",
            status: row.status,
            dueDate: row.due_date,
            issueDate: row.issue_date,
            sentAt: row.sent_at,
            paidAt: row.paid_at,
            clientId: row.client_id,
            clientName: client?.name || "No client",
            clientCompany: client?.company ?? null,
          };
        })
      );
    }

    setLoading(false);
  }, [organizationId, organizationCurrency]);

  useEffect(() => {
    if (profileLoading) return;
    void load();
  }, [profileLoading, load]);

  const clientFilterOptions = useMemo(
    () => [
      { value: "all", label: "All clients" },
      ...clients.map((client) => ({
        value: client.id,
        label: clientLabel(client),
      })),
    ],
    [clients]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
      if (clientFilter !== "all" && invoice.clientId !== clientFilter) return false;
      if (!q) return true;
      return (
        (invoice.number || "").toLowerCase().includes(q) ||
        invoice.clientName.toLowerCase().includes(q) ||
        (invoice.clientCompany?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [invoices, search, statusFilter, clientFilter]);

  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const currency = organizationCurrency || "USD";

    const outstanding = invoices
      .filter((i) => ["sent", "viewed", "overdue"].includes(i.status))
      .reduce((sum, i) => sum + i.total, 0);
    const overdue = invoices
      .filter((i) => i.status === "overdue")
      .reduce((sum, i) => sum + i.total, 0);
    const paidThisMonth = invoices
      .filter(
        (i) =>
          i.status === "paid" &&
          i.paidAt &&
          new Date(i.paidAt) >= monthStart
      )
      .reduce((sum, i) => sum + i.total, 0);
    const drafts = invoices.filter((i) => i.status === "draft").length;

    return {
      outstanding: formatInvoiceMoney(outstanding, currency),
      overdue: formatInvoiceMoney(overdue, currency),
      paidThisMonth: formatInvoiceMoney(paidThisMonth, currency),
      drafts: String(drafts),
    };
  }, [invoices, organizationCurrency]);

  return (
    <main className="w-full px-4 md:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      {sentBanner && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-[0_16px_40px_rgba(16,24,40,0.16)]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 pr-1">
              <p className="text-sm font-medium text-gray-900">
                Invoice sent
              </p>
              <p className="text-[13px] text-gray-500 truncate">
                <span className="font-medium text-gray-700">
                  {sentBanner.number}
                </span>
                {sentBanner.to
                  ? ` emailed to ${sentBanner.to}`
                  : " was emailed to your client"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setSentBanner(null)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight">
            Invoices
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Draft, send, and track what clients owe you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn-primary px-5 py-2.5 rounded-full text-sm flex items-center gap-2 self-start"
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </button>
      </div>

      {error && <p className="mb-4 text-[13px] text-red-600">{error}</p>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <StatCard label="Outstanding" value={loading ? "—" : stats.outstanding} accent="bg-[#FFF9D6]" />
        <StatCard label="Overdue" value={loading ? "—" : stats.overdue} accent="bg-[#FEF2F2]" />
        <StatCard label="Paid" value={loading ? "—" : stats.paidThisMonth} hint="This month" accent="bg-[#F3FAF6]" />
        <StatCard label="Drafts" value={loading ? "—" : stats.drafts} accent="bg-white" />
      </div>

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoices..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-line rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
          <div className="w-full sm:w-56">
            <FancySelect
              value={clientFilter}
              onChange={setClientFilter}
              options={clientFilterOptions}
              searchable
              searchPlaceholder="Search clients…"
              placeholder="All clients"
            />
          </div>
          <MenuSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All" },
              { value: "draft", label: "Draft" },
              { value: "sent", label: "Sent" },
              { value: "viewed", label: "Viewed" },
              { value: "paid", label: "Paid" },
              { value: "overdue", label: "Overdue" },
              { value: "void", label: "Void" },
            ]}
            className="w-full sm:w-44"
          />
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-gray-400 font-medium">
              <tr className="border-b border-line">
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Invoice</th>
                <th className="px-6 py-3 font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Due</th>
                <th className="px-6 py-3 font-medium text-right w-14">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-400">
                    Loading invoices…
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((invoice) => (
                  <tr
                    key={invoice.id}
                    onClick={() => router.push(`/invoices/${invoice.id}/edit`)}
                    className="border-b border-line last:border-0 hover:bg-[#FAFBFC] transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">
                        {invoice.clientCompany || invoice.clientName}
                      </div>
                      {invoice.clientCompany && (
                        <div className="text-[12px] text-gray-400 mt-0.5">
                          {invoice.clientName}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {invoice.number || "Draft"}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {formatInvoiceMoney(invoice.total, invoice.currency)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex text-[12px] font-semibold rounded-full px-2.5 py-1 ${STATUS_STYLES[invoice.status]}`}
                      >
                        {statusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatDate(invoice.dueDate)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <InvoiceActionsMenu
                        status={invoice.status}
                        busy={actionBusyId === invoice.id}
                        onOpen={() =>
                          router.push(`/invoices/${invoice.id}/edit`)
                        }
                        onSendAgain={() =>
                          router.push(`/invoices/${invoice.id}/edit?send=1`)
                        }
                        onVoid={() => void voidInvoice(invoice)}
                        onDelete={() => void deleteInvoice(invoice)}
                      />
                    </td>
                  </tr>
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <FileSpreadsheet className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">
                      {invoices.length === 0 ? "No invoices yet" : "No invoices found"}
                    </p>
                    <p className="text-[13px] text-gray-400 mt-1">
                      {invoices.length === 0
                        ? "Create your first invoice to get paid."
                        : "Try another search or status filter."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <CreateInvoiceModal
          clients={clients}
          defaultCurrency={organizationCurrency || "USD"}
          organizationId={organizationId}
          userId={userId}
          initialClientId={preselectClientId}
          onClose={() => {
            setModalOpen(false);
            setPreselectClientId(null);
          }}
          onCreated={(id) => {
            setModalOpen(false);
            setPreselectClientId(null);
            router.push(
              `/invoices/${id}/edit${preselectClientId ? "?addUnbilled=1" : ""}`
            );
          }}
          onClientsChanged={() => void load()}
        />
      )}
    </main>
  );
}

function InvoiceActionsMenu({
  status,
  busy,
  onOpen,
  onSendAgain,
  onVoid,
  onDelete,
}: {
  status: InvoiceStatus;
  busy?: boolean;
  onOpen: () => void;
  onSendAgain: () => void;
  onVoid: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const isDraft = status === "draft";
  const canResend =
    status === "sent" || status === "viewed" || status === "overdue";
  const canVoid = canResend;

  return (
    <div
      ref={menuRef}
      className="relative inline-flex justify-end"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Invoice actions"
        disabled={busy}
        onClick={() => setMenuOpen((open) => !open)}
        className={`p-2 rounded-lg border transition-colors disabled:opacity-50 ${
          menuOpen
            ? "border-gray-300 bg-gray-50 text-gray-900"
            : "border-transparent text-gray-400 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-200"
        }`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-[200px] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_12px_40px_rgba(16,24,40,0.14)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onOpen();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
          >
            <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
            Open
          </button>
          {canResend && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onSendAgain();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
            >
              <Send className="w-4 h-4 text-[#2563EB] shrink-0" />
              Send again
            </button>
          )}
          {canVoid && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onVoid();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
            >
              <Ban className="w-4 h-4 text-amber-600 shrink-0" />
              Void
            </button>
          )}
          {isDraft && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = "bg-white",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line ${accent} px-5 py-4`}>
      <div className="text-[13px] font-medium text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 mt-1 tracking-tight">
        {value}
      </div>
      {hint && <div className="text-[12px] text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

function CreateInvoiceModal({
  clients,
  defaultCurrency,
  organizationId,
  userId,
  initialClientId,
  onClose,
  onCreated,
  onClientsChanged,
}: {
  clients: ClientOption[];
  defaultCurrency: string;
  organizationId: string | null;
  userId: string | null;
  initialClientId?: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
  onClientsChanged: () => void;
}) {
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(
    () =>
      (initialClientId &&
        clients.find((client) => client.id === initialClientId)) ||
      null
  );
  const [currency, setCurrency] = useState(defaultCurrency);
  const [dueInDays, setDueInDays] = useState("14");
  const [isRetainer, setIsRetainer] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] =
    useState<InvoiceRecurrenceInterval>("monthly");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState(1);
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState(1);
  const [creatingClient, setCreatingClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate() {
    if (!organizationId || !selectedClient) {
      setFormError("Select a client to continue.");
      return;
    }

    setSaving(true);
    setFormError(null);
    const supabase = createClient();
    const issueDate = todayISODate();
    const days = Math.max(0, Number(dueInDays) || 0);

    const { data: orgTax } = await supabase
      .from("organizations")
      .select(
        "default_tax_enabled, default_tax_rate, default_prices_include_tax, tax_id"
      )
      .eq("id", organizationId)
      .maybeSingle();

    const taxEnabled = Boolean(orgTax?.default_tax_enabled);
    const taxRate = Number(orgTax?.default_tax_rate || 0);
    const pricesIncludeTax = Boolean(orgTax?.default_prices_include_tax);

    const recurrencePayload = isRetainer
      ? {
          recurrence_enabled: true,
          recurrence_interval: recurrenceInterval,
          recurrence_weekday: isWeekInterval(recurrenceInterval)
            ? recurrenceWeekday
            : null,
          recurrence_day_of_month: isMonthInterval(recurrenceInterval)
            ? recurrenceDayOfMonth
            : null,
          // Activated on first send — next_at set then.
          recurrence_next_at: null as string | null,
        }
      : {
          recurrence_enabled: false,
          recurrence_interval: null,
          recurrence_weekday: null,
          recurrence_day_of_month: null,
          recurrence_next_at: null as string | null,
        };

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        organization_id: organizationId,
        client_id: selectedClient.id,
        number: null,
        status: "draft",
        currency,
        issue_date: issueDate,
        due_date: addDaysISO(issueDate, days),
        created_by: userId,
        subtotal: 0,
        tax_total: 0,
        total: 0,
        payment_token: nanoid(24),
        // When org tax is on, enable all tax-related invoice options by default.
        tax_enabled: taxEnabled,
        tax_rate: taxEnabled ? taxRate : 0,
        prices_include_tax: taxEnabled ? pricesIncludeTax : false,
        show_tax_id: taxEnabled,
        tax_id: taxEnabled ? orgTax?.tax_id || null : null,
        show_logo: true,
        ...recurrencePayload,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !data) {
      setFormError(error?.message || "Could not create invoice.");
      return;
    }

    onCreated(data.id);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className={modalPanelClass("max-w-[500px]")}>
        <div className={`${modalHeaderClass} border-b border-line`}>
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-gray-900">New invoice</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Pick a client, then build the document.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0">
          {formError && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {formError}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client *
            </label>
            <ClientSelectDropdown
              clients={clients}
              selected={selectedClient}
              onChange={setSelectedClient}
              onCreateNew={() => setCreatingClient(true)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency
              </label>
              <MenuSelect
                value={currency}
                onChange={setCurrency}
                options={CURRENCY_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Due in (days)
              </label>
              <input
                type="number"
                min={0}
                value={dueInDays}
                onChange={(e) => setDueInDays(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-line p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isRetainer}
                onChange={(e) => setIsRetainer(e.target.checked)}
                className="mt-1 rounded border-gray-300"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  Retainer / recurring invoice
                </span>
                <span className="block text-[12px] text-gray-500 mt-0.5">
                  After you send this invoice, we’ll auto-create and email the
                  next ones on your schedule.
                </span>
              </span>
            </label>

            {isRetainer && (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                    Interval
                  </label>
                  <select
                    value={recurrenceInterval}
                    onChange={(e) =>
                      setRecurrenceInterval(
                        e.target.value as InvoiceRecurrenceInterval
                      )
                    }
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                  >
                    {RECURRENCE_INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {isWeekInterval(recurrenceInterval) ? (
                  <div>
                    <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                      Day of week
                    </label>
                    <select
                      value={recurrenceWeekday}
                      onChange={(e) =>
                        setRecurrenceWeekday(Number(e.target.value))
                      }
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                    >
                      {WEEKDAY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                      Day of month
                    </label>
                    <select
                      value={recurrenceDayOfMonth}
                      onChange={(e) =>
                        setRecurrenceDayOfMonth(Number(e.target.value) || 1)
                      }
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <p className="text-[12px] text-gray-500">
                  Next automatic send after the first invoice:{" "}
                  {firstRecurrenceAt({
                    interval: recurrenceInterval,
                    weekday: recurrenceWeekday,
                    dayOfMonth: recurrenceDayOfMonth,
                  }).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line bg-[#FAFBFC] flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !selectedClient}
            onClick={() => void handleCreate()}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </div>

      {creatingClient && (
        <CreateClientModal
          organizationId={organizationId}
          onClose={() => setCreatingClient(false)}
          onSave={(client) => {
            setSelectedClient(client);
            setCreatingClient(false);
            onClientsChanged();
          }}
        />
      )}
    </ModalOverlay>
  );
}

function ClientSelectDropdown({
  clients,
  selected,
  onChange,
  onCreateNew,
}: {
  clients: ClientOption[];
  selected: ClientOption | null;
  onChange: (client: ClientOption) => void;
  onCreateNew: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none bg-white text-left hover:border-gray-300 transition-colors"
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? clientLabel(selected) : "Select a client..."}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full min-w-0 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-line overflow-hidden z-50">
          <div className="p-3 border-b border-gray-50 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
            <input
              type="text"
              autoFocus
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm outline-none placeholder-gray-400 font-medium"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto p-2 space-y-1">
            {filtered.map((client) => {
              const label = clientLabel(client);
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => {
                    onChange(client);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center font-bold text-xs shrink-0">
                      {label.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {label}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{client.name}</div>
                    </div>
                  </div>
                  {selected?.id === client.id && (
                    <Check className="w-4 h-4 text-[#2563EB] shrink-0" />
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-sm text-gray-500">No clients found.</div>
            )}
          </div>
          <div className="p-2 border-t border-gray-50 bg-gray-50/50">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onCreateNew();
              }}
              className="w-full flex items-center gap-2 p-2.5 text-sm font-medium text-[#2563EB] hover:bg-blue-50 rounded-xl"
            >
              <Plus className="w-4 h-4" />
              Create new client
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateClientModal({
  organizationId,
  onClose,
  onSave,
}: {
  organizationId: string | null;
  onClose: () => void;
  onSave: (client: ClientOption) => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim() || !organizationId) return;
    setSaving(true);
    setFormError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("clients")
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        company: company.trim() || null,
        email: email.trim() || null,
        status: "prospect",
        created_by: user?.id ?? null,
      })
      .select("id, name, company")
      .single();

    setSaving(false);
    if (error || !data) {
      setFormError(error?.message || "Could not create client.");
      return;
    }
    onSave(data);
  }

  return (
    <ModalOverlay onClose={onClose} zClass="z-[90]">
      <div className={modalPanelClass("max-w-[500px]")}>
        <div className={`${modalHeaderClass} border-b border-line`}>
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Add New Client</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0">
          {formError && <p className="text-[13px] text-red-600">{formError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Primary Contact Name *
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Name
            </label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4 border-t border-line bg-[#FAFBFC] flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void handleSave()}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save client"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
