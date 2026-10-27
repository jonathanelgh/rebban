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
};

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
