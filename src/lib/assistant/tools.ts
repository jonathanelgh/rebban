import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import {
  computeInvoiceTotals,
  formatInvoiceMoney,
  lineAmount,
} from "@/lib/invoices/totals";
import { sendInvoiceForOrganization } from "@/lib/invoices/send-invoice";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMonthExportZip } from "@/lib/receipts/export-month";
import { sendReceiptExportEmail } from "@/lib/receipts/email-export";
import { parseReceiptMonthYear } from "@/lib/receipts/month-parse";
import { downloadReceiptBytes } from "@/lib/receipts/storage";
import { MONTH_NAMES } from "@/lib/receipts/constants";
import { formatReceiptMoney } from "@/lib/receipts/money";
import {
  addTimeEntriesToInvoice,
  appendTimeSpecification,
  fetchUnbilledTimeEntries,
  summarizeUnbilled,
  unlockTimeEntriesForInvoice,
} from "@/lib/invoices/unbilled";
import { DEFAULT_HOURLY_RATE, formatDurationMinutes } from "@/lib/time-entries";
import { toProposalContentJson } from "@/lib/proposals/content";
import {
  generateProposalFromBrief,
  isProposalAiConfigured,
} from "@/lib/proposals/generate";
import { sendProposalForOrganization } from "@/lib/proposals/send-proposal";
import { convertLeadToClient } from "@/lib/leads/convert";
import { convertProposalToProject } from "@/lib/projects/convert-from-proposal";
import {
  loadClientCard,
  loadLeadCard,
  loadProjectCard,
  loadProposalCard,
  loadTaskCard,
} from "@/lib/assistant/card-loaders";
import { collectNeedsAttention } from "@/lib/assistant/needs-attention";
import {
  selectPendingClients,
  selectPendingSendInvoices,
  type PendingSendInvoice,
  type PendingUnbilledClient,
} from "@/lib/assistant/pending-invoice-selection";
import {
  billingScheduleFromPrefs,
  defaultBiweeklyAnchor,
  describeBillingSchedule,
  isBillingCadence,
  isBillingWeekday,
  mergeBillingScheduleIntoPrefs,
  parseBillingSchedule,
  type AssistantBillingSchedule,
  type BillingCadence,
  type BillingWeekday,
} from "@/lib/assistant/billing-schedule";
import { resolveDigestTimezone } from "@/lib/assistant/digest-schedule";

type Db = SupabaseClient<Database>;

export type AssistantPendingAction =
  | { type: "send_invoice"; invoice_id: string }
  | { type: "send_proposal"; proposal_id: string }
  | {
      type: "propose_unbilled_invoices";
      clients: PendingUnbilledClient[];
    }
  | {
      type: "send_invoices";
      invoices: PendingSendInvoice[];
    }
  | {
      type: "propose_convert_proposal";
      proposal_id: string;
      title: string;
      client_label: string;
      suggest_invoice_kind: "none" | "deposit" | "retainer" | "full";
      deposit_amount?: number | null;
    };

export type AssistantToolContext = {
  db: Db;
  userId: string;
  organizationId: string;
  conversationId: string;
  pendingAction: AssistantPendingAction | null;
  setPendingAction: (action: AssistantPendingAction | null) => Promise<void>;
  /** Where the assistant is running; affects lead/proposal source tags. */
  channel?: "whatsapp" | "in_app";
};

export const ASSISTANT_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "add_lead",
      description:
        "Add a new lead/prospect. Use when the user wants to capture a potential client.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Contact name" },
          company: { type: "string", description: "Company / studio name" },
          email: { type: "string" },
          phone: { type: "string" },
          notes: {
            type: "string",
            description: "Project details, budget, follow-up notes",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_client",
      description:
        "Add a new active client to the workspace. If a client with the same email already exists, returns that client instead of creating a duplicate. Put website URLs in website, not company.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          company: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          website: {
            type: "string",
            description: "Client website URL or domain (e.g. nordicelk.com)",
          },
          notes: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_client",
      description: "Find a client by name, company, or email.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_client",
      description:
        "Update an existing client (rename, email, phone, company, website, notes, status). Use for 'name them X', 'rename to…', 'change their email', 'update this client' — never add_client for those. Prefer client_id from a prior tool/card result.",
      parameters: {
        type: "object",
        properties: {
          client_id: {
            type: "string",
            description: "Preferred when known from a prior tool result",
          },
          client_query: {
            type: "string",
            description: "Name/company/email to resolve if client_id is unknown",
          },
          name: { type: "string" },
          company: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          website: { type: "string" },
          notes: { type: "string" },
          status: {
            type: "string",
            enum: ["active", "idle", "prospect"],
          },
          force_same_email: {
            type: "boolean",
            description:
              "Set true only after the user confirms using an email that another client already has",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_clients",
      description:
        "Count and list clients in the workspace. Use for 'how many clients', 'list my clients', or overview questions. Never invent a client count.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["all", "active", "idle", "prospect"],
            description: "Filter by status (default all)",
          },
          limit: {
            type: "number",
            description: "Max names to include in the sample (default 15)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_lead",
      description: "Find a lead by name, company, or email.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_leads",
      description:
        "Count and list leads in the workspace. Use for 'how many leads' or listing prospects. Never invent a lead count.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max names to include in the sample (default 15)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_projects",
      description:
        "List or count projects. Use for 'what projects do I have', 'projects for X', etc. Never invent project data.",
      parameters: {
        type: "object",
        properties: {
          client_query: {
            type: "string",
            description: "Optional filter by client name/company/email",
          },
          client_id: { type: "string" },
          status: {
            type: "string",
            enum: ["all", "active", "on_hold", "completed", "archived"],
            description: "Filter by status (default all)",
          },
          limit: { type: "number", description: "Max results (default 15)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description:
        "Create a project for a client. Requires a client (by name or id).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Project name" },
          client_query: {
            type: "string",
            description: "Client name, company, or email",
          },
          client_id: { type: "string" },
          description: { type: "string" },
          status: {
            type: "string",
            enum: ["active", "on_hold", "completed", "archived"],
            description: "Default active",
          },
          billing_type: {
            type: "string",
            enum: ["fixed", "hourly", "daily", "retainer", "mixed"],
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_project",
      description: "Find a project by name (optionally scoped to a client).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Project name" },
          client_query: { type: "string" },
          client_id: { type: "string" },
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
      description:
        "List tasks. Filter by column, client, or project. Never invent task data.",
      parameters: {
        type: "object",
        properties: {
          column: {
            type: "string",
            enum: ["backlog", "todo", "in_progress", "review", "done"],
            description: "Board column filter",
          },
          client_query: { type: "string" },
          client_id: { type: "string" },
          project_query: {
            type: "string",
            description: "Filter by project name",
          },
          project_id: { type: "string" },
          limit: { type: "number", description: "Max results (default 15)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description:
        "Create a task. Optionally link to a client and/or project.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          client_query: { type: "string" },
          client_id: { type: "string" },
          project_query: { type: "string" },
          project_id: { type: "string" },
          column: {
            type: "string",
            enum: ["backlog", "todo", "in_progress", "review", "done"],
            description: "Board column (default todo)",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "Default medium",
          },
          due_date: {
            type: "string",
            description: "Optional due date YYYY-MM-DD",
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_invoice_draft",
      description:
        "Create a draft invoice for a client with a single line item (fixed amount). Resolves client by name/company if client_id is not known. Sets pending send confirmation. Prefer create_invoice_from_unbilled when billing worked hours.",
      parameters: {
        type: "object",
        properties: {
          client_query: {
            type: "string",
            description: "Client name, company, or email to invoice",
          },
          client_id: { type: "string" },
          amount: {
            type: "number",
            description: "Total / line amount in org currency",
          },
          description: {
            type: "string",
            description: "Line item description (default: Services)",
          },
          due_in_days: {
            type: "number",
            description: "Days until due from today (default 14)",
          },
          currency: {
            type: "string",
            description: "Optional ISO currency override",
          },
        },
        required: ["amount"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_draft_invoices",
      description:
        "List draft invoices that are ready to review or send. Use for 'invoices to send', 'drafts', or pending invoices.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 10)" },
          client_query: {
            type: "string",
            description: "Optional filter by client name/company/email",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_unpaid_invoices",
      description:
        "List unpaid invoices (sent, viewed, or overdue). Answers who owes money.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 10)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_unbilled_hours",
      description:
        "List unbilled billable time (hours not yet on an invoice), grouped by client. Use before creating invoices from worked hours. Stores a pending proposal so the user can reply with all / some clients (e.g. invoice Acme and Beta, skip Northwind).",
      parameters: {
        type: "object",
        properties: {
          client_query: {
            type: "string",
            description: "Optional — filter to one client by name/company/email",
          },
          client_id: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_invoice_from_unbilled",
      description:
        "Create a draft invoice from all unbilled billable hours for one client. Prefer create_invoices_from_unbilled_batch when the user names several clients or says 'all'.",
      parameters: {
        type: "object",
        properties: {
          client_query: {
            type: "string",
            description: "Client name, company, or email",
          },
          client_id: { type: "string" },
          due_in_days: {
            type: "number",
            description: "Days until due from today (default 14)",
          },
          consolidate: {
            type: "boolean",
            description:
              "If true (default), one summary line with time details in notes. If false, one line per time entry.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_invoices_from_unbilled_batch",
      description:
        "Create draft invoices from unbilled hours for one or more clients. Use when the user wants several clients invoiced, or when pending propose_unbilled_invoices is set and they confirm all or a subset (include/exclude by name).",
      parameters: {
        type: "object",
        properties: {
          all_pending: {
            type: "boolean",
            description:
              "If true, invoice every client on the pending propose_unbilled_invoices list (after excludes).",
          },
          include_client_ids: {
            type: "array",
            items: { type: "string" },
            description: "Explicit client ids to invoice",
          },
          include_client_queries: {
            type: "array",
            items: { type: "string" },
            description:
              "Client name/company fragments to include (e.g. Acme, Beta)",
          },
          exclude_client_queries: {
            type: "array",
            items: { type: "string" },
            description:
              "Client name/company fragments to skip (e.g. Northwind)",
          },
          due_in_days: {
            type: "number",
            description: "Days until due from today (default 14)",
          },
          consolidate: {
            type: "boolean",
            description: "Consolidate time lines (default true)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_proposal_draft",
      description:
        "Create a full AI draft proposal for a client. Pass ALL project context from the user's WhatsApp message into notes (scope, timeline, budget, deliverables, anything they wrote). Do not drop details.",
      parameters: {
        type: "object",
        properties: {
          client_query: {
            type: "string",
            description: "Client name, company, or email",
          },
          client_id: { type: "string" },
          notes: {
            type: "string",
            description:
              "Full brief / context from the user message. Include every useful detail they provided. Minimum roughly one short paragraph.",
          },
          title_hint: {
            type: "string",
            description: "Optional project / proposal title hint",
          },
          category: {
            type: "string",
            description:
              "Optional category hint (e.g. branding, web, product design)",
          },
          pricing_hint: {
            type: "string",
            description:
              "Optional pricing hint (fixed, hourly, budget range, etc.)",
          },
          currency: {
            type: "string",
            description: "Optional ISO currency override",
          },
        },
        required: ["notes"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_draft_proposals",
      description:
        "List draft proposals ready to review or send.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 10)" },
          client_query: {
            type: "string",
            description: "Optional filter by client name/company/email",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_proposals",
      description:
        "List proposals filtered by status (draft, sent, viewed, accepted, declined). Use status=accepted before converting a proposal into a project.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "draft | sent | viewed | accepted | declined. Omit for recent of any status.",
          },
          limit: { type: "number", description: "Max results (default 10)" },
          client_query: {
            type: "string",
            description: "Optional filter by client name/company/email",
          },
          client_id: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "convert_proposal_to_project",
      description:
        "Convert an accepted proposal into an active project. Optionally generate AI tasks from the proposal scope and create a deposit/full invoice draft. Prefer this over create_project when the user mentions an accepted proposal.",
      parameters: {
        type: "object",
        properties: {
          proposal_id: {
            type: "string",
            description: "Proposal id (preferred when known)",
          },
          client_query: {
            type: "string",
            description:
              "If proposal_id unknown, find accepted proposals for this client name/company",
          },
          name: {
            type: "string",
            description: "Project name override (defaults to proposal title)",
          },
          invoice_kind: {
            type: "string",
            description:
              "none | deposit | full | retainer. Default none — ask before creating invoices unless the user already specified.",
          },
          deposit_amount: {
            type: "number",
            description: "Required when invoice_kind=deposit",
          },
          generate_tasks: {
            type: "boolean",
            description:
              "Generate starter tasks from the proposal (default true)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_needs_attention",
      description:
        "List things that need the freelancer's attention: stale proposals awaiting reply, overdue/unpaid invoices, unbilled hours, projects with near deadlines. Use when they ask what's overdue, what needs attention, or for a weekly review.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max items (default 12)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_receipts",
      description:
        "Count and summarize receipts in the workspace. Use for 'do I have any receipts', 'how many receipts', or a quick inbox overview. Prefer this over export when they are only asking what exists. Optionally filter by month.",
      parameters: {
        type: "object",
        properties: {
          month: {
            type: "string",
            description: 'Optional month number 1-12 or name like "october"',
          },
          year: {
            type: "number",
            description: "Optional four-digit year when filtering by month",
          },
          month_query: {
            type: "string",
            description: 'Optional free text like "October 2026"',
          },
          limit: {
            type: "number",
            description: "Max sample rows to include (default 8)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "export_receipts_month",
      description:
        "Build a ZIP of original receipts for a calendar month (plus CSV). Use when the user asks for October receipts, this month's expenses, accountant package, etc. Returns a downloadable export in chat. Then ask once if they want it emailed to themselves or their bookkeeper.",
      parameters: {
        type: "object",
        properties: {
          month: {
            type: "string",
            description: 'Month number 1-12 or name like "october" / "oct"',
          },
          year: {
            type: "number",
            description: "Four-digit year (defaults sensibly from context)",
          },
          month_query: {
            type: "string",
            description: 'Free text like "October 2026" when clearer',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_receipts_export",
      description:
        "Email a receipt month ZIP. Use after export_receipts_month, when the user confirms sending to themselves or a bookkeeper. recipient=me uses their Rebban profile email; recipient=email requires to_email.",
      parameters: {
        type: "object",
        properties: {
          export_id: {
            type: "string",
            description: "From export_receipts_month result",
          },
          year: { type: "number" },
          month: { type: "string" },
          month_query: { type: "string" },
          recipient: {
            type: "string",
            enum: ["me", "email"],
            description: "me = user's profile email; email = to_email required",
          },
          to_email: {
            type: "string",
            description: "Bookkeeper or other recipient when recipient=email",
          },
          confirmed: {
            type: "boolean",
            description: "Must be true — user asked to email the package",
          },
        },
        required: ["recipient", "confirmed"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_billing_schedule",
      description:
        "Get the user's invoicing reminder schedule (weekday/time/cadence in their timezone). Use when they ask when reminders run or what their billing day is.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_billing_schedule",
      description:
        "Set when the assistant should ping about invoicing (WhatsApp/in-app). Examples: every Friday at 9, every other Friday, first day of the month, last day of the month. Disables with enabled=false.",
      parameters: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            description: "false turns reminders off",
          },
          cadence: {
            type: "string",
            description:
              "weekly | biweekly | monthly_first | monthly_last",
          },
          weekday: {
            type: "string",
            description:
              "Mon|Tue|Wed|Thu|Fri|Sat|Sun — required for weekly/biweekly",
          },
          hour: {
            type: "number",
            description: "Local hour 0-23 (e.g. 9 for 09:00)",
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
      description: "Fetch one client by id for details or follow-up actions.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string" },
        },
        required: ["client_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_lead",
      description: "Fetch one lead by id for details or conversion.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
        },
        required: ["lead_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "convert_lead_to_client",
      description:
        "Convert a lead into a client. Use when the user asks to convert a lead / turn a prospect into a client.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          status: {
            type: "string",
            enum: ["prospect", "active"],
            description: "Client status after conversion (default prospect)",
          },
        },
        required: ["lead_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project",
      description: "Fetch one project by id including task and time summary.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
        },
        required: ["project_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_task",
      description: "Fetch one task by id.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
        },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description:
        "Update a task column/status, title, or due date. Use mark complete by setting column to done.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          title: { type: "string" },
          column: {
            type: "string",
            enum: ["backlog", "todo", "in_progress", "review", "done"],
          },
          due_date: {
            type: "string",
            description: "YYYY-MM-DD or empty to clear",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
          },
        },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_proposal",
      description:
        "Fetch one proposal by id (preferred) or the pending draft from this conversation.",
      parameters: {
        type: "object",
        properties: {
          proposal_id: {
            type: "string",
            description: "Proposal id; omit to use pending send_proposal draft",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_invoice",
      description:
        "Fetch one invoice by id (preferred) or the pending draft from this conversation. Use before editing amounts/dates or when the user refers to 'the invoice we just created'.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: {
            type: "string",
            description: "Invoice id; omit to use pending send_invoice draft",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_invoice_draft",
      description:
        "Update a draft invoice amount, description, due date, or due_in_days. Only works on draft invoices. Prefer the pending invoice id when the user says 'make it €1800' / 'due in 7 days' after creating a draft.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: {
            type: "string",
            description: "Invoice id; omit to use pending draft",
          },
          amount: {
            type: "number",
            description: "New total / line amount",
          },
          description: {
            type: "string",
            description: "New primary line item description",
          },
          due_date: {
            type: "string",
            description: "Absolute due date YYYY-MM-DD",
          },
          due_in_days: {
            type: "number",
            description: "Set due date to N days from today",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_invoice_status",
      description:
        "Mark an invoice as paid or void. Use when the user says mark as paid / void this invoice / mark Acme's latest invoice paid. Prefer invoice_id when known; otherwise resolve by client_query (latest unpaid for paid, latest non-void for void).",
      parameters: {
        type: "object",
        properties: {
          invoice_id: {
            type: "string",
            description: "Invoice id when known from a prior tool result",
          },
          client_query: {
            type: "string",
            description:
              "Client name/company/email when resolving their latest invoice",
          },
          client_id: { type: "string" },
          which: {
            type: "string",
            enum: ["latest", "latest_unpaid"],
            description:
              "When resolving by client: latest any open invoice, or latest unpaid (sent/viewed/overdue). Default latest_unpaid for paid, latest for void.",
          },
          status: {
            type: "string",
            enum: ["paid", "void"],
            description: "New status",
          },
        },
        required: ["status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_invoice",
      description:
        "Email one invoice (first send or send again / resend). Works for draft, sent, viewed, or overdue — not paid or void. ONLY with confirmed=true after the user clearly asks to send/resend (or confirms a pending draft). Prefer invoice_id when known; otherwise client_query + which. For several drafts use send_invoices.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: {
            type: "string",
            description:
              "Invoice id when known; omit to use pending send_invoice or resolve by client",
          },
          client_query: {
            type: "string",
            description:
              "Client name/company/email when sending/resending their invoice without an id",
          },
          client_id: { type: "string" },
          which: {
            type: "string",
            enum: ["latest", "latest_sent", "latest_draft"],
            description:
              "When resolving by client: latest any sendable invoice, latest already-sent (sent/viewed/overdue) for resend, or latest draft. Default latest_sent for resend wording, else latest.",
          },
          confirmed: {
            type: "boolean",
            description:
              "Must be true — user asked to send/resend or confirmed a pending draft",
          },
        },
        required: ["confirmed"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_invoices",
      description:
        "Send one or more draft invoices after confirmation. Use when pending send_invoices lists several drafts, or the user says send all / only Acme / skip Northwind.",
      parameters: {
        type: "object",
        properties: {
          confirmed: {
            type: "boolean",
            description: "Must be true — user confirmed send in this chat",
          },
          all_pending: {
            type: "boolean",
            description: "Send every invoice on pending send_invoices",
          },
          invoice_ids: {
            type: "array",
            items: { type: "string" },
            description: "Explicit invoice ids to send",
          },
          include_client_queries: {
            type: "array",
            items: { type: "string" },
            description: "Send drafts whose client label matches these names",
          },
          exclude_client_queries: {
            type: "array",
            items: { type: "string" },
            description: "Skip drafts whose client label matches these names",
          },
        },
        required: ["confirmed"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_proposal",
      description:
        "Send a draft proposal by email. ONLY call after the user explicitly confirmed sending. Prefer the pending proposal from create_proposal_draft, or a draft id from list_draft_proposals.",
      parameters: {
        type: "object",
        properties: {
          proposal_id: {
            type: "string",
            description: "Proposal id; omit to use pending confirmed proposal",
          },
          confirmed: {
            type: "boolean",
            description: "Must be true — user confirmed send in this chat",
          },
        },
        required: ["confirmed"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "clear_pending_action",
      description:
        "Cancel a pending confirmation (send invoice(s), send proposal, or proposed unbilled invoices) when the user declines or wants to wait.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

async function createUnbilledInvoiceForClient(
  ctx: AssistantToolContext,
  options: {
    clientId: string;
    clientLabel: string;
    dueInDays: number;
    consolidate: boolean;
  }
): Promise<
  | {
      ok: true;
      invoice: {
        id: string;
        client: string;
        amount: string;
        amount_raw: number;
        currency: string;
        due_date: string;
        due_in_days: number;
        status: string;
        hours: string;
        hours_raw: number;
        entries: number;
        lines: number;
      };
    }
  | { ok: false; error: string }
> {
  const { db, organizationId, userId } = ctx;
  const entries = await fetchUnbilledTimeEntries(db, {
    organizationId,
    clientId: options.clientId,
  });
  if (!entries.length) {
    return {
      ok: false,
      error: `No unbilled hours for ${options.clientLabel}.`,
    };
  }

  const summary = summarizeUnbilled(entries);
  const { data: org } = await db
    .from("organizations")
    .select(
      "currency, default_tax_enabled, default_tax_rate, default_prices_include_tax, tax_id"
    )
    .eq("id", organizationId)
    .maybeSingle();

  const currency = org?.currency || "EUR";
  const taxEnabled = Boolean(org?.default_tax_enabled);
  const taxRate = taxEnabled ? Number(org?.default_tax_rate) || 0 : 0;
  const pricesIncludeTax = taxEnabled
    ? Boolean(org?.default_prices_include_tax)
    : false;
  const dueInDays = Math.max(0, Math.round(options.dueInDays || 14));
  const issueDate = todayISO();
  const dueDate = addDaysISO(issueDate, dueInDays);

  const { data: invoice, error: invoiceError } = await db
    .from("invoices")
    .insert({
      organization_id: organizationId,
      client_id: options.clientId,
      number: null,
      status: "draft",
      currency,
      issue_date: issueDate,
      due_date: dueDate,
      created_by: userId,
      subtotal: 0,
      tax_total: 0,
      total: 0,
      payment_token: nanoid(24),
      tax_enabled: taxEnabled,
      tax_rate: taxEnabled ? taxRate : 0,
      prices_include_tax: pricesIncludeTax,
      show_tax_id: taxEnabled,
      tax_id: taxEnabled ? org?.tax_id || null : null,
      show_logo: true,
    })
    .select("id, status, currency, due_date, issue_date, notes")
    .single();

  if (invoiceError || !invoice) {
    return {
      ok: false,
      error: invoiceError?.message || "Could not create invoice.",
    };
  }

  try {
    const { created, specification } = await addTimeEntriesToInvoice(db, {
      organizationId,
      invoiceId: invoice.id,
      entries,
      startPosition: 0,
      consolidate: options.consolidate,
      currency,
    });

    if (!created.length) {
      await db
        .from("invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", invoice.id)
        .eq("organization_id", organizationId);
      return {
        ok: false,
        error: "Could not attach time entries to the invoice.",
      };
    }

    const totals = computeInvoiceTotals(
      created.map((line) => ({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      { taxEnabled, taxRate, pricesIncludeTax }
    );

    let notes: string | null = invoice.notes;
    if (specification) {
      notes = appendTimeSpecification(notes || "", specification) || null;
    }

    const { error: updateError } = await db
      .from("invoices")
      .update({
        subtotal: totals.subtotal,
        tax_total: totals.taxTotal,
        total: totals.total,
        notes,
      })
      .eq("id", invoice.id)
      .eq("organization_id", organizationId);

    if (updateError) {
      return {
        ok: false,
        error:
          updateError.message ||
          "Invoice created but totals could not be saved.",
      };
    }

    return {
      ok: true,
      invoice: {
        id: invoice.id,
        client: options.clientLabel,
        amount: formatInvoiceMoney(totals.total, currency),
        amount_raw: totals.total,
        currency,
        due_date: dueDate,
        due_in_days: dueInDays,
        status: "draft",
        hours: summary.label,
        hours_raw: summary.totalHours,
        entries: summary.count,
        lines: created.length,
      },
    };
  } catch (err) {
    await db
      .from("invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", invoice.id)
      .eq("organization_id", organizationId);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not create invoice from unbilled hours.",
    };
  }
}

function addDaysISO(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeIlike(query: string) {
  return query
    .trim()
    .replace(/[%_,."\\()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function ilikeOrFilter(q: string) {
  const pattern = `"%${q}%"`;
  return `name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern}`;
}

function looksLikeWebsite(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return true;
  return /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(v);
}

function normalizeWebsite(value: string) {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

async function searchClients(db: Db, organizationId: string, query: string) {
  const q = sanitizeIlike(query);
  if (!q) return [];
  const { data } = await db
    .from("clients")
    .select("id, name, company, email, phone, status, created_at")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .or(ilikeOrFilter(q))
    .order("created_at", { ascending: true })
    .limit(8);
  return data || [];
}

/** Prefer a single client when matches are email-duplicates of each other. */
function collapseClientMatches<
  T extends { id: string; email: string | null; created_at?: string },
>(matches: T[]): T[] {
  if (matches.length <= 1) return matches;
  const withEmail = matches.filter((m) => m.email?.trim());
  if (withEmail.length === matches.length) {
    const emails = new Set(
      withEmail.map((m) => m.email!.trim().toLowerCase())
    );
    if (emails.size === 1) {
      return [matches[0]];
    }
  }
  // Dedupe by email while keeping unique emails as separate choices
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const m of matches) {
    const key = m.email?.trim().toLowerCase() || `id:${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(m);
  }
  return unique;
}

async function searchLeads(db: Db, organizationId: string, query: string) {
  const q = sanitizeIlike(query);
  if (!q) return [];
  const { data } = await db
    .from("leads")
    .select("id, name, company, email, phone, status, source, notes")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .or(ilikeOrFilter(q))
    .limit(8);
  return data || [];
}

async function resolveClient(
  db: Db,
  organizationId: string,
  args: { client_id?: unknown; client_query?: unknown }
): Promise<
  | { ok: true; id: string; label: string }
  | { ok: false; error: string; matches?: Array<Record<string, unknown>> }
> {
  const clientIdArg = args.client_id ? String(args.client_id) : "";
  if (clientIdArg) {
    const { data: client } = await db
      .from("clients")
      .select("id, name, company")
      .eq("id", clientIdArg)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!client) return { ok: false, error: "Client not found." };
    return {
      ok: true,
      id: client.id,
      label: client.company || client.name,
    };
  }

  const query = String(args.client_query || "").trim();
  if (!query) {
    return { ok: false, error: "Provide client_query or client_id." };
  }
  const matches = collapseClientMatches(
    await searchClients(db, organizationId, query)
  );
  if (!matches.length) {
    return {
      ok: false,
      error: `No client found for "${query}". Add them as a client first, or check the spelling.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error:
        "Multiple different clients matched. Ask the user which one, then call again with client_id.",
      matches: matches.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.company,
        email: c.email,
      })),
    };
  }
  return {
    ok: true,
    id: matches[0].id,
    label: matches[0].company || matches[0].name || query,
  };
}

async function loadClientMap(
  db: Db,
  organizationId: string,
  clientIds: string[]
) {
  const map = new Map<string, { name: string; company: string | null }>();
  if (!clientIds.length) return map;
  const { data: clients } = await db
    .from("clients")
    .select("id, name, company")
    .eq("organization_id", organizationId)
    .in("id", clientIds);
  for (const c of clients || []) {
    map.set(c.id, { name: c.name, company: c.company });
  }
  return map;
}

async function loadInvoiceSummary(
  db: Db,
  organizationId: string,
  invoiceId: string
) {
  const { data: invoice, error } = await db
    .from("invoices")
    .select(
      "id, number, status, currency, total, due_date, issue_date, client_id"
    )
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !invoice) {
    return { error: error?.message || "Invoice not found." };
  }

  let clientLabel = "Unknown";
  if (invoice.client_id) {
    const { data: client } = await db
      .from("clients")
      .select("name, company")
      .eq("id", invoice.client_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    clientLabel = client?.company || client?.name || clientLabel;
  }

  const { data: lines } = await db
    .from("invoice_line_items")
    .select("description, amount, position")
    .eq("invoice_id", invoice.id)
    .eq("organization_id", organizationId)
    .order("position", { ascending: true })
    .limit(5);

  const description =
    lines?.[0]?.description ||
    (lines?.length ? `${lines.length} line items` : null);

  const currency = invoice.currency || "EUR";
  return {
    ok: true,
    invoice: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      client: clientLabel,
      amount: formatInvoiceMoney(Number(invoice.total) || 0, currency),
      amount_raw: Number(invoice.total) || 0,
      currency,
      due_date: invoice.due_date,
      issue_date: invoice.issue_date,
      description,
    },
  };
}

async function resolveInvoiceForStatusUpdate(
  db: Db,
  organizationId: string,
  args: {
    invoice_id?: unknown;
    client_id?: unknown;
    client_query?: unknown;
    which?: unknown;
    status: "paid" | "void";
  }
): Promise<
  | { ok: true; invoiceId: string }
  | { ok: false; error: string; matches?: Array<Record<string, unknown>> }
> {
  const invoiceIdArg = args.invoice_id ? String(args.invoice_id).trim() : "";
  if (invoiceIdArg) {
    const { data: invoice } = await db
      .from("invoices")
      .select("id")
      .eq("id", invoiceIdArg)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!invoice) return { ok: false, error: "Invoice not found." };
    return { ok: true, invoiceId: invoice.id };
  }

  const resolved = await resolveClient(db, organizationId, args);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      matches: resolved.matches,
    };
  }

  const whichRaw = String(args.which || "").toLowerCase();
  const which =
    whichRaw === "latest" || whichRaw === "latest_unpaid"
      ? whichRaw
      : args.status === "paid"
        ? "latest_unpaid"
        : "latest";

  let query = db
    .from("invoices")
    .select("id, number, status, total, currency, due_date, issue_date")
    .eq("organization_id", organizationId)
    .eq("client_id", resolved.id)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(8);

  if (which === "latest_unpaid") {
    query = query.in("status", ["sent", "viewed", "overdue"]);
  } else {
    query = query.neq("status", "void");
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return {
      ok: false,
      error:
        which === "latest_unpaid"
          ? `No unpaid invoice found for ${resolved.label}.`
          : `No invoice found for ${resolved.label}.`,
    };
  }

  return { ok: true, invoiceId: data[0].id };
}

async function resolveInvoiceForSend(
  db: Db,
  organizationId: string,
  args: {
    invoice_id?: unknown;
    client_id?: unknown;
    client_query?: unknown;
    which?: unknown;
    pendingId?: string | null;
  }
): Promise<
  | { ok: true; invoiceId: string }
  | { ok: false; error: string; matches?: Array<Record<string, unknown>> }
> {
  const invoiceIdArg = args.invoice_id ? String(args.invoice_id).trim() : "";
  if (invoiceIdArg) {
    const { data: invoice } = await db
      .from("invoices")
      .select("id, status")
      .eq("id", invoiceIdArg)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!invoice) return { ok: false, error: "Invoice not found." };
    if (invoice.status === "paid" || invoice.status === "void") {
      return {
        ok: false,
        error: `Invoice cannot be sent (status is ${invoice.status}).`,
      };
    }
    return { ok: true, invoiceId: invoice.id };
  }

  const hasClient =
    Boolean(args.client_id && String(args.client_id).trim()) ||
    Boolean(args.client_query && String(args.client_query).trim());

  if (!hasClient) {
    if (args.pendingId) return { ok: true, invoiceId: args.pendingId };
    return {
      ok: false,
      error:
        "No invoice to send. Pass invoice_id, client_query, or confirm a pending draft.",
    };
  }

  const resolved = await resolveClient(db, organizationId, args);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      matches: resolved.matches,
    };
  }

  const whichRaw = String(args.which || "").toLowerCase();
  const which =
    whichRaw === "latest_sent" ||
    whichRaw === "latest_draft" ||
    whichRaw === "latest"
      ? whichRaw
      : "latest";

  let query = db
    .from("invoices")
    .select("id, number, status, total, currency, due_date, issue_date")
    .eq("organization_id", organizationId)
    .eq("client_id", resolved.id)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(8);

  if (which === "latest_sent") {
    query = query.in("status", ["sent", "viewed", "overdue"]);
  } else if (which === "latest_draft") {
    query = query.eq("status", "draft");
  } else {
    query = query.in("status", ["draft", "sent", "viewed", "overdue"]);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    const label =
      which === "latest_sent"
        ? "No previously sent invoice"
        : which === "latest_draft"
          ? "No draft invoice"
          : "No sendable invoice";
    return {
      ok: false,
      error: `${label} found for ${resolved.label}.`,
    };
  }

  return { ok: true, invoiceId: data[0].id };
}

async function updateDraftInvoice(
  db: Db,
  organizationId: string,
  invoiceId: string,
  patch: {
    amount?: number;
    description?: string;
    dueDate?: string;
    dueInDays?: number;
  }
) {
  const { data: invoice, error } = await db
    .from("invoices")
    .select(
      "id, status, currency, client_id, tax_enabled, tax_rate, prices_include_tax, issue_date"
    )
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !invoice) {
    return { error: error?.message || "Invoice not found." };
  }
  if (invoice.status !== "draft") {
    return {
      error: `Only draft invoices can be updated this way (status is ${invoice.status}).`,
    };
  }

  const updates: Database["public"]["Tables"]["invoices"]["Update"] = {};

  if (typeof patch.dueInDays === "number" && Number.isFinite(patch.dueInDays)) {
    updates.due_date = addDaysISO(
      todayISO(),
      Math.max(0, Math.round(patch.dueInDays))
    );
  } else if (typeof patch.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) {
    updates.due_date = patch.dueDate;
  }

  if (typeof patch.amount === "number" && Number.isFinite(patch.amount)) {
    if (patch.amount <= 0) {
      return { error: "A positive amount is required." };
    }
    const taxEnabled = Boolean(invoice.tax_enabled);
    const taxRate = taxEnabled ? Number(invoice.tax_rate) || 0 : 0;
    const pricesIncludeTax = taxEnabled
      ? Boolean(invoice.prices_include_tax)
      : false;
    const qty = 1;
    const unitPrice = patch.amount;
    const lineAmt = lineAmount(qty, unitPrice);
    const totals = computeInvoiceTotals([{ quantity: qty, unitPrice }], {
      taxEnabled,
      taxRate,
      pricesIncludeTax,
    });

    const { data: existingLines } = await db
      .from("invoice_line_items")
      .select("id")
      .eq("invoice_id", invoice.id)
      .eq("organization_id", organizationId)
      .order("position", { ascending: true })
      .limit(1);

    if (existingLines?.[0]?.id) {
      const lineUpdate: Database["public"]["Tables"]["invoice_line_items"]["Update"] =
        {
          quantity: qty,
          unit_price: unitPrice,
          amount: lineAmt,
        };
      if (typeof patch.description === "string" && patch.description.trim()) {
        lineUpdate.description = patch.description.trim();
      }
      const { error: lineError } = await db
        .from("invoice_line_items")
        .update(lineUpdate)
        .eq("id", existingLines[0].id)
        .eq("organization_id", organizationId);
      if (lineError) return { error: lineError.message };
    } else {
      const { error: lineError } = await db.from("invoice_line_items").insert({
        invoice_id: invoice.id,
        organization_id: organizationId,
        description: patch.description?.trim() || "Services",
        quantity: qty,
        unit: "flat",
        unit_price: unitPrice,
        amount: lineAmt,
        position: 0,
      });
      if (lineError) return { error: lineError.message };
    }

    updates.subtotal = totals.subtotal;
    updates.tax_total = totals.taxTotal;
    updates.total = totals.total;
  } else if (typeof patch.description === "string" && patch.description.trim()) {
    const { data: existingLines } = await db
      .from("invoice_line_items")
      .select("id")
      .eq("invoice_id", invoice.id)
      .eq("organization_id", organizationId)
      .order("position", { ascending: true })
      .limit(1);
    if (existingLines?.[0]?.id) {
      const { error: lineError } = await db
        .from("invoice_line_items")
        .update({ description: patch.description.trim() })
        .eq("id", existingLines[0].id)
        .eq("organization_id", organizationId);
      if (lineError) return { error: lineError.message };
    }
  }

  if (Object.keys(updates).length) {
    const { error: updateError } = await db
      .from("invoices")
      .update(updates)
      .eq("id", invoice.id)
      .eq("organization_id", organizationId);
    if (updateError) return { error: updateError.message };
  }

  return loadInvoiceSummary(db, organizationId, invoiceId);
}

async function searchProjects(
  db: Db,
  organizationId: string,
  query: string,
  clientId?: string | null
) {
  const q = sanitizeIlike(query);
  if (!q) return [];
  let request = db
    .from("projects")
    .select("id, name, status, client_id, description")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("name", `%${q}%`)
    .limit(8);
  if (clientId) request = request.eq("client_id", clientId);
  const { data } = await request;
  return data || [];
}

async function resolveProject(
  db: Db,
  organizationId: string,
  args: {
    project_id?: unknown;
    project_query?: unknown;
    client_id?: string | null;
  }
): Promise<
  | {
      ok: true;
      id: string;
      name: string;
      client_id: string;
    }
  | { ok: false; error: string; matches?: Array<Record<string, unknown>> }
> {
  const projectIdArg = args.project_id ? String(args.project_id) : "";
  if (projectIdArg) {
    const { data: project } = await db
      .from("projects")
      .select("id, name, client_id")
      .eq("id", projectIdArg)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!project) return { ok: false, error: "Project not found." };
    return {
      ok: true,
      id: project.id,
      name: project.name,
      client_id: project.client_id,
    };
  }

  const query = String(args.project_query || "").trim();
  if (!query) {
    return { ok: false, error: "Provide project_query or project_id." };
  }
  const matches = await searchProjects(
    db,
    organizationId,
    query,
    args.client_id
  );
  if (!matches.length) {
    return {
      ok: false,
      error: `No project found for "${query}".`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: "Multiple projects matched. Ask the user which one.",
      matches: matches.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        client_id: p.client_id,
      })),
    };
  }
  return {
    ok: true,
    id: matches[0].id,
    name: matches[0].name,
    client_id: matches[0].client_id,
  };
}

function normalizeTaskColumn(value: unknown) {
  const raw = String(value || "todo")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (
    raw === "backlog" ||
    raw === "todo" ||
    raw === "in_progress" ||
    raw === "review" ||
    raw === "done"
  ) {
    return raw;
  }
  return "todo" as const;
}

function normalizeTaskPriority(value: unknown) {
  const raw = String(value || "medium").trim().toLowerCase();
  if (
    raw === "low" ||
    raw === "medium" ||
    raw === "high" ||
    raw === "urgent"
  ) {
    return raw;
  }
  return "medium" as const;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export async function executeAssistantTool(
  ctx: AssistantToolContext,
  name: string,
  rawArgs: string
): Promise<Record<string, unknown>> {
  const args = parseArgs(rawArgs);
  const { db, userId, organizationId } = ctx;

  try {
    switch (name) {
      case "add_lead": {
        const leadName = String(args.name || "").trim();
        if (!leadName) return { error: "Name is required." };
        const notesParts = [
          args.notes ? String(args.notes).trim() : "",
        ].filter(Boolean);
        const { data, error } = await db
          .from("leads")
          .insert({
            organization_id: organizationId,
            name: leadName,
            company: args.company ? String(args.company).trim() : null,
            email: args.email ? String(args.email).trim().toLowerCase() : null,
            phone: args.phone ? String(args.phone).trim() : null,
            notes: notesParts.join("\n") || null,
            source: ctx.channel === "in_app" ? "assistant" : "whatsapp",
            status: "new",
            created_by: userId,
          })
          .select("id, name, company, status, source")
          .single();
        if (error) return { error: error.message };
        return { ok: true, lead: data };
      }

      case "add_client": {
        const clientName = String(args.name || "").trim();
        if (!clientName) return { error: "Name is required." };

        const email = args.email
          ? String(args.email).trim().toLowerCase()
          : null;
        let company = args.company ? String(args.company).trim() : null;
        let website = args.website
          ? normalizeWebsite(String(args.website))
          : null;
        if (!website && company && looksLikeWebsite(company)) {
          website = normalizeWebsite(company);
          company = null;
        }

        if (email) {
          const { data: existing } = await db
            .from("clients")
            .select("id, name, company, email, website, status")
            .eq("organization_id", organizationId)
            .eq("email", email)
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (existing) {
            const nameDiffers =
              clientName.localeCompare(existing.name, undefined, {
                sensitivity: "accent",
              }) !== 0;
            return {
              ok: true,
              already_existed: true,
              client: existing,
              name_differs: nameDiffers,
              suggested_update: nameDiffers
                ? { client_id: existing.id, name: clientName }
                : null,
              message: nameDiffers
                ? `A client already exists with this email (id=${existing.id}, current name="${existing.name}"). The user asked for name "${clientName}". Immediately call update_client with client_id="${existing.id}" and name="${clientName}" — do not call add_client again and do not ask again unless intent is unclear.`
                : `A client named "${existing.name}" already uses this email (id=${existing.id}). Reuse this client_id. Do not create a duplicate.`,
            };
          }
        }

        const { data, error } = await db
          .from("clients")
          .insert({
            organization_id: organizationId,
            name: clientName,
            company,
            email,
            phone: args.phone ? String(args.phone).trim() : null,
            website,
            notes: args.notes ? String(args.notes).trim() : null,
            status: "active",
            created_by: userId,
          })
          .select("id, name, company, email, website, status")
          .single();
        if (error) return { error: error.message };
        return { ok: true, already_existed: false, client: data };
      }

      case "find_client": {
        const query = String(args.query || "").trim();
        const clients = await searchClients(db, organizationId, query);
        return { ok: true, count: clients.length, clients };
      }

      case "update_client": {
        const resolved = await resolveClient(db, organizationId, args);
        if (!resolved.ok) {
          return {
            error: resolved.error,
            matches: resolved.matches,
          };
        }

        const updates: Database["public"]["Tables"]["clients"]["Update"] = {};
        if (typeof args.name === "string" && args.name.trim()) {
          updates.name = args.name.trim();
        }
        if (args.company !== undefined) {
          const companyRaw =
            args.company === null ? "" : String(args.company).trim();
          updates.company = companyRaw || null;
        }
        if (args.phone !== undefined) {
          const phoneRaw =
            args.phone === null ? "" : String(args.phone).trim();
          updates.phone = phoneRaw || null;
        }
        if (args.notes !== undefined) {
          const notesRaw =
            args.notes === null ? "" : String(args.notes).trim();
          updates.notes = notesRaw || null;
        }
        if (args.website !== undefined) {
          const websiteRaw =
            args.website === null ? "" : String(args.website).trim();
          updates.website = websiteRaw
            ? normalizeWebsite(websiteRaw)
            : null;
        }
        if (args.status !== undefined) {
          const statusRaw = String(args.status || "").toLowerCase();
          if (
            statusRaw === "active" ||
            statusRaw === "idle" ||
            statusRaw === "prospect"
          ) {
            updates.status = statusRaw;
          }
        }

        let emailConflict: {
          id: string;
          name: string;
          company: string | null;
          email: string | null;
        } | null = null;
        if (args.email !== undefined) {
          const emailRaw =
            args.email === null ? "" : String(args.email).trim().toLowerCase();
          const nextEmail = emailRaw || null;
          if (nextEmail) {
            const { data: existing } = await db
              .from("clients")
              .select("id, name, company, email")
              .eq("organization_id", organizationId)
              .eq("email", nextEmail)
              .is("deleted_at", null)
              .neq("id", resolved.id)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (existing && !args.force_same_email) {
              emailConflict = existing;
            } else {
              updates.email = nextEmail;
            }
          } else {
            updates.email = null;
          }
        }

        if (emailConflict) {
          return {
            ok: false,
            error: "email_in_use",
            message: `That email is already on "${emailConflict.name}"${
              emailConflict.company ? ` (${emailConflict.company})` : ""
            }. Tell the user clearly, and ask if they still want it on "${resolved.label}" too. If they confirm, call update_client again with force_same_email=true.`,
            client_id: resolved.id,
            client_label: resolved.label,
            conflicting_client: emailConflict,
          };
        }

        if (!Object.keys(updates).length) {
          return {
            error:
              "Provide at least one field to update (name, email, phone, company, website, notes, status).",
          };
        }

        updates.updated_at = new Date().toISOString();
        const { error: updateError } = await db
          .from("clients")
          .update(updates)
          .eq("id", resolved.id)
          .eq("organization_id", organizationId);
        if (updateError) return { error: updateError.message };

        const card = await loadClientCard(db, organizationId, resolved.id);
        if (!card) {
          return { error: "Client updated but could not reload." };
        }
        return {
          ok: true,
          updated_fields: Object.keys(updates).filter((k) => k !== "updated_at"),
          client: { id: card.entityId, ...card.snapshot },
        };
      }

      case "list_clients": {
        const statusRaw = String(args.status || "all").toLowerCase();
        const status =
          statusRaw === "active" ||
          statusRaw === "idle" ||
          statusRaw === "prospect"
            ? statusRaw
            : "all";
        const limit = Math.min(40, Math.max(1, Number(args.limit) || 15));

        let countQuery = db
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .is("deleted_at", null);
        if (status !== "all") {
          countQuery = countQuery.eq("status", status);
        }
        const { count, error: countError } = await countQuery;
        if (countError) return { error: countError.message };

        let listQuery = db
          .from("clients")
          .select("id, name, company, email, status")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("name", { ascending: true })
          .limit(limit);
        if (status !== "all") {
          listQuery = listQuery.eq("status", status);
        }
        const { data, error } = await listQuery;
        if (error) return { error: error.message };

        const total = count ?? 0;
        return {
          ok: true,
          count: total,
          status_filter: status,
          showing: (data || []).length,
          clients: (data || []).map((c) => ({
            id: c.id,
            name: c.name,
            company: c.company,
            email: c.email,
            status: c.status,
            label: c.company || c.name,
          })),
          message:
            total === 0
              ? "No clients in this workspace."
              : total > limit
                ? `Showing ${limit} of ${total} clients.`
                : undefined,
        };
      }

      case "find_lead": {
        const query = String(args.query || "").trim();
        const leads = await searchLeads(db, organizationId, query);
        return { ok: true, count: leads.length, leads };
      }

      case "list_leads": {
        const limit = Math.min(40, Math.max(1, Number(args.limit) || 15));
        const { count, error: countError } = await db
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .is("deleted_at", null);
        if (countError) return { error: countError.message };

        const { data, error } = await db
          .from("leads")
          .select("id, name, company, email, status, source")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };

        const total = count ?? 0;
        return {
          ok: true,
          count: total,
          showing: (data || []).length,
          leads: data || [],
          message:
            total === 0
              ? "No leads in this workspace."
              : total > limit
                ? `Showing ${limit} of ${total} leads.`
                : undefined,
        };
      }

      case "list_projects": {
        const limit = Math.min(40, Math.max(1, Number(args.limit) || 15));
        const statusRaw = String(args.status || "all").toLowerCase();
        const status =
          statusRaw === "active" ||
          statusRaw === "on_hold" ||
          statusRaw === "completed" ||
          statusRaw === "archived"
            ? statusRaw
            : "all";

        let filterClientId: string | null = null;
        if (args.client_id || args.client_query) {
          const resolved = await resolveClient(db, organizationId, args);
          if (!resolved.ok) {
            return {
              error: resolved.error,
              ...(resolved.matches ? { matches: resolved.matches } : {}),
            };
          }
          filterClientId = resolved.id;
        }

        let countQuery = db
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .is("deleted_at", null);
        if (status !== "all") countQuery = countQuery.eq("status", status);
        if (filterClientId) countQuery = countQuery.eq("client_id", filterClientId);
        const { count, error: countError } = await countQuery;
        if (countError) return { error: countError.message };

        let listQuery = db
          .from("projects")
          .select("id, name, status, client_id, billing_type, updated_at")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(limit);
        if (status !== "all") listQuery = listQuery.eq("status", status);
        if (filterClientId) listQuery = listQuery.eq("client_id", filterClientId);

        const { data, error } = await listQuery;
        if (error) return { error: error.message };

        const clientIds = [
          ...new Set(
            (data || [])
              .map((row) => row.client_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const clientMap = await loadClientMap(db, organizationId, clientIds);
        const total = count ?? 0;

        return {
          ok: true,
          count: total,
          status_filter: status,
          showing: (data || []).length,
          projects: (data || []).map((p) => {
            const client = clientMap.get(p.client_id);
            return {
              id: p.id,
              name: p.name,
              status: p.status,
              billing_type: p.billing_type,
              client: client?.company || client?.name || "Unknown",
              client_id: p.client_id,
            };
          }),
          message:
            total === 0
              ? "No projects found."
              : total > limit
                ? `Showing ${limit} of ${total} projects.`
                : undefined,
        };
      }

      case "create_project": {
        const name = String(args.name || "").trim();
        if (!name) return { error: "Project name is required." };

        const resolved = await resolveClient(db, organizationId, args);
        if (!resolved.ok) {
          return {
            error: resolved.error,
            ...(resolved.matches ? { matches: resolved.matches } : {}),
          };
        }

        const statusRaw = String(args.status || "active").toLowerCase();
        const status =
          statusRaw === "on_hold" ||
          statusRaw === "completed" ||
          statusRaw === "archived"
            ? statusRaw
            : "active";
        const billingRaw = String(args.billing_type || "fixed").toLowerCase();
        const billing_type =
          billingRaw === "hourly" ||
          billingRaw === "daily" ||
          billingRaw === "retainer" ||
          billingRaw === "mixed"
            ? billingRaw
            : "fixed";

        const { data, error } = await db
          .from("projects")
          .insert({
            organization_id: organizationId,
            client_id: resolved.id,
            name,
            description: args.description
              ? String(args.description).trim()
              : null,
            status,
            billing_type,
            created_by: userId,
          })
          .select("id, name, status, billing_type, client_id")
          .single();

        if (error) return { error: error.message };
        return {
          ok: true,
          project: {
            ...data,
            client: resolved.label,
          },
        };
      }

      case "find_project": {
        const query = String(args.query || "").trim();
        if (!query) return { error: "query is required." };

        let clientId: string | null = null;
        if (args.client_id || args.client_query) {
          const resolved = await resolveClient(db, organizationId, args);
          if (!resolved.ok) {
            return {
              error: resolved.error,
              ...(resolved.matches ? { matches: resolved.matches } : {}),
            };
          }
          clientId = resolved.id;
        }

        const projects = await searchProjects(
          db,
          organizationId,
          query,
          clientId
        );
        const clientIds = [
          ...new Set(projects.map((p) => p.client_id).filter(Boolean)),
        ];
        const clientMap = await loadClientMap(db, organizationId, clientIds);

        return {
          ok: true,
          count: projects.length,
          projects: projects.map((p) => {
            const client = clientMap.get(p.client_id);
            return {
              id: p.id,
              name: p.name,
              status: p.status,
              client: client?.company || client?.name || "Unknown",
              client_id: p.client_id,
            };
          }),
        };
      }

      case "list_tasks": {
        const limit = Math.min(40, Math.max(1, Number(args.limit) || 15));
        const columnArg = args.column
          ? normalizeTaskColumn(args.column)
          : null;

        let filterClientId: string | null = null;
        if (args.client_id || args.client_query) {
          const resolved = await resolveClient(db, organizationId, args);
          if (!resolved.ok) {
            return {
              error: resolved.error,
              ...(resolved.matches ? { matches: resolved.matches } : {}),
            };
          }
          filterClientId = resolved.id;
        }

        let filterProjectId: string | null = null;
        if (args.project_id || args.project_query) {
          const resolved = await resolveProject(db, organizationId, {
            project_id: args.project_id,
            project_query: args.project_query,
            client_id: filterClientId,
          });
          if (!resolved.ok) {
            return {
              error: resolved.error,
              ...(resolved.matches ? { matches: resolved.matches } : {}),
            };
          }
          filterProjectId = resolved.id;
          if (!filterClientId) filterClientId = resolved.client_id;
        }

        let query = db
          .from("tasks")
          .select(
            "id, title, column_id, priority, due_date, client_id, project_id, updated_at"
          )
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (columnArg) query = query.eq("column_id", columnArg);
        if (filterClientId) query = query.eq("client_id", filterClientId);
        if (filterProjectId) query = query.eq("project_id", filterProjectId);

        const { data, error } = await query;
        if (error) return { error: error.message };

        const clientIds = [
          ...new Set(
            (data || [])
              .map((row) => row.client_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const projectIds = [
          ...new Set(
            (data || [])
              .map((row) => row.project_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const clientMap = await loadClientMap(db, organizationId, clientIds);
        const projectMap = new Map<string, string>();
        if (projectIds.length) {
          const { data: projects } = await db
            .from("projects")
            .select("id, name")
            .eq("organization_id", organizationId)
            .in("id", projectIds);
          for (const p of projects || []) projectMap.set(p.id, p.name);
        }

        return {
          ok: true,
          count: (data || []).length,
          tasks: (data || []).map((t) => {
            const client = t.client_id
              ? clientMap.get(t.client_id)
              : undefined;
            return {
              id: t.id,
              title: t.title,
              column: t.column_id,
              priority: t.priority,
              due_date: t.due_date,
              client: client?.company || client?.name || null,
              project: t.project_id
                ? projectMap.get(t.project_id) || null
                : null,
            };
          }),
        };
      }

      case "create_task": {
        const title = String(args.title || "").trim();
        if (!title) return { error: "Task title is required." };

        let clientId: string | null = null;
        let clientLabel: string | null = null;
        if (args.client_id || args.client_query) {
          const resolved = await resolveClient(db, organizationId, args);
          if (!resolved.ok) {
            return {
              error: resolved.error,
              ...(resolved.matches ? { matches: resolved.matches } : {}),
            };
          }
          clientId = resolved.id;
          clientLabel = resolved.label;
        }

        let projectId: string | null = null;
        let projectName: string | null = null;
        if (args.project_id || args.project_query) {
          const resolved = await resolveProject(db, organizationId, {
            project_id: args.project_id,
            project_query: args.project_query,
            client_id: clientId,
          });
          if (!resolved.ok) {
            return {
              error: resolved.error,
              ...(resolved.matches ? { matches: resolved.matches } : {}),
            };
          }
          projectId = resolved.id;
          projectName = resolved.name;
          if (!clientId) {
            clientId = resolved.client_id;
            const { data: client } = await db
              .from("clients")
              .select("name, company")
              .eq("id", clientId)
              .maybeSingle();
            clientLabel = client?.company || client?.name || null;
          }
        }

        const column_id = normalizeTaskColumn(args.column);
        const priority = normalizeTaskPriority(args.priority);
        const dueRaw = String(args.due_date || "").trim();
        const due_date =
          /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : null;

        const { data: maxPos } = await db
          .from("tasks")
          .select("position")
          .eq("organization_id", organizationId)
          .eq("column_id", column_id)
          .is("deleted_at", null)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const position = (Number(maxPos?.position) || 0) + 1;

        const { data, error } = await db
          .from("tasks")
          .insert({
            organization_id: organizationId,
            title,
            description: args.description
              ? String(args.description).trim()
              : null,
            column_id,
            priority,
            due_date,
            client_id: clientId,
            project_id: projectId,
            position,
            created_by: userId,
          })
          .select(
            "id, title, column_id, priority, due_date, client_id, project_id"
          )
          .single();

        if (error) return { error: error.message };
        return {
          ok: true,
          task: {
            id: data.id,
            title: data.title,
            column: data.column_id,
            priority: data.priority,
            due_date: data.due_date,
            client: clientLabel,
            project: projectName,
          },
        };
      }

      case "create_invoice_draft": {
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return { error: "A positive amount is required." };
        }

        const resolved = await resolveClient(db, organizationId, args);
        if (!resolved.ok) {
          return {
            error: resolved.error,
            ...(resolved.matches ? { matches: resolved.matches } : {}),
          };
        }
        const { id: clientId, label: clientLabel } = resolved;

        const { data: org } = await db
          .from("organizations")
          .select(
            "currency, default_tax_enabled, default_tax_rate, default_prices_include_tax, tax_id"
          )
          .eq("id", organizationId)
          .maybeSingle();

        const currency =
          (args.currency ? String(args.currency).toUpperCase() : null) ||
          org?.currency ||
          "EUR";
        const taxEnabled = Boolean(org?.default_tax_enabled);
        const taxRate = taxEnabled ? Number(org?.default_tax_rate) || 0 : 0;
        const pricesIncludeTax = taxEnabled
          ? Boolean(org?.default_prices_include_tax)
          : false;
        const dueInDays = Math.max(
          0,
          Math.round(Number(args.due_in_days) || 14)
        );
        const issueDate = todayISO();
        const dueDate = addDaysISO(issueDate, dueInDays);
        const description =
          String(args.description || "").trim() || "Services";

        const qty = 1;
        const unitPrice = amount;
        const lineAmt = lineAmount(qty, unitPrice);
        const totals = computeInvoiceTotals([{ quantity: qty, unitPrice }], {
          taxEnabled,
          taxRate,
          pricesIncludeTax,
        });

        const { data: invoice, error: invoiceError } = await db
          .from("invoices")
          .insert({
            organization_id: organizationId,
            client_id: clientId,
            number: null,
            status: "draft",
            currency,
            issue_date: issueDate,
            due_date: dueDate,
            created_by: userId,
            subtotal: totals.subtotal,
            tax_total: totals.taxTotal,
            total: totals.total,
            payment_token: nanoid(24),
            tax_enabled: taxEnabled,
            tax_rate: taxEnabled ? taxRate : 0,
            prices_include_tax: pricesIncludeTax,
            show_tax_id: taxEnabled,
            tax_id: taxEnabled ? org?.tax_id || null : null,
            show_logo: true,
          })
          .select("id, status, currency, total, due_date, issue_date")
          .single();

        if (invoiceError || !invoice) {
          return { error: invoiceError?.message || "Could not create invoice." };
        }

        const { error: lineError } = await db
          .from("invoice_line_items")
          .insert({
            invoice_id: invoice.id,
            organization_id: organizationId,
            description,
            quantity: qty,
            unit: "flat",
            unit_price: unitPrice,
            amount: lineAmt,
            position: 0,
          });

        if (lineError) {
          return {
            error: lineError.message || "Invoice created but line item failed.",
            invoice_id: invoice.id,
          };
        }

        await ctx.setPendingAction({
          type: "send_invoice",
          invoice_id: invoice.id,
        });

        return {
          ok: true,
          invoice: {
            id: invoice.id,
            client: clientLabel,
            amount: formatInvoiceMoney(Number(invoice.total) || 0, currency),
            amount_raw: Number(invoice.total) || 0,
            currency,
            due_date: invoice.due_date,
            due_in_days: dueInDays,
            status: "draft",
            description,
          },
          ask_to_send: true,
          message:
            "Draft created. Ask the user if they want you to send it to the client.",
        };
      }

      case "list_draft_invoices": {
        const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
        let clientFilterIds: string[] | null = null;
        const clientQuery = String(args.client_query || "").trim();
        if (clientQuery) {
          const matches = await searchClients(db, organizationId, clientQuery);
          if (!matches.length) {
            return {
              ok: true,
              count: 0,
              invoices: [],
              message: `No clients matched "${clientQuery}".`,
            };
          }
          clientFilterIds = matches.map((c) => c.id);
        }

        let query = db
          .from("invoices")
          .select(
            "id, number, status, currency, total, due_date, issue_date, client_id, created_at"
          )
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (clientFilterIds) {
          query = query.in("client_id", clientFilterIds);
        }

        const { data, error } = await query;
        if (error) return { error: error.message };

        const clientIds = [
          ...new Set(
            (data || [])
              .map((row) => row.client_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const clientMap = await loadClientMap(db, organizationId, clientIds);

        const invoices = (data || []).map((row) => {
          const client = row.client_id
            ? clientMap.get(row.client_id)
            : undefined;
          return {
            id: row.id,
            number: row.number,
            status: row.status,
            issue_date: row.issue_date,
            due_date: row.due_date,
            amount: formatInvoiceMoney(
              Number(row.total) || 0,
              row.currency || "EUR"
            ),
            amount_raw: Number(row.total) || 0,
            currency: row.currency || "EUR",
            client: client?.company || client?.name || "Unknown",
          };
        });

        return {
          ok: true,
          count: invoices.length,
          invoices,
          message:
            invoices.length === 0
              ? "No draft invoices."
              : "These drafts can be sent after the user confirms.",
        };
      }

      case "list_unbilled_hours": {
        let filterClientId: string | null = null;
        let filterClientLabel: string | null = null;

        if (args.client_id || args.client_query) {
          const resolved = await resolveClient(db, organizationId, args);
          if (!resolved.ok) {
            return {
              error: resolved.error,
              ...(resolved.matches ? { matches: resolved.matches } : {}),
            };
          }
          filterClientId = resolved.id;
          filterClientLabel = resolved.label;
        }

        const { data: org } = await db
          .from("organizations")
          .select("currency")
          .eq("id", organizationId)
          .maybeSingle();
        const currency = org?.currency || "EUR";

        let query = db
          .from("time_entries")
          .select(
            "id, duration_minutes, hourly_rate, client_id, description, started_at"
          )
          .eq("organization_id", organizationId)
          .eq("billable", true)
          .is("deleted_at", null)
          .is("invoice_id", null)
          .gt("duration_minutes", 0);

        if (filterClientId) {
          query = query.eq("client_id", filterClientId);
        }

        const { data: entries, error } = await query;
        if (error) return { error: error.message };

        const byClient = new Map<
          string,
          { minutes: number; amount: number; entries: number }
        >();

        for (const row of entries || []) {
          const key = row.client_id || "none";
          const minutes = Number(row.duration_minutes) || 0;
          const rate =
            Number(row.hourly_rate) > 0
              ? Number(row.hourly_rate)
              : DEFAULT_HOURLY_RATE;
          const amount = lineAmount(minutes / 60, rate);
          const current = byClient.get(key) || {
            minutes: 0,
            amount: 0,
            entries: 0,
          };
          current.minutes += minutes;
          current.amount += amount;
          current.entries += 1;
          byClient.set(key, current);
        }

        const clientIds = [...byClient.keys()].filter((id) => id !== "none");
        const clientMap = await loadClientMap(db, organizationId, clientIds);

        const clients = Array.from(byClient.entries())
          .map(([clientId, row]) => {
            const client =
              clientId === "none" ? null : clientMap.get(clientId);
            return {
              client_id: clientId === "none" ? null : clientId,
              client:
                filterClientLabel ||
                client?.company ||
                client?.name ||
                (clientId === "none" ? "No client" : "Unknown"),
              hours: formatDurationMinutes(row.minutes),
              hours_raw: Math.round((row.minutes / 60) * 100) / 100,
              minutes: row.minutes,
              amount: formatInvoiceMoney(row.amount, currency),
              amount_raw: Math.round(row.amount * 100) / 100,
              entries: row.entries,
            };
          })
          .sort((a, b) => b.amount_raw - a.amount_raw);

        const totalMinutes = clients.reduce((sum, c) => sum + c.minutes, 0);
        const totalAmount = clients.reduce((sum, c) => sum + c.amount_raw, 0);

        const proposeClients: PendingUnbilledClient[] = clients
          .filter((c) => Boolean(c.client_id))
          .map((c) => ({
            client_id: String(c.client_id),
            label: String(c.client),
          }));

        if (proposeClients.length > 0) {
          await ctx.setPendingAction({
            type: "propose_unbilled_invoices",
            clients: proposeClients,
          });
        }

        return {
          ok: true,
          count: clients.length,
          currency,
          clients,
          total_hours: formatDurationMinutes(Math.round(totalMinutes)),
          total_amount: formatInvoiceMoney(totalAmount, currency),
          pending_propose: proposeClients.length > 0,
          message:
            clients.length === 0
              ? "No unbilled hours."
              : proposeClients.length > 1
                ? "Summarize clients briefly, then ask which to invoice. They can say all, name a subset, or skip some (e.g. invoice Acme and Beta, skip Northwind). Then call create_invoices_from_unbilled_batch."
                : "Offer to create a draft invoice from unbilled hours for this client.",
        };
      }

      case "create_invoice_from_unbilled": {
        const resolved = await resolveClient(db, organizationId, args);
        if (!resolved.ok) {
          return {
            error: resolved.error,
            ...(resolved.matches ? { matches: resolved.matches } : {}),
          };
        }
        const { id: clientId, label: clientLabel } = resolved;
        const consolidate = args.consolidate !== false;
        const dueInDays = Math.max(
          0,
          Math.round(Number(args.due_in_days) || 14)
        );

        const created = await createUnbilledInvoiceForClient(ctx, {
          clientId,
          clientLabel,
          dueInDays,
          consolidate,
        });
        if (!created.ok) return { error: created.error };

        await ctx.setPendingAction({
          type: "send_invoice",
          invoice_id: created.invoice.id,
        });

        return {
          ok: true,
          invoice: created.invoice,
          ask_to_send: true,
          message:
            "Draft created from unbilled hours. Ask the user if they want you to send it to the client.",
        };
      }

      case "create_invoices_from_unbilled_batch": {
        const dueInDays = Math.max(
          0,
          Math.round(Number(args.due_in_days) || 14)
        );
        const consolidate = args.consolidate !== false;
        const includeIds = Array.isArray(args.include_client_ids)
          ? args.include_client_ids.map(String)
          : [];
        const includeQueries = Array.isArray(args.include_client_queries)
          ? args.include_client_queries.map(String)
          : [];
        const excludeQueries = Array.isArray(args.exclude_client_queries)
          ? args.exclude_client_queries.map(String)
          : [];
        const allPending = Boolean(args.all_pending);

        const pendingClients =
          ctx.pendingAction?.type === "propose_unbilled_invoices"
            ? ctx.pendingAction.clients
            : [];

        let targets: PendingUnbilledClient[] = [];

        if (pendingClients.length) {
          if (includeIds.length) {
            targets = selectPendingClients(pendingClients, {
              includeIds,
              excludeQueries,
            });
          } else if (includeQueries.length) {
            targets = selectPendingClients(pendingClients, {
              includeQueries,
              excludeQueries,
            });
          } else if (allPending || excludeQueries.length) {
            // all_pending, or "skip Northwind" implying the rest
            targets = selectPendingClients(pendingClients, {
              excludeQueries,
            });
          } else {
            return {
              error:
                "Say which clients to invoice, or all_pending=true. Example include_client_queries: [\"Acme\",\"Beta\"].",
            };
          }
        } else if (includeIds.length || includeQueries.length) {
          const seen = new Set<string>();
          for (const id of includeIds) {
            if (seen.has(id)) continue;
            const { data: client } = await db
              .from("clients")
              .select("id, name, company")
              .eq("organization_id", organizationId)
              .eq("id", id)
              .is("deleted_at", null)
              .maybeSingle();
            if (!client) continue;
            seen.add(client.id);
            targets.push({
              client_id: client.id,
              label: client.company?.trim() || client.name,
            });
          }
          for (const query of includeQueries) {
            const resolved = await resolveClient(db, organizationId, {
              client_query: query,
            });
            if (!resolved.ok) continue;
            if (seen.has(resolved.id)) continue;
            seen.add(resolved.id);
            targets.push({ client_id: resolved.id, label: resolved.label });
          }
          if (excludeQueries.length) {
            targets = selectPendingClients(targets, { excludeQueries });
          }
        } else {
          return {
            error:
              "No pending unbilled list. Call list_unbilled_hours first, or pass include_client_ids / include_client_queries.",
          };
        }

        if (!targets.length) {
          return {
            error:
              "No matching clients to invoice from the pending list / queries.",
          };
        }

        const invoices: Array<Record<string, unknown>> = [];
        const errors: string[] = [];

        for (const target of targets.slice(0, 10)) {
          const created = await createUnbilledInvoiceForClient(ctx, {
            clientId: target.client_id,
            clientLabel: target.label,
            dueInDays,
            consolidate,
          });
          if (!created.ok) {
            errors.push(`${target.label}: ${created.error}`);
            continue;
          }
          invoices.push(created.invoice);
        }

        if (!invoices.length) {
          return {
            error: errors.join(" ") || "Could not create any invoices.",
          };
        }

        const pendingSend: PendingSendInvoice[] = invoices.map((inv) => ({
          invoice_id: String(inv.id),
          client: String(inv.client || ""),
        }));

        if (pendingSend.length === 1) {
          await ctx.setPendingAction({
            type: "send_invoice",
            invoice_id: pendingSend[0].invoice_id,
          });
        } else {
          await ctx.setPendingAction({
            type: "send_invoices",
            invoices: pendingSend,
          });
        }

        return {
          ok: true,
          count: invoices.length,
          invoices,
          errors: errors.length ? errors : undefined,
          ask_to_send: true,
          message:
            invoices.length === 1
              ? "Draft created. Ask if they want it sent."
              : `Created ${invoices.length} drafts. Summarize clients/amounts briefly and ask if they want them sent (all, some, or wait).`,
        };
      }

      case "list_unpaid_invoices": {
        const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
        const { data, error } = await db
          .from("invoices")
          .select("id, number, status, currency, total, due_date, client_id")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .in("status", ["sent", "viewed", "overdue"])
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(limit);

        if (error) return { error: error.message };

        const clientIds = [
          ...new Set(
            (data || [])
              .map((row) => row.client_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const clientMap = await loadClientMap(db, organizationId, clientIds);

        const invoices = (data || []).map((row) => {
          const client = row.client_id
            ? clientMap.get(row.client_id)
            : undefined;
          return {
            id: row.id,
            number: row.number,
            status: row.status,
            due_date: row.due_date,
            amount: formatInvoiceMoney(
              Number(row.total) || 0,
              row.currency || "EUR"
            ),
            client: client?.company || client?.name || "Unknown",
          };
        });

        const totalOutstanding = (data || []).reduce(
          (sum, row) => sum + (Number(row.total) || 0),
          0
        );

        return {
          ok: true,
          count: invoices.length,
          invoices,
          total_outstanding_hint: totalOutstanding,
        };
      }

      case "create_proposal_draft": {
        if (!isProposalAiConfigured()) {
          return {
            error:
              "Proposal AI is not configured. Add OPENAI_API_KEY, or draft in the Rebban dashboard.",
          };
        }

        const notes = String(args.notes || "").trim();
        if (notes.length < 40) {
          return {
            error:
              "Need more project context (at least a short paragraph). Ask the user for scope, deliverables, timeline, or budget details.",
          };
        }

        const resolved = await resolveClient(db, organizationId, args);
        if (!resolved.ok) {
          return {
            error: resolved.error,
            ...(resolved.matches ? { matches: resolved.matches } : {}),
          };
        }
        const { id: clientId, label: clientLabel } = resolved;

        const { data: client } = await db
          .from("clients")
          .select("id, name, company, email")
          .eq("id", clientId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (!client) return { error: "Client not found." };

        const [{ data: org }, { data: profile }] = await Promise.all([
          db
            .from("organizations")
            .select("name, currency")
            .eq("id", organizationId)
            .maybeSingle(),
          db
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .maybeSingle(),
        ]);

        const titleHint = String(args.title_hint || "").trim();
        const category = String(args.category || "").trim() || null;
        const pricingHint = String(args.pricing_hint || "").trim() || null;
        const currency =
          (args.currency ? String(args.currency).toUpperCase() : null) ||
          org?.currency ||
          "EUR";

        const brief = [
          titleHint ? `Working title: ${titleHint}` : "",
          notes,
        ]
          .filter(Boolean)
          .join("\n\n");

        try {
          const result = await generateProposalFromBrief({
            brief,
            clientName: client.name,
            clientCompany: client.company,
            organizationName: org?.name || profile?.full_name || null,
            category,
            currency,
            pricingHint,
          });

          const contentJson = toProposalContentJson({
            ...result.content,
            meta: {
              ...(result.content.meta || {}),
              pricingModel: (pricingHint || result.pricingType || "fixed")
                .toString()
                .toLowerCase(),
              category: category || "other",
              creationMode: "ai",
              aiBrief: notes.slice(0, 8000),
              source:
                ctx.channel === "in_app"
                  ? "in_app_assistant"
                  : "whatsapp_assistant",
            },
          });

          const { data: proposal, error: insertError } = await db
            .from("proposals")
            .insert({
              organization_id: organizationId,
              client_id: client.id,
              title: result.title,
              amount: result.amount > 0 ? result.amount : 0,
              currency: result.currency,
              status: "draft",
              content: contentJson,
              expires_at: new Date(
                Date.now() + 1000 * 60 * 60 * 24 * 14
              ).toISOString(),
              created_by: userId,
            })
            .select("id, title, amount, currency, status, expires_at")
            .single();

          if (insertError || !proposal) {
            return {
              error: insertError?.message || "Could not save proposal draft.",
            };
          }

          await ctx.setPendingAction({
            type: "send_proposal",
            proposal_id: proposal.id,
          });

          return {
            ok: true,
            proposal: {
              id: proposal.id,
              title: proposal.title,
              client: clientLabel,
              amount: formatInvoiceMoney(
                Number(proposal.amount) || 0,
                proposal.currency || currency
              ),
              amount_raw: Number(proposal.amount) || 0,
              currency: proposal.currency || currency,
              status: "draft",
              expires_at: proposal.expires_at,
            },
            ask_to_send: true,
            message:
              "Draft proposal created from their notes. Summarize title, client, and amount, then ask if they want it sent. They can also refine it in the Rebban dashboard.",
          };
        } catch (err) {
          return {
            error:
              err instanceof Error
                ? err.message
                : "Could not generate proposal draft.",
          };
        }
      }

      case "list_draft_proposals": {
        const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
        let clientFilterIds: string[] | null = null;
        const clientQuery = String(args.client_query || "").trim();
        if (clientQuery) {
          const matches = await searchClients(db, organizationId, clientQuery);
          if (!matches.length) {
            return {
              ok: true,
              count: 0,
              proposals: [],
              message: `No clients matched "${clientQuery}".`,
            };
          }
          clientFilterIds = matches.map((c) => c.id);
        }

        let query = db
          .from("proposals")
          .select(
            "id, title, status, currency, amount, expires_at, client_id, created_at"
          )
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (clientFilterIds) {
          query = query.in("client_id", clientFilterIds);
        }

        const { data, error } = await query;
        if (error) return { error: error.message };

        const clientIds = [
          ...new Set(
            (data || [])
              .map((row) => row.client_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const clientMap = await loadClientMap(db, organizationId, clientIds);

        const proposals = (data || []).map((row) => {
          const client = row.client_id
            ? clientMap.get(row.client_id)
            : undefined;
          return {
            id: row.id,
            title: row.title,
            status: row.status,
            expires_at: row.expires_at,
            amount: formatInvoiceMoney(
              Number(row.amount) || 0,
              row.currency || "EUR"
            ),
            amount_raw: Number(row.amount) || 0,
            currency: row.currency || "EUR",
            client: client?.company || client?.name || "Unknown",
          };
        });

        return {
          ok: true,
          count: proposals.length,
          proposals,
          message:
            proposals.length === 0
              ? "No draft proposals."
              : "These drafts can be sent after the user confirms.",
        };
      }

      case "list_proposals": {
        const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
        const statusRaw = String(args.status || "")
          .trim()
          .toLowerCase();
        const status =
          statusRaw === "draft" ||
          statusRaw === "sent" ||
          statusRaw === "viewed" ||
          statusRaw === "accepted" ||
          statusRaw === "declined"
            ? statusRaw
            : null;

        let clientFilterIds: string[] | null = null;
        if (args.client_id || args.client_query) {
          const resolved = await resolveClient(db, organizationId, args);
          if (!resolved.ok) {
            return {
              error: resolved.error,
              ...(resolved.matches ? { matches: resolved.matches } : {}),
            };
          }
          clientFilterIds = [resolved.id];
        }

        let query = db
          .from("proposals")
          .select(
            "id, title, status, amount, currency, expires_at, client_id, updated_at, sent_at"
          )
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (status) query = query.eq("status", status);
        if (clientFilterIds) query = query.in("client_id", clientFilterIds);

        const { data, error } = await query;
        if (error) return { error: error.message };

        const clientIds = [
          ...new Set(
            (data || [])
              .map((row) => row.client_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const clientMap = await loadClientMap(db, organizationId, clientIds);

        const proposals = (data || []).map((row) => {
          const client = row.client_id
            ? clientMap.get(row.client_id)
            : undefined;
          return {
            id: row.id,
            title: row.title,
            status: row.status,
            expires_at: row.expires_at,
            sent_at: row.sent_at,
            amount: formatInvoiceMoney(
              Number(row.amount) || 0,
              row.currency || "EUR"
            ),
            amount_raw: Number(row.amount) || 0,
            currency: row.currency || "EUR",
            client: client?.company || client?.name || "Unknown",
            client_id: row.client_id,
          };
        });

        return {
          ok: true,
          count: proposals.length,
          proposals,
          message:
            proposals.length === 0
              ? status
                ? `No ${status} proposals found.`
                : "No proposals found."
              : undefined,
        };
      }

      case "convert_proposal_to_project": {
        let proposalId = String(args.proposal_id || "").trim();

        if (!proposalId) {
          const clientQuery = String(args.client_query || "").trim();
          if (!clientQuery) {
            return {
              error:
                "Pass proposal_id, or client_query to find an accepted proposal.",
            };
          }
          const resolved = await resolveClient(db, organizationId, {
            client_query: clientQuery,
          });
          if (!resolved.ok) {
            return {
              error: resolved.error,
              ...(resolved.matches ? { matches: resolved.matches } : {}),
            };
          }
          const { data: accepted, error: acceptedError } = await db
            .from("proposals")
            .select("id, title, status, project_id")
            .eq("organization_id", organizationId)
            .eq("client_id", resolved.id)
            .eq("status", "accepted")
            .is("deleted_at", null)
            .is("project_id", null)
            .order("updated_at", { ascending: false })
            .limit(5);
          if (acceptedError) return { error: acceptedError.message };
          if (!accepted?.length) {
            return {
              error: `No accepted proposals without a project for ${resolved.label}.`,
            };
          }
          if (accepted.length > 1) {
            return {
              error: "Multiple accepted proposals — pass proposal_id.",
              matches: accepted.map((p) => ({
                id: p.id,
                title: p.title,
                status: p.status,
              })),
            };
          }
          proposalId = accepted[0].id;
        }

        const invoiceKindRaw = String(args.invoice_kind || "none")
          .trim()
          .toLowerCase();
        const invoiceKind =
          invoiceKindRaw === "deposit" ||
          invoiceKindRaw === "full" ||
          invoiceKindRaw === "retainer"
            ? invoiceKindRaw
            : "none";
        const generateTasks =
          args.generate_tasks === undefined
            ? true
            : Boolean(args.generate_tasks);

        try {
          const result = await convertProposalToProject(db, {
            proposalId,
            userId,
            organizationId,
            name: String(args.name || "").trim(),
            invoiceKind,
            depositAmount:
              args.deposit_amount !== undefined
                ? Number(args.deposit_amount)
                : null,
            generateAiTasks: generateTasks,
          });

          if (result.invoiceId) {
            await ctx.setPendingAction({
              type: "send_invoice",
              invoice_id: result.invoiceId,
            });
          }

          return {
            ok: true,
            project_id: result.projectId,
            project_name: result.projectName,
            billing_type: result.billingType,
            task_count: result.taskCount,
            invoice_id: result.invoiceId,
            invoice_number: result.invoiceNumber,
            ask_to_send: Boolean(result.invoiceId),
            message: result.invoiceId
              ? "Project created. An invoice draft is ready — ask before sending."
              : "Project created. Summarize name and task count briefly.",
          };
        } catch (err) {
          return {
            error:
              err instanceof Error
                ? err.message
                : "Could not convert proposal to project.",
          };
        }
      }

      case "list_needs_attention": {
        const limit = Math.min(20, Math.max(1, Number(args.limit) || 12));
        const items = await collectNeedsAttention(db, organizationId, {
          limit,
        });
        return {
          ok: true,
          count: items.length,
          items,
          message:
            items.length === 0
              ? "Nothing urgent needs attention right now."
              : "Summarize the top items and offer to take the suggested action.",
        };
      }

      case "list_receipts": {
        const wantsMonth =
          args.month != null ||
          args.year != null ||
          String(args.month_query || "").trim().length > 0;
        const parsed = wantsMonth ? parseReceiptMonthYear(args) : null;
        if (parsed && !parsed.ok) return { error: parsed.error };

        const limit =
          typeof args.limit === "number" && Number.isFinite(args.limit)
            ? Math.min(Math.max(Math.round(args.limit), 1), 20)
            : 8;

        let query = db
          .from("receipts")
          .select(
            "id, merchant, receipt_date, amount_minor, currency, review_status, created_at",
            { count: "exact" }
          )
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("receipt_date", { ascending: false, nullsFirst: false })
          .limit(limit);

        if (parsed?.ok) {
          const start = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-01`;
          const endDate = new Date(Date.UTC(parsed.year, parsed.month, 0));
          const end = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
          query = query.gte("receipt_date", start).lte("receipt_date", end);
        }

        const { data, error, count } = await query;
        if (error) return { error: error.message };

        const { count: undatedCount } = await db
          .from("receipts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .is("receipt_date", null);

        const receipts = (data || []).map((row) => ({
          id: row.id,
          merchant: row.merchant || "Unknown",
          receipt_date: row.receipt_date,
          amount: formatReceiptMoney(row.amount_minor, row.currency),
          currency: row.currency,
          review_status: row.review_status,
        }));

        const total = count ?? receipts.length;
        const label = parsed?.ok ? parsed.label : "your workspace";
        return {
          ok: true,
          total,
          undated_count: undatedCount || 0,
          month_label: parsed?.ok ? parsed.label : null,
          receipts,
          message:
            total === 0
              ? parsed?.ok
                ? `No dated receipts for ${label}. Mention undated (${undatedCount || 0}) if any.`
                : `No receipts yet. Mention undated (${undatedCount || 0}) if any.`
              : `Summarize ${total} receipt${total === 1 ? "" : "s"} for ${label} briefly from the sample. Offer a month ZIP only if they want to download/export.`,
        };
      }

      case "export_receipts_month": {
        const parsed = parseReceiptMonthYear(args);
        if (!parsed.ok) return { error: parsed.error };

        const admin = createAdminClient();
        let zip: Awaited<ReturnType<typeof buildMonthExportZip>>;
        try {
          zip = await buildMonthExportZip({
            db: admin,
            organizationId,
            year: parsed.year,
            month: parsed.month,
          });
        } catch (err) {
          const detail =
            err instanceof Error ? err.message : "Could not build receipt ZIP.";
          return { error: `Receipt export failed: ${detail}` };
        }

        const { data: exportRow, error: exportError } = await db
          .from("receipt_exports")
          .insert({
            organization_id: organizationId,
            year: parsed.year,
            month: parsed.month,
            storage_key: zip.storageKey,
            expires_at: zip.expiresAt,
            created_by: userId,
            status: "ready",
          })
          .select("id, year, month, expires_at, generated_at")
          .single();

        if (exportError || !exportRow) {
          return {
            error: exportError?.message || "Failed to record export.",
          };
        }

        return {
          ok: true,
          export_id: exportRow.id,
          year: parsed.year,
          month: parsed.month,
          label: parsed.label,
          receipt_count: zip.receiptCount,
          unfiled_count: zip.unfiledCount,
          download_path: `/api/receipts/exports/${exportRow.id}/download`,
          expires_at: exportRow.expires_at,
          message:
            zip.receiptCount === 0
              ? `No dated receipts found for ${parsed.label}. Mention Unfiled (${zip.unfiledCount}) if any, and offer to help fix dates.`
              : `ZIP ready for ${parsed.label} (${zip.receiptCount} receipt${zip.receiptCount === 1 ? "" : "s"}). Tell them briefly and ask once if they want it emailed to themselves or their bookkeeper.`,
        };
      }

      case "send_receipts_export": {
        if (args.confirmed !== true) {
          return {
            error:
              "Emailing requires confirmed=true after the user asks to send the package.",
          };
        }

        const recipientMode = String(args.recipient || "").toLowerCase();
        let toEmail = "";
        let recipientName: string | null = null;

        const { data: profile } = await db
          .from("profiles")
          .select("full_name, email")
          .eq("id", userId)
          .maybeSingle();

        if (recipientMode === "me") {
          toEmail = (profile?.email || "").trim().toLowerCase();
          recipientName = profile?.full_name || null;
          if (!toEmail) {
            return {
              error:
                "No email on the user's profile. Ask them for an address and call again with recipient=email and to_email.",
            };
          }
        } else if (recipientMode === "email") {
          toEmail = String(args.to_email || "")
            .trim()
            .toLowerCase();
          if (!toEmail || !toEmail.includes("@")) {
            return {
              error: "Provide to_email when recipient=email.",
            };
          }
        } else {
          return { error: "recipient must be me or email." };
        }

        let exportId = args.export_id ? String(args.export_id).trim() : "";
        let year = 0;
        let month = 0;
        let storageKey: string | null = null;

        if (exportId) {
          const { data: existing } = await db
            .from("receipt_exports")
            .select("id, year, month, storage_key, expires_at")
            .eq("id", exportId)
            .eq("organization_id", organizationId)
            .maybeSingle();
          if (!existing?.storage_key) {
            return { error: "Export not found. Call export_receipts_month first." };
          }
          if (
            existing.expires_at &&
            new Date(existing.expires_at).getTime() < Date.now()
          ) {
            return {
              error: "That export expired. Call export_receipts_month again.",
            };
          }
          year = existing.year;
          month = existing.month;
          storageKey = existing.storage_key;
        } else {
          const parsed = parseReceiptMonthYear(args);
          if (!parsed.ok) return { error: parsed.error };
          const admin = createAdminClient();
          const zip = await buildMonthExportZip({
            db: admin,
            organizationId,
            year: parsed.year,
            month: parsed.month,
          });
          const { data: created, error: createError } = await db
            .from("receipt_exports")
            .insert({
              organization_id: organizationId,
              year: parsed.year,
              month: parsed.month,
              storage_key: zip.storageKey,
              expires_at: zip.expiresAt,
              created_by: userId,
              status: "ready",
            })
            .select("id, year, month, storage_key")
            .single();
          if (createError || !created?.storage_key) {
            return {
              error: createError?.message || "Failed to create export.",
            };
          }
          exportId = created.id;
          year = created.year;
          month = created.month;
          storageKey = created.storage_key;
        }

        const admin = createAdminClient();
        const zipBytes = await downloadReceiptBytes(admin, storageKey!);
        const label = `${MONTH_NAMES[month - 1]} ${year}`;
        const filename = `receipts-${MONTH_NAMES[month - 1]}-${year}.zip`.replace(
          /\s+/g,
          "-"
        );

        // Count dated receipts for the email copy
        const start = `${year}-${String(month).padStart(2, "0")}-01`;
        const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const end = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
        const { count } = await db
          .from("receipts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .gte("receipt_date", start)
          .lte("receipt_date", end);

        const emailResult = await sendReceiptExportEmail({
          to: toEmail,
          recipientName,
          senderName: profile?.full_name || null,
          monthLabel: label,
          receiptCount: count || 0,
          zipBytes,
          filename,
        });

        return {
          ok: true,
          sent: true,
          export_id: exportId,
          to: toEmail,
          label,
          provider:
            emailResult && "provider" in emailResult
              ? emailResult.provider
              : "resend",
          message: `Sent ${label} receipts ZIP to ${toEmail}. Confirm briefly.`,
        };
      }

      case "get_billing_schedule": {
        const { data: profile } = await db
          .from("profiles")
          .select("notification_prefs, timezone")
          .eq("id", userId)
          .maybeSingle();
        const schedule = billingScheduleFromPrefs(profile?.notification_prefs);
        const timezone = resolveDigestTimezone(profile?.timezone);
        return {
          ok: true,
          schedule,
          timezone,
          summary: describeBillingSchedule(schedule),
          message: `Tell them: ${describeBillingSchedule(schedule)} Timezone: ${timezone}.`,
        };
      }

      case "set_billing_schedule": {
        const { data: profile } = await db
          .from("profiles")
          .select("notification_prefs, timezone")
          .eq("id", userId)
          .maybeSingle();
        const current = billingScheduleFromPrefs(profile?.notification_prefs);
        const timezone = resolveDigestTimezone(profile?.timezone);

        const next: AssistantBillingSchedule = { ...current };
        if (args.enabled !== undefined) next.enabled = Boolean(args.enabled);

        if (args.cadence !== undefined) {
          const cadenceRaw = String(args.cadence).trim().toLowerCase();
          if (!isBillingCadence(cadenceRaw)) {
            return {
              error:
                "cadence must be weekly, biweekly, monthly_first, or monthly_last.",
            };
          }
          next.cadence = cadenceRaw as BillingCadence;
        }

        if (args.weekday !== undefined) {
          const raw = String(args.weekday).trim().toLowerCase();
          const map: Record<string, BillingWeekday> = {
            mon: "Mon",
            monday: "Mon",
            tue: "Tue",
            tuesday: "Tue",
            wed: "Wed",
            wednesday: "Wed",
            thu: "Thu",
            thursday: "Thu",
            fri: "Fri",
            friday: "Fri",
            sat: "Sat",
            saturday: "Sat",
            sun: "Sun",
            sunday: "Sun",
          };
          const normalized = map[raw] || null;
          if (!normalized) {
            return {
              error: "weekday must be Mon–Sun (e.g. Friday).",
            };
          }
          next.weekday = normalized;
        }

        if (args.hour !== undefined) {
          next.hour = Math.min(23, Math.max(0, Math.round(Number(args.hour))));
        }

        if (
          next.cadence === "weekly" ||
          next.cadence === "biweekly"
        ) {
          if (!next.weekday) {
            return { error: "weekday is required for weekly/biweekly." };
          }
        }

        if (next.cadence === "biweekly") {
          next.biweekly_anchor_ymd =
            next.biweekly_anchor_ymd || defaultBiweeklyAnchor(timezone);
        } else {
          next.biweekly_anchor_ymd = null;
        }

        // Normalize through parser
        const schedule = parseBillingSchedule(next);
        const prefs = mergeBillingScheduleIntoPrefs(
          profile?.notification_prefs,
          schedule
        );

        const { error } = await db
          .from("profiles")
          .update({ notification_prefs: prefs as Json })
          .eq("id", userId);

        if (error) return { error: error.message };

        return {
          ok: true,
          schedule,
          timezone,
          summary: describeBillingSchedule(schedule),
          message: `Confirm the new schedule briefly: ${describeBillingSchedule(schedule)} (${timezone}).`,
        };
      }

      case "get_client": {
        const clientId = String(args.client_id || "").trim();
        if (!clientId) return { error: "client_id is required." };
        const card = await loadClientCard(db, organizationId, clientId);
        if (!card) return { error: "Client not found." };
        return {
          ok: true,
          client: { id: card.entityId, ...card.snapshot },
        };
      }

      case "get_lead": {
        const leadId = String(args.lead_id || "").trim();
        if (!leadId) return { error: "lead_id is required." };
        const card = await loadLeadCard(db, organizationId, leadId);
        if (!card) return { error: "Lead not found." };
        return {
          ok: true,
          lead: { id: card.entityId, ...card.snapshot },
        };
      }

      case "convert_lead_to_client": {
        const leadId = String(args.lead_id || "").trim();
        if (!leadId) return { error: "lead_id is required." };
        const statusRaw = String(args.status || "prospect").toLowerCase();
        const status = statusRaw === "active" ? "active" : "prospect";
        try {
          const converted = await convertLeadToClient(db, {
            leadId,
            organizationId,
            userId,
            status,
          });
          const leadCard = await loadLeadCard(db, organizationId, leadId);
          const clientCard = converted.clientId
            ? await loadClientCard(db, organizationId, converted.clientId)
            : null;
          return {
            ok: true,
            converted: true,
            client_id: converted.clientId,
            lead: leadCard
              ? { id: leadCard.entityId, ...leadCard.snapshot }
              : { id: leadId, status: "converted" },
            client: clientCard
              ? { id: clientCard.entityId, ...clientCard.snapshot }
              : null,
          };
        } catch (err) {
          return {
            error:
              err instanceof Error ? err.message : "Could not convert lead.",
          };
        }
      }

      case "get_project": {
        const projectId = String(args.project_id || "").trim();
        if (!projectId) return { error: "project_id is required." };
        const card = await loadProjectCard(db, organizationId, projectId);
        if (!card) return { error: "Project not found." };
        return {
          ok: true,
          project: {
            id: card.entityId,
            name: card.snapshot?.name,
            client: card.snapshot?.client,
            status: card.snapshot?.status,
            billing_type: card.snapshot?.billingType,
            tasks_done: card.snapshot?.tasksDone,
            tasks_open: card.snapshot?.tasksOpen,
            tracked_hours: card.snapshot?.trackedHours,
          },
        };
      }

      case "get_task": {
        const taskId = String(args.task_id || "").trim();
        if (!taskId) return { error: "task_id is required." };
        const card = await loadTaskCard(db, organizationId, taskId);
        if (!card) return { error: "Task not found." };
        return {
          ok: true,
          task: {
            id: card.entityId,
            title: card.snapshot?.title,
            column: card.snapshot?.status,
            priority: card.snapshot?.priority,
            due_date: card.snapshot?.dueDate,
            client: card.snapshot?.client,
            project: card.snapshot?.project,
          },
        };
      }

      case "update_task": {
        const taskId = String(args.task_id || "").trim();
        if (!taskId) return { error: "task_id is required." };

        const { data: taskRow } = await db
          .from("tasks")
          .select("id")
          .eq("id", taskId)
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!taskRow) return { error: "Task not found." };

        const updates: Database["public"]["Tables"]["tasks"]["Update"] = {};
        if (typeof args.title === "string" && args.title.trim()) {
          updates.title = args.title.trim();
        }
        if (args.column !== undefined) {
          updates.column_id = normalizeTaskColumn(args.column);
        }
        if (args.priority !== undefined) {
          updates.priority = normalizeTaskPriority(args.priority);
        }
        if (args.due_date !== undefined) {
          const dueRaw = String(args.due_date || "").trim();
          updates.due_date = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : null;
        }
        if (!Object.keys(updates).length) {
          return { error: "Provide title, column, priority, and/or due_date." };
        }

        const { error: updateError } = await db
          .from("tasks")
          .update(updates)
          .eq("id", taskId)
          .eq("organization_id", organizationId);
        if (updateError) return { error: updateError.message };

        const card = await loadTaskCard(db, organizationId, taskId);
        if (!card) return { error: "Task updated but could not reload." };
        return {
          ok: true,
          task: {
            id: card.entityId,
            title: card.snapshot?.title,
            column: card.snapshot?.status,
            priority: card.snapshot?.priority,
            due_date: card.snapshot?.dueDate,
            client: card.snapshot?.client,
            project: card.snapshot?.project,
          },
        };
      }

      case "get_proposal": {
        const pendingId =
          ctx.pendingAction?.type === "send_proposal"
            ? ctx.pendingAction.proposal_id
            : null;
        const proposalId =
          (args.proposal_id ? String(args.proposal_id) : null) || pendingId;
        if (!proposalId) {
          return {
            error:
              "No proposal id. Pass proposal_id or create/select a draft first.",
          };
        }
        const card = await loadProposalCard(db, organizationId, proposalId);
        if (!card) return { error: "Proposal not found." };
        return {
          ok: true,
          proposal: {
            id: card.entityId,
            title: card.snapshot?.title,
            client: card.snapshot?.client,
            amount: card.snapshot?.amount,
            amount_raw: card.snapshot?.amountRaw,
            currency: card.snapshot?.currency,
            status: card.snapshot?.status,
            expires_at: card.snapshot?.expiresAt,
          },
        };
      }

      case "get_invoice": {
        const pendingId =
          ctx.pendingAction?.type === "send_invoice"
            ? ctx.pendingAction.invoice_id
            : null;
        const invoiceId =
          (args.invoice_id ? String(args.invoice_id) : null) || pendingId;
        if (!invoiceId) {
          return {
            error:
              "No invoice id. Pass invoice_id or create/select a draft first.",
          };
        }
        return loadInvoiceSummary(db, organizationId, invoiceId);
      }

      case "update_invoice_draft": {
        const pendingId =
          ctx.pendingAction?.type === "send_invoice"
            ? ctx.pendingAction.invoice_id
            : null;
        const invoiceId =
          (args.invoice_id ? String(args.invoice_id) : null) || pendingId;
        if (!invoiceId) {
          return {
            error:
              "No invoice to update. Pass invoice_id or use the pending draft.",
          };
        }

        const updated = await updateDraftInvoice(db, organizationId, invoiceId, {
          amount:
            args.amount !== undefined ? Number(args.amount) : undefined,
          description:
            typeof args.description === "string"
              ? args.description
              : undefined,
          dueDate:
            typeof args.due_date === "string" ? args.due_date : undefined,
          dueInDays:
            args.due_in_days !== undefined
              ? Number(args.due_in_days)
              : undefined,
        });
        if ("error" in updated) return updated;

        await ctx.setPendingAction({
          type: "send_invoice",
          invoice_id: invoiceId,
        });
        return { ok: true, invoice: updated.invoice, ask_to_send: true };
      }

      case "update_invoice_status": {
        const statusRaw = String(args.status || "").toLowerCase();
        if (statusRaw !== "paid" && statusRaw !== "void") {
          return { error: "status must be paid or void." };
        }
        const nextStatus = statusRaw as "paid" | "void";

        const pendingId =
          ctx.pendingAction?.type === "send_invoice"
            ? ctx.pendingAction.invoice_id
            : null;
        const resolved = await resolveInvoiceForStatusUpdate(
          db,
          organizationId,
          {
            invoice_id: args.invoice_id || pendingId,
            client_id: args.client_id,
            client_query: args.client_query,
            which: args.which,
            status: nextStatus,
          }
        );
        if (!resolved.ok) {
          return {
            error: resolved.error,
            matches: resolved.matches,
          };
        }

        const { data: current, error: loadError } = await db
          .from("invoices")
          .select("id, status, number")
          .eq("id", resolved.invoiceId)
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .maybeSingle();
        if (loadError || !current) {
          return { error: loadError?.message || "Invoice not found." };
        }

        if (current.status === nextStatus) {
          const summary = await loadInvoiceSummary(
            db,
            organizationId,
            resolved.invoiceId
          );
          if ("error" in summary) return summary;
          return {
            ok: true,
            already_status: true,
            invoice: summary.invoice,
            message: `Invoice is already ${nextStatus}.`,
          };
        }

        if (current.status === "void") {
          return { error: "This invoice is voided and cannot be updated." };
        }
        if (nextStatus === "paid" && current.status === "paid") {
          return { error: "This invoice is already paid." };
        }
        if (nextStatus === "void" && current.status === "paid") {
          return {
            error:
              "Paid invoices cannot be voided. Leave it paid or adjust in the dashboard.",
          };
        }

        const now = new Date().toISOString();
        const updates: Database["public"]["Tables"]["invoices"]["Update"] = {
          status: nextStatus,
          updated_at: now,
        };
        if (nextStatus === "paid") {
          updates.paid_at = now;
        }

        const { error: updateError } = await db
          .from("invoices")
          .update(updates)
          .eq("id", resolved.invoiceId)
          .eq("organization_id", organizationId);
        if (updateError) return { error: updateError.message };

        try {
          await db.rpc("cancel_invoice_reminders", {
            p_invoice_id: resolved.invoiceId,
          });
        } catch {
          // non-fatal
        }

        if (nextStatus === "void") {
          try {
            await unlockTimeEntriesForInvoice(db, {
              organizationId,
              invoiceId: resolved.invoiceId,
            });
          } catch {
            // non-fatal
          }
        }

        await db.from("invoice_events").insert({
          organization_id: organizationId,
          invoice_id: resolved.invoiceId,
          event_type: nextStatus === "paid" ? "paid" : "voided",
          actor_type: "freelancer",
          metadata: { source: "assistant" },
        });

        if (
          ctx.pendingAction?.type === "send_invoice" &&
          ctx.pendingAction.invoice_id === resolved.invoiceId
        ) {
          await ctx.setPendingAction(null);
        }

        const summary = await loadInvoiceSummary(
          db,
          organizationId,
          resolved.invoiceId
        );
        if ("error" in summary) return summary;
        return {
          ok: true,
          updated: true,
          status: nextStatus,
          invoice: summary.invoice,
          message:
            nextStatus === "paid"
              ? "Invoice marked as paid. Confirm briefly to the user."
              : "Invoice voided. Confirm briefly to the user.",
        };
      }

      case "send_invoice": {
        if (args.confirmed !== true) {
          return {
            error:
              "Sending requires confirmed=true after the user explicitly agrees to send or resend.",
          };
        }

        const pendingId =
          ctx.pendingAction?.type === "send_invoice"
            ? ctx.pendingAction.invoice_id
            : ctx.pendingAction?.type === "send_invoices" &&
                ctx.pendingAction.invoices.length === 1
              ? ctx.pendingAction.invoices[0].invoice_id
              : null;

        const resolved = await resolveInvoiceForSend(db, organizationId, {
          invoice_id: args.invoice_id,
          client_id: args.client_id,
          client_query: args.client_query,
          which: args.which,
          pendingId,
        });
        if (!resolved.ok) {
          return {
            error: resolved.error,
            ...(resolved.matches ? { matches: resolved.matches } : {}),
          };
        }
        const invoiceId = resolved.invoiceId;

        const result = await sendInvoiceForOrganization({
          db,
          invoiceId,
          organizationId,
          userId,
        });

        if (!result.ok) return { error: result.error };

        if (ctx.pendingAction?.type === "send_invoices") {
          const remaining = ctx.pendingAction.invoices.filter(
            (inv) => inv.invoice_id !== invoiceId
          );
          if (remaining.length === 0) {
            await ctx.setPendingAction(null);
          } else if (remaining.length === 1) {
            await ctx.setPendingAction({
              type: "send_invoice",
              invoice_id: remaining[0].invoice_id,
            });
          } else {
            await ctx.setPendingAction({
              type: "send_invoices",
              invoices: remaining,
            });
          }
        } else {
          await ctx.setPendingAction(null);
        }

        return {
          ok: true,
          sent: true,
          invoice_id: invoiceId,
          number: result.number,
          recipient_email: result.recipientEmail,
          url: result.url,
          status: result.status,
          message:
            "Invoice emailed. Confirm warmly in one short line with a real Unicode emoji, e.g. I've sent the invoice again 🙂 — optionally mention the invoice number and recipient email. Never use the text emoticon :).",
        };
      }

      case "send_invoices": {
        if (args.confirmed !== true) {
          return {
            error:
              "Sending requires confirmed=true after the user explicitly agrees.",
          };
        }

        const pendingList =
          ctx.pendingAction?.type === "send_invoices"
            ? ctx.pendingAction.invoices
            : ctx.pendingAction?.type === "send_invoice"
              ? [
                  {
                    invoice_id: ctx.pendingAction.invoice_id,
                    client: null,
                  },
                ]
              : [];

        const invoiceIds = Array.isArray(args.invoice_ids)
          ? args.invoice_ids.map(String)
          : [];
        const includeQueries = Array.isArray(args.include_client_queries)
          ? args.include_client_queries.map(String)
          : [];
        const excludeQueries = Array.isArray(args.exclude_client_queries)
          ? args.exclude_client_queries.map(String)
          : [];
        const allPending = Boolean(args.all_pending);

        let toSend: PendingSendInvoice[] = [];
        if (invoiceIds.length) {
          const idSet = new Set(invoiceIds);
          toSend = (pendingList.length ? pendingList : invoiceIds.map((id) => ({
            invoice_id: id,
            client: null,
          }))).filter((inv) => idSet.has(inv.invoice_id));
          if (!pendingList.length) {
            toSend = invoiceIds.map((id) => ({ invoice_id: id, client: null }));
          }
        } else if (pendingList.length) {
          if (includeQueries.length) {
            toSend = selectPendingSendInvoices(pendingList, {
              includeQueries,
              excludeQueries,
            });
          } else if (allPending || excludeQueries.length) {
            toSend = selectPendingSendInvoices(pendingList, {
              excludeQueries,
            });
          } else {
            return {
              error:
                "Pass all_pending=true, invoice_ids, or include_client_queries for which drafts to send.",
            };
          }
        } else {
          return {
            error:
              "No pending invoices to send. Create drafts first, then confirm.",
          };
        }

        if (!toSend.length) {
          return { error: "No matching draft invoices to send." };
        }

        const sent: Array<Record<string, unknown>> = [];
        const errors: string[] = [];

        for (const item of toSend.slice(0, 10)) {
          const result = await sendInvoiceForOrganization({
            db,
            invoiceId: item.invoice_id,
            organizationId,
            userId,
          });
          if (!result.ok) {
            errors.push(
              `${item.client || item.invoice_id}: ${result.error}`
            );
            continue;
          }
          sent.push({
            invoice_id: item.invoice_id,
            client: item.client,
            number: result.number,
            recipient_email: result.recipientEmail,
            status: result.status,
          });
        }

        const sentIds = new Set(sent.map((s) => String(s.invoice_id)));
        if (pendingList.length) {
          const remaining = pendingList.filter(
            (inv) => !sentIds.has(inv.invoice_id)
          );
          if (remaining.length === 0) {
            await ctx.setPendingAction(null);
          } else if (remaining.length === 1) {
            await ctx.setPendingAction({
              type: "send_invoice",
              invoice_id: remaining[0].invoice_id,
            });
          } else {
            await ctx.setPendingAction({
              type: "send_invoices",
              invoices: remaining,
            });
          }
        } else {
          await ctx.setPendingAction(null);
        }

        if (!sent.length) {
          return {
            error: errors.join(" ") || "Could not send any invoices.",
          };
        }

        return {
          ok: true,
          sent_count: sent.length,
          sent,
          errors: errors.length ? errors : undefined,
          message:
            sent.length === 1
              ? "Invoice sent. Confirm warmly in one short line."
              : `Sent ${sent.length} invoices. Confirm warmly and briefly list who received them.`,
        };
      }

      case "send_proposal": {
        if (args.confirmed !== true) {
          return {
            error:
              "Sending requires confirmed=true after the user explicitly agrees.",
          };
        }

        const pendingId =
          ctx.pendingAction?.type === "send_proposal"
            ? ctx.pendingAction.proposal_id
            : null;
        const proposalId =
          (args.proposal_id ? String(args.proposal_id) : null) || pendingId;

        if (!proposalId) {
          return {
            error:
              "No proposal to send. Create a draft first, or pass proposal_id after confirmation.",
          };
        }

        const result = await sendProposalForOrganization({
          db,
          proposalId,
          organizationId,
          userId,
        });

        if (!result.ok) return { error: result.error };

        await ctx.setPendingAction(null);
        return {
          ok: true,
          sent: true,
          proposal_id: proposalId,
          title: result.title,
          recipient_email: result.recipientEmail,
          url: result.url,
          status: result.status,
        };
      }

      case "clear_pending_action": {
        await ctx.setPendingAction(null);
        return { ok: true, cleared: true };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Tool failed.",
    };
  }
}

export function pendingActionToJson(
  action: AssistantPendingAction | null
): Json | null {
  if (!action) return null;
  return action as unknown as Json;
}

export function parsePendingAction(
  value: Json | null | undefined
): AssistantPendingAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (obj.type === "send_invoice" && typeof obj.invoice_id === "string") {
    return { type: "send_invoice", invoice_id: obj.invoice_id };
  }
  if (obj.type === "send_proposal" && typeof obj.proposal_id === "string") {
    return { type: "send_proposal", proposal_id: obj.proposal_id };
  }
  if (obj.type === "propose_unbilled_invoices" && Array.isArray(obj.clients)) {
    const clients: PendingUnbilledClient[] = [];
    for (const row of obj.clients) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      if (typeof rec.client_id !== "string" || typeof rec.label !== "string") {
        continue;
      }
      clients.push({ client_id: rec.client_id, label: rec.label });
    }
    if (!clients.length) return null;
    return { type: "propose_unbilled_invoices", clients };
  }
  if (obj.type === "send_invoices" && Array.isArray(obj.invoices)) {
    const invoices: PendingSendInvoice[] = [];
    for (const row of obj.invoices) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      if (typeof rec.invoice_id !== "string") continue;
      invoices.push({
        invoice_id: rec.invoice_id,
        client: typeof rec.client === "string" ? rec.client : null,
      });
    }
    if (!invoices.length) return null;
    return { type: "send_invoices", invoices };
  }
  if (
    obj.type === "propose_convert_proposal" &&
    typeof obj.proposal_id === "string"
  ) {
    const kindRaw = String(obj.suggest_invoice_kind || "none");
    const suggest_invoice_kind =
      kindRaw === "deposit" ||
      kindRaw === "retainer" ||
      kindRaw === "full" ||
      kindRaw === "none"
        ? kindRaw
        : "none";
    return {
      type: "propose_convert_proposal",
      proposal_id: obj.proposal_id,
      title: typeof obj.title === "string" ? obj.title : "",
      client_label:
        typeof obj.client_label === "string" ? obj.client_label : "",
      suggest_invoice_kind,
      deposit_amount:
        obj.deposit_amount === null || obj.deposit_amount === undefined
          ? null
          : Number(obj.deposit_amount),
    };
  }
  return null;
}
