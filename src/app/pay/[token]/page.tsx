"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Check, Download, Loader2 } from "lucide-react";
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
  const [paidOptimistic, setPaidOptimistic] = useState(
    () => statusParam === "success"
  );
  const checkoutRef = useRef<HTMLDivElement>(null);
  const confirmAttempted = useRef(false);
  // Capture before we strip ?status / ?session_id from the URL
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
          console.error("[pay] confirm failed", await res.text().catch(() => ""));
        }
      } catch (err) {
        console.error("[pay] confirm error", err);
      }
      await reload();
    },
    [token, reload]
  );

  // Fulfill first, then drop one-shot query params (don't race confirm away)
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
        // Fire-and-forget: activity + alert for freelancers (first open)
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

  function handleDownloadPdf() {
    window.print();
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

  const stripePayable = Boolean(data.invoice.stripePayable);
  const bankTransferAvailable = Boolean(data.invoice.bankTransferAvailable);
  const showPaymentColumn =
    !paid && (stripePayable || bankTransferAvailable || data.invoice.payable);

  return (
    <div className="min-h-screen bg-[#F7F8FA] px-4 py-8 sm:py-10 print:bg-white print:p-0">
      <div
        className={`mx-auto ${
          showPaymentColumn || paid
            ? "max-w-[1180px]"
            : "max-w-[820px]"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 print:hidden">
          <div>
            <div className="text-[13px] text-gray-500">Invoice from</div>
            <div className="text-[16px] font-semibold text-gray-900">
              {data.business.name}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 border border-line bg-white px-4 py-2.5 rounded-full text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            {paid ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 bg-[#F3FAF6] px-3 py-2 rounded-full">
                <Check className="w-3.5 h-3.5" />
                Paid
              </span>
            ) : data.invoice.payable ? (
              <button
                type="button"
                onClick={scrollToCheckout}
                className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm lg:hidden"
              >
                Pay {data.invoice.totalFormatted}
              </button>
            ) : null}
          </div>
        </div>

        {error && (
          <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 print:hidden">
            {error}
          </p>
        )}

        <div
          className={`grid gap-5 items-start ${
            showPaymentColumn || paid
              ? "lg:grid-cols-[minmax(0,1fr)_min(380px,36%)]"
              : ""
          }`}
        >
          <div className="min-w-0">
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
              paymentIban={data.business.paymentIban}
              paymentBankgiro={data.business.paymentBankgiro}
              paymentSwish={data.business.paymentSwish}
              paymentMbway={data.business.paymentMbway}
            />
          </div>

          {showPaymentColumn && (
            <aside
              ref={checkoutRef}
              className="print:hidden lg:sticky lg:top-6 order-first lg:order-none space-y-4"
            >
              {stripePayable && (
                <EmbeddedInvoiceCheckout
                  token={token}
                  amountLabel={data.invoice.totalFormatted}
                  onComplete={handleCheckoutComplete}
                />
              )}
              {bankTransferAvailable && (
                <div className="rounded-2xl border border-line bg-white px-5 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                  <div className="text-[15px] font-semibold text-gray-900">
                    {stripePayable
                      ? "Or pay with these details"
                      : "Pay with these details"}
                  </div>
                  <p className="text-[13px] text-gray-500 mt-1 leading-snug">
                    Pay {data.invoice.totalFormatted}
                    {data.invoice.number
                      ? ` and use ${data.invoice.number} as the reference.`
                      : "."}
                  </p>
                  <div className="mt-4 space-y-3 text-[13px]">
                    {data.business.paymentIban && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          IBAN
                        </div>
                        <div className="mt-1 font-medium text-gray-900 tracking-wide break-all">
                          {data.business.paymentIban}
                        </div>
                      </div>
                    )}
                    {data.business.paymentBankgiro && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          Bankgiro
                        </div>
                        <div className="mt-1 font-medium text-gray-900">
                          {data.business.paymentBankgiro}
                        </div>
                      </div>
                    )}
                    {data.business.paymentSwish && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          Swish
                        </div>
                        <div className="mt-1 font-medium text-gray-900 tracking-wide">
                          {data.business.paymentSwish}
                        </div>
                      </div>
                    )}
                    {data.business.paymentMbway && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          MB Way
                        </div>
                        <div className="mt-1 font-medium text-gray-900 tracking-wide">
                          {data.business.paymentMbway}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </aside>
          )}

          {paid && (
            <aside className="print:hidden lg:sticky lg:top-6">
              <div className="rounded-2xl border border-emerald-100 bg-[#F3FAF6] px-5 py-6 text-center">
                <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-white border border-emerald-100 flex items-center justify-center text-emerald-700">
                  <Check className="w-5 h-5" />
                </div>
                <p className="text-[15px] font-semibold text-emerald-900">
                  Payment received
                </p>
                <p className="text-[13px] text-emerald-800/80 mt-1">
                  Thank you — this invoice is paid.
                </p>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
