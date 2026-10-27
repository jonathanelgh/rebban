import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import {
  generateMarketplaceBidDraft,
  isBidDraftAiConfigured,
} from "@/lib/extension/bid-draft";
import {
  asMarketplaceProfile,
  formatMarketplaceProfileForPrompt,
  marketplaceProfileHasContent,
} from "@/lib/extension/marketplace-profile";

export const runtime = "nodejs";
export const maxDuration = 60;

const PLATFORMS = new Set(["upwork", "freelancer", "other", "marketplace"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isBidDraftAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "Proposal AI is not configured yet. Add OPENAI_API_KEY to enable it.",
      },
      { status: 503 }
    );
  }

  const entitled = await requireOrgEntitlement(supabase, user.id);
  if ("response" in entitled) return entitled.response;

  const body = (await request.json().catch(() => null)) as {
    jobText?: string;
    platform?: string;
    aboutMe?: string;
    /** When true, persist aboutMe fields into marketplace_profile (legacy single blob ignored). */
    saveProfile?: boolean;
    profile?: {
      services?: string;
      experience?: string;
      skills?: string;
      rates?: string;
      portfolio?: string;
    };
  } | null;

  const jobText = String(body?.jobText || "").trim();
  const platformRaw = String(body?.platform || "marketplace")
    .trim()
    .toLowerCase();
  const platform = PLATFORMS.has(platformRaw) ? platformRaw : "marketplace";

  const [{ data: profileRow }, { data: org }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, title, marketplace_profile")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("name, description")
      .eq("id", entitled.organizationId)
      .maybeSingle(),
  ]);

  let marketplace = asMarketplaceProfile(profileRow?.marketplace_profile);

  if (body?.profile && typeof body.profile === "object") {
    marketplace = asMarketplaceProfile({
      ...marketplace,
      ...body.profile,
    });
    if (body.saveProfile) {
      await supabase
        .from("profiles")
        .update({ marketplace_profile: marketplace })
        .eq("id", user.id);
    }
  }

  const aboutParts = [
    formatMarketplaceProfileForPrompt(marketplace),
    String(body?.aboutMe || "").trim(),
    profileRow?.title ? `Title: ${profileRow.title}` : "",
    org?.description ? `Studio bio: ${org.description}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const result = await generateMarketplaceBidDraft({
      jobText,
      platform,
      aboutMe: aboutParts || null,
      freelancerName: profileRow?.full_name || user.email || null,
      organizationName: org?.name || null,
      title: profileRow?.title || null,
    });

    return NextResponse.json({
      ok: true,
      draft: result.draft,
      jobTitle: result.jobTitle,
      platform,
      profileIncomplete: !marketplaceProfileHasContent(marketplace),
      profile: marketplace,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not draft the bid.";
    console.error("[extension] bid-draft failed", { message });
    const status =
      /Paste more|too long|not configured|API key/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("marketplace_profile, full_name, title")
    .eq("id", user.id)
    .maybeSingle();

  const profile = asMarketplaceProfile(profileRow?.marketplace_profile);

  return NextResponse.json({
    ok: true,
    profile,
    profileIncomplete: !marketplaceProfileHasContent(profile),
    fullName: profileRow?.full_name || null,
    title: profileRow?.title || null,
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    profile?: unknown;
  } | null;

  const profile = asMarketplaceProfile(body?.profile);
  const { error } = await supabase
    .from("profiles")
    .update({ marketplace_profile: profile })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    profile,
    profileIncomplete: !marketplaceProfileHasContent(profile),
  });
}
