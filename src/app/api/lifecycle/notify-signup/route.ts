import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewSignup } from "@/lib/email/lifecycle-notify";

export const runtime = "nodejs";

/**
 * Fire-and-forget internal alert when a brand-new user finishes signup.
 * Safe to call from email signup or Google OAuth callback.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const createdAt = new Date(user.created_at).getTime();
    if (Number.isNaN(createdAt) || Date.now() - createdAt > 15 * 60 * 1000) {
      return NextResponse.json({ ok: true, skipped: "not_new" });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, email, active_organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ ok: true, skipped: "no_profile" });
    }

    let organizationName: string | null = null;
    if (profile.active_organization_id) {
      const { data: org } = await admin
        .from("organizations")
        .select("name")
        .eq("id", profile.active_organization_id)
        .maybeSingle();
      organizationName = org?.name || null;
    }

    const provider =
      typeof user.app_metadata?.provider === "string"
        ? user.app_metadata.provider
        : user.identities?.[0]?.provider || "email";

    await notifyNewSignup({
      fullName: profile.full_name,
      email: profile.email || user.email,
      organizationName,
      source: provider === "google" ? "google" : "email",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[lifecycle] signup notify failed", error);
    // Don't block signup UX on notify failures.
    return NextResponse.json({ ok: true, notified: false });
  }
}
