import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAttentionDigest,
  formatLastReminderNote,
  type AttentionItem,
} from "./needs-attention-format.ts";

const sample: AttentionItem[] = [
  {
    id: "overdue_invoice:1",
    kind: "overdue_invoice",
    priority: 90,
    title: "INV-001",
    detail: "Overdue · €500 · reminder sent yesterday",
    suggested_action: "Already reminded recently",
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
    const text = formatAttentionDigest(sample, {
      maxItems: 6,
      userName: "Sam",
    });
    assert.match(text, /Hey Sam/);
    assert.match(text, /needs a look/i);
    assert.match(text, /INV-001 \(Acme\)/);
    assert.match(text, /reminder sent yesterday/);
    assert.match(text, /Northwind/);
    assert.match(text, /Reply here/i);
  });

  it("includes app url footer when provided", () => {
    const text = formatAttentionDigest(sample, {
      appUrl: "https://app.rebban.test",
    });
    assert.match(text, /Dashboard: https:\/\/app\.rebban\.test/);
  });
});

describe("formatLastReminderNote", () => {
  it("handles missing reminder", () => {
    assert.equal(formatLastReminderNote(null), "no payment reminder sent yet");
  });

  it("handles today and yesterday", () => {
    const today = new Date().toISOString();
    assert.equal(formatLastReminderNote(today), "reminder sent today");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    assert.equal(
      formatLastReminderNote(yesterday.toISOString()),
      "reminder sent yesterday"
    );
  });

  it("handles older reminders", () => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    assert.equal(
      formatLastReminderNote(d.toISOString()),
      "reminder sent 5 days ago"
    );
  });
});
