import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import {
  billingTypeFromProposalContent,
  defaultDepositAmount,
  type InvoiceKind,
} from "@/lib/projects/billing";
import { asProposalContent } from "@/lib/proposals/content";
import {
  formatProposalAcceptedAssistantMessage,
  type ProposalInvoiceAsk,
} from "@/lib/assistant/event-messages";
import { sendAssistantOutbound } from "@/lib/assistant/outbound";
import type { AssistantPendingAction } from "@/lib/assistant/tools";

type Db = SupabaseClient<Database>;

function detectInvoiceAsk(
  amount: number,
  currency: string,
  content: unknown
): { ask: ProposalInvoiceAsk | null; kind: InvoiceKind; depositAmount: number | null } {
  const billing = billingTypeFromProposalContent(content, "fixed");
  if (billing === "retainer") {
    return { ask: { kind: "retainer" }, kind: "retainer", depositAmount: null };
  }

  const snapshot = asProposalContent(content as never);
  const milestones = Array.isArray(snapshot.paymentMilestones)
    ? snapshot.paymentMilestones
    : [];
  const raw = JSON.stringify(content || {}).toLowerCase();
  const mentionsDeposit =
    milestones.some((m) => {
      if (!m || typeof m !== "object") return false;
      const label = String(
        (m as Record<string, unknown>).label ||
          (m as Record<string, unknown>).title ||
          ""
      ).toLowerCase();
      return label.includes("deposit") || label.includes("upfront");
    }) ||
    raw.includes("deposit") ||
    raw.includes("upfront") ||
    raw.includes("due on acceptance");

  if (mentionsDeposit) {
    const deposit = defaultDepositAmount(amount, content);
    if (deposit > 0) {
      return {
        ask: {
          kind: "deposit",
          amountLabel: formatInvoiceMoney(deposit, currency),
        },
        kind: "deposit",
        depositAmount: deposit,
      };
    }
  }

  // No explicit deposit/retainer in the proposal — still offer a first invoice.
  if (amount > 0) {
    return {
      ask: {
        kind: "full",
        amountLabel: formatInvoiceMoney(amount, currency),
      },
      kind: "full",
      depositAmount: null,
    };
  }

  return {
    ask: { kind: "full" },
    kind: "full",
    depositAmount: null,
  };
}

export async function notifyAssistantProposalAccepted(
  db: Db,
  proposalId: string
) {
  const { data: proposal, error } = await db
    .from("proposals")
    .select(
      "id, title, amount, currency, content, status, project_id, organization_id, created_by, client_id, clients(name, company)"
    )
    .eq("id", proposalId)
    .maybeSingle();

  if (error || !proposal || proposal.status !== "accepted") {
    return { ok: false as const, error: error?.message || "Not accepted" };
  }

  const clients = proposal.clients as
    | { name: string; company: string | null }
    | null
    | undefined;
  const clientLabel =
    clients?.company?.trim() || clients?.name || "Your client";

  let userId = proposal.created_by;
  if (!userId) {
    const { data: members } = await db
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", proposal.organization_id)
      .eq("status", "active")
      .in("role", ["owner", "admin"]);
    userId =
      members?.find((m) => m.role === "owner")?.user_id ||
      members?.find((m) => m.role === "admin")?.user_id ||
      null;
  }
  if (!userId) {
    return { ok: false as const, error: "No user to notify" };
  }

  const { data: profile } = await db
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const amount = Number(proposal.amount) || 0;
  const currency = proposal.currency || "EUR";
  const detected = detectInvoiceAsk(amount, currency, proposal.content);
  const alreadyHasProject = Boolean(proposal.project_id);

  const message = formatProposalAcceptedAssistantMessage({
    userName: profile?.full_name,
    clientLabel,
    proposalTitle: proposal.title,
    alreadyHasProject,
    invoiceAsk: detected.ask,
  });

  let pendingAction: AssistantPendingAction | null = null;
  if (!alreadyHasProject) {
    pendingAction = {
      type: "propose_convert_proposal",
      proposal_id: proposal.id,
      title: proposal.title,
      client_label: clientLabel,
      suggest_invoice_kind: detected.kind,
      deposit_amount: detected.depositAmount,
    };
  }

  await sendAssistantOutbound({
    db,
    organizationId: proposal.organization_id,
    userId,
    message,
    pendingAction,
    notification: {
      type: "proposal_accepted",
      title: "Proposal accepted",
      body: `${clientLabel} accepted “${proposal.title}”.`,
      link: `/proposals/${proposal.id}/edit`,
      entityType: "proposal",
      entityId: proposal.id,
    },
  });

  return { ok: true as const };
}
