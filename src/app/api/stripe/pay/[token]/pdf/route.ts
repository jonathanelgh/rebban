import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { buildInvoicePdf } from "@/lib/invoices/pdf";
import { lineAmount } from "@/lib/invoices/totals";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public env vars are not configured.");
  }
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type PublicInvoicePayload = {
  invoice: {
    number: string | null;
    status: string;
    currency: string;
    subtotal: number;
    tax_total: number;
    total: number;
    due_date: string | null;
    issue_date: string | null;
    notes: string | null;
    tax_enabled: boolean | null;
    tax_rate: number | null;
    prices_include_tax: boolean | null;
    show_tax_id: boolean | null;
    tax_id: string | null;
  };
  organization: {
    name: string | null;
    legal_name: string | null;
    address: string | null;
    tax_id: string | null;
  } | null;
  client: {
    name: string | null;
    company: string | null;
    email: string | null;
  } | null;
  lines: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    amount: number | null;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("get_public_invoice", {
      p_token: token.trim(),
    });

    if (error || !data) {
      const message = error?.message || "Not found";
      const status = /not found/i.test(message) ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const payload = data as unknown as PublicInvoicePayload;
    const invoice = payload.invoice;
    const org = payload.organization;
    const client = payload.client;
    const fromName = org?.legal_name || org?.name || "Business";

    const pdf = await buildInvoicePdf({
      number: invoice.number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      currency: invoice.currency || "USD",
      notes: invoice.notes,
      fromName,
      fromAddress: org?.address || null,
      fromEmail: null,
      taxId: invoice.tax_id || org?.tax_id || null,
      showTaxId: Boolean(invoice.show_tax_id),
      billToName: client?.name || null,
      billToCompany: client?.company || null,
      billToEmail: client?.email || null,
      lines: (payload.lines || []).map((line) => ({
        description: line.description || "Item",
        quantity: line.quantity,
        unitPrice: line.unit_price,
        amount:
          Number(line.amount) || lineAmount(line.quantity, line.unit_price),
      })),
      subtotal: Number(invoice.subtotal) || 0,
      taxEnabled: Boolean(invoice.tax_enabled),
      taxRate: Number(invoice.tax_rate) || 0,
      taxTotal: Number(invoice.tax_total) || 0,
      total: Number(invoice.total) || 0,
      pricesIncludeTax: Boolean(invoice.prices_include_tax),
    });

    const filename = `${(invoice.number || "invoice").replace(/[^\w.-]+/g, "_")}.pdf`;

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
