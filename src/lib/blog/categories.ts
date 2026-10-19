import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { slugifyTitle } from "@/lib/blog/posts";

type Db = SupabaseClient<Database>;

export type BlogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
};

export function mapBlogCategoryRow(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
}): BlogCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

export async function listBlogCategories(db: Db) {
  const { data, error } = await db
    .from("blog_categories")
    .select("id, name, slug, description, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(mapBlogCategoryRow);
}

/** Find by id or name/slug; create a new category when given a new name. */
export async function resolveBlogCategory(
  db: Db,
  input: { categoryId?: string | null; category?: string | null }
) {
  const categoryId = String(input.categoryId || "").trim();
  if (categoryId) {
    const { data, error } = await db
      .from("blog_categories")
      .select("id, name, slug, description, sort_order")
      .eq("id", categoryId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return mapBlogCategoryRow(data);
  }

  const name = String(input.category || "")
    .replace(/[—–]/g, "-")
    .trim();
  if (!name) {
    throw new Error("Category is required.");
  }

  const slug = slugifyTitle(name);
  if (!slug) throw new Error("Category is required.");

  const { data: bySlug, error: slugError } = await db
    .from("blog_categories")
    .select("id, name, slug, description, sort_order")
    .eq("slug", slug)
    .maybeSingle();

  if (slugError) throw new Error(slugError.message);
  if (bySlug) return mapBlogCategoryRow(bySlug);

  const { data: byName, error: nameError } = await db
    .from("blog_categories")
    .select("id, name, slug, description, sort_order")
    .ilike("name", name.replace(/[%_]/g, "\\$&"))
    .limit(1)
    .maybeSingle();

  if (nameError) throw new Error(nameError.message);
  if (byName) return mapBlogCategoryRow(byName);

  const { data: created, error: createError } = await db
    .from("blog_categories")
    .insert({
      name,
      slug,
      sort_order: 100,
    })
    .select("id, name, slug, description, sort_order")
    .single();

  if (createError) {
    // Race: another insert won — re-fetch.
    if (createError.code === "23505") {
      const { data: raced, error: raceError } = await db
        .from("blog_categories")
        .select("id, name, slug, description, sort_order")
        .eq("slug", slug)
        .maybeSingle();
      if (raceError) throw new Error(raceError.message);
      if (raced) return mapBlogCategoryRow(raced);
    }
    throw new Error(createError.message);
  }

  return mapBlogCategoryRow(created);
}
