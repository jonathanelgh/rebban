import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fulfillInvoiceCheckoutPaid } from "@/lib/invoices/fulfill-paid";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";

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
    id: string;
    status: string;
    organization_id: string;
  };
  organization: {
    stripe_account_id: string | null;
  } | null;
};

/**
 * Public confirm fallback: after Checkout returns, verify the session on the
 * connected account and fulfill. Used when Connect webhooks aren't reaching
 * the app yet (local dev / missing Connect endpoint).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Payments unavailable" }, { status: 503 });
    }

    const { token } = await context.params;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
    };
    const sessionId = body.sessionId?.trim();
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("get_public_invoice", {
      p_token: token.trim(),
    });

    if (error || !data) {
      const message = error?.message || "Invoice not found";
      const status = /not found/i.test(message) ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const payload = data as unknown as PublicInvoicePayload;
    const stripeAccountId = payload.organization?.stripe_account_id;
    if (!stripeAccountId) {
      return NextResponse.json(
        { error: "Connected account missing" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      {},
      { stripeAccount: stripeAccountId }
    );

    if (session.metadata?.rebban_payment_token !== token.trim()) {
      return NextResponse.json({ error: "Session mismatch" }, { status: 400 });
    }
    if (session.metadata?.rebban_invoice_id !== payload.invoice.id) {
      return NextResponse.json({ error: "Invoice mismatch" }, { status: 400 });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({
        ok: true,
        paid: false,
        paymentStatus: session.payment_status,
      });
    }

    const result = await fulfillInvoiceCheckoutPaid(session);
    return NextResponse.json({
      ok: true,
      paid: true,
      newlyPaid: result.newlyPaid,
      invoiceId: result.invoiceId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not confirm payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
