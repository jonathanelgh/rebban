import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import {
  appOriginFromRequest,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe/client";
import {
  getActiveOrganizationId,
  getOrganizationStripeState,
} from "@/lib/stripe/org";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = await getActiveOrganizationId(supabase, user.id);
  if (!organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const org = await getOrganizationStripeState(supabase, organizationId);
  if (!org?.stripe_account_id) {
    return NextResponse.json(
      { error: "Connect Stripe first to open the Dashboard." },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(org.stripe_account_id);

    // Express accounts support login links; full/Standard use Account Links or Dashboard.
    const isExpress =
      account.type === "express" ||
      account.controller?.stripe_dashboard?.type === "express";

    if (isExpress) {
      const loginLink = await stripe.accounts.createLoginLink(org.stripe_account_id);
      return NextResponse.json({ url: loginLink.url });
    }

    const origin = appOriginFromRequest(request);
    const accountLink = await stripe.accountLinks.create({
      account: org.stripe_account_id,
      refresh_url: `${origin}/settings?section=integrations&stripe=refresh`,
      return_url: `${origin}/settings?section=integrations&stripe=return`,
      type: "account_onboarding",
    });
    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Could not open Stripe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
