import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAppUrl,
  sendProposalDeclinedEmail,
} from "@/lib/email/resend";

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
    const body = (await request.json()) as {
      reason?: string;
      name?: string;
      email?: string;
    };
    const { ip, userAgent } = clientMeta(request);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("decline_public_proposal", {
      p_token: token,
      p_reason: body.reason?.trim() || null,
      p_name: body.name?.trim() || null,
      p_email: body.email?.trim() || null,
      p_ip: ip,
      p_user_agent: userAgent,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const result = data as {
      ok: boolean;
      status: string;
      proposal_id?: string;
      title?: string;
      notify_email?: string | null;
      notify_name?: string | null;
    };

    if (result.notify_email && result.proposal_id) {
      try {
        await sendProposalDeclinedEmail({
          to: result.notify_email,
          freelancerName: result.notify_name,
          actorName: body.name?.trim() || null,
          proposalTitle: result.title || "Proposal",
          reason: body.reason?.trim() || null,
          proposalUrl: `${getAppUrl()}/proposals/${result.proposal_id}/edit`,
        });
      } catch {
        // Decline already persisted.
      }
    }

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      proposal_id: result.proposal_id,
      title: result.title,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to decline proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
