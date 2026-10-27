import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { asProposalContent } from "@/lib/proposals/content";
import {
  billingTypeFromProposalContent,
  nextRetainerInvoiceAt,
  type InvoiceKind,
  type ProjectBillingType,
} from "@/lib/projects/billing";
import { generateProjectTasksFromProposal } from "@/lib/projects/ai-tasks";
import { createProjectInvoice } from "@/lib/projects/create-invoice-from-project";
import { convertLeadToClient } from "@/lib/leads/convert";

type Db = SupabaseClient<Database>;

export type ConvertProposalInput = {
  proposalId: string;
  userId: string;
  organizationId: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  billingType?: ProjectBillingType;
  invoiceKind: InvoiceKind;
  depositAmount?: number | null;
  retainerAutoInvoice?: boolean;
  retainerDayOfMonth?: number;
  generateAiTasks?: boolean;
};

export async function convertProposalToProject(
  db: Db,
  input: ConvertProposalInput
) {
  const { data: proposal, error: proposalError } = await db
    .from("proposals")
    .select(
      "id, title, amount, currency, content, client_id, lead_id, project_id, organization_id, status, deleted_at"
    )
    .eq("id", input.proposalId)
    .maybeSingle();

  if (proposalError || !proposal || proposal.deleted_at) {
    throw new Error(proposalError?.message || "Proposal not found.");
  }
  if (proposal.organization_id !== input.organizationId) {
    throw new Error("Forbidden.");
  }
  if (proposal.project_id) {
    throw new Error("This proposal is already linked to a project.");
  }

  let clientId = proposal.client_id;
  if (!clientId && proposal.lead_id) {
    const converted = await convertLeadToClient(db, {
      leadId: proposal.lead_id,
      organizationId: input.organizationId,
      userId: input.userId,
      status: "active",
    });
    clientId = converted.clientId;
    await db
      .from("proposals")
      .update({ client_id: clientId })
      .eq("id", proposal.id);
  }
  if (!clientId) {
    throw new Error("Assign a client or lead to this proposal before converting.");
  }

  const billingType =
    input.billingType ||
    billingTypeFromProposalContent(proposal.content, "fixed");
  const amount = Number(proposal.amount) || 0;
  const currency = proposal.currency || "USD";
  const snapshot = asProposalContent(proposal.content as never);
  const day = Math.min(
    28,
    Math.max(1, Math.floor(input.retainerDayOfMonth || 1))
  );
  const autoInvoice =
    billingType === "retainer" ? Boolean(input.retainerAutoInvoice) : false;

  const { data: project, error: projectError } = await db
    .from("projects")
    .insert({
      organization_id: input.organizationId,
      client_id: clientId,
      proposal_id: proposal.id,
      name: input.name.trim() || proposal.title,
      description: input.description?.trim() || null,
      start_date: input.startDate || new Date().toISOString().slice(0, 10),
      status: "active",
      billing_type: billingType,
      budget_amount: amount > 0 ? amount : null,
      retainer_amount: billingType === "retainer" ? amount : null,
      retainer_currency: billingType === "retainer" ? currency : null,
      retainer_day_of_month: day,
      retainer_auto_invoice: autoInvoice,
      retainer_next_invoice_at: autoInvoice
        ? nextRetainerInvoiceAt(day).toISOString()
        : null,
      created_by: input.userId,
    })
    .select("id, name, billing_type")
    .single();

  if (projectError || !project) {
    throw new Error(projectError?.message || "Could not create project.");
  }

  await db
    .from("proposals")
    .update({
      project_id: project.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposal.id);

  let invoiceId: string | null = null;
  let invoiceNumber: string | null = null;

  if (input.invoiceKind !== "none") {
    let invoiceAmount = amount;
    let description = proposal.title;

    if (input.invoiceKind === "deposit") {
      invoiceAmount = Math.max(0, Number(input.depositAmount) || 0);
      description = `Deposit — ${proposal.title}`;
    } else if (input.invoiceKind === "retainer") {
      invoiceAmount = amount;
      description = `Retainer — ${proposal.title}`;
    } else if (input.invoiceKind === "full") {
      // Prefer line items total if present
      const lines = Array.isArray(snapshot.lineItems) ? snapshot.lineItems : [];
      if (lines.length) {
        invoiceAmount = lines.reduce<number>((sum, raw) => {
          if (!raw || typeof raw !== "object") return sum;
          const item = raw as { qty?: unknown; price?: unknown };
          return sum + (Number(item.qty) || 1) * (Number(item.price) || 0);
        }, 0);
      }
      description = proposal.title;
    }

    if (invoiceAmount > 0) {
      const invoice = await createProjectInvoice(db, {
        organizationId: input.organizationId,
        clientId: clientId,
        projectId: project.id,
        proposalId: proposal.id,
        userId: input.userId,
        currency,
        description,
        amount: invoiceAmount,
        notes: `Created from proposal: ${proposal.title}`,
      });
      invoiceId = invoice.id;
      invoiceNumber = invoice.number;

      if (billingType === "retainer" && input.invoiceKind === "retainer") {
        await db
          .from("projects")
          .update({
            retainer_last_invoiced_at: new Date().toISOString(),
            retainer_next_invoice_at: autoInvoice
              ? nextRetainerInvoiceAt(day).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", project.id);
      }
    }
  }

  let taskCount = 0;
  if (input.generateAiTasks) {
    const tasks = await generateProjectTasksFromProposal({
      title: proposal.title,
      content: proposal.content,
    });
    if (tasks.length) {
      const { error: taskError } = await db.from("tasks").insert(
        tasks.map((task, index) => ({
          organization_id: input.organizationId,
          client_id: clientId,
          project_id: project.id,
          title: task.title,
          description: task.description || null,
          priority: task.priority || "medium",
          column_id: index === 0 ? "todo" : "backlog",
          position: index,
          created_by: input.userId,
        }))
      );
      if (taskError) {
        throw new Error(taskError.message);
      }
      taskCount = tasks.length;
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    billingType: project.billing_type,
    invoiceId,
    invoiceNumber,
    taskCount,
  };
}
