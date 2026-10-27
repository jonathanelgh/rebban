import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectPendingClients,
  selectPendingSendInvoices,
} from "./pending-invoice-selection.ts";

const clients = [
  { client_id: "1", label: "Acme Corp" },
  { client_id: "2", label: "Northwind" },
  { client_id: "3", label: "Beta LLC" },
];

describe("selectPendingClients", () => {
  it("returns all when no filters", () => {
    assert.equal(selectPendingClients(clients).length, 3);
  });

  it("includes by name query", () => {
    const picked = selectPendingClients(clients, {
      includeQueries: ["Acme", "Beta"],
    });
    assert.deepEqual(
      picked.map((c) => c.label),
      ["Acme Corp", "Beta LLC"]
    );
  });

  it("excludes by name query from all", () => {
    const picked = selectPendingClients(clients, {
      excludeQueries: ["Northwind"],
    });
    assert.equal(picked.length, 2);
    assert.ok(!picked.some((c) => c.label === "Northwind"));
  });

  it("supports include then exclude", () => {
    const picked = selectPendingClients(clients, {
      includeQueries: ["Acme", "Northwind", "Beta"],
      excludeQueries: ["north"],
    });
    assert.deepEqual(
      picked.map((c) => c.label),
      ["Acme Corp", "Beta LLC"]
    );
  });
});

describe("selectPendingSendInvoices", () => {
  it("filters by client label on drafts", () => {
    const invoices = [
      { invoice_id: "i1", client: "Acme Corp" },
      { invoice_id: "i2", client: "Northwind" },
    ];
    const picked = selectPendingSendInvoices(invoices, {
      includeQueries: ["acme"],
    });
    assert.deepEqual(
      picked.map((i) => i.invoice_id),
      ["i1"]
    );
  });
});
