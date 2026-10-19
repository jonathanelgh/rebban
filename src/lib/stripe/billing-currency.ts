/** Currencies we present/charge for Rebban Pro subscriptions. */
export type PlatformBillingCurrency = "EUR" | "USD";

/**
 * US customers pay in USD. Everyone else defaults to EUR
 * (platform is Europe-based).
 */
export function platformBillingCurrencyForCountry(
  countryCode: string | null | undefined
): PlatformBillingCurrency {
  const code = String(countryCode || "")
    .trim()
    .toUpperCase();
  if (code === "US") return "USD";
  return "EUR";
}

export function normalizePlatformBillingCurrency(
  value: string | null | undefined
): PlatformBillingCurrency {
  return String(value || "")
    .trim()
    .toUpperCase() === "USD"
    ? "USD"
    : "EUR";
}
