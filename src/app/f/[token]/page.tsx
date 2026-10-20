"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LeadFormCanvas } from "@/components/leads/LeadFormCanvas";
import {
  LEAD_FORM_EMBED_RESIZE,
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

function PublicLeadFormInner() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = params.token;
  const rootRef = useRef<HTMLElement>(null);
  const [form, setForm] = useState<PublicForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [inIframe, setInIframe] = useState(false);

  const embedded =
    searchParams.get("embed") === "1" || inIframe;

  useEffect(() => {
    try {
      setInIframe(window.self !== window.top);
    } catch {
      // Cross-origin frame access can throw; treat as embedded.
      setInIframe(true);
    }
  }, []);

  useEffect(() => {
    if (!embedded) return;

    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlBg: html.style.backgroundColor,
      htmlHeight: html.style.height,
      htmlMinHeight: html.style.minHeight,
      htmlOverflow: html.style.overflow,
      bodyBg: body.style.backgroundColor,
      bodyHeight: body.style.height,
      bodyMinHeight: body.style.minHeight,
      bodyOverflow: body.style.overflow,
    };

    html.style.backgroundColor = "transparent";
    html.style.height = "auto";
    html.style.minHeight = "0";
    html.style.overflow = "hidden";
    body.style.backgroundColor = "transparent";
    body.style.height = "auto";
    body.style.minHeight = "0";
    body.style.overflow = "hidden";

    return () => {
      html.style.backgroundColor = prev.htmlBg;
      html.style.height = prev.htmlHeight;
      html.style.minHeight = prev.htmlMinHeight;
      html.style.overflow = prev.htmlOverflow;
      body.style.backgroundColor = prev.bodyBg;
      body.style.height = prev.bodyHeight;
      body.style.minHeight = prev.bodyMinHeight;
      body.style.overflow = prev.bodyOverflow;
    };
  }, [embedded]);

  useEffect(() => {
    if (!embedded) return;

    function postHeight() {
      const el = rootRef.current;
      const height = Math.ceil(
        el
          ? el.getBoundingClientRect().height
          : Math.max(
              document.documentElement.scrollHeight,
              document.body.scrollHeight
            )
      );
      if (!height || !window.parent || window.parent === window) return;
      window.parent.postMessage(
        { type: LEAD_FORM_EMBED_RESIZE, token, height },
        "*"
      );
    }

    postHeight();
    const raf = window.requestAnimationFrame(postHeight);
    window.addEventListener("load", postHeight);
    window.addEventListener("resize", postHeight);

    const observers: ResizeObserver[] = [];
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => postHeight());
      if (rootRef.current) ro.observe(rootRef.current);
      ro.observe(document.body);
      observers.push(ro);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("load", postHeight);
      window.removeEventListener("resize", postHeight);
      for (const ro of observers) ro.disconnect();
    };
  }, [embedded, token, form, doneMessage, error, submitting]);

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
      <main
        ref={rootRef}
        className={`flex items-center justify-center p-6 ${
          embedded ? "min-h-0 w-full" : "min-h-screen bg-[#F0F1F3]"
        }`}
      >
        <p className="text-sm text-gray-500">{error}</p>
      </main>
    );
  }

  if (!form) {
    return (
      <main
        ref={rootRef}
        className={`flex items-center justify-center p-6 ${
          embedded ? "min-h-0 w-full" : "min-h-screen bg-[#F0F1F3]"
        }`}
      >
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main
      ref={rootRef}
      className={`flex items-start justify-center ${
        embedded ? "min-h-0 w-full p-0" : "min-h-screen p-4 sm:p-8"
      }`}
      style={embedded ? undefined : { backgroundColor: theme.pageBg }}
    >
      <LeadFormCanvas
        mode="live"
        embedded={embedded}
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

export default function PublicLeadFormPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-6">
          <p className="text-sm text-gray-400">Loading…</p>
        </main>
      }
    >
      <PublicLeadFormInner />
    </Suspense>
  );
}
