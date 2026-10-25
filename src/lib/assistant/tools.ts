import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import {
  computeInvoiceTotals,
  formatInvoiceMoney,
  lineAmount,
} from "@/lib/invoices/totals";
import { sendInvoiceForOrganization } from "@/lib/invoices/send-invoice";
import {
  addTimeEntriesToInvoice,
  appendTimeSpecification,
  fetchUnbilledTimeEntries,
  summarizeUnbilled,
} from "@/lib/invoices/unbilled";
import { DEFAULT_HOURLY_RATE, formatDurationMinutes } from "@/lib/time-entries";
import { toProposalContentJson } from "@/lib/proposals/content";
import {
  generateProposalFromBrief,
  isProposalAiConfigured,
} from "@/lib/proposals/generate";
import { sendProposalForOrganization } from "@/lib/proposals/send-proposal";

type Db = SupabaseClient<Database>;

export type AssistantPendingAction =
  | { type: "send_invoice"; invoice_id: string }
  | { type: "send_proposal"; proposal_id: string };

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
        "List unbilled billable time (hours not yet on an invoice), grouped by client. Use before creating an invoice from worked hours.",
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
        "Create a draft invoice from all unbilled billable hours for a client. Locks those time entries to the invoice. Sets pending send confirmation.",
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
      name: "send_invoice",
      description:
        "Send a draft invoice by email. ONLY call after the user explicitly confirmed sending (yes / send it). Prefer the pending invoice from create_invoice_draft / create_invoice_from_unbilled, or a draft id from list_draft_invoices.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: {
            type: "string",
            description: "Invoice id; omit to use pending confirmed invoice",
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
        "Cancel a pending send confirmation (invoice or proposal) when the user says no.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

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
            return {
              ok: true,
              already_existed: true,
              client: existing,
              message:
                "Client with this email already exists. Use this client_id — do not create another.",
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

        return {
          ok: true,
          count: clients.length,
          currency,
          clients,
          total_hours: formatDurationMinutes(Math.round(totalMinutes)),
          total_amount: formatInvoiceMoney(totalAmount, currency),
          message:
            clients.length === 0
              ? "No unbilled hours."
              : "Offer to create a draft invoice from unbilled hours for a client.",
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

        const entries = await fetchUnbilledTimeEntries(db, {
          organizationId,
          clientId,
        });
        if (!entries.length) {
          return {
            error: `No unbilled hours for ${clientLabel}.`,
          };
        }

        const summary = summarizeUnbilled(entries);
        const consolidate = args.consolidate !== false;

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
        const dueInDays = Math.max(
          0,
          Math.round(Number(args.due_in_days) || 14)
        );
        const issueDate = todayISO();
        const dueDate = addDaysISO(issueDate, dueInDays);

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
          return { error: invoiceError?.message || "Could not create invoice." };
        }

        try {
          const { created, specification } = await addTimeEntriesToInvoice(db, {
            organizationId,
            invoiceId: invoice.id,
            entries,
            startPosition: 0,
            consolidate,
            currency,
          });

          if (!created.length) {
            await db
              .from("invoices")
              .update({ deleted_at: new Date().toISOString() })
              .eq("id", invoice.id)
              .eq("organization_id", organizationId);
            return { error: "Could not attach time entries to the invoice." };
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
              error:
                updateError.message ||
                "Invoice created but totals could not be saved.",
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
            ask_to_send: true,
            message:
              "Draft created from unbilled hours. Ask the user if they want you to send it to the client.",
          };
        } catch (err) {
          await db
            .from("invoices")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", invoice.id)
            .eq("organization_id", organizationId);
          return {
            error:
              err instanceof Error
                ? err.message
                : "Could not create invoice from unbilled hours.",
          };
        }
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

      case "send_invoice": {
        if (args.confirmed !== true) {
          return {
            error:
              "Sending requires confirmed=true after the user explicitly agrees.",
          };
        }

        const pendingId =
          ctx.pendingAction?.type === "send_invoice"
            ? ctx.pendingAction.invoice_id
            : null;
        const invoiceId =
          (args.invoice_id ? String(args.invoice_id) : null) || pendingId;

        if (!invoiceId) {
          return {
            error:
              "No invoice to send. Create a draft first, or pass invoice_id after confirmation.",
          };
        }

        const result = await sendInvoiceForOrganization({
          db,
          invoiceId,
          organizationId,
          userId,
        });

        if (!result.ok) return { error: result.error };

        await ctx.setPendingAction(null);
        return {
          ok: true,
          sent: true,
          number: result.number,
          recipient_email: result.recipientEmail,
          url: result.url,
          status: result.status,
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
  return null;
}
