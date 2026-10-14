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
        url: "https://rebban.com",
      },
    });
  }
  return stripeSingleton;
}

/** Convert major currency units (e.g. 19.99) to Stripe's smallest unit. */
export function toStripeAmount(amount: number) {
  return Math.round((Number(amount) || 0) * 100);
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function getPlatformPriceId() {
  return process.env.STRIPE_PRICE_ID?.trim() || null;
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
