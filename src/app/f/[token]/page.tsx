"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LeadFormCanvas } from "@/components/leads/LeadFormCanvas";
import {
  normalizeLeadFormFields,
  normalizeLeadFormTheme,
  type LeadFormField,
  type LeadFormTheme,
} from "@/lib/leads/forms";

type PublicForm = {
  token: string;
  name: string;
  fields: LeadFormField[];
  theme?: LeadFormTheme | null;
  success_message: string;
  organization: { name: string | null; logo_url: string | null };
};

export default function PublicLeadFormPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [form, setForm] = useState<PublicForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "get_public_lead_form",
        { p_token: token }
      );
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message || "Form not found");
        return;
      }
      const parsed = data as PublicForm;
      setForm({
        ...parsed,
        fields: normalizeLeadFormFields(parsed.fields),
        theme: normalizeLeadFormTheme(parsed.theme),
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/f/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const json = (await res.json()) as {
        error?: string;
        success_message?: string;
      };
      if (!res.ok) throw new Error(json.error || "Submission failed");
      setDoneMessage(json.success_message || form.success_message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const theme = normalizeLeadFormTheme(form?.theme);

  if (error && !form) {
    return (
      <main className="min-h-screen bg-[#F0F1F3] flex items-center justify-center p-6">
        <p className="text-sm text-gray-500">{error}</p>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="min-h-screen bg-[#F0F1F3] flex items-center justify-center p-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex items-start justify-center p-4 sm:p-8"
      style={{ backgroundColor: theme.pageBg }}
    >
      <LeadFormCanvas
        mode="live"
        name={form.name}
        fields={form.fields}
        theme={theme}
        values={values}
        onChangeValue={(id, value) =>
          setValues((v) => ({ ...v, [id]: value }))
        }
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        doneMessage={doneMessage}
      />
    </main>
  );
}
