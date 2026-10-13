import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import {
  getAppUrl,
  sendProposalInviteEmail,
} from "@/lib/email/resend";
import {
  DEFAULT_PROPOSAL_SEND_MESSAGE,
  buildScheduledFollowUps,
  type FollowUpSequenceKey,
  type FollowUpStepTemplate,
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

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(
        "id, title, amount, currency, status, organization_id, client_id, created_by, sent_at, expires_at"
      )
      .eq("id", proposalId)
      .is("deleted_at", null)
      .maybeSingle();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: proposalError?.message || "Proposal not found" },
        { status: 404 }
      );
    }

    if (proposal.status === "accepted") {
      return NextResponse.json(
        { error: "This proposal is already accepted." },
        { status: 400 }
      );
    }

    let recipientEmail = body.recipientEmail?.trim().toLowerCase() || "";
    let recipientName = body.recipientName?.trim() || "";

    if (proposal.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("name, company, email")
        .eq("id", proposal.client_id)
        .maybeSingle();
      if (!recipientEmail) recipientEmail = client?.email?.toLowerCase() || "";
      if (!recipientName) {
        recipientName = client?.name || client?.company || "";
      }
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Add a client email before sending." },
        { status: 400 }
      );
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", proposal.organization_id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    // Cancel any leftover pending follow-ups from earlier sends
    await supabase.rpc("cancel_proposal_followups", {
      p_proposal_id: proposal.id,
    });

    const token = nanoid(32);
    const linkExpiresAt =
      proposal.expires_at ||
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
    const { data: link, error: linkError } = await supabase
      .from("proposal_share_links")
      .insert({
        organization_id: proposal.organization_id,
        proposal_id: proposal.id,
        token,
        created_by: user.id,
        recipient_email: recipientEmail,
        recipient_name: recipientName || null,
        expires_at: linkExpiresAt,
      })
      .select("id, token")
      .single();

    if (linkError || !link) {
      return NextResponse.json(
        { error: linkError?.message || "Could not create share link" },
        { status: 500 }
      );
    }

    const proposalUrl = `${getAppUrl()}/p/${link.token}`;

    const sendMessage =
      body.message?.trim() || DEFAULT_PROPOSAL_SEND_MESSAGE;

    await sendProposalInviteEmail({
      to: recipientEmail,
      recipientName,
      senderName: profile?.full_name,
      organizationName: org?.name || "Your freelancer",
      proposalTitle: proposal.title,
      proposalUrl,
      message: sendMessage,
      fromUserId: user.id,
    });

    const now = new Date().toISOString();
    const nextStatus =
      proposal.status === "viewed" ? ("viewed" as const) : ("sent" as const);

    const proposalUpdate: {
      status: "sent" | "viewed" | "declined" | "draft";
      sent_at: string;
      updated_at: string;
      declined_at?: string | null;
    } = {
      status: nextStatus,
      sent_at: proposal.sent_at || now,
      updated_at: now,
    };
    if (proposal.status === "declined") {
      proposalUpdate.declined_at = null;
      proposalUpdate.status = "sent";
    }

    await supabase.from("proposals").update(proposalUpdate).eq("id", proposal.id);

    const sequenceKey = body.sequenceKey || "none";
    const scheduled = buildScheduledFollowUps({
      sequenceKey,
      steps: body.followUpSteps,
    });

    if (scheduled.length > 0) {
      const { error: followUpError } = await supabase
        .from("proposal_followups")
        .insert(
          scheduled.map((step) => ({
            organization_id: proposal.organization_id,
            proposal_id: proposal.id,
            share_link_id: link.id,
            sequence_key: sequenceKey,
            step_index: step.stepIndex,
            delay_days: step.delayDays,
            recipient_email: recipientEmail,
            recipient_name: recipientName || null,
            subject: step.subject,
            body: step.body,
            status: "pending" as const,
            scheduled_for: step.scheduledFor,
            created_by: user.id,
          }))
        );

      if (followUpError) {
        return NextResponse.json(
          {
            error:
              followUpError.message ||
              "Proposal sent, but follow-ups could not be scheduled.",
          },
          { status: 500 }
        );
      }
    }

    await supabase.from("proposal_events").insert({
      organization_id: proposal.organization_id,
      proposal_id: proposal.id,
      share_link_id: link.id,
      event_type: "sent",
      actor_type: "freelancer",
      actor_email: profile?.email || user.email || null,
      actor_name: profile?.full_name || null,
      metadata: {
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        proposal_url: proposalUrl,
        sequence_key: sequenceKey,
        followup_count: scheduled.length,
      },
    });

    const recipientLabel = recipientName || recipientEmail;
    await supabase.rpc("create_user_notification", {
      p_organization_id: proposal.organization_id,
      p_user_id: proposal.created_by || user.id,
      p_type: "proposal_sent",
      p_title: "Proposal sent",
      p_body: `"${proposal.title}" was sent to ${recipientLabel}.`,
      p_link: `/proposals/${proposal.id}/edit`,
      p_entity_type: "proposal",
      p_entity_id: proposal.id,
    });

    return NextResponse.json({
      ok: true,
      token: link.token,
      url: proposalUrl,
      recipientEmail,
      followUpsScheduled: scheduled.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
