import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import { extractTextFromBriefFile } from "@/lib/proposals/extract-brief";
import {
  generateProposalFromBrief,
  isProposalAiConfigured,
} from "@/lib/proposals/generate";
import {
  asProposalContent,
  mergeElementStyles,
  toProposalContentJson,
} from "@/lib/proposals/content";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 8 * 1024 * 1024;

async function readNotesAndFile(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let notes = "";
  let fileText = "";
  let fileName: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    notes = String(form.get("notes") || "");
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
    } | null;
    notes = body?.notes || "";
  }

  return { notes: notes.trim(), fileText: fileText.trim(), fileName };
}

/** Write / rewrite AI copy for an existing proposal from notes and/or a file. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProposalAiConfigured()) {
    return NextResponse.json(
      { error: "Proposal AI is not configured." },
      { status: 503 }
    );
  }

  const organizationId = await getActiveOrganizationId(supabase, user.id);
  if (!organizationId) {
    return NextResponse.json(
      { error: "No active workspace found." },
      { status: 400 }
    );
  }

  let parsed;
  try {
    parsed = await readNotesAndFile(request);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not read upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("id, title, content, client_id, currency, organization_id, status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  const existing = asProposalContent(proposal.content);
  const savedBrief = String(
    (existing.meta as { aiBrief?: string } | undefined)?.aiBrief || ""
  ).trim();

  // Prefer fresh notes/file over the previously saved brief
  const brief =
    [parsed.notes, parsed.fileText].filter(Boolean).join("\n\n---\n\n") ||
    savedBrief;

  if (brief.length < 40) {
    return NextResponse.json(
      {
        error:
          "Add more project details (paste notes or upload a file) so AI can write the proposal.",
      },
      { status: 400 }
    );
  }

  const [{ data: client }, { data: org }, { data: profile }] = await Promise.all(
    [
      proposal.client_id
        ? supabase
            .from("clients")
            .select("name, company")
            .eq("id", proposal.client_id)
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
    ]
  );

  try {
    console.info("[proposals] AI rewrite start", {
      proposalId: id,
      briefLength: brief.length,
      fileName: parsed.fileName,
    });

    const result = await generateProposalFromBrief({
      brief,
      clientName: client?.name || "Client",
      clientCompany: client?.company,
      organizationName: org?.name || profile?.full_name || null,
      currency: proposal.currency || org?.currency || "USD",
    });

    const nextContent = toProposalContentJson({
      ...result.content,
      headerTheme: existing.headerTheme || result.content.headerTheme,
      headerLayout: existing.headerLayout || result.content.headerLayout,
      elementStyles: mergeElementStyles(
        (existing.elementStyles as Record<string, unknown> | undefined) || {},
        (result.content.elementStyles as Record<string, unknown> | undefined) ||
          {}
      ),
      meta: {
        ...(existing.meta || {}),
        ...(result.content.meta || {}),
        creationMode: "ai",
        aiBrief: brief.slice(0, 8000),
        aiFileName: parsed.fileName,
        aiGeneratedAt: new Date().toISOString(),
        templateId: (existing.meta as { templateId?: string } | undefined)
          ?.templateId,
        templateName: (existing.meta as { templateName?: string } | undefined)
          ?.templateName,
        templateSlug: (existing.meta as { templateSlug?: string } | undefined)
          ?.templateSlug,
      },
    });

    const { error: updateError } = await supabase
      .from("proposals")
      .update({
        title: result.title,
        amount: result.amount > 0 ? result.amount : 0,
        currency: result.currency || proposal.currency,
        content: nextContent,
      })
      .eq("id", proposal.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      id: proposal.id,
      title: result.title,
      amount: result.amount,
      currency: result.currency,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not generate proposal copy.";
    console.error("[proposals] rewrite failed", {
      proposalId: id,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
