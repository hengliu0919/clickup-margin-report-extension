import test from "node:test";
import assert from "node:assert/strict";
import { parseRateTables, buildMarginReport } from "../src/margin.js";

function rates() {
  const peopleRatesCsv = [
    "clickup_user_id,display_name,role,cost_rate,default_bill_rate,currency,active",
    "216168243,Marco,Designer,55,135,USD,true",
    "216168277,Alice,Senior Engineer,85,175,USD,true",
  ].join("\n");
  const projectRatesCsv = [
    "scope_type,scope_id,scope_name,client,project,bill_rate,budget_hours,target_margin,active",
    "list,901417274458,Acme,Acme Co,Website,150,2,0.55,true",
  ].join("\n");
  return parseRateTables({ peopleRatesCsv, projectRatesCsv });
}

function hours(n) {
  return n * 60 * 60 * 1000;
}

test("smoke: revenue and cost from a single billable entry", () => {
  const { peopleRates, projectRates } = rates();
  const entries = [
    { id: "e1", duration: hours(2), billable: true, start: 1_700_000_000_000, user: { id: 216168243, username: "Marco" }, task: { id: "t1", name: "Homepage", list: { id: "901417274458", name: "Acme" } } },
  ];
  const tasksById = new Map([["t1", entries[0].task]]);
  const report = buildMarginReport({ entries, tasksById, peopleRates, projectRates });
  assert.equal(report.totals.revenue, 300); // 2h * 150
  assert.equal(report.totals.cost, 110); // 2h * 55
  assert.equal(report.totals.grossProfit, 190);
});

test("grand totals reconcile with the sum of project subtotals (no rounding drift)", () => {
  const { peopleRates, projectRates } = rates();
  // Durations that produce repeating decimals so per-entry rounding would drift.
  const entries = [
    { id: "a", duration: hours(1 / 3), billable: true, start: 1, user: { id: 216168243 }, task: { id: "t1", list: { id: "901417274458" } } },
    { id: "b", duration: hours(1 / 3), billable: true, start: 1, user: { id: 216168277 }, task: { id: "t1", list: { id: "901417274458" } } },
    { id: "c", duration: hours(1 / 3), billable: true, start: 1, user: { id: 216168243 }, task: { id: "t1", list: { id: "901417274458" } } },
  ];
  const tasksById = new Map([["t1", { id: "t1", list: { id: "901417274458" } }]]);
  const report = buildMarginReport({ entries, tasksById, peopleRates, projectRates });
  const projectRevenue = report.projects.reduce((acc, p) => acc + p.revenue, 0);
  assert.equal(report.totals.revenue, Math.round((projectRevenue + Number.EPSILON) * 100) / 100);
});

test("margin is 0 (not -Infinity) when revenue is 0 but cost exists", () => {
  const { peopleRates, projectRates } = rates();
  const entries = [
    { id: "nb", duration: hours(2), billable: false, start: 1, user: { id: 216168243 }, task: { id: "t1", list: { id: "901417274458" } } },
  ];
  const tasksById = new Map([["t1", { id: "t1", list: { id: "901417274458" } }]]);
  const report = buildMarginReport({ entries, tasksById, peopleRates, projectRates });
  assert.equal(report.totals.revenue, 0);
  assert.ok(report.totals.cost > 0);
  assert.equal(report.totals.margin, 0);
  assert.ok(Number.isFinite(report.totals.margin));
});

test("belowTarget alert fires when margin under target_margin", () => {
  const { peopleRates, projectRates } = rates();
  // Alice cost 85, bill 150 → margin ~0.43 < target 0.55.
  const entries = [
    { id: "x", duration: hours(2), billable: true, start: 1, user: { id: 216168277 }, task: { id: "t1", list: { id: "901417274458" } } },
  ];
  const tasksById = new Map([["t1", { id: "t1", list: { id: "901417274458" } }]]);
  const report = buildMarginReport({ entries, tasksById, peopleRates, projectRates });
  assert.equal(report.alerts.belowTarget.length, 1);
  assert.equal(report.projects[0].belowTarget, true);
});

test("overBudget alert fires when tracked hours exceed budget_hours", () => {
  const { peopleRates, projectRates } = rates();
  // budget is 2h; track 3h.
  const entries = [
    { id: "x", duration: hours(3), billable: true, start: 1, user: { id: 216168243 }, task: { id: "t1", list: { id: "901417274458" } } },
  ];
  const tasksById = new Map([["t1", { id: "t1", list: { id: "901417274458" } }]]);
  const report = buildMarginReport({ entries, tasksById, peopleRates, projectRates });
  assert.equal(report.alerts.overBudget.length, 1);
  assert.equal(report.projects[0].overBudget, true);
});

test("estimated revenue flagged when no project rate (uses default bill rate)", () => {
  const { peopleRates, projectRates } = rates();
  const entries = [
    { id: "x", duration: hours(2), billable: true, start: 1, user: { id: 216168243 }, task: { id: "tX", list: { id: "999999" } } },
  ];
  const tasksById = new Map([["tX", { id: "tX", list: { id: "999999" } }]]);
  const report = buildMarginReport({ entries, tasksById, peopleRates, projectRates });
  // Marco default bill 135 * 2 = 270, all estimated.
  assert.equal(report.totals.estimatedRevenue, 270);
  assert.equal(report.entries[0].estimated, "yes");
  assert.equal(report.missing.projectRates.length, 1);
});

test("mixed currency is detected and flagged", () => {
  const peopleRatesCsv = [
    "clickup_user_id,display_name,cost_rate,default_bill_rate,currency,active",
    "1,USD Person,50,100,USD,true",
    "2,EUR Person,50,100,EUR,true",
  ].join("\n");
  const { peopleRates, projectRates } = parseRateTables({ peopleRatesCsv, projectRatesCsv: "" });
  const entries = [
    { id: "a", duration: hours(1), billable: true, start: 1, user: { id: 1 }, task: { id: "t", list: { id: "L" } } },
    { id: "b", duration: hours(1), billable: true, start: 1, user: { id: 2 }, task: { id: "t", list: { id: "L" } } },
  ];
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates });
  assert.equal(report.mixedCurrency, true);
  assert.equal(report.currency, null);
  assert.deepEqual(report.currencies.sort(), ["EUR", "USD"]);
});

test("single currency is surfaced", () => {
  const { peopleRates, projectRates } = rates();
  const entries = [
    { id: "a", duration: hours(1), billable: true, start: 1, user: { id: 216168243 }, task: { id: "t1", list: { id: "901417274458" } } },
  ];
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates });
  assert.equal(report.currency, "USD");
  assert.equal(report.mixedCurrency, false);
});

test("per-person and per-task breakdowns are produced", () => {
  const { peopleRates, projectRates } = rates();
  const entries = [
    { id: "a", duration: hours(2), billable: true, start: 1, user: { id: 216168243, username: "Marco" }, task: { id: "t1", name: "A", list: { id: "901417274458" } } },
    { id: "b", duration: hours(1), billable: true, start: 1, user: { id: 216168277, username: "Alice" }, task: { id: "t2", name: "B", list: { id: "901417274458" } } },
  ];
  const tasksById = new Map([
    ["t1", { id: "t1", name: "A", list: { id: "901417274458" } }],
    ["t2", { id: "t2", name: "B", list: { id: "901417274458" } }],
  ]);
  const report = buildMarginReport({ entries, tasksById, peopleRates, projectRates });
  assert.equal(report.people.length, 2);
  assert.equal(report.tasks.length, 2);
  assert.ok(report.people.every((p) => Number.isFinite(p.utilization)));
});

test("parseRateTables excludes inactive rows for both array and string 'false'", () => {
  const result = parseRateTables({
    peopleRates: [
      { clickup_user_id: "1", display_name: "Active", cost_rate: "10", default_bill_rate: "20", active: true },
      { clickup_user_id: "2", display_name: "Bool off", cost_rate: "10", default_bill_rate: "20", active: false },
      { clickup_user_id: "3", display_name: "Str off", cost_rate: "10", default_bill_rate: "20", active: "false" },
    ],
    projectRates: [],
  });
  assert.equal(result.peopleRates.has("1"), true);
  assert.equal(result.peopleRates.has("2"), false);
  assert.equal(result.peopleRates.has("3"), false);
});

test("project rate accepts legacy clickup_list_id key", () => {
  const result = parseRateTables({
    peopleRates: [],
    projectRates: [
      { clickup_list_id: "555", client: "C", project: "P", bill_rate: "100", active: true },
    ],
  });
  assert.equal(result.projectRates.has("555"), true);
});

test("utilization and effective rate computed from billable hours", () => {
  const { peopleRates, projectRates } = rates();
  const entries = [
    { id: "a", duration: hours(2), billable: true, start: 1, user: { id: 216168243 }, task: { id: "t1", list: { id: "901417274458" } } },
    { id: "b", duration: hours(2), billable: false, start: 1, user: { id: 216168243 }, task: { id: "t1", list: { id: "901417274458" } } },
  ];
  const tasksById = new Map([["t1", { id: "t1", list: { id: "901417274458" } }]]);
  const report = buildMarginReport({ entries, tasksById, peopleRates, projectRates });
  assert.equal(report.totals.trackedHours, 4);
  assert.equal(report.totals.billableHours, 2);
  assert.equal(report.totals.utilization, 0.5);
  assert.equal(report.totals.effectiveRate, 150); // 300 revenue / 2 billable hrs
});
