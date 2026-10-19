"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";

type BlogListPost = {
  id: string;
  title: string;
  slug: string;
  category: string;
  author: string;
  status: "draft" | "published";
  featured: boolean;
  publishedAt: string;
  modifiedAt: string;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusTone(status: string) {
  return status === "published"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-amber-50 text-amber-800";
}

export default function AdminBlogPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogListPost[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "published">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    const res = await fetch(`/api/admin/blog?${params.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load articles.");
      setLoading(false);
      return;
    }
    setPosts((json.posts || []) as BlogListPost[]);
    setError(null);
    setLoading(false);
  }, [q, status]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (!cancelled) void load();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [load]);

  async function removePost(id: string, title: string) {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/blog/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(json.error || "Could not delete article.");
      return;
    }
    void load();
  }

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pr-16 md:pr-28">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Articles
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Create and edit blog posts for rebban.com.
          </p>
        </div>
        <Link
          href="/admin/blog/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" />
          New article
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <label className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, slug, category…"
            className="w-full border border-line rounded-xl pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-gray-300 bg-white"
          />
        </label>
        <div className="flex gap-1 p-1 rounded-xl border border-line bg-white shrink-0">
          {(
            [
              ["all", "All"],
              ["published", "Published"],
              ["draft", "Drafts"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                status === value
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="surface-panel overflow-hidden">
        {loading ? (
          <div className="p-5 text-sm text-gray-400">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">No articles yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead className="bg-[#FAFBFC] border-b border-line text-[12px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Published</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    onClick={() => router.push(`/admin/blog/${post.id}`)}
                    className="hover:bg-gray-50/80 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {post.title}
                      </div>
                      <div className="text-[12px] text-gray-400 font-mono mt-0.5">
                        /{post.slug}
                        {post.featured ? " · featured" : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{post.category}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium capitalize ${statusTone(post.status)}`}
                      >
                        {post.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(post.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(post.modifiedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyId === post.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void removePost(post.id, post.title);
                        }}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                        aria-label="Delete article"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
