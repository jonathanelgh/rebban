import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { sendProposalForOrganization } from "@/lib/proposals/send-proposal";
import type {
  FollowUpSequenceKey,
  FollowUpStepTemplate,
} from "@/lib/proposals/followups";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: proposalId } = await context.params;
    const body = (await request.json()) as {
      recipientEmail?: string;
      recipientName?: string;
      message?: string;
      sequenceKey?: FollowUpSequenceKey;
      followUpSteps?: FollowUpStepTemplate[];
    };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    const result = await sendProposalForOrganization({
      db: supabase,
      proposalId,
      organizationId: entitlement.organizationId,
      userId: user.id,
      message: body.message,
      recipientEmail: body.recipientEmail,
      recipientName: body.recipientName,
      sequenceKey: body.sequenceKey,
      followUpSteps: body.followUpSteps,
      userEmail: user.email,
    });

    if (!result.ok) {
      const status =
        result.error.includes("not found")
          ? 404
          : result.error.includes("Forbidden")
            ? 403
            : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      ok: true,
      url: result.url,
      recipientEmail: result.recipientEmail,
      followUpsScheduled: result.followUpsScheduled,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
