import { NextResponse } from "next/server";
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
  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing customer yet. Upgrade to a paid plan first." },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  const origin = appOriginFromRequest(request);
  const portal = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${origin}/settings?section=billing`,
  });

  return NextResponse.json({ url: portal.url });
}
