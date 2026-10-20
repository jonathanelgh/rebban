import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import {
  getOrgBooking,
  resendOrgBookingInvite,
} from "@/lib/booking/manage";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireOrgEntitlement(supabase, user.id);
  if ("response" in gate) return gate.response;
  const { organizationId } = gate;

  const booking = await getOrgBooking(organizationId, id);
  if (!booking) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  try {
    await resendOrgBookingInvite({
      organizationId,
      userId: user.id,
      booking,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not send invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
