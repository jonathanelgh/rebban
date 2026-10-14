import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type RouteContext = { params: Promise<{ token: string }> };

function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public env vars are not configured.");
  }
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { ip, userAgent } = clientMeta(request);
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("record_public_invoice_view", {
      p_token: token.trim(),
      p_ip: ip || undefined,
      p_user_agent: userAgent || undefined,
    });

    if (error) {
      const message = error.message || "Failed to record view";
      const status = /not found/i.test(message) ? 404 : 400;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to record view";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
