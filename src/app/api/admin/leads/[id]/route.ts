import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  lookupSignupsByEmails,
  signupForEmail,
} from "@/lib/outreach/signup";
import type { Database } from "@/types/database";

type LeadUpdate = Database["public"]["Tables"]["outreach_leads"]["Update"];

const EDITABLE: (keyof LeadUpdate)[] = [
  "first_name",
  "last_name",
  "display_name",
  "business_name",
  "email",
  "role",
  "location",
  "website_url",
  "source_url",
  "source_type",
  "lead_tier",
  "research_confidence",
  "website_summary",
  "personalized_opener",
  "rebban_fit",
  "outreach_angle",
  "subject_line",
  "initial_email_body",
  "outreach_status",
  "ready_to_send",
  "do_not_contact",
  "caution_note",
  "unsubscribe_reason",
];

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await context.params;

  const [leadRes, messagesRes, analysesRes, followupsRes] = await Promise.all([
    gate.db.from("outreach_leads").select("*").eq("id", id).maybeSingle(),
    gate.db
      .from("outreach_messages")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: true }),
    gate.db
      .from("outreach_ai_analyses")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    gate.db
      .from("outreach_followups")
      .select("*")
      .eq("lead_id", id)
      .order("scheduled_for", { ascending: true }),
  ]);

  if (leadRes.error) {
    return NextResponse.json({ error: leadRes.error.message }, { status: 500 });
  }
  if (!leadRes.data) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const signupMap = await lookupSignupsByEmails(gate.db, [
    leadRes.data.email,
  ]);

  return NextResponse.json({
    lead: leadRes.data,
    signup: signupForEmail(signupMap, leadRes.data.email),
    messages: messagesRes.data || [],
    analyses: analysesRes.data || [],
    followups: followupsRes.data || [],
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const patch: LeadUpdate = {};
  for (const key of EDITABLE) {
    if (key in body) {
      (patch as Record<string, unknown>)[key] = body[key];
    }
  }

  if (patch.do_not_contact === true) {
    patch.unsubscribed_at = new Date().toISOString();
    patch.ready_to_send = false;
    patch.queued_at = null;
  }

  if (patch.outreach_status === "ready") {
    patch.ready_to_send = true;
  }
  if (patch.outreach_status === "queued") {
    patch.ready_to_send = true;
    patch.queued_at = new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await gate.db
    .from("outreach_leads")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A lead with this email already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  return NextResponse.json({ lead: data });
}
