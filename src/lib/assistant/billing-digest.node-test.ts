import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBillingDigest } from "./billing-digest.ts";

describe("formatBillingDigest", () => {
  it("lists unbilled and reply hint", () => {
    const text = formatBillingDigest({
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
    });
    assert.match(text, /Ready to invoice/);
    assert.match(text, /Acme/);
    assert.match(text, /skip Northwind|Reply with who/i);
  });

  it("includes attention extras", () => {
    const text = formatBillingDigest({
      unbilled: [],
      attention: [
        {
          id: "overdue_invoice:1",
          kind: "overdue_invoice",
          priority: 90,
          title: "INV-1",
          detail: "Overdue",
          suggested_action: "Remind",
          entity_type: "invoice",
          entity_id: "1",
          client: "Acme",
        },
      ],
    });
    assert.match(text, /No unbilled/);
    assert.match(text, /Also worth a look/);
    assert.match(text, /INV-1/);
  });
});
