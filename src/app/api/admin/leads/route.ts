import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import type {
  OutreachStatus,
  OutreachTemperature,
  OutreachLeadTier,
} from "@/lib/outreach/constants";
import {
  lookupSignupsByEmails,
  signedUpLeadEmails,
  signupForEmail,
} from "@/lib/outreach/signup";
import type { Database } from "@/types/database";

type LeadUpdate = Database["public"]["Tables"]["outreach_leads"]["Update"];

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 100;

export async function GET(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const status = url.searchParams.get("status") as OutreachStatus | null;
  const temperature = url.searchParams.get(
    "temperature"
  ) as OutreachTemperature | null;
  const tier = url.searchParams.get("tier") as OutreachLeadTier | null;
  const ready = url.searchParams.get("ready");
  const replied = url.searchParams.get("replied");
  const followUpDue = url.searchParams.get("followUpDue");
  const dnc = url.searchParams.get("doNotContact");
  const signedUp = url.searchParams.get("signedUp");
  const sort = url.searchParams.get("sort") || "created_at";
  const order = url.searchParams.get("order") === "asc" ? true : false;
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number(url.searchParams.get("pageSize") || PAGE_SIZE_DEFAULT) || PAGE_SIZE_DEFAULT)
  );

  let query = gate.db
    .from("outreach_leads")
    .select("*", { count: "exact" });

  if (q) {
    const pattern = `%${q}%`;
    query = query.or(
      `email.ilike.${pattern},display_name.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},business_name.ilike.${pattern},role.ilike.${pattern},location.ilike.${pattern}`
    );
  }
  if (status) query = query.eq("outreach_status", status);
  if (temperature) query = query.eq("temperature", temperature);
  if (tier) query = query.eq("lead_tier", tier);
  if (ready === "1") query = query.eq("ready_to_send", true);
  if (ready === "0") query = query.eq("ready_to_send", false);
  if (replied === "1") query = query.not("last_replied_at", "is", null);
  if (replied === "0") query = query.is("last_replied_at", null);
  if (followUpDue === "1") {
    query = query
      .not("next_follow_up_at", "is", null)
      .lte("next_follow_up_at", new Date().toISOString())
      .eq("do_not_contact", false)
      .is("last_replied_at", null);
  }
  if (dnc === "1") query = query.eq("do_not_contact", true);
  if (dnc === "0") query = query.eq("do_not_contact", false);

  if (signedUp === "1" || signedUp === "0") {
    const signedEmails = await signedUpLeadEmails(gate.db);
    const { data: candidacy, error: candError } = await gate.db
      .from("outreach_leads")
      .select("id, email_normalized");
    if (candError) {
      return NextResponse.json({ error: candError.message }, { status: 500 });
    }
    const wantSigned = signedUp === "1";
    const ids = (candidacy || [])
      .filter((row) => {
        const email = row.email_normalized || "";
        const isSigned = email ? signedEmails.has(email) : false;
        return wantSigned ? isSigned : !isSigned;
      })
      .map((row) => row.id);
    if (!ids.length) {
      return NextResponse.json({
        leads: [],
        total: 0,
        page,
        pageSize,
      });
    }
    query = query.in("id", ids);
  }

  const allowedSort = new Set([
    "created_at",
    "updated_at",
    "last_contacted_at",
    "last_replied_at",
    "display_name",
    "email",
    "outreach_status",
    "temperature_score",
  ]);
  const sortCol = allowedSort.has(sort) ? sort : "created_at";

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await query
    .order(sortCol, { ascending: order, nullsFirst: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const signupMap = await lookupSignupsByEmails(
    gate.db,
    (data || []).map((l) => l.email)
  );

  const leads = (data || []).map((lead) => ({
    ...lead,
    signup: signupForEmail(signupMap, lead.email),
  }));

  return NextResponse.json({
    leads,
    total: count || 0,
    page,
    pageSize,
  });
}

export async function PATCH(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await request.json().catch(() => null)) as {
    ids?: string[];
    action?: string;
    status?: OutreachStatus;
  } | null;

  const ids = Array.isArray(body?.ids)
    ? body!.ids.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  if (!ids.length) {
    return NextResponse.json({ error: "No leads selected." }, { status: 400 });
  }
  if (ids.length > 100) {
    return NextResponse.json(
      { error: "Bulk actions are limited to 100 leads." },
      { status: 400 }
    );
  }

  const action = body?.action;
  const now = new Date().toISOString();
  let patch: LeadUpdate | null = null;

  switch (action) {
    case "mark_ready":
      patch = {
        ready_to_send: true,
        outreach_status: "ready",
      };
      break;
    case "queue":
      patch = {
        ready_to_send: true,
        outreach_status: "queued",
        queued_at: now,
      };
      break;
    case "do_not_contact":
      patch = {
        do_not_contact: true,
        unsubscribed_at: now,
        ready_to_send: false,
        queued_at: null,
      };
      break;
    case "set_status":
      if (!body?.status) {
        return NextResponse.json({ error: "status required" }, { status: 400 });
      }
      patch = { outreach_status: body.status };
      if (body.status === "ready") patch.ready_to_send = true;
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  let update = gate.db.from("outreach_leads").update(patch).in("id", ids);
  // Never queue or mark-ready contacts that opted out.
  if (action === "queue" || action === "mark_ready") {
    update = update.eq("do_not_contact", false);
  }

  const { data, error } = await update.select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: data?.length || 0 });
}
