"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Check,
  Mail,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type InboxInfo = {
  id: string;
  display_address: string;
  active: boolean;
};

type InboundRow = {
  id: string;
  sender: string | null;
  subject: string | null;
  received_at: string;
  status: string;
  error: string | null;
};

export default function ReceiptSettingsPage() {
  const [inbox, setInbox] = useState<InboxInfo | null>(null);
  const [recentInbound, setRecentInbound] = useState<InboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/receipts/inbox");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load inbox");
      setInbox(json.inbox);
      setRecentInbound(json.recentInbound || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  async function copyInbox() {
    if (!inbox?.display_address) return;
    await navigator.clipboard.writeText(inbox.display_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function rotateInbox() {
    if (
      !window.confirm(
        "Generate a new receipt email? The current address will stop working."
      )
    ) {
      return;
    }
    setRotating(true);
    setError(null);
    try {
      const res = await fetch("/api/receipts/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate", confirm: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to rotate inbox");
      setInbox(json.inbox);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate inbox");
    } finally {
      setRotating(false);
    }
  }

  return (
    <main className="w-full px-4 md:px-8 pt-8 pb-16 max-w-3xl mx-auto">
      <Link
        href="/receipts"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to receipts
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
          Receipt settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Your personal forwarding address and how receipt import works.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900">
          Your receipt email
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Forward receipts from any mailbox to this address. Each PDF or photo
          attachment becomes its own receipt.
        </p>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
          <div className="font-mono text-sm text-gray-900 break-all">
            {loading
              ? "Loading…"
              : inbox?.display_address || "No address yet"}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyInbox()}
            disabled={!inbox?.display_address}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-300" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy email"}
          </button>
          <button
            type="button"
            onClick={() => void rotateInbox()}
            disabled={rotating || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            {rotating ? "Regenerating…" : "Regenerate address"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Regenerating stops the old address from working. Update any filters or
          forwards you already set up.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900">How it works</h2>
        <ol className="mt-3 space-y-3 text-sm text-gray-600 list-decimal list-inside">
          <li>
            Copy your personal address and forward receipt emails to it from
            Gmail, Outlook, or any other inbox.
          </li>
          <li>
            PDF and image attachments are saved as originals. Decorative logos
            and signatures are ignored.
          </li>
          <li>
            We extract merchant, date, amount, and currency for review. You can
            correct anything before marking a receipt reviewed.
          </li>
          <li>
            Receipts are filed by the document date on the receipt — not the day
            the email arrived. Missing dates go to Unfiled.
          </li>
          <li>
            Download a month as a ZIP of originals plus a CSV for your
            accountant from the Receipts page.
          </li>
        </ol>
        <p className="mt-4 text-sm text-gray-500">
          Tip: send a real receipt from your mail app to test. We don’t create a
          simulated one.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Recent inbound</h2>
        <p className="mt-1 text-sm text-gray-500">
          Latest emails received at your receipt address, including failed
          imports.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Loading…</p>
        ) : recentInbound.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No inbound emails yet. Forward a receipt to get started.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {recentInbound.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start gap-2 rounded-lg border border-gray-100 px-3 py-2.5 text-sm"
              >
                <Mail className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900">
                    {row.subject || "(no subject)"}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {row.sender || "unknown"} ·{" "}
                    {new Date(row.received_at).toLocaleString()}
                  </div>
                  {row.error ? (
                    <div className="text-xs text-red-600 mt-1">{row.error}</div>
                  ) : null}
                </div>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                  {row.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
