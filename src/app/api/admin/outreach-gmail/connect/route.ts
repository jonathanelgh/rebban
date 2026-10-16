import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  buildOutreachGmailAuthUrl,
  getOutreachGmailRedirectUri,
  isOutreachGmailOAuthConfigured,
  requestOrigin,
} from "@/lib/email/outreach-gmail";

export async function GET(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    if (gate.status === 401) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  if (!isOutreachGmailOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Gmail OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  const origin = requestOrigin(request);
  const redirectUri = getOutreachGmailRedirectUri(origin);
  const state = nanoid(32);
  const returnTo = "/admin/settings?section=outreach&gmail=connected";

  const url = buildOutreachGmailAuthUrl(state, redirectUri);
  const response = NextResponse.redirect(url);
  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  };
  response.cookies.set("outreach_gmail_oauth_state", state, cookieBase);
  response.cookies.set("outreach_gmail_oauth_redirect", redirectUri, cookieBase);
  response.cookies.set("outreach_gmail_oauth_return", returnTo, cookieBase);
  return response;
}
