import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInvoicePaidAssistantMessage,
  formatProposalAcceptedAssistantMessage,
} from "./event-messages.ts";

describe("formatProposalAcceptedAssistantMessage", () => {
  it("congratulates and offers project", () => {
    const message = formatProposalAcceptedAssistantMessage({
      userName: "Jonathan",
      clientLabel: "Sara",
      proposalTitle: "Brand refresh",
    });
    assert.match(message, /Hey Jonathan/);
    assert.match(message, /Sara just accepted/);
    assert.match(message, /Congratulations/);
    assert.match(message, /create a project/);
  });

  it("mentions deposit when present", () => {
    const message = formatProposalAcceptedAssistantMessage({
      userName: "Jonathan",
      clientLabel: "Sara",
      proposalTitle: "Brand refresh",
      invoiceAsk: { kind: "deposit", amountLabel: "€1,000.00" },
    });
    assert.match(message, /deposit/i);
    assert.match(message, /€1,000/);
  });
});

describe("formatInvoicePaidAssistantMessage", () => {
  it("celebrates payment", () => {
    const text = formatInvoicePaidAssistantMessage({
      userName: "Jonathan",
      clientLabel: "Acme",
      invoiceLabel: "INV-12",
      amountLabel: "€500",
    });
    assert.match(text, /Hey Jonathan/);
    assert.match(text, /Acme just paid INV-12/);
    assert.match(text, /Nice one/);
  });
});
