"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  FileText,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  ChevronRight,
  DollarSign,
  ChevronDown,
  Check,
  Building2,
  Sparkles,
  PenTool,
  UploadCloud,
  Send,
  MoreHorizontal,
  FolderKanban,
  Receipt,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { MenuSelect } from "@/components/MenuSelect";
import { ConvertToProjectModal } from "@/components/ConvertToProjectModal";
import { asProposalContent } from "@/lib/proposals/content";
import {
  billingTypeFromProposalContent,
  type ProjectBillingType,
} from "@/lib/projects/billing";
import {
  addDaysISO,
  lineAmount,
  todayISODate,
} from "@/lib/invoices/totals";
import type { Enums, Json } from "@/types/database";
import {
  ModalOverlay,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";

type ProposalStatus = Enums<"proposal_status">;

type ClientOption = {
  id: string;
  name: string;
  company: string | null;
};

type ProposalRowData = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  status: ProposalStatus;
  sentAt: string | null;
  updatedAt: string;
  clientId: string | null;
  clientName: string;
  clientCompany: string | null;
  projectId: string | null;
  pricingType: ProjectBillingType;
  content: unknown;
};

const CATEGORY_OPTIONS = [
  { value: "web_design", label: "Web Design" },
  { value: "development", label: "Development" },
  { value: "marketing", label: "Marketing" },
  { value: "consulting", label: "Consulting" },
  { value: "other", label: "Other" },
] as const;

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "SEK", label: "SEK (kr)" },
] as const;

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

function formatSentDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function statusLabel(status: ProposalStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function actionForStatus(status: ProposalStatus) {
  switch (status) {
    case "draft":
      return "Edit";
    case "sent":
    case "viewed":
      return "Follow up";
    case "accepted":
      return "Actions";
    case "declined":
      return "View";
    default:
      return "Open";
  }
}

export default function ProposalsPage() {
  return (
    <Suspense
      fallback={
        <main className="w-full px-4 md:px-8 pt-10 pb-8 max-w-7xl mx-auto">
          <p className="text-sm text-gray-400">Loading…</p>
        </main>
      }
    >
      <ProposalsPageInner />
    </Suspense>
  );
}

function ProposalsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    organizationId,
    organizationCurrency,
    userId,
    loading: profileLoading,
  } = useProfile();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [proposals, setProposals] = useState<ProposalRowData[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [convertProposal, setConvertProposal] =
    useState<ProposalRowData | null>(null);
  const [creatingInvoiceId, setCreatingInvoiceId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProposalStatus>("all");
  const [sentFeedback, setSentFeedback] = useState<{
    to: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setIsModalOpen(true);
      router.replace("/proposals", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (searchParams.get("sent") !== "1") return;
    setSentFeedback({
      to: searchParams.get("to") || "",
      title: searchParams.get("title") || "Proposal",
    });
    router.replace("/proposals", { scroll: false });
  }, [searchParams, router]);

  const load = useCallback(async () => {
    if (!organizationId) {
      setProposals([]);
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [proposalsRes, clientsRes] = await Promise.all([
      supabase
        .from("proposals")
        .select(
          "id, title, amount, currency, status, sent_at, updated_at, client_id, project_id, content"
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

    const clientRows = clientsRes.data ?? [];
    if (!clientsRes.error) {
      setClients(clientRows);
    }

    const clientsById = new Map(clientRows.map((c) => [c.id, c]));

    if (proposalsRes.error) {
      setError(proposalsRes.error.message);
      setProposals([]);
    } else {
      const rows: ProposalRowData[] = (proposalsRes.data ?? []).map((row) => {
        const client = row.client_id
          ? clientsById.get(row.client_id)
          : undefined;
        return {
          id: row.id,
          title: row.title,
          amount: Number(row.amount || 0),
          currency: row.currency || organizationCurrency || "USD",
          status: row.status,
          sentAt: row.sent_at,
          updatedAt: row.updated_at,
          clientId: row.client_id,
          clientName: client?.name || "No client",
          clientCompany: client?.company ?? null,
          projectId: row.project_id,
          pricingType: billingTypeFromProposalContent(row.content),
          content: row.content,
        };
      });
      setProposals(rows);
    }

    setLoading(false);
  }, [organizationId, organizationCurrency]);

  async function createInvoiceFromProposal(proposal: ProposalRowData) {
    if (!organizationId || !proposal.clientId) {
      setError("This proposal needs a client before creating an invoice.");
      return;
    }
    setCreatingInvoiceId(proposal.id);
    setError(null);
    const supabase = createClient();

    const { data: full, error: loadError } = await supabase
      .from("proposals")
      .select("id, title, amount, currency, content, client_id, project_id")
      .eq("id", proposal.id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (loadError || !full?.client_id) {
      setError(loadError?.message || "Could not load proposal.");
      setCreatingInvoiceId(null);
      return;
    }

    const content = asProposalContent(full.content);
    const rawLines = Array.isArray(content.lineItems) ? content.lineItems : [];
    const mappedLines = rawLines
      .map((raw, index) => {
        const item = raw as {
          name?: string;
          description?: string;
          qty?: number;
          quantity?: number;
          price?: number;
          unit_price?: number;
          unit?: string;
        };
        const quantity = Number(item.qty ?? item.quantity ?? 1) || 1;
        const unitPrice = Number(item.price ?? item.unit_price ?? 0) || 0;
        const unitRaw = String(item.unit || "").toLowerCase();
        const unit: "qty" | "hr" | "day" | "flat" =
          unitRaw === "hr" || unitRaw === "day" || unitRaw === "flat"
            ? unitRaw
            : "qty";
        const description =
          item.name?.trim() ||
          item.description?.trim() ||
          full.title ||
          "Line item";
        return {
          description,
          quantity,
          unit,
          unit_price: unitPrice,
          amount: lineAmount(quantity, unitPrice),
          position: index,
        };
      })
      .filter((line) => line.description);

    if (mappedLines.length === 0 && Number(full.amount || 0) > 0) {
      mappedLines.push({
        description: full.title || "Proposal work",
        quantity: 1,
        unit: "qty" as const,
        unit_price: Number(full.amount || 0),
        amount: Number(full.amount || 0),
        position: 0,
      });
    }

    const subtotal = mappedLines.reduce((sum, line) => sum + line.amount, 0);
    const issueDate = todayISODate();

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        organization_id: organizationId,
        client_id: full.client_id,
        project_id: full.project_id || null,
        proposal_id: full.id,
        number: null,
        status: "draft",
        currency: full.currency || organizationCurrency || "USD",
        issue_date: issueDate,
        due_date: addDaysISO(issueDate, 14),
        subtotal,
        tax_total: 0,
        total: subtotal,
        notes: `Created from proposal: ${full.title}`,
        created_by: userId,
      })
      .select("id")
      .single();

    if (invoiceError || !invoice) {
      setError(invoiceError?.message || "Could not create invoice.");
      setCreatingInvoiceId(null);
      return;
    }

    if (mappedLines.length > 0) {
      const { error: linesError } = await supabase
        .from("invoice_line_items")
        .insert(
          mappedLines.map((line) => ({
            ...line,
            organization_id: organizationId,
            invoice_id: invoice.id,
          }))
        );
      if (linesError) {
        setError(linesError.message);
        setCreatingInvoiceId(null);
        return;
      }
    }

    setCreatingInvoiceId(null);
    router.push(`/invoices/${invoice.id}/edit`);
  }

  useEffect(() => {
    if (profileLoading) return;
    void load();
  }, [profileLoading, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((proposal) => {
      if (statusFilter !== "all" && proposal.status !== statusFilter) return false;
      if (!q) return true;
      return (
        proposal.title.toLowerCase().includes(q) ||
        proposal.clientName.toLowerCase().includes(q) ||
        (proposal.clientCompany?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [proposals, search, statusFilter]);

  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const active = proposals.filter((p) =>
      ["draft", "sent", "viewed"].includes(p.status)
    ).length;
    const awaiting = proposals.filter((p) =>
      ["sent", "viewed"].includes(p.status)
    ).length;
    const acceptedThisMonth = proposals.filter(
      (p) =>
        p.status === "accepted" &&
        new Date(p.updatedAt) >= monthStart
    ).length;
    const accepted = proposals.filter((p) => p.status === "accepted").length;
    const declined = proposals.filter((p) => p.status === "declined").length;
    const decided = accepted + declined;
    const winRate = decided === 0 ? null : Math.round((accepted / decided) * 100);

    return { active, awaiting, acceptedThisMonth, winRate };
  }, [proposals]);

  return (
    <main className="w-full px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Proposals
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            From brief to acceptance — then deposit invoice.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="btn-primary px-5 py-2.5 rounded-full text-sm hidden md:inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Proposal
        </button>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600">{error}</p>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Active"
          value={loading ? "—" : String(stats.active)}
          accent="bg-[#F5F8FF]"
        />
        <StatCard
          label="Awaiting"
          value={loading ? "—" : String(stats.awaiting)}
          hint="Need follow-up"
          accent="bg-[#FFF9D6]"
        />
        <StatCard
          label="Accepted"
          value={loading ? "—" : String(stats.acceptedThisMonth)}
          hint="This month"
          accent="bg-[#F3FAF6]"
        />
        <StatCard
          label="Win rate"
          value={
            loading ? "—" : stats.winRate == null ? "—" : `${stats.winRate}%`
          }
          accent="bg-white"
        />
      </div>

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="relative w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search proposals..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-line rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              ["all", "All statuses"],
              ["draft", "Draft"],
              ["sent", "Sent"],
              ["viewed", "Viewed"],
              ["accepted", "Accepted"],
              ["declined", "Declined"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === key
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
                <th className="px-6 py-3 font-medium">Client / Project</th>
                <th className="px-6 py-3 font-medium">Value</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Sent</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-sm text-gray-400">
                    Loading proposals…
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((proposal) => (
                  <ProposalRow
                    key={proposal.id}
                    client={
                      proposal.clientCompany || proposal.clientName
                    }
                    project={proposal.title}
                    value={formatMoney(proposal.amount, proposal.currency)}
                    status={statusLabel(proposal.status)}
                    statusKey={proposal.status}
                    sentDate={formatSentDate(proposal.sentAt)}
                    action={actionForStatus(proposal.status)}
                    hasProject={Boolean(proposal.projectId)}
                    creatingInvoice={creatingInvoiceId === proposal.id}
                    onOpen={() =>
                      router.push(`/proposals/${proposal.id}/edit`)
                    }
                    onCreateProject={
                      proposal.status === "accepted" && !proposal.projectId
                        ? () => setConvertProposal(proposal)
                        : undefined
                    }
                    onViewProject={
                      proposal.status === "accepted" && proposal.projectId
                        ? () =>
                            router.push(
                              proposal.clientId
                                ? `/clients/${proposal.clientId}`
                                : "/tasks"
                            )
                        : undefined
                    }
                    onCreateInvoice={
                      proposal.status === "accepted"
                        ? () => void createInvoiceFromProposal(proposal)
                        : undefined
                    }
                  />
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">
                      {proposals.length === 0
                        ? "No proposals yet"
                        : "No proposals found"}
                    </p>
                    <p className="text-[13px] text-gray-400 mt-1">
                      {proposals.length === 0
                        ? "Create your first proposal to get started."
                        : "Try another search or status filter."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <CreateProposalModal
          clients={clients}
          defaultCurrency={organizationCurrency || "USD"}
          organizationId={organizationId}
          onClose={() => setIsModalOpen(false)}
          onCreated={(id) => {
            setIsModalOpen(false);
            router.push(`/proposals/${id}/template`);
          }}
          onClientsChanged={() => void load()}
        />
      )}

      {convertProposal && (
        <ConvertToProjectModal
          proposalId={convertProposal.id}
          proposalTitle={convertProposal.title}
          proposalAmount={convertProposal.amount}
          currency={convertProposal.currency}
          pricingType={convertProposal.pricingType}
          proposalContent={convertProposal.content}
          clientName={
            convertProposal.clientCompany || convertProposal.clientName
          }
          hasClient={Boolean(convertProposal.clientId)}
          onClose={() => setConvertProposal(null)}
          onConverted={() => {
            setConvertProposal(null);
            void load();
          }}
        />
      )}

      {sentFeedback && (
        <ModalOverlay onClose={() => setSentFeedback(null)}>
          <div className={`${modalPanelClass("max-w-[420px]")} px-5 sm:px-6 pt-8 pb-6 text-center`}>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mb-4">
              <Send className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
              Proposal sent
            </h2>
            <p className="text-[15px] text-gray-500 mt-2 leading-relaxed">
              <span className="font-medium text-gray-800">
                {sentFeedback.title}
              </span>
              {sentFeedback.to
                ? ` was emailed to ${sentFeedback.to}.`
                : " was emailed to your client."}
            </p>
            <p className="text-[13px] text-gray-400 mt-2">
              You’ll get an alert when they open, sign, or decline it.
            </p>
            <button
              type="button"
              onClick={() => setSentFeedback(null)}
              className="btn-primary mt-6 w-full px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </ModalOverlay>
      )}
    </main>
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
    <div className={`${accent} border border-line rounded-[1.25rem] p-5`}>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      <h3 className="text-2xl font-semibold tracking-tight text-gray-900 mt-2">
        {value}
      </h3>
      {hint && <p className="text-xs mt-1.5 text-gray-400">{hint}</p>}
    </div>
  );
}

function ProposalRow({
  client,
  project,
  value,
  status,
  statusKey,
  sentDate,
  action,
  hasProject,
  creatingInvoice,
  onOpen,
  onCreateProject,
  onViewProject,
  onCreateInvoice,
}: {
  client: string;
  project: string;
  value: string;
  status: string;
  statusKey: ProposalStatus;
  sentDate: string;
  action: string;
  hasProject?: boolean;
  creatingInvoice?: boolean;
  onOpen: () => void;
  onCreateProject?: () => void;
  onViewProject?: () => void;
  onCreateInvoice?: () => void;
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

  const getStatusBadge = (key: ProposalStatus, label: string) => {
    switch (key) {
      case "accepted":
        return (
          <Badge
            label={label}
            type="green"
            icon={<CheckCircle2 className="w-3 h-3" />}
          />
        );
      case "viewed":
        return (
          <Badge label={label} type="blue" icon={<Eye className="w-3 h-3" />} />
        );
      case "sent":
        return (
          <Badge label={label} type="blue" icon={<Eye className="w-3 h-3" />} />
        );
      case "draft":
        return (
          <Badge
            label={label}
            type="gray"
            icon={<FileText className="w-3 h-3" />}
          />
        );
      case "declined":
        return (
          <Badge
            label={label}
            type="red"
            icon={<XCircle className="w-3 h-3" />}
          />
        );
      default:
        return <Badge label={label} type="gray" />;
    }
  };

  const showAcceptedMenu =
    statusKey === "accepted" &&
    Boolean(onCreateProject || onViewProject || onCreateInvoice);

  return (
    <tr
      onClick={onOpen}
      className="border-b border-line last:border-0 hover:bg-[#FAFBFC] transition-colors cursor-pointer"
    >
      <td className="px-6 py-4">
        <div className="font-medium text-gray-900">{client}</div>
        <div className="text-xs text-gray-400 mt-0.5">{project}</div>
      </td>
      <td className="px-6 py-4 font-medium">{value}</td>
      <td className="px-6 py-4">{getStatusBadge(statusKey, status)}</td>
      <td className="px-6 py-4 text-gray-400">{sentDate}</td>
      <td className="px-6 py-4 text-right">
        {showAcceptedMenu ? (
          <div
            ref={menuRef}
            className="relative inline-flex justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Proposal actions"
              disabled={creatingInvoice}
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
                className="absolute right-0 z-50 mt-1.5 w-[220px] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_12px_40px_rgba(16,24,40,0.14)]"
              >
                {hasProject && onViewProject ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onViewProject();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                  >
                    <FolderKanban className="w-4 h-4 text-emerald-600 shrink-0" />
                    View project
                  </button>
                ) : onCreateProject ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onCreateProject();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                  >
                    <FolderKanban className="w-4 h-4 text-emerald-600 shrink-0" />
                    Create project
                  </button>
                ) : null}
                {onCreateInvoice ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={creatingInvoice}
                    onClick={() => {
                      setMenuOpen(false);
                      onCreateInvoice();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Receipt className="w-4 h-4 text-blue-600 shrink-0" />
                    {creatingInvoice ? "Creating invoice…" : "Create invoice"}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : action === "Follow up" ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="text-sm font-medium text-[#2563EB] hover:text-blue-700 transition-colors"
          >
            Follow up
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            {action}
          </button>
        )}
      </td>
    </tr>
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

  const displayName = selected
    ? selected.company || selected.name
    : null;

  return (
    <div className="relative min-w-0 max-w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-w-0 max-w-full flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none bg-white text-left hover:border-gray-300 transition-colors"
      >
        <span
          className={`min-w-0 truncate ${
            displayName ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {displayName || "Select a client..."}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
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
            {filtered.length > 0 ? (
              filtered.map((client) => {
                const label = client.company || client.name;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => {
                      onChange(client);
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center font-bold text-xs shrink-0">
                        {label.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {label}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {client.name}
                        </div>
                      </div>
                    </div>
                    {selected?.id === client.id && (
                      <Check className="w-4 h-4 text-[#2563EB] shrink-0" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-sm text-gray-500">
                No clients found.
              </div>
            )}
          </div>

          <div className="p-2 border-t border-gray-50 bg-gray-50/50">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onCreateNew();
              }}
              className="w-full flex items-center gap-2 p-2.5 text-sm font-medium text-[#2563EB] hover:bg-blue-50 rounded-xl transition-colors"
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
    <ModalOverlay onClose={onClose} zClass="z-[70]">
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
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Primary Contact Name *
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Name (Optional)
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Acme Studio LLC"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@acmestudio.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          {formError && (
            <p className="text-[13px] text-red-600">{formError}</p>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line flex items-center justify-end bg-gray-50/50 gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!name.trim() || saving || !organizationId}
            className="btn-primary px-6 py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Client"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function Badge({
  label,
  type,
  icon,
}: {
  label: string;
  type: string;
  icon?: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    red: "bg-red-50 text-red-600",
    blue: "bg-[#EAF3FF] text-[#2563EB]",
    green: "bg-emerald-50 text-emerald-700",
    gray: "bg-gray-50 text-gray-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-0.5 ${styles[type] || styles.gray}`}
    >
      {icon}
      {label}
    </span>
  );
}

function CreateProposalModal({
  clients,
  defaultCurrency,
  organizationId,
  onClose,
  onCreated,
  onClientsChanged,
}: {
  clients: ClientOption[];
  defaultCurrency: string;
  organizationId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
  onClientsChanged: () => void;
}) {
  const [creationMode, setCreationMode] = useState<"scratch" | "ai">("scratch");
  const [pricingModel, setPricingModel] = useState<"Fixed" | "Hourly" | "Retainer">(
    "Fixed"
  );
  const [category, setCategory] =
    useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("web_design");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [clientOptions, setClientOptions] = useState(clients);
  const [aiText, setAiText] = useState("");
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setClientOptions(clients);
  }, [clients]);

  async function handleContinue() {
    if (!organizationId) {
      setFormError("No workspace found. Try signing out and back in.");
      return;
    }
    if (!selectedClient) {
      setFormError("Select a client to continue.");
      return;
    }
    if (creationMode === "scratch" && !title.trim()) {
      setFormError("Add a proposal title to continue.");
      return;
    }
    if (creationMode === "ai" && !aiText.trim() && !aiFile) {
      setFormError("Paste notes or upload a file so AI can write the proposal.");
      return;
    }

    setSaving(true);
    setFormError(null);

    if (creationMode === "ai") {
      try {
        const form = new FormData();
        form.set("notes", aiText);
        form.set("clientId", selectedClient.id);
        form.set("category", category);
        form.set("currency", currency);
        form.set("pricingHint", pricingModel.toLowerCase());
        form.set("create", "true");
        if (aiFile) form.set("file", aiFile);

        const res = await fetch("/api/proposals/generate", {
          method: "POST",
          body: form,
        });
        const json = await res.json().catch(() => ({}));
        setSaving(false);
        if (!res.ok) {
          setFormError(json.error || "Could not generate proposal with AI.");
          return;
        }
        if (!json.id) {
          setFormError("AI did not create a proposal. Try again.");
          return;
        }
        onCreated(String(json.id));
        return;
      } catch (err) {
        setSaving(false);
        setFormError(
          err instanceof Error ? err.message : "Could not generate proposal."
        );
        return;
      }
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const proposalTitle =
      title.trim() ||
      `${selectedClient.company || selectedClient.name} proposal`;
    const parsedAmount = Number(amount.replace(/,/g, ""));
    const content: Json = {
      meta: {
        pricingModel: pricingModel.toLowerCase(),
        category,
        creationMode,
      },
      blocks: [],
    };

    const { data, error } = await supabase
      .from("proposals")
      .insert({
        organization_id: organizationId,
        client_id: selectedClient.id,
        title: proposalTitle,
        amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
        currency,
        status: "draft",
        content,
        expires_at: new Date(
          Date.now() + 1000 * 60 * 60 * 24 * 14
        ).toISOString(),
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !data) {
      setFormError(error?.message || "Could not create proposal.");
      return;
    }

    onCreated(data.id);
  }

  return (
    <ModalOverlay onClose={onClose} zClass="z-[60]">
      <div className={modalPanelClass("max-w-[600px]")}>
        <div className={`${modalHeaderClass} border-b border-line`}>
          <h2 className="text-xl font-semibold text-gray-900 min-w-0">
            Create New Proposal
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-6 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
          <div className="flex p-1 bg-gray-100 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setCreationMode("scratch")}
              className={`flex-1 min-w-0 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                creationMode === "scratch"
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <PenTool className="w-4 h-4 shrink-0" />
              <span className="truncate">From scratch</span>
            </button>
            <button
              type="button"
              onClick={() => setCreationMode("ai")}
              className={`flex-1 min-w-0 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                creationMode === "ai"
                  ? "bg-white shadow-sm text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="truncate">With AI</span>
            </button>
          </div>

          {creationMode === "ai" ? (
            <div className="space-y-6">
              <div className="relative z-10">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client
                </label>
                <ClientSelectDropdown
                  clients={clientOptions}
                  selected={selectedClient}
                  onChange={setSelectedClient}
                  onCreateNew={() => setIsClientModalOpen(true)}
                />
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 relative z-0">
                <div className="flex items-start gap-3 text-sm text-gray-600 mb-4">
                  <Sparkles className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <p>
                    Upload a brief or paste notes. AI writes the full proposal
                    copy (summary, scope, timeline, pricing, terms). You pick a
                    template look next, then refine in the editor.
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setAiFile(file);
                    e.target.value = "";
                  }}
                />

                <div
                  className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                    aiFile
                      ? "border-blue-200 bg-white"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-500">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  {aiFile ? (
                    <>
                      <div className="text-sm font-medium text-gray-900 mb-1 truncate px-2">
                        {aiFile.name}
                      </div>
                      <div className="flex items-center justify-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="font-medium text-blue-600 hover:text-blue-700"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiFile(null)}
                          className="font-medium text-gray-500 hover:text-gray-700"
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-gray-900 mb-1">
                        Upload notes or a brief
                      </div>
                      <div className="text-xs text-gray-500 mb-3">
                        .txt, .md, .docx, or .pdf · up to 8MB
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Choose file
                      </button>
                    </>
                  )}
                </div>

                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="Or paste client emails, call notes, or project requirements here..."
                  className="w-full mt-4 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none min-h-[120px]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 relative z-10 min-w-0">
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client
                  </label>
                  <ClientSelectDropdown
                    clients={clientOptions}
                    selected={selectedClient}
                    onChange={setSelectedClient}
                    onCreateNew={() => setIsClientModalOpen(true)}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project Category
                  </label>
                  <MenuSelect
                    value={category}
                    options={[...CATEGORY_OPTIONS]}
                    onChange={setCategory}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Proposal Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Website Redesign & Build"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Pricing Model
                </label>
                <div className="flex p-1 bg-gray-100 rounded-xl">
                  {(["Fixed", "Hourly", "Retainer"] as const).map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => setPricingModel(model)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                        pricingModel === model
                          ? "bg-white shadow-sm text-gray-900"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 min-w-0">
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Currency
                  </label>
                  <MenuSelect
                    value={currency}
                    options={[...CURRENCY_OPTIONS]}
                    onChange={setCurrency}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estimated Value (Optional)
                  </label>
                  <div className="relative min-w-0">
                    <DollarSign className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full min-w-0 max-w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {formError && (
            <p className="text-[13px] text-red-600">{formError}</p>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end bg-gray-50/50 shrink-0 gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleContinue()}
            className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              creationMode === "ai" ? (
                "Writing with AI… (~20s)"
              ) : (
                "Creating…"
              )
            ) : creationMode === "ai" ? (
              <>
                Generate Proposal <Sparkles className="w-4 h-4 fill-current" />
              </>
            ) : (
              <>
                Continue <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {isClientModalOpen && (
        <CreateClientModal
          organizationId={organizationId}
          onClose={() => setIsClientModalOpen(false)}
          onSave={(client) => {
            setClientOptions((prev) => [client, ...prev]);
            setSelectedClient(client);
            setIsClientModalOpen(false);
            onClientsChanged();
          }}
        />
      )}
    </ModalOverlay>
  );
}
