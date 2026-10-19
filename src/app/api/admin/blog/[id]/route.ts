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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const { data, error } = await auth.db
    .from("blog_posts")
    .select(BLOG_POST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ post: mapBlogPostRow(data) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
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
      .update({
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
        modified_at: now,
      })
      .eq("id", id)
      .select(BLOG_POST_SELECT)
      .maybeSingle();

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
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ post: mapBlogPostRow(data) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update post." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const { error } = await auth.db.from("blog_posts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
