import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { buildInvoicePdf } from "@/lib/invoices/pdf";
import { lineAmount } from "@/lib/invoices/totals";
import type { InvoiceLineUnit } from "@/lib/invoices/units";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: invoiceId } = await context.params;
    if (!invoiceId) {
      return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        `id, number, status, currency, issue_date, due_date, notes,
         subtotal, tax_enabled, tax_rate, tax_total, total, prices_include_tax,
         tax_id, show_tax_id, client_id, organization_id`
      )
      .eq("id", invoiceId)
      .is("deleted_at", null)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: invoiceError?.message || "Invoice not found." },
        { status: 404 }
      );
    }

    if (invoice.organization_id !== entitlement.organizationId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const [linesRes, clientRes, orgRes, profileRes] = await Promise.all([
      supabase
        .from("invoice_line_items")
        .select("description, quantity, unit, unit_price, amount, position")
        .eq("invoice_id", invoiceId)
        .order("position", { ascending: true }),
      invoice.client_id
        ? supabase
            .from("clients")
            .select("name, company, email")
            .eq("id", invoice.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("organizations")
        .select("name, legal_name, address, tax_id")
        .eq("id", invoice.organization_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (linesRes.error) {
      return NextResponse.json({ error: linesRes.error.message }, { status: 500 });
    }

    const org = orgRes.data;
    const client = clientRes.data;
    const profile = profileRes.data;
    const fromName =
      org?.legal_name || org?.name || profile?.full_name || "Your business";

    const pdfLines = (linesRes.data || []).map((line) => ({
      description: line.description || "Item",
      quantity: line.quantity,
      unit: (line.unit as InvoiceLineUnit | null) || null,
      unitPrice: line.unit_price,
      amount:
        Number(line.amount) || lineAmount(line.quantity, line.unit_price),
    }));

    const isDraft = invoice.status === "draft";
    const pdf = await buildInvoicePdf({
      number: invoice.number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      currency: invoice.currency || "USD",
      notes: invoice.notes,
      fromName,
      fromAddress: org?.address || null,
      fromEmail: profile?.email || null,
      taxId: invoice.tax_id || org?.tax_id || null,
      showTaxId: Boolean(invoice.show_tax_id),
      billToName: client?.name || null,
      billToCompany: client?.company || null,
      billToEmail: client?.email || null,
      lines: pdfLines,
      subtotal: Number(invoice.subtotal) || 0,
      taxEnabled: Boolean(invoice.tax_enabled),
      taxRate: Number(invoice.tax_rate) || 0,
      taxTotal: Number(invoice.tax_total) || 0,
      total: Number(invoice.total) || 0,
      pricesIncludeTax: Boolean(invoice.prices_include_tax),
      watermark: isDraft ? "PREVIEW" : null,
    });

    const baseName = isDraft
      ? "Invoice_preview"
      : (invoice.number || "invoice").replace(/[^\w.-]+/g, "_");
    const filename = `${baseName}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not generate invoice PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
