import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { processReceiptExtraction } from "./process";
import { uploadReceiptOriginal } from "./storage";
import { validateReceiptBytes } from "./validate";

type Db = SupabaseClient<Database>;

export async function createReceiptFromUpload(options: {
  db: Db;
  organizationId: string;
  userId: string;
  filename: string;
  bytes: Buffer;
  declaredMime?: string | null;
  extractNow?: boolean;
}) {
  const validated = validateReceiptBytes({
    bytes: options.bytes,
    filename: options.filename,
    declaredMime: options.declaredMime,
  });
  if (!validated.ok) {
    return { ok: false as const, error: validated.error };
  }

  const { data: receipt, error } = await options.db
    .from("receipts")
    .insert({
      organization_id: options.organizationId,
      source: "upload",
      review_status: "processing",
      original_filename: options.filename.slice(0, 240),
      created_by: options.userId,
    })
    .select("*")
    .single();

  if (error || !receipt) {
    return { ok: false as const, error: error?.message || "Failed to create receipt." };
  }

  try {
    await uploadReceiptOriginal({
      db: options.db,
      organizationId: options.organizationId,
      receiptId: receipt.id,
      filename: options.filename,
      bytes: options.bytes,
      mimeType: validated.mimeType,
      role: "original",
    });

    await options.db.from("receipt_events").insert({
      receipt_id: receipt.id,
      organization_id: options.organizationId,
      actor_id: options.userId,
      event_type: "uploaded",
      new_values: {
        filename: options.filename,
        mime_type: validated.mimeType,
        bytes: options.bytes.length,
      } as Json,
    });

    if (options.extractNow !== false) {
      await processReceiptExtraction(options.db, receipt.id);
    }

    const { data: refreshed } = await options.db
      .from("receipts")
      .select("*")
      .eq("id", receipt.id)
      .single();

    return { ok: true as const, receipt: refreshed || receipt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    await options.db
      .from("receipts")
      .update({ review_status: "failed" })
      .eq("id", receipt.id);
    return { ok: false as const, error: message, receiptId: receipt.id };
  }
}
