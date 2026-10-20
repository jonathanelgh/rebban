"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { InvoiceDocument } from "@/components/invoices/InvoiceDocument";
import { EmbeddedInvoiceCheckout } from "@/components/invoices/EmbeddedInvoiceCheckout";
import { lineAmount } from "@/lib/invoices/totals";

type PayPayload = {
  invoice: {
    number: string | null;
    status: string;
    currency: string;
    subtotal: number;
    taxTotal: number;
    total: number;
    totalFormatted: string;
    dueDate: string | null;
    issueDate: string | null;
    notes: string | null;
    paidAt: string | null;
    payable: boolean;
    stripePayable?: boolean;
    bankTransferAvailable?: boolean;
    showLogo: boolean;
    bannerUrl: string | null;
    lateFeeEnabled: boolean;
    lateFeePercent: number;
    taxEnabled: boolean;
    taxRate: number;
    pricesIncludeTax: boolean;
    showTaxId: boolean;
    taxId: string | null;
    showShippingAddress: boolean;
    shippingAddress: string | null;
    showReference: boolean;
    referenceNumber: string | null;
  };
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    paymentIban?: string | null;
    paymentBankgiro?: string | null;
    paymentSwish?: string | null;
    paymentMbway?: string | null;
  };
  client: {
    name: string | null;
    company: string | null;
    email: string | null;
  };
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
};

function CopyablePaymentRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value.replace(/\s+/g, " ").trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </div>
        <div className="mt-1 font-medium text-gray-900 tracking-wide break-all">
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 mt-0.5 inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
        aria-label={`Copy ${label}`}
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export default function PublicInvoicePayPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = String(params.token || "");
  const statusParam = searchParams.get("status");
  const sessionIdParam = searchParams.get("session_id");

  const [data, setData] = useState<PayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [paidOptimistic, setPaidOptimistic] = useState(
    () => statusParam === "success"
  );
  const checkoutRef = useRef<HTMLDivElement>(null);
  const confirmAttempted = useRef(false);
  const pendingSessionId = useRef(
    statusParam === "success" ? sessionIdParam : null
  );

  const reload = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/stripe/pay/${token}`);
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
    } & Partial<PayPayload>;
    if (!res.ok) {
      setError(json.error || "Invoice not found");
      return;
    }
    setData(json as PayPayload);
  }, [token]);

  const confirmPayment = useCallback(
    async (sessionId: string | null | undefined) => {
      if (!token || !sessionId) return;
      try {
        const res = await fetch(`/api/stripe/pay/${token}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!res.ok) {
          console.error(
            "[pay] confirm failed",
            await res.text().catch(() => "")
          );
        }
      } catch (err) {
        console.error("[pay] confirm error", err);
      }
      await reload();
    },
    [token, reload]
  );

  useEffect(() => {
    if (!token || !statusParam) return;
    if (statusParam !== "success" && statusParam !== "cancelled") return;

    let cancelled = false;
    async function finish() {
      if (
        statusParam === "success" &&
        pendingSessionId.current &&
        !confirmAttempted.current
      ) {
        confirmAttempted.current = true;
        const sessionId = pendingSessionId.current;
        pendingSessionId.current = null;
        await confirmPayment(sessionId);
      }
      if (!cancelled) {
        router.replace(`/pay/${token}`, { scroll: false });
      }
    }
    void finish();
    return () => {
      cancelled = true;
    };
  }, [token, statusParam, confirmPayment, router]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!token) {
      setError("Invoice not found");
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stripe/pay/${token}`);
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        } & Partial<PayPayload>;
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || "Invoice not found");
          setData(null);
          return;
        }
        setData(json as PayPayload);
        void fetch(`/api/stripe/pay/${token}/view`, { method: "POST" });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load invoice");
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleDownloadPdf() {
    if (!token || pdfBusy) return;
    setPdfBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/stripe/pay/${token}/pdf`);
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(json?.error || "Could not download PDF.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "Invoice.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  function scrollToCheckout() {
    checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleCheckoutComplete(sessionId: string | null) {
    setPaidOptimistic(true);
    void confirmPayment(sessionId);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] text-gray-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading invoice…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] px-4">
        <div className="max-w-md w-full rounded-2xl border border-line bg-white p-6 text-center">
          <p className="text-sm text-red-600">{error || "Invoice not found"}</p>
        </div>
      </div>
    );
  }

  const paid = paidOptimistic || data.invoice.status === "paid";
  const stripePayable = Boolean(data.invoice.stripePayable) && !paid;
  const bankTransferAvailable =
    Boolean(data.invoice.bankTransferAvailable) && !paid;
  const showStripeColumn = stripePayable;
  const showFloatingPay = stripePayable;

  return (
    <div
      className={`min-h-screen bg-[#F7F8FA] px-4 py-8 sm:py-10 ${
        showFloatingPay ? "pb-28 lg:pb-10" : ""
      }`}
    >
      <div
        className={`mx-auto ${
          showStripeColumn || paid ? "max-w-[1180px]" : "max-w-[820px]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <div className="text-[13px] text-gray-500">Invoice from</div>
            <div className="text-[16px] font-semibold text-gray-900 truncate">
              {data.business.name}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {paid ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 bg-[#F3FAF6] px-3 py-2 rounded-full">
                <Check className="w-3.5 h-3.5" />
                Paid
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={pdfBusy}
              className="inline-flex items-center gap-2 border border-line bg-white px-3.5 py-2.5 rounded-full text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              {pdfBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {pdfBusy ? "Preparing…" : "Download PDF"}
              </span>
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div
          className={`grid gap-5 items-start ${
            showStripeColumn || paid
              ? "lg:grid-cols-[minmax(0,1fr)_min(380px,36%)]"
              : ""
          }`}
        >
          <div className="min-w-0 space-y-5">
            <InvoiceDocument
              bannerUrl={data.invoice.bannerUrl}
              showLogo={data.invoice.showLogo}
              logoUrl={data.business.logoUrl}
              fromName={data.business.name}
              fromAddress={data.business.address}
              showTaxId={data.invoice.showTaxId}
              taxId={data.invoice.taxId}
              number={data.invoice.number}
              issueDate={data.invoice.issueDate}
              dueDate={data.invoice.dueDate}
              showReference={data.invoice.showReference}
              referenceNumber={data.invoice.referenceNumber}
              billToName={data.client.name}
              billToCompany={data.client.company}
              billToEmail={data.client.email}
              showShippingAddress={data.invoice.showShippingAddress}
              shippingAddress={data.invoice.shippingAddress}
              currency={data.invoice.currency}
              lines={data.lines.map((line, i) => ({
                id: String(i),
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                amount: line.amount ?? lineAmount(line.quantity, line.unitPrice),
              }))}
              subtotal={data.invoice.subtotal}
              taxEnabled={data.invoice.taxEnabled}
              taxRate={data.invoice.taxRate}
              taxTotal={data.invoice.taxTotal}
              pricesIncludeTax={data.invoice.pricesIncludeTax}
              total={data.invoice.total}
              lateFeeEnabled={data.invoice.lateFeeEnabled}
              lateFeePercent={data.invoice.lateFeePercent}
              notes={data.invoice.notes}
            />

            {bankTransferAvailable ? (
              <div className="rounded-2xl border border-line bg-white px-5 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="text-[15px] font-semibold text-gray-900">
                  Payment instructions
                </div>
                <p className="text-[13px] text-gray-500 mt-1 leading-snug">
                  Pay {data.invoice.totalFormatted}
                  {data.invoice.number
                    ? ` and use ${data.invoice.number} as the reference.`
                    : "."}
                </p>
                <div className="mt-4 space-y-3 text-[13px]">
                  {data.business.paymentIban ? (
                    <CopyablePaymentRow
                      label="IBAN"
                      value={data.business.paymentIban}
                    />
                  ) : null}
                  {data.business.paymentBankgiro ? (
                    <CopyablePaymentRow
                      label="Bankgiro"
                      value={data.business.paymentBankgiro}
                    />
                  ) : null}
                  {data.business.paymentSwish ? (
                    <CopyablePaymentRow
                      label="Swish"
                      value={data.business.paymentSwish}
                    />
                  ) : null}
                  {data.business.paymentMbway ? (
                    <CopyablePaymentRow
                      label="MB Way"
                      value={data.business.paymentMbway}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {stripePayable && !isDesktop ? (
              <div ref={checkoutRef}>
                <EmbeddedInvoiceCheckout
                  token={token}
                  amountLabel={data.invoice.totalFormatted}
                  onComplete={handleCheckoutComplete}
                />
              </div>
            ) : null}
          </div>

          {showStripeColumn && isDesktop ? (
            <aside ref={checkoutRef} className="lg:sticky lg:top-6">
              <EmbeddedInvoiceCheckout
                token={token}
                amountLabel={data.invoice.totalFormatted}
                onComplete={handleCheckoutComplete}
              />
            </aside>
          ) : null}

          {paid ? (
            <aside className="lg:sticky lg:top-6">
              <div className="rounded-2xl border border-emerald-100 bg-[#F3FAF6] px-5 py-6 text-center">
                <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-white border border-emerald-100 flex items-center justify-center text-emerald-700">
                  <Check className="w-5 h-5" />
                </div>
                <p className="text-[15px] font-semibold text-emerald-900">
                  Payment received
                </p>
                <p className="text-[13px] text-emerald-800/80 mt-1">
                  Thank you. This invoice is paid.
                </p>
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {showFloatingPay ? (
        <button
          type="button"
          onClick={scrollToCheckout}
          className="lg:hidden fixed bottom-5 left-1/2 z-40 -translate-x-1/2 inline-flex items-center justify-center rounded-full bg-[#2563EB] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8]"
        >
          Pay {data.invoice.totalFormatted}
        </button>
      ) : null}
    </div>
  );
}
