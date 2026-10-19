import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Approximate visitor country from edge/CDN headers (Vercel / Cloudflare). */
export async function GET(request: Request) {
  const raw =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    null;
  const country =
    raw && raw.trim() && raw.trim().toUpperCase() !== "XX"
      ? raw.trim().toUpperCase()
      : null;

  return NextResponse.json({ country });
}
