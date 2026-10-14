"use client";

import React, { useState } from "react";
import { Mail, Send, X } from "lucide-react";
import { DEFAULT_INVOICE_SEND_MESSAGE } from "@/lib/invoices/send";

export function SendInvoiceModal({
  invoiceId,
  invoiceLabel,
  defaultEmail,
  defaultName,
  onClose,
  onSent,
}: {
  invoiceId: string;
  invoiceLabel: string;
  defaultEmail?: string | null;
  defaultName?: string | null;
  onClose: () => void;
  onSent: (result: {
    url: string;
    recipientEmail: string;
    status?: string;
    paymentToken?: string;
  }) => void;
}) {
  const [email, setEmail] = useState(defaultEmail || "");
  const [name, setName] = useState(defaultName || "");
  const [message, setMessage] = useState(DEFAULT_INVOICE_SEND_MESSAGE);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!email.trim()) {
      setError("Recipient email is required.");
      return;
    }
    setSending(true);
    setError(null);

    const res = await fetch(`/api/invoices/${invoiceId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientEmail: email.trim(),
        recipientName: name.trim(),
        message: message.trim() || DEFAULT_INVOICE_SEND_MESSAGE,
      }),
    });
    const json = await res.json();
    setSending(false);

    if (!res.ok) {
      setError(json.error || "Failed to send invoice.");
      return;
    }

    onSent({
      url: json.url,
      recipientEmail: json.recipientEmail,
      status: json.status,
      paymentToken: json.paymentToken,
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-t-[1.75rem] sm:rounded-[2rem] border border-line w-full max-w-[520px] max-h-[90vh] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)] flex flex-col">
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-line flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                Send invoice
              </h2>
              <p className="text-[13px] text-gray-500 mt-0.5 truncate">
                {invoiceLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Recipient email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@company.com"
              className="w-full border border-line rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-300"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Recipient name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="w-full border border-line rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-300"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full border border-line rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-300 resize-none"
            />
            <p className="mt-2 text-[12px] text-gray-400">
              Sent from your connected Gmail when available, otherwise via Rebban
              email.
            </p>
          </div>

          {error && (
            <div className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void handleSend()}
            className="btn-primary inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-sm disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {sending ? "Sending…" : "Send invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
