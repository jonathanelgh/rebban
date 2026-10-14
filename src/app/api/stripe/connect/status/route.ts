import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/client";
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
  const connected = Boolean(org?.stripe_account_id);
  const chargesEnabled = Boolean(org?.stripe_charges_enabled);
  const detailsSubmitted = Boolean(org?.stripe_details_submitted);

  return NextResponse.json({
    configured: isStripeConfigured(),
    connected,
    chargesEnabled,
    payoutsEnabled: Boolean(org?.stripe_payouts_enabled),
    detailsSubmitted,
    ready: connected && chargesEnabled && detailsSubmitted,
    accountId: org?.stripe_account_id ?? null,
  });
}
