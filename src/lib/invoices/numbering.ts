import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Next display number like INV-0001 for the organization. */
export async function nextInvoiceNumber(
  supabase: SupabaseClient<Database>,
  organizationId: string
) {
  const { data } = await supabase
    .from("invoices")
    .select("number")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("number", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  let max = 0;
  for (const row of data ?? []) {
    const match = row.number?.match(/(\d+)\s*$/);
    if (!match) continue;
    max = Math.max(max, Number(match[1]) || 0);
  }

  return `INV-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Assigns a sequential invoice number if the invoice does not have one yet.
 * Call this when the invoice is issued (sent), not when the draft is created.
 */
export async function ensureInvoiceNumber(
  supabase: SupabaseClient<Database>,
  input: {
    invoiceId: string;
    organizationId: string;
    currentNumber?: string | null;
  }
): Promise<string> {
  const existing = input.currentNumber?.trim();
  if (existing) return existing;

  const number = await nextInvoiceNumber(supabase, input.organizationId);
  const { error } = await supabase
    .from("invoices")
    .update({ number, updated_at: new Date().toISOString() })
    .eq("id", input.invoiceId)
    .eq("organization_id", input.organizationId)
    .is("number", null);

  if (error) {
    // Another request may have assigned it — re-read.
    const { data } = await supabase
      .from("invoices")
      .select("number")
      .eq("id", input.invoiceId)
      .maybeSingle();
    if (data?.number?.trim()) return data.number.trim();
    throw new Error(error.message || "Could not assign invoice number.");
  }

  // Confirm what landed (handles race).
  const { data } = await supabase
    .from("invoices")
    .select("number")
    .eq("id", input.invoiceId)
    .maybeSingle();
  return data?.number?.trim() || number;
}
