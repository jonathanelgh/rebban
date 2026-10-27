import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fromMinorUnits } from "./money";
import { downloadReceiptBytes, sanitizeFilename } from "./storage";

type Db = SupabaseClient<Database>;

function exportFilename(options: {
  receiptDate: string | null;
  merchant: string | null;
  amountMinor: number | null;
  currency: string | null;
  shortId: string;
  originalFilename: string;
}) {
  const date = options.receiptDate || "undated";
  const merchant = sanitizeFilename(options.merchant || "unknown").replace(
    /\s+/g,
    "_"
  );
  const amount =
    options.amountMinor != null && options.currency
      ? String(fromMinorUnits(options.amountMinor, options.currency) ?? "")
      : "na";
  const currency = (options.currency || "XXX").toUpperCase();
  const ext = options.originalFilename.includes(".")
    ? `.${options.originalFilename.split(".").pop()}`
    : "";
  return `${date}_${merchant}_${amount}_${currency}_${options.shortId}${ext}`;
}

export async function buildSelectedReceiptsZip(options: {
  db: Db;
  organizationId: string;
  receiptIds: string[];
}) {
  const ids = Array.from(new Set(options.receiptIds.map(String).filter(Boolean)));
  if (!ids.length) {
    throw new Error("Select at least one receipt.");
  }
  if (ids.length > 50) {
    throw new Error("Download up to 50 receipts at a time.");
  }

  const { data: receipts, error } = await options.db
    .from("receipts")
    .select(
      "id, merchant, receipt_date, amount_minor, currency, original_filename"
    )
    .eq("organization_id", options.organizationId)
    .in("id", ids)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
  if (!receipts?.length) throw new Error("No receipts found.");

  const zip = new JSZip();
  const usedNames = new Set<string>();
  let packed = 0;

  for (const receipt of receipts) {
    const { data: file } = await options.db
      .from("receipt_files")
      .select("storage_key, original_filename, mime_type")
      .eq("receipt_id", receipt.id)
      .eq("organization_id", options.organizationId)
      .eq("role", "original")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!file?.storage_key) continue;

    let name = exportFilename({
      receiptDate: receipt.receipt_date,
      merchant: receipt.merchant,
      amountMinor: receipt.amount_minor,
      currency: receipt.currency,
      shortId: receipt.id.slice(0, 8),
      originalFilename:
        file.original_filename || receipt.original_filename || "file",
    });
    let n = 1;
    while (usedNames.has(name.toLowerCase())) {
      name = name.replace(/(\.[^.]+)?$/, `_${n}$1`);
      n += 1;
    }
    usedNames.add(name.toLowerCase());

    const bytes = await downloadReceiptBytes(options.db, file.storage_key);
    zip.file(name, bytes);
    packed += 1;
  }

  if (!packed) {
    throw new Error("None of the selected receipts have an original file.");
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return {
    buffer,
    packed,
    requested: ids.length,
    filename: `receipts-${packed}-files.zip`,
  };
}

export async function loadSingleOriginal(options: {
  db: Db;
  organizationId: string;
  receiptId: string;
}) {
  const { data: receipt, error } = await options.db
    .from("receipts")
    .select("id, original_filename")
    .eq("id", options.receiptId)
    .eq("organization_id", options.organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!receipt) throw new Error("Receipt not found.");

  const { data: file } = await options.db
    .from("receipt_files")
    .select("storage_key, original_filename, mime_type")
    .eq("receipt_id", receipt.id)
    .eq("organization_id", options.organizationId)
    .eq("role", "original")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!file?.storage_key) {
    throw new Error("Original file not found.");
  }

  const bytes = await downloadReceiptBytes(options.db, file.storage_key);
  return {
    bytes,
    filename:
      file.original_filename || receipt.original_filename || "receipt.pdf",
    mimeType: file.mime_type || "application/octet-stream",
  };
}
