"use client";

import React, { useEffect, useState } from "react";

type Ranked = { key: string; label: string; count: number; uniques?: number };

type AnalyticsPayload = {
  range: number;
  totals: {
    pageViews: number;
    uniqueVisitors: number;
    signedInUsers: number;
    articleReads: number;
    uniqueArticleReaders: number;
  };
  series: { date: string; views: number; uniques: number }[];
  topPages: Ranked[];
  topArticles: Ranked[];
  hosts: Ranked[];
  referrers: Ranked[];
};

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/admin/analytics?range=${range}`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error || "Could not load analytics.");
        setLoading(false);
        return;
      }
      setData(json as AnalyticsPayload);
      setError(null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const maxViews = Math.max(1, ...(data?.series.map((d) => d.views) || [1]));

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-6 pr-16 md:pr-28 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Analytics
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            First-party traffic for the app and rebban.com articles. Superadmin
            only.
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl border border-line bg-white shrink-0">
          {([7, 30, 90] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                range === value
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {value}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <Stat
          label="Page views"
          value={loading ? "—" : fmt(data?.totals.pageViews ?? 0)}
        />
        <Stat
          label="Unique visitors"
          value={loading ? "—" : fmt(data?.totals.uniqueVisitors ?? 0)}
          hint={
            loading
              ? undefined
              : `${fmt(data?.totals.signedInUsers ?? 0)} signed in`
          }
        />
        <Stat
          label="Article reads"
          value={loading ? "—" : fmt(data?.totals.articleReads ?? 0)}
        />
        <Stat
          label="Unique readers"
          value={loading ? "—" : fmt(data?.totals.uniqueArticleReaders ?? 0)}
        />
      </div>

      <section className="surface-panel p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Views over time
        </h2>
        {loading || !data?.series.length ? (
          <p className="text-[13px] text-gray-400">
            {loading ? "Loading…" : "No events yet."}
          </p>
        ) : (
          <div className="flex items-end gap-[3px] h-36">
            {data.series.map((point) => (
              <div
                key={point.date}
                className="flex-1 min-w-0 flex flex-col justify-end group relative"
                title={`${fmtDay(point.date)} · ${fmt(point.views)} views · ${fmt(point.uniques)} unique`}
              >
                <div
                  className="w-full rounded-t bg-gray-900/80 hover:bg-gray-900"
                  style={{
                    height: `${Math.max(4, (point.views / maxViews) * 100)}%`,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <RankList
          title="Top pages"
          empty="No page views yet."
          items={data?.topPages || []}
          loading={loading}
        />
        <RankList
          title="Article reads"
          empty="No article reads yet. Add the snippet on rebban.com to track /articles/…"
          items={data?.topArticles || []}
          loading={loading}
          extra={(item) =>
            item.uniques != null ? `${fmt(item.uniques)} unique` : undefined
          }
        />
        <RankList
          title="Hosts"
          empty="No hosts yet."
          items={data?.hosts || []}
          loading={loading}
        />
        <RankList
          title="External referrers"
          empty="No external referrers yet."
          items={data?.referrers || []}
          loading={loading}
        />
      </div>

      <section className="surface-panel p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">
          Track rebban.com
        </h2>
        <p className="text-[13px] text-gray-500 mb-3">
          App pages are tracked automatically. To count article reads on the
          marketing site, add this to rebban.com:
        </p>
        <pre className="text-[12px] bg-[#FAFBFC] border border-line rounded-xl px-3.5 py-3 overflow-x-auto text-gray-700">{`<script src="https://app.rebban.com/rebban-analytics.js" defer></script>`}</pre>
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="surface-panel p-4">
      <div className="text-[12px] uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="text-[12px] text-gray-400 mt-1">{hint}</div>
      ) : null}
    </div>
  );
}

function RankList({
  title,
  empty,
  items,
  loading,
  extra,
}: {
  title: string;
  empty: string;
  items: Ranked[];
  loading: boolean;
  extra?: (item: Ranked) => string | undefined;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className="surface-panel p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      {loading ? (
        <p className="text-[13px] text-gray-400">Loading…</p>
      ) : !items.length ? (
        <p className="text-[13px] text-gray-400">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-gray-800 truncate">{item.label}</span>
                <span className="text-gray-400 tabular-nums shrink-0">
                  {fmt(item.count)}
                  {extra?.(item) ? ` · ${extra(item)}` : ""}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gray-900/70"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
