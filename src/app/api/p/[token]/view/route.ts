import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function clientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const { ip, userAgent } = clientMeta(request);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("record_public_proposal_view", {
      p_token: token,
      p_ip: ip,
      p_user_agent: userAgent,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to record view";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
