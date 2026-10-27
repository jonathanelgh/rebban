import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import { sendProposalForOrganization } from "@/lib/proposals/send-proposal";
import { convertLeadToClient } from "@/lib/leads/convert";
import { convertProposalToProject } from "@/lib/projects/convert-from-proposal";
import { pendingActionToJson } from "@/lib/assistant/tools";
import {
  loadClientCard,
  loadLeadCard,
  loadProjectCard,
  loadProposalCard,
  loadTaskCard,
} from "@/lib/assistant/card-loaders";

export const runtime = "nodejs";

type ActionBody = {
  kind?: "proposal" | "client" | "lead" | "project" | "task";
  action?: string;
  entityId?: string;
  conversationId?: string | null;
};

async function clearPendingProposal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  conversationId: string | null | undefined,
  proposalId: string
) {
  if (!conversationId) return;
  const { data: conversation } = await supabase
    .from("assistant_conversations")
    .select("id, pending_action")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .eq("channel", "in_app")
    .maybeSingle();
  if (!conversation) return;
  const pending = conversation.pending_action as {
    type?: string;
    proposal_id?: string;
  } | null;
  if (pending?.type === "send_proposal" && pending.proposal_id === proposalId) {
    await supabase
      .from("assistant_conversations")
      .update({ pending_action: pendingActionToJson(null) })
      .eq("id", conversation.id);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = await getActiveOrganizationId(supabase, user.id);
  if (!organizationId) {
    return NextResponse.json(
      { error: "No active workspace found for this user." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => null)) as ActionBody | null;
  const kind = body?.kind;
  const action = body?.action;
  const entityId = body?.entityId?.trim();
  if (!kind || !action || !entityId) {
    return NextResponse.json(
      { error: "kind, action, and entityId are required." },
      { status: 400 }
    );
  }

  try {
    if (kind === "proposal") {
      if (action === "approve_and_send") {
        const result = await sendProposalForOrganization({
          db: supabase,
          proposalId: entityId,
          organizationId,
          userId: user.id,
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        await clearPendingProposal(
          supabase,
          user.id,
          body.conversationId,
          entityId
        );
        const component = await loadProposalCard(
          supabase,
          organizationId,
          entityId
        );
        return NextResponse.json({
          ok: true,
          sent: true,
          status: result.status,
          component,
        });
      }

      if (action === "convert_to_project") {
        const { data: proposal } = await supabase
          .from("proposals")
          .select("id, title, status, project_id")
          .eq("id", entityId)
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!proposal) {
          return NextResponse.json(
            { error: "Proposal not found." },
            { status: 404 }
          );
        }
        if (proposal.project_id) {
          const projectCard = await loadProjectCard(
            supabase,
            organizationId,
            proposal.project_id
          );
          return NextResponse.json({
            ok: true,
            converted: true,
            projectId: proposal.project_id,
            component: await loadProposalCard(
              supabase,
              organizationId,
              entityId
            ),
            projectComponent: projectCard,
          });
        }
        if (proposal.status !== "accepted") {
          return NextResponse.json(
            {
              error:
                "Only accepted proposals can be converted to a project from chat.",
            },
            { status: 400 }
          );
        }
        const result = await convertProposalToProject(supabase, {
          proposalId: entityId,
          userId: user.id,
          organizationId,
          name: proposal.title || "New project",
          invoiceKind: "none",
          generateAiTasks: false,
        });
        const proposalCard = await loadProposalCard(
          supabase,
          organizationId,
          entityId
        );
        const projectCard = result.projectId
          ? await loadProjectCard(supabase, organizationId, result.projectId)
          : null;
        return NextResponse.json({
          ok: true,
          converted: true,
          projectId: result.projectId,
          component: proposalCard,
          projectComponent: projectCard,
        });
      }

      return NextResponse.json({ error: "Unknown proposal action." }, { status: 400 });
    }

    if (kind === "lead" && action === "convert_to_client") {
      const converted = await convertLeadToClient(supabase, {
        leadId: entityId,
        organizationId,
        userId: user.id,
        status: "prospect",
      });
      const leadComponent = await loadLeadCard(
        supabase,
        organizationId,
        entityId
      );
      const clientComponent = converted.clientId
        ? await loadClientCard(supabase, organizationId, converted.clientId)
        : null;
      return NextResponse.json({
        ok: true,
        converted: true,
        clientId: converted.clientId,
        component: leadComponent,
        clientComponent,
      });
    }

    if (kind === "task" && action === "mark_complete") {
      const { error } = await supabase
        .from("tasks")
        .update({ column_id: "done" })
        .eq("id", entityId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const component = await loadTaskCard(supabase, organizationId, entityId);
      return NextResponse.json({ ok: true, component });
    }

    if (kind === "project" && action === "mark_complete") {
      const { error } = await supabase
        .from("projects")
        .update({ status: "completed" })
        .eq("id", entityId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const component = await loadProjectCard(
        supabase,
        organizationId,
        entityId
      );
      return NextResponse.json({ ok: true, component });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Action failed.",
      },
      { status: 400 }
    );
  }
}
