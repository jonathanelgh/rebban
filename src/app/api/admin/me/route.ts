import { NextResponse } from "next/server";
import { getIsPlatformAdmin } from "@/lib/platform-admin";

export async function GET() {
  const { user, isAdmin } = await getIsPlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ isPlatformAdmin: isAdmin });
}
