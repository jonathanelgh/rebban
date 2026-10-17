import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  requireBillingCustomer,
  subscriptionPeriodEndIso,
} from "@/lib/stripe/billing-customer";

/** Undo a scheduled cancel (cancel_at_period_end). */
export async function POST() {
  const gate = await requireBillingCustomer();
  if (!gate.ok) return gate.response;

  if (!gate.org.stripe_subscription_id) {
    return NextResponse.json(
      { error: "No subscription to reactivate." },
      { status: 400 }
    );
  }

  try {
    const sub = await gate.stripe.subscriptions.update(
      gate.org.stripe_subscription_id,
      { cancel_at_period_end: false }
    );

    const supabase = await createClient();
    await supabase
      .from("organizations")
      .update({
        stripe_subscription_status: sub.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", gate.organizationId);

    return NextResponse.json({
      ok: true,
      status: sub.status,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: subscriptionPeriodEndIso(sub),
    });
  } catch (error) {
    console.error("[billing/reactivate]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not reactivate subscription.",
      },
      { status: 500 }
    );
  }
}
