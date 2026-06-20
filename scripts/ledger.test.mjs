import test from "node:test";
import assert from "node:assert/strict";
import { buildMarginReport, parseRateTables } from "../src/margin.js";
import { buildInvoices } from "../src/invoice.js";

function setup() {
  const { peopleRates, projectRates } = parseRateTables({
    peopleRates: [{ clickup_user_id: "1", display_name: "A", cost_rate: "50", default_bill_rate: "100", active: true }],
    projectRates: [{ scope_id: "L1", client: "Acme", project: "Web", bill_rate: "150", active: true }],
  });
  const h = (n) => n * 3600 * 1000;
  const entries = [
    { id: "e1", duration: h(2), billable: true, start: 1, user: { id: 1 }, task: { id: "t1", name: "T1", list: { id: "L1" } } },
    { id: "e2", duration: h(3), billable: true, start: 1, user: { id: 1 }, task: { id: "t2", name: "T2", list: { id: "L1" } } },
    { id: "e3", duration: h(1), billable: false, start: 1, user: { id: 1 }, task: { id: "t1", name: "T1", list: { id: "L1" } } },
  ];
  return { peopleRates, projectRates, entries };
}

test("project rows expose billable entry ids (not non-billable)", () => {
  const { peopleRates, projectRates, entries } = setup();
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates });
  const ids = report.projects[0].billableEntryIds;
  assert.deepEqual(ids.sort(), ["e1", "e2"]); // e3 is non-billable
});

test("buildInvoices collects billable entry ids per client", () => {
  const { peopleRates, projectRates, entries } = setup();
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates });
  const invoices = buildInvoices(report);
  assert.equal(invoices.length, 1);
  assert.deepEqual(invoices[0].entryIds.sort(), ["e1", "e2"]);
});

test("excludeEntryIds removes already-invoiced entries from the report", () => {
  const { peopleRates, projectRates, entries } = setup();
  const exclude = new Set(["e1"]); // pretend e1 was already invoiced
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates, excludeEntryIds: exclude });
  assert.equal(report.excludedCount, 1);
  // Only e2 (3h billable) + e3 (1h non-billable) remain.
  assert.equal(report.totals.billableHours, 3);
  assert.equal(report.totals.revenue, 450); // 3h * 150
  assert.deepEqual(report.projects[0].billableEntryIds, ["e2"]);
});

test("no exclusion when excludeEntryIds is null", () => {
  const { peopleRates, projectRates, entries } = setup();
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates, excludeEntryIds: null });
  assert.equal(report.excludedCount, 0);
  assert.equal(report.totals.billableHours, 5);
});
