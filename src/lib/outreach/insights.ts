import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Db = SupabaseClient<Database>;

function topCounts(values: string[], limit = 10) {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = v.trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function leadLabel(lead: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
} | null) {
  if (!lead) return "Lead";
  return (
    lead.display_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    lead.email
  );
}

export async function loadOutreachInsights(db: Db) {
  const { data: leads, error } = await db.from("outreach_leads").select("*");
  if (error) throw new Error(error.message);
  const rows = leads || [];

  const contacted = rows.filter((l) => l.last_contacted_at).length;
  const replied = rows.filter((l) => l.last_replied_at).length;
  const hot = rows.filter((l) => l.temperature === "hot").length;
  const warm = rows.filter((l) => l.temperature === "warm").length;
  const cold = rows.filter((l) => l.temperature === "cold").length;
  const positiveReplies = rows.filter(
    (l) => l.temperature === "hot" || l.temperature === "warm"
  ).length;
  const trialSignals = rows.filter((l) =>
    (l.positive_signals || []).some((s) => /trial|signup|access/i.test(s))
  ).length;

  return {
    total: rows.length,
    contacted,
    replies: replied,
    replyRate: contacted ? Math.round((replied / contacted) * 1000) / 10 : 0,
    positiveReplyRate: replied
      ? Math.round((positiveReplies / replied) * 1000) / 10
      : 0,
    hot,
    warm,
    cold,
    trialSignals,
    topTools: topCounts(rows.flatMap((l) => l.current_tools || [])),
    topCompetitors: topCounts(
      rows.flatMap((l) => l.competitors_mentioned || [])
    ),
    topPainPoints: topCounts(rows.flatMap((l) => l.pain_points || [])),
    topFeatureRequests: topCounts(
      rows.flatMap((l) => l.feature_requests || [])
    ),
    topObjections: topCounts(rows.flatMap((l) => l.objections || [])),
  };
}

export async function loadOutreachActionFeed(db: Db) {
  const [
    hotRes,
    analysesRes,
    followupsRes,
    queueRes,
  ] = await Promise.all([
    db
      .from("outreach_leads")
      .select(
        "id, display_name, first_name, last_name, email, temperature_score, last_replied_at"
      )
      .eq("temperature", "hot")
      .eq("do_not_contact", false)
      .order("last_replied_at", { ascending: false })
      .limit(8),
    db
      .from("outreach_ai_analyses")
      .select(
        "id, lead_id, temperature, score, summary, suggested_reply, intent, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(12),
    db
      .from("outreach_followups")
      .select("id, lead_id, follow_up_number, scheduled_for, subject, body")
      .eq("status", "due")
      .order("scheduled_for", { ascending: true })
      .limit(8),
    db
      .from("outreach_leads")
      .select("id, display_name, email, queued_at, subject_line, first_name, last_name")
      .eq("outreach_status", "queued")
      .order("queued_at", { ascending: true })
      .limit(8),
  ]);

  const leadIds = Array.from(
    new Set([
      ...(analysesRes.data || []).map((a) => a.lead_id),
      ...(followupsRes.data || []).map((f) => f.lead_id),
    ])
  );

  const { data: leadRows } = leadIds.length
    ? await db
        .from("outreach_leads")
        .select("id, display_name, first_name, last_name, email")
        .in("id", leadIds)
    : { data: [] as {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string;
      }[] };

  const leadById = new Map((leadRows || []).map((l) => [l.id, l]));

  return {
    hotReplies: (hotRes.data || []).map((l) => ({
      ...l,
      name: leadLabel(l),
    })),
    repliesToReview: (analysesRes.data || []).map((a) => ({
      ...a,
      name: leadLabel(leadById.get(a.lead_id) || null),
      email: leadById.get(a.lead_id)?.email || null,
    })),
    followupsDue: (followupsRes.data || []).map((f) => ({
      ...f,
      name: leadLabel(leadById.get(f.lead_id) || null),
      email: leadById.get(f.lead_id)?.email || null,
    })),
    sendQueue: (queueRes.data || []).map((l) => ({
      ...l,
      name: leadLabel(l),
    })),
    recentActivity: (analysesRes.data || []).slice(0, 12).map((a) => {
      const lead = leadById.get(a.lead_id);
      const name = leadLabel(lead || null);
      return {
        id: a.id,
        leadId: a.lead_id,
        createdAt: a.created_at,
        text: `${name}: AI rated ${a.score}/100 ${String(a.temperature).toUpperCase()}${
          a.intent ? ` · ${a.intent}` : ""
        }`,
      };
    }),
  };
}
