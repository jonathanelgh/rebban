"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  FileText,
  FolderKanban,
  Receipt,
  CreditCard,
  Clock,
  StickyNote,
  Check,
  ExternalLink,
  Globe,
  Pencil,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  ClientFormModal,
  uploadClientLogo,
  type ClientFormValues,
} from "@/components/ClientFormModal";
import { ClientStatusDropdown } from "@/components/ClientStatusDropdown";
import type { Enums, Tables } from "@/types/database";

type ClientStatus = Enums<"client_status">;
type TabId =
  | "overview"
  | "projects"
  | "proposals"
  | "invoices"
  | "payments"
  | "time"
  | "notes";

type Client = Tables<"clients">;
type Project = Tables<"projects">;
type Proposal = Tables<"proposals">;
type Invoice = Tables<"invoices">;
type TimeEntry = Tables<"time_entries">;

const STATUS_STYLES: Record<ClientStatus, string> = {
  active: "bg-[#F3FAF6] text-emerald-700",
  idle: "bg-gray-100 text-gray-600",
  prospect: "bg-[#EFF6FF] text-[#2563EB]",
};

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "proposals", label: "Proposals", icon: FileText },
  { id: "invoices", label: "Invoices", icon: Receipt },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "time", label: "Time", icon: Clock },
  { id: "notes", label: "Notes", icon: StickyNote },
];

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

function formatHours(minutes: number) {
  const hours = minutes / 60;
  if (hours === 0) return "0h";
  if (hours < 10) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours)}h`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function displayWebsite(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

async function resolveLogoUrl(
  supabase: ReturnType<typeof createClient>,
  pathOrUrl: string | null
) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const { data, error } = await supabase.storage
    .from("org-assets")
    .createSignedUrl(pathOrUrl, 60 * 60 * 24);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = typeof params.id === "string" ? params.id : "";
  const { organizationCurrency, loading: profileLoading } = useProfile();
  const currency = organizationCurrency || "USD";

  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [billedEntryIds, setBilledEntryIds] = useState<Set<string>>(new Set());

  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: clientRow, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .is("deleted_at", null)
      .maybeSingle();

    if (clientError || !clientRow) {
      setError(clientError?.message || "Client not found.");
      setClient(null);
      setLoading(false);
      return;
    }

    const [projectsRes, proposalsRes, invoicesRes, timeRes, billedRes] =
      await Promise.all([
        supabase
          .from("projects")
          .select("*")
          .eq("client_id", clientId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false }),
        supabase
          .from("proposals")
          .select("*")
          .eq("client_id", clientId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false }),
        supabase
          .from("invoices")
          .select("*")
          .eq("client_id", clientId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false }),
        supabase
          .from("time_entries")
          .select("*")
          .eq("client_id", clientId)
          .is("deleted_at", null)
          .order("started_at", { ascending: false }),
        supabase
          .from("invoice_line_items")
          .select("time_entry_id")
          .eq("organization_id", clientRow.organization_id)
          .not("time_entry_id", "is", null),
      ]);

    const signedLogo = await resolveLogoUrl(supabase, clientRow.logo_url);

    setClient(clientRow);
    setLogoUrl(signedLogo);
    setNotesDraft(clientRow.notes ?? "");
    setProjects(projectsRes.data ?? []);
    setProposals(proposalsRes.data ?? []);
    setInvoices(invoicesRes.data ?? []);
    setTimeEntries(timeRes.data ?? []);
    setBilledEntryIds(
      new Set(
        (billedRes.data ?? [])
          .map((row) => row.time_entry_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    if (profileLoading) return;
    void load();
  }, [profileLoading, load]);

  const outstandingInvoices = useMemo(
    () =>
      invoices.filter((inv) =>
        ["sent", "viewed", "overdue"].includes(inv.status)
      ),
    [invoices]
  );

  const payments = useMemo(
    () => invoices.filter((inv) => inv.status === "paid"),
    [invoices]
  );

  const unbilledEntries = useMemo(
    () =>
      timeEntries.filter(
        (entry) =>
          entry.billable &&
          entry.ended_at &&
          !billedEntryIds.has(entry.id)
      ),
    [timeEntries, billedEntryIds]
  );

  const stats = useMemo(() => {
    const outstanding = outstandingInvoices.reduce(
      (sum, inv) => sum + Number(inv.total || 0),
      0
    );
    const collected = payments.reduce(
      (sum, inv) => sum + Number(inv.total || 0),
      0
    );
    const openProposalAmount = proposals
      .filter((p) => ["sent", "viewed", "draft"].includes(p.status))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const unbilledMinutes = unbilledEntries.reduce(
      (sum, e) => sum + Number(e.duration_minutes || 0),
      0
    );
    return { outstanding, collected, openProposalAmount, unbilledMinutes };
  }, [outstandingInvoices, payments, proposals, unbilledEntries]);

  async function handleStatusChange(status: ClientStatus) {
    if (!client || client.status === status) return;
    setSavingStatus(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("clients")
      .update({ status })
      .eq("id", client.id);

    if (updateError) {
      setError(updateError.message);
      setSavingStatus(false);
      return;
    }

    setClient({ ...client, status });
    setSavingStatus(false);
  }

  async function handleSaveNotes() {
    if (!client) return;
    setSavingNotes(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("clients")
      .update({ notes: notesDraft.trim() || null })
      .eq("id", client.id);

    if (updateError) {
      setError(updateError.message);
      setSavingNotes(false);
      return;
    }

    setClient({ ...client, notes: notesDraft.trim() || null });
    setSavingNotes(false);
    setNotesSaved(true);
    window.setTimeout(() => setNotesSaved(false), 1800);
  }

  async function handleEditSave(
    values: ClientFormValues,
    logoFile: File | null
  ) {
    if (!client) return;
    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        name: values.name,
        company: values.company || null,
        email: values.email || null,
        phone: values.phone || null,
        website: values.website || null,
        status: values.status,
        notes: values.notes || null,
      })
      .eq("id", client.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (logoFile) {
      await uploadClientLogo({
        organizationId: client.organization_id,
        clientId: client.id,
        file: logoFile,
      });
    }

    setEditOpen(false);
    setNotesDraft(values.notes);
    await load();
  }

  const company = client?.company || client?.name || "Client";

  if (loading) {
    return (
      <main className="w-full px-8 pt-10 pb-8 pr-36 max-w-7xl mx-auto">
        <p className="text-sm text-gray-400">Loading client…</p>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="w-full px-8 pt-10 pb-8 pr-36 max-w-7xl mx-auto">
        <button
          type="button"
          onClick={() => router.push("/clients")}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to clients
        </button>
        <p className="text-sm font-medium text-gray-700">
          {error || "Client not found."}
        </p>
      </main>
    );
  }

  return (
    <main className="w-full px-8 pt-10 pb-8 pr-36 max-w-7xl mx-auto">
      <button
        type="button"
        onClick={() => router.push("/clients")}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to clients
      </button>

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#2563EB] border border-line overflow-hidden flex items-center justify-center text-xl font-bold shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${company} logo`}
                className="w-full h-full object-contain p-1.5"
              />
            ) : (
              company.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight truncate">
              {company}
            </h1>
            <p className="text-gray-500 mt-1 text-[15px]">{client.name}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[13px] text-gray-500">
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {client.email}
                </a>
              )}
              {client.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  {client.phone}
                </span>
              )}
              {client.website && (
                <a
                  href={client.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {displayWebsite(client.website)}
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-line bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit client
          </button>
          <ClientStatusDropdown
            value={client.status}
            disabled={savingStatus}
            onChange={(status) => void handleStatusChange(status)}
          />
        </div>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600">{error}</p>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Outstanding"
          value={formatMoney(stats.outstanding, currency)}
          hint={`${outstandingInvoices.length} open`}
        />
        <StatCard
          label="Collected"
          value={formatMoney(stats.collected, currency)}
          hint={`${payments.length} paid`}
        />
        <StatCard
          label="Open proposals"
          value={formatMoney(stats.openProposalAmount, currency)}
          hint={`${proposals.length} total`}
        />
        <StatCard
          label="Unbilled"
          value={formatHours(stats.unbilledMinutes)}
          hint="Ready to invoice"
        />
      </div>

      <div className="flex gap-1 overflow-x-auto mb-6 border-b border-line">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active
                  ? "border-[#2563EB] text-[#2563EB]"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Panel title="Recent activity">
              <OverviewActivity
                proposals={proposals}
                invoices={invoices}
                projects={projects}
                currency={currency}
              />
            </Panel>
          </div>
          <div className="space-y-6">
            <Panel title="Contact">
              <dl className="space-y-3 text-sm">
                <InfoRow label="Contact" value={client.name} />
                <InfoRow label="Company" value={client.company || "—"} />
                <InfoRow label="Email" value={client.email || "—"} />
                <InfoRow label="Phone" value={client.phone || "—"} />
                <InfoRow
                  label="Website"
                  value={
                    client.website ? (
                      <a
                        href={client.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#2563EB] hover:text-[#1d4ed8]"
                      >
                        {displayWebsite(client.website)}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <InfoRow
                  label="Status"
                  value={
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-[12px] font-medium capitalize ${STATUS_STYLES[client.status]}`}
                    >
                      {client.status}
                    </span>
                  }
                />
              </dl>
            </Panel>
            <Panel title="Notes preview">
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                {client.notes?.trim() || "No notes yet."}
              </p>
              <button
                type="button"
                onClick={() => setTab("notes")}
                className="mt-3 text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8]"
              >
                Edit notes
              </button>
            </Panel>
          </div>
        </div>
      )}

      {tab === "projects" && (
        <DataTable
          empty="No projects for this client yet."
          headers={["Project", "Status", "Budget", "Updated"]}
        >
          {projects.map((project) => (
            <tr key={project.id} className="border-b border-line last:border-0">
              <td className="px-6 py-4 font-medium text-gray-900">
                {project.name}
              </td>
              <td className="px-6 py-4 capitalize text-gray-600">
                {statusLabel(project.status)}
              </td>
              <td className="px-6 py-4 text-gray-700">
                {project.budget_amount != null
                  ? formatMoney(Number(project.budget_amount), currency)
                  : project.budget_hours != null
                    ? `${project.budget_hours}h`
                    : "—"}
              </td>
              <td className="px-6 py-4 text-gray-500">
                {formatDate(project.updated_at)}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {tab === "proposals" && (
        <DataTable
          empty="No proposals for this client yet."
          headers={["Proposal", "Value", "Status", "Sent", ""]}
        >
          {proposals.map((proposal) => (
            <tr key={proposal.id} className="border-b border-line last:border-0">
              <td className="px-6 py-4 font-medium text-gray-900">
                {proposal.title}
              </td>
              <td className="px-6 py-4 text-gray-900">
                {formatMoney(Number(proposal.amount || 0), proposal.currency || currency)}
              </td>
              <td className="px-6 py-4 capitalize text-gray-600">
                {statusLabel(proposal.status)}
              </td>
              <td className="px-6 py-4 text-gray-500">
                {formatDate(proposal.sent_at)}
              </td>
              <td className="px-6 py-4 text-right">
                <Link
                  href={`/proposals/${proposal.id}/edit`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8]"
                >
                  Open <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {tab === "invoices" && (
        <DataTable
          empty="No invoices for this client yet."
          headers={["Invoice", "Amount", "Status", "Due", "Issued"]}
        >
          {invoices.map((invoice) => (
            <tr
              key={invoice.id}
              className="border-b border-line last:border-0 hover:bg-[#FAFBFC] cursor-pointer transition-colors"
              onClick={() => router.push(`/invoices/${invoice.id}/edit`)}
            >
              <td className="px-6 py-4 font-medium text-gray-900">
                {invoice.number || "Draft invoice"}
              </td>
              <td className="px-6 py-4 text-gray-900">
                {formatMoney(Number(invoice.total || 0), invoice.currency || currency)}
              </td>
              <td className="px-6 py-4 capitalize text-gray-600">
                {statusLabel(invoice.status)}
              </td>
              <td className="px-6 py-4 text-gray-500">
                {formatDate(invoice.due_date)}
              </td>
              <td className="px-6 py-4 text-gray-500">
                {formatDate(invoice.issue_date || invoice.created_at)}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {tab === "payments" && (
        <DataTable
          empty="No payments recorded yet."
          headers={["Invoice", "Amount", "Paid on", "Status"]}
        >
          {payments.map((invoice) => (
            <tr key={invoice.id} className="border-b border-line last:border-0">
              <td className="px-6 py-4 font-medium text-gray-900">
                {invoice.number || "Invoice"}
              </td>
              <td className="px-6 py-4 text-gray-900">
                {formatMoney(Number(invoice.total || 0), invoice.currency || currency)}
              </td>
              <td className="px-6 py-4 text-gray-500">
                {formatDate(invoice.paid_at)}
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex px-2.5 py-1 rounded-full text-[12px] font-medium bg-[#F3FAF6] text-emerald-700">
                  Paid
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {tab === "time" && (
        <DataTable
          empty="No time tracked for this client yet."
          headers={["Description", "Duration", "Rate", "Billable", "Date"]}
        >
          {timeEntries.map((entry) => {
            const minutes = Number(entry.duration_minutes || 0);
            const billed = billedEntryIds.has(entry.id);
            return (
              <tr key={entry.id} className="border-b border-line last:border-0">
                <td className="px-6 py-4 font-medium text-gray-900">
                  {entry.description || "Untitled entry"}
                </td>
                <td className="px-6 py-4 text-gray-700">
                  {entry.ended_at ? formatHours(minutes) : "Running"}
                </td>
                <td className="px-6 py-4 text-gray-700">
                  {entry.hourly_rate != null
                    ? formatMoney(Number(entry.hourly_rate), currency)
                    : "—"}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {!entry.billable
                    ? "Non-billable"
                    : billed
                      ? "Invoiced"
                      : entry.ended_at
                        ? "Unbilled"
                        : "In progress"}
                </td>
                <td className="px-6 py-4 text-gray-500">
                  {formatDate(entry.started_at)}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {tab === "notes" && (
        <div className="surface-panel p-7 max-w-3xl">
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
            Client notes
          </h2>
          <p className="text-sm text-gray-500 mt-1 mb-5">
            Private notes about this client — only visible to your workspace.
          </p>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={10}
            placeholder="Preferences, context, follow-ups, working agreements…"
            className="w-full border border-line rounded-xl px-3.5 py-3 text-sm text-gray-900 bg-white outline-none focus:border-gray-300 resize-y min-h-[220px]"
          />
          <div className="mt-4 flex items-center justify-end gap-3">
            {notesSaved && (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
                <Check className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
            <button
              type="button"
              disabled={savingNotes}
              onClick={() => void handleSaveNotes()}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              {savingNotes ? "Saving…" : "Save notes"}
            </button>
          </div>
        </div>
      )}

      {editOpen && (
        <ClientFormModal
          mode="edit"
          initial={{
            id: client.id,
            organizationId: client.organization_id,
            name: client.name,
            company: client.company ?? "",
            email: client.email ?? "",
            phone: client.phone ?? "",
            website: client.website ?? "",
            status: client.status,
            notes: client.notes ?? "",
            logoUrl,
            logoPath: client.logo_url,
          }}
          onClose={() => setEditOpen(false)}
          onSave={handleEditSave}
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

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-panel p-6">
      <h2 className="text-sm font-semibold text-gray-900 tracking-tight mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-gray-400 shrink-0">{label}</dt>
      <dd className="text-gray-900 text-right">{value}</dd>
    </div>
  );
}

function DataTable({
  headers,
  empty,
  children,
}: {
  headers: string[];
  empty: string;
  children: React.ReactNode;
}) {
  const rows = React.Children.toArray(children);
  return (
    <div className="surface-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-gray-400 font-medium">
            <tr className="border-b border-line">
              {headers.map((header) => (
                <th key={header || "action"} className="px-6 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-700">
            {rows.length > 0 ? (
              children
            ) : (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-6 py-16 text-center text-sm text-gray-400"
                >
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OverviewActivity({
  proposals,
  invoices,
  projects,
  currency,
}: {
  proposals: Proposal[];
  invoices: Invoice[];
  projects: Project[];
  currency: string;
}) {
  const items = [
    ...proposals.slice(0, 3).map((p) => ({
      id: `proposal-${p.id}`,
      title: p.title,
      meta: `Proposal · ${statusLabel(p.status)} · ${formatMoney(Number(p.amount || 0), p.currency || currency)}`,
      at: p.updated_at,
    })),
    ...invoices.slice(0, 3).map((inv) => ({
      id: `invoice-${inv.id}`,
      title: inv.number || "Invoice",
      meta: `Invoice · ${statusLabel(inv.status)} · ${formatMoney(Number(inv.total || 0), inv.currency || currency)}`,
      at: inv.updated_at,
    })),
    ...projects.slice(0, 3).map((project) => ({
      id: `project-${project.id}`,
      title: project.name,
      meta: `Project · ${statusLabel(project.status)}`,
      at: project.updated_at,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Activity will show up here as you add projects, proposals, and invoices.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <div className="font-medium text-[14px] text-gray-900">{item.title}</div>
          <div className="text-[13px] text-gray-500 mt-0.5 capitalize">
            {item.meta}
          </div>
          <div className="text-[12px] text-gray-400 mt-1">
            {formatDate(item.at)}
          </div>
        </li>
      ))}
    </ul>
  );
}
