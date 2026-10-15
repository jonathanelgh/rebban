import type Stripe from "stripe";
import {
  getPlatformPriceId,
  getPlatformYearlyPriceId,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe/client";

export type PlatformPrice = {
  id: string;
  /** Major currency units (e.g. 29.00). */
  amount: number;
  currency: string;
  interval: "month" | "year" | "week" | "day" | null;
};

export type PlatformPricing = {
  monthly: PlatformPrice | null;
  yearly: PlatformPrice | null;
  /** Equivalent monthly rate when paying yearly (yearly.amount / 12). */
  yearlyPerMonth: number | null;
  /** Savings vs 12× monthly, in major units. Null if either price missing. */
  yearlySavings: number | null;
};

function toMajorAmount(price: Stripe.Price) {
  if (typeof price.unit_amount === "number") {
    return price.unit_amount / 100;
  }
  if (price.unit_amount_decimal) {
    return Number(price.unit_amount_decimal) / 100;
  }
  return 0;
}

function serializePrice(price: Stripe.Price): PlatformPrice {
  const raw = String(price.recurring?.interval || "");
  const interval: PlatformPrice["interval"] =
    raw === "month" || raw === "year" || raw === "week" || raw === "day"
      ? raw
      : null;
  return {
    id: price.id,
    amount: toMajorAmount(price),
    currency: (price.currency || "usd").toUpperCase(),
    interval,
  };
}

export async function fetchPlatformPricing(): Promise<PlatformPricing> {
  const empty: PlatformPricing = {
    monthly: null,
    yearly: null,
    yearlyPerMonth: null,
    yearlySavings: null,
  };

  if (!isStripeConfigured()) return empty;

  const monthlyId = getPlatformPriceId();
  const yearlyId = getPlatformYearlyPriceId();
  if (!monthlyId && !yearlyId) return empty;

  const stripe = getStripe();
  const [monthlyRes, yearlyRes] = await Promise.all([
    monthlyId
      ? stripe.prices.retrieve(monthlyId).catch((err) => {
          console.error("[billing] failed to load monthly price", err);
          return null;
        })
      : Promise.resolve(null),
    yearlyId
      ? stripe.prices.retrieve(yearlyId).catch((err) => {
          console.error("[billing] failed to load yearly price", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const monthly = monthlyRes ? serializePrice(monthlyRes) : null;
  const yearly = yearlyRes ? serializePrice(yearlyRes) : null;
  const yearlyPerMonth = yearly ? yearly.amount / 12 : null;
  const yearlySavings =
    monthly && yearly ? monthly.amount * 12 - yearly.amount : null;

  return {
    monthly,
    yearly,
    yearlyPerMonth,
    yearlySavings: yearlySavings != null && yearlySavings > 0 ? yearlySavings : yearlySavings,
  };
}
