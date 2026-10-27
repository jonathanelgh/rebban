import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBillingDigest } from "./billing-digest.ts";

describe("formatBillingDigest", () => {
  it("sounds like a short human check-in", () => {
    const text = formatBillingDigest({
      userName: "Jonathan Elgh",
      unbilled: [
        {
          client_id: "1",
          label: "Acme",
          hours: "4h",
          amount: "€400",
        },
        {
          client_id: "2",
          label: "Northwind",
          hours: "2h",
          amount: "€200",
        },
      ],
      attention: [
        {
          id: "overdue_invoice:1",
          kind: "overdue_invoice",
          priority: 90,
          title: "INV-12",
          detail: "Overdue · €500 · reminder sent yesterday",
          suggested_action: "Already reminded",
          entity_type: "invoice",
          entity_id: "1",
          client: "Acme",
        },
      ],
    });
    assert.match(text, /Hey Jonathan/);
    assert.match(text, /quick invoicing check-in/);
    assert.match(text, /Acme/);
    assert.match(text, /Northwind/);
    assert.match(text, /On payments/);
    assert.match(text, /reminder sent yesterday/);
    assert.match(text, /Want me to draft/);
    assert.doesNotMatch(text, /Invoicing check-in\n\nReady to invoice:/);
  });

  it("handles empty unbilled warmly", () => {
    const text = formatBillingDigest({
      unbilled: [],
      attention: [
        {
          id: "overdue_invoice:1",
          kind: "overdue_invoice",
          priority: 90,
          title: "INV-1",
          detail: "Overdue · reminder sent today",
          suggested_action: "Already reminded",
          entity_type: "invoice",
          entity_id: "1",
          client: "Acme",
        },
      ],
    });
    assert.match(text, /No unbilled hours/);
    assert.match(text, /On payments/);
  });
});
