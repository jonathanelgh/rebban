import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import {
  getActiveOrganizationId,
  getOrganizationStripeState,
  type OrgStripeRow,
} from "@/lib/stripe/org";

/** Billing period end — on subscription items in current Stripe API. */
export function subscriptionPeriodEndIso(sub: Stripe.Subscription) {
  const fromItem = sub.items?.data?.[0]?.current_period_end;
  const unix = fromItem || sub.cancel_at || null;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

export async function requireBillingCustomer(): Promise<
  | {
      ok: true;
      organizationId: string;
      org: OrgStripeRow;
      customerId: string;
      stripe: ReturnType<typeof getStripe>;
    }
  | { ok: false; response: NextResponse }
> {
  if (!isStripeConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Stripe not configured" },
        { status: 503 }
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const organizationId = await getActiveOrganizationId(supabase, user.id);
  if (!organizationId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No organization" }, { status: 400 }),
    };
  }

  const org = await getOrganizationStripeState(supabase, organizationId);
  if (!org?.stripe_customer_id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No billing customer yet. Upgrade to a paid plan first." },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true,
    organizationId,
    org,
    customerId: org.stripe_customer_id,
    stripe: getStripe(),
  };
}
