import {
  generateProposalFromBrief,
  isProposalAiConfigured,
} from "@/lib/proposals/generate";
import { toProposalContentJson } from "@/lib/proposals/content";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertAllowedOrigin,
  buildPreview,
  clientMeta,
  freeProposalOptions,
  hashIp,
  jsonWithCors,
} from "@/lib/free-proposal/public";

export const runtime = "nodejs";
export const maxDuration = 60;

const METHODS = "POST, OPTIONS";
const GENERATE_LIMIT_PER_HOUR = 5;

export async function OPTIONS(request: Request) {
  return freeProposalOptions(request, METHODS);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!assertAllowedOrigin(origin)) {
    return jsonWithCors(origin, METHODS, { error: "Origin not allowed" }, {
      status: 403,
    });
  }

  if (!isProposalAiConfigured()) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Proposal generator is temporarily unavailable." },
      { status: 503 }
    );
  }

  const { ip, userAgent } = clientMeta(request);
  const ipHash = hashIp(ip);
  const admin = createAdminClient();

  if (ipHash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("free_proposal_drafts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count || 0) >= GENERATE_LIMIT_PER_HOUR) {
      return jsonWithCors(
        origin,
        METHODS,
        { error: "Too many proposals from this network. Try again later." },
        { status: 429 }
      );
    }
  }

  const body = (await request.json().catch(() => null)) as {
    brief?: string;
    clientName?: string;
    clientCompany?: string;
    freelancerName?: string;
    currency?: string;
    budgetHint?: string;
  } | null;

  const brief = String(body?.brief || "").trim();
  const clientName = String(body?.clientName || "").trim().slice(0, 120);
  const clientCompany = String(body?.clientCompany || "")
    .trim()
    .slice(0, 160);
  const freelancerName = String(body?.freelancerName || "")
    .trim()
    .slice(0, 120);
  const currency = String(body?.currency || "USD")
    .trim()
    .toUpperCase()
    .slice(0, 8);
  const budgetHint = String(body?.budgetHint || "").trim().slice(0, 200);

  if (!clientName) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Client name is required." },
      { status: 400 }
    );
  }
  if (brief.length < 40) {
    return jsonWithCors(
      origin,
      METHODS,
      {
        error:
          "Add more project details (at least a short paragraph) so we can write the proposal.",
      },
      { status: 400 }
    );
  }
  if (brief.length > 12000) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Brief is too long (max about 12,000 characters)." },
      { status: 400 }
    );
  }

  try {
    const result = await generateProposalFromBrief({
      brief,
      clientName,
      clientCompany: clientCompany || null,
      organizationName: freelancerName || "Freelance studio",
      currency: currency || "USD",
      pricingHint: budgetHint || null,
      category: "other",
    });

    const contentJson = toProposalContentJson({
      ...result.content,
      meta: {
        ...(result.content.meta || {}),
        pricingModel: (result.pricingType || "fixed").toString().toLowerCase(),
        category: "other",
        creationMode: "ai",
        source: "free_proposal_generator",
        aiBrief: brief.slice(0, 8000),
      },
    });

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: draft, error } = await admin
      .from("free_proposal_drafts")
      .insert({
        title: result.title,
        content: contentJson,
        amount: result.amount > 0 ? result.amount : 0,
        currency: result.currency || currency || "USD",
        client_name: clientName,
        client_company: clientCompany || null,
        freelancer_name: freelancerName || null,
        ip_hash: ipHash,
        user_agent: userAgent?.slice(0, 500) || null,
        expires_at: expiresAt,
      })
      .select("id, title, content")
      .single();

    if (error || !draft) {
      console.error("[free-proposal/generate] insert", error);
      return jsonWithCors(
        origin,
        METHODS,
        { error: "Could not save proposal draft." },
        { status: 500 }
      );
    }

    return jsonWithCors(origin, METHODS, {
      draftId: draft.id,
      title: draft.title,
      preview: buildPreview(draft.content, draft.title),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate proposal.";
    console.error("[free-proposal/generate]", error);
    const status = /more project details|too long/i.test(message) ? 400 : 500;
    return jsonWithCors(origin, METHODS, { error: message }, { status });
  }
}
