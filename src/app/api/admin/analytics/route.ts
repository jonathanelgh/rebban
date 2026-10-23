import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { ANALYTICS_EVENT_ARTICLE_VIEW } from "@/lib/analytics/internal";

export const runtime = "nodejs";

type EventRow = {
  occurred_at: string;
  event_name: string;
  path: string;
  title: string | null;
  referrer: string | null;
  host: string | null;
  visitor_id: string | null;
  user_id: string | null;
  article_id: string | null;
  article_slug: string | null;
};

function referrerHost(referrer: string | null, pageHost: string | null) {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (!url.hostname) return null;
    if (pageHost && url.hostname === pageHost) return null;
    if (url.hostname === "rebban.com" || url.hostname.endsWith(".rebban.com")) {
      return null;
    }
    return url.hostname;
  } catch {
    return null;
  }
}

function countMap(map: Map<string, number>, key: string, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

function topFromCount(
  map: Map<string, number>,
  labels?: Map<string, string>,
  limit = 12
) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({
      key,
      label: labels?.get(key) || key,
      count,
    }));
}

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const days = [7, 30, 90].includes(Number(url.searchParams.get("range")))
    ? Number(url.searchParams.get("range"))
    : 30;

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceIso = since.toISOString();

  const rows: EventRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 80000; from += pageSize) {
    const { data, error } = await auth.db
      .from("analytics_events")
      .select(
        "occurred_at, event_name, path, title, referrer, host, visitor_id, user_id, article_id, article_slug"
      )
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const chunk = (data || []) as EventRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  const visitors = new Set<string>();
  const signedIn = new Set<string>();
  const pageViewsByPath = new Map<string, number>();
  const pathLabels = new Map<string, string>();
  const articleReads = new Map<string, number>();
  const articleLabels = new Map<string, string>();
  const articleUniques = new Map<string, Set<string>>();
  const hosts = new Map<string, number>();
  const referrers = new Map<string, number>();
  const byDay = new Map<string, { views: number; uniques: Set<string> }>();

  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { views: 0, uniques: new Set() });
  }

  for (const row of rows) {
    const day = row.occurred_at.slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) {
      bucket.views += 1;
      if (row.visitor_id) bucket.uniques.add(row.visitor_id);
    }
    if (row.visitor_id) visitors.add(row.visitor_id);
    if (row.user_id) signedIn.add(row.user_id);
    countMap(pageViewsByPath, row.path);
    if (row.title && !pathLabels.has(row.path)) pathLabels.set(row.path, row.title);
    if (row.host) countMap(hosts, row.host);
    const ref = referrerHost(row.referrer, row.host);
    if (ref) countMap(referrers, ref);

    if (row.event_name === ANALYTICS_EVENT_ARTICLE_VIEW && row.article_id) {
      countMap(articleReads, row.article_id);
      const label = row.title || row.article_slug || row.path;
      if (!articleLabels.has(row.article_id)) {
        articleLabels.set(row.article_id, label);
      }
      if (row.visitor_id) {
        const set = articleUniques.get(row.article_id) || new Set<string>();
        set.add(row.visitor_id);
        articleUniques.set(row.article_id, set);
      }
    }
  }

  const articleReadCount = [...articleReads.values()].reduce((a, b) => a + b, 0);

  return NextResponse.json({
    range: days,
    since: sinceIso,
    totals: {
      pageViews: rows.length,
      uniqueVisitors: visitors.size,
      signedInUsers: signedIn.size,
      articleReads: articleReadCount,
      uniqueArticleReaders: new Set(
        [...articleUniques.values()].flatMap((set) => [...set])
      ).size,
    },
    series: [...byDay.entries()].map(([date, value]) => ({
      date,
      views: value.views,
      uniques: value.uniques.size,
    })),
    topPages: topFromCount(pageViewsByPath, pathLabels),
    topArticles: topFromCount(articleReads, articleLabels).map((row) => ({
      ...row,
      uniques: articleUniques.get(row.key)?.size || 0,
    })),
    hosts: topFromCount(hosts, undefined, 8),
    referrers: topFromCount(referrers, undefined, 10),
  });
}
