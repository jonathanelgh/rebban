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
