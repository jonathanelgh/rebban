import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import { sendInvoiceForOrganization } from "@/lib/invoices/send-invoice";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import {
  actionsForInvoiceStatus,
  type InvoiceChatComponent,
} from "@/lib/assistant/components";
import { pendingActionToJson } from "@/lib/assistant/tools";

export const runtime = "nodejs";

type ActionBody = {
  action?: "approve_and_send" | "cancel_draft";
  invoiceId?: string;
  conversationId?: string | null;
};

/**
 * Explicit chat actions for invoice cards (Approve & Send, Cancel Draft).
 * Always re-checks org ownership and current invoice status.
 */
export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as ActionBody | null;
  const action = body?.action;
  const invoiceId = body?.invoiceId?.trim();
  if (!action || !invoiceId) {
    return NextResponse.json(
      { error: "action and invoiceId are required." },
      { status: 400 }
    );
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "id, number, status, currency, total, due_date, client_id, deleted_at"
    )
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!invoice || invoice.deleted_at) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  async function clearPendingIfMatches() {
    const conversationId = body?.conversationId?.trim();
    if (!conversationId) return;
    const { data: conversation } = await supabase
      .from("assistant_conversations")
      .select("id, pending_action, user_id, channel")
      .eq("id", conversationId)
      .eq("user_id", user!.id)
      .eq("channel", "in_app")
      .maybeSingle();
    if (!conversation) return;
    const pending = conversation.pending_action as {
      type?: string;
      invoice_id?: string;
    } | null;
    if (
      pending?.type === "send_invoice" &&
      pending.invoice_id === invoiceId
    ) {
      await supabase
        .from("assistant_conversations")
        .update({ pending_action: pendingActionToJson(null) })
        .eq("id", conversation.id);
    }
  }

  if (action === "cancel_draft") {
    if (invoice.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft invoices can be cancelled." },
        { status: 400 }
      );
    }
    const { error: delError } = await supabase
      .from("invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", invoice.id)
      .eq("organization_id", organizationId)
      .eq("status", "draft");
    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }
    await clearPendingIfMatches();
    return NextResponse.json({
      ok: true,
      cancelled: true,
      invoiceId: invoice.id,
      component: null,
    });
  }

  if (action === "approve_and_send") {
    if (invoice.status === "paid" || invoice.status === "void") {
      return NextResponse.json(
        { error: `Cannot send an invoice with status ${invoice.status}.` },
        { status: 400 }
      );
    }

    const result = await sendInvoiceForOrganization({
      db: supabase,
      invoiceId: invoice.id,
      organizationId,
      userId: user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await clearPendingIfMatches();

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

    const currency = invoice.currency || "EUR";
    const component: InvoiceChatComponent = {
      type: "invoice_card",
      entityId: invoice.id,
      actions: actionsForInvoiceStatus(result.status),
      snapshot: {
        client: clientLabel,
        number: result.number,
        amount: formatInvoiceMoney(Number(invoice.total) || 0, currency),
        amountRaw: Number(invoice.total) || 0,
        currency,
        dueDate: invoice.due_date,
        status: result.status,
      },
    };

    return NextResponse.json({
      ok: true,
      sent: true,
      number: result.number,
      recipientEmail: result.recipientEmail,
      url: result.url,
      status: result.status,
      component,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
