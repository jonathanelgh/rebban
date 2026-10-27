export type ProposalInvoiceAsk =
  | { kind: "deposit"; amountLabel: string }
  | { kind: "retainer" }
  | { kind: "full"; amountLabel?: string };

function firstName(full?: string | null) {
  const value = (full || "").trim();
  if (!value || value.includes("@")) return null;
  return value.split(/\s+/)[0] || null;
}

export function formatProposalAcceptedAssistantMessage(options: {
  userName?: string | null;
  clientLabel: string;
  proposalTitle: string;
  alreadyHasProject?: boolean;
  invoiceAsk?: ProposalInvoiceAsk | null;
}): string {
  const hi = firstName(options.userName);
  const greet = hi ? `Hey ${hi}` : "Hey";
  const who = options.clientLabel || "Your client";
  const title = options.proposalTitle || "your proposal";
  const ask = options.invoiceAsk || null;

  const parts = [
    `${greet} — ${who} just accepted “${title}”. Congratulations!`,
  ];

  if (options.alreadyHasProject) {
    parts.push("A project is already linked to this proposal.");
    if (ask?.kind === "retainer") {
      parts.push(
        "Want me to draft the first retainer invoice? Reply yes to draft, or wait if not now."
      );
    } else if (ask?.kind === "deposit") {
      parts.push(
        `Want me to draft the deposit invoice (${ask.amountLabel})? Reply yes to draft, or wait if not now.`
      );
    } else {
      parts.push("Reply if you want help kicking anything off.");
    }
    return parts.join("\n\n");
  }

  parts.push(
    "Want me to create a project with tasks based on the proposal scope?"
  );

  if (ask?.kind === "retainer") {
    parts.push(
      "It's set up as a retainer — I can also draft the first invoice when you're ready."
    );
    parts.push(
      'Reply "yes", "yes and draft the invoice", or wait if not now.'
    );
  } else if (ask?.kind === "deposit") {
    parts.push(
      `There's an upfront/deposit (${ask.amountLabel}) — I can also draft that invoice.`
    );
    parts.push(
      'Reply "yes", "yes and draft the deposit", or wait if not now.'
    );
  } else {
    parts.push("Reply yes to create the project, or wait if not now.");
  }

  return parts.join("\n\n");
}

export function formatInvoicePaidAssistantMessage(options: {
  userName?: string | null;
  clientLabel: string;
  invoiceLabel: string;
  amountLabel: string;
}): string {
  const hi = firstName(options.userName);
  const greet = hi ? `Hey ${hi}` : "Hey";
  const who = options.clientLabel || "A client";
  return `${greet} — ${who} just paid ${options.invoiceLabel} (${options.amountLabel}). Nice one!`;
}
