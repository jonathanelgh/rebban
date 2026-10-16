import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { sendInitialOutreachEmail } from "@/lib/outreach/send";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await context.params;
  const result = await sendInitialOutreachEmail({
    db: gate.db,
    userId: gate.user.id,
    leadId: id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, reason: "reason" in result ? result.reason : undefined },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}
