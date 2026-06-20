import test from "node:test";
import assert from "node:assert/strict";
import { buildInvoices, invoiceNumber, dueDate } from "../src/invoice.js";

const report = {
  currency: "USD",
  projects: [
    { client: "Acme Co", project: "Website", billableHours: 10, effectiveRate: 150, revenue: 1500 },
    { client: "Acme Co", project: "SEO", billableHours: 4, effectiveRate: 125, revenue: 500 },
    { client: "Northstar", project: "Retainer", billableHours: 8, effectiveRate: 185, revenue: 1480 },
    { client: "Helio", project: "Unbilled", billableHours: 0, effectiveRate: 0, revenue: 0 },
  ],
};

test("groups projects into one invoice per client, billable only", () => {
  const invoices = buildInvoices(report);
  assert.equal(invoices.length, 2); // Helio has 0 revenue → excluded
  const acme = invoices.find((i) => i.client === "Acme Co");
  assert.equal(acme.lines.length, 2);
  assert.equal(acme.total, 2000);
});

test("invoice lines never expose cost or margin", () => {
  const [inv] = buildInvoices(report);
  for (const line of inv.lines) {
    const keys = Object.keys(line);
    for (const forbidden of ["cost", "margin", "grossProfit", "costRate", "profit"]) {
      assert.ok(!keys.includes(forbidden), `line must not expose "${forbidden}"`);
    }
    // The client-facing fields plus an internal lastMs timestamp for the audit link.
    assert.deepEqual(keys.sort(), ["amount", "hours", "lastMs", "project", "rate"]);
  }
});

test("lines are sorted by amount descending", () => {
  const acme = buildInvoices(report).find((i) => i.client === "Acme Co");
  assert.equal(acme.lines[0].project, "Website"); // 1500 > 500
});

test("invoiceNumber composes prefix + sequential number with offset", () => {
  assert.equal(invoiceNumber({ invoicePrefix: "INV", nextInvoiceNumber: "1001" }), "INV-1001");
  assert.equal(invoiceNumber({ invoicePrefix: "INV", nextInvoiceNumber: "1001" }, 2), "INV-1003");
  assert.equal(invoiceNumber({ invoicePrefix: "", nextInvoiceNumber: "5" }), "5");
});

test("dueDate adds Net N days", () => {
  assert.equal(dueDate("2026-06-01", "Net 30"), "2026-07-01");
  assert.equal(dueDate("2026-06-01", "Due on receipt"), "2026-06-01"); // no day count
});
