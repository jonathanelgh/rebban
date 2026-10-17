"use client";

import React, { useEffect, useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ClientStatusDropdown,
  type ClientStatus,
} from "@/components/ClientStatusDropdown";
import {
  ModalOverlay,
  modalFooterClass,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";

export type ClientFormValues = {
  name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  status: ClientStatus;
  notes: string;
};

export type ClientFormInitial = ClientFormValues & {
  id: string;
  organizationId: string;
  logoUrl: string | null;
  logoPath: string | null;
};

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const inputClass =
  "w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300";

function normalizeWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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

export async function uploadClientLogo(options: {
  organizationId: string;
  clientId: string;
  file: File;
}) {
  const { organizationId, clientId, file } = options;
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose a PNG, JPG, or SVG image.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo must be 2MB or smaller.");
  }

  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeExt = ext === "jpeg" ? "jpg" : ext;
  const path = `${organizationId}/clients/${clientId}/logo.${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from("org-assets")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await supabase
    .from("clients")
    .update({ logo_url: path })
    .eq("id", clientId);

  if (updateError) throw new Error(updateError.message);

  return path;
}

export function ClientFormModal({
  mode,
  initial,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  initial?: Partial<ClientFormInitial>;
  onClose: () => void;
  onSave: (values: ClientFormValues, logoFile: File | null) => Promise<void>;
}) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [status, setStatus] = useState<ClientStatus>(
    initial?.status ?? "prospect"
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initial?.logoUrl ?? null
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadExistingLogo() {
      if (!initial?.logoPath || initial.logoUrl) return;
      const supabase = createClient();
      const url = await resolveLogoUrl(supabase, initial.logoPath);
      if (!cancelled) setLogoPreview(url);
    }
    void loadExistingLogo();
    return () => {
      cancelled = true;
    };
  }, [initial?.logoPath, initial?.logoUrl]);

  useEffect(() => {
    return () => {
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const canSave = name.trim().length > 0 && !saving;

  function handleLogoPick(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Please choose a PNG, JPG, or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFormError("Logo must be 2MB or smaller.");
      return;
    }
    setFormError(null);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setFormError(null);
    try {
      await onSave(
        {
          name: name.trim(),
          company: company.trim(),
          email: email.trim(),
          phone: phone.trim(),
          website: normalizeWebsite(website) ?? "",
          status,
          notes: notes.trim(),
        },
        logoFile
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not save client."
      );
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} zClass="z-[70]">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className={modalPanelClass("max-w-[520px]")}
      >
        <div className={modalHeaderClass}>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
              {mode === "create" ? "New client" : "Edit client"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "create"
                ? "Add a contact you can assign to projects and invoices."
                : "Update contact details, website, and logo."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 pb-2 space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl border border-line bg-[#FAFBFC] overflow-hidden flex items-center justify-center shrink-0">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreview}
                  alt="Client logo"
                  className="w-full h-full object-contain p-1.5"
                />
              ) : (
                <ImageIcon className="w-6 h-6 text-gray-300" strokeWidth={1.5} />
              )}
            </div>
            <div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  handleLogoPick(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
              >
                {logoPreview ? "Change logo" : "Upload logo"}
              </button>
              <p className="text-[12px] text-gray-400 mt-0.5">
                PNG, JPG, or SVG up to 2MB
              </p>
            </div>
          </div>

          <Field label="Contact name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Lee"
              className={inputClass}
            />
          </Field>
          <Field label="Company">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Corp"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@acme.com"
                className={inputClass}
              />
            </Field>
            <Field label="Phone">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 0100"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Website">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="acme.com"
              className={inputClass}
            />
          </Field>
          <Field label="Status">
            <ClientStatusDropdown
              value={status}
              onChange={setStatus}
              variant="field"
            />
          </Field>
          {mode === "edit" && (
            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Private notes about this client…"
                className={`${inputClass} resize-none`}
              />
            </Field>
          )}
          {formError && (
            <p className="text-[13px] text-red-600">{formError}</p>
          )}
        </div>

        <div className={`${modalFooterClass} bg-[#FAFBFC]`}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Save client"
                : "Save changes"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
