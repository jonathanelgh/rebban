import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import {
  loadEntityCard,
  type CardKind,
} from "@/lib/assistant/card-loaders";
import {
  actionsForInvoiceStatus,
  type InvoiceChatComponent,
} from "@/lib/assistant/components";
import { formatInvoiceMoney } from "@/lib/invoices/totals";

export const runtime = "nodejs";

const KINDS = new Set<CardKind>([
  "proposal",
  "client",
  "lead",
  "project",
  "task",
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind: kindRaw, id } = await context.params;
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

  if (kindRaw === "invoice") {
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(
        "id, number, status, currency, total, due_date, client_id, deleted_at"
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
        .select("name, company")
        .eq("id", invoice.client_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      clientLabel = client?.company || client?.name || clientLabel;
    }
    const { data: lines } = await supabase
      .from("invoice_line_items")
      .select("description")
      .eq("invoice_id", invoice.id)
      .eq("organization_id", organizationId)
      .order("position", { ascending: true })
      .limit(1);
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
    return NextResponse.json({ component });
  }

  if (!KINDS.has(kindRaw as CardKind)) {
    return NextResponse.json({ error: "Unknown card kind." }, { status: 400 });
  }

  const component = await loadEntityCard(
    supabase,
    organizationId,
    kindRaw as CardKind,
    id
  );
  if (!component) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ component });
}
