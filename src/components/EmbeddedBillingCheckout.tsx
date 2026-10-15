"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import { Loader2, Lock } from "lucide-react";
import type { BillingInterval } from "@/lib/billing/plan";

let platformStripePromise: Promise<Stripe | null> | null = null;

function getPlatformStripe(publishableKey: string) {
  if (!platformStripePromise) {
    platformStripePromise = loadStripe(publishableKey);
  }
  return platformStripePromise;
}

function PaymentForm({
  submitLabel,
  onComplete,
}: {
  submitLabel: string;
  onComplete?: () => void;
}) {
  const result = useCheckoutElements();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (result.type === "loading") {
    return (
      <div className="py-10 flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading payment form…
      </div>
    );
  }

  if (result.type === "error") {
    return (
      <p className="text-[13px] text-red-600 text-center py-6">
        {result.error.message}
      </p>
    );
  }

  const { checkout } = result;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!checkout.canConfirm) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const confirmResult = await checkout.confirm();
      if (confirmResult.type === "error") {
        setErrorMessage(confirmResult.error.message || "Payment failed");
        return;
      }
      onComplete?.();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
          Payment details
        </div>
        <PaymentElement
          options={{
            layout: "tabs",
            wallets: {
              applePay: "auto",
              googlePay: "auto",
              link: "never",
            },
          }}
        />
      </div>
      {errorMessage && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={!checkout.canConfirm || isSubmitting}
        className="btn-primary w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-full text-[15px] font-semibold disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing…
          </>
        ) : (
          submitLabel
        )}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-[12px] text-gray-400">
        <Lock className="w-3.5 h-3.5" />
        Guaranteed safe &amp; secure payments via Stripe
      </p>
    </form>
  );
}

export function EmbeddedBillingCheckout({
  interval,
  submitLabel,
  onComplete,
}: {
  interval: BillingInterval;
  submitLabel: string;
  onComplete?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError(null);
      setClientSecret(null);
      try {
        const res = await fetch("/api/stripe/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          clientSecret?: string;
          publishableKey?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.clientSecret || !json.publishableKey) {
          setError(json.error || "Could not start checkout");
          return;
        }
        setClientSecret(json.clientSecret);
        setPublishableKey(json.publishableKey);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not start checkout");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [interval]);

  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return getPlatformStripe(publishableKey);
  }, [publishableKey]);

  if (loading) {
    return (
      <div className="py-10 flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Preparing checkout…
      </div>
    );
  }

  if (error || !clientSecret || !stripePromise) {
    return (
      <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
        {error || "Checkout unavailable"}
      </p>
    );
  }

  return (
    <CheckoutElementsProvider
      key={clientSecret}
      stripe={stripePromise}
      options={{
        clientSecret,
        elementsOptions: {
          appearance: {
            theme: "stripe",
            variables: {
              borderRadius: "12px",
              fontFamily:
                'Satoshi, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              colorPrimary: "#2563EB",
            },
          },
        },
      }}
    >
      <PaymentForm submitLabel={submitLabel} onComplete={onComplete} />
    </CheckoutElementsProvider>
  );
}
