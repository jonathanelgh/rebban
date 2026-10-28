import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { blocksToJson } from "@/lib/blog/posts";
import {
  claimNextTopic,
  ensureTopicBuffer,
  generateTopicBatch,
} from "@/lib/blog/automation/topics";
import { writeArticleForTopic } from "@/lib/blog/automation/write";
import { generateAndUploadCover } from "@/lib/blog/automation/cover";
import {
  activeSlotsForSettings,
  getLocalClock,
  isSlotOpen,
  normalizePublishTimes,
} from "@/lib/blog/automation/schedule";

type Db = SupabaseClient<Database>;
type Settings = Database["public"]["Tables"]["blog_automation_settings"]["Row"];

export async function getBlogAutomationSettings(db: Db) {
  const { data, error } = await db
    .from("blog_automation_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Blog automation settings missing.");
  return data;
}

async function uniqueSlug(db: Db, base: string) {
  let slug = base;
  for (let i = 0; i < 8; i += 1) {
    const { data } = await db
      .from("blog_posts")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function publishTopicArticle(options: {
  db: Db;
  settings: Settings;
  topicId?: string;
}) {
  const { db, settings } = options;
  let topic = null as Awaited<ReturnType<typeof claimNextTopic>>;

  if (options.topicId) {
    const { data, error } = await db
      .from("blog_topics")
      .update({
        status: "writing",
        updated_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", options.topicId)
      .in("status", ["queued", "failed"])
      .select("*, blog_categories ( id, name, slug )")
      .maybeSingle();
    if (error) throw new Error(error.message);
    topic = data;
  } else {
    topic = await claimNextTopic(db);
  }

  if (!topic) {
    return { ok: false as const, error: "No queued topics." };
  }

  try {
    const article = await writeArticleForTopic({ db, topic });
    const slug = await uniqueSlug(db, article.slug);

    let coverImage: string | null = null;
    let coverImageAlt: string | null = null;
    try {
      const cover = await generateAndUploadCover({
        db,
        prompt: article.coverPrompt,
        slug,
      });
      coverImage = cover.url;
      coverImageAlt = cover.alt;
    } catch (coverErr) {
      const coverMessage =
        coverErr instanceof Error ? coverErr.message : "unknown";
      console.error("[blog-automation] cover failed", {
        topicId: topic.id,
        error: coverMessage,
      });
      // Surface on settings so missing covers are visible in admin.
      await db
        .from("blog_automation_settings")
        .update({
          last_error: `Cover failed for ${slug}: ${coverMessage}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
    }

    const now = new Date().toISOString();
    const publishedAt = now.slice(0, 10);

    const { data: post, error: postError } = await db
      .from("blog_posts")
      .insert({
        title: article.title,
        slug,
        description: article.description,
        excerpt: article.excerpt,
        category_id: article.categoryId,
        author: settings.author || "Rebban",
        published_at: publishedAt,
        updated_at: publishedAt,
        reading_minutes: article.readingMinutes,
        tags: article.tags,
        featured: false,
        content: blocksToJson(article.content),
        status: "published",
        cover_image: coverImage,
        cover_image_alt: coverImageAlt,
        created_at: now,
        modified_at: now,
      })
      .select("id, slug, title")
      .single();

    if (postError) throw new Error(postError.message);

    await db
      .from("blog_topics")
      .update({
        status: "published",
        blog_post_id: post.id,
        updated_at: now,
        error: null,
      })
      .eq("id", topic.id);

    return {
      ok: true as const,
      topicId: topic.id,
      post,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed.";
    await db
      .from("blog_topics")
      .update({
        status: "failed",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", topic.id);
    return { ok: false as const, error: message, topicId: topic.id };
  }
}

export async function processBlogAutomationTick(options?: {
  force?: boolean;
  db?: Db;
}) {
  const db = options?.db || createAdminClient();
  const settings = await getBlogAutomationSettings(db);

  if (!settings.enabled && !options?.force) {
    return { ok: true as const, skipped: true as const, reason: "disabled" };
  }

  const buffer = await ensureTopicBuffer({
    db,
    batchSize: settings.topic_batch_size || 60,
  });

  const clock = getLocalClock(settings.timezone || "Europe/Stockholm");
  const slots = activeSlotsForSettings({
    postsPerDay: settings.posts_per_day,
    publishTimes: normalizePublishTimes(settings.publish_times),
  });

  const dueSlots = options?.force
    ? [clock.hhmm]
    : slots.filter((slot) => isSlotOpen(slot, clock));

  if (dueSlots.length === 0) {
    await db
      .from("blog_automation_settings")
      .update({
        last_run_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    return {
      ok: true as const,
      skipped: true as const,
      reason: "no_open_slot",
      buffer,
      clock,
      slots,
    };
  }

  const results: Array<Record<string, unknown>> = [];

  for (const slot of dueSlots) {
    const slotKey = options?.force ? `force-${clock.hhmm}` : slot;

    if (!options?.force) {
      const { data: existing } = await db
        .from("blog_automation_runs")
        .select("id, status")
        .eq("slot_date", clock.date)
        .eq("slot_time", slotKey)
        .maybeSingle();
      if (existing) {
        results.push({ slot, skipped: true, reason: "already_ran" });
        continue;
      }
    }

    const { data: run, error: runError } = await db
      .from("blog_automation_runs")
      .insert({
        slot_date: clock.date,
        slot_time: options?.force ? `force-${Date.now()}` : slotKey,
        status: "started",
      })
      .select("id")
      .single();

    if (runError) {
      results.push({ slot, error: runError.message });
      continue;
    }

    const published = await publishTopicArticle({ db, settings });
    if (!published.ok) {
      await db
        .from("blog_automation_runs")
        .update({
          status: "failed",
          error: published.error,
          topic_id: "topicId" in published ? published.topicId : null,
        })
        .eq("id", run.id);
      results.push({ slot, error: published.error });
      continue;
    }

    await db
      .from("blog_automation_runs")
      .update({
        status: "published",
        topic_id: published.topicId,
        blog_post_id: published.post.id,
        error: null,
      })
      .eq("id", run.id);

    results.push({
      slot,
      published: true,
      post: published.post,
      topicId: published.topicId,
    });
  }

  const failed = results.find((r) => r.error);
  await db
    .from("blog_automation_settings")
    .update({
      last_run_at: new Date().toISOString(),
      last_error: failed ? String(failed.error) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return {
    ok: true as const,
    buffer,
    clock,
    slots,
    results,
  };
}

export async function refillTopicsNow(options?: { db?: Db; count?: number }) {
  const db = options?.db || createAdminClient();
  const settings = await getBlogAutomationSettings(db);
  const count = options?.count || settings.topic_batch_size || 60;
  const inserted = await generateTopicBatch({ db, count });
  return { generated: inserted.length, topics: inserted };
}
