export async function hashProposalDocument(input: {
  proposalId: string;
  title: string;
  amount: number | string;
  currency: string;
  content: unknown;
}) {
  const payload = JSON.stringify({
    id: input.proposalId,
    title: input.title,
    amount: Number(input.amount || 0),
    currency: input.currency,
    content: input.content ?? {},
  });

  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatMoneyLabel(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString()}`;
  }
}
