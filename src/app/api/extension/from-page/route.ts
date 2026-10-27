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
} from "@/lib/extension/marketplace-profile";
import { detectExtensionPageContext } from "@/lib/extension/page-context";
import { resolveClientForExtension } from "@/lib/extension/resolve-client";
import {
  generateProposalFromBrief,
  isProposalAiConfigured,
} from "@/lib/proposals/generate";
import { toProposalContentJson } from "@/lib/proposals/content";

export const runtime = "nodejs";
export const maxDuration = 60;

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://app.rebban.com"
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isBidDraftAiConfigured() && !isProposalAiConfigured()) {
    return NextResponse.json(
      { error: "AI is not configured yet. Add OPENAI_API_KEY." },
      { status: 503 }
    );
  }

  const entitled = await requireOrgEntitlement(supabase, user.id);
  if ("response" in entitled) return entitled.response;

  const body = (await request.json().catch(() => null)) as {
    text?: string;
    pageUrl?: string;
    title?: string;
    contactEmail?: string;
    contactName?: string;
    contactCompany?: string;
    context?: "marketplace" | "email" | "web";
    platform?: string;
    profile?: unknown;
  } | null;

  const text = String(body?.text || "").trim();
  if (text.length < 40) {
    return NextResponse.json(
      { error: "Need more page text (at least a short paragraph)." },
      { status: 400 }
    );
  }

  const detected = detectExtensionPageContext(body?.pageUrl);
  const context = body?.context || detected.context;
  const platform = body?.platform || detected.platform;

  const [{ data: profileRow }, { data: org }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, title, marketplace_profile")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("name, description, currency")
      .eq("id", entitled.organizationId)
      .maybeSingle(),
  ]);

  const marketplace = asMarketplaceProfile(
    body?.profile || profileRow?.marketplace_profile
  );
  if (body?.profile) {
    await supabase
      .from("profiles")
      .update({ marketplace_profile: marketplace })
      .eq("id", user.id);
  }

  const aboutMe = [
    formatMarketplaceProfileForPrompt(marketplace),
    profileRow?.title ? `Title: ${profileRow.title}` : "",
    org?.description ? `Studio bio: ${org.description}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Marketplace job boards → copy/paste cover letter only
  if (context === "marketplace") {
    try {
      const result = await generateMarketplaceBidDraft({
        jobText: text,
        platform: platform === "freelancer" ? "freelancer" : "upwork",
        aboutMe: aboutMe || null,
        freelancerName: profileRow?.full_name || user.email || null,
        organizationName: org?.name || null,
        title: profileRow?.title || null,
      });
      return NextResponse.json({
        ok: true,
        mode: "bid",
        context,
        platform,
        draft: result.draft,
        jobTitle: result.jobTitle || body?.title || null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not draft the bid.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // Email (and generic web briefs) → real Rebban proposal + client/lead
  const contactEmail = String(body?.contactEmail || "").trim() || null;
  const contactName = String(body?.contactName || "").trim() || null;

  if (context === "email" && !contactEmail && !contactName) {
    return NextResponse.json(
      {
        error:
          "Couldn’t find the sender on this email. Switch to Paste or open the message fully.",
        code: "missing_contact",
      },
      { status: 400 }
    );
  }

  try {
    const resolved = await resolveClientForExtension(supabase, {
      organizationId: entitled.organizationId,
      userId: user.id,
      email: contactEmail,
      name: contactName || body?.title || "Email lead",
      company: body?.contactCompany || null,
      notes: [
        body?.title ? `Subject: ${body.title}` : "",
        body?.pageUrl ? `Source: ${body.pageUrl}` : "",
        "Created from Rebban Chrome extension.",
      ]
        .filter(Boolean)
        .join("\n"),
      source: context === "email" ? "email" : "website",
    });

    const brief = [
      body?.title ? `Email subject / title: ${body.title}` : "",
      contactName ? `Contact: ${contactName}` : "",
      contactEmail ? `Email: ${contactEmail}` : "",
      aboutMe ? `--- Freelancer profile ---\n${aboutMe}` : "",
      "--- Message / brief ---",
      text.slice(0, 50000),
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await generateProposalFromBrief({
      brief,
      clientName: resolved.clientName,
      clientCompany: body?.contactCompany || null,
      organizationName: org?.name || profileRow?.full_name || null,
      currency: org?.currency || "USD",
    });

    const contentJson = toProposalContentJson({
      ...result.content,
      meta: {
        ...(result.content.meta || {}),
        pricingModel: (result.pricingType || "fixed").toString().toLowerCase(),
        category: "other",
        creationMode: "ai",
        aiBrief: text.slice(0, 8000),
        source: "chrome_extension",
        pageContext: context,
      },
    });

    const { data: proposal, error: insertError } = await supabase
      .from("proposals")
      .insert({
        organization_id: entitled.organizationId,
        client_id: resolved.clientId,
        lead_id: resolved.leadId,
        title: result.title,
        amount: result.amount > 0 ? result.amount : 0,
        currency: result.currency,
        status: "draft",
        content: contentJson,
        expires_at: new Date(
          Date.now() + 1000 * 60 * 60 * 24 * 14
        ).toISOString(),
        created_by: user.id,
      })
      .select("id, title, amount, currency")
      .single();

    if (insertError || !proposal) {
      throw new Error(insertError?.message || "Could not save proposal.");
    }

    return NextResponse.json({
      ok: true,
      mode: "proposal",
      context,
      platform,
      proposalId: proposal.id,
      title: proposal.title,
      amount: proposal.amount,
      currency: proposal.currency,
      clientId: resolved.clientId,
      clientName: resolved.clientName,
      createdClient: resolved.createdClient,
      createdLead: resolved.createdLead,
      url: `${appBaseUrl()}/proposals/${proposal.id}/edit`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create proposal.";
    console.error("[extension] from-page proposal failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
