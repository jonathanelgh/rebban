import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlatformPriceId, isStripeConfigured } from "@/lib/stripe/client";
import {
  getActiveOrganizationId,
  getOrganizationStripeState,
} from "@/lib/stripe/org";

export async function GET() {
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
  const status = org?.stripe_subscription_status || null;
  const active =
    status === "active" || status === "trialing" || status === "past_due";

  return NextResponse.json({
    configured: isStripeConfigured() && Boolean(getPlatformPriceId()),
    hasCustomer: Boolean(org?.stripe_customer_id),
    subscriptionId: org?.stripe_subscription_id ?? null,
    status,
    priceId: org?.stripe_price_id ?? null,
    active,
    planLabel: active ? "Pro" : "Free",
  });
}
