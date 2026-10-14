import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { DEFAULT_HOURLY_RATE, formatDurationMinutes } from "@/lib/time-entries";
import { lineAmount } from "@/lib/invoices/totals";

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

/** Attach selected time entries to an invoice as line items and lock them. */
export async function addTimeEntriesToInvoice(
  supabase: Client,
  options: {
    organizationId: string;
    invoiceId: string;
    entries: UnbilledTimeEntry[];
    startPosition: number;
  }
) {
  const created: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    timeEntryId: string;
  }> = [];

  for (let i = 0; i < options.entries.length; i += 1) {
    const entry = options.entries[i];
    const description = entryLineDescription(entry);
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

    const { data: locked, error: lockError } = await supabase
      .from("time_entries")
      .update({ invoice_id: options.invoiceId })
      .eq("id", entry.id)
      .eq("organization_id", options.organizationId)
      .is("invoice_id", null)
      .select("id")
      .maybeSingle();

    if (lockError || !locked) {
      // Roll back the line if lock fails (already invoiced elsewhere)
      await supabase.from("invoice_line_items").delete().eq("id", line.id);
      throw new Error(lockError?.message || "Time entry was already invoiced");
    }

    created.push({
      id: line.id,
      description,
      quantity,
      unitPrice,
      amount,
      timeEntryId: entry.id,
    });
  }

  return created;
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

export async function unlockTimeEntriesForLineIds(
  supabase: Client,
  options: { organizationId: string; lineIds: string[] }
) {
  if (options.lineIds.length === 0) return;
  const { data } = await supabase
    .from("invoice_line_items")
    .select("time_entry_id")
    .eq("organization_id", options.organizationId)
    .in("id", options.lineIds);

  const timeEntryIds = (data || [])
    .map((row) => row.time_entry_id)
    .filter((id): id is string => Boolean(id));

  await unlockTimeEntriesByIds(supabase, {
    organizationId: options.organizationId,
    timeEntryIds,
  });
}
