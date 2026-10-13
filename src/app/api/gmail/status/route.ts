import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getGmailConnectionStatus,
  getGmailRedirectUri,
  isGmailOAuthConfigured,
  requestOrigin,
} from "@/lib/email/gmail";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = requestOrigin(request);
  const connection = await getGmailConnectionStatus(user.id);
  return NextResponse.json({
    configured: isGmailOAuthConfigured(),
    connected: Boolean(connection),
    email: connection?.email || null,
    connectedAt: connection?.connectedAt || null,
    canSend: connection?.canSend ?? false,
    needsReconnect: Boolean(connection && !connection.canSend),
    redirectUri: getGmailRedirectUri(origin),
  });
}
