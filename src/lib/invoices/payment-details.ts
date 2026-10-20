/** Normalize IBAN for storage (uppercase, no spaces). */
export function normalizeIban(raw: string | null | undefined) {
  const value = raw?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().trim() || "";
  return value || null;
}

/** Format IBAN in groups of 4 for display. */
export function formatIbanDisplay(raw: string | null | undefined) {
  const normalized = normalizeIban(raw);
  if (!normalized) return null;
  return normalized.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Mask IBAN while typing: uppercase A–Z/0–9 only, max 34 chars,
 * spaced in groups of 4 (e.g. SE45 5000 0000 0583 9825 7466).
 */
export function maskIbanInput(raw: string) {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 34);
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}

/** Normalize Bankgiro (digits and optional hyphen). */
export function normalizeBankgiro(raw: string | null | undefined) {
  const value = raw?.replace(/\s+/g, "").trim() || "";
  if (!value) return null;
  const digits = value.replace(/[^0-9-]/g, "");
  return digits || null;
}

/**
 * Normalize phone-based payment IDs (Swish / MB Way).
 * Keeps a leading + and digits only.
 */
export function normalizePaymentPhone(raw: string | null | undefined) {
  const trimmed = raw?.trim() || "";
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}

/** Light mask while typing a payment phone number. */
export function maskPaymentPhoneInput(raw: string) {
  const trimmed = raw.trimStart();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "").slice(0, 15);
  if (!digits) return hasPlus ? "+" : "";
  // Group: +CC XXX XXX XXX… (loose, readable)
  const body = digits.replace(/(\d{2,3})(?=\d)/g, "$1 ").trim();
  return hasPlus ? `+${body}` : body;
}

export function hasBankPaymentDetails(options: {
  iban?: string | null;
  bankgiro?: string | null;
  swish?: string | null;
  mbway?: string | null;
}) {
  return Boolean(
    normalizeIban(options.iban) ||
      normalizeBankgiro(options.bankgiro) ||
      normalizePaymentPhone(options.swish) ||
      normalizePaymentPhone(options.mbway)
  );
}
