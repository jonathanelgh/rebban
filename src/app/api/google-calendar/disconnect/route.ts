import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectGoogleCalendar } from "@/lib/booking/google-calendar";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await disconnectGoogleCalendar(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not disconnect";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
