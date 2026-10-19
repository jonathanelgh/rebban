import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  listBlogCategories,
  mapBlogCategoryRow,
  resolveBlogCategory,
} from "@/lib/blog/categories";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const categories = await listBlogCategories(auth.db);
    return NextResponse.json({ categories });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load categories." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
  };
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  try {
    const category = await resolveBlogCategory(auth.db, { category: name });
    if (body.description != null) {
      const { data, error } = await auth.db
        .from("blog_categories")
        .update({
          description: String(body.description || "").trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", category.id)
        .select("id, name, slug, description, sort_order")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json(
        { category: mapBlogCategoryRow(data) },
        { status: 201 }
      );
    }
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create category." },
      { status: 500 }
    );
  }
}
