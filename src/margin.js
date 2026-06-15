import { parseCsv } from "./csv.js";

export function parseRateTables({ peopleRatesCsv, projectRatesCsv }) {
  const peopleRows = parseCsv(peopleRatesCsv);
  const projectRows = parseCsv(projectRatesCsv);

  const peopleRates = new Map(
    peopleRows
      .filter((row) => row.clickup_user_id)
      .map((row) => [
        String(row.clickup_user_id),
        {
          userId: String(row.clickup_user_id),
          username: row.username || "Unknown user",
          costRate: number(row.cost_rate),
          defaultBillRate: number(row.default_bill_rate),
          role: row.role || "",
        },
      ])
  );

  const projectRates = new Map(
    projectRows
      .filter((row) => row.clickup_list_id)
      .map((row) => [
        String(row.clickup_list_id),
        {
          listId: String(row.clickup_list_id),
          client: row.client || "Unmapped client",
          project: row.project || "Unmapped project",
          billRate: number(row.bill_rate),
          budgetHours: number(row.budget_hours),
          targetMargin: number(row.target_margin),
        },
      ])
  );

  return { peopleRates, projectRates };
}

export function buildMarginReport({ entries, tasksById, peopleRates, projectRates }) {
  const projectTotals = new Map();
  const entryRows = [];
  const missing = {
    peopleRates: new Map(),
    projectRates: new Map(),
    taskLocation: new Map(),
  };

  for (const entry of entries) {
    const taskId = getEntryTaskId(entry);
    const task = tasksById.get(taskId);
    const user = normalizeUser(entry);
    const listId = normalizeListId(entry, task);
    const person = peopleRates.get(String(user.id));
    const project = projectRates.get(String(listId));
    const hours = durationHours(entry);
    const billable = isBillable(entry);
    const costRate = person?.costRate ?? 0;
    const billRate = project?.billRate || person?.defaultBillRate || 0;
    const revenue = billable ? hours * billRate : 0;
    const cost = hours * costRate;
    const grossProfit = revenue - cost;

    if (!person) addMissing(missing.peopleRates, user.id || "unknown", user.name || "Unknown user");
    if (!project) addMissing(missing.projectRates, listId || "unknown", task?.list?.name || task?.name || "Unknown list");
    if (!listId) addMissing(missing.taskLocation, taskId || "unknown", entry.description || task?.name || "Unknown task");

    const client = project?.client || "Unmapped";
    const projectName = project?.project || "Unmapped";
    const key = project?.listId || `unmapped:${listId || taskId || user.id}`;

    if (!projectTotals.has(key)) {
      projectTotals.set(key, {
        key,
        client,
        project: projectName,
        budgetHours: project?.budgetHours || 0,
        targetMargin: project?.targetMargin || 0,
        trackedHours: 0,
        billableHours: 0,
        revenue: 0,
        cost: 0,
        grossProfit: 0,
      });
    }

    const total = projectTotals.get(key);
    total.trackedHours += hours;
    total.billableHours += billable ? hours : 0;
    total.revenue += revenue;
    total.cost += cost;
    total.grossProfit += grossProfit;

    entryRows.push({
      date: dateLabel(entry),
      user: person?.username || user.name || `User ${user.id || "unknown"}`,
      client,
      project: projectName,
      task: task?.name || entry.task?.name || taskId,
      hours: round(hours),
      billable: billable ? "yes" : "no",
      bill_rate: round(billRate),
      cost_rate: round(costRate),
      revenue: round(revenue),
      cost: round(cost),
      gross_profit: round(grossProfit),
    });
  }

  const projects = [...projectTotals.values()].map((total) => ({
    ...total,
    trackedHours: round(total.trackedHours),
    billableHours: round(total.billableHours),
    revenue: round(total.revenue),
    cost: round(total.cost),
    grossProfit: round(total.grossProfit),
    margin: total.revenue ? round(total.grossProfit / total.revenue) : 0,
    budgetUsed: total.budgetHours ? round(total.trackedHours / total.budgetHours) : 0,
  }));

  const totals = projects.reduce(
    (acc, project) => {
      acc.trackedHours += project.trackedHours;
      acc.billableHours += project.billableHours;
      acc.revenue += project.revenue;
      acc.cost += project.cost;
      acc.grossProfit += project.grossProfit;
      return acc;
    },
    { trackedHours: 0, billableHours: 0, revenue: 0, cost: 0, grossProfit: 0 }
  );
  totals.margin = totals.revenue ? round(totals.grossProfit / totals.revenue) : 0;

  return {
    totals: mapNumbers(totals, round),
    projects: projects.sort((a, b) => a.margin - b.margin),
    entries: entryRows,
    missing: {
      peopleRates: [...missing.peopleRates.values()],
      projectRates: [...missing.projectRates.values()],
      taskLocation: [...missing.taskLocation.values()],
    },
  };
}

export function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

export function formatPercent(value) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(value || 0);
}

function normalizeUser(entry) {
  const user = entry.user || entry.assignee || {};
  return {
    id: user.id || entry.user_id || entry.assignee_id || "",
    name: user.username || user.email || user.name || "",
  };
}

function getEntryTaskId(entry) {
  return entry.task?.id || entry.task_id || entry.tid || entry.taskId || "";
}

function normalizeListId(entry, task) {
  return (
    entry.task_location?.list_id ||
    entry.task?.list?.id ||
    entry.list?.id ||
    task?.list?.id ||
    task?.list_id ||
    ""
  );
}

function durationHours(entry) {
  const duration = Number(entry.duration ?? entry.time ?? entry.time_spent ?? 0);
  return duration / 1000 / 60 / 60;
}

function isBillable(entry) {
  if (typeof entry.billable === "boolean") return entry.billable;
  if (typeof entry.is_billable === "boolean") return entry.is_billable;
  return entry.billable === "true" || entry.is_billable === "true";
}

function dateLabel(entry) {
  const raw = Number(entry.start || entry.start_date || entry.at || 0);
  return raw ? new Date(raw).toISOString().slice(0, 10) : "";
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addMissing(map, id, label) {
  const key = String(id || "unknown");
  if (!map.has(key)) map.set(key, { id: key, label });
}

function mapNumbers(object, mapper) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, mapper(value)]));
}
