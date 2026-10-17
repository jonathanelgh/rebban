export type InvoiceLineUnit = "qty" | "hr" | "day" | "flat";

export const INVOICE_LINE_UNIT_OPTIONS: {
  value: InvoiceLineUnit;
  label: string;
  short: string;
}[] = [
  { value: "qty", label: "Qty", short: "" },
  { value: "hr", label: "Hours", short: "h" },
  { value: "day", label: "Days", short: "d" },
  { value: "flat", label: "Flat", short: "" },
];

export function formatInvoiceQuantity(
  quantity: number | string,
  unit?: InvoiceLineUnit | null
) {
  const q = Number(quantity);
  const amount = Number.isFinite(q) ? String(quantity) : String(quantity || "");
  if (!unit || unit === "qty" || unit === "flat") return amount;
  if (unit === "hr") return `${amount}h`;
  if (unit === "day") return `${amount}d`;
  return amount;
}

export function invoiceUnitLabel(unit?: InvoiceLineUnit | null) {
  return (
    INVOICE_LINE_UNIT_OPTIONS.find((o) => o.value === unit)?.label || "Qty"
  );
}
