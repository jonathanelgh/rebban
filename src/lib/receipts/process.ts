import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Enums, Json } from "@/types/database";
import { findDuplicateByChecksum, findSoftDuplicate } from "./duplicates";
import {
  extractReceiptFromImage,
  extractReceiptFromPdf,
  extractReceiptFromPlainText,
  type ReceiptExtractionResult,
} from "./extract";
import { downloadReceiptBytes } from "./storage";

type Db = SupabaseClient<Database>;
type ReviewStatus = Enums<"receipt_review_status">;

function decideStatus(
  extraction: ReceiptExtractionResult,
  duplicateOf: string | null
): ReviewStatus {
  if (duplicateOf) return "possible_duplicate";

  const conf = extraction.confidence_by_field;
  const low =
    (conf.receipt_date != null && conf.receipt_date < 0.55) ||
    (conf.total_amount != null && conf.total_amount < 0.55) ||
    (conf.merchant_name != null && conf.merchant_name < 0.45);

  const missingCore =
    !extraction.receipt_date ||
    extraction.total_amount_minor == null ||
    !extraction.currency ||
    !extraction.merchant_name;

  if (missingCore || low || extraction.warnings.length > 0) {
    return "needs_review";
  }
  return "ready";
}

export async function processReceiptExtraction(
  db: Db,
  receiptId: string
): Promise<{ ok: true; status: ReviewStatus } | { ok: false; error: string }> {
  const { data: receipt, error: receiptError } = await db
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .is("deleted_at", null)
    .maybeSingle();

  if (receiptError || !receipt) {
    return { ok: false, error: receiptError?.message || "Receipt not found." };
  }

  const { data: files, error: filesError } = await db
    .from("receipt_files")
    .select("*")
    .eq("receipt_id", receiptId)
    .order("created_at", { ascending: true });

  if (filesError) return { ok: false, error: filesError.message };

  const original =
    (files || []).find((f) => f.role === "original") ||
    (files || []).find((f) => f.role === "body") ||
    (files || [])[0];

  if (!original) {
    await db
      .from("receipts")
      .update({ review_status: "failed" })
      .eq("id", receiptId);
    return { ok: false, error: "No file to extract." };
  }

  try {
    const bytes = await downloadReceiptBytes(db, original.storage_key);
    let extraction: ReceiptExtractionResult;

    if (original.mime_type === "application/pdf") {
      extraction = await extractReceiptFromPdf(bytes);
    } else if (original.mime_type.startsWith("image/")) {
      if (
        original.mime_type === "image/heic" ||
        original.mime_type === "image/heif"
      ) {
        extraction = {
          document_type: "unknown",
          merchant_name: null,
          receipt_date: null,
          total_amount_minor: null,
          currency: null,
          tax_amount_minor: null,
          confidence_by_field: {},
          warnings: [
            "HEIC preview extraction is limited. Please review and fill in details.",
          ],
          raw: {},
          model: "heic-skip",
        };
      } else {
        extraction = await extractReceiptFromImage({
          bytes,
          mimeType: original.mime_type,
        });
      }
    } else if (
      original.mime_type === "text/plain" ||
      original.mime_type === "text/html"
    ) {
      extraction = await extractReceiptFromPlainText(bytes.toString("utf8"));
    } else {
      extraction = {
        document_type: "unknown",
        merchant_name: null,
        receipt_date: null,
        total_amount_minor: null,
        currency: null,
        tax_amount_minor: null,
        confidence_by_field: {},
        warnings: [`Unsupported type ${original.mime_type} for auto-extract.`],
        raw: {},
        model: "none",
      };
    }

    const hardDup = await findDuplicateByChecksum(
      db,
      receipt.organization_id,
      original.sha256,
      receiptId
    );
    const softDup =
      hardDup ||
      (await findSoftDuplicate({
        db,
        organizationId: receipt.organization_id,
        merchant: extraction.merchant_name,
        receiptDate: extraction.receipt_date,
        amountMinor: extraction.total_amount_minor,
        currency: extraction.currency,
        excludeReceiptId: receiptId,
      }));

    const status = decideStatus(extraction, softDup);

    const { count } = await db
      .from("receipt_extractions")
      .select("id", { count: "exact", head: true })
      .eq("receipt_id", receiptId);

    await db.from("receipt_extractions").insert({
      receipt_id: receiptId,
      organization_id: receipt.organization_id,
      model: extraction.model,
      raw_json: extraction.raw as Json,
      confidence_json: extraction.confidence_by_field as Json,
      warnings: extraction.warnings as Json,
      version: (count || 0) + 1,
    });

    await db
      .from("receipts")
      .update({
        merchant: extraction.merchant_name,
        receipt_date: extraction.receipt_date,
        amount_minor: extraction.total_amount_minor,
        currency: extraction.currency,
        tax_amount_minor: extraction.tax_amount_minor,
        document_type: extraction.document_type,
        review_status: status,
        is_possible_duplicate: Boolean(softDup),
        duplicate_of: softDup,
      })
      .eq("id", receiptId);

    await db.from("receipt_events").insert({
      receipt_id: receiptId,
      organization_id: receipt.organization_id,
      event_type: "extracted",
      new_values: {
        review_status: status,
        merchant: extraction.merchant_name,
        receipt_date: extraction.receipt_date,
        amount_minor: extraction.total_amount_minor,
        currency: extraction.currency,
        duplicate_of: softDup,
      } as Json,
    });

    return { ok: true, status };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    // Keep the original available for manual review instead of hiding as a hard fail
    await db
      .from("receipts")
      .update({
        review_status: "needs_review",
        note: `Auto-extract failed: ${message.slice(0, 240)}`,
      })
      .eq("id", receiptId);
    await db.from("receipt_events").insert({
      receipt_id: receiptId,
      organization_id: receipt.organization_id,
      event_type: "extraction_failed",
      new_values: { error: message } as Json,
    });
    return { ok: false, error: message };
  }
}
