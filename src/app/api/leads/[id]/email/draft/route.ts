import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import {
  generateLeadEmailDraft,
  isLeadEmailAiConfigured,
} from "@/lib/leads/email";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!isLeadEmailAiConfigured()) {
      return NextResponse.json(
        {
          error:
            "AI email drafting is not configured yet. Add OPENAI_API_KEY to enable it.",
        },
        { status: 503 }
      );
    }

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      instruction?: string;
    };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;
    const organizationId = entitlement.organizationId;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, title, industry")
      .eq("id", user.id)
      .maybeSingle();

    const [{ data: org }, { data: lead, error: leadError }, { data: submissions }] =
      await Promise.all([
        supabase
          .from("organizations")
          .select("name")
          .eq("id", organizationId)
          .maybeSingle(),
        supabase
          .from("leads")
          .select(
            "id, name, email, company, phone, website, notes, status, source, form_id, lead_forms(name)"
          )
          .eq("id", id)
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("lead_form_submissions")
          .select("payload, created_at")
          .eq("lead_id", id)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 400 });
    }
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    const formRel = Array.isArray(lead.lead_forms)
      ? lead.lead_forms[0]
      : lead.lead_forms;

    const latestSubmission = submissions?.[0];
    const formSubmission =
      latestSubmission?.payload &&
      typeof latestSubmission.payload === "object" &&
      !Array.isArray(latestSubmission.payload)
        ? (latestSubmission.payload as Record<string, unknown>)
        : null;

    const draft = await generateLeadEmailDraft({
      freelancer: {
        name: profile?.full_name || null,
        email: profile?.email || user.email || null,
        title: profile?.title || null,
        industry: profile?.industry || null,
        organizationName: org?.name || null,
      },
      lead: {
        name: lead.name,
        email: lead.email,
        company: lead.company,
        phone: lead.phone,
        website: lead.website,
        notes: lead.notes,
        status: lead.status,
        source: lead.source,
        formName: formRel?.name || null,
      },
      formSubmission,
      instruction: body.instruction || null,
    });

    return NextResponse.json({
      ok: true,
      subject: draft.subject,
      body: draft.body,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to draft email";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
