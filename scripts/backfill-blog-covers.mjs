import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const apiKey = env.OPENAI_API_KEY;
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const model = env.OPENAI_BLOG_IMAGE_MODEL || "gpt-image-2";

if (!apiKey || !supabaseUrl || !serviceKey) {
  console.error("Missing OPENAI_API_KEY / Supabase env.");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function generateCover(prompt, slug) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: `${prompt}\n\nStyle: modern editorial illustration for a SaaS blog, soft gradients, abstract shapes suggesting freelance work and calm focus. No text, no watermark, no logos, no faces of real people.`,
      size: "1536x1024",
      quality: "high",
      output_format: "png",
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || `Image gen failed (${res.status})`);
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned");
  const bytes = Buffer.from(b64, "base64");
  const path = `${slug}-${Date.now().toString(36)}.png`;
  const { error } = await db.storage.from("blog-covers").upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const { data } = db.storage.from("blog-covers").getPublicUrl(path);
  return {
    url: data.publicUrl,
    alt: `Cover illustration for ${slug.replace(/-/g, " ")}`,
  };
}

const { data: posts, error } = await db
  .from("blog_posts")
  .select("id, slug, title, cover_image")
  .or('cover_image.is.null,cover_image.eq.""')
  .order("published_at", { ascending: false })
  .limit(20);

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Found ${(posts || []).length} posts missing covers. Using ${model}.`);

let filled = 0;
let failed = 0;
for (const post of posts || []) {
  process.stdout.write(`- ${post.slug} … `);
  try {
    const cover = await generateCover(
      `Editorial abstract illustration for a freelance business article titled "${post.title}". Soft shapes, calm professional palette, no text, no logos.`,
      post.slug
    );
    const { error: updateError } = await db
      .from("blog_posts")
      .update({
        cover_image: cover.url,
        cover_image_alt: cover.alt,
        modified_at: new Date().toISOString(),
      })
      .eq("id", post.id);
    if (updateError) throw new Error(updateError.message);
    filled += 1;
    console.log("ok");
  } catch (err) {
    failed += 1;
    console.log(`FAIL: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(JSON.stringify({ filled, failed }));
