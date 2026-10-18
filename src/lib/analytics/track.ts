type TrackParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

/** Fire a GA4 event when analytics consent has loaded gtag. */
export function trackEvent(name: string, params?: TrackParams) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  const cleaned: Record<string, string | number | boolean> = {};
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) cleaned[key] = value;
    }
  }
  window.gtag("event", name, cleaned);
}

/** Fire a Meta Pixel standard event when marketing consent has loaded fbq. */
export function trackMeta(
  event: string,
  params?: Record<string, string | number | boolean>
) {
  if (typeof window === "undefined") return;
  if (typeof window.fbq !== "function") return;
  if (params) window.fbq("track", event, params);
  else window.fbq("track", event);
}

export function trackSignUp(method: "email" | "google") {
  trackEvent("sign_up", { method });
  trackMeta("CompleteRegistration", { method });
}

export function trackSubscribed(options?: {
  plan?: string;
  interval?: "month" | "year";
  currency?: string;
  value?: number;
}) {
  const plan = options?.plan ?? "pro";
  trackEvent("subscribed", {
    plan,
    interval: options?.interval,
    currency: options?.currency,
    value: options?.value,
  });
  // Also send GA4 purchase for revenue-friendly reports.
  if (options?.value != null && options?.currency) {
    trackEvent("purchase", {
      currency: options.currency,
      value: options.value,
    });
  }
  trackMeta("Subscribe", {
    plan,
    ...(options?.currency && options?.value != null
      ? { currency: options.currency, value: options.value }
      : {}),
  });
}
