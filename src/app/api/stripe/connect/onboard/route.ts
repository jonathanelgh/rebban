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

function stripeErrorResponse(err: unknown) {
  if (err instanceof Stripe.errors.StripeError) {
    return NextResponse.json(
      {
        error: err.message,
        param: err.param || null,
        code: err.code || null,
      },
      { status: err.statusCode && err.statusCode >= 400 ? err.statusCode : 400 }
    );
  }
  const message = err instanceof Error ? err.message : "Stripe request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Stripe is not configured. Add STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.",
      },
      { status: 503 }
    );
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
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  try {
    const stripe = getStripe();
    let accountId = org.stripe_account_id;

    if (!accountId) {
      // SaaS path: Stripe-owned pricing + loss liability, full Dashboard access.
      // Express requires platform loss liability acceptance in Connect settings.
      const account = await stripe.accounts.create({
        controller: {
          stripe_dashboard: { type: "full" },
          fees: { payer: "account" },
          losses: { payments: "stripe" },
        },
        email: user.email || undefined,
        business_profile: {
          name: org.name,
          product_description: "Professional services invoiced through Rebban",
        },
        metadata: {
          organization_id: organizationId,
          rebban_user_id: user.id,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;

      const { error } = await supabase
        .from("organizations")
        .update({
          stripe_account_id: accountId,
          stripe_charges_enabled: Boolean(account.charges_enabled),
          stripe_payouts_enabled: Boolean(account.payouts_enabled),
          stripe_details_submitted: Boolean(account.details_submitted),
        })
        .eq("id", organizationId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const origin = appOriginFromRequest(request);
    if (!/^https?:\/\/.+/i.test(origin)) {
      return NextResponse.json(
        {
          error: `Invalid app origin for Stripe return URLs: "${origin}". Set NEXT_PUBLIC_APP_URL or use a normal browser origin.`,
        },
        { status: 500 }
      );
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/settings?section=integrations&stripe=refresh`,
      return_url: `${origin}/settings?section=integrations&stripe=return`,
      type: "account_onboarding",
    });

    if (!accountLink.url) {
      return NextResponse.json(
        { error: "Stripe did not return an onboarding URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: accountLink.url, accountId });
  } catch (err) {
    return stripeErrorResponse(err);
  }
}
