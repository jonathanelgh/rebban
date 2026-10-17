"use client";

import React, { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useBilling } from "@/components/BillingContext";
import { EmbeddedBillingCheckout } from "@/components/EmbeddedBillingCheckout";
import {
  PAID_PLAN,
  formatPlanMoney,
  type BillingInterval,
} from "@/lib/billing/plan";

export function UpgradeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    configured,
    yearlyConfigured,
    pricing,
    refreshBilling,
  } = useBilling();
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("year");
  const [paidSuccess, setPaidSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBillingInterval(yearlyConfigured ? "year" : "month");
    setPaidSuccess(false);
  }, [open, yearlyConfigured]);

  if (!open) return null;

  const currency =
    pricing?.monthly?.currency ||
    pricing?.yearly?.currency ||
    "USD";
  const monthlyAmount = pricing?.monthly?.amount ?? null;
  const yearlyAmount = pricing?.yearly?.amount ?? null;
  const yearlyPerMonth = pricing?.yearlyPerMonth ?? null;
  const yearlySavings = pricing?.yearlySavings ?? null;

  const isYearly = billingInterval === "year" && yearlyConfigured;
  const perMonth = isYearly ? yearlyPerMonth : monthlyAmount;
  const total = isYearly ? yearlyAmount : monthlyAmount;

  const submitLabel =
    total != null
      ? `Subscribe · ${formatPlanMoney(total, currency)}`
      : "Subscribe";

  async function handleComplete() {
    setPaidSuccess(true);
    // Checkout can finish before the webhook writes the org — sync from Stripe.
    try {
      await fetch("/api/stripe/billing/sync", { method: "POST" });
    } catch {
      // refreshBilling still runs below
    }
    await refreshBilling();
    window.setTimeout(() => {
      onClose();
      window.location.assign("/settings?section=billing&billing=success");
    }, 900);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#F0F1F3]">
      <header className="shrink-0 h-14 px-4 sm:px-6 flex items-center justify-between bg-white border-b border-line">
        <div className="w-9 h-9 rounded-xl bg-gray-950 text-white flex items-center justify-center">
          <span className="text-[14px] font-semibold tracking-tight leading-none">
            R.
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="min-h-full flex items-stretch justify-center p-4 sm:p-6 lg:p-10">
          <div className="w-full max-w-5xl bg-white rounded-[1.75rem] border border-line shadow-[0_24px_60px_rgba(16,24,40,0.10)] overflow-hidden grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-6 sm:p-8 lg:p-10 flex flex-col">
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                Subscribe to Rebban
              </h1>
              <p className="text-[15px] text-gray-500 mt-2 max-w-md leading-relaxed mb-6">
                {PAID_PLAN.tagline}
              </p>

              {paidSuccess ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
                  <div className="text-[15px] font-semibold text-emerald-800">
                    You&apos;re subscribed
                  </div>
                  <p className="text-[13px] text-emerald-700 mt-1">
                    Taking you to billing settings…
                  </p>
                </div>
              ) : !configured ? (
                <div className="text-[13px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5">
                  Billing isn&apos;t configured yet. Add{" "}
                  <code className="font-mono text-[12px]">STRIPE_PRICE_ID</code>{" "}
                  and{" "}
                  <code className="font-mono text-[12px]">
                    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
                  </code>
                  .
                </div>
              ) : (
                <EmbeddedBillingCheckout
                  interval={isYearly ? "year" : "month"}
                  submitLabel={submitLabel}
                  onComplete={() => void handleComplete()}
                />
              )}
            </div>

            <div className="bg-[#FAFBFC] border-t lg:border-t-0 lg:border-l border-line p-6 sm:p-8 lg:p-10 flex flex-col">
              <div className="flex items-baseline justify-between gap-3 mb-5">
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                  {PAID_PLAN.name} plan
                </h2>
              </div>

              <div
                className={`grid gap-2.5 mb-6 ${
                  yearlyConfigured ? "grid-cols-2" : "grid-cols-1"
                }`}
                role="radiogroup"
                aria-label="Billing interval"
              >
                {yearlyConfigured && (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isYearly}
                    onClick={() => setBillingInterval("year")}
                    className={`text-left rounded-2xl border p-3.5 transition-all ${
                      isYearly
                        ? "border-[#2563EB] bg-white ring-1 ring-[#2563EB]/30"
                        : "border-line bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Yearly
                      </span>
                      {yearlySavings != null && yearlySavings > 0 && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          Save {formatPlanMoney(yearlySavings, currency)}
                        </span>
                      )}
                    </div>
                    <div className="text-[15px] font-semibold text-gray-900">
                      {yearlyPerMonth != null
                        ? formatPlanMoney(yearlyPerMonth, currency)
                        : "—"}
                      <span className="text-[12px] font-medium text-gray-400">
                        {" "}
                        / mo
                      </span>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isYearly}
                  onClick={() => setBillingInterval("month")}
                  className={`text-left rounded-2xl border p-3.5 transition-all ${
                    !isYearly
                      ? "border-[#2563EB] bg-white ring-1 ring-[#2563EB]/30"
                      : "border-line bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Monthly
                  </div>
                  <div className="text-[15px] font-semibold text-gray-900">
                    {monthlyAmount != null
                      ? formatPlanMoney(monthlyAmount, currency)
                      : "—"}
                    <span className="text-[12px] font-medium text-gray-400">
                      {" "}
                      / mo
                    </span>
                  </div>
                </button>
              </div>

              <div className="space-y-3 text-[14px] mb-8">
                <div className="flex items-center justify-between text-gray-600">
                  <span>1 workspace</span>
                  <span className="tabular-nums text-gray-900 font-medium">
                    {total != null ? formatPlanMoney(total, currency) : "—"}
                  </span>
                </div>
                <div className="h-px bg-line" />
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">Total due today</span>
                  <span className="text-lg font-semibold text-gray-900 tabular-nums">
                    {total != null ? formatPlanMoney(total, currency) : "—"}
                  </span>
                </div>
                <p className="text-[12px] text-gray-400 leading-relaxed">
                  {perMonth != null && total != null ? (
                    <>
                      Billed {isYearly ? "yearly" : "monthly"} at{" "}
                      {formatPlanMoney(perMonth, currency)}/month
                      {isYearly
                        ? ` (${formatPlanMoney(total, currency)}/year)`
                        : ""}
                      . Cancel anytime from Settings → Billing.
                    </>
                  ) : (
                    <>Loading prices from Stripe…</>
                  )}
                </p>
              </div>

              <div>
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
                  What&apos;s included
                </h2>
                <ul className="space-y-2.5">
                  {PAID_PLAN.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-[14px] text-gray-700"
                    >
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
