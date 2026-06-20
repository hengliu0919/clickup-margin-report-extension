import test from "node:test";
import assert from "node:assert/strict";
import { parseRateTables, buildMarginReport } from "../src/margin.js";

const baseSettings = {
  peopleRates: [
    { clickup_user_id: "1", display_name: "Alice", cost_rate: "80", default_bill_rate: "120", active: true },
  ],
  projectRates: [
    { scope_id: "L1", client: "Acme", project: "Web", bill_rate: "150", budget_amount: "1000", active: true },
  ],
};

const h = (n) => n * 3600 * 1000;
const entries = [{ id: "e1", duration: h(10), billable: true, start: 1, user: { id: 1 }, task: { id: "t1", name: "T", list: { id: "L1" } } }];

test("override wins over project rate and person default", () => {
  const settings = { ...baseSettings, rateOverrides: [{ clickup_user_id: "1", scope_id: "L1", bill_rate: "200", active: true }] };
  const { peopleRates, projectRates, rateOverrides } = parseRateTables(settings);
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates, rateOverrides });
  assert.equal(report.totals.revenue, 2000); // 10h * 200 (override), not 150 or 120
});

test("project rate used when no override", () => {
  const { peopleRates, projectRates, rateOverrides } = parseRateTables(baseSettings);
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates, rateOverrides });
  assert.equal(report.totals.revenue, 1500); // 10h * 150 project rate
});

test("inactive or non-numeric override is ignored", () => {
  const settings = { ...baseSettings, rateOverrides: [
    { clickup_user_id: "1", scope_id: "L1", bill_rate: "200", active: false },
    { clickup_user_id: "1", scope_id: "L1", bill_rate: "abc", active: true },
  ] };
  const { rateOverrides } = parseRateTables(settings);
  assert.equal(rateOverrides.size, 0);
});

test("dollar budget: overBudgetAmount fires when revenue exceeds budget_amount", () => {
  // revenue 1500 > budget 1000.
  const { peopleRates, projectRates, rateOverrides } = parseRateTables(baseSettings);
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates, rateOverrides });
  const p = report.projects[0];
  assert.equal(p.budgetAmount, 1000);
  assert.equal(p.overBudgetAmount, true);
  assert.equal(p.budgetAmountUsed, 1.5);
  assert.equal(report.alerts.overBudgetAmount.length, 1);
});

test("no dollar-budget alert when under budget", () => {
  const settings = { ...baseSettings, projectRates: [{ ...baseSettings.projectRates[0], budget_amount: "5000" }] };
  const { peopleRates, projectRates, rateOverrides } = parseRateTables(settings);
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates, rateOverrides });
  assert.equal(report.projects[0].overBudgetAmount, false);
  assert.equal(report.alerts.overBudgetAmount.length, 0);
});

test("groups by task type, defaulting null type to 'Task'", () => {
  const { peopleRates, projectRates, rateOverrides } = parseRateTables(baseSettings);
  const h2 = (n) => n * 3600 * 1000;
  const typed = [
    { id: "a", duration: h2(2), billable: true, start: 1, user: { id: 1 }, task: { id: "t1", type: "Bug", list: { id: "L1" } } },
    { id: "b", duration: h2(3), billable: true, start: 1, user: { id: 1 }, task: { id: "t2", type: "Bug", list: { id: "L1" } } },
    { id: "c", duration: h2(1), billable: true, start: 1, user: { id: 1 }, task: { id: "t3", list: { id: "L1" } } }, // no type -> Task
  ];
  const report = buildMarginReport({ entries: typed, tasksById: new Map(), peopleRates, projectRates, rateOverrides });
  const byType = Object.fromEntries(report.types.map((t) => [t.type, t.trackedHours]));
  assert.equal(byType.Bug, 5);
  assert.equal(byType.Task, 1);
});
