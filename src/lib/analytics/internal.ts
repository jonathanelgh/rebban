export const ANALYTICS_VISITOR_COOKIE = "rebban_vid";

export const ANALYTICS_EVENT_PAGE_VIEW = "page_view";
export const ANALYTICS_EVENT_ARTICLE_VIEW = "article_view";

const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|whatsapp|telegram|preview|lighthouse|headless/i;

export function isBotUserAgent(ua: string | null | undefined) {
  if (!ua) return false;
  return BOT_UA.test(ua);
}

export function parseArticleSlug(path: string) {
  const pathname = path.startsWith("http")
    ? safePathname(path)
    : path.split("?")[0] || "";
  const match = pathname.match(/^\/articles\/([a-z0-9][a-z0-9-]{0,160})\/?$/i);
  return match?.[1]?.toLowerCase() || null;
}

function safePathname(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export function normalizePath(path: string) {
  const raw = path.startsWith("http") ? safePathname(path) || "/" : path;
  const noQuery = raw.split("?")[0] || "/";
  const cleaned = noQuery.replace(/\/{2,}/g, "/");
  if (cleaned.length > 1 && cleaned.endsWith("/")) {
    return cleaned.slice(0, -1);
  }
  return cleaned || "/";
}

export function shouldSkipPath(path: string) {
  return (
    path.startsWith("/api/") ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path.startsWith("/_next/") ||
    path === "/sw.js" ||
    path === "/manifest.webmanifest"
  );
}

export function isLocalAnalyticsHost(host: string | null | undefined) {
  const raw = (host || "").trim().toLowerCase().split(":")[0];
  return raw === "localhost" || raw === "127.0.0.1" || raw === "::1";
}

export function allowedCollectOrigin(origin: string | null) {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    if (isLocalAnalyticsHost(host)) return true;
    return host === "rebban.com" || host.endsWith(".rebban.com");
  } catch {
    return false;
  }
}
