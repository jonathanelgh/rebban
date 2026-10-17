import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { computeEntitlement } from "@/lib/billing/plan";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: "grant_pro" | "revoke_pro" | "cancel_subscription";
    };
    const action = body.action;
    if (
      action !== "grant_pro" &&
      action !== "revoke_pro" &&
      action !== "cancel_subscription"
    ) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { data: org, error: orgError } = await gate.db
      .from("organizations")
      .select(
        "id, stripe_subscription_id, stripe_subscription_status, trial_ends_at, complimentary_pro"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (orgError || !org) {
      return NextResponse.json(
        { error: orgError?.message || "Not found" },
        { status: orgError ? 500 : 404 }
      );
    }

    const now = new Date().toISOString();

    if (action === "grant_pro") {
      const { error } = await gate.db
        .from("organizations")
        .update({ complimentary_pro: true, updated_at: now })
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (action === "revoke_pro") {
      const { error } = await gate.db
        .from("organizations")
        .update({ complimentary_pro: false, updated_at: now })
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (action === "cancel_subscription") {
      if (!org.stripe_subscription_id) {
        return NextResponse.json(
          { error: "No Stripe subscription on this workspace." },
          { status: 400 }
        );
      }
      if (!isStripeConfigured()) {
        return NextResponse.json(
          { error: "Stripe is not configured." },
          { status: 503 }
        );
      }
      const stripe = getStripe();
      await stripe.subscriptions.cancel(org.stripe_subscription_id);
      const { error } = await gate.db
        .from("organizations")
        .update({
          stripe_subscription_status: "canceled",
          updated_at: now,
        })
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const { data: refreshed } = await gate.db
      .from("organizations")
      .select(
        "stripe_subscription_status, trial_ends_at, complimentary_pro, stripe_subscription_id, stripe_customer_id"
      )
      .eq("id", id)
      .maybeSingle();

    const entitlement = computeEntitlement({
      subscriptionStatus: refreshed?.stripe_subscription_status,
      trialEndsAt: refreshed?.trial_ends_at,
      complimentaryPro: refreshed?.complimentary_pro,
    });

    return NextResponse.json({
      ok: true,
      complimentaryPro: entitlement.complimentaryPro,
      planLabel: entitlement.planLabel,
      paid: entitlement.paid,
      subscriptionStatus: refreshed?.stripe_subscription_status ?? null,
      stripeSubscriptionId: refreshed?.stripe_subscription_id ?? null,
      stripeCustomerId: refreshed?.stripe_customer_id ?? null,
    });
  } catch (error) {
    console.error("admin org billing action failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Billing action failed",
      },
      { status: 500 }
    );
  }
}
