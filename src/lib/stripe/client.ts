import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripePublishableKey() {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Add it to .env.local (test mode keys from the Stripe Dashboard)."
    );
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      apiVersion: "2026-09-30.endive",
      typescript: true,
      appInfo: {
        name: "Rebban",
        url: "https://app.rebban.com",
      },
    });
  }
  return stripeSingleton;
}

/** Convert major currency units (e.g. 19.99) to Stripe's smallest unit. */
export function toStripeAmount(amount: number) {
  return Math.round((Number(amount) || 0) * 100);
}

/** Connect webhook (client → freelancer invoice pay + account.updated). */
export function getStripeConnectWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  if (!secret || secret === "whsec_...") return null;
  return secret;
}

/** Platform Billing webhook (freelancer → you / Pro subscriptions). */
export function getStripeBillingWebhookSecret() {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET?.trim() || null;
  if (!secret || secret === "whsec_...") return null;
  return secret;
}

/**
 * Signing secrets for `/api/stripe/webhook`.
 * Both Dashboard endpoints can point at the same URL; we try each secret.
 */
export function getStripeWebhookSecrets() {
  return [
    getStripeConnectWebhookSecret(),
    getStripeBillingWebhookSecret(),
  ].filter((secret): secret is string => Boolean(secret));
}

/** @deprecated Prefer getStripeConnectWebhookSecret / getStripeWebhookSecrets */
export function getStripeWebhookSecret() {
  return getStripeConnectWebhookSecret();
}

export function getPlatformPriceId() {
  return process.env.STRIPE_PRICE_ID?.trim() || null;
}

export function getPlatformYearlyPriceId() {
  return process.env.STRIPE_PRICE_ID_YEARLY?.trim() || null;
}

export function getPlatformPriceIdForInterval(interval: "month" | "year") {
  if (interval === "year") {
    return getPlatformYearlyPriceId();
  }
  return getPlatformPriceId();
}

export function appOriginFromRequest(request: Request) {
  // Prefer the live request origin so local onboarding returns to localhost,
  // not a production NEXT_PUBLIC_APP_URL baked into Account Link return URLs.
  try {
    const url = new URL(request.url);
    if (url.origin && url.origin !== "null") {
      return url.origin;
    }
  } catch {
    // fall through
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
