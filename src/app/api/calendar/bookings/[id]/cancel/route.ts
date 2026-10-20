import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import {
  cancelOrgBooking,
  getOrgBooking,
} from "@/lib/booking/manage";

export async function POST(
  request: Request,
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

  let body: { notify_guest?: boolean } = {};
  try {
    body = (await request.json()) as { notify_guest?: boolean };
  } catch {
    // optional body
  }

  const booking = await getOrgBooking(organizationId, id);
  if (!booking) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (booking.status === "cancelled") {
    return NextResponse.json({ ok: true, booking });
  }

  try {
    await cancelOrgBooking({
      organizationId,
      userId: user.id,
      booking,
      notifyGuest: body.notify_guest !== false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not cancel meeting";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    booking: { ...booking, status: "cancelled" },
  });
}
