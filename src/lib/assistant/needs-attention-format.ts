export type AttentionKind =
  | "stale_proposal"
  | "overdue_invoice"
  | "unpaid_invoice"
  | "unbilled_hours"
  | "project_deadline";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  priority: number;
  title: string;
  detail: string;
  suggested_action: string;
  entity_type: string;
  entity_id: string;
  client?: string | null;
  /** ISO timestamp of last automated payment reminder, if any. */
  last_reminder_at?: string | null;
};

function daysBetween(fromIso: string, to = new Date()) {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  return Math.max(
    0,
    Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  );
}

/** Human line for digests: "reminder sent yesterday". */
export function formatLastReminderNote(sentAt: string | null | undefined) {
  if (!sentAt) return "no payment reminder sent yet";
  const days = daysBetween(sentAt);
  if (days === 0) return "reminder sent today";
  if (days === 1) return "reminder sent yesterday";
  return `reminder sent ${days} days ago`;
}

function firstName(full?: string | null) {
  const value = (full || "").trim();
  if (!value || value.includes("@")) return null;
  return value.split(/\s+/)[0] || null;
}

export function formatAttentionDigest(
  items: AttentionItem[],
  options?: { maxItems?: number; appUrl?: string; userName?: string | null }
): string {
  const name = firstName(options?.userName);
  const hi = name ? `Hey ${name}` : "Hey";

  if (!items.length) {
    return `${hi} — you're clear. Nothing urgent needs attention right now.`;
  }

  const max = options?.maxItems ?? 6;
  const shown = items.slice(0, max);
  const lines = shown.map((item) => {
    const who = item.client ? ` (${item.client})` : "";
    return `• ${item.title}${who} — ${item.detail}`;
  });
  const more =
    items.length > max ? `\n…and ${items.length - max} more.` : "";

  const hasRecentReminder = shown.some((i) =>
    (i.detail || "").includes("reminder sent")
  );

  const parts = [
    `${hi} — here's what needs a look:`,
    "",
    ...lines,
  ];

  if (more) parts.push(more.trim());

  if (hasRecentReminder) {
    parts.push(
      "",
      "Where we already sent a payment reminder recently, you're covered — no need to chase again unless you want to."
    );
  }

  if (options?.appUrl) {
    parts.push("", `Dashboard: ${options.appUrl}`);
  } else {
    parts.push("", "Reply here if you want me to help with any of these.");
  }

  return parts.join("\n");
}
