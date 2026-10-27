import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAttentionDigest,
  type AttentionItem,
} from "./needs-attention-format.ts";

const sample: AttentionItem[] = [
  {
    id: "overdue_invoice:1",
    kind: "overdue_invoice",
    priority: 90,
    title: "INV-001",
    detail: "Overdue · €500",
    suggested_action: "Send a reminder",
    entity_type: "invoice",
    entity_id: "1",
    client: "Acme",
  },
  {
    id: "unbilled_hours:c1",
    kind: "unbilled_hours",
    priority: 55,
    title: "Northwind",
    detail: "4.5h unbilled ready to invoice.",
    suggested_action: "Create an invoice draft",
    entity_type: "client",
    entity_id: "c1",
    client: "Northwind",
  },
];

describe("formatAttentionDigest", () => {
  it("formats empty as clear", () => {
    const text = formatAttentionDigest([]);
    assert.match(text, /clear/i);
  });

  it("lists items with client and detail", () => {
    const text = formatAttentionDigest(sample, { maxItems: 6 });
    assert.match(text, /needs attention/i);
    assert.match(text, /INV-001 \(Acme\)/);
    assert.match(text, /Northwind/);
    assert.match(text, /Reply here/i);
  });

  it("includes app url footer when provided", () => {
    const text = formatAttentionDigest(sample, {
      appUrl: "https://app.rebban.test",
    });
    assert.match(text, /https:\/\/app\.rebban\.test/);
  });
});
