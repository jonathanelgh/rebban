import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import type { Database } from "@/types/database";

type SettingsUpdate = Database["public"]["Tables"]["outreach_settings"]["Update"];

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data, error } = await gate.db
    .from("outreach_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
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

  const patch: SettingsUpdate = {
    updated_by: gate.user.id,
    updated_at: new Date().toISOString(),
  };

  if (typeof body.sending_enabled === "boolean") {
    patch.sending_enabled = body.sending_enabled;
  }
  if (typeof body.daily_send_limit === "number") {
    patch.daily_send_limit = body.daily_send_limit;
  }
  if (Array.isArray(body.allowed_weekdays)) {
    patch.allowed_weekdays = body.allowed_weekdays as number[];
  }
  if (typeof body.send_window_start === "string") {
    patch.send_window_start = body.send_window_start;
  }
  if (typeof body.send_window_end === "string") {
    patch.send_window_end = body.send_window_end;
  }
  if (typeof body.timezone === "string") {
    patch.timezone = body.timezone;
  }
  if (typeof body.max_follow_ups === "number") {
    patch.max_follow_ups = body.max_follow_ups;
  }
  if (typeof body.follow_up_1_days === "number") {
    patch.follow_up_1_days = body.follow_up_1_days;
  }
  if (typeof body.follow_up_2_days === "number") {
    patch.follow_up_2_days = body.follow_up_2_days;
  }

  const { data, error } = await gate.db
    .from("outreach_settings")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
