import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import {
  buildOutlookAuthUrl,
  getOutlookRedirectUri,
  isOutlookOAuthConfigured,
  requestOrigin,
} from "@/lib/email/outlook";
import { sanitizeReturnTo } from "@/lib/mobile-return-to";

export async function GET(request: Request) {
  if (!isOutlookOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Outlook OAuth is not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.",
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
  const redirectUri = getOutlookRedirectUri(origin);
  const state = nanoid(32);
  const requestUrl = new URL(request.url);
  const returnTo = sanitizeReturnTo(
    requestUrl.searchParams.get("returnTo"),
    "/settings?section=integrations&outlook=connected"
  );

  const url = buildOutlookAuthUrl(state, redirectUri);
  const response = NextResponse.redirect(url);
  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  };
  response.cookies.set("outlook_oauth_state", state, cookieBase);
  response.cookies.set("outlook_oauth_redirect", redirectUri, cookieBase);
  response.cookies.set("outlook_oauth_return", returnTo, cookieBase);
  return response;
}
