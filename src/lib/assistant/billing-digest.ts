import type { AttentionItem } from "./needs-attention-format.ts";
import type { PendingUnbilledClient } from "./pending-invoice-selection.ts";

export type UnbilledDigestClient = PendingUnbilledClient & {
  hours?: string;
  amount?: string;
};

export function formatBillingDigest(options: {
  unbilled: UnbilledDigestClient[];
  attention?: AttentionItem[];
  appUrl?: string;
}): string {
  const { unbilled, attention = [], appUrl } = options;
  const lines: string[] = ["Invoicing check-in"];

  if (unbilled.length) {
    lines.push("", "Ready to invoice:");
    unbilled.slice(0, 8).forEach((c, i) => {
      const bits = [c.hours, c.amount].filter(Boolean).join(" · ");
      lines.push(
        `${i + 1}. ${c.label}${bits ? ` — ${bits}` : ""}`
      );
    });
    lines.push(
      "",
      'Reply with who to invoice, e.g. "all", "Acme and Beta", or "skip Northwind". Say wait if not now.'
    );
  } else {
    lines.push("", "No unbilled hours right now.");
  }

  const extras = attention.filter((a) => a.kind !== "unbilled_hours").slice(0, 4);
  if (extras.length) {
    lines.push("", "Also worth a look:");
    extras.forEach((item, i) => {
      const who = item.client ? ` (${item.client})` : "";
      lines.push(`${i + 1}. ${item.title}${who} — ${item.detail}`);
    });
  }

  if (appUrl) {
    lines.push("", `Open Rebban: ${appUrl}`);
  }

  return lines.join("\n");
}
