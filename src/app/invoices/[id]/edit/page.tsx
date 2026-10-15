"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronDown,
  Eye,
  GripVertical,
  Plus,
  Save,
  Trash2,
  Send,
  Ban,
  CircleDollarSign,
  Link2,
  Copy,
  ImageIcon,
  Info,
  Clock,
} from "lucide-react";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { MenuSelect } from "@/components/MenuSelect";
import { InvoiceDocument } from "@/components/invoices/InvoiceDocument";
import { AddUnbilledTimeModal } from "@/components/invoices/AddUnbilledTimeModal";
import { SendInvoiceModal } from "@/components/invoices/SendInvoiceModal";
import { InvoiceActivityLog } from "@/components/invoices/InvoiceActivityLog";
import {
  computeInvoiceTotals,
  formatInvoiceMoney,
  lineAmount,
  pricesTaxLabel,
  TAX_RATE_PRESETS,
} from "@/lib/invoices/totals";
import {
  invoiceBannerStoragePath,
  ORG_ASSETS_BUCKET,
  publicOrgAssetUrl,
} from "@/lib/invoices/storage";
import {
  addTimeEntriesToInvoice,
  fetchUnbilledTimeEntries,
  summarizeUnbilled,
  unlockTimeEntriesByIds,
  unlockTimeEntriesForInvoice,
  type UnbilledTimeEntry,
} from "@/lib/invoices/unbilled";
import type { Enums } from "@/types/database";

type InvoiceStatus = Enums<"invoice_status">;

type LineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  timeEntryId?: string | null;
  isNew?: boolean;
};

type ClientInfo = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  address?: string | null;
};

type ProjectOption = { id: string; name: string };

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
  const bannerInputRef = useRef<HTMLInputElement>(null);
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
  const [previewMode, setPreviewMode] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);

  const [number, setNumber] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [currency, setCurrency] = useState("USD");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgAddress, setOrgAddress] = useState<string | null>(null);
  const [orgLegalName, setOrgLegalName] = useState<string | null>(null);
  const [orgTaxId, setOrgTaxId] = useState<string | null>(null);
  const [customTaxRates, setCustomTaxRates] = useState<number[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [originalLineIds, setOriginalLineIds] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  // Setup options
  const [showLogo, setShowLogo] = useState(true);
  const [bannerPath, setBannerPath] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [lateFeeEnabled, setLateFeeEnabled] = useState(false);
  const [lateFeePercent, setLateFeePercent] = useState("0");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [showTaxId, setShowTaxId] = useState(false);
  const [taxId, setTaxId] = useState("");
  const [showShippingAddress, setShowShippingAddress] = useState(false);
  const [shippingAddress, setShippingAddress] = useState("");
  const [showReference, setShowReference] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");

  const [unbilledEntries, setUnbilledEntries] = useState<UnbilledTimeEntry[]>([]);
  const [unbilledLoading, setUnbilledLoading] = useState(false);
  const [unbilledModalOpen, setUnbilledModalOpen] = useState(false);
  const [unbilledBusy, setUnbilledBusy] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
        { taxEnabled, taxRate, pricesIncludeTax }
      ),
    [lines, taxEnabled, taxRate, pricesIncludeTax]
  );

  const linePricesLabel = pricesTaxLabel({ taxEnabled, pricesIncludeTax });

  const fromName = orgLegalName || orgName || fullName || "Your business";
  const billTo = client?.company || client?.name || "";
  const projectName = projects.find((p) => p.id === projectId)?.name || null;
  const taxRateOptions = useMemo(() => {
    const set = new Set<number>([
      ...TAX_RATE_PRESETS.filter((r) => r > 0),
      ...customTaxRates,
    ]);
    const current = Number(taxRate);
    if (Number.isFinite(current) && current > 0) set.add(current);
    return Array.from(set).sort((a, b) => b - a);
  }, [customTaxRates, taxRate]);

  const load = useCallback(async () => {
    if (!organizationId || !invoiceId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [invoiceRes, linesRes, clientsRes, orgRes, projectsRes] =
      await Promise.all([
        supabase
          .from("invoices")
          .select(
            `id, number, status, currency, issue_date, due_date, notes, tax_total, client_id,
             payment_token, project_id, show_logo, banner_url, late_fee_enabled, late_fee_percent,
             tax_enabled, tax_rate, prices_include_tax, show_tax_id, tax_id,
             show_shipping_address, shipping_address, show_reference, reference_number,
             clients(id, name, company, email)`
          )
          .eq("id", invoiceId)
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("invoice_line_items")
          .select("id, description, quantity, unit_price, position, time_entry_id")
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
          .select(
            "name, legal_name, address, tax_id, default_tax_rate, default_tax_enabled, default_prices_include_tax, custom_tax_rates"
          )
          .eq("id", organizationId)
          .maybeSingle(),
        supabase
          .from("projects")
          .select("id, name")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("name"),
      ]);

    if (invoiceRes.error || !invoiceRes.data) {
      setError(invoiceRes.error?.message || "Invoice not found.");
      setLoading(false);
      return;
    }

    const row = invoiceRes.data;
    const clientRel = row.clients as
      | {
          id: string;
          name: string;
          company: string | null;
          email: string | null;
        }
      | null
      | undefined;

    setNumber(row.number || "");
    setStatus(row.status);
    setCurrency(row.currency || organizationCurrency || "USD");
    setIssueDate(row.issue_date || "");
    setDueDate(row.due_date || "");
    setNotes(row.notes || "");
    setPaymentToken(row.payment_token);
    setProjectId(row.project_id);
    setShowLogo(row.show_logo ?? true);
    setBannerPath(row.banner_url);
    setBannerPreviewUrl(publicOrgAssetUrl(row.banner_url));
    setLateFeeEnabled(Boolean(row.late_fee_enabled));
    setLateFeePercent(String(Number(row.late_fee_percent || 0)));
    setTaxEnabled(Boolean(row.tax_enabled));
    setTaxRate(String(Number(row.tax_rate || 0)));
    setPricesIncludeTax(Boolean(row.prices_include_tax));
    setShowTaxId(Boolean(row.show_tax_id));
    setTaxId(row.tax_id || orgRes.data?.tax_id || "");
    setShowShippingAddress(Boolean(row.show_shipping_address));
    setShippingAddress(row.shipping_address || "");
    setShowReference(Boolean(row.show_reference));
    setReferenceNumber(row.reference_number || "");
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
        timeEntryId: line.time_entry_id,
      })) || [];
    setLines(loadedLines.length ? loadedLines : [emptyLine()]);
    setOriginalLineIds(loadedLines.map((l) => l.id));
    setClients(clientsRes.data ?? []);
    setProjects(projectsRes.data ?? []);
    setOrgName(orgRes.data?.name || "Your business");
    setOrgLegalName(orgRes.data?.legal_name || null);
    setOrgAddress(orgRes.data?.address || null);
    setOrgTaxId(orgRes.data?.tax_id || null);
    setCustomTaxRates((orgRes.data?.custom_tax_rates || []).map((n) => Number(n)));
    setLoading(false);
  }, [organizationId, invoiceId, organizationCurrency]);

  useEffect(() => {
    if (profileLoading) return;
    void load();
  }, [profileLoading, load]);

  const refreshUnbilled = useCallback(async () => {
    if (!organizationId || !client?.id || status === "void") {
      setUnbilledEntries([]);
      return;
    }
    setUnbilledLoading(true);
    try {
      const supabase = createClient();
      const entries = await fetchUnbilledTimeEntries(supabase, {
        organizationId,
        clientId: client.id,
      });
      setUnbilledEntries(entries);
    } catch {
      setUnbilledEntries([]);
    } finally {
      setUnbilledLoading(false);
    }
  }, [organizationId, client?.id, status]);

  useEffect(() => {
    void refreshUnbilled();
  }, [refreshUnbilled]);

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

  function flash(msg: string) {
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 2400);
  }

  const unbilledSummary = useMemo(
    () => summarizeUnbilled(unbilledEntries),
    [unbilledEntries]
  );

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((line) => line.id !== id);
    });
  }

  async function handleAddUnbilledTime(selected: UnbilledTimeEntry[]) {
    if (!organizationId || !invoiceId || selected.length === 0) return;
    setUnbilledBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      // Drop a single empty placeholder line before appending
      const baseLines =
        lines.length === 1 &&
        !lines[0].description.trim() &&
        !lines[0].timeEntryId &&
        (Number(lines[0].quantity) === 1 || !lines[0].quantity) &&
        (Number(lines[0].unitPrice) === 0 || !lines[0].unitPrice)
          ? []
          : lines;
      const created = await addTimeEntriesToInvoice(supabase, {
        organizationId,
        invoiceId,
        entries: selected,
        startPosition: baseLines.length,
      });
      const nextLines: LineItem[] = [
        ...baseLines,
        ...created.map((c) => ({
          id: c.id,
          description: c.description,
          quantity: String(c.quantity),
          unitPrice: String(c.unitPrice),
          timeEntryId: c.timeEntryId,
        })),
      ];
      setLines(nextLines.length ? nextLines : [emptyLine()]);
      setOriginalLineIds(nextLines.map((l) => l.id));
      setUnbilledModalOpen(false);
      flash(
        `Added ${created.length} ${created.length === 1 ? "time entry" : "time entries"}`
      );
      await refreshUnbilled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add time entries");
    } finally {
      setUnbilledBusy(false);
    }
  }

  async function handleBannerUpload(file: File | null) {
    if (!file || !organizationId || !invoiceId) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose a PNG or JPG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Banner image must be 2MB or smaller.");
      return;
    }
    setBannerUploading(true);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = invoiceBannerStoragePath(organizationId, invoiceId, ext);
    const { error: uploadError } = await supabase.storage
      .from(ORG_ASSETS_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    setBannerUploading(false);
    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    setBannerPath(path);
    setBannerPreviewUrl(publicOrgAssetUrl(path));
    flash("Banner added");
  }

  async function removeBanner() {
    setBannerPath(null);
    setBannerPreviewUrl(null);
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
    let token = paymentToken;
    if (!token && statusToSave !== "draft") {
      token = nanoid(24);
      setPaymentToken(token);
    }

    const updatePayload = {
      number: number.trim() || null,
      status: statusToSave,
      currency,
      issue_date: issueDate || null,
      due_date: dueDate || null,
      notes: notes.trim() || null,
      client_id: client.id,
      project_id: projectId,
      subtotal,
      tax_total: tax,
      total,
      payment_token: token,
      show_logo: showLogo,
      banner_url: bannerPath,
      late_fee_enabled: lateFeeEnabled,
      late_fee_percent: Number(lateFeePercent) || 0,
      tax_enabled: taxEnabled,
      tax_rate: Number(taxRate) || 0,
      prices_include_tax: pricesIncludeTax,
      show_tax_id: showTaxId,
      tax_id: taxId.trim() || null,
      show_shipping_address: showShippingAddress,
      shipping_address: shippingAddress.trim() || null,
      show_reference: showReference,
      reference_number: referenceNumber.trim() || null,
      sent_at:
        (statusToSave === "sent" || statusToSave === "viewed") && status === "draft"
          ? new Date().toISOString()
          : undefined,
      paid_at: statusToSave === "paid" ? new Date().toISOString() : undefined,
    };

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
      const { data: removedRows } = await supabase
        .from("invoice_line_items")
        .select("time_entry_id")
        .eq("organization_id", organizationId)
        .in("id", removedIds);
      const unlockIds = (removedRows || [])
        .map((r) => r.time_entry_id)
        .filter((id): id is string => Boolean(id));
      await unlockTimeEntriesByIds(supabase, {
        organizationId,
        timeEntryIds: unlockIds,
      });
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
            time_entry_id: line.timeEntryId || null,
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

    if (statusToSave === "void") {
      await unlockTimeEntriesForInvoice(supabase, {
        organizationId,
        invoiceId,
      });
      for (const line of lines) {
        line.timeEntryId = null;
      }
    }

    setLines([...lines]);
    setOriginalLineIds(lines.map((l) => l.id));
    if (nextStatus) setStatus(nextStatus);
    setSaving(false);
    flash("Saved");
    if (statusToSave === "void" || removedIds.length > 0) {
      await refreshUnbilled();
    }
    return true;
  }

  async function handleOpenSend() {
    if (!client) {
      setError("Client is required.");
      return;
    }
    const saved = await persist();
    if (!saved) return;
    setSendModalOpen(true);
  }

  function handleInvoiceSent(result: {
    url: string;
    recipientEmail: string;
    status?: string;
    paymentToken?: string;
  }) {
    setSendModalOpen(false);
    if (result.status) setStatus(result.status as InvoiceStatus);
    else if (status === "draft") setStatus("sent");
    if (result.paymentToken) setPaymentToken(result.paymentToken);
    setPaymentUrl(result.url);
    setActivityRefreshKey((k) => k + 1);
    flash(`Invoice sent to ${result.recipientEmail}`);
  }

  const canSendInvoice =
    status !== "void" && status !== "paid" && Boolean(client);
  const invoiceLabel = number.trim()
    ? `Invoice ${number.trim()}`
    : "Invoice";

  async function logInvoiceEvent(eventType: string) {
    if (!organizationId || !invoiceId) return;
    const supabase = createClient();
    await supabase.from("invoice_events").insert({
      organization_id: organizationId,
      invoice_id: invoiceId,
      event_type: eventType,
      actor_type: "freelancer",
      metadata: {},
    });
    setActivityRefreshKey((k) => k + 1);
  }

  async function cancelPendingReminders() {
    if (!invoiceId) return;
    const supabase = createClient();
    await supabase.rpc("cancel_invoice_reminders", {
      p_invoice_id: invoiceId,
    });
  }

  async function handleMarkPaid() {
    const ok = await persist("paid");
    if (ok) {
      await cancelPendingReminders();
      await logInvoiceEvent("paid");
      flash("Marked as paid");
    }
  }

  async function handleVoid() {
    const ok = await persist("void");
    if (ok) {
      await cancelPendingReminders();
      await logInvoiceEvent("voided");
      flash("Invoice voided");
    }
  }

  async function handleDelete() {
    if (!organizationId || !invoiceId) return;
    if (!window.confirm("Delete this invoice? This cannot be undone easily.")) return;
    const supabase = createClient();
    await unlockTimeEntriesForInvoice(supabase, {
      organizationId,
      invoiceId,
    });
    await supabase
      .from("invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("organization_id", organizationId);
    router.push("/invoices");
  }

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
      window.location.assign(new URL(json.url).toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Stripe onboarding.");
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

  function handlePreviewPdf() {
    setPreviewMode(true);
    window.setTimeout(() => window.print(), 200);
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

  const documentLines = lines.map((l) => ({
    id: l.id,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: lineAmount(l.quantity, l.unitPrice),
  }));

  return (
    <div className="h-full flex flex-col min-h-0 bg-white">
      <header className="shrink-0 h-14 border-b border-line px-3 sm:px-5 flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/invoices"
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 min-w-0">
            <CircleDollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="truncate max-w-[240px]">{number || "Draft invoice"}</span>
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
            onClick={() => setPreviewMode((v) => !v)}
            className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${
              previewMode ? "text-[#2563EB]" : "text-gray-700 hover:text-gray-900"
            }`}
          >
            <Eye className="w-4 h-4" />
            {previewMode ? "Edit" : "Preview"}
          </button>
          <button
            type="button"
            onClick={() => void persist()}
            disabled={saving}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-[#2563EB]" />
            Save
          </button>
          {canSendInvoice && (
            <button
              type="button"
              onClick={() => void handleOpenSend()}
              disabled={saving}
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {status === "draft" ? "Send invoice" : "Send again"}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 relative custom-scrollbar">
          {error && (
            <div className="max-w-[820px] mx-auto mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 print:hidden">
              {error}
            </div>
          )}

          {previewMode ? (
            <div className="max-w-[820px] mx-auto">
              <InvoiceDocument
                bannerUrl={bannerPreviewUrl}
                showLogo={showLogo}
                logoUrl={logoUrl}
                fromName={fromName}
                fromAddress={orgAddress}
                fromEmail={profileEmail}
                showTaxId={showTaxId}
                taxId={taxId || orgTaxId}
                number={number}
                issueDate={issueDate}
                dueDate={dueDate}
                showReference={showReference}
                referenceNumber={referenceNumber}
                billToName={client?.name}
                billToCompany={client?.company}
                billToEmail={client?.email}
                showShippingAddress={showShippingAddress}
                shippingAddress={shippingAddress}
                currency={currency}
                lines={documentLines}
                subtotal={totals.subtotal}
                taxEnabled={taxEnabled}
                taxRate={Number(taxRate) || 0}
                taxTotal={totals.taxTotal}
                pricesIncludeTax={pricesIncludeTax}
                total={totals.total}
                lateFeeEnabled={lateFeeEnabled}
                lateFeePercent={Number(lateFeePercent) || 0}
                notes={notes}
              />
            </div>
          ) : (
            <article className="max-w-[820px] mx-auto bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
              {bannerPreviewUrl ? (
                <div className="relative w-full h-[100px] bg-gray-100 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bannerPreviewUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => void removeBanner()}
                    className="absolute top-2 right-2 text-[12px] font-medium bg-white/90 border border-line rounded-full px-2.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Remove
                  </button>
                </div>
              ) : null}

              <div className="px-6 sm:px-10 pt-8 sm:pt-10 pb-6 border-b border-line bg-gradient-to-b from-[#FAFBFC] to-white">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                  <div className="flex items-start gap-3 min-w-0">
                    {showLogo &&
                      (logoUrl ? (
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
                      ))}
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
                      {showReference && (
                        <div className="flex sm:justify-end items-center gap-2">
                          <span>Ref</span>
                          <input
                            value={referenceNumber}
                            onChange={(e) => setReferenceNumber(e.target.value)}
                            placeholder="PO-100"
                            className="border border-line rounded-lg px-2 py-1 text-gray-800 bg-white w-28"
                          />
                        </div>
                      )}
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
                {showShippingAddress ? (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                      Shipping address
                    </div>
                    <textarea
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      rows={3}
                      placeholder="Street, city, postal code…"
                      className="w-full border border-line rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-gray-300 resize-none"
                    />
                  </div>
                ) : (
                  <div />
                )}
              </div>

              <div className="px-6 sm:px-10 py-6">
                {client && status !== "void" && unbilledSummary.count > 0 && (
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5 w-8 h-8 rounded-full bg-white text-[#2563EB] flex items-center justify-center shrink-0 border border-[#BFDBFE]">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 text-[13px] text-gray-700">
                        <span className="font-semibold text-gray-900">
                          {unbilledSummary.totalHours} unbilled hours
                        </span>
                        <span className="text-gray-500">
                          {" "}
                          · ~{formatInvoiceMoney(unbilledSummary.totalAmount, currency)}{" "}
                          available
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUnbilledModalOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 self-start sm:self-auto px-3.5 py-2 rounded-full text-[13px] font-medium bg-white text-[#2563EB] border border-[#BFDBFE] hover:bg-[#DBEAFE] transition-colors"
                    >
                      Add time
                    </button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900">Line items</h2>
                    {taxEnabled && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-[12px] text-gray-500">Unit prices are</span>
                        <div className="inline-flex rounded-full border border-line p-0.5 bg-[#FAFBFC]">
                          <button
                            type="button"
                            onClick={() => setPricesIncludeTax(false)}
                            className={`px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors ${
                              !pricesIncludeTax
                                ? "bg-white text-gray-900 shadow-sm border border-line"
                                : "text-gray-500 hover:text-gray-800"
                            }`}
                          >
                            Excl. tax
                          </button>
                          <button
                            type="button"
                            onClick={() => setPricesIncludeTax(true)}
                            className={`px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors ${
                              pricesIncludeTax
                                ? "bg-white text-gray-900 shadow-sm border border-line"
                                : "text-gray-500 hover:text-gray-800"
                            }`}
                          >
                            Incl. tax
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => [...prev, emptyLine()])}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] self-start sm:self-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Add line
                  </button>
                </div>

                <div className="rounded-2xl border border-line overflow-hidden">
                  <div className="hidden sm:grid grid-cols-[24px_minmax(0,1.8fr)_90px_110px_110px_36px] gap-2 px-3 py-2.5 bg-[#FAFBFC] border-b border-line text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <span />
                    <span>Description</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">
                      Rate
                      {linePricesLabel ? (
                        <span className="block normal-case tracking-normal font-medium text-gray-400">
                          {pricesIncludeTax ? "incl. tax" : "excl. tax"}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-right">Amount</span>
                    <span />
                  </div>
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-1 sm:grid-cols-[24px_minmax(0,1.8fr)_90px_110px_110px_36px] gap-2 px-3 py-2.5 border-b border-line last:border-b-0 items-center"
                    >
                      <GripVertical className="hidden sm:block w-4 h-4 text-gray-300" />
                      <input
                        value={line.description}
                        onChange={(e) =>
                          updateLine(line.id, { description: e.target.value })
                        }
                        placeholder="Description"
                        className="w-full text-sm text-gray-900 outline-none bg-transparent"
                      />
                      <input
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(line.id, { quantity: e.target.value })
                        }
                        className="w-full sm:text-right text-sm border border-line sm:border-0 rounded-lg sm:rounded-none px-2 py-1.5 sm:px-0 sm:py-0 outline-none"
                      />
                      <input
                        value={line.unitPrice}
                        onChange={(e) =>
                          updateLine(line.id, { unitPrice: e.target.value })
                        }
                        className="w-full sm:text-right text-sm border border-line sm:border-0 rounded-lg sm:rounded-none px-2 py-1.5 sm:px-0 sm:py-0 outline-none"
                      />
                      <div className="sm:text-right text-sm font-medium text-gray-900">
                        {formatInvoiceMoney(
                          lineAmount(line.quantity, line.unitPrice),
                          currency
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 justify-self-end"
                        aria-label="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 ml-auto w-full max-w-xs space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>
                      Subtotal{taxEnabled ? " (excl. tax)" : ""}
                    </span>
                    <span>{formatInvoiceMoney(totals.subtotal, currency)}</span>
                  </div>
                  {taxEnabled && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>
                        Tax ({Number(taxRate) || 0}%)
                        {pricesIncludeTax ? " · included in rates" : ""}
                      </span>
                      <span>{formatInvoiceMoney(totals.taxTotal, currency)}</span>
                    </div>
                  )}
                  <div className="h-px bg-line" />
                  <div className="flex justify-between text-sm font-semibold text-gray-900">
                    <span>Total</span>
                    <span>{formatInvoiceMoney(totals.total, currency)}</span>
                  </div>
                </div>

                <div className="mt-8">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    Notes
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Payment terms, thank-you note…"
                    className="w-full border border-line rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-300 resize-none"
                  />
                </div>
              </div>

              <footer className="px-6 sm:px-10 py-5 border-t border-line bg-[#FAFBFC]">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  From
                </div>
                <div className="text-[13px] text-gray-700 space-y-0.5">
                  <div className="font-medium text-gray-900">{fromName}</div>
                  {orgAddress && (
                    <p className="whitespace-pre-line text-gray-600">{orgAddress}</p>
                  )}
                  {profileEmail && (
                    <p className="text-gray-600">{profileEmail}</p>
                  )}
                  {(taxEnabled || showTaxId) && (taxId || orgTaxId) && (
                    <p className="text-gray-600">
                      VAT / Tax ID: {taxId || orgTaxId}
                    </p>
                  )}
                </div>
              </footer>
            </article>
          )}
        </div>

        <aside className="hidden lg:flex w-[320px] shrink-0 border-l border-line bg-white flex-col min-h-0 overflow-y-auto print:hidden">
          {(status !== "draft" || activityRefreshKey > 0) && (
            <InvoiceActivityLog
              invoiceId={invoiceId}
              open
              variant="inline"
              refreshKey={activityRefreshKey}
            />
          )}
          <div className="p-5 border-b border-line">
            <h2 className="text-sm font-semibold text-gray-900">Overview</h2>
            <div className="mt-4 space-y-3">
              <OverviewRow label="Status">
                <span
                  className={`inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-2.5 py-1 ${STATUS_STYLES[status]}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                  {statusLabel(status)}
                </span>
              </OverviewRow>
              <OverviewRow label="Project">
                <select
                  value={projectId || ""}
                  onChange={(e) => setProjectId(e.target.value || null)}
                  className="w-full text-[13px] text-gray-800 bg-transparent outline-none truncate"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </OverviewRow>
              <OverviewRow label="Currency">
                <MenuSelect
                  value={currency}
                  onChange={setCurrency}
                  options={CURRENCY_OPTIONS}
                  className="min-w-[7.5rem]"
                />
              </OverviewRow>
              <OverviewRow label="Amount">
                <span className="text-[13px] font-semibold text-gray-900">
                  {formatInvoiceMoney(totals.total, currency)}
                </span>
              </OverviewRow>
            </div>
          </div>

          <div className="border-b border-line">
            <button
              type="button"
              onClick={() => setSetupOpen((v) => !v)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-sm font-semibold text-gray-900 hover:bg-[#FAFBFC]"
            >
              Setup
              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  setupOpen ? "rotate-0" : "-rotate-90"
                }`}
              />
            </button>
            {setupOpen && (
              <div className="px-5 pb-5 space-y-4">
                <SetupToggle
                  label="Display Logo"
                  active={showLogo}
                  onChange={setShowLogo}
                />
                <div>
                  <div className="text-[13px] font-medium text-gray-900 mb-2">
                    Header Image
                  </div>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      void handleBannerUpload(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={bannerUploading}
                    onClick={() => bannerInputRef.current?.click()}
                    className="inline-flex items-center gap-2 text-[13px] font-medium text-gray-700 border border-line rounded-xl px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    {bannerUploading
                      ? "Uploading…"
                      : bannerPreviewUrl
                        ? "Change Image"
                        : "Add Image"}
                  </button>
                </div>

                <SetupToggle
                  label="Late Fee"
                  active={lateFeeEnabled}
                  onChange={setLateFeeEnabled}
                />
                {lateFeeEnabled && (
                  <div>
                    <div className="flex items-center gap-1 text-[13px] font-medium text-gray-900 mb-1.5">
                      Late Fee Percent
                      <Info className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={lateFeePercent}
                      onChange={(e) => setLateFeePercent(e.target.value)}
                      className="w-full border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-300"
                    />
                  </div>
                )}

                <SetupToggle
                  label="Apply Tax"
                  active={taxEnabled}
                  onChange={setTaxEnabled}
                />
                {taxEnabled && (
                  <div>
                    <div className="text-[13px] font-medium text-gray-900 mb-2">
                      Line prices
                    </div>
                    <div className="inline-flex w-full rounded-xl border border-line p-0.5 bg-[#FAFBFC] mb-3">
                      <button
                        type="button"
                        onClick={() => setPricesIncludeTax(false)}
                        className={`flex-1 px-2.5 py-1.5 rounded-[10px] text-[12px] font-medium ${
                          !pricesIncludeTax
                            ? "bg-white text-gray-900 shadow-sm border border-line"
                            : "text-gray-500"
                        }`}
                      >
                        Excl. tax
                      </button>
                      <button
                        type="button"
                        onClick={() => setPricesIncludeTax(true)}
                        className={`flex-1 px-2.5 py-1.5 rounded-[10px] text-[12px] font-medium ${
                          pricesIncludeTax
                            ? "bg-white text-gray-900 shadow-sm border border-line"
                            : "text-gray-500"
                        }`}
                      >
                        Incl. tax
                      </button>
                    </div>
                    <div className="text-[13px] font-medium text-gray-900 mb-2">
                      Tax rate
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {taxRateOptions.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setTaxRate(String(rate))}
                          className={`px-2.5 py-1 rounded-full text-[12px] font-medium border ${
                            Number(taxRate) === rate
                              ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                              : "border-line text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {rate}%
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="w-full border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-300"
                    />
                    <p className="mt-1.5 text-[11px] text-gray-400">
                      Defaults from{" "}
                      <Link
                        href="/settings?section=tax"
                        className="text-[#2563EB] hover:underline"
                      >
                        Settings → Tax
                      </Link>
                    </p>
                  </div>
                )}

                <SetupToggle
                  label="Display Tax / VAT ID"
                  active={showTaxId}
                  onChange={setShowTaxId}
                />
                {showTaxId && (
                  <div>
                    <div className="text-[13px] font-medium text-gray-900 mb-1.5">
                      Tax ID / VAT Number
                    </div>
                    <input
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      placeholder={orgTaxId || "TAX-123456"}
                      className="w-full border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-300"
                    />
                  </div>
                )}

                <SetupToggle
                  label="Shipping Address"
                  active={showShippingAddress}
                  onChange={setShowShippingAddress}
                />
                <SetupToggle
                  label="Display Reference Number"
                  active={showReference}
                  onChange={setShowReference}
                />
              </div>
            )}
          </div>

          <div className="p-5 space-y-3">
            {!stripeReady && (
              <div className="rounded-2xl border border-line bg-[#FAFBFC] p-4">
                <div className="text-[14px] font-semibold text-gray-900">
                  Collect payments with Stripe
                </div>
                <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                  Connect your Stripe account so clients can pay this invoice by
                  card.
                </p>
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
              </div>
            )}

            <button
              type="button"
              onClick={() => void persist()}
              disabled={saving}
              className="w-full btn-primary px-4 py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={handlePreviewPdf}
              className="w-full border border-line bg-white px-4 py-2.5 rounded-xl text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Preview / Download PDF
            </button>
            {canSendInvoice && (
              <button
                type="button"
                onClick={() => void handleOpenSend()}
                disabled={saving}
                className="w-full border border-line bg-white px-4 py-2.5 rounded-xl text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                {status === "draft" ? "Send invoice" : "Send again"}
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
            {(paymentUrl || paymentToken) && (
              <button
                type="button"
                onClick={() => {
                  const url =
                    paymentUrl ||
                    `${window.location.origin}/pay/${paymentToken}`;
                  void navigator.clipboard.writeText(url).then(() => {
                    flash("Client invoice link copied");
                  });
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-[#2563EB] hover:bg-[#EFF6FF]"
              >
                <Copy className="w-4 h-4" />
                Copy client link
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
            {projectName && (
              <p className="text-[11px] text-gray-400 pt-1">Project: {projectName}</p>
            )}
          </div>
        </aside>
      </div>

      <AddUnbilledTimeModal
        open={unbilledModalOpen}
        entries={unbilledEntries}
        currency={currency}
        loading={unbilledLoading}
        busy={unbilledBusy}
        onClose={() => {
          if (!unbilledBusy) setUnbilledModalOpen(false);
        }}
        onConfirm={handleAddUnbilledTime}
      />

      {sendModalOpen && (
        <SendInvoiceModal
          invoiceId={invoiceId}
          invoiceLabel={invoiceLabel}
          dueDate={dueDate}
          defaultEmail={client?.email}
          defaultName={client?.company || client?.name}
          onClose={() => setSendModalOpen(false)}
          onSent={handleInvoiceSent}
        />
      )}
    </div>
  );
}

function OverviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[28px]">
      <span className="text-[13px] text-gray-500 shrink-0">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function SetupToggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] font-medium text-gray-900">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        onClick={() => onChange(!active)}
        className={`w-11 h-6 rounded-full flex items-center p-0.5 transition-colors shrink-0 ${
          active ? "bg-emerald-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
            active ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
