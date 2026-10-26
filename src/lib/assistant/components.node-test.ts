import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionsForInvoiceStatus,
  deriveComponentsFromToolResults,
  parseMessageComponents,
} from "./components.ts";

describe("actionsForInvoiceStatus", () => {
  it("offers send/edit/cancel for drafts", () => {
    assert.deepEqual(actionsForInvoiceStatus("draft"), [
      "edit",
      "approve_and_send",
      "view",
      "cancel_draft",
    ]);
  });

  it("does not offer send for paid invoices", () => {
    assert.deepEqual(actionsForInvoiceStatus("paid"), ["view"]);
  });

  it("allows view/edit for sent invoices", () => {
    assert.deepEqual(actionsForInvoiceStatus("sent"), ["view", "edit"]);
  });
});

describe("deriveComponentsFromToolResults", () => {
  it("builds an invoice card from create_invoice_draft", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "create_invoice_draft",
        result: {
          ok: true,
          invoice: {
            id: "inv-1",
            client: "Sarah",
            amount: "€800.00",
            amount_raw: 800,
            currency: "EUR",
            due_date: "2026-11-01",
            status: "draft",
            description: "Services",
          },
        },
      },
    ]);
    assert.equal(components.length, 1);
    assert.equal(components[0].type, "invoice_card");
    if (components[0].type === "invoice_card") {
      assert.equal(components[0].entityId, "inv-1");
      assert.ok(components[0].actions.includes("approve_and_send"));
      assert.equal(components[0].snapshot?.client, "Sarah");
    }
  });

  it("skips failed tools", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "create_invoice_draft",
        result: { error: "Multiple different clients matched.", matches: [] },
      },
    ]);
    assert.equal(components.length, 0);
  });

  it("prefers later update over create for the same invoice", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "create_invoice_draft",
        result: {
          ok: true,
          invoice: {
            id: "inv-1",
            client: "Sarah",
            amount: "€800.00",
            status: "draft",
          },
        },
      },
      {
        name: "update_invoice_draft",
        result: {
          ok: true,
          invoice: {
            id: "inv-1",
            client: "Sarah",
            amount: "€1,800.00",
            amount_raw: 1800,
            status: "draft",
            due_date: "2026-11-08",
          },
        },
      },
    ]);
    assert.equal(components.length, 1);
    if (components[0].type === "invoice_card") {
      assert.equal(components[0].snapshot?.amount, "€1,800.00");
      assert.equal(components[0].snapshot?.dueDate, "2026-11-08");
    }
  });

  it("builds payment_summary from unpaid list", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "list_unpaid_invoices",
        result: {
          ok: true,
          count: 1,
          total_outstanding_hint: 1500,
          invoices: [
            {
              id: "inv-9",
              client: "Northwind",
              amount: "€1,500.00",
              due_date: "2020-01-01",
              status: "overdue",
              number: "1001",
            },
          ],
        },
      },
    ]);
    assert.equal(components.length, 1);
    assert.equal(components[0].type, "payment_summary");
    if (components[0].type === "payment_summary") {
      assert.equal(components[0].invoices.length, 1);
      assert.ok((components[0].invoices[0].daysOverdue || 0) > 0);
    }
  });

  it("updates card after send_invoice", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "send_invoice",
        result: {
          ok: true,
          sent: true,
          invoice_id: "inv-1",
          number: "1042",
          status: "sent",
        },
      },
    ]);
    assert.equal(components.length, 1);
    if (components[0].type === "invoice_card") {
      assert.equal(components[0].snapshot?.status, "sent");
      assert.equal(components[0].snapshot?.number, "1042");
      assert.ok(!components[0].actions.includes("approve_and_send"));
    }
  });
});

describe("parseMessageComponents", () => {
  it("reads persisted metadata", () => {
    const components = parseMessageComponents({
      components: [
        {
          type: "invoice_card",
          entityId: "inv-1",
          actions: ["view"],
          snapshot: { status: "paid" },
        },
      ],
    });
    assert.equal(components.length, 1);
    assert.equal(components[0].entityId, "inv-1");
  });

  it("returns empty for missing metadata", () => {
    assert.deepEqual(parseMessageComponents(null), []);
    assert.deepEqual(parseMessageComponents({}), []);
  });
});
