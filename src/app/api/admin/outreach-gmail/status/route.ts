import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  getOutreachGmailStatus,
  isOutreachGmailOAuthConfigured,
} from "@/lib/email/outreach-gmail";

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const configured = isOutreachGmailOAuthConfigured();
  const status = await getOutreachGmailStatus(gate.user.id);

  return NextResponse.json({
    configured,
    connected: Boolean(status),
    email: status?.email || null,
    connectedAt: status?.connectedAt || null,
    lastSyncAt: status?.lastSyncAt || null,
    canSend: status?.canSend || false,
    canRead: status?.canRead || false,
  });
}
