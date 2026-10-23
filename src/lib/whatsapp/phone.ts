/** Digits only (WhatsApp / E.164 without +). */
export function normalizeWhatsAppPhone(input: string): string {
  return String(input || "").replace(/[^0-9]/g, "");
}

/** Display helper: +4670… */
export function formatPhoneDisplay(phoneDigits: string): string {
  const digits = normalizeWhatsAppPhone(phoneDigits);
  if (!digits) return "";
  return `+${digits}`;
}

export function isLikelyPhone(input: string): boolean {
  const digits = normalizeWhatsAppPhone(input);
  return digits.length >= 8 && digits.length <= 15;
}
