import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { allowedCollectOrigin } from "@/lib/analytics/internal";
import { asProposalContent } from "@/lib/proposals/content";
import type { Json } from "@/types/database";

export function clientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}

export function hashIp(ip: string | null) {
  if (!ip) return null;
  return createHash("sha256").update(`free-proposal:${ip}`).digest("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createDownloadToken() {
  return randomBytes(32).toString("hex");
}

export function freeProposalCorsHeaders(origin: string | null, methods: string) {
  const headers = new Headers();
  if (origin && allowedCollectOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", methods);
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return headers;
}

export function freeProposalOptions(request: Request, methods: string) {
  return new NextResponse(null, {
    status: 204,
    headers: freeProposalCorsHeaders(request.headers.get("origin"), methods),
  });
}

export function jsonWithCors(
  origin: string | null,
  methods: string,
  body: unknown,
  init?: { status?: number }
) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: freeProposalCorsHeaders(origin, methods),
  });
}

export function assertAllowedOrigin(origin: string | null) {
  // Same-origin / server-to-server calls may omit Origin.
  if (!origin) return true;
  return allowedCollectOrigin(origin);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function buildPreview(content: Json | null | undefined, title: string) {
  const snapshot = asProposalContent(content);
  const styles = snapshot.elementStyles || {};
  const summary =
    typeof (styles as Record<string, { content?: unknown }>)["summary-text"]
      ?.content === "string"
      ? String(
          (styles as Record<string, { content?: unknown }>)["summary-text"]
            .content
        ).trim()
      : "";
  const goals = Array.isArray(snapshot.projectGoals)
    ? snapshot.projectGoals
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text.trim() : "";
        })
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    title,
    summary: summary.slice(0, 480),
    highlights: goals,
  };
}
