import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session; do not trust getSession() alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const authCode = request.nextUrl.searchParams.get("code");
  const isAuthRoute =
    path === "/login" ||
    path === "/signup" ||
    path.startsWith("/login/") ||
    path.startsWith("/signup/") ||
    path.startsWith("/auth/");
  const isPublicProposalRoute =
    path.startsWith("/p/") || path.startsWith("/api/p/");
  const isPublicPayRoute =
    path.startsWith("/pay/") || path.startsWith("/api/stripe/pay/");
  const isStripeWebhook = path === "/api/stripe/webhook";
  // Gmail OAuth also returns ?code= — do not treat it as Supabase login.
  const isGmailOAuthRoute = path.startsWith("/api/gmail/");

  // Supabase sometimes returns ?code= on Site URL (/) instead of /auth/callback.
  // Never strip it — forward to the exchange route (login only, not Gmail).
  if (
    authCode &&
    !path.startsWith("/auth/callback") &&
    !isGmailOAuthRoute
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  // Let the auth callback exchange the code without an existing session.
  if (path.startsWith("/auth/callback") || path.startsWith("/api/gmail/callback")) {
    return supabaseResponse;
  }

  // Public client proposal links (view / decline / sign) and invoice pay pages.
  if (isPublicProposalRoute || isPublicPayRoute || isStripeWebhook) {
    return supabaseResponse;
  }

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
