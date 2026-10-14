import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInvoiceMoney, lineAmount } from "@/lib/invoices/totals";

type RouteContext = { params: Promise<{ token: string }> };

function publicAssetUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/org-assets/${pathOrUrl}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const admin = createAdminClient();

  const { data: invoice, error } = await admin
    .from("invoices")
    .select(
      `id, number, status, currency, subtotal, tax_total, total, due_date, issue_date, notes,
       client_id, organization_id, deleted_at, paid_at,
       show_logo, banner_url, late_fee_enabled, late_fee_percent,
       tax_enabled, tax_rate, prices_include_tax, show_tax_id, tax_id,
       show_shipping_address, shipping_address, show_reference, reference_number`
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
      .select(
        "name, logo_url, legal_name, address, tax_id, stripe_charges_enabled"
      )
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

  const mappedLines = (lines || []).map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    amount:
      line.amount ??
      lineAmount(line.quantity, line.unit_price),
  }));

  return NextResponse.json({
    invoice: {
      number: invoice.number,
      status: invoice.status,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      taxTotal: invoice.tax_total,
      total: invoice.total,
      totalFormatted: formatInvoiceMoney(invoice.total, invoice.currency),
      dueDate: invoice.due_date,
      issueDate: invoice.issue_date,
      notes: invoice.notes,
      paidAt: invoice.paid_at,
      payable:
        ["sent", "viewed", "overdue"].includes(invoice.status) &&
        Boolean(org?.stripe_charges_enabled),
      showLogo: invoice.show_logo,
      bannerUrl: publicAssetUrl(invoice.banner_url),
      lateFeeEnabled: invoice.late_fee_enabled,
      lateFeePercent: Number(invoice.late_fee_percent || 0),
      taxEnabled: invoice.tax_enabled,
      taxRate: Number(invoice.tax_rate || 0),
      pricesIncludeTax: Boolean(invoice.prices_include_tax),
      showTaxId: invoice.show_tax_id,
      taxId: invoice.tax_id || org?.tax_id || null,
      showShippingAddress: invoice.show_shipping_address,
      shippingAddress: invoice.shipping_address,
      showReference: invoice.show_reference,
      referenceNumber: invoice.reference_number,
    },
    business: {
      name: org?.legal_name || org?.name || "Business",
      logoUrl: publicAssetUrl(org?.logo_url),
      address: org?.address || null,
    },
    client: {
      name: client?.name || null,
      company: client?.company || null,
      email: client?.email || null,
    },
    lines: mappedLines,
  });
}
