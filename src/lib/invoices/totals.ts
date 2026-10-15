export type InvoiceLineInput = {
  quantity: number | string;
  unitPrice: number | string;
};

export const TAX_RATE_PRESETS = [25, 23, 21, 20, 19, 15, 10, 5, 0] as const;

export type TaxDisplayMode = "exclusive" | "inclusive";

export function lineAmount(quantity: number | string, unitPrice: number | string) {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  return Math.round(qty * price * 100) / 100;
}

export function computeInvoiceSubtotal(lines: InvoiceLineInput[]) {
  return (
    Math.round(
      lines.reduce((sum, line) => sum + lineAmount(line.quantity, line.unitPrice), 0) *
        100
    ) / 100
  );
}

/** taxRate is a percentage (e.g. 25 for 25%). */
export function computeTaxFromRate(subtotal: number, taxRate: number | string) {
  const rate = Math.max(0, Number(taxRate) || 0);
  return Math.round(subtotal * (rate / 100) * 100) / 100;
}

/** Extract tax from a gross (tax-inclusive) amount. */
export function extractTaxFromInclusive(gross: number, taxRate: number | string) {
  const rate = Math.max(0, Number(taxRate) || 0);
  if (rate <= 0) return 0;
  return Math.round(((gross * rate) / (100 + rate)) * 100) / 100;
}

export function computeInvoiceTotals(
  lines: InvoiceLineInput[],
  taxTotalOrOptions:
    | number
    | string
    | {
        taxEnabled?: boolean;
        taxRate?: number | string;
        taxTotal?: number | string;
        pricesIncludeTax?: boolean;
      } = 0
) {
  const lineSum = computeInvoiceSubtotal(lines);

  let tax = 0;
  let subtotal = lineSum;
  let total = lineSum;

  if (typeof taxTotalOrOptions === "object" && taxTotalOrOptions !== null) {
    const rate = taxTotalOrOptions.taxRate ?? 0;
    if (taxTotalOrOptions.taxEnabled) {
      if (taxTotalOrOptions.pricesIncludeTax) {
        // Line prices already include tax — split net + tax from gross.
        tax = extractTaxFromInclusive(lineSum, rate);
        subtotal = Math.round((lineSum - tax) * 100) / 100;
        total = lineSum;
      } else {
        tax = computeTaxFromRate(lineSum, rate);
        subtotal = lineSum;
        total = Math.round((subtotal + tax) * 100) / 100;
      }
    } else if (taxTotalOrOptions.taxTotal != null) {
      tax = Math.max(0, Math.round((Number(taxTotalOrOptions.taxTotal) || 0) * 100) / 100);
      subtotal = lineSum;
      total = Math.round((subtotal + tax) * 100) / 100;
    }
  } else {
    tax = Math.max(0, Math.round((Number(taxTotalOrOptions) || 0) * 100) / 100);
    subtotal = lineSum;
    total = Math.round((subtotal + tax) * 100) / 100;
  }

  return { subtotal, taxTotal: tax, total };
}

export function pricesTaxLabel(options: {
  taxEnabled?: boolean;
  pricesIncludeTax?: boolean;
}) {
  if (!options.taxEnabled) return null;
  return options.pricesIncludeTax ? "Prices incl. tax" : "Prices excl. tax";
}

export function formatInvoiceMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
