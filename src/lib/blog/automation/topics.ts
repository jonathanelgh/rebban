import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { listBlogCategories, resolveBlogCategory } from "@/lib/blog/categories";
import { slugifyTitle } from "@/lib/blog/posts";
import { openAiChatJson } from "@/lib/blog/automation/openai";

type Db = SupabaseClient<Database>;

export function topicSimilarityKey(title: string) {
  return slugifyTitle(title).slice(0, 160);
}

function topicSystemPrompt(categoryNames: string[]) {
  const list = categoryNames.length
    ? categoryNames.join(", ")
    : "Workflow, Invoicing, Proposals, Time tracking, Mindset, Clients";
  return `You are an SEO content strategist for Rebban, a freelancer tool that covers proposals, projects, time tracking, invoicing, and getting paid.

Return JSON only:
{
  "topics": [
    {
      "title": "Compelling article title (no em dash)",
      "angle": "1-2 sentence unique angle",
      "category": "exact category name from the allowed list",
      "targetKeyword": "primary SEO phrase",
      "keywords": ["secondary", "phrases"]
    }
  ]
}

Rules:
- Topics must help freelancers with real struggles: admin overload, unpaid hours, scope creep, chasing payment, tool sprawl, proposal anxiety, pricing confidence, client communication.
- Strong SEO intent: search-friendly titles, clear primary keyword.
- Avoid near-duplicates of titles already listed.
- Avoid hard sales pitches; educational and empathetic first.
- No em dashes or en dashes in titles.
- Diversify categories across the batch.
- category MUST be one of: ${list}.`;
}

/** Keep chunks small so gpt-5.x reasoning + JSON fit in one completion. */
const TOPIC_CHUNK_SIZE = 12;

type TopicDraft = {
  title: string;
  angle: string;
  category: string;
  target_keyword: string;
  keywords: string[];
  similarity_key: string;
  priority: number;
};

function mapTopicItems(
  topicsRaw: Array<Record<string, unknown>>,
  existingKeys: Set<string>,
  priorityBase: number,
  fallbackCategory: string
) {
  const rows: TopicDraft[] = [];
  for (const [index, item] of topicsRaw.entries()) {
    const title = String(item.title || "")
      .replace(/[—–]/g, "-")
      .trim();
    if (!title) continue;
    const key = topicSimilarityKey(title);
    if (!key || existingKeys.has(key)) continue;
    existingKeys.add(key);

    const keywords = Array.isArray(item.keywords)
      ? item.keywords
          .map((k) => String(k || "").trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];

    rows.push({
      title,
      angle: String(item.angle || "").trim(),
      category:
        String(item.category || "").trim() || fallbackCategory,
      target_keyword: String(item.targetKeyword || item.target_keyword || title)
        .trim()
        .slice(0, 120),
      keywords,
      similarity_key: key,
      priority: priorityBase - index,
    });
  }
  return rows;
}

export async function generateTopicBatch(options: {
  db: Db;
  count: number;
}) {
  const { db, count } = options;
  const target = Math.max(1, Math.min(count, 120));
  const categories = await listBlogCategories(db);
  const categoryNames = categories.map((c) => c.name);
  const fallbackCategory = categoryNames[0] || "Workflow";

  const [{ data: existingTopics }, { data: existingPosts }] = await Promise.all([
    db
      .from("blog_topics")
      .select(
        "title, similarity_key, target_keyword, blog_categories ( name )"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("blog_posts")
      .select("title, slug, blog_categories ( name )")
      .order("published_at", { ascending: false })
      .limit(100),
  ]);

  const topicCategoryName = (row: {
    blog_categories?:
      | { name: string }
      | { name: string }[]
      | null;
  }) => {
    const rel = Array.isArray(row.blog_categories)
      ? row.blog_categories[0]
      : row.blog_categories;
    return rel?.name || fallbackCategory;
  };

  const avoid = [
    ...(existingTopics || []).map(
      (t) =>
        `${t.title} [${topicCategoryName(t)}] ~ ${t.target_keyword || t.similarity_key}`
    ),
    ...(existingPosts || []).map(
      (p) => `${p.title} [${topicCategoryName(p)}] /${p.slug}`
    ),
  ];

  const existingKeys = new Set(
    (existingTopics || []).map((t) => t.similarity_key)
  );
  for (const post of existingPosts || []) {
    existingKeys.add(topicSimilarityKey(post.title));
    existingKeys.add(post.slug);
  }

  const drafts: TopicDraft[] = [];
  let remaining = target;
  let chunkIndex = 0;

  while (remaining > 0) {
    const chunkSize = Math.min(TOPIC_CHUNK_SIZE, remaining);
    const raw = await openAiChatJson({
      system: topicSystemPrompt(categoryNames),
      temperature: 0.7,
      maxTokens: 16000,
      user: [
        `Generate exactly ${chunkSize} new blog topics for Rebban.`,
        "",
        "Already covered (do not repeat or closely rephrase):",
        avoid.length
          ? avoid.map((line) => `- ${line}`).join("\n")
          : "- (none yet)",
      ].join("\n"),
    });

    const topicsRaw =
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as { topics?: unknown }).topics)
        ? ((raw as { topics: unknown[] }).topics as Array<
            Record<string, unknown>
          >)
        : [];

    const chunkRows = mapTopicItems(
      topicsRaw,
      existingKeys,
      target - drafts.length,
      fallbackCategory
    );
    if (chunkRows.length === 0) {
      if (drafts.length === 0) {
        throw new Error("AI returned no usable topics.");
      }
      break;
    }

    drafts.push(...chunkRows);
    for (const row of chunkRows) {
      avoid.push(
        `${row.title} [${row.category}] ~ ${row.target_keyword || row.similarity_key}`
      );
    }
    remaining = target - drafts.length;
    chunkIndex += 1;
    if (chunkIndex >= Math.ceil(target / TOPIC_CHUNK_SIZE) + 2) break;
  }

  if (drafts.length === 0) {
    throw new Error("AI returned no usable topics.");
  }

  const rows = [];
  for (const draft of drafts) {
    const category = await resolveBlogCategory(db, {
      category: draft.category || fallbackCategory,
    });
    rows.push({
      title: draft.title,
      angle: draft.angle,
      category_id: category.id,
      target_keyword: draft.target_keyword,
      keywords: draft.keywords,
      similarity_key: draft.similarity_key,
      status: "queued" as const,
      priority: draft.priority,
      source: "ai" as const,
    });
  }

  const { data, error } = await db
    .from("blog_topics")
    .insert(rows)
    .select("id, title, status, category_id, blog_categories ( name )");

  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    category: topicCategoryName(row),
  }));
}

export async function ensureTopicBuffer(options: {
  db: Db;
  batchSize: number;
}) {
  const { db, batchSize } = options;
  const { count, error } = await db
    .from("blog_topics")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  if (error) throw new Error(error.message);
  if ((count || 0) > 0) {
    return { generated: 0, queued: count || 0 };
  }

  const inserted = await generateTopicBatch({ db, count: batchSize });
  return { generated: inserted.length, queued: inserted.length };
}

export async function claimNextTopic(db: Db) {
  const { data: topic, error } = await db
    .from("blog_topics")
    .select("*, blog_categories ( id, name, slug )")
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!topic) return null;

  const { data: claimed, error: claimError } = await db
    .from("blog_topics")
    .update({
      status: "writing",
      updated_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", topic.id)
    .eq("status", "queued")
    .select("*, blog_categories ( id, name, slug )")
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);
  return claimed;
}
