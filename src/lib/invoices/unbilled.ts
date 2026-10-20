import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { DEFAULT_HOURLY_RATE, formatDurationMinutes } from "@/lib/time-entries";
import { formatInvoiceMoney, lineAmount } from "@/lib/invoices/totals";

/** Hidden marker so consolidated lines can unlock every linked time entry. */
const LINKED_TIME_MARKER_RE = /\n?<!--rebban-te:([0-9a-f,-]+)-->/i;

export function stripLinkedTimeEntryIds(description: string) {
  return description.replace(LINKED_TIME_MARKER_RE, "").trimEnd();
}

export function parseLinkedTimeEntryIds(description: string): string[] {
  const match = description.match(LINKED_TIME_MARKER_RE);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function embedLinkedTimeEntryIds(
  description: string,
  timeEntryIds: string[]
) {
  const base = stripLinkedTimeEntryIds(description).trim() || "Line item";
  const ids = Array.from(new Set(timeEntryIds.filter(Boolean)));
  if (ids.length === 0) return base;
  return `${base}\n<!--rebban-te:${ids.join(",")}-->`;
}

export function formatTimeSpecification(
  entries: UnbilledTimeEntry[],
  currency: string
) {
  const sorted = [...entries].sort(
    (a, b) =>
      new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  const summary = summarizeUnbilled(sorted);
  const rows = sorted.map((entry) => {
    let dateLabel = entry.startedAt.slice(0, 10);
    try {
      dateLabel = new Date(entry.startedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      /* keep iso date */
    }
    const desc = entryLineDescription(entry);
    const hours = formatDurationMinutes(entry.durationMinutes);
    const amount = formatInvoiceMoney(entry.amount, currency);
    return `${dateLabel} · ${desc} · ${hours} · ${amount}`;
  });
  return [
    "Time specification",
    ...rows,
    `Total · ${summary.totalHours}h · ${formatInvoiceMoney(summary.totalAmount, currency)}`,
  ].join("\n");
}

export function appendTimeSpecification(notes: string, specification: string) {
  const existing = notes.trim();
  const block = specification.trim();
  if (!block) return existing;
  if (!existing) return block;
  if (existing.includes(block)) return existing;
  return `${existing}\n\n${block}`;
}

function consolidatedLineDescription(entries: UnbilledTimeEntry[]) {
  const summary = summarizeUnbilled(entries);
  const projectNames = Array.from(
    new Set(
      entries
        .map((e) => e.projectName?.trim())
        .filter((name): name is string => Boolean(name))
    )
  );
  const hoursLabel =
    summary.totalHours === 1 ? "1 hour" : `${summary.totalHours} hours`;
  if (projectNames.length === 1) {
    return `${projectNames[0]} · ${hoursLabel}`;
  }
  return `Billable time · ${hoursLabel}`;
}

function blendedHourlyRate(entries: UnbilledTimeEntry[]) {
  const summary = summarizeUnbilled(entries);
  if (summary.totalHours <= 0) return DEFAULT_HOURLY_RATE;
  const rates = Array.from(new Set(entries.map((e) => e.hourlyRate)));
  if (rates.length === 1) return rates[0];
  return Math.round((summary.totalAmount / summary.totalHours) * 100) / 100;
}

export type UnbilledTimeEntry = {
  id: string;
  description: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  hourlyRate: number;
  clientId: string | null;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  hours: number;
  amount: number;
};

type Client = SupabaseClient<Database>;

function hoursFromMinutes(minutes: number) {
  return Math.round((Math.max(0, minutes) / 60) * 100) / 100;
}

export function entryHours(durationMinutes: number | null | undefined) {
  return hoursFromMinutes(Number(durationMinutes) || 0);
}

export function entryAmount(hours: number, hourlyRate: number | null | undefined) {
  const rate = Number(hourlyRate);
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_HOURLY_RATE;
  return lineAmount(hours, safeRate);
}

export function entryLineDescription(entry: {
  description: string | null;
  projectName?: string | null;
  startedAt: string;
}) {
  const desc = entry.description?.trim();
  if (desc) return desc;
  if (entry.projectName?.trim()) return entry.projectName.trim();
  try {
    const date = new Date(entry.startedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `Time · ${date}`;
  } catch {
    return "Billable time";
  }
}

export async function fetchUnbilledTimeEntries(
  supabase: Client,
  options: {
    organizationId: string;
    clientId: string;
    projectId?: string | null;
  }
) {
  let query = supabase
    .from("time_entries")
    .select(
      `id, description, started_at, ended_at, duration_minutes, hourly_rate,
       client_id, project_id, task_id, projects(name)`
    )
    .eq("organization_id", options.organizationId)
    .eq("client_id", options.clientId)
    .eq("billable", true)
    .is("deleted_at", null)
    .is("invoice_id", null)
    .gt("duration_minutes", 0)
    .order("started_at", { ascending: false });

  if (options.projectId) {
    query = query.eq("project_id", options.projectId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const projectRel = row.projects as { name: string } | null | undefined;
    const minutes = Number(row.duration_minutes) || 0;
    const hours = entryHours(minutes);
    const rate =
      Number(row.hourly_rate) > 0 ? Number(row.hourly_rate) : DEFAULT_HOURLY_RATE;
    return {
      id: row.id,
      description: row.description,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationMinutes: minutes,
      hourlyRate: rate,
      clientId: row.client_id,
      projectId: row.project_id,
      projectName: projectRel?.name || null,
      taskId: row.task_id,
      hours,
      amount: entryAmount(hours, rate),
    } satisfies UnbilledTimeEntry;
  });
}

export function summarizeUnbilled(entries: UnbilledTimeEntry[]) {
  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const totalHours = entryHours(totalMinutes);
  const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
  return {
    count: entries.length,
    totalMinutes,
    totalHours,
    totalAmount,
    label: formatDurationMinutes(totalMinutes),
  };
}

async function lockTimeEntry(
  supabase: Client,
  options: {
    organizationId: string;
    invoiceId: string;
    entryId: string;
    rollbackLineId?: string;
  }
) {
  const { data: locked, error: lockError } = await supabase
    .from("time_entries")
    .update({ invoice_id: options.invoiceId })
    .eq("id", options.entryId)
    .eq("organization_id", options.organizationId)
    .is("invoice_id", null)
    .select("id")
    .maybeSingle();

  if (lockError || !locked) {
    if (options.rollbackLineId) {
      await supabase
        .from("invoice_line_items")
        .delete()
        .eq("id", options.rollbackLineId);
    }
    throw new Error(lockError?.message || "Time entry was already invoiced");
  }
}

/** Attach selected time entries to an invoice as line items and lock them. */
export async function addTimeEntriesToInvoice(
  supabase: Client,
  options: {
    organizationId: string;
    invoiceId: string;
    entries: UnbilledTimeEntry[];
    startPosition: number;
    /** One summary line; pair with notes specification. */
    consolidate?: boolean;
    currency?: string;
  }
) {
  const created: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    timeEntryId: string | null;
    linkedTimeEntryIds: string[];
  }> = [];

  if (options.entries.length === 0) {
    return { created, specification: null as string | null };
  }

  if (options.consolidate) {
    const summary = summarizeUnbilled(options.entries);
    const linkedIds = options.entries.map((e) => e.id);
    const displayDescription = consolidatedLineDescription(options.entries);
    const description = embedLinkedTimeEntryIds(
      displayDescription,
      linkedIds
    );
    const quantity = summary.totalHours;
    const unitPrice = blendedHourlyRate(options.entries);
    const amount = summary.totalAmount;

    const { data: line, error: lineError } = await supabase
      .from("invoice_line_items")
      .insert({
        organization_id: options.organizationId,
        invoice_id: options.invoiceId,
        description,
        quantity,
        unit: "hr",
        unit_price: unitPrice,
        amount,
        position: options.startPosition,
        time_entry_id: linkedIds[0] || null,
      })
      .select("id")
      .single();

    if (lineError || !line) {
      throw new Error(lineError?.message || "Could not add time entry line");
    }

    const lockedIds: string[] = [];
    try {
      for (const entry of options.entries) {
        await lockTimeEntry(supabase, {
          organizationId: options.organizationId,
          invoiceId: options.invoiceId,
          entryId: entry.id,
        });
        lockedIds.push(entry.id);
      }
    } catch (err) {
      await unlockTimeEntriesByIds(supabase, {
        organizationId: options.organizationId,
        timeEntryIds: lockedIds,
      });
      await supabase.from("invoice_line_items").delete().eq("id", line.id);
      throw err;
    }

    created.push({
      id: line.id,
      description: displayDescription,
      quantity,
      unitPrice,
      amount,
      timeEntryId: linkedIds[0] || null,
      linkedTimeEntryIds: linkedIds,
    });

    return {
      created,
      specification: formatTimeSpecification(
        options.entries,
        options.currency || "USD"
      ),
    };
  }

  for (let i = 0; i < options.entries.length; i += 1) {
    const entry = options.entries[i];
    const displayDescription = entryLineDescription(entry);
    const description = embedLinkedTimeEntryIds(displayDescription, [
      entry.id,
    ]);
    const quantity = entry.hours;
    const unitPrice = entry.hourlyRate;
    const amount = entry.amount;

    const { data: line, error: lineError } = await supabase
      .from("invoice_line_items")
      .insert({
        organization_id: options.organizationId,
        invoice_id: options.invoiceId,
        description,
        quantity,
        unit: "hr",
        unit_price: unitPrice,
        amount,
        position: options.startPosition + i,
        time_entry_id: entry.id,
      })
      .select("id")
      .single();

    if (lineError || !line) {
      throw new Error(lineError?.message || "Could not add time entry line");
    }

    await lockTimeEntry(supabase, {
      organizationId: options.organizationId,
      invoiceId: options.invoiceId,
      entryId: entry.id,
      rollbackLineId: line.id,
    });

    created.push({
      id: line.id,
      description: displayDescription,
      quantity,
      unitPrice,
      amount,
      timeEntryId: entry.id,
      linkedTimeEntryIds: [entry.id],
    });
  }

  return { created, specification: null as string | null };
}

export async function unlockTimeEntriesByIds(
  supabase: Client,
  options: { organizationId: string; timeEntryIds: string[] }
) {
  const ids = options.timeEntryIds.filter(Boolean);
  if (ids.length === 0) return;
  await supabase
    .from("time_entries")
    .update({ invoice_id: null })
    .eq("organization_id", options.organizationId)
    .in("id", ids);
}

export async function unlockTimeEntriesForInvoice(
  supabase: Client,
  options: { organizationId: string; invoiceId: string }
) {
  await supabase
    .from("time_entries")
    .update({ invoice_id: null })
    .eq("organization_id", options.organizationId)
    .eq("invoice_id", options.invoiceId);

  // Free unique(time_entry_id) so hours can be re-invoiced after void/delete
  await supabase
    .from("invoice_line_items")
    .update({ time_entry_id: null })
    .eq("organization_id", options.organizationId)
    .eq("invoice_id", options.invoiceId)
    .not("time_entry_id", "is", null);
}

export function collectLinkedTimeEntryIds(rows: {
  time_entry_id?: string | null;
  description?: string | null;
}[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.time_entry_id) ids.add(row.time_entry_id);
    for (const id of parseLinkedTimeEntryIds(row.description || "")) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

export async function unlockTimeEntriesForLineIds(
  supabase: Client,
  options: { organizationId: string; lineIds: string[] }
) {
  if (options.lineIds.length === 0) return;
  const { data } = await supabase
    .from("invoice_line_items")
    .select("time_entry_id, description")
    .eq("organization_id", options.organizationId)
    .in("id", options.lineIds);

  await unlockTimeEntriesByIds(supabase, {
    organizationId: options.organizationId,
    timeEntryIds: collectLinkedTimeEntryIds(data || []),
  });
}
