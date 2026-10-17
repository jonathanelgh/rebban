import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSignedProposalConfirmation } from "@/lib/proposals/send-signed-confirmation";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

/** Org members can resend the signed PDF confirmation to the client. */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id: proposalId } = await context.params;
    if (!proposalId) {
      return NextResponse.json({ error: "Missing proposal id." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const result = await sendSignedProposalConfirmation(supabase, proposalId, {
      request: _request,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not resend signed confirmation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
