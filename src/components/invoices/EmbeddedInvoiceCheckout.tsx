"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import { Loader2 } from "lucide-react";

const stripeCache = new Map<string, Promise<Stripe | null>>();

function getStripePromise(publishableKey: string, stripeAccountId: string) {
  const cacheKey = `${publishableKey}:${stripeAccountId}`;
  let promise = stripeCache.get(cacheKey);
  if (!promise) {
    promise = loadStripe(publishableKey, { stripeAccount: stripeAccountId });
    stripeCache.set(cacheKey, promise);
  }
  return promise;
}

type BillingInfo = {
  name: string;
  email: string | null;
  country: string;
};

function PaymentForm({
  amountLabel,
  sessionId,
  onComplete,
}: {
  amountLabel: string;
  sessionId: string | null;
  onComplete?: (sessionId: string | null) => void;
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
      // Billing name/address are collected by Payment Element; email is on the session
      const confirmResult = await checkout.confirm();
      if (confirmResult.type === "error") {
        setErrorMessage(confirmResult.error.message || "Payment failed");
        return;
      }
      onComplete?.(sessionId);
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
      <PaymentElement
        options={{
          layout: "tabs",
          wallets: {
            applePay: "auto",
            googlePay: "auto",
            link: "never",
          },
          fields: {
            billingDetails: {
              // Email is already set on the Checkout Session
              email: "never",
            },
          },
        }}
      />
      {errorMessage && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={!checkout.canConfirm || isSubmitting}
        className="btn-primary w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing…
          </>
        ) : (
          `Pay ${amountLabel}`
        )}
      </button>
      <p className="text-center text-[11px] text-gray-400">
        Secured by Stripe
      </p>
    </form>
  );
}

export function EmbeddedInvoiceCheckout({
  token,
  amountLabel,
  onComplete,
}: {
  token: string;
  amountLabel: string;
  onComplete?: (sessionId: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stripe/pay/${token}/checkout`, {
          method: "POST",
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          clientSecret?: string;
          publishableKey?: string;
          stripeAccountId?: string;
          sessionId?: string;
          billing?: BillingInfo;
        };
        if (cancelled) return;
        if (
          !res.ok ||
          !json.clientSecret ||
          !json.publishableKey ||
          !json.stripeAccountId
        ) {
          setError(json.error || "Could not start checkout");
          setClientSecret(null);
          return;
        }
        setClientSecret(json.clientSecret);
        setPublishableKey(json.publishableKey);
        setStripeAccountId(json.stripeAccountId);
        setSessionId(json.sessionId || null);
        setBilling(json.billing || null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not start checkout");
        setClientSecret(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const stripePromise = useMemo(() => {
    if (!publishableKey || !stripeAccountId) return null;
    return getStripePromise(publishableKey, stripeAccountId);
  }, [publishableKey, stripeAccountId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-white px-5 py-10 flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Preparing payment…</span>
      </div>
    );
  }

  if (error || !clientSecret || !stripePromise) {
    return (
      <div className="rounded-2xl border border-line bg-white px-5 py-6">
        <p className="text-[13px] text-red-600 text-center">
          {error || "Checkout unavailable"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white px-5 py-4">
      <CheckoutElementsProvider
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
              },
            },
          },
          ...(billing
            ? {
                defaultValues: {
                  billingAddress: {
                    name: billing.name,
                    address: { country: billing.country },
                  },
                },
              }
            : {}),
        }}
      >
        <PaymentForm
          amountLabel={amountLabel}
          sessionId={sessionId}
          onComplete={onComplete}
        />
      </CheckoutElementsProvider>
    </div>
  );
}
