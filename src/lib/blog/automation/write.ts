import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { resolveBlogCategory } from "@/lib/blog/categories";
import {
  asBlogBlocks,
  estimateReadingMinutes,
  slugifyTitle,
  type BlogBlock,
} from "@/lib/blog/posts";
import { openAiChatJson } from "@/lib/blog/automation/openai";

type Db = SupabaseClient<Database>;

type TopicRow = Database["public"]["Tables"]["blog_topics"]["Row"] & {
  blog_categories?:
    | { id: string; name: string; slug: string }
    | { id: string; name: string; slug: string }[]
    | null;
};

const WRITE_SYSTEM = `You are a senior freelance-business writer for Rebban (rebban.com / app.rebban.com).

Write empathetic, practical articles for independent freelancers. Tone: clear, human, calm, specific. No hype, no emojis in body, no em dashes or en dashes (use hyphen - or rewrite).

Return JSON only:
{
  "title": "final title",
  "slug": "url-slug",
  "description": "meta description ~150 chars",
  "excerpt": "card excerpt 1-2 sentences",
  "category": "category name from the topic",
  "tags": ["tag1", "tag2"],
  "coverPrompt": "detailed cover image prompt, abstract editorial illustration, no text in image",
  "content": [
    { "type": "p", "text": "paragraph with optional [anchor](/path) or [anchor](https://...)" },
    { "type": "h2", "text": "section heading" },
    { "type": "quote", "text": "short quotable line" },
    { "type": "ul", "items": ["item"] },
    { "type": "ol", "items": ["item"] }
  ]
}

SEO + structure rules:
- 900-1400 words equivalent across blocks.
- 4-6 h2 sections, open with a strong hook paragraph, end with a practical close.
- Include at least 2 internal links using paths from the provided internal link list (markdown [label](/path)).
- Include 1-2 reputable external links (gov, established publications, freelancing associations). Never invent fake URLs.
- Every article must explain how Rebban can help with THIS topic's problem. Put that in a dedicated h2 near the end (not the opening section), then a short close. Be specific: name the relevant Rebban features (proposals, clients, time tracking, invoices, payment reminders, getting paid) and how they reduce the pain the article covers. Include at least 2 product links from the provided product paths. Keep it useful, not a hard sell - no "sign up now" spam, and do not mention Rebban in every section.
- Prefer concrete freelancer scenarios over generic advice.`;

export async function writeArticleForTopic(options: {
  db: Db;
  topic: TopicRow;
}) {
  const { db, topic } = options;

  const topicCategoryRel = Array.isArray(topic.blog_categories)
    ? topic.blog_categories[0]
    : topic.blog_categories;
  const topicCategoryName = topicCategoryRel?.name || "Workflow";

  const { data: posts } = await db
    .from("blog_posts")
    .select("title, slug, blog_categories ( name )")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(40);

  const internalLinks = (posts || []).map((p) => {
    const rel = Array.isArray(p.blog_categories)
      ? p.blog_categories[0]
      : p.blog_categories;
    return `- ${p.title} → /articles/${p.slug} [${rel?.name || ""}]`;
  });

  const productLinks = [
    "- Rebban home → https://rebban.com",
    "- App → https://app.rebban.com",
    "- Proposals → /proposals",
    "- Clients → /clients",
    "- Time tracking → /time-tracking",
    "- Invoices → /invoices",
    "- Getting paid / invoices → /invoices",
  ];

  const raw = await openAiChatJson({
    system: WRITE_SYSTEM,
    temperature: 0.55,
    maxTokens: 9000,
    user: [
      `Write one complete article for this topic:`,
      `Title idea: ${topic.title}`,
      `Angle: ${topic.angle || "(none)"}`,
      `Category: ${topicCategoryName}`,
      `Primary keyword: ${topic.target_keyword}`,
      `Secondary keywords: ${(topic.keywords || []).join(", ") || "(none)"}`,
      "",
      "Internal article links to use when relevant:",
      internalLinks.length ? internalLinks.join("\n") : "- (none yet)",
      "",
      "Product paths to use in the Rebban-help section (pick the ones that match this topic):",
      productLinks.join("\n"),
      "",
      "Required: one late h2 that tells the reader how Rebban helps with this exact problem, with concrete feature examples and product links.",
    ].join("\n"),
  });

  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid article JSON from model.");
  }

  const row = raw as Record<string, unknown>;
  const title = String(row.title || topic.title)
    .replace(/[—–]/g, "-")
    .trim();
  const slug =
    slugifyTitle(String(row.slug || title)) || topicSimilarityFallback(title);
  const description = String(row.description || topic.angle || title).trim();
  const excerpt = String(row.excerpt || description).trim();
  const categoryName = String(
    row.category || topicCategoryName || "Workflow"
  ).trim();
  const category = await resolveBlogCategory(db, {
    categoryId: topic.category_id,
    category: categoryName,
  });
  const tags = Array.isArray(row.tags)
    ? row.tags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 10)
    : topic.keywords || [];
  const coverPrompt = String(row.coverPrompt || row.cover_prompt || "")
    .trim()
    .slice(0, 1200);
  const content = sanitizeBlocks(asBlogBlocks(row.content));

  if (content.length < 4) {
    throw new Error("Article content too short.");
  }

  return {
    title,
    slug,
    description,
    excerpt,
    categoryId: category.id,
    category: category.name,
    tags,
    coverPrompt:
      coverPrompt ||
      `Editorial abstract illustration for a freelance business article about ${topic.target_keyword || topic.title}. Soft shapes, calm professional palette, no text, no logos.`,
    content,
    readingMinutes: estimateReadingMinutes(content),
  };
}

function topicSimilarityFallback(title: string) {
  return slugifyTitle(title) || `post-${Date.now().toString(36)}`;
}

function sanitizeBlocks(blocks: BlogBlock[]): BlogBlock[] {
  const cleaned: BlogBlock[] = [];
  for (const block of blocks) {
    if (block.type === "ul" || block.type === "ol") {
      const items = block.items
        .map((item) => item.replace(/[—–]/g, "-").trim())
        .filter(Boolean);
      if (items.length) cleaned.push({ type: block.type, items });
      continue;
    }
    if (!("text" in block)) continue;
    const text = block.text.replace(/[—–]/g, "-").trim();
    if (text) cleaned.push({ type: block.type, text });
  }
  return cleaned;
}
