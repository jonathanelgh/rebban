const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export function currencyDecimals(currency: string) {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  return 2;
}

export function toMinorUnits(amount: number, currency: string) {
  const decimals = currencyDecimals(currency);
  return Math.round(amount * 10 ** decimals);
}

export function fromMinorUnits(amountMinor: number | null | undefined, currency: string | null | undefined) {
  if (amountMinor == null || !currency) return null;
  const decimals = currencyDecimals(currency);
  return amountMinor / 10 ** decimals;
}

export function formatReceiptMoney(
  amountMinor: number | null | undefined,
  currency: string | null | undefined
) {
  if (amountMinor == null || !currency) return "—";
  const major = fromMinorUnits(amountMinor, currency);
  if (major == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(major);
  } catch {
    return `${major.toFixed(currencyDecimals(currency))} ${currency.toUpperCase()}`;
  }
}
