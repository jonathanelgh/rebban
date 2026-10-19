import type { Json } from "@/types/database";

export type BlogBlock =
  | { type: "p" | "h2" | "quote"; text: string }
  | { type: "ul" | "ol"; items: string[] };

export type BlogPostInput = {
  title: string;
  slug: string;
  description: string;
  excerpt: string;
  category: string;
  categoryId: string | null;
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

export function slugifyTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function asBlogBlocks(value: unknown): BlogBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: BlogBlock[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const type = String(row.type || "");
    if (type === "p" || type === "h2" || type === "quote") {
      blocks.push({ type, text: String(row.text || "") });
      continue;
    }
    if (type === "ul" || type === "ol") {
      const items = Array.isArray(row.items)
        ? row.items.map((item) => String(item || "")).filter(Boolean)
        : [];
      blocks.push({ type, items });
    }
  }
  return blocks;
}

export function blocksToJson(blocks: BlogBlock[]): Json {
  return blocks as unknown as Json;
}

export function estimateReadingMinutes(blocks: BlogBlock[]) {
  const words = blocks.reduce((sum, block) => {
    if (block.type === "ul" || block.type === "ol") {
      return (
        sum +
        block.items.reduce(
          (inner, item) => inner + item.trim().split(/\s+/).filter(Boolean).length,
          0
        )
      );
    }
    if (block.type === "p" || block.type === "h2" || block.type === "quote") {
      return sum + block.text.trim().split(/\s+/).filter(Boolean).length;
    }
    return sum;
  }, 0);
  return Math.max(1, Math.ceil(words / 200));
}

export function parseBlogPostBody(body: unknown): BlogPostInput | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid body." };
  }
  const raw = body as Record<string, unknown>;
  const title = String(raw.title || "").trim();
  if (!title) return { error: "Title is required." };

  const slugRaw = String(raw.slug || "").trim() || slugifyTitle(title);
  const slug = slugifyTitle(slugRaw.replace(/-/g, " "));
  if (!slug) return { error: "Slug is required." };

  const description = String(raw.description || "").trim();
  const excerpt = String(raw.excerpt || "").trim();
  const category = String(raw.category || "").trim();
  const categoryId = String(raw.categoryId || raw.category_id || "").trim() || null;
  if (!description) return { error: "Description is required." };
  if (!excerpt) return { error: "Excerpt is required." };
  if (!category && !categoryId) return { error: "Category is required." };

  const statusRaw = String(raw.status || "draft");
  const status = statusRaw === "published" ? "published" : "draft";

  const content = asBlogBlocks(raw.content);
  if (content.length === 0) {
    return { error: "Add at least one content block." };
  }

  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
    : String(raw.tagsText || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

  const publishedAtRaw = String(raw.publishedAt || "").trim();
  const publishedAt =
    publishedAtRaw || new Date().toISOString().slice(0, 10);

  const readingMinutesRaw = Number(raw.readingMinutes);
  const readingMinutes =
    Number.isFinite(readingMinutesRaw) && readingMinutesRaw > 0
      ? Math.round(readingMinutesRaw)
      : estimateReadingMinutes(content);

  return {
    title,
    slug,
    description,
    excerpt,
    category,
    categoryId,
    author: String(raw.author || "Rebban").trim() || "Rebban",
    publishedAt,
    readingMinutes,
    tags,
    featured: Boolean(raw.featured),
    status,
    coverImage: String(raw.coverImage || "").trim() || null,
    coverImageAlt: String(raw.coverImageAlt || "").trim() || null,
    content,
  };
}

export const BLOG_POST_SELECT =
  "id, slug, title, description, excerpt, category_id, author, published_at, updated_at, reading_minutes, tags, featured, content, status, created_at, modified_at, cover_image, cover_image_alt, blog_categories ( id, name, slug )";

export function mapBlogPostRow(row: {
  id: string;
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  category_id: string;
  author: string;
  published_at: string;
  updated_at: string | null;
  reading_minutes: number;
  tags: string[];
  featured: boolean;
  content: Json;
  status: string;
  created_at: string;
  modified_at: string;
  cover_image: string | null;
  cover_image_alt: string | null;
  blog_categories?:
    | { id: string; name: string; slug: string }
    | { id: string; name: string; slug: string }[]
    | null;
}) {
  const categoryRel = Array.isArray(row.blog_categories)
    ? row.blog_categories[0]
    : row.blog_categories;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    excerpt: row.excerpt,
    category: categoryRel?.name || "",
    categoryId: row.category_id,
    author: row.author,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    readingMinutes: row.reading_minutes,
    tags: row.tags || [],
    featured: row.featured,
    content: asBlogBlocks(row.content),
    status: row.status === "published" ? "published" : "draft",
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    coverImage: row.cover_image,
    coverImageAlt: row.cover_image_alt,
  } as const;
}
