import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { resolveBlogCategory } from "@/lib/blog/categories";
import {
  BLOG_POST_SELECT,
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
    .select(BLOG_POST_SELECT)
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (status === "draft" || status === "published") {
    query = query.eq("status", status);
  }
  if (q) {
    const { data: cats } = await auth.db
      .from("blog_categories")
      .select("id")
      .ilike("name", `%${q.replace(/[%_]/g, "\\$&")}%`);
    const catIds = (cats || []).map((c) => c.id);
    const parts = [
      `title.ilike.%${q}%`,
      `slug.ilike.%${q}%`,
      `excerpt.ilike.%${q}%`,
    ];
    if (catIds.length) {
      parts.push(`category_id.in.(${catIds.join(",")})`);
    }
    query = query.or(parts.join(","));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const posts = (data || []).map(mapBlogPostRow);
  const readsById: Record<string, number> = {};
  await Promise.all(
    posts.map(async (post) => {
      const { count } = await auth.db
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("article_id", post.id)
        .eq("event_name", "article_view");
      readsById[post.id] = count || 0;
    })
  );

  return NextResponse.json({
    posts: posts.map((post) => ({
      ...post,
      reads: readsById[post.id] || 0,
    })),
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

  try {
    const category = await resolveBlogCategory(auth.db, {
      categoryId: parsed.categoryId,
      category: parsed.category,
    });

    const now = new Date().toISOString();
    const { data, error } = await auth.db
      .from("blog_posts")
      .insert({
        title: parsed.title,
        slug: parsed.slug,
        description: parsed.description,
        excerpt: parsed.excerpt,
        category_id: category.id,
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
      .select(BLOG_POST_SELECT)
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
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create post." },
      { status: 500 }
    );
  }
}
