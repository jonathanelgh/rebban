import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/email/resend";
import { requestOrigin, saveOutlookConnection } from "@/lib/email/outlook";

function callbackAppUrl(request: Request) {
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
  const oauthErrorDescription = url.searchParams.get("error_description");

  const cookieStore = await cookies();
  const returnToCookie = cookieStore.get("outlook_oauth_return")?.value;
  const returnTo =
    returnToCookie &&
    returnToCookie.startsWith("/") &&
    !returnToCookie.startsWith("//") &&
    !returnToCookie.includes("://")
      ? returnToCookie
      : "/settings?section=integrations&outlook=connected";
  const errorBase = returnTo.includes("/onboarding")
    ? "/onboarding?step=email&outlook=error"
    : "/settings?section=integrations&outlook=error";

  if (oauthError) {
    const reason = oauthErrorDescription || oauthError;
    return NextResponse.redirect(
      `${appUrl}${errorBase}&reason=${encodeURIComponent(reason)}`
    );
  }

  const expectedState = cookieStore.get("outlook_oauth_state")?.value;
  const redirectUri =
    cookieStore.get("outlook_oauth_redirect")?.value ||
    `${appUrl}/api/outlook/callback`;
  cookieStore.delete("outlook_oauth_state");
  cookieStore.delete("outlook_oauth_redirect");
  cookieStore.delete("outlook_oauth_return");

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
    await saveOutlookConnection({
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
