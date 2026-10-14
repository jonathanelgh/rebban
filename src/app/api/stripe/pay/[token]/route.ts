import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInvoiceMoney } from "@/lib/invoices/totals";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const admin = createAdminClient();

  const { data: invoice, error } = await admin
    .from("invoices")
    .select(
      "id, number, status, currency, total, due_date, issue_date, notes, client_id, organization_id, deleted_at, paid_at"
    )
    .eq("payment_token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!invoice || invoice.deleted_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: org }, { data: client }, { data: lines }] = await Promise.all([
    admin
      .from("organizations")
      .select("name, logo_url, legal_name, stripe_charges_enabled")
      .eq("id", invoice.organization_id)
      .maybeSingle(),
    admin
      .from("clients")
      .select("name, company, email")
      .eq("id", invoice.client_id)
      .maybeSingle(),
    admin
      .from("invoice_line_items")
      .select("description, quantity, unit_price, amount, position")
      .eq("invoice_id", invoice.id)
      .order("position", { ascending: true }),
  ]);

  return NextResponse.json({
    invoice: {
      number: invoice.number,
      status: invoice.status,
      currency: invoice.currency,
      total: invoice.total,
      totalFormatted: formatInvoiceMoney(invoice.total, invoice.currency),
      dueDate: invoice.due_date,
      issueDate: invoice.issue_date,
      notes: invoice.notes,
      paidAt: invoice.paid_at,
      payable:
        ["sent", "viewed", "overdue"].includes(invoice.status) &&
        Boolean(org?.stripe_charges_enabled),
    },
    business: {
      name: org?.legal_name || org?.name || "Business",
      logoUrl: org?.logo_url || null,
    },
    client: {
      name: client?.company || client?.name || null,
      email: client?.email || null,
    },
    lines: (lines || []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      amount: line.amount,
    })),
  });
}
