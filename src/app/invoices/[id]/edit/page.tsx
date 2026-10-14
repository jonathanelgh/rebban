"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Eye,
  GripVertical,
  Plus,
  Save,
  Trash2,
  Check,
  Send,
  Ban,
  CircleDollarSign,
  Link2,
  Copy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { MenuSelect } from "@/components/MenuSelect";
import {
  computeInvoiceTotals,
  formatInvoiceMoney,
  lineAmount,
} from "@/lib/invoices/totals";
import type { Enums } from "@/types/database";

type InvoiceStatus = Enums<"invoice_status">;

type LineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  isNew?: boolean;
};

type ClientInfo = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  address?: string | null;
};

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-[#EFF6FF] text-[#2563EB]",
  viewed: "bg-[#F5F3FF] text-violet-700",
  paid: "bg-[#F3FAF6] text-emerald-700",
  overdue: "bg-[#FEF2F2] text-red-700",
  void: "bg-gray-100 text-gray-500",
};

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "SEK", label: "SEK" },
];

function statusLabel(status: InvoiceStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function emptyLine(): LineItem {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: "",
    quantity: "1",
    unitPrice: "0",
    isNew: true,
  };
}

export default function InvoiceEditorPage() {
  const params = useParams();
  const invoiceId = String(params.id || "");
  const router = useRouter();
  const {
    organizationId,
    fullName,
    email: profileEmail,
    logoUrl,
    organizationCurrency,
    loading: profileLoading,
  } = useProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [number, setNumber] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [currency, setCurrency] = useState("USD");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [taxTotal, setTaxTotal] = useState("0");
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgAddress, setOrgAddress] = useState<string | null>(null);
  const [orgLegalName, setOrgLegalName] = useState<string | null>(null);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [originalLineIds, setOriginalLineIds] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeBusy, setStripeBusy] = useState(false);

  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
        taxTotal
      ),
    [lines, taxTotal]
  );

  const load = useCallback(async () => {
    if (!organizationId || !invoiceId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [invoiceRes, linesRes, clientsRes, orgRes] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, number, status, currency, issue_date, due_date, notes, tax_total, client_id, clients(id, name, company, email)"
        )
        .eq("id", invoiceId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("invoice_line_items")
        .select("id, description, quantity, unit_price, position")
        .eq("invoice_id", invoiceId)
        .eq("organization_id", organizationId)
        .order("position", { ascending: true }),
      supabase
        .from("clients")
        .select("id, name, company, email")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("organizations")
        .select("name, legal_name, address")
        .eq("id", organizationId)
        .maybeSingle(),
    ]);

    if (invoiceRes.error || !invoiceRes.data) {
      setError(invoiceRes.error?.message || "Invoice not found.");
      setLoading(false);
      return;
    }

    const row = invoiceRes.data;
    const clientRel = row.clients as
      | { id: string; name: string; company: string | null; email: string | null }
      | null
      | undefined;

    setNumber(row.number || "");
    setStatus(row.status);
    setCurrency(row.currency || organizationCurrency || "USD");
    setIssueDate(row.issue_date || "");
    setDueDate(row.due_date || "");
    setNotes(row.notes || "");
    setTaxTotal(String(Number(row.tax_total || 0)));
    setClient(
      clientRel
        ? {
            id: clientRel.id,
            name: clientRel.name,
            company: clientRel.company,
            email: clientRel.email,
          }
        : null
    );

    const loadedLines =
      (linesRes.data ?? []).map((line) => ({
        id: line.id,
        description: line.description,
        quantity: String(line.quantity ?? 1),
        unitPrice: String(line.unit_price ?? 0),
      })) || [];
    setLines(loadedLines.length ? loadedLines : [emptyLine()]);
    setOriginalLineIds(loadedLines.map((l) => l.id));
    setClients(clientsRes.data ?? []);
    setOrgName(orgRes.data?.name || "Your business");
    setOrgLegalName(orgRes.data?.legal_name || null);
    setOrgAddress(orgRes.data?.address || null);
    setLoading(false);
  }, [organizationId, invoiceId, organizationCurrency]);

  useEffect(() => {
    if (profileLoading) return;
    void load();
  }, [profileLoading, load]);

  function flash(msg: string) {
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 2400);
  }

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== id)));
  }

  async function persist(nextStatus?: InvoiceStatus) {
    if (!organizationId || !invoiceId || !client) {
      setError("Client is required.");
      return false;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { subtotal, taxTotal: tax, total } = totals;
    const statusToSave = nextStatus || status;

    const updatePayload: {
      number: string | null;
      status: InvoiceStatus;
      currency: string;
      issue_date: string | null;
      due_date: string | null;
      notes: string | null;
      client_id: string;
      subtotal: number;
      tax_total: number;
      total: number;
      sent_at?: string;
      paid_at?: string | null;
    } = {
      number: number.trim() || null,
      status: statusToSave,
      currency,
      issue_date: issueDate || null,
      due_date: dueDate || null,
      notes: notes.trim() || null,
      client_id: client.id,
      subtotal,
      tax_total: tax,
      total,
    };

    if (
      (statusToSave === "sent" || statusToSave === "viewed") &&
      status === "draft"
    ) {
      updatePayload.sent_at = new Date().toISOString();
    }
    if (statusToSave === "paid") {
      updatePayload.paid_at = new Date().toISOString();
    }

    const { error: invoiceError } = await supabase
      .from("invoices")
      .update(updatePayload)
      .eq("id", invoiceId)
      .eq("organization_id", organizationId);

    if (invoiceError) {
      setError(invoiceError.message);
      setSaving(false);
      return false;
    }

    const keptIds = new Set(lines.filter((l) => !l.isNew).map((l) => l.id));
    const removedIds = originalLineIds.filter((id) => !keptIds.has(id));
    if (removedIds.length > 0) {
      await supabase.from("invoice_line_items").delete().in("id", removedIds);
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const qty = Number(line.quantity) || 0;
      const price = Number(line.unitPrice) || 0;
      const amount = lineAmount(qty, price);
      const description = line.description.trim() || "Line item";

      if (line.isNew) {
        const { data, error: insertError } = await supabase
          .from("invoice_line_items")
          .insert({
            organization_id: organizationId,
            invoice_id: invoiceId,
            description,
            quantity: qty,
            unit_price: price,
            amount,
            position: index,
          })
          .select("id")
          .single();
        if (insertError) {
          setError(insertError.message);
          setSaving(false);
          return false;
        }
        if (data) {
          line.id = data.id;
          line.isNew = false;
        }
      } else {
        const { error: updateError } = await supabase
          .from("invoice_line_items")
          .update({
            description,
            quantity: qty,
            unit_price: price,
            amount,
            position: index,
          })
          .eq("id", line.id);
        if (updateError) {
          setError(updateError.message);
          setSaving(false);
          return false;
        }
      }
    }

    setLines([...lines]);
    setOriginalLineIds(lines.map((l) => l.id));
    if (nextStatus) setStatus(nextStatus);
    setSaving(false);
    flash("Saved");
    return true;
  }

  async function handleMarkSent() {
    const ok = await persist("sent");
    if (ok) flash("Marked as sent");
  }

  async function handleMarkPaid() {
    const ok = await persist("paid");
    if (ok) flash("Marked as paid");
  }

  useEffect(() => {
    let cancelled = false;
    async function loadStripeStatus() {
      const res = await fetch("/api/stripe/connect/status");
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as {
        configured?: boolean;
        connected?: boolean;
        ready?: boolean;
      };
      if (cancelled) return;
      setStripeConfigured(Boolean(json.configured));
      setStripeConnected(Boolean(json.connected));
      setStripeReady(Boolean(json.ready));
    }
    void loadStripeStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStripeConnect() {
    setStripeBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url || typeof json.url !== "string") {
        setError(json.error || "Could not start Stripe onboarding.");
        return;
      }
      // Use assign with a validated absolute URL (avoids Safari pattern errors).
      const next = new URL(json.url);
      window.location.assign(next.toString());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start Stripe onboarding."
      );
    } finally {
      setStripeBusy(false);
    }
  }

  async function handleCreatePaymentLink() {
    if (!invoiceId) return;
    setPaymentBusy(true);
    setError(null);
    const saved = await persist();
    if (!saved) {
      setPaymentBusy(false);
      return;
    }
    const res = await fetch(`/api/stripe/invoices/${invoiceId}/checkout`, {
      method: "POST",
    });
    const json = await res.json();
    setPaymentBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not create payment link");
      return;
    }
    const url = (json.paymentUrl || json.url) as string;
    setPaymentUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      flash("Payment link copied");
    } catch {
      flash("Payment link ready");
    }
  }

  async function handleVoid() {
    const ok = await persist("void");
    if (ok) flash("Invoice voided");
  }

  async function handleDelete() {
    if (!organizationId || !invoiceId) return;
    if (!window.confirm("Delete this invoice? This cannot be undone easily.")) return;
    const supabase = createClient();
    await supabase
      .from("invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("organization_id", organizationId);
    router.push("/invoices");
  }

  if (profileLoading || loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500">
        Loading invoice…
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
        <p>{error}</p>
        <Link href="/invoices" className="text-[#2563EB] font-medium">
          Back to invoices
        </Link>
      </div>
    );
  }

  const fromName = orgLegalName || orgName || fullName || "Your business";
  const billTo = client?.company || client?.name || "Client";

  return (
    <div className="h-full min-h-0 bg-[#F7F8FA] flex flex-col font-sans">
      <header className="h-16 bg-white border-b border-line px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-6 min-w-0">
          <Link
            href="/invoices"
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Invoices
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 min-w-0">
            <CircleDollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="truncate max-w-[240px]">
              {number || "Draft invoice"}
            </span>
            <span
              className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS_STYLES[status]}`}
            >
              {statusLabel(status)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {message && (
            <span className="hidden sm:inline text-[13px] font-medium text-emerald-600">
              {message}
            </span>
          )}
          <button
            type="button"
            onClick={() => void persist()}
            disabled={saving}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-[#2563EB]" />
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              void persist().then((ok) => {
                if (ok) window.print();
              });
            }}
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          >
            <Eye className="w-4 h-4 text-emerald-500" />
            Preview
          </button>
          {status === "draft" && (
            <button
              type="button"
              onClick={() => void handleMarkSent()}
              disabled={saving}
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Mark sent
            </button>
          )}
          {(status === "sent" || status === "viewed" || status === "overdue") && (
            <button
              type="button"
              onClick={() => void handleMarkPaid()}
              disabled={saving}
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Mark paid
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 relative custom-scrollbar">
          {error && (
            <div className="max-w-[820px] mx-auto mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {error}
            </div>
          )}

          {/* Document canvas — mirrors proposal editor paper */}
          <article className="max-w-[820px] mx-auto bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden print:shadow-none print:border-0">
            <div className="px-6 sm:px-10 pt-8 sm:pt-10 pb-6 border-b border-line bg-gradient-to-b from-[#FAFBFC] to-white">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                <div className="flex items-start gap-3 min-w-0">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt=""
                      className="w-12 h-12 rounded-xl object-contain border border-line bg-white"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gray-950 text-white flex items-center justify-center font-semibold">
                      R.
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-gray-900 tracking-tight">
                      {fromName}
                    </div>
                    {orgAddress && (
                      <p className="text-[13px] text-gray-500 mt-1 whitespace-pre-line">
                        {orgAddress}
                      </p>
                    )}
                    {profileEmail && (
                      <p className="text-[13px] text-gray-500 mt-0.5">{profileEmail}</p>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
                    Invoice
                  </div>
                  <input
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="INV-0001"
                    className="mt-1 w-full sm:w-40 sm:text-right text-xl font-semibold text-gray-900 tracking-tight bg-transparent outline-none border-b border-transparent focus:border-gray-300"
                  />
                  <div className="mt-3 text-[13px] text-gray-500 space-y-1">
                    <div className="flex sm:justify-end items-center gap-2">
                      <span>Issued</span>
                      <input
                        type="date"
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                        className="border border-line rounded-lg px-2 py-1 text-gray-800 bg-white"
                      />
                    </div>
                    <div className="flex sm:justify-end items-center gap-2">
                      <span>Due</span>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="border border-line rounded-lg px-2 py-1 text-gray-800 bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 sm:px-10 py-6 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-line">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Bill to
                </div>
                <select
                  value={client?.id || ""}
                  onChange={(e) => {
                    const next = clients.find((c) => c.id === e.target.value) || null;
                    setClient(next);
                  }}
                  className="w-full border border-line rounded-xl px-3 py-2.5 text-sm font-medium text-gray-900 bg-white outline-none focus:border-gray-300"
                >
                  <option value="" disabled>
                    Select client…
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company || c.name}
                    </option>
                  ))}
                </select>
                {client && (
                  <div className="mt-3 text-[13px] text-gray-600 space-y-0.5">
                    <div className="font-medium text-gray-900">{billTo}</div>
                    {client.company && client.name !== client.company && (
                      <div>{client.name}</div>
                    )}
                    {client.email && <div>{client.email}</div>}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Currency
                </div>
                <MenuSelect
                  value={currency}
                  onChange={setCurrency}
                  options={CURRENCY_OPTIONS}
                />
              </div>
            </div>

            <div className="px-6 sm:px-10 py-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Line items</h2>
                <button
                  type="button"
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8]"
                >
                  <Plus className="w-4 h-4" />
                  Add line
                </button>
              </div>

              <div className="rounded-2xl border border-line overflow-hidden">
                <div className="hidden sm:grid grid-cols-[24px_minmax(0,1.8fr)_90px_110px_110px_36px] gap-2 px-3 py-2.5 bg-[#FAFBFC] border-b border-line text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <span />
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Rate</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>
                <div className="divide-y divide-line">
                  {lines.map((line) => {
                    const amount = lineAmount(line.quantity, line.unitPrice);
                    return (
                      <div
                        key={line.id}
                        className="grid grid-cols-1 sm:grid-cols-[24px_minmax(0,1.8fr)_90px_110px_110px_36px] gap-2 px-3 py-3 items-start sm:items-center"
                      >
                        <div className="hidden sm:flex text-gray-300">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <input
                          value={line.description}
                          onChange={(e) =>
                            updateLine(line.id, { description: e.target.value })
                          }
                          placeholder="Description of work"
                          className="w-full text-sm text-gray-900 outline-none bg-transparent placeholder:text-gray-400"
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.id, { quantity: e.target.value })
                          }
                          className="w-full border border-line sm:border-0 rounded-lg sm:rounded-none px-2 py-1.5 sm:px-0 sm:py-0 text-sm text-gray-900 outline-none bg-transparent"
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(line.id, { unitPrice: e.target.value })
                          }
                          className="w-full border border-line sm:border-0 rounded-lg sm:rounded-none px-2 py-1.5 sm:px-0 sm:py-0 text-sm text-gray-900 outline-none bg-transparent"
                        />
                        <div className="text-sm font-medium text-gray-900 sm:text-right">
                          {formatInvoiceMoney(amount, currency)}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 justify-self-end"
                          title="Remove line"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-6">
                <div className="flex-1">
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Payment instructions, thank-you note, bank details…"
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-300 resize-none"
                  />
                </div>
                <div className="w-full sm:w-[260px] space-y-2.5">
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span className="font-medium text-gray-900">
                      {formatInvoiceMoney(totals.subtotal, currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
                    <span>Tax</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={taxTotal}
                      onChange={(e) => setTaxTotal(e.target.value)}
                      className="w-28 border border-line rounded-lg px-2 py-1 text-right text-sm text-gray-900 outline-none"
                    />
                  </div>
                  <div className="h-px bg-line" />
                  <div className="flex items-center justify-between text-base font-semibold text-gray-900">
                    <span>Total</span>
                    <span>{formatInvoiceMoney(totals.total, currency)}</span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* Right sidebar — same role as proposal editor overview */}
        <aside className="hidden lg:flex w-[320px] shrink-0 border-l border-line bg-[#FAFBFC] flex-col min-h-0 overflow-y-auto">
          <div className="p-5 border-b border-line bg-white">
            <h2 className="text-sm font-semibold text-gray-900">Overview</h2>
            <p className="text-[13px] text-gray-500 mt-1">
              Status, amounts, and invoice actions.
            </p>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <div className="text-[12px] font-medium text-gray-500 mb-1.5">Status</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
              >
                {(
                  ["draft", "sent", "viewed", "paid", "overdue", "void"] as InvoiceStatus[]
                ).map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border border-line bg-white p-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatInvoiceMoney(totals.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Tax</span>
                <span>{formatInvoiceMoney(totals.taxTotal, currency)}</span>
              </div>
              <div className="h-px bg-line" />
              <div className="flex justify-between text-sm font-semibold text-gray-900">
                <span>Total</span>
                <span>{formatInvoiceMoney(totals.total, currency)}</span>
              </div>
            </div>

            {!stripeReady && (
              <div className="rounded-2xl border border-line bg-white p-4">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center shrink-0">
                    <CircleDollarSign className="w-4 h-4 text-[#2563EB]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-gray-900">
                      Collect payments with Stripe
                    </div>
                    <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                      Connect your Stripe account so clients can pay this invoice
                      by card — funds go to your bank.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleStripeConnect()}
                  disabled={stripeBusy || !stripeConfigured}
                  className="mt-3 w-full btn-primary px-4 py-2.5 rounded-xl text-sm disabled:opacity-50"
                >
                  {stripeBusy
                    ? "Opening Stripe…"
                    : !stripeConfigured
                      ? "Stripe not configured"
                      : stripeConnected
                        ? "Continue Stripe setup"
                        : "Connect Stripe"}
                </button>
                {!stripeConfigured && (
                  <p className="mt-2 text-[11px] text-gray-400 leading-relaxed">
                    Add Stripe keys in your environment, or connect from{" "}
                    <Link
                      href="/settings?section=integrations"
                      className="text-[#2563EB] font-medium hover:underline"
                    >
                      Settings → Integrations
                    </Link>
                    .
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void persist()}
                disabled={saving}
                className="w-full btn-primary px-4 py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {status === "draft" && (
                <button
                  type="button"
                  onClick={() => void handleMarkSent()}
                  disabled={saving}
                  className="w-full border border-line bg-white px-4 py-2.5 rounded-xl text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  Mark as sent
                </button>
              )}
              {(status === "sent" || status === "viewed" || status === "overdue") && (
                <>
                  {stripeReady && (
                    <button
                      type="button"
                      onClick={() => void handleCreatePaymentLink()}
                      disabled={saving || paymentBusy}
                      className="w-full inline-flex items-center justify-center gap-2 border border-line bg-white px-4 py-2.5 rounded-xl text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Link2 className="w-4 h-4 text-[#2563EB]" />
                      {paymentBusy ? "Creating link…" : "Payment link"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleMarkPaid()}
                    disabled={saving}
                    className="w-full border border-line bg-white px-4 py-2.5 rounded-xl text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Mark as paid
                  </button>
                </>
              )}
              {paymentUrl && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(paymentUrl).then(() => {
                      flash("Payment link copied");
                    });
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-[#2563EB] hover:bg-[#EFF6FF]"
                >
                  <Copy className="w-4 h-4" />
                  Copy payment link
                </button>
              )}
              {status !== "void" && (
                <button
                  type="button"
                  onClick={() => void handleVoid()}
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                >
                  <Ban className="w-4 h-4" />
                  Void invoice
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>

            <p className="text-[12px] text-gray-400 leading-relaxed">
              {stripeReady
                ? "Share a payment link so clients pay by card. Stripe marks the invoice paid automatically."
                : "You can also connect Stripe anytime from Settings → Integrations."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
