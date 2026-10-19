import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { sendEmailViaGmail } from "@/lib/email/gmail";
import { sendEmailViaOutlook } from "@/lib/email/outlook";
import { plainTextToEmailHtml } from "@/lib/leads/email";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      to?: string;
      subject?: string;
      message?: string;
    };

    const to = body.to?.trim() || "";
    const subject = body.subject?.trim() || "";
    const message = body.message?.trim() || "";

    if (!to || !to.includes("@")) {
      return NextResponse.json(
        { error: "A valid recipient email is required." },
        { status: 400 }
      );
    }
    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required." },
        { status: 400 }
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

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
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, name, email, status, organization_id")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 400 });
    }
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    const html = plainTextToEmailHtml(message);
    const fromName = profile?.full_name?.trim() || null;

    const outlookResult = await sendEmailViaOutlook({
      userId: user.id,
      to,
      subject,
      html,
      fromName,
    });
    if (outlookResult) {
      await markContactedIfNew(supabase, lead.id, lead.status);
      return NextResponse.json({
        ok: true,
        provider: outlookResult.provider,
        id: outlookResult.id,
        from: outlookResult.from,
      });
    }

    const gmailResult = await sendEmailViaGmail({
      userId: user.id,
      to,
      subject,
      html,
      fromName,
    });
    if (gmailResult) {
      await markContactedIfNew(supabase, lead.id, lead.status);
      return NextResponse.json({
        ok: true,
        provider: gmailResult.provider,
        id: gmailResult.id,
        from: gmailResult.from,
      });
    }

    return NextResponse.json(
      {
        error:
          "Connect Gmail or Outlook in Settings → Integrations to send from your email.",
      },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function markContactedIfNew(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
  status: string
) {
  if (status !== "new") return;
  await supabase
    .from("leads")
    .update({ status: "contacted" })
    .eq("id", leadId)
    .eq("status", "new");
}
