import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getBlogImageModel,
  getOpenAiApiKey,
} from "@/lib/blog/automation/openai";

type Db = SupabaseClient<Database>;

const BUCKET = "blog-covers";

export async function generateAndUploadCover(options: {
  db: Db;
  prompt: string;
  slug: string;
}) {
  const apiKey = getOpenAiApiKey();
  const model = getBlogImageModel();

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: `${options.prompt}\n\nStyle: modern editorial illustration for a SaaS blog, soft gradients, abstract shapes suggesting freelance work and calm focus. No text, no watermark, no logos, no faces of real people.`,
      size: "1536x1024",
      quality: "high",
    }),
  });

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(json.error?.message || `Image generation failed (${res.status}).`);
  }

  const item = json.data?.[0];
  let bytes: Buffer | null = null;
  let contentType = "image/png";

  if (item?.b64_json) {
    bytes = Buffer.from(item.b64_json, "base64");
  } else if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) {
      throw new Error(`Could not download generated image (${imgRes.status}).`);
    }
    const arr = await imgRes.arrayBuffer();
    bytes = Buffer.from(arr);
    contentType = imgRes.headers.get("content-type") || "image/png";
  }

  if (!bytes) throw new Error("Image generation returned no image data.");

  const ext = contentType.includes("jpeg")
    ? "jpg"
    : contentType.includes("webp")
      ? "webp"
      : "png";
  const path = `${options.slug}-${Date.now().toString(36)}.${ext}`;

  const { error: uploadError } = await options.db.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Cover upload failed.");
  }

  const { data } = options.db.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    alt: `Cover illustration for ${options.slug.replace(/-/g, " ")}`,
  };
}
