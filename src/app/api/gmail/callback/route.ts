import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/email/resend";
import { requestOrigin, saveGmailConnection } from "@/lib/email/gmail";

function callbackAppUrl(request: Request) {
  // Always return to the host that handled the callback (rebban.com or local).
  try {
    return requestOrigin(request);
  } catch {
    return getAppUrl();
  }
}

export async function GET(request: Request) {
  const appUrl = callbackAppUrl(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const returnToCookie = cookieStore.get("gmail_oauth_return")?.value;
  const returnTo =
    returnToCookie &&
    returnToCookie.startsWith("/") &&
    !returnToCookie.startsWith("//") &&
    !returnToCookie.includes("://")
      ? returnToCookie
      : "/settings?section=integrations&gmail=connected";
  const errorBase = returnTo.includes("/onboarding")
    ? "/onboarding?step=email&gmail=error"
    : "/settings?section=integrations&gmail=error";

  if (oauthError) {
    return NextResponse.redirect(
      `${appUrl}${errorBase}&reason=${encodeURIComponent(oauthError)}`
    );
  }

  const expectedState = cookieStore.get("gmail_oauth_state")?.value;
  const redirectUri =
    cookieStore.get("gmail_oauth_redirect")?.value ||
    `${appUrl}/api/gmail/callback`;
  cookieStore.delete("gmail_oauth_state");
  cookieStore.delete("gmail_oauth_redirect");
  cookieStore.delete("gmail_oauth_return");

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      `${appUrl}${errorBase}&reason=invalid_state`
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
    return NextResponse.redirect(`${appUrl}${returnTo}`);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "connection_failed";
    return NextResponse.redirect(
      `${appUrl}${errorBase}&reason=${encodeURIComponent(reason)}`
    );
  }
}
