import { NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  getBlogAutomationSettings,
  processBlogAutomationTick,
  publishTopicArticle,
  refillTopicsNow,
} from "@/lib/blog/automation/run";
import { normalizePublishTimes } from "@/lib/blog/automation/schedule";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const settings = await getBlogAutomationSettings(gate.db);
    const [
      { count: queued },
      { count: published },
      { count: failed },
      { data: topics },
      { data: recentRuns },
    ] = await Promise.all([
      gate.db
        .from("blog_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued"),
      gate.db
        .from("blog_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      gate.db
        .from("blog_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      gate.db
        .from("blog_topics")
        .select(
          "id, title, angle, category_id, target_keyword, keywords, status, priority, source, blog_post_id, error, created_at, updated_at, blog_categories ( id, name, slug )"
        )
        .order("status", { ascending: true })
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80),
      gate.db
        .from("blog_automation_runs")
        .select(
          "id, slot_date, slot_time, status, error, topic_id, blog_post_id, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    return NextResponse.json({
      settings,
      counts: {
        queued: queued || 0,
        published: published || 0,
        failed: failed || 0,
      },
      topics: (topics || []).map((topic) => {
        const rel = Array.isArray(topic.blog_categories)
          ? topic.blog_categories[0]
          : topic.blog_categories;
        return {
          ...topic,
          category: rel?.name || "",
          blog_categories: undefined,
        };
      }),
      recentRuns: recentRuns || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load blog automation",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const patch: Database["public"]["Tables"]["blog_automation_settings"]["Update"] =
    {
      updated_at: new Date().toISOString(),
      updated_by: gate.user.id,
    };

  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.postsPerDay === "number") {
    patch.posts_per_day = Math.max(1, Math.min(4, Math.round(body.postsPerDay)));
  }
  if (Array.isArray(body.publishTimes)) {
    patch.publish_times = normalizePublishTimes(
      body.publishTimes.map((t) => String(t))
    );
  }
  if (typeof body.timezone === "string" && body.timezone.trim()) {
    patch.timezone = body.timezone.trim();
  }
  if (typeof body.author === "string" && body.author.trim()) {
    patch.author = body.author.trim().slice(0, 80);
  }
  if (typeof body.topicBatchSize === "number") {
    patch.topic_batch_size = Math.max(
      10,
      Math.min(120, Math.round(body.topicBatchSize))
    );
  }

  const { data, error } = await gate.db
    .from("blog_automation_settings")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    topicId?: string;
    count?: number;
  };

  try {
    if (body.action === "refill_topics") {
      const result = await refillTopicsNow({
        db: gate.db,
        count: body.count,
      });
      return NextResponse.json(result);
    }

    if (body.action === "publish_now") {
      const settings = await getBlogAutomationSettings(gate.db);
      if (body.topicId) {
        const result = await publishTopicArticle({
          db: gate.db,
          settings,
          topicId: body.topicId,
        });
        return NextResponse.json(result);
      }
      const result = await processBlogAutomationTick({
        db: gate.db,
        force: true,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Blog automation action failed",
      },
      { status: 500 }
    );
  }
}
