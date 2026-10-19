import type Stripe from "stripe";
import {
  getPlatformPriceId,
  getPlatformYearlyPriceId,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe/client";
import {
  normalizePlatformBillingCurrency,
  type PlatformBillingCurrency,
} from "@/lib/stripe/billing-currency";

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
  /** Currency used for the amounts above. */
  currency: PlatformBillingCurrency;
};

function toMajorFromUnitAmount(unitAmount: number | null | undefined) {
  if (typeof unitAmount !== "number") return 0;
  return unitAmount / 100;
}

function toMajorAmount(price: Stripe.Price) {
  if (typeof price.unit_amount === "number") {
    return price.unit_amount / 100;
  }
  if (price.unit_amount_decimal) {
    return Number(price.unit_amount_decimal) / 100;
  }
  return 0;
}

function amountForCurrency(
  price: Stripe.Price,
  currency: PlatformBillingCurrency
) {
  const wanted = currency.toLowerCase();
  const options = price.currency_options as
    | Record<string, { unit_amount?: number | null } | undefined>
    | null
    | undefined;

  if (options?.[wanted] && typeof options[wanted]?.unit_amount === "number") {
    return {
      amount: toMajorFromUnitAmount(options[wanted]?.unit_amount),
      currency,
      matched: true as const,
    };
  }

  const defaultCurrency = (price.currency || "usd").toUpperCase();
  if (defaultCurrency === currency) {
    return {
      amount: toMajorAmount(price),
      currency,
      matched: true as const,
    };
  }

  // Price doesn't support the preferred currency yet — fall back to default.
  return {
    amount: toMajorAmount(price),
    currency: normalizePlatformBillingCurrency(defaultCurrency),
    matched: false as const,
  };
}

function serializePrice(
  price: Stripe.Price,
  preferred: PlatformBillingCurrency
): PlatformPrice {
  const raw = String(price.recurring?.interval || "");
  const interval: PlatformPrice["interval"] =
    raw === "month" || raw === "year" || raw === "week" || raw === "day"
      ? raw
      : null;
  const resolved = amountForCurrency(price, preferred);
  return {
    id: price.id,
    amount: resolved.amount,
    currency: resolved.currency,
    interval,
  };
}

export async function fetchPlatformPricing(options?: {
  currency?: PlatformBillingCurrency | string | null;
}): Promise<PlatformPricing> {
  const preferred = normalizePlatformBillingCurrency(options?.currency);
  const empty: PlatformPricing = {
    monthly: null,
    yearly: null,
    yearlyPerMonth: null,
    yearlySavings: null,
    currency: preferred,
  };

  if (!isStripeConfigured()) return empty;

  const monthlyId = getPlatformPriceId();
  const yearlyId = getPlatformYearlyPriceId();
  if (!monthlyId && !yearlyId) return empty;

  const stripe = getStripe();
  const [monthlyRes, yearlyRes] = await Promise.all([
    monthlyId
      ? stripe.prices
          .retrieve(monthlyId, { expand: ["currency_options"] })
          .catch((err) => {
            console.error("[billing] failed to load monthly price", err);
            return null;
          })
      : Promise.resolve(null),
    yearlyId
      ? stripe.prices
          .retrieve(yearlyId, { expand: ["currency_options"] })
          .catch((err) => {
            console.error("[billing] failed to load yearly price", err);
            return null;
          })
      : Promise.resolve(null),
  ]);

  const monthly = monthlyRes ? serializePrice(monthlyRes, preferred) : null;
  const yearly = yearlyRes ? serializePrice(yearlyRes, preferred) : null;

  // Prefer a shared presentment currency if both prices resolved the same way.
  const currency = normalizePlatformBillingCurrency(
    monthly?.currency || yearly?.currency || preferred
  );

  const yearlyPerMonth = yearly ? yearly.amount / 12 : null;
  const yearlySavings =
    monthly && yearly && monthly.currency === yearly.currency
      ? monthly.amount * 12 - yearly.amount
      : null;

  return {
    monthly,
    yearly,
    yearlyPerMonth,
    yearlySavings:
      yearlySavings != null && yearlySavings > 0 ? yearlySavings : yearlySavings,
    currency,
  };
}
