import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  requireBillingCustomer,
  subscriptionPeriodEndIso,
} from "@/lib/stripe/billing-customer";

/**
 * Cancel at period end by default so access continues until paid-through date.
 * Pass { immediate: true } only for hard cancel (rare).
 */
export async function POST(request: Request) {
  const gate = await requireBillingCustomer();
  if (!gate.ok) return gate.response;

  if (!gate.org.stripe_subscription_id) {
    return NextResponse.json(
      { error: "No active subscription to cancel." },
      { status: 400 }
    );
  }

  let immediate = false;
  try {
    const body = (await request.json()) as { immediate?: boolean };
    immediate = Boolean(body?.immediate);
  } catch {
    // empty body = cancel at period end
  }

  try {
    const sub = immediate
      ? await gate.stripe.subscriptions.cancel(gate.org.stripe_subscription_id)
      : await gate.stripe.subscriptions.update(gate.org.stripe_subscription_id, {
          cancel_at_period_end: true,
        });

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
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      currentPeriodEnd: subscriptionPeriodEndIso(sub),
    });
  } catch (error) {
    console.error("[billing/cancel]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not cancel subscription.",
      },
      { status: 500 }
    );
  }
}
