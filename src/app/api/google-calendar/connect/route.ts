import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import {
  buildGoogleCalendarAuthUrl,
  getGoogleCalendarRedirectUri,
  isGoogleCalendarOAuthConfigured,
  requestOrigin,
} from "@/lib/booking/google-calendar";
import { sanitizeReturnTo } from "@/lib/mobile-return-to";

export async function GET(request: Request) {
  if (!isGoogleCalendarOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Calendar OAuth is not configured. Add GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const origin = requestOrigin(request);
  const redirectUri = getGoogleCalendarRedirectUri(origin);
  const state = nanoid(32);
  const requestUrl = new URL(request.url);
  const returnTo = sanitizeReturnTo(
    requestUrl.searchParams.get("returnTo"),
    "/calendar?gcal=connected"
  );

  const url = buildGoogleCalendarAuthUrl(state, redirectUri);
  const response = NextResponse.redirect(url);
  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  };
  response.cookies.set("gcal_oauth_state", state, cookieBase);
  response.cookies.set("gcal_oauth_redirect", redirectUri, cookieBase);
  response.cookies.set("gcal_oauth_return", returnTo, cookieBase);
  return response;
}
