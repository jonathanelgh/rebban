import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

function safeNextPath(next: string) {
  if (next.startsWith("/") && !next.startsWith("//") && !next.includes("://")) {
    return next;
  }
  return "/";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const organizationType = searchParams.get("organization_type");
  const organizationName = searchParams.get("organization_name");
  const marketingConsent = searchParams.get("marketing_consent") === "1";
  const isSignupIntent = Boolean(
    organizationType || organizationName || marketingConsent
  );
  const next = searchParams.get("next") ?? (isSignupIntent ? "/onboarding" : "/");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await applySignupPreferences(supabase, {
        organizationType,
        organizationName,
        marketingConsent,
      });
      const destination = safeNextPath(next);
      return NextResponse.redirect(new URL(destination, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", origin));
}

async function applySignupPreferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefs: {
    organizationType: string | null;
    organizationName: string | null;
    marketingConsent: boolean;
  }
) {
  const hasPrefs =
    prefs.organizationType ||
    prefs.organizationName ||
    prefs.marketingConsent;
  if (!hasPrefs) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Only tweak workspace details for brand-new Google signups.
  const createdAt = new Date(user.created_at).getTime();
  if (Number.isNaN(createdAt) || Date.now() - createdAt > 5 * 60 * 1000) {
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.active_organization_id) return;

  const orgPatch: {
    name?: string;
    type?: Enums<"organization_type">;
    updated_at?: string;
  } = { updated_at: new Date().toISOString() };

  if (prefs.organizationName?.trim()) {
    orgPatch.name = prefs.organizationName.trim();
  }
  if (
    prefs.organizationType === "solo" ||
    prefs.organizationType === "agency"
  ) {
    orgPatch.type = prefs.organizationType;
  }

  if (orgPatch.name || orgPatch.type) {
    await supabase
      .from("organizations")
      .update(orgPatch)
      .eq("id", profile.active_organization_id);
  }

  if (prefs.marketingConsent) {
    await supabase
      .from("profiles")
      .update({
        marketing_consent: true,
        marketing_consent_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }
}
