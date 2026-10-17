import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { computeEntitlement } from "@/lib/billing/plan";
import {
  getActiveOrganizationId,
  getOrganizationStripeState,
} from "@/lib/stripe/org";
import { sendSupportEscalationEmails } from "@/lib/support/email";
import {
  escalateTicket,
  formatTicketRef,
  type SupportTicketPriority,
} from "@/lib/support/tickets";

type Db = SupabaseClient<Database>;

export type SupportToolContext = {
  db: Db;
  userId: string;
  organizationId: string;
  ticketId: string;
  requesterEmail?: string | null;
  requesterName?: string | null;
  organizationName?: string | null;
};

/** OpenAI Chat Completions tool schema. */
export const SUPPORT_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "get_account_plan",
      description:
        "Get the authenticated user's workspace plan, trial status, and Stripe Connect payout setup.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_clients",
      description: "List clients in the user's workspace. Optional search by name, email, or company.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional search text for name, email, or company",
          },
          limit: {
            type: "number",
            description: "Max results (default 10, max 25)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_client",
      description: "Get one client by id, name, or email, plus counts of related proposals and invoices.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Client id, name, email, or company",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_proposals",
      description: "List proposals in the workspace. Filter by status or search title.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Optional proposal status filter",
          },
          query: {
            type: "string",
            description: "Optional title search",
          },
          limit: { type: "number", description: "Max results (default 10, max 25)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_proposal",
      description: "Get details for one proposal by id or title.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Proposal id or title text",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_invoices",
      description: "List invoices. Filter by status or search invoice number.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Optional invoice status filter",
          },
          query: {
            type: "string",
            description: "Optional invoice number search",
          },
          limit: { type: "number", description: "Max results (default 10, max 25)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_invoice",
      description: "Get details for one invoice by id or number.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Invoice id or number",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description: "List recent tasks. Optionally filter by board column.",
      parameters: {
        type: "object",
        properties: {
          column: {
            type: "string",
            description: "Optional task column / board status",
          },
          limit: { type: "number", description: "Max results (default 10, max 25)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_time_summary",
      description:
        "Summarize recent time tracking for the user (hours logged, billable vs non-billable).",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Lookback window in days (default 30, max 90)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_email_connections",
      description: "Check whether Gmail and/or Outlook are connected for sending.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "escalate_to_human",
      description:
        "Escalate this support conversation to a human agent when you cannot fully resolve the issue (bugs needing investigation, billing disputes, account access problems, feature requests that need a decision, or the user explicitly asks for a human). A human will email the user within 24 hours. Call this instead of inventing fixes.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description:
              "Short clear summary of why a human is needed and what the user needs",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "Urgency for the human queue (default high)",
          },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
];

function clampLimit(value: unknown, fallback = 10, max = 25) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

function money(amount: number | null | undefined, currency = "USD") {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

async function getAccountPlan(ctx: SupportToolContext) {
  const org = await getOrganizationStripeState(ctx.db, ctx.organizationId);
  if (!org) return { error: "Workspace not found." };

  const entitlement = computeEntitlement({
    subscriptionStatus: org.stripe_subscription_status,
    trialEndsAt: org.trial_ends_at,
    complimentaryPro: org.complimentary_pro,
  });

  return {
    workspace: org.name,
    planLabel: entitlement.planLabel,
    entitled: entitlement.entitled,
    paying:
      org.stripe_subscription_status === "active" ||
      org.stripe_subscription_status === "past_due",
    complimentaryPro: entitlement.complimentaryPro,
    trialActive: entitlement.trialActive,
    trialDaysLeft: entitlement.trialDaysLeft,
    trialEndsAt: entitlement.trialEndsAt,
    subscriptionStatus: org.stripe_subscription_status,
    stripeConnect: {
      connected: Boolean(org.stripe_account_id),
      chargesEnabled: org.stripe_charges_enabled,
      payoutsEnabled: org.stripe_payouts_enabled,
      detailsSubmitted: org.stripe_details_submitted,
    },
  };
}

async function listClients(ctx: SupportToolContext, args: Record<string, unknown>) {
  const limit = clampLimit(args.limit);
  const q = typeof args.query === "string" ? args.query.trim() : "";

  let query = ctx.db
    .from("clients")
    .select("id, name, company, email, status, created_at")
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (q) {
    const pattern = `%${q}%`;
    query = query.or(
      `name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern}`
    );
  }

  const { data, error } = await query;
  if (error) return { error: error.message };
  return {
    count: data?.length || 0,
    clients: (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      email: c.email,
      status: c.status,
    })),
  };
}

async function getClient(ctx: SupportToolContext, args: Record<string, unknown>) {
  const q = typeof args.query === "string" ? args.query.trim() : "";
  if (!q) return { error: "query is required" };

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      q
    );

  let clientQuery = ctx.db
    .from("clients")
    .select("id, name, company, email, phone, website, status, notes, created_at")
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .limit(5);

  if (isUuid) {
    clientQuery = clientQuery.eq("id", q);
  } else {
    const pattern = `%${q}%`;
    clientQuery = clientQuery.or(
      `name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern}`
    );
  }

  const { data: clients, error } = await clientQuery;
  if (error) return { error: error.message };
  const client = clients?.[0];
  if (!client) return { error: "Client not found." };

  const [{ count: proposalCount }, { count: invoiceCount }] = await Promise.all([
    ctx.db
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId)
      .eq("client_id", client.id)
      .is("deleted_at", null),
    ctx.db
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId)
      .eq("client_id", client.id)
      .is("deleted_at", null),
  ]);

  return {
    client,
    proposalCount: proposalCount || 0,
    invoiceCount: invoiceCount || 0,
  };
}

async function listProposals(
  ctx: SupportToolContext,
  args: Record<string, unknown>
) {
  const limit = clampLimit(args.limit);
  const status = typeof args.status === "string" ? args.status.trim() : "";
  const q = typeof args.query === "string" ? args.query.trim() : "";

  let query = ctx.db
    .from("proposals")
    .select("id, title, status, amount, currency, sent_at, viewed_at, accepted_at, created_at, client_id")
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status as Database["public"]["Enums"]["proposal_status"]);
  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return {
    count: data?.length || 0,
    proposals: (data || []).map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      amount: money(p.amount, p.currency),
      sentAt: p.sent_at,
      viewedAt: p.viewed_at,
      acceptedAt: p.accepted_at,
    })),
  };
}

async function getProposal(ctx: SupportToolContext, args: Record<string, unknown>) {
  const q = typeof args.query === "string" ? args.query.trim() : "";
  if (!q) return { error: "query is required" };

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      q
    );

  let query = ctx.db
    .from("proposals")
    .select(
      "id, title, status, amount, currency, sent_at, viewed_at, accepted_at, declined_at, expires_at, created_at, client_id"
    )
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .limit(5);

  if (isUuid) query = query.eq("id", q);
  else query = query.ilike("title", `%${q}%`);

  const { data: proposals, error } = await query;
  if (error) return { error: error.message };
  const proposal = proposals?.[0];
  if (!proposal) return { error: "Proposal not found." };

  let clientName: string | null = null;
  if (proposal.client_id) {
    const { data: client } = await ctx.db
      .from("clients")
      .select("name")
      .eq("id", proposal.client_id)
      .maybeSingle();
    clientName = client?.name || null;
  }

  return {
    id: proposal.id,
    title: proposal.title,
    status: proposal.status,
    amount: money(proposal.amount, proposal.currency),
    clientName,
    sentAt: proposal.sent_at,
    viewedAt: proposal.viewed_at,
    acceptedAt: proposal.accepted_at,
    declinedAt: proposal.declined_at,
    expiresAt: proposal.expires_at,
  };
}

async function listInvoices(
  ctx: SupportToolContext,
  args: Record<string, unknown>
) {
  const limit = clampLimit(args.limit);
  const status = typeof args.status === "string" ? args.status.trim() : "";
  const q = typeof args.query === "string" ? args.query.trim() : "";

  let query = ctx.db
    .from("invoices")
    .select(
      "id, number, status, total, currency, due_date, sent_at, paid_at, viewed_at, created_at, client_id"
    )
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status as Database["public"]["Enums"]["invoice_status"]);
  }
  if (q) query = query.ilike("number", `%${q}%`);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return {
    count: data?.length || 0,
    invoices: (data || []).map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      total: money(inv.total, inv.currency),
      dueDate: inv.due_date,
      sentAt: inv.sent_at,
      paidAt: inv.paid_at,
    })),
  };
}

async function getInvoice(ctx: SupportToolContext, args: Record<string, unknown>) {
  const q = typeof args.query === "string" ? args.query.trim() : "";
  if (!q) return { error: "query is required" };

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      q
    );

  let query = ctx.db
    .from("invoices")
    .select(
      "id, number, status, total, subtotal, tax_total, currency, due_date, issue_date, sent_at, paid_at, viewed_at, client_id, stripe_payment_status"
    )
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .limit(5);

  if (isUuid) query = query.eq("id", q);
  else query = query.ilike("number", `%${q}%`);

  const { data: invoices, error } = await query;
  if (error) return { error: error.message };
  const invoice = invoices?.[0];
  if (!invoice) return { error: "Invoice not found." };

  let clientName: string | null = null;
  if (invoice.client_id) {
    const { data: client } = await ctx.db
      .from("clients")
      .select("name")
      .eq("id", invoice.client_id)
      .maybeSingle();
    clientName = client?.name || null;
  }

  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    total: money(invoice.total, invoice.currency),
    subtotal: money(invoice.subtotal, invoice.currency),
    taxTotal: money(invoice.tax_total, invoice.currency),
    clientName,
    dueDate: invoice.due_date,
    issueDate: invoice.issue_date,
    sentAt: invoice.sent_at,
    paidAt: invoice.paid_at,
    viewedAt: invoice.viewed_at,
    stripePaymentStatus: invoice.stripe_payment_status,
  };
}

async function listTasks(ctx: SupportToolContext, args: Record<string, unknown>) {
  const limit = clampLimit(args.limit);
  const column = typeof args.column === "string" ? args.column.trim() : "";

  let query = ctx.db
    .from("tasks")
    .select("id, title, column_id, priority, due_date, created_at")
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (column) {
    query = query.eq(
      "column_id",
      column as Database["public"]["Enums"]["task_column"]
    );
  }

  const { data, error } = await query;
  if (error) return { error: error.message };
  return {
    count: data?.length || 0,
    tasks: data || [],
  };
}

async function getTimeSummary(
  ctx: SupportToolContext,
  args: Record<string, unknown>
) {
  const daysRaw = typeof args.days === "number" ? args.days : Number(args.days);
  const days = Math.min(
    90,
    Math.max(1, Number.isFinite(daysRaw) && daysRaw > 0 ? Math.floor(daysRaw) : 30)
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await ctx.db
    .from("time_entries")
    .select("duration_minutes, billable, started_at, ended_at")
    .eq("organization_id", ctx.organizationId)
    .eq("user_id", ctx.userId)
    .is("deleted_at", null)
    .gte("started_at", since)
    .limit(500);

  if (error) return { error: error.message };

  let totalMinutes = 0;
  let billableMinutes = 0;
  for (const entry of data || []) {
    const mins = entry.duration_minutes ?? 0;
    totalMinutes += mins;
    if (entry.billable) billableMinutes += mins;
  }

  return {
    days,
    entries: data?.length || 0,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    billableHours: Math.round((billableMinutes / 60) * 10) / 10,
    nonBillableHours: Math.round(((totalMinutes - billableMinutes) / 60) * 10) / 10,
  };
}

async function getEmailConnections(ctx: SupportToolContext) {
  const [{ data: gmailRows }, { data: outlookRows }] = await Promise.all([
    ctx.db
      .from("gmail_connections")
      .select("email, connected_at, organization_id, user_id")
      .is("revoked_at", null)
      .or(
        `user_id.eq.${ctx.userId},organization_id.eq.${ctx.organizationId}`
      )
      .limit(3),
    ctx.db
      .from("outlook_connections")
      .select("email, connected_at, organization_id, user_id")
      .is("revoked_at", null)
      .or(
        `user_id.eq.${ctx.userId},organization_id.eq.${ctx.organizationId}`
      )
      .limit(3),
  ]);

  const gmail = gmailRows?.[0];
  const outlook = outlookRows?.[0];

  return {
    gmail: gmail
      ? { connected: true, email: gmail.email, connectedAt: gmail.connected_at }
      : { connected: false },
    outlook: outlook
      ? {
          connected: true,
          email: outlook.email,
          connectedAt: outlook.connected_at,
        }
      : { connected: false },
  };
}

export async function resolveSupportToolContext(
  db: Db,
  userId: string,
  extras?: {
    ticketId: string;
    requesterEmail?: string | null;
    requesterName?: string | null;
    organizationName?: string | null;
  }
): Promise<SupportToolContext | { error: string }> {
  const organizationId = await getActiveOrganizationId(db, userId);
  if (!organizationId) {
    return { error: "No active workspace found for this user." };
  }
  if (!extras?.ticketId) {
    return { error: "Support ticket is required." };
  }
  return {
    db,
    userId,
    organizationId,
    ticketId: extras.ticketId,
    requesterEmail: extras.requesterEmail,
    requesterName: extras.requesterName,
    organizationName: extras.organizationName,
  };
}

async function escalateToHuman(
  ctx: SupportToolContext,
  args: Record<string, unknown>
) {
  const reason =
    typeof args.reason === "string" ? args.reason.trim() : "";
  if (!reason) return { error: "reason is required." };

  const priorityRaw =
    typeof args.priority === "string" ? args.priority : "high";
  const priority = (
    ["low", "normal", "high", "urgent"].includes(priorityRaw)
      ? priorityRaw
      : "high"
  ) as SupportTicketPriority;

  const { ticket, newlyEscalated } = await escalateTicket({
    db: ctx.db,
    ticketId: ctx.ticketId,
    reason,
    priority,
    actorUserId: ctx.userId,
  });

  if (newlyEscalated) {
    try {
      await sendSupportEscalationEmails({
        ticketNumber: ticket.ticket_number,
        ticketId: ticket.id,
        subject: ticket.subject,
        reason,
        requesterEmail: ticket.requester_email || ctx.requesterEmail,
        requesterName: ticket.requester_name || ctx.requesterName,
        organizationName: ctx.organizationName,
        slaDueAt: ticket.sla_due_at || new Date().toISOString(),
      });
    } catch (err) {
      console.error("[support] escalation email failed", err);
    }
  }

  return {
    escalated: true,
    newlyEscalated,
    ticketRef: formatTicketRef(ticket.ticket_number),
    ticketId: ticket.id,
    status: ticket.status,
    assignedAgent: "human",
    sla: "A human will email within 24 hours.",
    messageForUser:
      "Tell the user clearly that a human agent will follow up by email within 24 hours, and include the ticket reference.",
  };
}

export async function executeSupportTool(
  ctx: SupportToolContext,
  name: string,
  argsJson: string
): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return { error: "Invalid tool arguments JSON." };
  }

  switch (name) {
    case "get_account_plan":
      return getAccountPlan(ctx);
    case "list_clients":
      return listClients(ctx, args);
    case "get_client":
      return getClient(ctx, args);
    case "list_proposals":
      return listProposals(ctx, args);
    case "get_proposal":
      return getProposal(ctx, args);
    case "list_invoices":
      return listInvoices(ctx, args);
    case "get_invoice":
      return getInvoice(ctx, args);
    case "list_tasks":
      return listTasks(ctx, args);
    case "get_time_summary":
      return getTimeSummary(ctx, args);
    case "get_email_connections":
      return getEmailConnections(ctx);
    case "escalate_to_human":
      return escalateToHuman(ctx, args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
