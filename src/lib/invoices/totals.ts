export type InvoiceLineInput = {
  quantity: number | string;
  unitPrice: number | string;
};

export function lineAmount(quantity: number | string, unitPrice: number | string) {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  return Math.round(qty * price * 100) / 100;
}

export function computeInvoiceTotals(
  lines: InvoiceLineInput[],
  taxTotal: number | string = 0
) {
  const subtotal = Math.round(
    lines.reduce((sum, line) => sum + lineAmount(line.quantity, line.unitPrice), 0) *
      100
  ) / 100;
  const tax = Math.max(0, Math.round((Number(taxTotal) || 0) * 100) / 100);
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal, taxTotal: tax, total };
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
