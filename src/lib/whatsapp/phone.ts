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

/** True when chat is @lid and "phone" is just the LID user id (not E.164). */
export function isLidDigitsAsPhone(
  chatId: string | null | undefined,
  phoneDigits: string | null | undefined
): boolean {
  const chat = (chatId || "").trim();
  const phone = normalizeWhatsAppPhone(phoneDigits || "");
  if (!chat.endsWith("@lid") || !phone) return false;
  return phone === normalizeWhatsAppPhone(chat);
}
