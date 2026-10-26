import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import {
  actionsForInvoiceStatus,
  type InvoiceChatComponent,
} from "@/lib/assistant/components";

export const runtime = "nodejs";

/**
 * Live invoice state for chat cards (refresh on open / after actions).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = await getActiveOrganizationId(supabase, user.id);
  if (!organizationId) {
    return NextResponse.json(
      { error: "No active workspace found for this user." },
      { status: 400 }
    );
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "id, number, status, currency, total, due_date, issue_date, client_id, deleted_at"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!invoice || invoice.deleted_at) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  let clientLabel = "Unknown";
  if (invoice.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("name, company, email")
      .eq("id", invoice.client_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    clientLabel = client?.company || client?.name || clientLabel;
  }

  const { data: lines } = await supabase
    .from("invoice_line_items")
    .select("description, quantity, unit_price, amount, position")
    .eq("invoice_id", invoice.id)
    .eq("organization_id", organizationId)
    .order("position", { ascending: true });

  const currency = invoice.currency || "EUR";
  const component: InvoiceChatComponent = {
    type: "invoice_card",
    entityId: invoice.id,
    actions: actionsForInvoiceStatus(invoice.status),
    snapshot: {
      client: clientLabel,
      number: invoice.number,
      amount: formatInvoiceMoney(Number(invoice.total) || 0, currency),
      amountRaw: Number(invoice.total) || 0,
      currency,
      dueDate: invoice.due_date,
      status: invoice.status,
      description: lines?.[0]?.description || null,
    },
  };

  return NextResponse.json({
    invoice: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      currency,
      total: Number(invoice.total) || 0,
      dueDate: invoice.due_date,
      issueDate: invoice.issue_date,
      client: clientLabel,
      lines: (lines || []).map((l) => ({
        description: l.description,
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unit_price) || 0,
        amount: Number(l.amount) || 0,
      })),
    },
    component,
  });
}
