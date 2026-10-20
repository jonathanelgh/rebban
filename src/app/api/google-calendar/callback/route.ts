import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/email/resend";
import {
  requestOrigin,
  saveGoogleCalendarConnection,
} from "@/lib/booking/google-calendar";

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

  const cookieStore = await cookies();
  const returnToCookie = cookieStore.get("gcal_oauth_return")?.value;
  const returnTo =
    returnToCookie &&
    returnToCookie.startsWith("/") &&
    !returnToCookie.startsWith("//") &&
    !returnToCookie.includes("://")
      ? returnToCookie
      : "/calendar?gcal=connected";
  const errorBase = "/calendar?gcal=error";

  if (oauthError) {
    return NextResponse.redirect(
      `${appUrl}${errorBase}&reason=${encodeURIComponent(oauthError)}`
    );
  }

  const expectedState = cookieStore.get("gcal_oauth_state")?.value;
  const redirectUri =
    cookieStore.get("gcal_oauth_redirect")?.value ||
    `${appUrl}/api/google-calendar/callback`;
  cookieStore.delete("gcal_oauth_state");
  cookieStore.delete("gcal_oauth_redirect");
  cookieStore.delete("gcal_oauth_return");

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
    await saveGoogleCalendarConnection({
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
