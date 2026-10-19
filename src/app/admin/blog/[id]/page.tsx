"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BlogPostEditor,
  type BlogEditorPost,
} from "@/components/admin/BlogPostEditor";

export default function AdminBlogEditPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [post, setPost] = useState<BlogEditorPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/admin/blog/${id}`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error || "Could not load article.");
        setLoading(false);
        return;
      }
      setPost(json.post as BlogEditorPost);
      setError(null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-5xl mx-auto">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  if (error || !post) {
    return (
      <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-5xl mx-auto">
        <p className="text-sm text-red-600 mb-3">{error || "Not found"}</p>
        <Link href="/admin/blog" className="text-[13px] text-[#2563EB]">
          Back to articles
        </Link>
      </main>
    );
  }

  return <BlogPostEditor mode="edit" initial={post} />;
}
