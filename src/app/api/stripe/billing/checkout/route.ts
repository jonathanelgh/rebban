import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import {
  appOriginFromRequest,
  getPlatformPriceIdForInterval,
  getStripe,
  getStripePublishableKey,
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

  const publishableKey = getStripePublishableKey();
  if (!publishableKey) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set." },
      { status: 503 }
    );
  }

  let interval: "month" | "year" = "month";
  try {
    const body = (await request.json()) as { interval?: string };
    if (body?.interval === "year") interval = "year";
  } catch {
    // empty body is fine — default monthly
  }

  const priceId = getPlatformPriceIdForInterval(interval);
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          interval === "year"
            ? "Yearly plan is not configured. Add STRIPE_PRICE_ID_YEARLY or choose monthly."
            : "STRIPE_PRICE_ID is not set. Create a Product/Price in the Stripe Dashboard and add it to .env.local.",
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

  const stripe = getStripe();
  let customerId = org.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      name: org.name,
      metadata: {
        organization_id: organizationId,
        rebban_user_id: user.id,
      },
    });
    customerId = customer.id;
    await supabase
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", organizationId);
  }

  const origin = appOriginFromRequest(request);
  const returnUrl = `${origin}/settings?section=billing&billing=success`;

  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: "elements",
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: returnUrl,
      integration_identifier: `rebban_billing_${nanoid(8)}`,
      client_reference_id: organizationId,
      metadata: {
        organization_id: organizationId,
        billing_interval: interval,
      },
      subscription_data: {
        metadata: {
          organization_id: organizationId,
          billing_interval: interval,
        },
      },
      ...(process.env.STRIPE_TAX_ENABLED === "true"
        ? {
            automatic_tax: { enabled: true },
            customer_update: { address: "auto" as const },
          }
        : {}),
    });

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Checkout Session is missing a client secret." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      clientSecret: session.client_secret,
      publishableKey,
      sessionId: session.id,
      returnUrl,
      interval,
      customerEmail: user.email || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
