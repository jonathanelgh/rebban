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

  it("builds proposal, client, lead, project, and task cards", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "create_proposal_draft",
        result: {
          ok: true,
          proposal: {
            id: "p1",
            title: "Website",
            client: "Northwind",
            amount: "€3,000.00",
            status: "draft",
          },
        },
      },
      {
        name: "add_client",
        result: {
          ok: true,
          client: {
            id: "c1",
            name: "Sarah",
            company: "Northwind",
            email: "sarah@example.com",
            status: "active",
          },
        },
      },
      {
        name: "add_lead",
        result: {
          ok: true,
          lead: { id: "l1", name: "Emma", company: "Studio", status: "new" },
        },
      },
      {
        name: "create_project",
        result: {
          ok: true,
          project: {
            id: "pr1",
            name: "Site rebuild",
            client: "Northwind",
            status: "active",
          },
        },
      },
      {
        name: "create_task",
        result: {
          ok: true,
          task: {
            id: "t1",
            title: "Homepage",
            column: "todo",
            project: "Site rebuild",
            due_date: "2026-11-01",
          },
        },
      },
    ]);
    const types = components.map((c) => c.type).sort();
    assert.deepEqual(types, [
      "client_card",
      "lead_card",
      "project_card",
      "proposal_card",
      "task_card",
    ]);
  });

  it("offers convert_to_project for accepted proposals", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "get_proposal",
        result: {
          ok: true,
          proposal: {
            id: "p1",
            title: "Website",
            status: "accepted",
            client: "Northwind",
            amount: "€3,000.00",
          },
        },
      },
    ]);
    assert.equal(components[0]?.type, "proposal_card");
    if (components[0]?.type === "proposal_card") {
      assert.ok(components[0].actions.includes("convert_to_project"));
    }
  });

  it("builds time_summary from unbilled hours", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "list_unbilled_hours",
        result: {
          ok: true,
          currency: "EUR",
          total_hours: "4.5",
          total_amount: "€450.00",
          clients: [
            {
              client_id: "c1",
              client: "Northwind",
              hours: "4.5h",
              amount: "€450.00",
            },
          ],
        },
      },
    ]);
    assert.equal(components.length, 1);
    assert.equal(components[0].type, "time_summary");
  });
});

describe("convert_proposal_to_project cards", () => {
  it("builds project and invoice cards from convert result", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "convert_proposal_to_project",
        result: {
          ok: true,
          project_id: "proj-1",
          project_name: "Website redesign",
          invoice_id: "inv-9",
          invoice_number: "INV-009",
        },
      },
    ]);
    assert.equal(components.length, 2);
    const project = components.find((c) => c.type === "project_card");
    const invoice = components.find((c) => c.type === "invoice_card");
    assert.ok(project);
    assert.ok(invoice);
    if (project?.type === "project_card") {
      assert.equal(project.entityId, "proj-1");
      assert.equal(project.snapshot?.name, "Website redesign");
    }
    if (invoice?.type === "invoice_card") {
      assert.equal(invoice.entityId, "inv-9");
      assert.ok(invoice.actions.includes("approve_and_send"));
    }
  });
});

describe("list_proposals cards", () => {
  it("builds proposal cards from list results", () => {
    const components = deriveComponentsFromToolResults([
      {
        name: "list_proposals",
        result: {
          ok: true,
          proposals: [
            {
              id: "prop-1",
              title: "Brand work",
              status: "accepted",
              client: "Sarah",
              amount: "€2,000.00",
            },
          ],
        },
      },
    ]);
    assert.equal(components.length, 1);
    assert.equal(components[0].type, "proposal_card");
    assert.equal(components[0].entityId, "prop-1");
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
