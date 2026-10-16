import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  requestOrigin,
  saveOutreachGmailConnection,
} from "@/lib/email/outreach-gmail";

export async function GET(request: Request) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    requestOrigin(request);
  const successPath = "/admin/settings?section=outreach&gmail=connected";
  const errorPath = "/admin/settings?section=outreach&gmail=error";

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError || !code) {
    return NextResponse.redirect(
      new URL(`${errorPath}&message=${encodeURIComponent(oauthError || "missing_code")}`, appUrl)
    );
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("outreach_gmail_oauth_state")?.value;
  const redirectUri =
    cookieStore.get("outreach_gmail_oauth_redirect")?.value ||
    `${appUrl}/api/admin/outreach-gmail/callback`;
  const returnTo =
    cookieStore.get("outreach_gmail_oauth_return")?.value || successPath;

  cookieStore.delete("outreach_gmail_oauth_state");
  cookieStore.delete("outreach_gmail_oauth_redirect");
  cookieStore.delete("outreach_gmail_oauth_return");

  if (!expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL(`${errorPath}&message=invalid_state`, appUrl)
    );
  }

  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.redirect(
      new URL(`${errorPath}&message=unauthorized`, appUrl)
    );
  }

  try {
    await saveOutreachGmailConnection({
      userId: gate.user.id,
      code,
      redirectUri,
    });
    console.info("[outreach] gmail connected", { userId: gate.user.id });
    return NextResponse.redirect(new URL(returnTo, appUrl));
  } catch (err) {
    const message = err instanceof Error ? err.message : "connect_failed";
    console.error("[outreach] gmail connect failed", { error: message });
    return NextResponse.redirect(
      new URL(`${errorPath}&message=${encodeURIComponent(message)}`, appUrl)
    );
  }
}
