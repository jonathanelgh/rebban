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
  // Mobile (Expo) may send Authorization: Bearer instead of cookies.
  const bearer = request.headers.get("authorization");
  const hasBearer = Boolean(bearer?.startsWith("Bearer "));
  let user = (
    await supabase.auth.getUser()
  ).data.user;

  if (!user && hasBearer && bearer) {
    const token = bearer.slice(7).trim();
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    }
  }

  const path = request.nextUrl.pathname;
  const authCode = request.nextUrl.searchParams.get("code");
  const isAuthRoute =
    path === "/login" ||
    path === "/signup" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path.startsWith("/login/") ||
    path.startsWith("/signup/") ||
    path.startsWith("/forgot-password/") ||
    path.startsWith("/reset-password/") ||
    path.startsWith("/auth/");
  const isPasswordResetRoute =
    path === "/reset-password" || path.startsWith("/reset-password/");
  const isPublicProposalRoute =
    path.startsWith("/p/") || path.startsWith("/api/p/");
  const isPublicPayRoute =
    path.startsWith("/pay/") || path.startsWith("/api/stripe/pay/");
  const isPublicLeadFormRoute =
    path.startsWith("/f/") || path.startsWith("/api/f/");
  const isPublicBookingRoute =
    path.startsWith("/b/") || path.startsWith("/api/b/");
  const isStripeWebhook = path === "/api/stripe/webhook";
  const isWhatsAppInbound = path === "/api/assistant/whatsapp/inbound";
  const isCronRoute = path.startsWith("/api/cron/");
  const isAnalyticsCollect = path === "/api/analytics/collect";
  const isExtensionAuth =
    path === "/api/extension/auth" ||
    path === "/api/extension/auth/refresh";
  // Gmail / Outlook OAuth also return ?code= — do not treat as Supabase login.
  const isMailOAuthRoute =
    path.startsWith("/api/gmail/") ||
    path.startsWith("/api/outlook/") ||
    path.startsWith("/api/google-calendar/") ||
    path.startsWith("/api/zoom/") ||
    path.startsWith("/api/admin/outreach-gmail/");

  // Supabase sometimes returns ?code= on Site URL (/) instead of /auth/callback.
  // Never strip it — forward to the exchange route (login only, not mail OAuth).
  if (
    authCode &&
    !path.startsWith("/auth/callback") &&
    !isMailOAuthRoute
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  // Let the auth callback exchange the code without an existing session.
  if (
    path.startsWith("/auth/callback") ||
    path.startsWith("/api/gmail/callback") ||
    path.startsWith("/api/outlook/callback") ||
    path.startsWith("/api/google-calendar/callback") ||
    path.startsWith("/api/zoom/callback") ||
    path.startsWith("/api/admin/outreach-gmail/callback")
  ) {
    return supabaseResponse;
  }

  // Public client proposal links (view / decline / sign) and invoice pay pages.
  // Cron routes authenticate via CRON_SECRET inside the handler.
  if (
    isPublicProposalRoute ||
    isPublicPayRoute ||
    isPublicLeadFormRoute ||
    isPublicBookingRoute ||
    isStripeWebhook ||
    isWhatsAppInbound ||
    isCronRoute ||
    isAnalyticsCollect ||
    isExtensionAuth
  ) {
    return supabaseResponse;
  }

  const isApiRouteEarly = path.startsWith("/api/");
  // API routes with Bearer JWT are validated in the handler via createClient().
  if (!user && !isAuthRoute && !(isApiRouteEarly && hasBearer)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Recovery links land here with a session — don't bounce them to home.
  if (user && isAuthRoute && !isPasswordResetRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .maybeSingle();
    const url = request.nextUrl.clone();
    url.pathname = profile?.onboarding_completed_at ? "/" : "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isOnboardingRoute = path === "/onboarding" || path.startsWith("/onboarding/");
  const isAdminRoute = path === "/admin" || path.startsWith("/admin/");
  const isApiRoute = path.startsWith("/api/");

  if (
    user &&
    !isOnboardingRoute &&
    !isAdminRoute &&
    !isApiRoute &&
    !isAuthRoute
  ) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.onboarding_completed_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
