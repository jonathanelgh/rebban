import { NextResponse } from "next/server";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import { requireBillingCustomer } from "@/lib/stripe/billing-customer";

export async function GET() {
  const gate = await requireBillingCustomer();
  if (!gate.ok) return gate.response;

  try {
    const invoices = await gate.stripe.invoices.list({
      customer: gate.customerId,
      limit: 24,
    });

    return NextResponse.json({
      invoices: invoices.data.map((inv) => {
        const amount = (inv.amount_paid || inv.total || 0) / 100;
        const currency = (inv.currency || "usd").toUpperCase();
        return {
          id: inv.id,
          number: inv.number,
          status: inv.status || "unknown",
          amountLabel: formatInvoiceMoney(amount, currency),
          currency,
          createdAt: new Date(inv.created * 1000).toISOString(),
          periodStart: inv.period_start
            ? new Date(inv.period_start * 1000).toISOString()
            : null,
          periodEnd: inv.period_end
            ? new Date(inv.period_end * 1000).toISOString()
            : null,
          hostedInvoiceUrl: inv.hosted_invoice_url || null,
          invoicePdf: inv.invoice_pdf || null,
        };
      }),
    });
  } catch (error) {
    console.error("[billing/invoices]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load billing invoices.",
      },
      { status: 500 }
    );
  }
}
