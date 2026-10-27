import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { extractTextFromBriefFile } from "@/lib/proposals/extract-brief";
import {
  generateProposalFromBrief,
  isProposalAiConfigured,
} from "@/lib/proposals/generate";
import { toProposalContentJson } from "@/lib/proposals/content";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 8 * 1024 * 1024;

async function readBriefFromRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let notes = "";
  let clientId = "";
  let leadId = "";
  let category: string | null = null;
  let currency: string | null = null;
  let pricingHint: string | null = null;
  let fileText = "";
  let fileName: string | null = null;
  let create = true;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    notes = String(form.get("notes") || "");
    clientId = String(form.get("clientId") || "");
    leadId = String(form.get("leadId") || "");
    category = String(form.get("category") || "") || null;
    currency = String(form.get("currency") || "") || null;
    pricingHint = String(form.get("pricingHint") || "") || null;
    create = String(form.get("create") || "true") !== "false";
    const file = form.get("file");
    if (file && typeof file !== "string" && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error("File is too large (max 8MB).");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractTextFromBriefFile({
        buffer,
        filename: file.name || "upload.txt",
        mime: file.type,
      });
      fileText = extracted.text;
      fileName = extracted.source;
    }
  } else {
    const body = (await request.json().catch(() => null)) as {
      notes?: string;
      clientId?: string;
      leadId?: string;
      category?: string;
      currency?: string;
      pricingHint?: string;
      fileText?: string;
      fileName?: string;
      create?: boolean;
    } | null;
    notes = body?.notes || "";
    clientId = body?.clientId || "";
    leadId = body?.leadId || "";
    category = body?.category || null;
    currency = body?.currency || null;
    pricingHint = body?.pricingHint || null;
    fileText = body?.fileText || "";
    fileName = body?.fileName || null;
    create = body?.create !== false;
  }

  const briefParts = [notes.trim(), fileText.trim()].filter(Boolean);
  const brief = briefParts.join("\n\n---\n\n");

  return {
    notes: notes.trim(),
    clientId: clientId.trim() || null,
    leadId: leadId.trim() || null,
    category,
    currency,
    pricingHint,
    brief,
    fileName,
    create,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProposalAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "Proposal AI is not configured yet. Add OPENAI_API_KEY to enable it.",
      },
      { status: 503 }
    );
  }

  const entitlement = await requireOrgEntitlement(supabase, user.id);
  if ("response" in entitlement) return entitlement.response;
  const organizationId = entitlement.organizationId;

  let parsed;
  try {
    parsed = await readBriefFromRequest(request);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not read upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!parsed.clientId && !parsed.leadId) {
    return NextResponse.json(
      { error: "Select a client or lead to continue." },
      { status: 400 }
    );
  }

  if (!parsed.brief.trim()) {
    return NextResponse.json(
      { error: "Paste notes or upload a file with project details." },
      { status: 400 }
    );
  }

  const [{ data: client }, { data: lead }, { data: org }, { data: profile }] =
    await Promise.all([
      parsed.clientId
        ? supabase
            .from("clients")
            .select("id, name, company, email")
            .eq("id", parsed.clientId)
            .eq("organization_id", organizationId)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      parsed.leadId
        ? supabase
            .from("leads")
            .select("id, name, company, email, converted_client_id")
            .eq("id", parsed.leadId)
            .eq("organization_id", organizationId)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("organizations")
        .select("name, currency")
        .eq("id", organizationId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  if (parsed.clientId && !client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  if (parsed.leadId && !lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  // Prefer explicit client; else use lead's already-converted client if any.
  const clientId =
    client?.id || lead?.converted_client_id || null;
  const leadId = lead?.id || parsed.leadId || null;
  const recipientName = client?.name || lead?.name || "Client";
  const recipientCompany = client?.company || lead?.company || null;

  try {
    console.info("[proposals] AI generate start", {
      userId: user.id,
      clientId,
      leadId,
      briefLength: parsed.brief.length,
      fileName: parsed.fileName,
    });

    const result = await generateProposalFromBrief({
      brief: parsed.brief,
      clientName: recipientName,
      clientCompany: recipientCompany,
      organizationName: org?.name || profile?.full_name || null,
      category: parsed.category,
      currency: parsed.currency || org?.currency || "USD",
      pricingHint: parsed.pricingHint,
    });

    const summary =
      (
        result.content.elementStyles as
          | Record<string, { content?: string }>
          | undefined
      )?.["summary-text"]?.content || "";
    if (!summary.trim()) {
      throw new Error("AI returned empty proposal copy. Try again.");
    }

    const contentJson = toProposalContentJson({
      ...result.content,
      meta: {
        ...(result.content.meta || {}),
        pricingModel: (parsed.pricingHint || result.pricingType || "fixed")
          .toString()
          .toLowerCase(),
        category: parsed.category || "other",
        creationMode: "ai",
        aiBrief: parsed.notes || parsed.brief.slice(0, 8000),
        aiFileName: parsed.fileName,
      },
    });

    if (!parsed.create) {
      return NextResponse.json({
        title: result.title,
        amount: result.amount,
        currency: result.currency,
        pricingType: result.pricingType,
        content: contentJson,
        fileName: parsed.fileName,
        clientId,
        leadId,
      });
    }

    const { data: proposal, error: insertError } = await supabase
      .from("proposals")
      .insert({
        organization_id: organizationId,
        client_id: clientId,
        lead_id: leadId,
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

    if (leadId) {
      await supabase
        .from("leads")
        .update({
          proposal_id: proposal.id,
          status: "proposal_sent",
        })
        .eq("id", leadId);
    }

    console.info("[proposals] AI generate saved", {
      proposalId: proposal.id,
      title: proposal.title,
    });

    return NextResponse.json({
      id: proposal.id,
      title: proposal.title,
      amount: proposal.amount,
      currency: proposal.currency,
      pricingType: result.pricingType,
      content: contentJson,
      fileName: parsed.fileName,
      clientId,
      leadId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not generate proposal.";
    console.error("[proposals] AI generate failed", {
      userId: user.id,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
