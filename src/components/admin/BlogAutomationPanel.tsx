"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Newspaper, Play, RefreshCw } from "lucide-react";

type Settings = {
  id: number;
  enabled: boolean;
  posts_per_day: number;
  publish_times: string[];
  timezone: string;
  author: string;
  topic_batch_size: number;
  last_run_at: string | null;
  last_error: string | null;
};

type Topic = {
  id: string;
  title: string;
  angle: string;
  category: string;
  target_keyword: string;
  status: string;
  priority: number;
  blog_post_id: string | null;
  error: string | null;
  created_at: string;
};

type Run = {
  id: string;
  slot_date: string;
  slot_time: string;
  status: string;
  error: string | null;
  created_at: string;
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: string) {
  switch (status) {
    case "queued":
      return "bg-amber-50 text-amber-800";
    case "writing":
      return "bg-blue-50 text-blue-700";
    case "published":
      return "bg-emerald-50 text-emerald-700";
    case "failed":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function BlogAutomationPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [counts, setCounts] = useState({
    queued: 0,
    published: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/blog-automation");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load blog automation.");
      setLoading(false);
      return;
    }
    setSettings(json.settings as Settings);
    setTopics((json.topics || []) as Topic[]);
    setRuns((json.recentRuns || []) as Run[]);
    setCounts(json.counts || { queued: 0, published: 0, failed: 0 });
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!settings) return;
    setBusy("save");
    setNotice(null);
    setError(null);
    const res = await fetch("/api/admin/blog-automation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: settings.enabled,
        postsPerDay: settings.posts_per_day,
        publishTimes: settings.publish_times,
        timezone: settings.timezone,
        author: settings.author,
        topicBatchSize: settings.topic_batch_size,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(json.error || "Could not save settings.");
      return;
    }
    setSettings(json.settings as Settings);
    setNotice("Settings saved.");
  }

  async function runAction(
    action: "refill_topics" | "publish_now" | "backfill_covers",
    topicId?: string
  ) {
    setBusy(action + (topicId || ""));
    setNotice(null);
    setError(null);
    const res = await fetch("/api/admin/blog-automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        topicId,
        count: action === "backfill_covers" ? 20 : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok || json.ok === false) {
      setError(json.error || "Action failed.");
      return;
    }
    if (action === "refill_topics") {
      setNotice(`Generated ${json.generated || 0} topics.`);
    } else if (action === "backfill_covers") {
      setNotice(
        `Cover backfill: ${json.filled || 0} filled, ${json.failed || 0} failed.`
      );
    } else {
      setNotice("Publish run finished.");
    }
    await load();
  }

  function setPublishTime(index: number, value: string) {
    setSettings((prev) => {
      if (!prev) return prev;
      const times = [...(prev.publish_times || [])];
      times[index] = value;
      return { ...prev, publish_times: times };
    });
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading…</p>;
  }

  if (!settings) {
    return (
      <p className="text-sm text-red-600">
        {error || "Blog automation settings unavailable."}
      </p>
    );
  }

  const timeSlots = Array.from(
    { length: Math.max(1, settings.posts_per_day) },
    (_, i) => settings.publish_times[i] || (i === 0 ? "08:30" : "17:30")
  );

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
          {notice}
        </p>
      )}

      <div className="rounded-2xl border border-line bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-gray-900">
              Auto publishing
            </h3>
            <p className="text-[13px] text-gray-500 mt-1">
              AI researches topics, writes freelancer-focused posts, generates
              covers, and publishes on your schedule.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-[13px] font-medium text-gray-800 shrink-0">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                setSettings((prev) =>
                  prev ? { ...prev, enabled: e.target.checked } : prev
                )
              }
              className="rounded border-line"
            />
            Enabled
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
              Posts per day
            </span>
            <select
              value={settings.posts_per_day}
              onChange={(e) => {
                const postsPerDay = Number(e.target.value);
                setSettings((prev) => {
                  if (!prev) return prev;
                  const publish_times = Array.from(
                    { length: postsPerDay },
                    (_, i) =>
                      prev.publish_times[i] || (i === 0 ? "08:30" : "17:30")
                  );
                  return { ...prev, posts_per_day: postsPerDay, publish_times };
                });
              }}
              className="w-full border border-line rounded-xl px-3 py-2.5 text-sm bg-white"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
              Timezone
            </span>
            <input
              value={settings.timezone}
              onChange={(e) =>
                setSettings((prev) =>
                  prev ? { ...prev, timezone: e.target.value } : prev
                )
              }
              className="w-full border border-line rounded-xl px-3 py-2.5 text-sm"
              placeholder="Europe/Stockholm"
            />
          </label>

          {timeSlots.map((time, index) => (
            <label key={index} className="block">
              <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Publish time {index + 1}
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setPublishTime(index, e.target.value)}
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm"
              />
            </label>
          ))}

          <label className="block">
            <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
              Author name
            </span>
            <input
              value={settings.author}
              onChange={(e) =>
                setSettings((prev) =>
                  prev ? { ...prev, author: e.target.value } : prev
                )
              }
              className="w-full border border-line rounded-xl px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
              Topic refill batch
            </span>
            <input
              type="number"
              min={10}
              max={120}
              value={settings.topic_batch_size}
              onChange={(e) =>
                setSettings((prev) =>
                  prev
                    ? {
                        ...prev,
                        topic_batch_size: Number(e.target.value) || 60,
                      }
                    : prev
                )
              }
              className="w-full border border-line rounded-xl px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void save()}
            className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Save settings"}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runAction("refill_topics")}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "refill_topics" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Generate topics
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runAction("publish_now")}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "publish_now" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Publish one now
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runAction("backfill_covers")}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "backfill_covers" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Newspaper className="w-4 h-4" />
            )}
            Backfill missing covers
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
          <Stat label="Queued" value={counts.queued} />
          <Stat label="Published topics" value={counts.published} />
          <Stat label="Failed" value={counts.failed} />
          <div className="rounded-xl border border-line bg-[#FAFBFC] px-3 py-2.5">
            <div className="text-[11px] text-gray-400 font-medium">Last run</div>
            <div className="text-[13px] font-medium text-gray-900 mt-0.5">
              {formatWhen(settings.last_run_at)}
            </div>
          </div>
        </div>
        {settings.last_error && (
          <p className="text-[12px] text-red-600">
            Last error: {settings.last_error}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-gray-900">Topics</h3>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Queue empties into articles. When empty, automation generates a
              fresh batch first.
            </p>
          </div>
          <Link
            href="/admin/blog"
            className="text-[13px] font-medium text-[#2563EB] inline-flex items-center gap-1"
          >
            <Newspaper className="w-3.5 h-3.5" />
            Articles
          </Link>
        </div>
        {topics.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">
            No topics yet. Click Generate topics.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead className="bg-[#FAFBFC] border-b border-line text-[12px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Topic</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topics.map((topic) => (
                  <tr key={topic.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {topic.title}
                      </div>
                      <div className="text-[12px] text-gray-400 mt-0.5">
                        {topic.target_keyword || topic.angle || "—"}
                      </div>
                      {topic.error && (
                        <div className="text-[11px] text-red-600 mt-1">
                          {topic.error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{topic.category}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium capitalize ${statusTone(topic.status)}`}
                      >
                        {topic.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatWhen(topic.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {(topic.status === "queued" ||
                        topic.status === "failed") && (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void runAction("publish_now", topic.id)
                          }
                          className="text-[12px] font-medium text-[#2563EB] hover:text-[#1d4ed8] disabled:opacity-50"
                        >
                          Write now
                        </button>
                      )}
                      {topic.blog_post_id && (
                        <Link
                          href={`/admin/blog/${topic.blog_post_id}`}
                          className="text-[12px] font-medium text-gray-500 hover:text-gray-800"
                        >
                          Open
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h3 className="text-[15px] font-semibold text-gray-900">
            Recent runs
          </h3>
        </div>
        {runs.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">No automation runs yet.</div>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => (
              <li
                key={run.id}
                className="px-5 py-3 flex items-start justify-between gap-3 text-[13px]"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    {run.slot_date} · {run.slot_time}
                  </div>
                  {run.error && (
                    <div className="text-[12px] text-red-600 mt-0.5">
                      {run.error}
                    </div>
                  )}
                </div>
                <span
                  className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium capitalize ${statusTone(run.status)}`}
                >
                  {run.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-[#FAFBFC] px-3 py-2.5">
      <div className="text-[11px] text-gray-400 font-medium">{label}</div>
      <div className="text-[18px] font-semibold text-gray-900 tabular-nums mt-0.5">
        {value}
      </div>
    </div>
  );
}
