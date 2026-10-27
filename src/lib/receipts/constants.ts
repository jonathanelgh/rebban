export const RECEIPT_BUCKET = "receipt-originals";

export const RECEIPT_MAX_BYTES = 15 * 1024 * 1024;

export const RECEIPT_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/html",
  "text/plain",
]);

export function getReceiptInboundDomain() {
  return (
    process.env.RECEIPT_INBOUND_DOMAIN?.trim() ||
    "inbound.rebban.com"
  );
}

export function getReceiptExtractionModel() {
  return (
    process.env.OPENAI_RECEIPT_MODEL ||
    process.env.OPENAI_PROPOSAL_MODEL ||
    "gpt-4o-mini"
  );
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
