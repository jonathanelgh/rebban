import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import {
  buildZoomAuthUrl,
  getZoomRedirectUri,
  isZoomOAuthConfigured,
  requestOrigin,
} from "@/lib/booking/zoom";

export async function GET(request: Request) {
  if (!isZoomOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Zoom OAuth is not configured. Add ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET.",
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
  const redirectUri = getZoomRedirectUri(origin);
  const state = nanoid(32);
  const requestUrl = new URL(request.url);
  const returnToRaw = requestUrl.searchParams.get("returnTo");
  const returnTo =
    returnToRaw &&
    returnToRaw.startsWith("/") &&
    !returnToRaw.startsWith("//") &&
    !returnToRaw.includes("://")
      ? returnToRaw
      : "/calendar?zoom=connected";

  const url = buildZoomAuthUrl(state, redirectUri);
  const response = NextResponse.redirect(url);
  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  };
  response.cookies.set("zoom_oauth_state", state, cookieBase);
  response.cookies.set("zoom_oauth_redirect", redirectUri, cookieBase);
  response.cookies.set("zoom_oauth_return", returnTo, cookieBase);
  return response;
}
