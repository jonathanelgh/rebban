import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { RECEIPT_BUCKET } from "./constants";
import { sha256Hex } from "./hash";

type Db = SupabaseClient<Database>;

export function sanitizeFilename(name: string) {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "receipt";
  return base.slice(0, 180);
}

/** Immutable storage path — month membership lives in DB only. */
export function buildReceiptStorageKey(options: {
  organizationId: string;
  receiptId: string;
  filename: string;
  role?: "original" | "preview" | "body";
}) {
  const role = options.role || "original";
  const safe = sanitizeFilename(options.filename);
  return `${options.organizationId}/unfiled/${options.receiptId}/${role}-${safe}`;
}

export function sniffMimeType(
  bytes: Buffer,
  declared?: string | null,
  filename?: string | null
) {
  if (bytes.length >= 4) {
    if (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) {
      return "application/pdf";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46
    ) {
      return "image/webp";
    }
  }
  const declaredLower = (declared || "").toLowerCase().split(";")[0].trim();
  if (declaredLower) return declaredLower;
  const ext = (filename || "").toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  if (ext === "html" || ext === "htm") return "text/html";
  if (ext === "txt") return "text/plain";
  return "application/octet-stream";
}

export async function uploadReceiptOriginal(options: {
  db: Db;
  organizationId: string;
  receiptId: string;
  filename: string;
  bytes: Buffer;
  mimeType: string;
  role?: "original" | "preview" | "body";
}) {
  const storageKey = buildReceiptStorageKey({
    organizationId: options.organizationId,
    receiptId: options.receiptId,
    filename: options.filename,
    role: options.role,
  });
  const sha256 = sha256Hex(options.bytes);

  const { error: uploadError } = await options.db.storage
    .from(RECEIPT_BUCKET)
    .upload(storageKey, options.bytes, {
      contentType: options.mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Failed to store receipt file.");
  }

  const { data: fileRow, error: insertError } = await options.db
    .from("receipt_files")
    .insert({
      receipt_id: options.receiptId,
      organization_id: options.organizationId,
      storage_key: storageKey,
      original_filename: sanitizeFilename(options.filename),
      mime_type: options.mimeType,
      bytes: options.bytes.length,
      sha256,
      role: options.role || "original",
    })
    .select("*")
    .single();

  if (insertError || !fileRow) {
    throw new Error(insertError?.message || "Failed to record receipt file.");
  }

  return fileRow;
}

export async function createReceiptSignedUrl(
  db: Db,
  storageKey: string,
  expiresInSeconds = 120
) {
  const { data, error } = await db.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(storageKey, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Failed to create download URL.");
  }
  return data.signedUrl;
}

export async function downloadReceiptBytes(db: Db, storageKey: string) {
  const { data, error } = await db.storage
    .from(RECEIPT_BUCKET)
    .download(storageKey);
  if (error || !data) {
    throw new Error(error?.message || "Failed to download receipt file.");
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}
