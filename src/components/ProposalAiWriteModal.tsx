"use client";

import React, { useRef, useState } from "react";
import { Loader2, Sparkles, UploadCloud, X } from "lucide-react";
import {
  ModalOverlay,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";

export function ProposalAiWriteModal({
  proposalId,
  onClose,
  onApplied,
}: {
  proposalId: string;
  onClose: () => void;
  onApplied: (result: { title: string; amount: number }) => void;
}) {
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleGenerate() {
    if (busy) return;
    if (!notes.trim() && !file) {
      setError("Paste notes or upload a file with project details.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("notes", notes);
      if (file) form.set("file", file);

      const res = await fetch(`/api/proposals/${proposalId}/generate`, {
        method: "POST",
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not generate proposal copy.");
        return;
      }
      onApplied({
        title: String(json.title || ""),
        amount: Number(json.amount) || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClose={busy ? () => undefined : onClose} zClass="z-[70]">
      <div className={modalPanelClass("max-w-[560px]")}>
        <div className={`${modalHeaderClass} border-b border-line`}>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900">Write with AI</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Replace this proposal’s copy from your notes or a brief.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 shrink-0 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5">
            <div className="flex items-start gap-3 text-sm text-gray-600 mb-4">
              <Sparkles className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <p>
                AI will rewrite summary, goals, scope, deliverables, approach,
                timeline, pricing, payment, terms, and next steps. Your template
                look and layout stay.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.csv,.json,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                e.target.value = "";
              }}
            />

            <div
              className={`w-full border-2 border-dashed rounded-xl p-6 text-center ${
                file ? "border-blue-200 bg-white" : "border-gray-200 bg-white"
              }`}
            >
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-500">
                <UploadCloud className="w-5 h-5" />
              </div>
              {file ? (
                <>
                  <div className="text-sm font-medium text-gray-900 mb-1 truncate px-2">
                    {file.name}
                  </div>
                  <div className="flex items-center justify-center gap-3 text-xs">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fileInputRef.current?.click()}
                      className="font-medium text-blue-600 hover:text-blue-700"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setFile(null)}
                      className="font-medium text-gray-500 hover:text-gray-700"
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-medium text-gray-900 mb-1">
                    Upload notes or a brief
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    .txt, .md, .docx, or .pdf · up to 8MB
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Choose file
                  </button>
                </>
              )}
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              placeholder="Or paste client emails, call notes, or project requirements here..."
              className="w-full mt-4 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none min-h-[140px] disabled:opacity-60"
            />
          </div>

          {error && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end bg-gray-50/50 shrink-0 gap-2 sm:gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (!notes.trim() && !file)}
            onClick={() => void handleGenerate()}
            className="btn-primary px-6 py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Writing… (~20s)
              </>
            ) : (
              <>
                Generate copy <Sparkles className="w-4 h-4 fill-current" />
              </>
            )}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
