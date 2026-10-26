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

/** Reserved for Phase 2 — kept in the union so renderers stay forward-compatible. */
export type ProposalChatComponent = {
  type: "proposal_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: Record<string, unknown>;
};

export type ClientChatComponent = {
  type: "client_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: Record<string, unknown>;
};

export type LeadChatComponent = {
  type: "lead_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: Record<string, unknown>;
};

export type ProjectChatComponent = {
  type: "project_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: Record<string, unknown>;
};

export type TaskChatComponent = {
  type: "task_card";
  entityId: string;
  actions: ChatComponentAction[];
  snapshot?: Record<string, unknown>;
};

export type AssistantChatComponent =
  | InvoiceChatComponent
  | PaymentSummaryChatComponent
  | ProposalChatComponent
  | ClientChatComponent
  | LeadChatComponent
  | ProjectChatComponent
  | TaskChatComponent;

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

function invoiceCardFromToolInvoice(
  inv: Record<string, unknown>,
  fallbackId?: string | null
): InvoiceChatComponent | null {
  const id = asString(inv.id) || fallbackId;
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
          client: prev?.client,
          amount: prev?.amount,
          currency: prev?.currency,
          dueDate: prev?.dueDate,
          description: prev?.description,
        },
      });
      continue;
    }

    if (name === "list_draft_invoices" && Array.isArray(result.invoices)) {
      for (const row of result.invoices.slice(0, 8)) {
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
