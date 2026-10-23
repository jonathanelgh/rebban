import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadTimerState,
  resolveTimerWorkspace,
  startTimerEntry,
  stopTimerEntry,
} from "@/lib/extension/timer";

export const runtime = "nodejs";

async function authedTimer() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  const workspace = await resolveTimerWorkspace(db, user.id);
  if (!workspace.organizationId) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "No workspace found.",
    };
  }
  return {
    ok: true as const,
    db,
    user,
    organizationId: workspace.organizationId,
    fullName: workspace.fullName,
    email: workspace.email || user.email || null,
  };
}

export async function GET() {
  const auth = await authedTimer();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const state = await loadTimerState(auth.db, auth.user.id, auth.organizationId);
  return NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.email,
      fullName: auth.fullName,
    },
    ...state,
  });
}

export async function POST(request: Request) {
  const auth = await authedTimer();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    clientId?: string | null;
    projectId?: string | null;
    description?: string | null;
  } | null;

  const action = body?.action === "stop" ? "stop" : "start";
  const description = String(body?.description || "").trim() || null;

  if (action === "stop") {
    const result = await stopTimerEntry(auth.db, {
      userId: auth.user.id,
      organizationId: auth.organizationId,
      description,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, stopped: result.data });
  }

  const state = await loadTimerState(auth.db, auth.user.id, auth.organizationId);
  const clientId = body?.clientId || null;
  const projectId =
    clientId &&
    body?.projectId &&
    state.projects.some(
      (p) => p.id === body.projectId && p.clientId === clientId
    )
      ? body.projectId
      : null;

  const { data, error } = await startTimerEntry(auth.db, {
    userId: auth.user.id,
    organizationId: auth.organizationId,
    clientId,
    projectId,
    description,
    defaultHourlyRate: state.defaultHourlyRate,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Could not start timer." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    running: {
      id: data.id,
      startedAt: data.started_at,
      description: data.description,
      clientId: data.client_id,
      projectId: data.project_id,
    },
  });
}
