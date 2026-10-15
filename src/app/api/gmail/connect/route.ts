import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import {
  buildGmailAuthUrl,
  getGmailRedirectUri,
  isGmailOAuthConfigured,
  requestOrigin,
} from "@/lib/email/gmail";

export async function GET(request: Request) {
  if (!isGmailOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Gmail OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
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
  const redirectUri = getGmailRedirectUri(origin);
  const state = nanoid(32);
  const requestUrl = new URL(request.url);
  const returnToRaw = requestUrl.searchParams.get("returnTo");
  const returnTo =
    returnToRaw &&
    returnToRaw.startsWith("/") &&
    !returnToRaw.startsWith("//") &&
    !returnToRaw.includes("://")
      ? returnToRaw
      : "/settings?section=integrations&gmail=connected";

  const url = buildGmailAuthUrl(state, redirectUri);
  const response = NextResponse.redirect(url);
  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  };
  response.cookies.set("gmail_oauth_state", state, cookieBase);
  // Token exchange must use the exact same redirect_uri as the auth request.
  response.cookies.set("gmail_oauth_redirect", redirectUri, cookieBase);
  response.cookies.set("gmail_oauth_return", returnTo, cookieBase);
  return response;
}
