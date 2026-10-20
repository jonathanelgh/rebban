import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getGoogleCalendarConnectionStatus,
  isGoogleCalendarOAuthConfigured,
} from "@/lib/booking/google-calendar";

export async function GET() {
  const configured = isGoogleCalendarOAuthConfigured();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      configured,
      connected: false,
      canSync: false,
      email: null,
    });
  }

  const status = await getGoogleCalendarConnectionStatus(user.id);
  return NextResponse.json({
    configured,
    connected: Boolean(status),
    canSync: Boolean(status?.canSync),
    email: status?.email || null,
    connectedAt: status?.connectedAt || null,
  });
}
