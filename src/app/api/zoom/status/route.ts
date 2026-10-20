import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getZoomConnectionStatus,
  isZoomOAuthConfigured,
} from "@/lib/booking/zoom";

export async function GET() {
  const configured = isZoomOAuthConfigured();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      configured,
      connected: false,
      email: null,
    });
  }

  const status = await getZoomConnectionStatus(user.id);
  return NextResponse.json({
    configured,
    connected: Boolean(status),
    email: status?.email || null,
    connectedAt: status?.connectedAt || null,
  });
}
