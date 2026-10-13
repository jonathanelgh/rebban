import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAppUrl,
  sendProposalFollowUpEmail,
} from "@/lib/email/resend";

export const runtime = "nodejs";

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const querySecret = new URL(request.url).searchParams.get("secret");
  return bearer === secret || querySecret === secret;
}

async function processDueFollowUps() {
  const supabase = createAdminClient();
  const { data: due, error } = await supabase.rpc(
    "claim_due_proposal_followups",
    { p_limit: 25 }
  );

  if (error) throw new Error(error.message);

  const rows = due || [];
  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const row of rows) {
    const { data: proposal } = await supabase
      .from("proposals")
      .select("id, title, status, organization_id, created_by")
      .eq("id", row.proposal_id)
      .maybeSingle();

    if (
      !proposal ||
      proposal.status === "accepted" ||
      proposal.status === "declined"
    ) {
      await supabase
        .from("proposal_followups")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      cancelled += 1;
      continue;
    }

    const [{ data: org }, { data: profile }, { data: link }] =
      await Promise.all([
        supabase
          .from("organizations")
          .select("name")
          .eq("id", proposal.organization_id)
          .maybeSingle(),
        proposal.created_by
          ? supabase
              .from("profiles")
              .select("full_name")
              .eq("id", proposal.created_by)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        row.share_link_id
          ? supabase
              .from("proposal_share_links")
              .select("token")
              .eq("id", row.share_link_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    if (!link?.token) {
      await supabase
        .from("proposal_followups")
        .update({
          status: "failed",
          error: "Share link missing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed += 1;
      continue;
    }

    const proposalUrl = `${getAppUrl()}/p/${link.token}`;

    try {
      await sendProposalFollowUpEmail({
        to: row.recipient_email,
        recipientName: row.recipient_name,
        senderName: profile?.full_name,
        organizationName: org?.name || "Your freelancer",
        proposalTitle: proposal.title,
        proposalUrl,
        subject: row.subject,
        body: row.body,
        fromUserId: proposal.created_by || row.created_by,
        useAdmin: true,
      });

      await supabase
        .from("proposal_followups")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", row.id);

      await supabase.from("proposal_events").insert({
        organization_id: proposal.organization_id,
        proposal_id: proposal.id,
        share_link_id: row.share_link_id,
        event_type: "followup_sent",
        actor_type: "system",
        actor_email: row.recipient_email,
        actor_name: row.recipient_name,
        metadata: {
          followup_id: row.id,
          step_index: row.step_index,
          sequence_key: row.sequence_key,
        },
      });

      if (proposal.created_by) {
        await supabase.rpc("create_user_notification", {
          p_organization_id: proposal.organization_id,
          p_user_id: proposal.created_by,
          p_type: "proposal_followup_sent",
          p_title: "Follow-up sent",
          p_body: `Follow-up ${row.step_index + 1} for "${proposal.title}" was emailed to ${row.recipient_email}.`,
          p_link: `/proposals/${proposal.id}/edit`,
          p_entity_type: "proposal",
          p_entity_id: proposal.id,
        });
      }

      sent += 1;
    } catch (err) {
      await supabase
        .from("proposal_followups")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : "Send failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return { claimed: rows.length, sent, failed, cancelled };
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueFollowUps();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Follow-up cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
