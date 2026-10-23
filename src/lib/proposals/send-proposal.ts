import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getAppUrl, sendProposalInviteEmail } from "@/lib/email/resend";
import {
  DEFAULT_PROPOSAL_SEND_MESSAGE,
  buildScheduledFollowUps,
  type FollowUpSequenceKey,
  type FollowUpStepTemplate,
} from "@/lib/proposals/followups";

type Db = SupabaseClient<Database>;

export type SendProposalResult =
  | {
      ok: true;
      proposalId: string;
      title: string;
      recipientEmail: string;
      url: string;
      status: string;
      followUpsScheduled: number;
    }
  | { ok: false; error: string };

/**
 * Send a proposal by email and mark it sent. Org-scoped; usable from API or Assistant.
 */
export async function sendProposalForOrganization(options: {
  db: Db;
  proposalId: string;
  organizationId: string;
  userId: string;
  message?: string;
  recipientEmail?: string;
  recipientName?: string;
  sequenceKey?: FollowUpSequenceKey;
  followUpSteps?: FollowUpStepTemplate[];
  userEmail?: string | null;
}): Promise<SendProposalResult> {
  const { db, proposalId, organizationId, userId } = options;

  const { data: proposal, error: proposalError } = await db
    .from("proposals")
    .select(
      "id, title, amount, currency, status, organization_id, client_id, created_by, sent_at, expires_at"
    )
    .eq("id", proposalId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (proposalError || !proposal) {
    return {
      ok: false,
      error: proposalError?.message || "Proposal not found.",
    };
  }

  if (proposal.status === "accepted") {
    return { ok: false, error: "This proposal is already accepted." };
  }

  let recipientEmail =
    options.recipientEmail?.trim().toLowerCase() || "";
  let recipientName = options.recipientName?.trim() || "";

  if (proposal.client_id) {
    const { data: client } = await db
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
    return {
      ok: false,
      error: "Add a client email before sending this proposal.",
    };
  }

  const { data: org } = await db
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();

  const { data: profile } = await db
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  await db.rpc("cancel_proposal_followups", {
    p_proposal_id: proposal.id,
  });

  const token = nanoid(32);
  const linkExpiresAt =
    proposal.expires_at ||
    new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  const { data: link, error: linkError } = await db
    .from("proposal_share_links")
    .insert({
      organization_id: organizationId,
      proposal_id: proposal.id,
      token,
      created_by: userId,
      recipient_email: recipientEmail,
      recipient_name: recipientName || null,
      expires_at: linkExpiresAt,
    })
    .select("id, token")
    .single();

  if (linkError || !link) {
    return {
      ok: false,
      error: linkError?.message || "Could not create share link.",
    };
  }

  const proposalUrl = `${getAppUrl()}/p/${link.token}`;
  const sendMessage =
    options.message?.trim() || DEFAULT_PROPOSAL_SEND_MESSAGE;

  await sendProposalInviteEmail({
    to: recipientEmail,
    recipientName,
    senderName: profile?.full_name,
    organizationName: org?.name || "Your freelancer",
    proposalTitle: proposal.title,
    proposalUrl,
    message: sendMessage,
    fromUserId: userId,
  });

  const now = new Date().toISOString();
  const nextStatus =
    proposal.status === "viewed" ? ("viewed" as const) : ("sent" as const);

  const proposalUpdate: {
    status: "sent" | "viewed";
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

  await db.from("proposals").update(proposalUpdate).eq("id", proposal.id);

  const sequenceKey = options.sequenceKey || "none";
  const scheduled = buildScheduledFollowUps({
    sequenceKey,
    steps: options.followUpSteps,
  });

  if (scheduled.length > 0) {
    const { error: followUpError } = await db.from("proposal_followups").insert(
      scheduled.map((step) => ({
        organization_id: organizationId,
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
        created_by: userId,
      }))
    );

    if (followUpError) {
      return {
        ok: false,
        error:
          followUpError.message ||
          "Proposal sent, but follow-ups could not be scheduled.",
      };
    }
  }

  await db.from("proposal_events").insert({
    organization_id: organizationId,
    proposal_id: proposal.id,
    share_link_id: link.id,
    event_type: "sent",
    actor_type: "freelancer",
    actor_email: profile?.email || options.userEmail || null,
    actor_name: profile?.full_name || null,
    metadata: {
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      proposal_url: proposalUrl,
      sequence_key: sequenceKey,
      followup_count: scheduled.length,
      channel: "assistant",
    },
  });

  const recipientLabel = recipientName || recipientEmail;
  await db.rpc("create_user_notification", {
    p_organization_id: organizationId,
    p_user_id: proposal.created_by || userId,
    p_type: "proposal_sent",
    p_title: "Proposal sent",
    p_body: `"${proposal.title}" was sent to ${recipientLabel}.`,
    p_link: `/proposals/${proposal.id}/edit`,
    p_entity_type: "proposal",
    p_entity_id: proposal.id,
  });

  return {
    ok: true,
    proposalId: proposal.id,
    title: proposal.title,
    recipientEmail,
    url: proposalUrl,
    status: proposalUpdate.status,
    followUpsScheduled: scheduled.length,
  };
}
