import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOutlookConnectionStatus,
  getOutlookRedirectUri,
  isOutlookOAuthConfigured,
  requestOrigin,
} from "@/lib/email/outlook";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = requestOrigin(request);
  const connection = await getOutlookConnectionStatus(user.id);
  return NextResponse.json({
    configured: isOutlookOAuthConfigured(),
    connected: Boolean(connection),
    email: connection?.email || null,
    connectedAt: connection?.connectedAt || null,
    canSend: connection?.canSend ?? false,
    needsReconnect: Boolean(connection && !connection.canSend),
    redirectUri: getOutlookRedirectUri(origin),
  });
}
