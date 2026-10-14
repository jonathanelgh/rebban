import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Returns true when this call transitioned the invoice to paid. */
export async function markInvoicePaid(options: {
  invoiceId: string;
  sessionId?: string | null;
  paymentIntentId?: string | null;
  paymentStatus?: string | null;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_checkout_session_id: options.sessionId || undefined,
      stripe_payment_intent_id: options.paymentIntentId || undefined,
      stripe_payment_status: options.paymentStatus || "paid",
    })
    .eq("id", options.invoiceId)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`markInvoicePaid failed: ${error.message}`);
  }
  return Boolean(data);
}

/**
 * Mark invoice paid + send emails/alerts. Safe to call more than once —
 * emails/alerts only run on the first transition to paid.
 * Notify is dynamically imported so the Stripe webhook bundle does not load pdfkit.
 */
export async function fulfillInvoiceCheckoutPaid(
  session: Stripe.Checkout.Session
): Promise<{ newlyPaid: boolean; invoiceId: string | null }> {
  const invoiceId = session.metadata?.rebban_invoice_id || null;
  if (!invoiceId || session.payment_status !== "paid") {
    return { newlyPaid: false, invoiceId };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  const newlyPaid = await markInvoicePaid({
    invoiceId,
    sessionId: session.id,
    paymentIntentId,
    paymentStatus: session.payment_status,
  });
  if (!newlyPaid) return { newlyPaid: false, invoiceId };

  const payerEmail =
    session.customer_details?.email || session.customer_email || null;
  const payerName = session.customer_details?.name || null;

  try {
    const { notifyInvoicePaid } = await import("@/lib/invoices/paid-notify");
    await notifyInvoicePaid({
      invoiceId,
      payerEmail,
      payerName,
    });
  } catch (err) {
    console.error(
      "[invoice fulfill] paid notify failed",
      err instanceof Error ? err.message : err
    );
  }

  return { newlyPaid: true, invoiceId };
}
