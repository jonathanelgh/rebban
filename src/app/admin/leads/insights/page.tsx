"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Insights = {
  total: number;
  contacted: number;
  replies: number;
  replyRate: number;
  positiveReplyRate: number;
  hot: number;
  warm: number;
  cold: number;
  trialSignals: number;
  topTools: { name: string; count: number }[];
  topCompetitors: { name: string; count: number }[];
  topPainPoints: { name: string; count: number }[];
  topFeatureRequests: { name: string; count: number }[];
  topObjections: { name: string; count: number }[];
};

type Feed = {
  hotReplies: Array<{
    id: string;
    name: string;
    email: string;
    temperature_score: number | null;
  }>;
  repliesToReview: Array<{
    id: string;
    lead_id: string;
    name: string;
    score: number;
    temperature: string;
    summary: string | null;
  }>;
  followupsDue: Array<{
    id: string;
    lead_id: string;
    name: string;
    follow_up_number: number;
    subject: string | null;
  }>;
  sendQueue: Array<{ id: string; name: string; email: string }>;
  recentActivity: Array<{ id: string; leadId: string; text: string; createdAt: string }>;
};

export default function AdminLeadsInsightsPage() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch("/api/admin/leads/insights");
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error || "Could not load insights.");
        setLoading(false);
        return;
      }
      setInsights(json.insights as Insights);
      setFeed(json.feed as Feed);
      setError(null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-6 pr-16 md:pr-28 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Outreach insights
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Reply quality, tools, pain points, and what needs attention.
          </p>
        </div>
        <Link
          href="/admin/leads"
          className="text-[13px] font-medium text-[#2563EB]"
        >
          ← Back to leads
        </Link>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <Stat
          label="Contacted"
          value={loading ? "—" : String(insights?.contacted ?? 0)}
        />
        <Stat
          label="Reply rate"
          value={loading ? "—" : `${insights?.replyRate ?? 0}%`}
          hint={
            loading ? undefined : `${insights?.replies ?? 0} replies`
          }
        />
        <Stat
          label="Hot / Warm / Cold"
          value={
            loading
              ? "—"
              : `${insights?.hot ?? 0} / ${insights?.warm ?? 0} / ${insights?.cold ?? 0}`
          }
        />
        <Stat
          label="Positive reply rate"
          value={loading ? "—" : `${insights?.positiveReplyRate ?? 0}%`}
          hint={
            loading
              ? undefined
              : `${insights?.trialSignals ?? 0} trial signals`
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <ActionPanel title="Hot replies">
          {!feed?.hotReplies.length ? (
            <Empty />
          ) : (
            feed.hotReplies.map((l) => (
              <Row
                key={l.id}
                href={`/admin/leads/${l.id}`}
                title={l.name}
                meta={`${l.temperature_score ?? "—"}/100 · ${l.email}`}
              />
            ))
          )}
        </ActionPanel>
        <ActionPanel title="Replies to review">
          {!feed?.repliesToReview.length ? (
            <Empty />
          ) : (
            feed.repliesToReview.map((a) => (
              <Row
                key={a.id}
                href={`/admin/leads/${a.lead_id}`}
                title={a.name}
                meta={`${a.temperature.toUpperCase()} ${a.score} · ${a.summary || ""}`}
              />
            ))
          )}
        </ActionPanel>
        <ActionPanel title="Follow-ups due">
          {!feed?.followupsDue.length ? (
            <Empty />
          ) : (
            feed.followupsDue.map((f) => (
              <Row
                key={f.id}
                href={`/admin/leads/${f.lead_id}`}
                title={f.name}
                meta={`FU #${f.follow_up_number} · ${f.subject || ""}`}
              />
            ))
          )}
        </ActionPanel>
        <ActionPanel title="Send queue">
          {!feed?.sendQueue.length ? (
            <Empty />
          ) : (
            feed.sendQueue.map((l) => (
              <Row
                key={l.id}
                href={`/admin/leads/${l.id}`}
                title={l.name}
                meta={l.email}
              />
            ))
          )}
        </ActionPanel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
        <TopList title="Top tools" items={insights?.topTools || []} />
        <TopList
          title="Top competitors"
          items={insights?.topCompetitors || []}
        />
        <TopList title="Top pain points" items={insights?.topPainPoints || []} />
        <TopList
          title="Top feature requests"
          items={insights?.topFeatureRequests || []}
        />
        <TopList title="Top objections" items={insights?.topObjections || []} />
        <ActionPanel title="Recent activity">
          {!feed?.recentActivity.length ? (
            <Empty />
          ) : (
            feed.recentActivity.map((a) => (
              <Row
                key={a.id}
                href={`/admin/leads/${a.leadId}`}
                title={a.text}
                meta={new Date(a.createdAt).toLocaleString()}
              />
            ))
          )}
        </ActionPanel>
      </div>
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
    <div className="bg-white border border-line rounded-2xl p-5">
      <span className="text-xs font-medium text-gray-500 tracking-wide">
        {label}
      </span>
      <h3 className="text-2xl font-semibold tracking-tight mt-2 text-gray-900">
        {value}
      </h3>
      {hint ? <p className="text-[13px] text-gray-400 mt-1.5">{hint}</p> : null}
    </div>
  );
}

function ActionPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl px-3 py-2.5 hover:bg-[#FAFBFC] transition-colors"
    >
      <div className="text-[14px] font-medium text-gray-900 truncate">{title}</div>
      <div className="text-[12px] text-gray-400 truncate mt-0.5">{meta}</div>
    </Link>
  );
}

function Empty() {
  return <p className="text-[13px] text-gray-400 px-1 py-2">Nothing here yet.</p>;
}

function TopList({
  title,
  items,
}: {
  title: string;
  items: { name: string; count: number }[];
}) {
  return (
    <section className="surface-panel p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      {!items.length ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.name}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-gray-800 truncate">{item.name}</span>
              <span className="text-gray-400 tabular-nums">{item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
