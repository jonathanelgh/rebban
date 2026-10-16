"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { CsvImportPreview, CsvImportRow } from "@/lib/outreach/import";

type ImportResult = {
  imported: number;
  skipped: number;
  duplicate: number;
  invalid: number;
  errors: { rowNumber: number; error: string }[];
};

export default function AdminLeadsImportPage() {
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function runPreview(text: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/admin/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "preview", csv: text }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Preview failed.");
      return;
    }
    const data = json as CsvImportPreview;
    setPreview(data);
    setCsvText(text);
    setSelected(
      new Set(data.rows.filter((r) => r.valid).map((r) => r.rowNumber))
    );
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    await runPreview(text);
  }

  async function commit() {
    if (!csvText || !selected.size) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "commit",
        csv: csvText,
        rows: Array.from(selected),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Import failed.");
      return;
    }
    setResult(json as ImportResult);
  }

  const validCount = preview?.rows.filter((r) => r.valid).length || 0;
  const invalidCount = preview?.rows.filter((r) => !r.valid).length || 0;

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-6">
        <Link
          href="/admin/leads"
          className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to leads
        </Link>
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
          Import leads
        </h1>
        <p className="text-gray-500 mt-1.5 text-[15px]">
          Upload a CSV, preview rows, then import without duplicating emails.
        </p>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      {result && (
        <div className="mb-4 p-4 rounded-xl border border-emerald-100 bg-emerald-50 text-sm text-emerald-900">
          <p className="font-medium mb-1">Import complete</p>
          <p>
            {result.imported} imported · {result.duplicate} duplicate ·{" "}
            {result.invalid} invalid · {result.skipped} skipped
          </p>
          <Link
            href="/admin/leads"
            className="inline-block mt-2 text-[13px] font-medium text-[#2563EB]"
          >
            View leads →
          </Link>
        </div>
      )}

      <div className="surface-panel p-5 mb-5">
        <label className="block">
          <span className="text-sm font-medium text-gray-900">CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-2 block w-full text-sm text-gray-600"
            onChange={(e) => void onFile(e.target.files?.[0] || null)}
            disabled={busy}
          />
        </label>
        <p className="mt-3 text-[12px] text-gray-400">
          Expected columns: Name, Role, Location, Public Contact, Source URL,
          Lead Tier, Research Status, Website Summary, Personalized Opener,
          Subject, First Outreach Email, Research Confidence, Ready to Send,
          Caution, Outreach Status.
        </p>
      </div>

      {preview && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-sm text-gray-600">
              {preview.rows.length} rows · {validCount} valid · {invalidCount}{" "}
              invalid · {selected.size} selected
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    new Set(
                      preview.rows.filter((r) => r.valid).map((r) => r.rowNumber)
                    )
                  )
                }
                className="px-3 py-1.5 rounded-lg text-[13px] border border-line"
              >
                Select valid
              </button>
              <button
                type="button"
                disabled={busy || !selected.size}
                onClick={() => void commit()}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-gray-900 text-white disabled:opacity-40"
              >
                {busy ? "Importing…" : `Import ${selected.size}`}
              </button>
            </div>
          </div>

          <div className="surface-panel overflow-hidden">
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-sm text-left min-w-[800px]">
                <thead className="bg-[#FAFBFC] border-b border-line text-[12px] uppercase tracking-wide text-gray-400 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-10" />
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Ready</th>
                    <th className="px-3 py-2 font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.rows.map((row) => (
                    <PreviewRow
                      key={row.rowNumber}
                      row={row}
                      checked={selected.has(row.rowNumber)}
                      onToggle={(checked) => {
                        const next = new Set(selected);
                        if (checked) next.add(row.rowNumber);
                        else next.delete(row.rowNumber);
                        setSelected(next);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function PreviewRow({
  row,
  checked,
  onToggle,
}: {
  row: CsvImportRow;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <tr className={!row.valid ? "bg-red-50/40" : undefined}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          disabled={!row.valid}
          checked={checked && row.valid}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </td>
      <td className="px-3 py-2 text-gray-400">{row.rowNumber}</td>
      <td className="px-3 py-2 font-medium text-gray-900">
        {row.displayName || "—"}
      </td>
      <td className="px-3 py-2 text-gray-600">{row.email || "—"}</td>
      <td className="px-3 py-2 text-gray-600">{row.outreachStatus}</td>
      <td className="px-3 py-2 text-gray-600">
        {row.readyToSend ? "Yes" : "No"}
      </td>
      <td className="px-3 py-2 text-[12px] text-red-600">
        {row.errors.join(", ") || "—"}
      </td>
    </tr>
  );
}
