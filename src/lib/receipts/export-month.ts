import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { RECEIPT_BUCKET } from "./constants";
import { fromMinorUnits } from "./money";
import { downloadReceiptBytes, sanitizeFilename } from "./storage";

type Db = SupabaseClient<Database>;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

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
  const ext =
    options.originalFilename.includes(".")
      ? `.${options.originalFilename.split(".").pop()}`
      : "";
  return `${date}_${merchant}_${amount}_${currency}_${options.shortId}${ext}`;
}

function csvEscape(value: string | number | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function buildMonthExportZip(options: {
  db: Db;
  organizationId: string;
  year: number;
  month: number;
}) {
  const { year, month, organizationId, db } = options;
  const start = `${year}-${pad2(month)}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = `${year}-${pad2(month)}-${pad2(endDate.getUTCDate())}`;

  const { data: receipts, error } = await db
    .from("receipts")
    .select(
      "id, merchant, receipt_date, amount_minor, currency, document_type, review_status, source, note, original_filename"
    )
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .gte("receipt_date", start)
    .lte("receipt_date", end)
    .order("receipt_date", { ascending: true });

  if (error) throw new Error(error.message);

  const { data: unfiled } = await db
    .from("receipts")
    .select(
      "id, merchant, receipt_date, amount_minor, currency, document_type, review_status, source, note, original_filename"
    )
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .is("receipt_date", null)
    .in("review_status", ["needs_review", "processing", "failed", "possible_duplicate"])
    .order("created_at", { ascending: false })
    .limit(200);

  const zip = new JSZip();
  const folder = `${year}-${pad2(month)}`;
  const usedNames = new Set<string>();

  const manifestRows: string[] = [
    [
      "receipt_id",
      "merchant",
      "receipt_date",
      "amount",
      "currency",
      "document_type",
      "review_status",
      "source",
      "original_filename",
      "exported_filename",
      "note",
    ].join(","),
  ];

  for (const receipt of receipts || []) {
    const { data: file } = await db
      .from("receipt_files")
      .select("storage_key, original_filename, mime_type")
      .eq("receipt_id", receipt.id)
      .eq("role", "original")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!file) continue;

    let exported = exportFilename({
      receiptDate: receipt.receipt_date,
      merchant: receipt.merchant,
      amountMinor: receipt.amount_minor,
      currency: receipt.currency,
      shortId: receipt.id.slice(0, 8),
      originalFilename: file.original_filename || receipt.original_filename || "file",
    });
    let n = 1;
    while (usedNames.has(exported)) {
      exported = exported.replace(/(\.[^.]+)?$/, `_${n}$1`);
      n += 1;
    }
    usedNames.add(exported);

    const bytes = await downloadReceiptBytes(db, file.storage_key);
    zip.file(`${folder}/${exported}`, bytes);

    const amount =
      receipt.amount_minor != null && receipt.currency
        ? fromMinorUnits(receipt.amount_minor, receipt.currency)
        : "";

    manifestRows.push(
      [
        csvEscape(receipt.id),
        csvEscape(receipt.merchant),
        csvEscape(receipt.receipt_date),
        csvEscape(amount),
        csvEscape(receipt.currency),
        csvEscape(receipt.document_type),
        csvEscape(receipt.review_status),
        csvEscape(receipt.source),
        csvEscape(file.original_filename),
        csvEscape(exported),
        csvEscape(receipt.note),
      ].join(",")
    );
  }

  zip.file(`${folder}/manifest.csv`, manifestRows.join("\n"));

  if (unfiled && unfiled.length > 0) {
    const attention = [
      "receipt_id,merchant,review_status,source,original_filename,note",
      ...unfiled.map((r) =>
        [
          csvEscape(r.id),
          csvEscape(r.merchant),
          csvEscape(r.review_status),
          csvEscape(r.source),
          csvEscape(r.original_filename),
          csvEscape(r.note),
        ].join(",")
      ),
    ].join("\n");
    zip.file(`${folder}/requires_attention.csv`, attention);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const storageKey = `${organizationId}/exports/${year}-${pad2(month)}-${Date.now()}.zip`;
  const { error: uploadError } = await db.storage
    .from(RECEIPT_BUCKET)
    .upload(storageKey, buffer, {
      contentType: "application/zip",
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    storageKey,
    expiresAt,
    receiptCount: (receipts || []).length,
    unfiledCount: (unfiled || []).length,
    bytes: buffer.length,
  };
}
