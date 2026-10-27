/**
 * Structured interactive components for Rebban Assistant (in-app / native).
 * The model never emits HTML — components are derived from validated tool results.
 */

export type ChatComponentAction =
  | "edit"
  | "approve_and_send"
  | "view"
  | "cancel_draft"
  | "preview"
  | "convert_to_project"
  | "create_proposal"
  | "create_invoice"
  | "create_project"
  | "convert_to_client"
  | "create_follow_up"
  | "add_task"
  | "log_time"
  | "mark_complete";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "paid"
  | "overdue"
  | "void";

export type InvoiceCardSnapshot = {
  client?: string | null;
  number?: string | null;
  amount?: string | null;
  amountRaw?: number | null;
  currency?: string | null;
  dueDate?: string | null;
  status?: InvoiceStatus | string | null;
  description?: string | null;
};

export type InvoiceChatComponent = {
  type: "invoice_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: InvoiceCardSnapshot;
};

export type PaymentSummaryInvoice = {
  entityId: string;
  client: string;
  amount: string;
  dueDate?: string | null;
  status?: string | null;
  daysOverdue?: number | null;
  number?: string | null;
};

export type PaymentSummaryChatComponent = {
  type: "payment_summary";
  entityId: string;
  actions: ChatComponentAction[];
  invoices: PaymentSummaryInvoice[];
  totalOutstanding?: string | null;
  currency?: string | null;
};

export type ProposalCardSnapshot = {
  client?: string | null;
  title?: string | null;
  amount?: string | null;
  amountRaw?: number | null;
  currency?: string | null;
  status?: string | null;
  summary?: string | null;
  expiresAt?: string | null;
};

export type ProposalChatComponent = {
  type: "proposal_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: ProposalCardSnapshot;
};

export type ClientCardSnapshot = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  website?: string | null;
};

export type ClientChatComponent = {
  type: "client_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: ClientCardSnapshot;
};

export type LeadCardSnapshot = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  notes?: string | null;
  followUpAt?: string | null;
  source?: string | null;
};

export type LeadChatComponent = {
  type: "lead_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: LeadCardSnapshot;
};

export type ProjectCardSnapshot = {
  name?: string | null;
  client?: string | null;
  status?: string | null;
  tasksDone?: number | null;
  tasksOpen?: number | null;
  trackedHours?: string | null;
  billingType?: string | null;
};

export type ProjectChatComponent = {
  type: "project_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: ProjectCardSnapshot;
};

export type TaskCardSnapshot = {
  title?: string | null;
  project?: string | null;
  client?: string | null;
  dueDate?: string | null;
  status?: string | null;
  priority?: string | null;
};

export type TaskChatComponent = {
  type: "task_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: TaskCardSnapshot;
};

export type TimeSummaryClient = {
  clientId?: string | null;
  client: string;
  hours: string;
  amount?: string | null;
};

export type TimeSummaryChatComponent = {
  type: "time_summary";
  entityId: string;
  actions: ChatComponentAction[];
  clients: TimeSummaryClient[];
  totalHours?: string | null;
  totalAmount?: string | null;
  currency?: string | null;
};

export type AssistantChatComponent =
  | InvoiceChatComponent
  | PaymentSummaryChatComponent
  | ProposalChatComponent
  | ClientChatComponent
  | LeadChatComponent
  | ProjectChatComponent
  | TaskChatComponent
  | TimeSummaryChatComponent;

export type AssistantMessageMetadata = {
  components?: AssistantChatComponent[];
};

export type ToolResultRecord = {
  name: string;
  result: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function daysOverdue(dueDate: string | null | undefined, status?: string | null) {
  if (!dueDate) return null;
  if (status === "paid" || status === "void" || status === "draft") return null;
  const due = new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}

export function actionsForInvoiceStatus(
  status: string | null | undefined
): ChatComponentAction[] {
  switch (status) {
    case "draft":
      return ["edit", "approve_and_send", "view", "cancel_draft"];
    case "sent":
    case "viewed":
    case "overdue":
      return ["view", "edit"];
    case "paid":
    case "void":
      return ["view"];
    default:
      return ["view"];
  }
}

export function actionsForProposalStatus(
  status: string | null | undefined
): ChatComponentAction[] {
  switch (status) {
    case "draft":
      return ["edit", "preview", "approve_and_send", "view"];
    case "sent":
    case "viewed":
      return ["view", "preview", "edit"];
    case "accepted":
      return ["view", "preview", "convert_to_project"];
    case "declined":
      return ["view", "edit"];
    default:
      return ["view"];
  }
}

export function actionsForClientStatus(
  _status?: string | null
): ChatComponentAction[] {
  return ["view", "edit", "create_proposal", "create_invoice", "create_project"];
}

export function actionsForLeadStatus(
  status: string | null | undefined
): ChatComponentAction[] {
  if (status === "won" || status === "lost") {
    return ["view"];
  }
  return ["view", "edit", "convert_to_client", "create_follow_up"];
}

export function actionsForProjectStatus(
  status: string | null | undefined
): ChatComponentAction[] {
  if (status === "completed" || status === "archived") {
    return ["view", "add_task", "log_time"];
  }
  return ["view", "add_task", "log_time", "mark_complete"];
}

export function actionsForTaskStatus(
  status: string | null | undefined
): ChatComponentAction[] {
  if (status === "done") return ["view", "edit"];
  return ["mark_complete", "edit", "view"];
}

function invoiceCardFromToolInvoice(
  inv: Record<string, unknown>
): InvoiceChatComponent | null {
  const id = asString(inv.id);
  if (!id) return null;
  const status = asString(inv.status) || "draft";
  return {
    type: "invoice_card",
    entityId: id,
    actions: actionsForInvoiceStatus(status),
    snapshot: {
      client: asString(inv.client),
      number: asString(inv.number),
      amount: asString(inv.amount),
      amountRaw: asNumber(inv.amount_raw) ?? asNumber(inv.total),
      currency: asString(inv.currency),
      dueDate: asString(inv.due_date) || asString(inv.dueDate),
      status,
      description: asString(inv.description),
    },
  };
}

function proposalCardFromTool(row: Record<string, unknown>): ProposalChatComponent | null {
  const id = asString(row.id);
  if (!id) return null;
  const status = asString(row.status) || "draft";
  return {
    type: "proposal_card",
    entityId: id,
    actions: actionsForProposalStatus(status),
    snapshot: {
      client: asString(row.client),
      title: asString(row.title),
      amount: asString(row.amount),
      amountRaw: asNumber(row.amount_raw) ?? asNumber(row.total),
      currency: asString(row.currency),
      status,
      summary: asString(row.summary) || asString(row.message),
      expiresAt: asString(row.expires_at) || asString(row.expiresAt),
    },
  };
}

function clientCardFromTool(row: Record<string, unknown>): ClientChatComponent | null {
  const id = asString(row.id);
  if (!id) return null;
  const status = asString(row.status) || "active";
  return {
    type: "client_card",
    entityId: id,
    actions: actionsForClientStatus(status),
    snapshot: {
      name: asString(row.name) || asString(row.label),
      company: asString(row.company),
      email: asString(row.email),
      phone: asString(row.phone),
      status,
      website: asString(row.website),
    },
  };
}

function leadCardFromTool(row: Record<string, unknown>): LeadChatComponent | null {
  const id = asString(row.id);
  if (!id) return null;
  const status = asString(row.status) || "new";
  return {
    type: "lead_card",
    entityId: id,
    actions: actionsForLeadStatus(status),
    snapshot: {
      name: asString(row.name),
      company: asString(row.company),
      email: asString(row.email),
      phone: asString(row.phone),
      status,
      notes: asString(row.notes),
      followUpAt: asString(row.follow_up_at) || asString(row.followUpAt),
      source: asString(row.source),
    },
  };
}

function projectCardFromTool(row: Record<string, unknown>): ProjectChatComponent | null {
  const id = asString(row.id);
  if (!id) return null;
  const status = asString(row.status) || "active";
  return {
    type: "project_card",
    entityId: id,
    actions: actionsForProjectStatus(status),
    snapshot: {
      name: asString(row.name),
      client: asString(row.client),
      status,
      tasksDone: asNumber(row.tasks_done) ?? asNumber(row.tasksDone),
      tasksOpen: asNumber(row.tasks_open) ?? asNumber(row.tasksOpen),
      trackedHours: asString(row.tracked_hours) || asString(row.trackedHours),
      billingType: asString(row.billing_type) || asString(row.billingType),
    },
  };
}

function taskCardFromTool(row: Record<string, unknown>): TaskChatComponent | null {
  const id = asString(row.id);
  if (!id) return null;
  const status = asString(row.column) || asString(row.status) || "todo";
  return {
    type: "task_card",
    entityId: id,
    actions: actionsForTaskStatus(status),
    snapshot: {
      title: asString(row.title),
      project: asString(row.project),
      client: asString(row.client),
      dueDate: asString(row.due_date) || asString(row.dueDate),
      status,
      priority: asString(row.priority),
    },
  };
}

/**
 * Build UI components from successful assistant tool results (last turn).
 * Dedupes by entity id; later results win (e.g. update after create).
 */
export function deriveComponentsFromToolResults(
  toolResults: ToolResultRecord[]
): AssistantChatComponent[] {
  const byKey = new Map<string, AssistantChatComponent>();

  for (const { name, result } of toolResults) {
    if (!result || result.error) continue;

    if (
      name === "create_invoice_draft" ||
      name === "create_invoice_from_unbilled" ||
      name === "get_invoice" ||
      name === "update_invoice_draft"
    ) {
      const inv = asRecord(result.invoice);
      if (!inv) continue;
      const card = invoiceCardFromToolInvoice(inv);
      if (card) byKey.set(`invoice:${card.entityId}`, card);
      continue;
    }

    if (
      name === "create_invoices_from_unbilled_batch" &&
      Array.isArray(result.invoices)
    ) {
      for (const row of result.invoices.slice(0, 8)) {
        const inv = asRecord(row);
        if (!inv) continue;
        const card = invoiceCardFromToolInvoice(inv);
        if (card) byKey.set(`invoice:${card.entityId}`, card);
      }
      continue;
    }

    if (name === "send_invoice" && result.ok === true) {
      const id =
        asString(result.invoice_id) ||
        asString(asRecord(result.invoice)?.id);
      if (!id) continue;
      const status = asString(result.status) || "sent";
      const existing = byKey.get(`invoice:${id}`);
      const prev =
        existing?.type === "invoice_card" ? existing.snapshot : undefined;
      byKey.set(`invoice:${id}`, {
        type: "invoice_card",
        entityId: id,
        actions: actionsForInvoiceStatus(status),
        snapshot: {
          ...prev,
          number: asString(result.number) || prev?.number,
          status,
        },
      });
      continue;
    }

    if (name === "list_draft_invoices" && Array.isArray(result.invoices)) {
      for (const row of result.invoices.slice(0, 5)) {
        const inv = asRecord(row);
        if (!inv) continue;
        const card = invoiceCardFromToolInvoice(inv);
        if (card) byKey.set(`invoice:${card.entityId}`, card);
      }
      continue;
    }

    if (name === "list_unpaid_invoices" && Array.isArray(result.invoices)) {
      const invoices: PaymentSummaryInvoice[] = [];
      for (const row of result.invoices.slice(0, 25)) {
        const inv = asRecord(row);
        if (!inv) continue;
        const id = asString(inv.id);
        if (!id) continue;
        const due = asString(inv.due_date);
        const status = asString(inv.status);
        invoices.push({
          entityId: id,
          client: asString(inv.client) || "Unknown",
          amount: asString(inv.amount) || "—",
          dueDate: due,
          status,
          number: asString(inv.number),
          daysOverdue: daysOverdue(due, status),
        });
      }
      if (invoices.length) {
        byKey.set("payment_summary:unpaid", {
          type: "payment_summary",
          entityId: "unpaid",
          actions: ["view"],
          invoices,
          totalOutstanding:
            typeof result.total_outstanding_hint === "number"
              ? String(result.total_outstanding_hint)
              : null,
          currency: null,
        });
      }
      continue;
    }

    if (
      name === "create_proposal_draft" ||
      name === "get_proposal" ||
      name === "list_draft_proposals"
    ) {
      if (name === "list_draft_proposals" && Array.isArray(result.proposals)) {
        for (const row of result.proposals.slice(0, 5)) {
          const rec = asRecord(row);
          if (!rec) continue;
          const card = proposalCardFromTool(rec);
          if (card) byKey.set(`proposal:${card.entityId}`, card);
        }
      } else {
        const prop = asRecord(result.proposal);
        if (prop) {
          const card = proposalCardFromTool(prop);
          if (card) byKey.set(`proposal:${card.entityId}`, card);
        }
      }
      continue;
    }

    if (name === "send_proposal" && result.ok === true) {
      const id =
        asString(result.proposal_id) ||
        asString(asRecord(result.proposal)?.id);
      if (!id) continue;
      const status = asString(result.status) || "sent";
      const existing = byKey.get(`proposal:${id}`);
      const prev =
        existing?.type === "proposal_card" ? existing.snapshot : undefined;
      byKey.set(`proposal:${id}`, {
        type: "proposal_card",
        entityId: id,
        actions: actionsForProposalStatus(status),
        snapshot: {
          ...prev,
          title: asString(result.title) || prev?.title,
          status,
        },
      });
      continue;
    }

    if (
      name === "add_client" ||
      name === "update_client" ||
      name === "get_client" ||
      name === "find_client" ||
      name === "list_clients"
    ) {
      if (
        (name === "find_client" || name === "list_clients") &&
        Array.isArray(result.clients)
      ) {
        for (const row of result.clients.slice(0, 5)) {
          const rec = asRecord(row);
          if (!rec) continue;
          const card = clientCardFromTool(rec);
          if (card) byKey.set(`client:${card.entityId}`, card);
        }
      } else {
        const client = asRecord(result.client);
        if (client) {
          const card = clientCardFromTool(client);
          if (card) byKey.set(`client:${card.entityId}`, card);
        }
      }
      continue;
    }

    if (
      name === "add_lead" ||
      name === "get_lead" ||
      name === "find_lead" ||
      name === "list_leads" ||
      name === "convert_lead_to_client"
    ) {
      if (
        (name === "find_lead" || name === "list_leads") &&
        Array.isArray(result.leads)
      ) {
        for (const row of result.leads.slice(0, 5)) {
          const rec = asRecord(row);
          if (!rec) continue;
          const card = leadCardFromTool(rec);
          if (card) byKey.set(`lead:${card.entityId}`, card);
        }
      } else {
        const lead = asRecord(result.lead);
        if (lead) {
          const card = leadCardFromTool(lead);
          if (card) byKey.set(`lead:${card.entityId}`, card);
        }
        const client = asRecord(result.client);
        if (client) {
          const card = clientCardFromTool(client);
          if (card) byKey.set(`client:${card.entityId}`, card);
        }
      }
      continue;
    }

    if (
      name === "create_project" ||
      name === "get_project" ||
      name === "find_project" ||
      name === "list_projects"
    ) {
      if (
        (name === "find_project" || name === "list_projects") &&
        Array.isArray(result.projects)
      ) {
        for (const row of result.projects.slice(0, 5)) {
          const rec = asRecord(row);
          if (!rec) continue;
          const card = projectCardFromTool(rec);
          if (card) byKey.set(`project:${card.entityId}`, card);
        }
      } else {
        const project = asRecord(result.project);
        if (project) {
          const card = projectCardFromTool(project);
          if (card) byKey.set(`project:${card.entityId}`, card);
        }
      }
      continue;
    }

    if (name === "convert_proposal_to_project" && result.ok === true) {
      const projectId = asString(result.project_id);
      if (projectId) {
        byKey.set(`project:${projectId}`, {
          type: "project_card",
          entityId: projectId,
          actions: ["view"],
          snapshot: {
            name: asString(result.project_name) || undefined,
            status: "active",
          },
        });
      }
      const invoiceId = asString(result.invoice_id);
      if (invoiceId) {
        byKey.set(`invoice:${invoiceId}`, {
          type: "invoice_card",
          entityId: invoiceId,
          actions: actionsForInvoiceStatus("draft"),
          snapshot: {
            number: asString(result.invoice_number) || undefined,
            status: "draft",
          },
        });
      }
      continue;
    }

    if (name === "list_proposals" && Array.isArray(result.proposals)) {
      for (const row of result.proposals.slice(0, 5)) {
        const rec = asRecord(row);
        if (!rec) continue;
        const card = proposalCardFromTool(rec);
        if (card) byKey.set(`proposal:${card.entityId}`, card);
      }
      continue;
    }

    if (
      name === "create_task" ||
      name === "get_task" ||
      name === "update_task" ||
      name === "list_tasks"
    ) {
      if (name === "list_tasks" && Array.isArray(result.tasks)) {
        for (const row of result.tasks.slice(0, 5)) {
          const rec = asRecord(row);
          if (!rec) continue;
          const card = taskCardFromTool(rec);
          if (card) byKey.set(`task:${card.entityId}`, card);
        }
      } else {
        const task = asRecord(result.task);
        if (task) {
          const card = taskCardFromTool(task);
          if (card) byKey.set(`task:${card.entityId}`, card);
        }
      }
      continue;
    }

    if (name === "list_unbilled_hours" && result.ok === true) {
      const clients: TimeSummaryClient[] = [];
      if (Array.isArray(result.clients)) {
        for (const row of result.clients.slice(0, 10)) {
          const rec = asRecord(row);
          if (!rec) continue;
          clients.push({
            clientId: asString(rec.client_id) || asString(rec.id),
            client:
              asString(rec.client) ||
              asString(rec.name) ||
              asString(rec.label) ||
              "Client",
            hours:
              asString(rec.hours) ||
              (asNumber(rec.hours_raw) != null
                ? String(asNumber(rec.hours_raw))
                : "—"),
            amount: asString(rec.amount),
          });
        }
      }
      byKey.set("time_summary:unbilled", {
        type: "time_summary",
        entityId: "unbilled",
        actions: ["create_invoice", "view"],
        clients,
        totalHours:
          asString(result.total_hours) ||
          (asNumber(result.total_hours) != null
            ? String(asNumber(result.total_hours))
            : null),
        totalAmount:
          asString(result.total_amount) ||
          (asNumber(result.total_amount) != null
            ? String(asNumber(result.total_amount))
            : null),
        currency: asString(result.currency),
      });
    }
  }

  return [...byKey.values()];
}

export function parseMessageComponents(
  metadata: unknown
): AssistantChatComponent[] {
  const meta = asRecord(metadata);
  const list = meta?.components;
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is AssistantChatComponent => {
    const rec = asRecord(item);
    return Boolean(rec && asString(rec.type) && asString(rec.entityId));
  });
}

export function messageMetadataToJson(
  components: AssistantChatComponent[]
): AssistantMessageMetadata {
  return { components };
}
