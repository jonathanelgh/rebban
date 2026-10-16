import { NextResponse } from "next/server";
import {
  loadAdminOverview,
  requirePlatformAdmin,
} from "@/lib/platform-admin";

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const overview = await loadAdminOverview(gate.db);
    return NextResponse.json(overview);
  } catch (error) {
    console.error("admin overview failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load overview",
      },
      { status: 500 }
    );
  }
}
