import { RECEIPT_ALLOWED_MIME, RECEIPT_MAX_BYTES } from "./constants";
import { sniffMimeType } from "./storage";

export function validateReceiptBytes(options: {
  bytes: Buffer;
  filename: string;
  declaredMime?: string | null;
}) {
  if (options.bytes.length === 0) {
    return { ok: false as const, error: "Empty file." };
  }
  if (options.bytes.length > RECEIPT_MAX_BYTES) {
    return {
      ok: false as const,
      error: `File exceeds ${Math.round(RECEIPT_MAX_BYTES / (1024 * 1024))}MB limit.`,
    };
  }

  const mime = sniffMimeType(
    options.bytes,
    options.declaredMime,
    options.filename
  );

  // Block obvious executables / archives by signature
  if (
    options.bytes[0] === 0x4d &&
    options.bytes[1] === 0x5a // MZ
  ) {
    return { ok: false as const, error: "Executable files are not allowed." };
  }
  if (
    options.bytes[0] === 0x50 &&
    options.bytes[1] === 0x4b &&
    mime !== "application/pdf"
  ) {
    // ZIP / office / jar — reject for MVP
    return {
      ok: false as const,
      error: "Archive and Office documents are not supported yet. Upload PDF or image.",
    };
  }

  if (!RECEIPT_ALLOWED_MIME.has(mime) && mime !== "application/octet-stream") {
    return {
      ok: false as const,
      error: `Unsupported file type (${mime}). Use PDF, JPG, or PNG.`,
    };
  }

  const normalized =
    mime === "application/octet-stream"
      ? sniffMimeType(options.bytes, null, options.filename)
      : mime;

  if (!RECEIPT_ALLOWED_MIME.has(normalized)) {
    return {
      ok: false as const,
      error: `Unsupported file type. Use PDF, JPG, or PNG.`,
    };
  }

  return { ok: true as const, mimeType: normalized };
}

/** Skip tiny decorative / signature images from email. */
export function isLikelyDecorativeAttachment(options: {
  filename?: string | null;
  mimeType?: string | null;
  bytes: number;
  contentDisposition?: string | null;
}) {
  const name = (options.filename || "").toLowerCase();
  const mime = (options.mimeType || "").toLowerCase();
  if (!mime.startsWith("image/")) return false;
  if (options.bytes > 0 && options.bytes < 12_000) return true;
  if (
    /logo|signature|spacer|pixel|tracking|icon|avatar|badge/.test(name)
  ) {
    return true;
  }
  if (
    (options.contentDisposition || "").toLowerCase() === "inline" &&
    options.bytes < 40_000
  ) {
    return true;
  }
  return false;
}
