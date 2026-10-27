import type { AttentionItem } from "./needs-attention-format.ts";
import type { PendingUnbilledClient } from "./pending-invoice-selection.ts";

export type UnbilledDigestClient = PendingUnbilledClient & {
  hours?: string;
  amount?: string;
};

function firstName(full?: string | null) {
  const value = (full || "").trim();
  if (!value || value.includes("@")) return null;
  return value.split(/\s+/)[0] || null;
}

function joinNatural(parts: string[]) {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function unbilledPhrase(client: UnbilledDigestClient) {
  const bits = [client.hours, client.amount].filter(Boolean);
  if (!bits.length) return client.label;
  return `${client.label} (~${bits.join(", ")})`;
}

export function formatBillingDigest(options: {
  unbilled: UnbilledDigestClient[];
  attention?: AttentionItem[];
  appUrl?: string;
  userName?: string | null;
}): string {
  const { unbilled, attention = [], appUrl, userName } = options;
  const name = firstName(userName);
  const hi = name ? `Hey ${name}` : "Hey";
  const extras = attention
    .filter((a) => a.kind !== "unbilled_hours")
    .slice(0, 4);
  const payments = extras.filter(
    (a) => a.kind === "overdue_invoice" || a.kind === "unpaid_invoice"
  );
  const other = extras.filter(
    (a) => a.kind !== "overdue_invoice" && a.kind !== "unpaid_invoice"
  );

  const parts: string[] = [`${hi} — quick invoicing check-in.`];

  if (unbilled.length === 1) {
    const c = unbilled[0];
    const bits = [c.hours, c.amount].filter(Boolean).join(", ");
    parts.push(
      bits
        ? `${c.label} has about ${bits} ready to bill.`
        : `${c.label} has unbilled time ready to invoice.`
    );
  } else if (unbilled.length > 1) {
    const listed = unbilled.slice(0, 5).map(unbilledPhrase);
    const more =
      unbilled.length > 5 ? `, plus ${unbilled.length - 5} more` : "";
    parts.push(`You've got unbilled time for ${joinNatural(listed)}${more}.`);
  } else {
    parts.push("No unbilled hours sitting around right now.");
  }

  if (payments.length) {
    parts.push("", "On payments:");
    for (const item of payments) {
      const who = item.client ? ` (${item.client})` : "";
      parts.push(`• ${item.title}${who}: ${item.detail}`);
    }
    if (payments.some((p) => (p.detail || "").includes("reminder sent"))) {
      parts.push(
        "If we already reminded them recently, you're covered — no need to chase again unless you want to."
      );
    }
  }

  if (other.length) {
    parts.push("", "Also on the radar:");
    for (const item of other) {
      const who = item.client ? ` (${item.client})` : "";
      parts.push(`• ${item.title}${who} — ${item.detail}`);
    }
  }

  if (unbilled.length === 1) {
    parts.push(
      "",
      `Want me to draft an invoice for ${unbilled[0].label}? Reply yes, or wait if not now.`
    );
  } else if (unbilled.length > 1) {
    parts.push(
      "",
      'Want me to draft any of these? Reply e.g. "all", "Acme and Beta", or "skip Northwind" — or wait if not now.'
    );
  } else if (payments.length || other.length) {
    parts.push("", "Reply if you want help with any of this.");
  }

  if (appUrl) {
    parts.push("", `Dashboard: ${appUrl}`);
  }

  return parts.join("\n");
}
