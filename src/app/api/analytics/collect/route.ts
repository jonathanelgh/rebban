import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ANALYTICS_EVENT_ARTICLE_VIEW,
  ANALYTICS_EVENT_PAGE_VIEW,
  ANALYTICS_VISITOR_COOKIE,
  allowedCollectOrigin,
  isBotUserAgent,
  isLocalAnalyticsHost,
  normalizePath,
  parseArticleSlug,
  shouldSkipPath,
} from "@/lib/analytics/internal";

export const runtime = "nodejs";

function corsHeaders(origin: string | null) {
  const headers = new Headers();
  if (origin && allowedCollectOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  return headers;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (origin && !allowedCollectOrigin(origin)) {
    return NextResponse.json({ ok: false }, { status: 403, headers });
  }

  if (isBotUserAgent(request.headers.get("user-agent"))) {
    return NextResponse.json({ ok: true, skipped: "bot" }, { headers });
  }

  const originHost = origin ? new URL(origin).hostname : "";
  const requestHost = (request.headers.get("host") || "").split(":")[0];
  if (isLocalAnalyticsHost(originHost) || isLocalAnalyticsHost(requestHost)) {
    return NextResponse.json({ ok: true, skipped: "local" }, { headers });
  }

  const body = (await request.json().catch(() => null)) as {
    path?: string;
    title?: string;
    referrer?: string;
    host?: string;
    slug?: string;
  } | null;

  const path = normalizePath(String(body?.path || "").slice(0, 500));
  if (!body?.path || shouldSkipPath(path)) {
    return NextResponse.json({ ok: true, skipped: "path" }, { headers });
  }

  const title = String(body.title || "").trim().slice(0, 200) || null;
  const referrer = String(body.referrer || "").trim().slice(0, 500) || null;
  const host = String(body.host || "").trim().slice(0, 120) || null;
  if (isLocalAnalyticsHost(host)) {
    return NextResponse.json({ ok: true, skipped: "local" }, { headers });
  }
  const slug =
    String(body.slug || "").trim().toLowerCase().slice(0, 160) ||
    parseArticleSlug(path);

  const cookieStore = await cookies();
  let visitorId = cookieStore.get(ANALYTICS_VISITOR_COOKIE)?.value || "";
  if (!visitorId || visitorId.length > 40) {
    visitorId = nanoid(21);
  }

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  let articleId: string | null = null;
  const db = createAdminClient();
  if (slug) {
    const { data: post } = await db
      .from("blog_posts")
      .select("id")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    articleId = post?.id ?? null;
  }

  const eventName = articleId
    ? ANALYTICS_EVENT_ARTICLE_VIEW
    : ANALYTICS_EVENT_PAGE_VIEW;

  const { error } = await db.from("analytics_events").insert({
    event_name: eventName,
    path,
    title,
    referrer,
    host,
    visitor_id: visitorId,
    user_id: userId,
    article_id: articleId,
    article_slug: slug,
  });

  if (error) {
    console.error("[analytics] insert failed", error.message);
    return NextResponse.json({ ok: false }, { status: 500, headers });
  }

  const response = NextResponse.json({ ok: true }, { headers });
  const cookieDomain =
    requestHost === "rebban.com" || requestHost.endsWith(".rebban.com")
      ? ".rebban.com"
      : undefined;
  response.cookies.set(ANALYTICS_VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    domain: cookieDomain,
  });
  return response;
}
