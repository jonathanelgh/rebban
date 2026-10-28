import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBlogImageModel,
  getOpenAiApiKey,
} from "@/lib/blog/automation/openai";

type Db = SupabaseClient<Database>;

const BUCKET = "blog-covers";

async function requestCoverImage(options: {
  apiKey: string;
  model: string;
  prompt: string;
}) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      prompt: `${options.prompt}\n\nStyle: modern editorial illustration for a SaaS blog, soft gradients, abstract shapes suggesting freelance work and calm focus. No text, no watermark, no logos, no faces of real people.`,
      size: "1536x1024",
      quality: "high",
      output_format: "png",
    }),
  });

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(
      json.error?.message || `Image generation failed (${res.status}).`
    );
  }

  const item = json.data?.[0];
  if (item?.b64_json) {
    return {
      bytes: Buffer.from(item.b64_json, "base64"),
      contentType: "image/png",
    };
  }
  if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) {
      throw new Error(`Could not download generated image (${imgRes.status}).`);
    }
    return {
      bytes: Buffer.from(await imgRes.arrayBuffer()),
      contentType: imgRes.headers.get("content-type") || "image/png",
    };
  }

  throw new Error("Image generation returned no image data.");
}

export async function generateAndUploadCover(options: {
  db?: Db;
  prompt: string;
  slug: string;
}) {
  const apiKey = getOpenAiApiKey();
  const preferred = getBlogImageModel();
  // gpt-image-1 was shut down 2026-10-23; keep a short fallback chain.
  const models = Array.from(
    new Set([preferred, "gpt-image-2", "gpt-image-1.5"].filter(Boolean))
  );

  let lastError = "Image generation failed.";
  let image: { bytes: Buffer; contentType: string } | null = null;
  let usedModel = preferred;

  for (const model of models) {
    try {
      image = await requestCoverImage({
        apiKey,
        model,
        prompt: options.prompt,
      });
      usedModel = model;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
      console.error("[blog-automation] cover model failed", {
        model,
        error: lastError,
      });
    }
  }

  if (!image) throw new Error(lastError);

  const ext = image.contentType.includes("jpeg")
    ? "jpg"
    : image.contentType.includes("webp")
      ? "webp"
      : "png";
  const path = `${options.slug}-${Date.now().toString(36)}.${ext}`;

  // Always upload with the service role so cron and user-admin paths both work.
  const storage = createAdminClient();
  const { error: uploadError } = await storage.storage
    .from(BUCKET)
    .upload(path, image.bytes, {
      contentType: image.contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Cover upload failed.");
  }

  const { data } = storage.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    alt: `Cover illustration for ${options.slug.replace(/-/g, " ")}`,
    model: usedModel,
  };
}

/** Regenerate covers for published posts that are missing one. */
export async function backfillMissingBlogCovers(options?: {
  db?: Db;
  limit?: number;
}) {
  const db = options?.db || createAdminClient();
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 50));

  const { data: posts, error } = await db
    .from("blog_posts")
    .select("id, slug, title, cover_image")
    .or('cover_image.is.null,cover_image.eq.""')
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const results: Array<{
    id: string;
    slug: string;
    ok: boolean;
    coverImage?: string;
    error?: string;
  }> = [];

  for (const post of posts || []) {
    if (post.cover_image) {
      results.push({ id: post.id, slug: post.slug, ok: true });
      continue;
    }
    try {
      const cover = await generateAndUploadCover({
        db,
        slug: post.slug,
        prompt: `Editorial abstract illustration for a freelance business article titled "${post.title}". Soft shapes, calm professional palette, no text, no logos.`,
      });
      const { error: updateError } = await db
        .from("blog_posts")
        .update({
          cover_image: cover.url,
          cover_image_alt: cover.alt,
          modified_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      if (updateError) throw new Error(updateError.message);
      results.push({
        id: post.id,
        slug: post.slug,
        ok: true,
        coverImage: cover.url,
      });
    } catch (err) {
      results.push({
        id: post.id,
        slug: post.slug,
        ok: false,
        error: err instanceof Error ? err.message : "Cover backfill failed.",
      });
    }
  }

  return {
    attempted: results.length,
    filled: results.filter((r) => r.ok && r.coverImage).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
