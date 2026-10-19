"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlignLeft,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleDot,
  Copy,
  ExternalLink,
  FormInput,
  Globe,
  Hash,
  Mail,
  Phone,
  Save,
  Scale,
  Type,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { LeadFormCanvas } from "@/components/leads/LeadFormCanvas";
import { LeadFormStylePanel } from "@/components/leads/LeadFormStylePanel";
import {
  LEAD_FIELD_DRAG_TYPE,
  LEAD_FORM_FIELD_PALETTE,
  createLeadFormField,
  leadFormEmbedSnippet,
  normalizeLeadFormFields,
  normalizeLeadFormTheme,
  type LeadFormField,
  type LeadFormFieldType,
  type LeadFormSelection,
  type LeadFormTheme,
} from "@/lib/leads/forms";
import {
  DEFAULT_CONFIRMATION_EMAIL_BODY,
  DEFAULT_CONFIRMATION_EMAIL_SUBJECT,
  normalizeConfirmationVia,
  type LeadFormConfirmationVia,
} from "@/lib/leads/confirmation-email";
import type { Json } from "@/types/database";

const FIELD_PALETTE_ICONS: Record<
  LeadFormFieldType,
  React.ComponentType<{ className?: string }>
> = {
  text: Type,
  email: Mail,
  tel: Phone,
  url: Globe,
  number: Hash,
  date: Calendar,
  textarea: AlignLeft,
  select: ChevronDown,
  radio: CircleDot,
  checkbox: CheckSquare,
  terms: Scale,
};

type FormRow = {
  id: string;
  name: string;
  public_token: string;
  fields: LeadFormField[];
  theme: LeadFormTheme;
  success_message: string;
  is_active: boolean;
  confirmation_email_enabled: boolean;
  confirmation_email_via: LeadFormConfirmationVia;
  confirmation_email_subject: string;
  confirmation_email_body: string;
};

type MailboxStatus = {
  connected: boolean;
  canSend: boolean;
  email: string | null;
  provider: "gmail" | "outlook" | null;
};

function appBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://app.rebban.com"
  ).replace(/\/$/, "");
}

export default function EditLeadFormPage() {
  const params = useParams<{ id: string }>();
  const formId = params.id;
  const { organizationId, userId, loading: profileLoading } = useProfile();
  const [form, setForm] = useState<FormRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selection, setSelection] = useState<LeadFormSelection | null>(null);
  const [addFieldOpen, setAddFieldOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [emailOpen, setEmailOpen] = useState(false);
  const [draggingFieldType, setDraggingFieldType] =
    useState<LeadFormFieldType | null>(null);
  const [mailbox, setMailbox] = useState<MailboxStatus>({
    connected: false,
    canSend: false,
    email: null,
    provider: null,
  });

  const load = useCallback(async () => {
    if (!organizationId || !formId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("lead_forms")
      .select(
        "id, name, public_token, fields, theme, success_message, is_active, confirmation_email_enabled, confirmation_email_via, confirmation_email_subject, confirmation_email_body"
      )
      .eq("id", formId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadError || !data) {
      setError(loadError?.message || "Form not found.");
      setForm(null);
      setLoading(false);
      return;
    }

    setForm({
      id: data.id,
      name: data.name,
      public_token: data.public_token,
      fields: normalizeLeadFormFields(data.fields),
      theme: normalizeLeadFormTheme(data.theme as LeadFormTheme),
      success_message: data.success_message,
      is_active: data.is_active,
      confirmation_email_enabled: Boolean(data.confirmation_email_enabled),
      confirmation_email_via: normalizeConfirmationVia(
        data.confirmation_email_via
      ),
      confirmation_email_subject:
        data.confirmation_email_subject || DEFAULT_CONFIRMATION_EMAIL_SUBJECT,
      confirmation_email_body:
        data.confirmation_email_body || DEFAULT_CONFIRMATION_EMAIL_BODY,
    });
    setLoading(false);
  }, [organizationId, formId]);

  const loadMailbox = useCallback(async () => {
    try {
      const [gmailRes, outlookRes] = await Promise.all([
        fetch("/api/gmail/status"),
        fetch("/api/outlook/status"),
      ]);
      const gmail = (await gmailRes.json()) as {
        connected?: boolean;
        canSend?: boolean;
        email?: string | null;
      };
      const outlook = (await outlookRes.json()) as {
        connected?: boolean;
        canSend?: boolean;
        email?: string | null;
      };

      if (outlook.connected && outlook.canSend) {
        setMailbox({
          connected: true,
          canSend: true,
          email: outlook.email || null,
          provider: "outlook",
        });
        return;
      }
      if (gmail.connected && gmail.canSend) {
        setMailbox({
          connected: true,
          canSend: true,
          email: gmail.email || null,
          provider: "gmail",
        });
        return;
      }
      setMailbox({
        connected: Boolean(gmail.connected || outlook.connected),
        canSend: false,
        email: gmail.email || outlook.email || null,
        provider: gmail.connected
          ? "gmail"
          : outlook.connected
            ? "outlook"
            : null,
      });
    } catch {
      setMailbox({
        connected: false,
        canSend: false,
        email: null,
        provider: null,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMailbox();
  }, [loadMailbox]);

  // Prefer connected mailbox as the default send-from when one can send
  // and confirmation email hasn't been configured yet.
  useEffect(() => {
    if (!mailbox.canSend) return;
    setForm((prev) => {
      if (
        !prev ||
        prev.confirmation_email_enabled ||
        prev.confirmation_email_via === "connected"
      ) {
        return prev;
      }
      return { ...prev, confirmation_email_via: "connected" };
    });
  }, [mailbox.canSend, form?.id]);

  async function persist() {
    if (!form || !organizationId) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("lead_forms")
      .update({
        name: form.name.trim() || "Contact form",
        fields: form.fields as unknown as Json,
        theme: form.theme as unknown as Json,
        success_message:
          form.success_message.trim() || "Thanks — we'll be in touch soon.",
        is_active: form.is_active,
        confirmation_email_enabled: form.confirmation_email_enabled,
        confirmation_email_via: form.confirmation_email_via,
        confirmation_email_subject:
          form.confirmation_email_subject.trim() ||
          DEFAULT_CONFIRMATION_EMAIL_SUBJECT,
        confirmation_email_body:
          form.confirmation_email_body.trim() ||
          DEFAULT_CONFIRMATION_EMAIL_BODY,
        confirmation_email_user_id:
          form.confirmation_email_enabled &&
          form.confirmation_email_via === "connected"
            ? userId
            : null,
      })
      .eq("id", form.id)
      .eq("organization_id", organizationId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Saved");
    window.setTimeout(() => setMessage(null), 1800);
  }

  function patchTheme(patch: Partial<LeadFormTheme>) {
    if (!form) return;
    setForm({ ...form, theme: { ...form.theme, ...patch } });
  }

  function patchField(fieldId: string, patch: Partial<LeadFormField>) {
    if (!form) return;
    setForm({
      ...form,
      fields: form.fields.map((f) =>
        f.id === fieldId ? { ...f, ...patch } : f
      ),
    });
  }

  function addField(type: LeadFormFieldType, index?: number) {
    if (!form) return;
    const field = createLeadFormField(type);
    const fields = [...form.fields];
    const insertAt =
      typeof index === "number"
        ? Math.max(0, Math.min(index, fields.length))
        : fields.length;
    fields.splice(insertAt, 0, field);
    setForm({ ...form, fields });
    setSelection({ type: "field", fieldId: field.id });
  }

  function reorderField(fromId: string, toIndex: number) {
    if (!form) return;
    const fromIndex = form.fields.findIndex((f) => f.id === fromId);
    if (fromIndex < 0) return;
    const fields = [...form.fields];
    const [moved] = fields.splice(fromIndex, 1);
    let insertAt = toIndex;
    if (fromIndex < toIndex) insertAt -= 1;
    insertAt = Math.max(0, Math.min(insertAt, fields.length));
    fields.splice(insertAt, 0, moved);
    setForm({ ...form, fields });
    setSelection({ type: "field", fieldId: fromId });
  }

  const removeField = useCallback(
    (fieldId: string) => {
      if (!form) return;
      if (form.fields.length <= 1) {
        setError("Keep at least one field on the form.");
        return;
      }
      const index = form.fields.findIndex((f) => f.id === fieldId);
      if (index < 0) return;
      const nextFields = form.fields.filter((f) => f.id !== fieldId);
      const nextSelection =
        nextFields[Math.min(index, nextFields.length - 1)] || nextFields[0];
      setForm({ ...form, fields: nextFields });
      setSelection(
        nextSelection ? { type: "field", fieldId: nextSelection.id } : null
      );
    },
    [form]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      if (selection?.type !== "field") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      removeField(selection.fieldId);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, removeField]);

  function copySnippet() {
    if (!form) return;
    void navigator.clipboard.writeText(
      leadFormEmbedSnippet(appBaseUrl(), form.public_token)
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (profileLoading || loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500">
        Loading form…
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
        <p>{error}</p>
        <Link href="/leads/forms" className="text-[#2563EB] font-medium">
          Back to forms
        </Link>
      </div>
    );
  }

  if (!form) return null;

  const theme = normalizeLeadFormTheme(form.theme);

  return (
    <div className="h-full flex flex-col min-h-0 bg-white">
      <header className="shrink-0 h-14 border-b border-line px-3 sm:px-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/leads/forms"
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 min-w-0">
            <FormInput className="w-4 h-4 text-[#2563EB] shrink-0" />
            <span className="truncate max-w-[240px]">
              {form.name || "Lead form"}
            </span>
            <span
              className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                form.is_active
                  ? "bg-[#F3FAF6] text-emerald-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {form.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {message ? (
            <span className="hidden sm:inline text-[13px] font-medium text-emerald-600">
              {message}
            </span>
          ) : null}
          <button
            type="button"
            onClick={copySnippet}
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            Embed
          </button>
          <a
            href={`/f/${form.public_token}`}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open
          </a>
          <button
            type="button"
            onClick={() => void persist()}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div
          className="flex-1 min-h-0 overflow-y-auto relative custom-scrollbar flex flex-col"
          style={{ backgroundColor: theme.pageBg }}
          onClick={() => setSelection(null)}
        >
          {error ? (
            <div
              className="mx-4 sm:mx-8 mt-4 max-w-[820px] text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              {error}
            </div>
          ) : null}
          <p className="px-4 sm:px-8 pt-4 sm:pt-6 pb-2 text-center text-[13px] text-gray-500">
            Click any element to edit. Hover a field to delete it. The submit
            button can’t be removed.
          </p>
          <div className="flex-1 min-h-0 w-full px-4 sm:px-8 py-6 sm:py-10">
            <LeadFormCanvas
              mode="preview"
              name={form.name}
              fields={form.fields}
              theme={form.theme}
              selection={selection}
              onSelect={setSelection}
              draggingFieldType={draggingFieldType}
              onInsertFieldType={(type, index) => addField(type, index)}
              onReorderFields={reorderField}
              onRemoveField={removeField}
            />
          </div>
        </div>

        <aside className="hidden lg:flex w-[340px] shrink-0 border-l border-line flex-col min-h-0 bg-[#FAFBFC] overflow-y-auto custom-scrollbar">
          {selection ? (
            <div className="animate-in fade-in slide-in-from-right-4 duration-200 bg-white h-full flex flex-col min-h-0">
              <div className="p-6 space-y-6 bg-white flex-1 overflow-y-auto min-h-0">
                <LeadFormStylePanel
                  selection={selection}
                  theme={theme}
                  fields={form.fields}
                  formName={form.name}
                  onChangeTheme={patchTheme}
                  onChangeField={patchField}
                  onChangeFormName={(name) => setForm({ ...form, name })}
                  onRemoveField={removeField}
                />
              </div>
              <div className="p-4 border-t border-line bg-white shrink-0">
                <button
                  type="button"
                  onClick={() => setSelection(null)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                >
                  Finish Styling
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-line">
              <AccordionSection
                title="Add Field"
                open={addFieldOpen}
                onToggle={() => setAddFieldOpen((v) => !v)}
              >
                <p className="text-[11px] text-gray-500 mb-3">
                  Drag onto the form, or click to append.
                </p>
                <FieldPaletteGrid
                  onAdd={addField}
                  draggingType={draggingFieldType}
                  onDragTypeChange={setDraggingFieldType}
                />
              </AccordionSection>

              <AccordionSection
                title="Settings"
                open={settingsOpen}
                onToggle={() => setSettingsOpen((v) => !v)}
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">
                      Success message
                    </label>
                    <input
                      value={form.success_message}
                      onChange={(e) =>
                        setForm({ ...form, success_message: e.target.value })
                      }
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) =>
                        setForm({ ...form, is_active: e.target.checked })
                      }
                    />
                    Active (accepting submissions)
                  </label>
                </div>
              </AccordionSection>

              <AccordionSection
                title="Confirmation email"
                open={emailOpen}
                onToggle={() => setEmailOpen((v) => !v)}
              >
                <ConfirmationEmailSettings
                  form={form}
                  mailbox={mailbox}
                  onChange={(patch) => setForm({ ...form, ...patch })}
                />
              </AccordionSection>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile style panel */}
      <div className="lg:hidden border-t border-line bg-[#FAFBFC] max-h-[42vh] overflow-y-auto">
        {selection ? (
          <div className="bg-white flex flex-col max-h-[42vh]">
            <div className="p-6 overflow-y-auto min-h-0 flex-1">
              <LeadFormStylePanel
                selection={selection}
                theme={theme}
                fields={form.fields}
                formName={form.name}
                onChangeTheme={patchTheme}
                onChangeField={patchField}
                onChangeFormName={(name) => setForm({ ...form, name })}
                onRemoveField={removeField}
              />
            </div>
            <div className="p-4 border-t border-line bg-white shrink-0">
              <button
                type="button"
                onClick={() => setSelection(null)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
              >
                Finish Styling
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-line">
            <AccordionSection
              title="Add Field"
              open={addFieldOpen}
              onToggle={() => setAddFieldOpen((v) => !v)}
            >
              <FieldPaletteGrid
                onAdd={addField}
                draggingType={draggingFieldType}
                onDragTypeChange={setDraggingFieldType}
              />
            </AccordionSection>
            <AccordionSection
              title="Settings"
              open={settingsOpen}
              onToggle={() => setSettingsOpen((v) => !v)}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-900 mb-2">
                    Success message
                  </label>
                  <input
                    value={form.success_message}
                    onChange={(e) =>
                      setForm({ ...form, success_message: e.target.value })
                    }
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
                  />
                </div>
              </div>
            </AccordionSection>
          </div>
        )}
      </div>
    </div>
  );
}

function AccordionSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
      >
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open ? (
        <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function FieldPaletteGrid({
  onAdd,
  draggingType,
  onDragTypeChange,
}: {
  onAdd: (type: LeadFormFieldType) => void;
  draggingType: LeadFormFieldType | null;
  onDragTypeChange: (type: LeadFormFieldType | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {LEAD_FORM_FIELD_PALETTE.map((item) => {
        const Icon = FIELD_PALETTE_ICONS[item.type];
        const active = draggingType === item.type;
        return (
          <button
            key={item.type}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(LEAD_FIELD_DRAG_TYPE, item.type);
              e.dataTransfer.effectAllowed = "copy";
              onDragTypeChange(item.type);
            }}
            onDragEnd={() => onDragTypeChange(null)}
            onClick={() => onAdd(item.type)}
            className={`flex flex-col items-center justify-center py-4 px-2 rounded-lg border text-gray-500 transition-all bg-white shadow-sm hover:shadow cursor-grab active:cursor-grabbing ${
              active
                ? "border-emerald-500 text-emerald-600 ring-1 ring-emerald-200"
                : "border-gray-200 hover:border-emerald-500 hover:text-emerald-600"
            }`}
          >
            <Icon className="w-4 h-4 mb-1.5" />
            <span className="text-[11px] font-semibold">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ConfirmationEmailSettings({
  form,
  mailbox,
  onChange,
}: {
  form: FormRow;
  mailbox: MailboxStatus;
  onChange: (patch: Partial<FormRow>) => void;
}) {
  const sendFromOptions: {
    value: LeadFormConfirmationVia;
    title: string;
    description: string;
  }[] = mailbox.canSend
    ? [
        {
          value: "connected",
          title: "My email (Gmail / Outlook)",
          description:
            "Send from your connected mailbox so replies come to you.",
        },
        {
          value: "rebban",
          title: "Rebban",
          description:
            "Sent via rebban.com. Works without connecting your inbox.",
        },
      ]
    : [
        {
          value: "rebban",
          title: "Rebban",
          description:
            "Sent via rebban.com. Works without connecting your inbox.",
        },
        {
          value: "connected",
          title: "My email (Gmail / Outlook)",
          description:
            "Send from your connected mailbox so replies come to you.",
        },
      ];

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-500">
        Email the submitter after they send the form. Needs an email field on
        the form.
      </p>

      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <input
          type="checkbox"
          checked={form.confirmation_email_enabled}
          onChange={(e) => {
            const enabled = e.target.checked;
            onChange({
              confirmation_email_enabled: enabled,
              ...(enabled && mailbox.canSend
                ? { confirmation_email_via: "connected" as const }
                : {}),
            });
          }}
        />
        Send confirmation email
      </label>

      {form.confirmation_email_enabled ? (
        <>
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-900 mb-2">
              Send from
            </label>
            {sendFromOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 cursor-pointer hover:border-gray-300"
              >
                <input
                  type="radio"
                  name="confirmation_email_via"
                  className="mt-0.5"
                  checked={form.confirmation_email_via === option.value}
                  onChange={() =>
                    onChange({ confirmation_email_via: option.value })
                  }
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-gray-900">
                    {option.title}
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {form.confirmation_email_via === "connected" ? (
            mailbox.canSend ? (
              <div className="rounded-lg bg-[#F3FAF6] border border-emerald-100 px-3 py-2.5 text-[12px] text-emerald-800">
                Connected{" "}
                {mailbox.provider === "outlook" ? "Outlook" : "Gmail"}
                {mailbox.email ? (
                  <>
                    : <span className="font-medium">{mailbox.email}</span>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-[12px] text-amber-900 space-y-1.5">
                <p>
                  {mailbox.connected
                    ? "Your mailbox is connected but can’t send yet. Reconnect with send permission."
                    : "You haven’t connected Gmail or Outlook yet."}
                </p>
                <Link
                  href="/settings?section=integrations"
                  className="inline-flex font-semibold text-emerald-700 hover:underline"
                >
                  Connect email in Settings → Integrations
                </Link>
              </div>
            )
          ) : null}

          <div>
            <label className="block text-xs font-bold text-gray-900 mb-2">
              Subject
            </label>
            <input
              value={form.confirmation_email_subject}
              onChange={(e) =>
                onChange({ confirmation_email_subject: e.target.value })
              }
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
              placeholder={DEFAULT_CONFIRMATION_EMAIL_SUBJECT}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-900 mb-2">
              Message
            </label>
            <textarea
              rows={6}
              value={form.confirmation_email_body}
              onChange={(e) =>
                onChange({ confirmation_email_body: e.target.value })
              }
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white resize-y"
              placeholder={DEFAULT_CONFIRMATION_EMAIL_BODY}
            />
            <span className="mt-1.5 block text-[11px] text-gray-400">
              Placeholders: {"{{name}}"}, {"{{email}}"}, {"{{company}}"},{" "}
              {"{{form}}"}, {"{{organization}}"}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
