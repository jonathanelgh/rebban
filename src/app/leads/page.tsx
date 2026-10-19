"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  MoreHorizontal,
  UserPlus,
  FileText,
  Trash2,
  FormInput,
  Mail,
  Phone,
  Users,
  ChevronDown,
  Check,
  Eye,
  Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/leads/forms";
import {
  FALLBACK_LEAD_SOURCES,
  leadSourceLabel,
  normalizeLeadSourceRow,
  resolveLeadSource,
  type LeadSourceRow,
} from "@/lib/leads/sources";
import {
  LeadSourceBadge,
  LeadSourceSelect,
} from "@/components/leads/LeadSourceSelect";
import { LeadSourceIcon } from "@/components/leads/LeadSourceIcons";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";
import { SendLeadEmailModal } from "@/components/leads/SendLeadEmailModal";

type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  status: LeadStatus;
  source: string;
  form_id: string | null;
  form_name: string | null;
  converted_client_id: string | null;
  proposal_id: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: "bg-[#EFF6FF] text-[#2563EB]",
  contacted: "bg-amber-50 text-amber-700",
  proposal_sent: "bg-violet-50 text-violet-700",
  won: "bg-[#F3FAF6] text-emerald-700",
  lost: "bg-gray-100 text-gray-600",
};

function formatRelativeActivity(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
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

function leadDisplayName(lead: Pick<LeadRow, "company" | "name">) {
  return lead.company || lead.name;
}

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <main className="w-full px-4 md:px-8 pt-10 pb-8 max-w-7xl mx-auto">
          <p className="text-sm text-gray-400">Loading…</p>
        </main>
      }
    >
      <LeadsPageInner />
    </Suspense>
  );
}

function LeadsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organizationId, userId, loading: profileLoading } = useProfile();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const [sourceMenuId, setSourceMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailsLeadId, setDetailsLeadId] = useState<string | null>(null);
  const [emailLeadId, setEmailLeadId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newSource, setNewSource] = useState("manual");
  const [sources, setSources] = useState<LeadSourceRow[]>(FALLBACK_LEAD_SOURCES);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const [leadsRes, sourcesRes] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, name, email, company, phone, website, notes, status, source, form_id, converted_client_id, proposal_id, created_at, lead_forms(name)"
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_sources")
        .select("id, name, icon, image_url, keywords, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);
    if (leadsRes.error) setError(leadsRes.error.message);
    if (sourcesRes.data?.length) {
      setSources(sourcesRes.data.map(normalizeLeadSourceRow));
    }
    const rows = ((leadsRes.data || []) as Array<{
      id: string;
      name: string;
      email: string | null;
      company: string | null;
      phone: string | null;
      website: string | null;
      notes: string | null;
      status: LeadStatus;
      source: string;
      form_id: string | null;
      converted_client_id: string | null;
      proposal_id: string | null;
      created_at: string;
      lead_forms: { name: string } | { name: string }[] | null;
    }>).map((row) => {
      const formRel = Array.isArray(row.lead_forms)
        ? row.lead_forms[0]
        : row.lead_forms;
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        company: row.company,
        phone: row.phone,
        website: row.website,
        notes: row.notes,
        status: row.status,
        source: row.source,
        form_id: row.form_id,
        form_name: formRel?.name || null,
        converted_client_id: row.converted_client_id,
        proposal_id: row.proposal_id,
        created_at: row.created_at,
      } satisfies LeadRow;
    });
    setLeads(rows);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (profileLoading) return;
    void load();
  }, [profileLoading, load]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowNew(true);
      router.replace("/leads", { scroll: false });
    }
  }, [searchParams, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (filter !== "all" && lead.status !== filter) return false;
      if (!q) return true;
      const sourceLabel = leadSourceLabel(sources, lead.source).toLowerCase();
      return (
        lead.name.toLowerCase().includes(q) ||
        (lead.email || "").toLowerCase().includes(q) ||
        (lead.company || "").toLowerCase().includes(q) ||
        (lead.phone || "").toLowerCase().includes(q) ||
        (lead.form_name || "").toLowerCase().includes(q) ||
        sourceLabel.includes(q) ||
        lead.source.toLowerCase().includes(q)
      );
    });
  }, [leads, search, filter, sources]);

  const newCount = leads.filter((l) => l.status === "new").length;
  const contactedCount = leads.filter((l) => l.status === "contacted").length;
  const wonCount = leads.filter((l) => l.status === "won").length;
  const detailsLead = useMemo(
    () => leads.find((lead) => lead.id === detailsLeadId) || null,
    [leads, detailsLeadId]
  );
  const emailLead = useMemo(
    () => leads.find((lead) => lead.id === emailLeadId) || null,
    [leads, emailLeadId]
  );

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId || !userId || !newName.trim()) return;
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("leads").insert({
      organization_id: organizationId,
      name: newName.trim(),
      email: newEmail.trim() || null,
      company: newCompany.trim() || null,
      notes: newNotes.trim() || null,
      source: newSource,
      status: "new",
      created_by: userId,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setShowNew(false);
    setNewName("");
    setNewEmail("");
    setNewCompany("");
    setNewNotes("");
    setNewSource("manual");
    await load();
  }

  async function updateStatus(id: string, status: LeadStatus) {
    setBusyId(id);
    setStatusMenuId(null);
    setSourceMenuId(null);
    setMenuOpenId(null);
    const supabase = createClient();
    await supabase.from("leads").update({ status }).eq("id", id);
    setBusyId(null);
    await load();
  }

  async function updateSource(id: string, source: string) {
    const lead = leads.find((row) => row.id === id);
    if (!lead || lead.form_id) return;
    setBusyId(id);
    setSourceMenuId(null);
    setStatusMenuId(null);
    setMenuOpenId(null);
    const supabase = createClient();
    await supabase.from("leads").update({ source }).eq("id", id);
    setBusyId(null);
    await load();
  }

  async function convertLead(id: string) {
    setBusyId(id);
    setMenuOpenId(null);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "prospect" }),
      });
      const json = (await res.json()) as { error?: string; clientId?: string };
      if (!res.ok) throw new Error(json.error || "Convert failed");
      if (json.clientId) router.push(`/clients/${json.clientId}`);
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Convert failed");
    } finally {
      setBusyId(null);
    }
  }

  async function createProposalFromLead(lead: LeadRow) {
    setBusyId(lead.id);
    setMenuOpenId(null);
    setError(null);
    try {
      let clientId = lead.converted_client_id;
      if (!clientId) {
        const res = await fetch(`/api/leads/${lead.id}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "prospect" }),
        });
        const json = (await res.json()) as {
          error?: string;
          clientId?: string;
        };
        if (!res.ok) throw new Error(json.error || "Convert failed");
        clientId = json.clientId || null;
      }
      if (!clientId) throw new Error("Could not create client for lead.");

      const supabase = createClient();
      await supabase
        .from("leads")
        .update({ status: "proposal_sent" })
        .eq("id", lead.id);

      router.push(
        `/proposals?new=1&clientId=${encodeURIComponent(clientId)}&leadId=${encodeURIComponent(lead.id)}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function softDelete(id: string) {
    setBusyId(id);
    setMenuOpenId(null);
    const supabase = createClient();
    await supabase
      .from("leads")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    setBusyId(null);
    await load();
  }

  const statusFilters = [
    ["all", "All"],
    ["new", "New"],
    ["contacted", "Contacted"],
    ["proposal_sent", "Proposal sent"],
    ["won", "Won"],
    ["lost", "Lost"],
  ] as const;

  return (
    <main className="w-full px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="flex justify-between items-start mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Leads
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Capture inquiries, then turn them into clients or proposals.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Link
            href="/leads/forms"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-gray-700 border border-line bg-white hover:bg-gray-50 cursor-pointer"
          >
            <FormInput className="w-4 h-4" />
            Forms
          </Link>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="btn-primary px-5 py-2.5 rounded-full text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add lead
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 text-[13px] text-red-600">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Leads"
          value={loading ? "—" : String(leads.length)}
        />
        <StatCard
          label="New"
          value={loading ? "—" : String(newCount)}
          hint="Waiting on you"
        />
        <StatCard
          label="Contacted"
          value={loading ? "—" : String(contactedCount)}
          hint="In conversation"
        />
        <StatCard
          label="Won"
          value={loading ? "—" : String(wonCount)}
          hint="Converted"
        />
      </div>

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="relative w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-line rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
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
                <th className="px-6 py-3 font-medium">Lead</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th className="px-6 py-3 font-medium">Source</th>
                <th className="px-6 py-3 font-medium">Form</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <p className="text-sm text-gray-400">Loading leads…</p>
                  </td>
                </tr>
              ) : null}

              {!loading
                ? filtered.map((lead) => {
                    const title = leadDisplayName(lead);
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setDetailsLeadId(lead.id)}
                        className="border-b border-line last:border-0 hover:bg-[#FAFBFC] transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center text-[12px] font-bold shrink-0">
                              {title.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 truncate">
                                {title}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5 truncate">
                                {lead.company ? lead.name : lead.email || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {lead.email || lead.phone ? (
                            <div className="space-y-1 min-w-0">
                              {lead.email ? (
                                <div className="flex items-center gap-1.5 text-gray-600">
                                  <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                  <span className="truncate">{lead.email}</span>
                                </div>
                              ) : null}
                              {lead.phone ? (
                                <div className="flex items-center gap-1.5 text-gray-500 text-[13px]">
                                  <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                  <span className="truncate">{lead.phone}</span>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lead.form_id ? (
                            <LeadSourceBadge
                              source={lead.source}
                              sources={sources}
                            />
                          ) : (
                            <LeadSourceMenu
                              source={lead.source}
                              sources={sources}
                              open={sourceMenuId === lead.id}
                              busy={busyId === lead.id}
                              onOpenChange={(next) => {
                                setSourceMenuId(next ? lead.id : null);
                                if (next) {
                                  setStatusMenuId(null);
                                  setMenuOpenId(null);
                                }
                              }}
                              onChange={(source) =>
                                void updateSource(lead.id, source)
                              }
                            />
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {lead.form_name ? (
                            <span className="text-gray-700 truncate block max-w-[160px]">
                              {lead.form_name}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <LeadStatusMenu
                            status={lead.status}
                            open={statusMenuId === lead.id}
                            busy={busyId === lead.id}
                            onOpenChange={(next) => {
                              setStatusMenuId(next ? lead.id : null);
                              if (next) {
                                setSourceMenuId(null);
                                setMenuOpenId(null);
                              }
                            }}
                            onChange={(status) =>
                              void updateStatus(lead.id, status)
                            }
                          />
                        </td>
                        <td className="px-6 py-4 text-gray-400 whitespace-nowrap">
                          {formatRelativeActivity(lead.created_at)}
                        </td>
                        <td
                          className="px-4 py-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <LeadRowMenu
                            open={menuOpenId === lead.id}
                            busy={busyId === lead.id}
                            lead={lead}
                            onOpenChange={(next) => {
                              setMenuOpenId(next ? lead.id : null);
                              if (next) {
                                setStatusMenuId(null);
                                setSourceMenuId(null);
                              }
                            }}
                            onView={() => setDetailsLeadId(lead.id)}
                            onEmail={() => setEmailLeadId(lead.id)}
                            onConvert={() => void convertLead(lead.id)}
                            onViewClient={() => {
                              if (lead.converted_client_id) {
                                router.push(
                                  `/clients/${lead.converted_client_id}`
                                );
                              }
                            }}
                            onCreateProposal={() =>
                              void createProposalFromLead(lead)
                            }
                            onDelete={() => void softDelete(lead.id)}
                          />
                        </td>
                      </tr>
                    );
                  })
                : null}

              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">
                      {leads.length === 0 ? "No leads yet" : "No leads found"}
                    </p>
                    <p className="text-[13px] text-gray-400 mt-1">
                      {leads.length === 0 ? (
                        <>
                          Add a lead manually, or{" "}
                          <Link
                            href="/leads/forms"
                            className="text-[#2563EB] hover:underline"
                          >
                            create a form
                          </Link>{" "}
                          to capture them from your website.
                        </>
                      ) : (
                        "Try another search or filter."
                      )}
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {detailsLead ? (
        <LeadDetailsModal
          lead={detailsLead}
          sources={sources}
          onClose={() => setDetailsLeadId(null)}
          onUpdated={() => void load()}
          onConvert={() => {
            setDetailsLeadId(null);
            void convertLead(detailsLead.id);
          }}
          onCreateProposal={() => {
            setDetailsLeadId(null);
            void createProposalFromLead(detailsLead);
          }}
        />
      ) : null}

      {emailLead ? (
        <SendLeadEmailModal
          leadId={emailLead.id}
          leadName={emailLead.company || emailLead.name}
          defaultTo={emailLead.email}
          fromForm={Boolean(emailLead.form_id)}
          onClose={() => setEmailLeadId(null)}
          onSent={() => {
            setEmailLeadId(null);
            void load();
          }}
        />
      ) : null}

      {showNew ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => {
              setShowNew(false);
              setNewSource("manual");
            }}
          />
          <form
            onSubmit={(e) => void handleCreateLead(e)}
            className="relative w-full max-w-md bg-white rounded-2xl border border-line p-6 shadow-xl space-y-4 overflow-visible"
          >
            <h2 className="text-lg font-semibold text-gray-900">Add lead</h2>
            <label className="block">
              <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                Name
              </span>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                Email
              </span>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                Company
              </span>
              <input
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
              />
            </label>
            <div className="block">
              <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                Source
              </span>
              <LeadSourceSelect
                value={newSource}
                onChange={setNewSource}
                sources={sources}
              />
            </div>
            <label className="block">
              <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                Notes
              </span>
              <textarea
                rows={3}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowNew(false);
                  setNewSource("manual");
                }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1d4ed8]"
              >
                Save lead
              </button>
            </div>
          </form>
        </div>
      ) : null}
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

function LeadSourceMenu({
  source,
  sources,
  open,
  busy,
  onOpenChange,
  onChange,
}: {
  source: string;
  sources: LeadSourceRow[];
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (source: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const meta = resolveLeadSource(sources, source);
  const options = sources.filter((row) => row.id !== "form");

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change lead source"
        onClick={() => onOpenChange(!open)}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LeadSourceIcon source={meta} className="w-3.5 h-3.5" />
        {meta.name}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 z-50 mt-1.5 w-56 max-h-64 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-[0_8px_24px_rgba(16,24,40,0.12)]"
        >
          {options.map((option) => {
            const selected = option.id === source;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={busy}
                onClick={() => {
                  onOpenChange(false);
                  if (!selected) onChange(option.id);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-[#FAFBFC] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <LeadSourceIcon source={option} className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{option.name}</span>
                </span>
                {selected ? (
                  <Check className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LeadStatusMenu({
  status,
  open,
  busy,
  onOpenChange,
  onChange,
}: {
  status: LeadStatus;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (status: LeadStatus) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change lead status"
        onClick={() => onOpenChange(!open)}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-opacity cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 ${STATUS_STYLES[status]}`}
      >
        {LEAD_STATUS_LABELS[status]}
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 z-50 mt-1.5 w-44 rounded-xl border border-line bg-white py-1 shadow-[0_8px_24px_rgba(16,24,40,0.12)]"
        >
          {LEAD_STATUSES.map((option) => {
            const selected = option === status;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={busy}
                onClick={() => {
                  onOpenChange(false);
                  if (!selected) onChange(option);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-[#FAFBFC] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[option]}`}
                >
                  {LEAD_STATUS_LABELS[option]}
                </span>
                {selected ? (
                  <Check className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LeadRowMenu({
  open,
  busy,
  lead,
  onOpenChange,
  onView,
  onEmail,
  onConvert,
  onViewClient,
  onCreateProposal,
  onDelete,
}: {
  open: boolean;
  busy: boolean;
  lead: LeadRow;
  onOpenChange: (open: boolean) => void;
  onView: () => void;
  onEmail: () => void;
  onConvert: () => void;
  onViewClient: () => void;
  onCreateProposal: () => void;
  onDelete: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false);
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (confirmingDelete) {
          setConfirmingDelete(false);
          return;
        }
        onOpenChange(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange, confirmingDelete]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Lead actions"
        onClick={() => onOpenChange(!open)}
        className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? "bg-gray-100 text-gray-800"
            : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute right-0 z-50 mt-1.5 rounded-xl border border-line bg-white shadow-[0_8px_24px_rgba(16,24,40,0.12)] ${
            confirmingDelete ? "w-44 py-2 px-2" : "w-52 py-1"
          }`}
        >
          {confirmingDelete ? (
            <div className="space-y-2">
              <p className="px-1 pt-0.5 text-[12px] leading-snug text-gray-600">
                Delete this lead?
              </p>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => onDelete()}
                className="flex w-full items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-red-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
                className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  onOpenChange(false);
                  onView();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-[#FAFBFC] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Eye className="w-3.5 h-3.5 text-gray-400" />
                View details
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  onOpenChange(false);
                  onEmail();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-[#FAFBFC] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 text-gray-400" />
                Send email
              </button>
              {!lead.converted_client_id ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    onOpenChange(false);
                    onConvert();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-[#FAFBFC] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5 text-gray-400" />
                  Convert to client
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    onOpenChange(false);
                    onViewClient();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-[#FAFBFC] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5 text-gray-400" />
                  View client
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  onOpenChange(false);
                  onCreateProposal();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-[#FAFBFC] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                Create proposal
              </button>
              <div className="border-t border-line my-1" />
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-red-600 hover:bg-red-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
