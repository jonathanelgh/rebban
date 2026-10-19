import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLeadFormConfirmationEmail } from "@/lib/email/resend";
import {
  extractSubmitterEmail,
  extractSubmitterName,
  normalizeConfirmationVia,
  renderConfirmationTemplate,
} from "@/lib/leads/confirmation-email";
import type { Json } from "@/types/database";

function clientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}

async function maybeSendConfirmationEmail(options: {
  token: string;
  values: Record<string, string>;
}) {
  const to = extractSubmitterEmail(options.values);
  if (!to) return;

  const admin = createAdminClient();
  const { data: form } = await admin
    .from("lead_forms")
    .select(
      "id, name, created_by, organization_id, confirmation_email_enabled, confirmation_email_via, confirmation_email_subject, confirmation_email_body, confirmation_email_user_id"
    )
    .eq("public_token", options.token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!form?.confirmation_email_enabled) return;

  const via = normalizeConfirmationVia(form.confirmation_email_via);
  const fromUserId =
    form.confirmation_email_user_id || form.created_by || null;

  const [{ data: org }, { data: profile }] = await Promise.all([
    admin
      .from("organizations")
      .select("name")
      .eq("id", form.organization_id)
      .maybeSingle(),
    fromUserId
      ? admin
          .from("profiles")
          .select("full_name")
          .eq("id", fromUserId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const orgName = org?.name?.trim() || "Our team";
  const fromName = profile?.full_name || null;

  const recipientName = extractSubmitterName(options.values);
  const vars = {
    name: recipientName || "there",
    email: to,
    company: options.values.company?.trim() || "",
    form: form.name,
    organization: orgName,
  };

  const subject = renderConfirmationTemplate(
    form.confirmation_email_subject || "Thanks for reaching out",
    vars
  );
  const body = renderConfirmationTemplate(
    form.confirmation_email_body ||
      "Thanks for getting in touch. We received your message and will get back to you soon.",
    vars
  );

  await sendLeadFormConfirmationEmail({
    to,
    subject,
    body,
    recipientName,
    organizationName: orgName,
    formName: form.name,
    via,
    fromUserId,
    fromName,
    useAdmin: true,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const body = (await request.json()) as { values?: Record<string, string> };
    const values = body.values || {};
    const { ip, userAgent } = clientMeta(request);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("submit_public_lead_form", {
      p_token: token,
      p_payload: values as Json,
      p_ip: ip || undefined,
      p_user_agent: userAgent || undefined,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const result = data as {
      ok?: boolean;
      success_message?: string;
      lead_id?: string;
    };

    // Confirmation email must not block a successful submit.
    try {
      await maybeSendConfirmationEmail({ token, values });
    } catch (emailError) {
      console.error("Lead form confirmation email failed:", emailError);
    }

    return NextResponse.json({
      ok: Boolean(result?.ok),
      success_message:
        result?.success_message || "Thanks — we'll be in touch soon.",
      lead_id: result?.lead_id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit form";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
