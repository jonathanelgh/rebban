"use client";

import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Check, CircleDollarSign, Loader2 } from "lucide-react";

type PayPayload = {
  invoice: {
    number: string | null;
    status: string;
    currency: string;
    total: number;
    totalFormatted: string;
    dueDate: string | null;
    issueDate: string | null;
    notes: string | null;
    paidAt: string | null;
    payable: boolean;
  };
  business: { name: string; logoUrl: string | null };
  client: { name: string | null; email: string | null };
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

  const paid =
    data.invoice.status === "paid" || statusParam === "success";

  return (
    <div className="min-h-screen bg-[#F7F8FA] px-4 py-10">
      <div className="max-w-lg mx-auto">
        <div className="rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
          <div className="px-6 pt-6 pb-5 border-b border-line bg-gradient-to-b from-[#FAFBFC] to-white">
            <div className="flex items-center gap-3">
              {data.business.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.business.logoUrl}
                  alt=""
                  className="w-11 h-11 rounded-xl object-contain border border-line bg-white"
                />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-gray-950 text-white flex items-center justify-center font-semibold">
                  {data.business.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-gray-900 truncate">
                  {data.business.name}
                </div>
                <div className="text-[13px] text-gray-500">
                  Invoice {data.invoice.number || ""}
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {statusParam === "cancelled" && !paid && (
              <p className="text-[13px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                Checkout was cancelled. You can try again when ready.
              </p>
            )}
            {error && (
              <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
                Amount due
              </div>
              <div className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                {data.invoice.totalFormatted}
              </div>
              {data.client.name && (
                <p className="mt-2 text-[13px] text-gray-500">
                  Billed to {data.client.name}
                </p>
              )}
            </div>

            {data.lines.length > 0 && (
              <div className="rounded-xl border border-line overflow-hidden">
                {data.lines.map((line, i) => (
                  <div
                    key={`${line.description}-${i}`}
                    className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-[13px] border-b border-line last:border-b-0"
                  >
                    <div className="min-w-0 text-gray-700">
                      <div className="font-medium text-gray-900 truncate">
                        {line.description || "Item"}
                      </div>
                      <div className="text-gray-400 mt-0.5">
                        {line.quantity} × {line.unitPrice}
                      </div>
                    </div>
                    <div className="shrink-0 font-medium text-gray-900">
                      {line.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {paid ? (
              <div className="flex items-center gap-2 rounded-xl bg-[#F3FAF6] border border-emerald-100 px-3.5 py-3 text-emerald-800 text-sm font-medium">
                <Check className="w-4 h-4" />
                Payment received
                {data.invoice.paidAt
                  ? ` · ${new Date(data.invoice.paidAt).toLocaleDateString()}`
                  : ""}
              </div>
            ) : data.invoice.payable ? (
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
                {paying ? "Redirecting…" : "Pay with card"}
              </button>
            ) : (
              <p className="text-[13px] text-gray-500 text-center py-2">
                This invoice isn’t open for online payment.
              </p>
            )}
          </div>
        </div>
        <p className="text-center text-[12px] text-gray-400 mt-4">
          Secure checkout powered by Stripe
        </p>
      </div>
    </div>
  );
}
