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

export function formatAttentionDigest(
  items: AttentionItem[],
  options?: { maxItems?: number; appUrl?: string }
): string {
  if (!items.length) {
    return "You're clear — nothing urgent needs attention right now.";
  }
  const max = options?.maxItems ?? 6;
  const lines = items.slice(0, max).map((item, i) => {
    const who = item.client ? ` (${item.client})` : "";
    return `${i + 1}. ${item.title}${who} — ${item.detail}`;
  });
  const more =
    items.length > max ? `\n…and ${items.length - max} more.` : "";
  const footer = options?.appUrl
    ? `\n\nOpen Rebban: ${options.appUrl}`
    : "\n\nReply here if you want me to act on any of these.";
  return `Here's what needs attention:\n\n${lines.join("\n")}${more}${footer}`;
}
