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

type Db = SupabaseClient<Database>;

export type AssistantPendingAction = {
  type: "send_invoice";
  invoice_id: string;
};

export type AssistantToolContext = {
  db: Db;
  userId: string;
  organizationId: string;
  conversationId: string;
  pendingAction: AssistantPendingAction | null;
  setPendingAction: (action: AssistantPendingAction | null) => Promise<void>;
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
      description: "Add a new active client to the workspace.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          company: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
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
      name: "clear_pending_action",
      description: "Cancel a pending send confirmation when the user says no.",
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

async function searchClients(db: Db, organizationId: string, query: string) {
  const q = sanitizeIlike(query);
  if (!q) return [];
  const { data } = await db
    .from("clients")
    .select("id, name, company, email, phone, status")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .or(ilikeOrFilter(q))
    .limit(8);
  return data || [];
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
  const matches = await searchClients(db, organizationId, query);
  if (!matches.length) {
    return {
      ok: false,
      error: `No client found for "${query}". Add them as a client first, or check the spelling.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: "Multiple clients matched. Ask the user which one.",
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
            source: "whatsapp",
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
        const { data, error } = await db
          .from("clients")
          .insert({
            organization_id: organizationId,
            name: clientName,
            company: args.company ? String(args.company).trim() : null,
            email: args.email ? String(args.email).trim().toLowerCase() : null,
            phone: args.phone ? String(args.phone).trim() : null,
            notes: args.notes ? String(args.notes).trim() : null,
            status: "active",
            created_by: userId,
          })
          .select("id, name, company, email, status")
          .single();
        if (error) return { error: error.message };
        return { ok: true, client: data };
      }

      case "find_client": {
        const query = String(args.query || "").trim();
        const clients = await searchClients(db, organizationId, query);
        return { ok: true, count: clients.length, clients };
      }

      case "find_lead": {
        const query = String(args.query || "").trim();
        const leads = await searchLeads(db, organizationId, query);
        return { ok: true, count: leads.length, leads };
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
  return null;
}
