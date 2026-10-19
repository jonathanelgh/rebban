"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Plus,
  Check,
  FormInput,
  X,
  MoreHorizontal,
  Pencil,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  ModalOverlay,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";
import {
  DEFAULT_LEAD_FORM_FIELDS,
  DEFAULT_LEAD_FORM_THEME,
  leadFormEmbedSnippet,
  newLeadFormToken,
  normalizeLeadFormTheme,
  type LeadFormField,
  type LeadFormTheme,
} from "@/lib/leads/forms";
import type { Json } from "@/types/database";

type FormRow = {
  id: string;
  name: string;
  public_token: string;
  fields: LeadFormField[];
  theme: LeadFormTheme;
  success_message: string;
  is_active: boolean;
  created_at: string;
  submission_count: number;
};

function formatCreatedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSubmissionCount(count: number) {
  if (count === 1) return "1 submit";
  return `${count} submits`;
}

function appBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://app.rebban.com"
  ).replace(/\/$/, "");
}

function normalizeFormRow(raw: Partial<FormRow> & { id: string }): FormRow {
  return {
    id: raw.id,
    name: raw.name || "Contact form",
    public_token: raw.public_token || "",
    fields: Array.isArray(raw.fields) ? raw.fields : DEFAULT_LEAD_FORM_FIELDS,
    theme: normalizeLeadFormTheme(raw.theme),
    success_message:
      raw.success_message || "Thanks — we'll be in touch soon.",
    is_active: raw.is_active !== false,
    created_at: raw.created_at || new Date().toISOString(),
    submission_count: raw.submission_count ?? 0,
  };
}

export default function LeadFormsPage() {
  return (
    <Suspense
      fallback={
        <main className="w-full px-4 md:px-8 pt-10 pb-8 max-w-7xl mx-auto">
          <p className="text-sm text-gray-400">Loading…</p>
        </main>
      }
    >
      <LeadFormsPageInner />
    </Suspense>
  );
}

function LeadFormsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organizationId, userId } = useProfile();
  const [forms, setForms] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FormRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const supabase = createClient();
    const [formsRes, submissionsRes] = await Promise.all([
      supabase
        .from("lead_forms")
        .select(
          "id, name, public_token, fields, theme, success_message, is_active, created_at"
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_form_submissions")
        .select("form_id")
        .eq("organization_id", organizationId),
    ]);
    if (formsRes.error) setError(formsRes.error.message);

    const counts = new Map<string, number>();
    for (const row of submissionsRes.data || []) {
      const formId = row.form_id as string;
      counts.set(formId, (counts.get(formId) || 0) + 1);
    }

    setForms(
      ((formsRes.data || []) as FormRow[]).map((row) =>
        normalizeFormRow({
          ...row,
          submission_count: counts.get(row.id) || 0,
        })
      )
    );
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreateOpen(true);
      router.replace("/leads/forms", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!menuId) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-form-menu]")) return;
      setMenuId(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuId(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuId]);

  async function confirmDelete() {
    if (!pendingDelete) return;

    setDeleting(true);
    setDeleteError(null);
    const formId = pendingDelete.id;
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("soft_delete_lead_form", {
      p_form_id: formId,
    });

    setDeleting(false);

    if (rpcError) {
      setDeleteError(rpcError.message);
      return;
    }

    setPendingDelete(null);
    setForms((prev) => prev.filter((form) => form.id !== formId));
  }

  function copySnippet(token: string) {
    const snippet = leadFormEmbedSnippet(appBaseUrl(), token);
    void navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="w-full px-4 md:px-8 pt-10 pb-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <Link
            href="/leads"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to leads
          </Link>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight">
            Lead forms
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Build a form and embed it on your website with a code snippet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="btn-primary px-5 py-2.5 rounded-full text-sm hidden md:inline-flex items-center gap-2 self-start"
        >
          <Plus className="w-4 h-4" />
          New form
        </button>
      </div>

      {error ? <p className="mb-4 text-[13px] text-red-600">{error}</p> : null}

      <div className="bg-white rounded-2xl border border-line overflow-hidden">
        {loading ? (
          <p className="px-5 py-8 text-sm text-gray-400">Loading…</p>
        ) : forms.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-500 mb-3">No forms yet.</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="text-sm font-medium text-[#2563EB] hover:underline"
            >
              Create your first lead form →
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {forms.map((form) => (
              <li
                key={form.id}
                className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-gray-50/80"
              >
                <button
                  type="button"
                  className="text-left min-w-0 flex-1"
                  onClick={() => router.push(`/leads/forms/${form.id}/edit`)}
                >
                  <p className="text-sm font-medium text-gray-900">
                    {form.name}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    {form.is_active ? "Active" : "Inactive"} · Created{" "}
                    {formatCreatedAt(form.created_at)} ·{" "}
                    {formatSubmissionCount(form.submission_count)}
                  </p>
                </button>
                <div className="relative shrink-0" data-form-menu>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() =>
                      setMenuId((id) => (id === form.id ? null : form.id))
                    }
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    aria-label="Form actions"
                    aria-expanded={menuId === form.id}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuId === form.id ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-1 z-20 w-48 rounded-xl border border-line bg-white shadow-lg py-1 text-sm"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                        onClick={() => {
                          setMenuId(null);
                          router.push(`/leads/forms/${form.id}/edit`);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                        onClick={() => {
                          copySnippet(form.public_token);
                          setMenuId(null);
                        }}
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        Copy embed
                      </button>
                      <a
                        href={`/f/${form.public_token}`}
                        target="_blank"
                        rel="noreferrer"
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                        onClick={() => setMenuId(null)}
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open live form
                      </a>
                      <div className="border-t border-line my-1" />
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-left text-red-600"
                        onClick={() => {
                          setMenuId(null);
                          setDeleteError(null);
                          setPendingDelete(form);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingDelete ? (
        <DeleteLeadFormModal
          formName={pendingDelete.name}
          busy={deleting}
          error={deleteError}
          onClose={() => {
            if (deleting) return;
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {createOpen ? (
        <CreateLeadFormModal
          organizationId={organizationId}
          userId={userId}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            router.push(`/leads/forms/${id}/edit`);
          }}
        />
      ) : null}
    </main>
  );
}

function DeleteLeadFormModal({
  formName,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  formName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalOverlay onClose={busy ? undefined : onClose}>
      <div className={modalPanelClass("max-w-[420px]")}>
        <div className={`${modalHeaderClass} border-b border-line`}>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900">Delete form?</h2>
            <p className="text-sm text-gray-500 mt-1">
              This will remove{" "}
              <span className="font-medium text-gray-800">{formName}</span>{" "}
              from your workspace. Existing leads stay intact. The live form
              and embed will stop working.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 shrink-0 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {error ? (
          <p className="mx-5 sm:mx-6 mt-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        ) : null}
        <div className="px-5 sm:px-6 py-4 border-t border-line bg-[#FAFBFC] flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete form"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function CreateLeadFormModal({
  organizationId,
  userId,
  onClose,
  onCreated,
}: {
  organizationId: string | null;
  userId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("Contact form");
  const [successMessage, setSuccessMessage] = useState(
    "Thanks — we'll be in touch soon."
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate() {
    if (!organizationId || !userId) {
      setFormError("No workspace found. Try signing out and back in.");
      return;
    }
    if (!name.trim()) {
      setFormError("Add a form name to continue.");
      return;
    }

    setSaving(true);
    setFormError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("lead_forms")
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        public_token: newLeadFormToken(),
        fields: DEFAULT_LEAD_FORM_FIELDS as unknown as Json,
        theme: DEFAULT_LEAD_FORM_THEME as unknown as Json,
        success_message:
          successMessage.trim() || "Thanks — we'll be in touch soon.",
        created_by: userId,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !data) {
      setFormError(error?.message || "Could not create form.");
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
              <FormInput className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-gray-900 truncate">
                New lead form
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Name it, then build and style the form.
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

        <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
          {formError ? (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {formError}
            </p>
          ) : null}

          <div className="min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Form name *
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contact form"
              className="w-full min-w-0 max-w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Success message
            </label>
            <input
              value={successMessage}
              onChange={(e) => setSuccessMessage(e.target.value)}
              placeholder="Thanks — we'll be in touch soon."
              className="w-full min-w-0 max-w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
            <p className="text-[12px] text-gray-500 mt-1.5">
              Shown after someone submits the form.
            </p>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line bg-[#FAFBFC] flex flex-wrap justify-end gap-2 shrink-0 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void handleCreate()}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create form"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
