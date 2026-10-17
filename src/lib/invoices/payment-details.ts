/** Normalize IBAN for storage (uppercase, no spaces). */
export function normalizeIban(raw: string | null | undefined) {
  const value = raw?.replace(/\s+/g, "").toUpperCase().trim() || "";
  return value || null;
}

/** Format IBAN in groups of 4 for display. */
export function formatIbanDisplay(raw: string | null | undefined) {
  const normalized = normalizeIban(raw);
  if (!normalized) return null;
  return normalized.replace(/(.{4})/g, "$1 ").trim();
}

/** Normalize Bankgiro (digits and optional hyphen). */
export function normalizeBankgiro(raw: string | null | undefined) {
  const value = raw?.replace(/\s+/g, "").trim() || "";
  if (!value) return null;
  const digits = value.replace(/[^0-9-]/g, "");
  return digits || null;
}

export function hasBankPaymentDetails(options: {
  iban?: string | null;
  bankgiro?: string | null;
}) {
  return Boolean(normalizeIban(options.iban) || normalizeBankgiro(options.bankgiro));
}
