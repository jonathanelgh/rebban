import { NextResponse } from "next/server";

/**
 * Legacy path. Prefer /api/assistant/chat.
 * Proxies so older clients keep working without creating tickets up front.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/assistant/chat", url.origin);
  const rawBody = await request.text();

  const res = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") || "",
      authorization: request.headers.get("authorization") || "",
    },
    body: rawBody,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
