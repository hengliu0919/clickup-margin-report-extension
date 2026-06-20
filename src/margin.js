import { parseCsv } from "./csv.js";

/**
 * @typedef {Object} PersonRate
 * @property {string} userId
 * @property {string} username
 * @property {number} costRate
 * @property {number} defaultBillRate
 * @property {string} role
 * @property {string} currency
 */

/**
 * @typedef {Object} ProjectRate
 * @property {string} listId
 * @property {string} scopeType
 * @property {string} scopeName
 * @property {string} client
 * @property {string} project
 * @property {number} billRate
 * @property {number} budgetHours
 * @property {number} targetMargin
 */

/**
 * @typedef {Object} MarginEntry
 * @property {string|number} [duration]
 * @property {boolean|string} [billable]
 * @property {number|string} [start]
 * @property {{id?: string|number, username?: string}} [user]
 * @property {{id?: string, name?: string, list?: {id?: string, name?: string}}} [task]
 */

export function parseRateTables(settings) {
  const peopleRows = Array.isArray(settings.peopleRates) ? settings.peopleRates : parseCsv(settings.peopleRatesCsv || "");
  const projectRows = Array.isArray(settings.projectRates) ? settings.projectRates : parseCsv(settings.projectRatesCsv || "");

  const peopleRates = new Map(
    peopleRows
      .filter((row) => row.active !== false && row.active !== "false" && row.clickup_user_id)
      .map((row) => [
        String(row.clickup_user_id),
        {
          userId: String(row.clickup_user_id),
          username: row.display_name || row.username || "Unknown user",
          costRate: number(row.cost_rate),
          defaultBillRate: number(row.default_bill_rate),
          role: row.role || "",
          currency: (row.currency || "USD").toUpperCase(),
        },
      ])
  );

  const projectRates = new Map(
    projectRows
      .filter((row) => row.active !== false && row.active !== "false" && (row.scope_id || row.clickup_list_id))
      .map((row) => [
        String(row.scope_id || row.clickup_list_id),
        {
          listId: String(row.scope_id || row.clickup_list_id),
          scopeType: row.scope_type || "list",
          scopeName: row.scope_name || "",
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
  const peopleTotals = new Map();
  const taskTotals = new Map();
  const entryRows = [];
  const currencies = new Set();
  const missing = {
    peopleRates: new Map(),
    projectRates: new Map(),
    taskLocation: new Map(),
  };

  // Accumulate raw (unrounded) sums; round only once for display/export so grand
  // totals reconcile with the project breakdown and the CSV.
  for (const entry of entries) {
    const taskId = getEntryTaskId(entry);
    const task = tasksById.get(taskId) || entry.task || null;
    const user = normalizeUser(entry);
    const listId = normalizeListId(entry, task);
    const person = peopleRates.get(String(user.id));
    const project = projectRates.get(String(listId));
    const hours = durationHours(entry);
    const billable = isBillable(entry);
    const costRate = person?.costRate ?? 0;
    const hasProjectRate = Number(project?.billRate) > 0;
    const billRate = hasProjectRate ? project.billRate : person?.defaultBillRate || 0;
    // Revenue from a person's default bill rate (no project mapping) is an estimate,
    // not a contracted rate. Track it so the UI can flag the figure.
    const estimated = billable && !hasProjectRate && billRate > 0;
    const revenue = billable ? hours * billRate : 0;
    const cost = hours * costRate;
    const grossProfit = revenue - cost;
    if (person?.currency) currencies.add(person.currency);

    if (!person) addMissing(missing.peopleRates, user.id || "unknown", user.name || "Unknown user");
    if (!project) addMissing(missing.projectRates, listId || "unknown", task?.list?.name || task?.name || "Unknown list");
    if (!listId) addMissing(missing.taskLocation, taskId || "unknown", entry.description || task?.name || "Unknown task");

    const client = project?.client || "Unmapped";
    const projectName = project?.project || "Unmapped";
    const key = project?.listId || `unmapped:${listId || taskId || user.id}`;
    const userName = person?.username || user.name || `User ${user.id || "unknown"}`;
    const taskName = task?.name || entry.task?.name || taskId || "Unknown task";

    accumulate(projectTotals, key, () => ({
      key,
      client,
      project: projectName,
      budgetHours: project?.budgetHours || 0,
      targetMargin: project?.targetMargin || 0,
      mapped: Boolean(project),
    }), { hours, billable, revenue, cost, grossProfit, estimated });

    accumulate(peopleTotals, String(user.id || "unknown"), () => ({
      key: String(user.id || "unknown"),
      user: userName,
      role: person?.role || "",
      mapped: Boolean(person),
    }), { hours, billable, revenue, cost, grossProfit, estimated });

    accumulate(taskTotals, String(taskId || `${key}:${taskName}`), () => ({
      key: String(taskId || `${key}:${taskName}`),
      task: taskName,
      client,
      project: projectName,
      mapped: Boolean(project),
    }), { hours, billable, revenue, cost, grossProfit, estimated });

    entryRows.push({
      date: dateLabel(entry),
      user: userName,
      client,
      project: projectName,
      task: taskName,
      hours: round(hours),
      billable: billable ? "yes" : "no",
      estimated: estimated ? "yes" : "no",
      bill_rate: round(billRate),
      cost_rate: round(costRate),
      revenue: round(revenue),
      cost: round(cost),
      gross_profit: round(grossProfit),
    });
  }

  const projects = [...projectTotals.values()]
    .map((total) => finishProject(total))
    .sort((a, b) => a.margin - b.margin);
  const people = [...peopleTotals.values()]
    .map((total) => finishGroup(total))
    .sort((a, b) => b.revenue - a.revenue);
  const tasks = [...taskTotals.values()]
    .map((total) => finishGroup(total))
    .sort((a, b) => b.trackedHours - a.trackedHours);

  const totals = sumRaw(projectTotals.values());
  const displayTotals = {
    ...mapNumbers(totals, round),
    margin: totals.revenue ? round(totals.grossProfit / totals.revenue) : 0,
    utilization: totals.trackedHours ? round(totals.billableHours / totals.trackedHours) : 0,
    effectiveRate: totals.billableHours ? round(totals.revenue / totals.billableHours) : 0,
    estimatedRevenue: round(totals.estimatedRevenue),
  };

  return {
    totals: displayTotals,
    currencies: [...currencies],
    currency: currencies.size === 1 ? [...currencies][0] : null,
    mixedCurrency: currencies.size > 1,
    projects,
    people,
    tasks,
    entries: entryRows,
    alerts: buildAlerts(projects),
    missing: {
      peopleRates: [...missing.peopleRates.values()],
      projectRates: [...missing.projectRates.values()],
      taskLocation: [...missing.taskLocation.values()],
    },
  };
}

function accumulate(map, key, makeBase, { hours, billable, revenue, cost, grossProfit, estimated }) {
  if (!map.has(key)) {
    map.set(key, {
      ...makeBase(),
      trackedHours: 0,
      billableHours: 0,
      revenue: 0,
      cost: 0,
      grossProfit: 0,
      estimatedRevenue: 0,
    });
  }
  const total = map.get(key);
  total.trackedHours += hours;
  total.billableHours += billable ? hours : 0;
  total.revenue += revenue;
  total.cost += cost;
  total.grossProfit += grossProfit;
  if (estimated) total.estimatedRevenue += revenue;
}

function finishGroup(total) {
  return {
    ...total,
    trackedHours: round(total.trackedHours),
    billableHours: round(total.billableHours),
    revenue: round(total.revenue),
    cost: round(total.cost),
    grossProfit: round(total.grossProfit),
    estimatedRevenue: round(total.estimatedRevenue),
    margin: total.revenue ? round(total.grossProfit / total.revenue) : 0,
    utilization: total.trackedHours ? round(total.billableHours / total.trackedHours) : 0,
    effectiveRate: total.billableHours ? round(total.revenue / total.billableHours) : 0,
  };
}

function finishProject(total) {
  const group = finishGroup(total);
  const budgetUsed = total.budgetHours ? round(total.trackedHours / total.budgetHours) : 0;
  return {
    ...group,
    budgetUsed,
    overBudget: Boolean(total.budgetHours) && total.trackedHours > total.budgetHours,
    belowTarget: Boolean(total.targetMargin) && total.revenue > 0 && group.margin < total.targetMargin,
    marginGap: total.targetMargin ? round(group.margin - total.targetMargin) : 0,
  };
}

function sumRaw(totalsIterable) {
  return [...totalsIterable].reduce(
    (acc, t) => {
      acc.trackedHours += t.trackedHours;
      acc.billableHours += t.billableHours;
      acc.revenue += t.revenue;
      acc.cost += t.cost;
      acc.grossProfit += t.grossProfit;
      acc.estimatedRevenue += t.estimatedRevenue;
      return acc;
    },
    { trackedHours: 0, billableHours: 0, revenue: 0, cost: 0, grossProfit: 0, estimatedRevenue: 0 }
  );
}

function buildAlerts(projects) {
  return {
    belowTarget: projects.filter((p) => p.belowTarget).map((p) => ({
      key: p.key,
      label: `${p.client} · ${p.project}`,
      margin: p.margin,
      targetMargin: p.targetMargin,
    })),
    overBudget: projects.filter((p) => p.overBudget).map((p) => ({
      key: p.key,
      label: `${p.client} · ${p.project}`,
      trackedHours: p.trackedHours,
      budgetHours: p.budgetHours,
      budgetUsed: p.budgetUsed,
    })),
  };
}

export function formatMoney(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(value || 0);
  } catch {
    // Unknown/invalid currency code — fall back to a plain number with the code.
    return `${(value || 0).toFixed(2)} ${currency || ""}`.trim();
  }
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
  if (!raw) return "";
  // toISOString() renders in UTC and shifts the day for viewers east of UTC.
  // ClickUp day buckets are viewer-local, so render the local calendar date.
  const date = new Date(raw);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
