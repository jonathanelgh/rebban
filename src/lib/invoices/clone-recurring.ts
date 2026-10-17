import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { addDaysISO, todayISODate } from "@/lib/invoices/totals";

type Db = SupabaseClient<Database>;

export async function cloneRecurringInvoice(
  db: Db,
  sourceId: string
): Promise<{ id: string; number: string | null; total: number; currency: string }> {
  const { data: source, error } = await db
    .from("invoices")
    .select(
      `id, organization_id, client_id, project_id, proposal_id, created_by,
       currency, notes, tax_enabled, tax_rate, tax_id, prices_include_tax,
       show_tax_id, show_logo, show_reference, show_shipping_address,
       shipping_address, reference_number, late_fee_enabled, late_fee_percent,
       banner_url, subtotal, tax_total, total`
    )
    .eq("id", sourceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !source) {
    throw new Error(error?.message || "Source invoice not found.");
  }

  const { data: lines, error: linesError } = await db
    .from("invoice_line_items")
    .select("description, quantity, unit, unit_price, amount, position")
    .eq("invoice_id", source.id)
    .order("position", { ascending: true });

  if (linesError) throw new Error(linesError.message);

  const issueDate = todayISODate();

  const { data: invoice, error: insertError } = await db
    .from("invoices")
    .insert({
      organization_id: source.organization_id,
      client_id: source.client_id,
      project_id: source.project_id,
      proposal_id: source.proposal_id,
      number: null,
      status: "draft",
      currency: source.currency,
      issue_date: issueDate,
      due_date: addDaysISO(issueDate, 14),
      notes: source.notes,
      subtotal: source.subtotal,
      tax_total: source.tax_total,
      total: source.total,
      tax_enabled: source.tax_enabled,
      tax_rate: source.tax_rate,
      tax_id: source.tax_id,
      prices_include_tax: source.prices_include_tax,
      show_tax_id: source.show_tax_id,
      show_logo: source.show_logo,
      show_reference: source.show_reference,
      show_shipping_address: source.show_shipping_address,
      shipping_address: source.shipping_address,
      reference_number: source.reference_number,
      late_fee_enabled: source.late_fee_enabled,
      late_fee_percent: source.late_fee_percent,
      banner_url: source.banner_url,
      created_by: source.created_by,
      payment_token: nanoid(24),
      recurrence_enabled: false,
      recurrence_source_id: source.id,
    })
    .select("id, number, total, currency")
    .single();

  if (insertError || !invoice) {
    throw new Error(insertError?.message || "Could not create recurring invoice.");
  }

  if (lines?.length) {
    const { error: lineInsertError } = await db.from("invoice_line_items").insert(
      lines.map((line) => ({
        organization_id: source.organization_id,
        invoice_id: invoice.id,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit || "qty",
        unit_price: line.unit_price,
        amount: line.amount,
        position: line.position,
      }))
    );
    if (lineInsertError) throw new Error(lineInsertError.message);
  }

  return {
    id: invoice.id,
    number: invoice.number,
    total: Number(invoice.total) || 0,
    currency: invoice.currency || "USD",
  };
}
