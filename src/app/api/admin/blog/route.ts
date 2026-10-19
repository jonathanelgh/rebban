import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  blocksToJson,
  mapBlogPostRow,
  parseBlogPostBody,
} from "@/lib/blog/posts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim() || "";

  let query = auth.db
    .from("blog_posts")
    .select(
      "id, slug, title, description, excerpt, category, author, published_at, updated_at, reading_minutes, tags, featured, content, status, created_at, modified_at, cover_image, cover_image_alt"
    )
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (status === "draft" || status === "published") {
    query = query.eq("status", status);
  }
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,slug.ilike.%${q}%,category.ilike.%${q}%,excerpt.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    posts: (data || []).map(mapBlogPostRow),
  });
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = parseBlogPostBody(await request.json().catch(() => null));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await auth.db
    .from("blog_posts")
    .insert({
      title: parsed.title,
      slug: parsed.slug,
      description: parsed.description,
      excerpt: parsed.excerpt,
      category: parsed.category,
      author: parsed.author,
      published_at: parsed.publishedAt,
      updated_at: parsed.status === "published" ? parsed.publishedAt : null,
      reading_minutes: parsed.readingMinutes,
      tags: parsed.tags,
      featured: parsed.featured,
      content: blocksToJson(parsed.content),
      status: parsed.status,
      cover_image: parsed.coverImage,
      cover_image_alt: parsed.coverImageAlt,
      created_at: now,
      modified_at: now,
    })
    .select(
      "id, slug, title, description, excerpt, category, author, published_at, updated_at, reading_minutes, tags, featured, content, status, created_at, modified_at, cover_image, cover_image_alt"
    )
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "A post with that slug already exists."
            : error.message,
      },
      { status }
    );
  }

  return NextResponse.json({ post: mapBlogPostRow(data) }, { status: 201 });
}
