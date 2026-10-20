import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { sendBookingLinkInviteEmail } from "@/lib/booking/emails";

function appBaseUrl(request: Request) {
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;
  if (env && !env.includes("localhost")) return env.replace(/\/$/, "");
  return new URL(request.url).origin.replace(/\/$/, "");
}

export async function POST(request: Request) {
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

  let body: {
    booking_link_id?: string;
    guest_name?: string;
    guest_email?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const guestName = (body.guest_name || "").trim();
  const guestEmail = (body.guest_email || "").trim().toLowerCase();
  if (!guestName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 }
    );
  }
  if (!body.booking_link_id) {
    return NextResponse.json(
      { error: "Choose a booking link" },
      { status: 400 }
    );
  }

  const { data: link, error: linkError } = await supabase
    .from("booking_links")
    .select(
      "id, title, duration_minutes, public_token, location_type, online_provider, location_details, is_active"
    )
    .eq("id", body.booking_link_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (linkError || !link) {
    return NextResponse.json(
      { error: "Booking link not found" },
      { status: 404 }
    );
  }
  if (!link.is_active) {
    return NextResponse.json(
      { error: "That booking link is paused. Activate it first." },
      { status: 400 }
    );
  }

  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  const bookingUrl = `${appBaseUrl(request)}/b/${link.public_token}`;

  try {
    await sendBookingLinkInviteEmail({
      to: guestEmail,
      guestName,
      hostName: profile?.full_name || null,
      organizationName: org?.name || null,
      title: link.title,
      durationMinutes: link.duration_minutes,
      bookingUrl,
      locationType: link.location_type,
      onlineProvider: link.online_provider,
      locationDetails: link.location_details,
      fromUserId: user.id,
    });
  } catch (error) {
    console.error("[calendar] send booking link failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not send the booking link email",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, booking_url: bookingUrl });
}
