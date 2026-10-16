import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  approveAndSendFollowup,
  prepareDueFollowups,
} from "@/lib/outreach/followups";

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data, error } = await gate.db
    .from("outreach_followups")
    .select(
      "*, outreach_leads(id, display_name, first_name, last_name, email, do_not_contact)"
    )
    .eq("status", "due")
    .order("scheduled_for", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ followups: data || [] });
}

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    followupId?: string;
    subject?: string;
    body?: string;
  };

  if (body.action === "prepare") {
    const result = await prepareDueFollowups(gate.db);
    return NextResponse.json(result);
  }

  if (body.action === "send" && body.followupId) {
    const result = await approveAndSendFollowup({
      db: gate.db,
      userId: gate.user.id,
      followupId: body.followupId,
      subject: body.subject,
      body: body.body,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
