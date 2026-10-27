import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Db = SupabaseClient<Database>;

export async function findDuplicateByChecksum(
  db: Db,
  organizationId: string,
  sha256: string,
  excludeReceiptId?: string
) {
  let query = db
    .from("receipt_files")
    .select("receipt_id, sha256, receipts!inner(id, deleted_at, organization_id)")
    .eq("organization_id", organizationId)
    .eq("sha256", sha256)
    .eq("role", "original")
    .limit(5);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  for (const row of data || []) {
    const receipt = row.receipts as unknown as {
      id: string;
      deleted_at: string | null;
      organization_id: string;
    } | null;
    if (!receipt || receipt.deleted_at) continue;
    if (excludeReceiptId && receipt.id === excludeReceiptId) continue;
    return receipt.id;
  }
  return null;
}

export async function findSoftDuplicate(options: {
  db: Db;
  organizationId: string;
  merchant: string | null;
  receiptDate: string | null;
  amountMinor: number | null;
  currency: string | null;
  excludeReceiptId: string;
}) {
  if (
    !options.merchant ||
    !options.receiptDate ||
    options.amountMinor == null ||
    !options.currency
  ) {
    return null;
  }

  const { data, error } = await options.db
    .from("receipts")
    .select("id")
    .eq("organization_id", options.organizationId)
    .eq("receipt_date", options.receiptDate)
    .eq("amount_minor", options.amountMinor)
    .eq("currency", options.currency)
    .ilike("merchant", options.merchant)
    .is("deleted_at", null)
    .neq("id", options.excludeReceiptId)
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0]?.id || null;
}
