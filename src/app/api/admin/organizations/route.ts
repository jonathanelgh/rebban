import { NextResponse } from "next/server";
import {
  loadAdminOrganizations,
  requirePlatformAdmin,
} from "@/lib/platform-admin";

export async function GET(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const plan = (url.searchParams.get("plan") || "all").toLowerCase();

    let orgs = await loadAdminOrganizations(gate.db);

    if (q) {
      orgs = orgs.filter((org) => {
        const hay = [org.name, org.ownerEmail, org.ownerName, org.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (plan === "paid") orgs = orgs.filter((o) => o.paid);
    else if (plan === "trial")
      orgs = orgs.filter((o) => o.trialActive && !o.paid);
    else if (plan === "free")
      orgs = orgs.filter((o) => !o.paid && !o.trialActive);

    return NextResponse.json({ organizations: orgs });
  } catch (error) {
    console.error("admin organizations failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load organizations",
      },
      { status: 500 }
    );
  }
}
