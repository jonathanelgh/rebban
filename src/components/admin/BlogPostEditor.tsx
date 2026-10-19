"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  estimateReadingMinutes,
  slugifyTitle,
  type BlogBlock,
} from "@/lib/blog/posts";

export type BlogEditorPost = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  excerpt: string;
  category: string;
  author: string;
  publishedAt: string;
  readingMinutes: number;
  tags: string[];
  featured: boolean;
  status: "draft" | "published";
  coverImage: string | null;
  coverImageAlt: string | null;
  content: BlogBlock[];
};

const emptyPost = (): BlogEditorPost => ({
  title: "",
  slug: "",
  description: "",
  excerpt: "",
  category: "",
  author: "Rebban",
  publishedAt: new Date().toISOString().slice(0, 10),
  readingMinutes: 5,
  tags: [],
  featured: false,
  status: "draft",
  coverImage: null,
  coverImageAlt: null,
  content: [{ type: "p", text: "" }],
});

function newBlock(type: BlogBlock["type"]): BlogBlock {
  if (type === "ul" || type === "ol") return { type, items: [""] };
  return { type, text: "" };
}

function blockPlainText(block: BlogBlock) {
  if ("items" in block) return block.items.join("\n");
  return block.text;
}

function blockItemsFromText(text: string) {
  const items = text.split("\n");
  return items.length ? items : [""];
}

export function BlogPostEditor({
  initial,
  mode,
}: {
  initial?: BlogEditorPost | null;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [post, setPost] = useState<BlogEditorPost>(initial || emptyPost());
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [tagsText, setTagsText] = useState((initial?.tags || []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoMinutes = useMemo(
    () => estimateReadingMinutes(post.content),
    [post.content]
  );

  function updateBlock(index: number, next: BlogBlock) {
    setPost((prev) => ({
      ...prev,
      content: prev.content.map((block, i) => (i === index ? next : block)),
    }));
  }

  function removeBlock(index: number) {
    setPost((prev) => ({
      ...prev,
      content:
        prev.content.length <= 1
          ? prev.content
          : prev.content.filter((_, i) => i !== index),
    }));
  }

  function insertBlock(index: number, type: BlogBlock["type"]) {
    setPost((prev) => {
      const content = [...prev.content];
      content.splice(index + 1, 0, newBlock(type));
      return { ...prev, content };
    });
  }

  async function save(nextStatus?: "draft" | "published") {
    setBusy(true);
    setError(null);
    const status = nextStatus || post.status;
    const payload = {
      ...post,
      status,
      tagsText,
      readingMinutes: post.readingMinutes || autoMinutes,
      slug: post.slug || slugifyTitle(post.title),
    };

    const res = await fetch(
      mode === "create" ? "/api/admin/blog" : `/api/admin/blog/${post.id}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not save article.");
      return;
    }

    if (mode === "create" && json.post?.id) {
      router.replace(`/admin/blog/${json.post.id}`);
      return;
    }
    setPost((prev) => ({
      ...prev,
      ...(json.post || {}),
      content: json.post?.content || prev.content,
    }));
  }

  async function remove() {
    if (!post.id) return;
    if (!window.confirm("Delete this article permanently?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/blog/${post.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not delete article.");
      return;
    }
    router.push("/admin/blog");
  }

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-10 max-w-5xl mx-auto relative">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/admin/blog"
            className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Articles
          </Link>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            {mode === "create" ? "New article" : "Edit article"}
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Write for the Rebban blog. Published posts are public.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {mode === "edit" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save("draft")}
            className="inline-flex items-center justify-center rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save("published")}
            className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Publish"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
        <div className="space-y-4 min-w-0">
          <label className="block">
            <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
              Title
            </span>
            <input
              value={post.title}
              onChange={(e) => {
                const title = e.target.value;
                setPost((prev) => ({
                  ...prev,
                  title,
                  slug: slugTouched ? prev.slug : slugifyTitle(title),
                }));
              }}
              className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
              placeholder="Article title"
            />
          </label>

          <label className="block">
            <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
              Slug
            </span>
            <input
              value={post.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setPost((prev) => ({
                  ...prev,
                  slug: slugifyTitle(e.target.value.replace(/-/g, " ")),
                }));
              }}
              className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none focus:border-gray-300"
              placeholder="article-slug"
            />
          </label>

          <label className="block">
            <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
              Description
            </span>
            <textarea
              value={post.description}
              onChange={(e) =>
                setPost((prev) => ({ ...prev, description: e.target.value }))
              }
              rows={2}
              className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300 resize-y"
              placeholder="SEO / meta description"
            />
          </label>

          <label className="block">
            <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
              Excerpt
            </span>
            <textarea
              value={post.excerpt}
              onChange={(e) =>
                setPost((prev) => ({ ...prev, excerpt: e.target.value }))
              }
              rows={2}
              className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300 resize-y"
              placeholder="Short preview on listing cards"
            />
          </label>

          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[12px] font-medium text-gray-500">
                Content
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["p", "Paragraph"],
                    ["h2", "Heading"],
                    ["quote", "Quote"],
                    ["ul", "Bullets"],
                    ["ol", "Numbers"],
                  ] as const
                ).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      insertBlock(post.content.length - 1, type)
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <Plus className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {post.content.map((block, index) => (
                <div
                  key={`${index}-${block.type}`}
                  className="rounded-2xl border border-line bg-white p-3.5"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="inline-flex items-center gap-2 text-[12px] text-gray-400">
                      <GripVertical className="w-3.5 h-3.5" />
                      <select
                        value={block.type}
                        onChange={(e) => {
                          const type = e.target.value as BlogBlock["type"];
                          const plain = blockPlainText(block);
                          if (type === "ul" || type === "ol") {
                            updateBlock(index, {
                              type,
                              items: blockItemsFromText(plain),
                            });
                            return;
                          }
                          updateBlock(index, { type, text: plain });
                        }}
                        className="border border-line rounded-lg px-2 py-1 text-[12px] text-gray-700 bg-white"
                      >
                        <option value="p">Paragraph</option>
                        <option value="h2">Heading</option>
                        <option value="quote">Quote</option>
                        <option value="ul">Bullet list</option>
                        <option value="ol">Numbered list</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBlock(index)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                      aria-label="Remove block"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {block.type === "ul" || block.type === "ol" ? (
                    <textarea
                      value={block.items.join("\n")}
                      onChange={(e) =>
                        updateBlock(index, {
                          type: block.type,
                          items: e.target.value.split("\n"),
                        })
                      }
                      rows={4}
                      className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 resize-y"
                      placeholder="One item per line"
                    />
                  ) : (
                    <textarea
                      value={blockPlainText(block)}
                      onChange={(e) =>
                        updateBlock(index, {
                          type: block.type as "p" | "h2" | "quote",
                          text: e.target.value,
                        })
                      }
                      rows={block.type === "h2" ? 2 : 4}
                      className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 resize-y"
                      placeholder={
                        block.type === "h2"
                          ? "Heading"
                          : block.type === "quote"
                            ? "Quote"
                            : "Paragraph — markdown links like [text](/path) are fine"
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 self-start">
          <div className="rounded-2xl border border-line bg-[#FAFBFC] p-4 space-y-3">
            <label className="block">
              <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Status
              </span>
              <select
                value={post.status}
                onChange={(e) =>
                  setPost((prev) => ({
                    ...prev,
                    status: e.target.value === "published" ? "published" : "draft",
                  }))
                }
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Category
              </span>
              <input
                value={post.category}
                onChange={(e) =>
                  setPost((prev) => ({ ...prev, category: e.target.value }))
                }
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
                placeholder="Founder story"
              />
            </label>

            <label className="block">
              <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Author
              </span>
              <input
                value={post.author}
                onChange={(e) =>
                  setPost((prev) => ({ ...prev, author: e.target.value }))
                }
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
              />
            </label>

            <label className="block">
              <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Published date
              </span>
              <input
                type="date"
                value={post.publishedAt.slice(0, 10)}
                onChange={(e) =>
                  setPost((prev) => ({ ...prev, publishedAt: e.target.value }))
                }
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
              />
            </label>

            <label className="block">
              <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Reading minutes
              </span>
              <input
                type="number"
                min={1}
                value={post.readingMinutes}
                onChange={(e) =>
                  setPost((prev) => ({
                    ...prev,
                    readingMinutes: Number(e.target.value) || autoMinutes,
                  }))
                }
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
              />
              <span className="mt-1 block text-[11px] text-gray-400">
                Auto estimate: {autoMinutes} min
              </span>
            </label>

            <label className="block">
              <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Tags
              </span>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
                placeholder="freelance, billing"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-[13px] text-gray-700">
              <input
                type="checkbox"
                checked={post.featured}
                onChange={(e) =>
                  setPost((prev) => ({ ...prev, featured: e.target.checked }))
                }
                className="rounded border-line"
              />
              Featured
            </label>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4 space-y-3">
            <label className="block">
              <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Cover image URL
              </span>
              <input
                value={post.coverImage || ""}
                onChange={(e) =>
                  setPost((prev) => ({
                    ...prev,
                    coverImage: e.target.value.trim() || null,
                  }))
                }
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none"
                placeholder="https://…"
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Cover alt text
              </span>
              <input
                value={post.coverImageAlt || ""}
                onChange={(e) =>
                  setPost((prev) => ({
                    ...prev,
                    coverImageAlt: e.target.value.trim() || null,
                  }))
                }
                className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            </label>
          </div>
        </aside>
      </div>
    </main>
  );
}
