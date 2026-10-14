import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  appOriginFromRequest,
  getPlatformPriceId,
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

  const priceId = getPlatformPriceId();
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          "STRIPE_PRICE_ID is not set. Create a Product/Price in the Stripe Dashboard and add it to .env.local.",
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
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/settings?section=billing&billing=success`,
    cancel_url: `${origin}/settings?section=billing&billing=cancelled`,
    client_reference_id: organizationId,
    metadata: {
      organization_id: organizationId,
    },
    subscription_data: {
      metadata: {
        organization_id: organizationId,
      },
    },
    ...(process.env.STRIPE_TAX_ENABLED === "true"
      ? {
          automatic_tax: { enabled: true },
          customer_update: { address: "auto" as const },
        }
      : {}),
  });

  return NextResponse.json({ url: session.url });
}
