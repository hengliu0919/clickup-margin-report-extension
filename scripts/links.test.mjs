import test from "node:test";
import assert from "node:assert/strict";
import { taskUrl, timesheetWeekUrl } from "../src/clickup-links.js";
import { buildMarginReport, parseRateTables } from "../src/margin.js";

test("taskUrl builds /t/{taskId} and is empty without an id", () => {
  assert.equal(taskUrl("86baejjur"), "https://app.clickup.com/t/86baejjur");
  assert.equal(taskUrl(""), "");
  assert.equal(taskUrl(undefined), "");
});

test("timesheetWeekUrl snaps to the start of the week (Sunday)", () => {
  // 2026-06-10 is a Wednesday; week start (Sun) is 2026-06-07.
  const wed = new Date(2026, 5, 10, 15, 0, 0).getTime();
  const url = timesheetWeekUrl("90141340871", wed);
  assert.match(url, /^https:\/\/app\.clickup\.com\/90141340871\/time\?start_of_week=\d+$/);
  const start = Number(url.match(/start_of_week=(\d+)/)[1]);
  const d = new Date(start);
  assert.equal(d.getDay(), 0); // Sunday
  assert.equal(d.getHours(), 0);
});

test("timesheetWeekUrl without a timestamp omits the week param", () => {
  assert.equal(timesheetWeekUrl("123", 0), "https://app.clickup.com/123/time");
});

test("timesheetWeekUrl needs a workspace id", () => {
  assert.equal(timesheetWeekUrl("", 123), "");
});

test("report rows carry the audit fields (taskId, topTaskId, workspaceId)", () => {
  const { peopleRates, projectRates } = parseRateTables({
    peopleRates: [{ clickup_user_id: "1", display_name: "A", cost_rate: "50", default_bill_rate: "100", active: true }],
    projectRates: [{ scope_id: "L1", client: "C", project: "P", bill_rate: "150", active: true }],
  });
  const start = new Date(2026, 5, 10).getTime();
  const entries = [
    { duration: 2 * 3600 * 1000, billable: true, start, user: { id: 1 }, task: { id: "t9", name: "Task 9", list: { id: "L1" } } },
  ];
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates, workspaceId: "90141340871" });
  assert.equal(report.workspaceId, "90141340871");
  assert.equal(report.tasks[0].taskId, "t9");
  // project + person rows expose the top task (most hours) for the audit link
  assert.equal(report.projects[0].topTaskId, "t9");
  assert.equal(report.people[0].topTaskId, "t9");
});

test("topTask is the task with the most hours in a group", () => {
  const { peopleRates, projectRates } = parseRateTables({
    peopleRates: [{ clickup_user_id: "1", display_name: "A", cost_rate: "50", default_bill_rate: "100", active: true }],
    projectRates: [{ scope_id: "L1", client: "C", project: "P", bill_rate: "150", active: true }],
  });
  const h = (n) => n * 3600 * 1000;
  const entries = [
    { duration: h(1), billable: true, start: 1, user: { id: 1 }, task: { id: "small", name: "Small", list: { id: "L1" } } },
    { duration: h(5), billable: true, start: 1, user: { id: 1 }, task: { id: "big", name: "Big", list: { id: "L1" } } },
  ];
  const report = buildMarginReport({ entries, tasksById: new Map(), peopleRates, projectRates, workspaceId: "ws" });
  assert.equal(report.projects[0].topTaskId, "big");
  assert.equal(report.projects[0].topTaskName, "Big");
});
