import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectZoom } from "@/lib/booking/zoom";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await disconnectZoom(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not disconnect";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
