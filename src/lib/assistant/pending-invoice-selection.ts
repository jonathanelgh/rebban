export type PendingUnbilledClient = {
  client_id: string;
  label: string;
};

export type PendingSendInvoice = {
  invoice_id: string;
  client?: string | null;
};

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True if query loosely matches a client label (substring either way). */
export function labelMatchesQuery(label: string, query: string): boolean {
  const l = normalize(label);
  const q = normalize(query);
  if (!l || !q) return false;
  return l.includes(q) || q.includes(l);
}

/**
 * Filter a proposed client list by include/exclude name queries.
 * - include empty → start from all, then apply excludes
 * - include non-empty → only matches, then apply excludes
 */
export function selectPendingClients(
  clients: PendingUnbilledClient[],
  options?: {
    includeQueries?: string[];
    excludeQueries?: string[];
    includeIds?: string[];
  }
): PendingUnbilledClient[] {
  const includeQueries = (options?.includeQueries || [])
    .map((q) => q.trim())
    .filter(Boolean);
  const excludeQueries = (options?.excludeQueries || [])
    .map((q) => q.trim())
    .filter(Boolean);
  const includeIds = new Set(
    (options?.includeIds || []).map((id) => id.trim()).filter(Boolean)
  );

  let selected = clients;

  if (includeIds.size > 0) {
    selected = selected.filter((c) => includeIds.has(c.client_id));
  } else if (includeQueries.length > 0) {
    selected = selected.filter((c) =>
      includeQueries.some((q) => labelMatchesQuery(c.label, q))
    );
  }

  if (excludeQueries.length > 0) {
    selected = selected.filter(
      (c) => !excludeQueries.some((q) => labelMatchesQuery(c.label, q))
    );
  }

  return selected;
}

export function selectPendingSendInvoices(
  invoices: PendingSendInvoice[],
  options?: {
    includeQueries?: string[];
    excludeQueries?: string[];
    includeIds?: string[];
  }
): PendingSendInvoice[] {
  const asClients: PendingUnbilledClient[] = invoices.map((inv) => ({
    client_id: inv.invoice_id,
    label: inv.client || inv.invoice_id,
  }));
  const picked = selectPendingClients(asClients, {
    includeQueries: options?.includeQueries,
    excludeQueries: options?.excludeQueries,
    includeIds: options?.includeIds,
  });
  const ids = new Set(picked.map((p) => p.client_id));
  return invoices.filter((inv) => ids.has(inv.invoice_id));
}
