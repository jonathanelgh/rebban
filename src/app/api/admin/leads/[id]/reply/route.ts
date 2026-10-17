import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { sendApprovedReply } from "@/lib/outreach/reply-send";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    body?: string;
    subject?: string;
  } | null;

  if (!body?.body?.trim()) {
    return NextResponse.json({ error: "Reply body is required." }, { status: 400 });
  }

  const result = await sendApprovedReply({
    db: gate.db,
    userId: gate.user.id,
    leadId: id,
    body: body.body,
    subject: body.subject,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
