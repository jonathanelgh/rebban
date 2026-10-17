import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { lineAmount } from "@/lib/invoices/totals";

type Db = SupabaseClient<Database>;

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function createProjectInvoice(
  db: Db,
  input: {
    organizationId: string;
    clientId: string;
    projectId: string;
    proposalId?: string | null;
    userId: string;
    currency: string;
    description: string;
    amount: number;
    notes?: string | null;
  }
) {
  const amount = Math.round(Math.max(0, Number(input.amount) || 0) * 100) / 100;
  if (amount <= 0) {
    throw new Error("Invoice amount must be greater than zero.");
  }

  const issueDate = todayISODate();
  const quantity = 1;
  const unitPrice = amount;
  const lineTotal = lineAmount(quantity, unitPrice);

  const { data: invoice, error } = await db
    .from("invoices")
    .insert({
      organization_id: input.organizationId,
      client_id: input.clientId,
      project_id: input.projectId,
      proposal_id: input.proposalId || null,
      number: null,
      status: "draft",
      currency: input.currency || "USD",
      issue_date: issueDate,
      due_date: addDaysISO(issueDate, 14),
      subtotal: lineTotal,
      tax_total: 0,
      total: lineTotal,
      notes: input.notes || null,
      created_by: input.userId,
      payment_token: nanoid(24),
      show_logo: true,
    })
    .select("id, number")
    .single();

  if (error || !invoice) {
    throw new Error(error?.message || "Could not create invoice.");
  }

  const { error: lineError } = await db.from("invoice_line_items").insert({
    organization_id: input.organizationId,
    invoice_id: invoice.id,
    description: input.description,
    quantity,
    unit_price: unitPrice,
    amount: lineTotal,
    position: 0,
  });

  if (lineError) {
    throw new Error(lineError.message);
  }

  return invoice;
}
