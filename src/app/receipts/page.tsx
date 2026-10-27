"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Upload,
  Copy,
  Check,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Mail,
  AlertCircle,
  FileText,
  Trash2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { formatReceiptMoney, fromMinorUnits } from "@/lib/receipts/money";
import { MONTH_NAMES } from "@/lib/receipts/constants";
import type { Enums } from "@/types/database";

type ReviewStatus = Enums<"receipt_review_status">;
type ReceiptSource = Enums<"receipt_source">;

type ReceiptRow = {
  id: string;
  merchant: string | null;
  receipt_date: string | null;
  amount_minor: number | null;
  currency: string | null;
  tax_amount_minor: number | null;
  document_type: string;
  review_status: ReviewStatus;
  source: ReceiptSource;
  original_filename: string | null;
  note: string | null;
  category: string | null;
  is_possible_duplicate: boolean;
  created_at: string;
};

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

const STATUS_STYLES: Record<ReviewStatus, string> = {
  processing: "bg-amber-50 text-amber-800",
  ready: "bg-[#EFF6FF] text-[#2563EB]",
  needs_review: "bg-[#FEF2F2] text-red-700",
  possible_duplicate: "bg-orange-50 text-orange-800",
  failed: "bg-gray-100 text-gray-600",
  reviewed: "bg-[#F3FAF6] text-emerald-700",
};

function statusLabel(status: ReviewStatus) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string | null) {
  if (!iso) return "Unfiled";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default function ReceiptsPage() {
  return (
    <Suspense
      fallback={
        <main className="w-full px-4 md:px-8 pt-10 pb-8 max-w-7xl mx-auto text-sm text-gray-500">
          Loading receipts…
        </main>
      }
    >
      <ReceiptsPageInner />
    </Suspense>
  );
}

function ReceiptsPageInner() {
  const { organizationId } = useProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<"month" | "unfiled">("month");
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [monthCounts, setMonthCounts] = useState<
    Record<string, { total: number; review: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [inbox, setInbox] = useState<InboxInfo | null>(null);
  const [recentInbound, setRecentInbound] = useState<InboundRow[]>([]);
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yearsOpen, setYearsOpen] = useState<Record<number, boolean>>({
    [now.getFullYear()]: true,
  });

  const loadInbox = useCallback(async () => {
    const res = await fetch("/api/receipts/inbox");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load inbox");
    setInbox(json.inbox);
    setRecentInbound(json.recentInbound || []);
  }, []);

  const loadMonthCounts = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    const { data, error: qError } = await supabase
      .from("receipts")
      .select("receipt_date, review_status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("receipt_date", "is", null);

    if (qError) throw new Error(qError.message);
    const counts: Record<string, { total: number; review: number }> = {};
    for (const row of data || []) {
      if (!row.receipt_date) continue;
      const key = row.receipt_date.slice(0, 7);
      if (!counts[key]) counts[key] = { total: 0, review: 0 };
      counts[key].total += 1;
      if (
        row.review_status === "needs_review" ||
        row.review_status === "possible_duplicate" ||
        row.review_status === "failed"
      ) {
        counts[key].review += 1;
      }
    }
    setMonthCounts(counts);
  }, [organizationId]);

  const loadReceipts = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      let q = supabase
        .from("receipts")
        .select(
          "id, merchant, receipt_date, amount_minor, currency, tax_amount_minor, document_type, review_status, source, original_filename, note, category, is_possible_duplicate, created_at"
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("receipt_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);

      if (viewMode === "unfiled") {
        q = q.is("receipt_date", null);
      } else {
        const start = `${year}-${String(month).padStart(2, "0")}-01`;
        const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const end = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
        q = q.gte("receipt_date", start).lte("receipt_date", end);
      }

      const { data, error: qError } = await q;
      if (qError) throw new Error(qError.message);
      setReceipts((data || []) as ReceiptRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }, [organizationId, year, month, viewMode]);

  useEffect(() => {
    if (!organizationId) return;
    void loadInbox().catch((err) =>
      setError(err instanceof Error ? err.message : "Inbox error")
    );
    void loadMonthCounts().catch(() => undefined);
  }, [organizationId, loadInbox, loadMonthCounts]);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return receipts.filter((r) => {
      if (statusFilter !== "all" && r.review_status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        r.merchant,
        r.original_filename,
        r.note,
        r.category,
        r.currency,
        r.amount_minor != null ? String(fromMinorUnits(r.amount_minor, r.currency || "USD")) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [receipts, query, statusFilter]);

  const summary = useMemo(() => {
    const needsReview = filtered.filter(
      (r) =>
        r.review_status === "needs_review" ||
        r.review_status === "possible_duplicate" ||
        r.review_status === "failed"
    ).length;
    const duplicates = filtered.filter((r) => r.is_possible_duplicate).length;
    const totalMinorByCurrency: Record<string, number> = {};
    for (const r of filtered) {
      if (r.amount_minor == null || !r.currency) continue;
      totalMinorByCurrency[r.currency] =
        (totalMinorByCurrency[r.currency] || 0) + r.amount_minor;
    }
    return {
      total: filtered.length,
      needsReview,
      duplicates,
      totals: totalMinorByCurrency,
    };
  }, [filtered]);

  async function copyInbox() {
    if (!inbox?.display_address) return;
    await navigator.clipboard.writeText(inbox.display_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const res = await fetch("/api/receipts/upload", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      await loadReceipts();
      await loadMonthCounts();
      const firstOk = (json.results || []).find(
        (r: { ok?: boolean; receipt?: { id: string } }) => r.ok && r.receipt?.id
      );
      if (firstOk?.receipt?.id) setSelectedId(firstOk.receipt.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function exportMonth() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/receipts/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Export failed");
      if (json.downloadUrl) {
        window.open(json.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function rotateInbox() {
    if (
      !window.confirm(
        "Generate a new receipt email? The current address will stop working."
      )
    ) {
      return;
    }
    const res = await fetch("/api/receipts/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rotate", confirm: true }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to rotate inbox");
      return;
    }
    setInbox(json.inbox);
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setViewMode("month");
  }

  const browserYears = useMemo(() => {
    const years = new Set<number>([now.getFullYear(), now.getFullYear() - 1]);
    for (const key of Object.keys(monthCounts)) {
      years.add(Number(key.slice(0, 4)));
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [monthCounts, now]);

  return (
    <main className="w-full px-4 md:px-8 pt-8 pb-16 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Receipts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Forward or upload expense receipts. We keep the originals and file
            them by document date.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyInbox()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy receipt email"}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload receipts"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.pdf,.jpg,.jpeg,.png,.webp,.heic"
            multiple
            className="hidden"
            onChange={(e) => void onUpload(e.target.files)}
          />
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button type="button" className="ml-auto" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Your receipt email
            </div>
            <div className="mt-1 font-mono text-sm text-gray-900 break-all">
              {inbox?.display_address || "Loading…"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setHowOpen((v) => !v)}
              className="text-sm text-gray-600 underline-offset-2 hover:underline"
            >
              How it works
            </button>
            <button
              type="button"
              onClick={() => void rotateInbox()}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Regenerate address
            </button>
          </div>
        </div>
        {howOpen ? (
          <div className="mt-3 text-sm text-gray-600 space-y-1 border-t border-gray-100 pt-3">
            <p>1. Copy your personal address and forward receipt emails to it.</p>
            <p>2. PDF and image attachments become separate receipts with originals saved.</p>
            <p>3. We extract merchant, date, and amount for review — you stay in control.</p>
            <p className="text-gray-500">
              Tip: send a real receipt from your mail app to test (we don’t simulate one).
            </p>
          </div>
        ) : null}
        {recentInbound.length > 0 ? (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="text-xs font-medium text-gray-400 mb-2">
              Recent inbound
            </div>
            <ul className="space-y-1.5">
              {recentInbound.slice(0, 5).map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 text-xs text-gray-600"
                >
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-medium text-gray-800">
                    {row.subject || "(no subject)"}
                  </span>
                  <span>· {row.sender || "unknown"}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5">
                    {row.status}
                  </span>
                  {row.error ? (
                    <span className="text-red-600">{row.error}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6">
        <aside className="rounded-xl border border-gray-200 bg-white p-3 h-fit">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400 px-2 mb-2">
            Months
          </div>
          <button
            type="button"
            onClick={() => setViewMode("unfiled")}
            className={`w-full text-left rounded-lg px-2 py-1.5 text-sm mb-2 ${
              viewMode === "unfiled"
                ? "bg-gray-900 text-white"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            Unfiled / Needs date
          </button>
          {browserYears.map((y) => (
            <div key={y} className="mb-2">
              <button
                type="button"
                onClick={() =>
                  setYearsOpen((prev) => ({ ...prev, [y]: !prev[y] }))
                }
                className="flex w-full items-center gap-1 px-2 py-1 text-sm font-medium text-gray-800"
              >
                {yearsOpen[y] ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {y}
              </button>
              {yearsOpen[y] ? (
                <div className="mt-1 space-y-0.5">
                  {MONTH_NAMES.map((label, idx) => {
                    const m = idx + 1;
                    const key = monthKey(y, m);
                    const counts = monthCounts[key];
                    const active =
                      viewMode === "month" && year === y && month === m;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setYear(y);
                          setMonth(m);
                          setViewMode("month");
                        }}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm ${
                          active
                            ? "bg-gray-900 text-white"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span>{label}</span>
                        <span
                          className={`text-xs ${
                            active ? "text-gray-300" : "text-gray-400"
                          }`}
                        >
                          {counts?.total || 0}
                          {counts?.review ? ` · ${counts.review}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </aside>

        <section className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="flex items-center gap-2">
              {viewMode === "month" ? (
                <>
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {MONTH_NAMES[month - 1]} {year}
                  </h2>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <h2 className="text-lg font-semibold text-gray-900">
                  Unfiled
                </h2>
              )}
            </div>
            {viewMode === "month" ? (
              <button
                type="button"
                onClick={() => void exportMonth()}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {exporting ? "Preparing…" : "Download month"}
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard label="Total receipts" value={String(summary.total)} />
            <SummaryCard label="Needs review" value={String(summary.needsReview)} />
            <SummaryCard
              label="Possible duplicates"
              value={String(summary.duplicates)}
            />
            <SummaryCard
              label="Document totals"
              value={
                Object.keys(summary.totals).length === 0
                  ? "—"
                  : Object.entries(summary.totals)
                      .map(([c, minor]) => formatReceiptMoney(minor, c))
                      .join(" · ")
              }
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search merchant, filename, amount…"
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="needs_review">Needs review</option>
              <option value="possible_duplicate">Possible duplicate</option>
              <option value="ready">Ready</option>
              <option value="reviewed">Reviewed</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {loading ? (
              <div className="px-4 py-10 text-sm text-gray-500">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <FileText className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-700 font-medium">
                  Forward a receipt to your personal address or upload a file to
                  get started.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Merchant</th>
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Amount</th>
                      <th className="px-4 py-2.5 font-medium">Source</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            {r.merchant || "Unknown merchant"}
                          </div>
                          <div className="text-xs text-gray-400 truncate max-w-[220px]">
                            {r.original_filename || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {formatDate(r.receipt_date)}
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {formatReceiptMoney(r.amount_minor, r.currency)}
                        </td>
                        <td className="px-4 py-3 capitalize text-gray-600">
                          {r.source}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.review_status]}`}
                          >
                            {statusLabel(r.review_status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedId ? (
        <ReceiptDetailDrawer
          receiptId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={async () => {
            await loadReceipts();
            await loadMonthCounts();
          }}
        />
      ) : null}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900 truncate">
        {value}
      </div>
    </div>
  );
}

function ReceiptDetailDrawer({
  receiptId,
  onClose,
  onChanged,
}: {
  receiptId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [inbound, setInbound] = useState<{
    sender: string | null;
    subject: string | null;
    received_at: string;
    message_id: string | null;
  } | null>(null);
  const [form, setForm] = useState({
    merchant: "",
    receipt_date: "",
    amount: "",
    currency: "EUR",
    tax_amount: "",
    note: "",
    category: "",
    review_status: "needs_review" as ReviewStatus,
    original_filename: "",
    source: "upload" as ReceiptSource,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${receiptId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      const r = json.receipt;
      setForm({
        merchant: r.merchant || "",
        receipt_date: r.receipt_date || "",
        amount:
          r.amount_minor != null && r.currency
            ? String(fromMinorUnits(r.amount_minor, r.currency) ?? "")
            : "",
        currency: r.currency || "EUR",
        tax_amount:
          r.tax_amount_minor != null && r.currency
            ? String(fromMinorUnits(r.tax_amount_minor, r.currency) ?? "")
            : "",
        note: r.note || "",
        category: r.category || "",
        review_status: r.review_status,
        original_filename: r.original_filename || "",
        source: r.source,
      });
      setDownloadUrl(json.downloadUrl || null);
      setInbound(json.inbound || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(extra?: { mark_reviewed?: boolean }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: form.merchant || null,
          receipt_date: form.receipt_date || null,
          amount: form.amount === "" ? null : Number(form.amount),
          currency: form.currency || null,
          tax_amount: form.tax_amount === "" ? null : Number(form.tax_amount),
          note: form.note || null,
          category: form.category || null,
          ...extra,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      await onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function reextract() {
    setSaving(true);
    try {
      const res = await fetch(`/api/receipts/${receiptId}/reextract`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Re-extract failed");
      await onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-extract failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this receipt? The original file is retained per retention rules until hard-deleted.")) {
      return;
    }
    const res = await fetch(`/api/receipts/${receiptId}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Delete failed");
      return;
    }
    await onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Receipt</div>
            <div className="text-xs text-gray-500 truncate max-w-[280px]">
              {form.original_filename || receiptId.slice(0, 8)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                {downloadUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <iframe
                    title="Receipt preview"
                    src={downloadUrl}
                    className="w-full h-72 rounded-lg bg-white border border-gray-200"
                  />
                ) : (
                  <div className="h-40 flex items-center justify-center text-sm text-gray-500">
                    Preview unavailable
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {downloadUrl ? (
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline-offset-2 hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download original
                    </a>
                  ) : null}
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[form.review_status]}`}
                  >
                    {statusLabel(form.review_status)}
                  </span>
                  <span className="text-xs text-gray-500 capitalize">
                    {form.source}
                  </span>
                </div>
              </div>

              {inbound ? (
                <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
                  <div className="font-medium text-gray-800">Email source</div>
                  <div>From: {inbound.sender || "—"}</div>
                  <div>Subject: {inbound.subject || "—"}</div>
                  <div>
                    Received:{" "}
                    {new Date(inbound.received_at).toLocaleString()}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm sm:col-span-2">
                  <span className="text-xs text-gray-500">Merchant</span>
                  <input
                    value={form.merchant}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, merchant: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-xs text-gray-500">Document date</span>
                  <input
                    type="date"
                    value={form.receipt_date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, receipt_date: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-xs text-gray-500">Currency</span>
                  <input
                    value={form.currency}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        currency: e.target.value.toUpperCase(),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                    maxLength={3}
                  />
                </label>
                <label className="text-sm">
                  <span className="text-xs text-gray-500">Amount</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-xs text-gray-500">Tax (optional)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.tax_amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tax_amount: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="text-xs text-gray-500">Category / tag</span>
                  <input
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="text-xs text-gray-500">Note</span>
                  <textarea
                    value={form.note}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, note: e.target.value }))
                    }
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  Save changes
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save({ mark_reviewed: true })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark reviewed
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void reextract()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
                >
                  <RefreshCw className="h-4 w-4" />
                  Re-run extraction
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 ml-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
