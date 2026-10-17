"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useBilling } from "@/components/BillingContext";

export function PastDueBillingBanner() {
  const router = useRouter();
  const { pastDue, loading } = useBilling();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !pastDue) return null;

  async function openCardUpdate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/billing/portal", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        setError(json.error || "Could not open card update.");
        setBusy(false);
        return;
      }
      window.location.href = json.url as string;
    } catch {
      setError("Could not open card update.");
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 sm:px-6 py-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 max-w-7xl mx-auto">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[13px] sm:text-[14px] font-semibold text-amber-950">
              Payment failed — update your card to stay on Pro
            </p>
            <p className="text-[12px] sm:text-[13px] text-amber-900/80 mt-0.5 leading-relaxed">
              Stripe is retrying the charge. You still have access for now.
              {error ? ` ${error}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto">
          <button
            type="button"
            disabled={busy}
            onClick={() => router.push("/settings?section=billing")}
            className="flex-1 sm:flex-none px-3.5 py-2 rounded-full text-[13px] font-medium border border-amber-300 bg-white text-amber-950 hover:bg-amber-50 disabled:opacity-50"
          >
            Billing
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void openCardUpdate()}
            className="flex-1 sm:flex-none px-3.5 py-2 rounded-full text-[13px] font-medium bg-amber-900 text-white hover:bg-amber-950 disabled:opacity-50"
          >
            {busy ? "Opening…" : "Update card"}
          </button>
        </div>
      </div>
    </div>
  );
}
