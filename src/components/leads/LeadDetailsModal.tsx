"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  Mail,
  Phone,
  Building2,
  Globe,
  StickyNote,
  Activity,
  FileText,
  UserPlus,
  ExternalLink,
  FormInput,
  Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ModalOverlay,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/leads/forms";
import {
  resolveLeadSource,
  type LeadSourceRow,
} from "@/lib/leads/sources";
import { LeadSourceIcon } from "@/components/leads/LeadSourceIcons";
import { LeadSourceSelect } from "@/components/leads/LeadSourceSelect";
import { SendLeadEmailModal } from "@/components/leads/SendLeadEmailModal";

export type LeadDetailsLead = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  website?: string | null;
  notes: string | null;
  status: LeadStatus;
  source: string;
  form_id: string | null;
  form_name: string | null;
  converted_client_id: string | null;
  proposal_id?: string | null;
  created_at: string;
};

type TabId = "overview" | "notes" | "activity";

type SubmissionRow = {
  id: string;
  created_at: string;
  payload: Record<string, unknown>;
  form_id: string;
};

type ProposalSummary = {
  id: string;
  title: string;
  status: string;
  amount: number;
  currency: string;
};

const TABS: {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "activity", label: "Activity", icon: Activity },
];

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: "bg-[#EFF6FF] text-[#2563EB]",
  contacted: "bg-amber-50 text-amber-700",
  proposal_sent: "bg-violet-50 text-violet-700",
  won: "bg-[#F3FAF6] text-emerald-700",
  lost: "bg-gray-100 text-gray-600",
};

const inputClass =
  "w-full border border-line rounded-xl px-3.5 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-gray-300 placeholder:text-gray-400";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayWebsite(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function payloadEntries(payload: Record<string, unknown>) {
  return Object.entries(payload).filter(([, value]) => {
    if (value == null) return false;
    if (typeof value === "string" && !value.trim()) return false;
    return true;
  });
}

export function LeadDetailsModal({
  lead: initialLead,
  sources,
  onClose,
  onUpdated,
  onConvert,
  onCreateProposal,
}: {
  lead: LeadDetailsLead;
  sources: LeadSourceRow[];
  onClose: () => void;
  onUpdated: () => void;
  onConvert: () => void;
  onCreateProposal: () => void;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const [lead, setLead] = useState(initialLead);
  const [name, setName] = useState(initialLead.name);
  const [email, setEmail] = useState(initialLead.email || "");
  const [phone, setPhone] = useState(initialLead.phone || "");
  const [company, setCompany] = useState(initialLead.company || "");
  const [website, setWebsite] = useState(initialLead.website || "");
  const [status, setStatus] = useState<LeadStatus>(initialLead.status);
  const [source, setSource] = useState(initialLead.source);
  const [notes, setNotes] = useState(initialLead.notes || "");
  const [saving, setSaving] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);
  const [overviewSaved, setOverviewSaved] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [proposal, setProposal] = useState<ProposalSummary | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(true);
  const [emailOpen, setEmailOpen] = useState(false);

  const fromForm = Boolean(lead.form_id);
  const title = lead.company || lead.name;
  const sourceMeta = resolveLeadSource(sources, lead.source);

  const loadExtras = useCallback(async () => {
    setLoadingExtra(true);
    const supabase = createClient();
    const [{ data: leadData }, { data: submissionData }, { data: proposalData }] =
      await Promise.all([
        supabase
          .from("leads")
          .select(
            "id, name, email, company, phone, website, notes, status, source, form_id, converted_client_id, proposal_id, created_at, lead_forms(name)"
          )
          .eq("id", initialLead.id)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("lead_form_submissions")
          .select("id, created_at, payload, form_id")
          .eq("lead_id", initialLead.id)
          .order("created_at", { ascending: false })
          .limit(10),
        initialLead.proposal_id
          ? supabase
              .from("proposals")
              .select("id, title, status, amount, currency")
              .eq("id", initialLead.proposal_id)
              .is("deleted_at", null)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    if (leadData) {
      const formRel = Array.isArray(leadData.lead_forms)
        ? leadData.lead_forms[0]
        : leadData.lead_forms;
      const next: LeadDetailsLead = {
        id: leadData.id,
        name: leadData.name,
        email: leadData.email,
        company: leadData.company,
        phone: leadData.phone,
        website: leadData.website,
        notes: leadData.notes,
        status: leadData.status as LeadStatus,
        source: leadData.source,
        form_id: leadData.form_id,
        form_name: formRel?.name || initialLead.form_name,
        converted_client_id: leadData.converted_client_id,
        proposal_id: leadData.proposal_id,
        created_at: leadData.created_at,
      };
      setLead(next);
      setName(next.name);
      setEmail(next.email || "");
      setPhone(next.phone || "");
      setCompany(next.company || "");
      setWebsite(next.website || "");
      setStatus(next.status);
      setSource(next.source);
      setNotes(next.notes || "");

      if (next.proposal_id && !proposalData) {
        const { data: linked } = await supabase
          .from("proposals")
          .select("id, title, status, amount, currency")
          .eq("id", next.proposal_id)
          .is("deleted_at", null)
          .maybeSingle();
        if (linked) {
          setProposal({
            id: linked.id,
            title: linked.title,
            status: linked.status,
            amount: Number(linked.amount || 0),
            currency: linked.currency || "USD",
          });
        }
      }
    }

    setSubmissions(
      (submissionData || []).map((row) => ({
        id: row.id,
        created_at: row.created_at,
        form_id: row.form_id,
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {},
      }))
    );

    if (proposalData) {
      setProposal({
        id: proposalData.id,
        title: proposalData.title,
        status: proposalData.status,
        amount: Number(proposalData.amount || 0),
        currency: proposalData.currency || "USD",
      });
    }

    setLoadingExtra(false);
  }, [initialLead.id, initialLead.form_name, initialLead.proposal_id]);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  async function handleSaveOverview(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        website: website.trim() || null,
        status,
        source: fromForm ? lead.source : source,
      })
      .eq("id", lead.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setLead((prev) => ({
      ...prev,
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      company: company.trim() || null,
      website: website.trim() || null,
      status,
      source: fromForm ? prev.source : source,
    }));
    setOverviewSaved(true);
    window.setTimeout(() => setOverviewSaved(false), 1800);
    onUpdated();
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("leads")
      .update({ notes: notes.trim() || null })
      .eq("id", lead.id);
    setSavingNotes(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLead((prev) => ({ ...prev, notes: notes.trim() || null }));
    setNotesSaved(true);
    window.setTimeout(() => setNotesSaved(false), 1800);
    onUpdated();
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className={modalPanelClass(
          "max-w-[720px]",
          "max-sm:!max-h-[100dvh] max-sm:h-[100dvh] max-sm:rounded-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${modalHeaderClass} border-b border-line`}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center text-sm font-bold shrink-0">
              {title.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                {title}
              </h2>
              <p className="text-sm text-gray-500 truncate mt-0.5">
                {lead.company && lead.company !== lead.name
                  ? lead.name
                  : lead.email || "Lead details"}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-medium ${STATUS_STYLES[lead.status]}`}
                >
                  {LEAD_STATUS_LABELS[lead.status]}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  <LeadSourceIcon
                    source={sourceMeta}
                    className="w-3.5 h-3.5"
                  />
                  {sourceMeta.name}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 shrink-0 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 border-b border-line shrink-0">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap cursor-pointer ${
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
        </div>

        <div className="px-5 sm:px-6 py-5 overflow-y-auto flex-1 min-h-0">
          {error ? (
            <p className="mb-4 text-[13px] text-red-600">{error}</p>
          ) : null}

          {tab === "overview" ? (
            <form onSubmit={(e) => void handleSaveOverview(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block sm:col-span-2">
                  <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                    Name
                  </span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                    Email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                    Phone
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                    Company
                  </span>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                    Website
                  </span>
                  <input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                    Status
                  </span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as LeadStatus)}
                    className={inputClass}
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="block">
                  <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                    Source
                  </span>
                  {fromForm ? (
                    <div className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600">
                      <LeadSourceIcon
                        source={sourceMeta}
                        className="w-4 h-4"
                      />
                      {sourceMeta.name}
                      <span className="text-[11px] text-gray-400 ml-1">
                        (from form)
                      </span>
                    </div>
                  ) : (
                    <LeadSourceSelect
                      value={source}
                      onChange={setSource}
                      sources={sources.filter((s) => s.id !== "form")}
                    />
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-[#FAFBFC] p-4 space-y-2.5 text-sm">
                <InfoLine
                  icon={FormInput}
                  label="Form"
                  value={lead.form_name || "—"}
                />
                <InfoLine
                  icon={Mail}
                  label="Email"
                  value={
                    lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        className="text-[#2563EB] hover:underline cursor-pointer"
                      >
                        {lead.email}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <InfoLine
                  icon={Phone}
                  label="Phone"
                  value={lead.phone || "—"}
                />
                <InfoLine
                  icon={Globe}
                  label="Website"
                  value={
                    lead.website ? (
                      <a
                        href={
                          lead.website.startsWith("http")
                            ? lead.website
                            : `https://${lead.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#2563EB] hover:underline cursor-pointer"
                      >
                        {displayWebsite(lead.website)}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <InfoLine
                  icon={Building2}
                  label="Added"
                  value={formatDate(lead.created_at)}
                />
                {lead.converted_client_id ? (
                  <InfoLine
                    icon={UserPlus}
                    label="Client"
                    value={
                      <Link
                        href={`/clients/${lead.converted_client_id}`}
                        className="inline-flex items-center gap-1 text-[#2563EB] hover:underline cursor-pointer"
                      >
                        View client
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    }
                  />
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                {overviewSaved ? (
                  <span className="text-[13px] text-emerald-600 font-medium mr-auto">
                    Saved
                  </span>
                ) : null}
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          ) : null}

          {tab === "notes" ? (
            <div className="space-y-4">
              <p className="text-[13px] text-gray-500">
                Private notes about this lead — only visible in your workspace.
              </p>
              <textarea
                rows={10}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add context, next steps, call notes…"
                className={`${inputClass} resize-none min-h-[220px]`}
              />
              <div className="flex items-center justify-end gap-2">
                {notesSaved ? (
                  <span className="text-[13px] text-emerald-600 font-medium mr-auto">
                    Saved
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={savingNotes}
                  onClick={() => void handleSaveNotes()}
                  className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingNotes ? "Saving…" : "Save notes"}
                </button>
              </div>
            </div>
          ) : null}

          {tab === "activity" ? (
            <div className="space-y-4">
              {loadingExtra ? (
                <p className="text-sm text-gray-400">Loading activity…</p>
              ) : (
                <>
                  <ActivityItem
                    title="Lead created"
                    detail={formatDate(lead.created_at)}
                    meta={sourceMeta.name}
                  />

                  {submissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="rounded-2xl border border-line p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Form submission
                          </p>
                          <p className="text-[13px] text-gray-500 mt-0.5">
                            {formatDate(submission.created_at)}
                            {lead.form_name ? ` · ${lead.form_name}` : ""}
                          </p>
                        </div>
                        <FormInput className="w-4 h-4 text-gray-400 shrink-0" />
                      </div>
                      {payloadEntries(submission.payload).length > 0 ? (
                        <dl className="space-y-2 text-sm">
                          {payloadEntries(submission.payload).map(
                            ([key, value]) => (
                              <div
                                key={key}
                                className="grid grid-cols-[120px_1fr] gap-3"
                              >
                                <dt className="text-gray-400 capitalize truncate">
                                  {key.replace(/_/g, " ")}
                                </dt>
                                <dd className="text-gray-800 break-words">
                                  {typeof value === "string" ||
                                  typeof value === "number" ||
                                  typeof value === "boolean"
                                    ? String(value)
                                    : JSON.stringify(value)}
                                </dd>
                              </div>
                            )
                          )}
                        </dl>
                      ) : (
                        <p className="text-[13px] text-gray-400">
                          No field values recorded.
                        </p>
                      )}
                    </div>
                  ))}

                  {proposal ? (
                    <div className="rounded-2xl border border-line p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          Proposal linked
                        </p>
                        <p className="text-[13px] text-gray-500 mt-0.5 truncate">
                          {proposal.title} · {proposal.status}
                        </p>
                      </div>
                      <Link
                        href={`/proposals/${proposal.id}/edit`}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-[#2563EB] hover:underline shrink-0 cursor-pointer"
                      >
                        Open
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ) : null}

                  {lead.converted_client_id ? (
                    <ActivityItem
                      title="Converted to client"
                      detail="This lead is linked to a client record."
                      action={
                        <Link
                          href={`/clients/${lead.converted_client_id}`}
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-[#2563EB] hover:underline cursor-pointer"
                        >
                          View client
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      }
                    />
                  ) : null}

                  {!proposal &&
                  submissions.length === 0 &&
                  !lead.converted_client_id ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                      No extra activity yet.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
          >
            Close
          </button>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setEmailOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-line bg-white hover:bg-gray-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Send email
            </button>
            {!lead.converted_client_id ? (
              <button
                type="button"
                onClick={onConvert}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-line bg-white hover:bg-gray-50 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Convert to client
              </button>
            ) : (
              <Link
                href={`/clients/${lead.converted_client_id}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-line bg-white hover:bg-gray-50 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                View client
              </Link>
            )}
            <button
              type="button"
              onClick={onCreateProposal}
              className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Create proposal
            </button>
          </div>
        </div>
      </div>

      {emailOpen ? (
        <SendLeadEmailModal
          leadId={lead.id}
          leadName={lead.company || lead.name}
          defaultTo={lead.email}
          fromForm={fromForm}
          onClose={() => setEmailOpen(false)}
          onSent={() => {
            setEmailOpen(false);
            onUpdated();
            void loadExtras();
          }}
        />
      ) : null}
    </ModalOverlay>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 flex items-baseline justify-between gap-3">
        <span className="text-gray-500 shrink-0">{label}</span>
        <span className="text-gray-900 text-right min-w-0">{value}</span>
      </div>
    </div>
  );
}

function ActivityItem({
  title,
  detail,
  meta,
  action,
}: {
  title: string;
  detail: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-[13px] text-gray-500 mt-0.5">
          {detail}
          {meta ? ` · ${meta}` : ""}
        </p>
      </div>
      {action}
    </div>
  );
}
