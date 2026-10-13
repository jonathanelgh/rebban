import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/email/resend";
import { saveGmailConnection } from "@/lib/email/gmail";

function callbackAppUrl(request: Request) {
  // Prefer the host that handled the OAuth callback so a wrong APP_URL port
  // doesn't bounce the user to a different local server after connect.
  try {
    const origin = new URL(request.url).origin;
    if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
      return origin.replace(/\/$/, "");
    }
  } catch {
    /* fall through */
  }
  return getAppUrl();
}

export async function GET(request: Request) {
  const appUrl = callbackAppUrl(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${appUrl}/settings?section=integrations&gmail=error&reason=${encodeURIComponent(oauthError)}`
    );
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gmail_oauth_state")?.value;
  const redirectUri =
    cookieStore.get("gmail_oauth_redirect")?.value ||
    `${appUrl}/api/gmail/callback`;
  cookieStore.delete("gmail_oauth_state");
  cookieStore.delete("gmail_oauth_redirect");

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      `${appUrl}/settings?section=integrations&gmail=error&reason=invalid_state`
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_organization_id")
    .eq("id", user.id)
    .maybeSingle();

  try {
    await saveGmailConnection({
      userId: user.id,
      organizationId: profile?.active_organization_id,
      code,
      redirectUri,
    });
    return NextResponse.redirect(
      `${appUrl}/settings?section=integrations&gmail=connected`
    );
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "connection_failed";
    return NextResponse.redirect(
      `${appUrl}/settings?section=integrations&gmail=error&reason=${encodeURIComponent(reason)}`
    );
  }
}
