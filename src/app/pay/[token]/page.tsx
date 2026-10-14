"use client";

import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Check, CircleDollarSign, Download, Loader2 } from "lucide-react";
import { InvoiceDocument } from "@/components/invoices/InvoiceDocument";
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
  const searchParams = useSearchParams();
  const token = String(params.token || "");
  const statusParam = searchParams.get("status");

  const [data, setData] = useState<PayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/stripe/pay/${token}`);
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error || "Invoice not found");
        setLoading(false);
        return;
      }
      setData(json as PayPayload);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handlePay() {
    setPaying(true);
    setError(null);
    const res = await fetch(`/api/stripe/pay/${token}/checkout`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok || !json.url) {
      setError(json.error || "Could not start checkout");
      setPaying(false);
      return;
    }
    window.location.href = json.url as string;
  }

  function handleDownloadPdf() {
    window.print();
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

  const paid = data.invoice.status === "paid" || statusParam === "success";

  return (
    <div className="min-h-screen bg-[#F7F8FA] px-4 py-8 sm:py-10 print:bg-white print:p-0">
      <div className="max-w-[820px] mx-auto">
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
                onClick={() => void handlePay()}
                disabled={paying}
                className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm disabled:opacity-50"
              >
                {paying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CircleDollarSign className="w-4 h-4" />
                )}
                {paying ? "Redirecting…" : `Pay ${data.invoice.totalFormatted}`}
              </button>
            ) : null}
          </div>
        </div>

        {statusParam === "cancelled" && !paid && (
          <p className="mb-4 text-[13px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 print:hidden">
            Checkout was cancelled. You can try again when ready.
          </p>
        )}
        {error && (
          <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 print:hidden">
            {error}
          </p>
        )}

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

        {!paid && data.invoice.payable && (
          <div className="mt-5 print:hidden">
            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={paying}
              className="w-full btn-primary inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm disabled:opacity-50"
            >
              {paying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CircleDollarSign className="w-4 h-4" />
              )}
              {paying ? "Redirecting…" : `Pay ${data.invoice.totalFormatted}`}
            </button>
            <p className="text-center text-[12px] text-gray-400 mt-3">
              Secure checkout powered by Stripe
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
