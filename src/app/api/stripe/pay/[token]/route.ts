import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatInvoiceMoney, lineAmount } from "@/lib/invoices/totals";
import {
  formatIbanDisplay,
  hasBankPaymentDetails,
  normalizeBankgiro,
  normalizePaymentPhone,
} from "@/lib/invoices/payment-details";

type RouteContext = { params: Promise<{ token: string }> };

function publicAssetUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/org-assets/${pathOrUrl}`;
}

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
    id: string;
    number: string | null;
    status: string;
    currency: string;
    subtotal: number;
    tax_total: number;
    total: number;
    due_date: string | null;
    issue_date: string | null;
    notes: string | null;
    paid_at: string | null;
    show_logo: boolean | null;
    banner_url: string | null;
    late_fee_enabled: boolean | null;
    late_fee_percent: number | null;
    tax_enabled: boolean | null;
    tax_rate: number | null;
    prices_include_tax: boolean | null;
    show_tax_id: boolean | null;
    tax_id: string | null;
    show_shipping_address: boolean | null;
    shipping_address: string | null;
    show_reference: boolean | null;
    reference_number: string | null;
  };
  organization: {
    name: string | null;
    legal_name: string | null;
    logo_url: string | null;
    address: string | null;
    tax_id: string | null;
    stripe_charges_enabled: boolean | null;
    payment_iban: string | null;
    payment_bankgiro: string | null;
    payment_swish: string | null;
    payment_mbway: string | null;
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
    position: number;
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

    const mappedLines = (payload.lines || []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      amount: line.amount ?? lineAmount(line.quantity, line.unit_price),
    }));

    const openStatus = ["sent", "viewed", "overdue"].includes(invoice.status);
    const stripePayable =
      openStatus && Boolean(org?.stripe_charges_enabled);
    const bankIban = formatIbanDisplay(org?.payment_iban);
    const bankBankgiro = normalizeBankgiro(org?.payment_bankgiro);
    const bankSwish = normalizePaymentPhone(org?.payment_swish);
    const bankMbway = normalizePaymentPhone(org?.payment_mbway);
    const bankTransferAvailable =
      openStatus &&
      hasBankPaymentDetails({
        iban: org?.payment_iban,
        bankgiro: org?.payment_bankgiro,
        swish: org?.payment_swish,
        mbway: org?.payment_mbway,
      });

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
        payable: stripePayable || bankTransferAvailable,
        stripePayable,
        bankTransferAvailable,
        showLogo: invoice.show_logo ?? true,
        bannerUrl: publicAssetUrl(invoice.banner_url),
        lateFeeEnabled: Boolean(invoice.late_fee_enabled),
        lateFeePercent: Number(invoice.late_fee_percent || 0),
        taxEnabled: Boolean(invoice.tax_enabled),
        taxRate: Number(invoice.tax_rate || 0),
        pricesIncludeTax: Boolean(invoice.prices_include_tax),
        showTaxId: Boolean(invoice.show_tax_id),
        taxId: invoice.tax_id || org?.tax_id || null,
        showShippingAddress: Boolean(invoice.show_shipping_address),
        shippingAddress: invoice.shipping_address,
        showReference: Boolean(invoice.show_reference),
        referenceNumber: invoice.reference_number,
      },
      business: {
        name: org?.legal_name || org?.name || "Business",
        logoUrl: publicAssetUrl(org?.logo_url),
        address: org?.address || null,
        paymentIban: bankIban,
        paymentBankgiro: bankBankgiro,
        paymentSwish: bankSwish,
        paymentMbway: bankMbway,
      },
      client: {
        name: client?.name || null,
        company: client?.company || null,
        email: client?.email || null,
      },
      lines: mappedLines,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
