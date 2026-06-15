import { ClickUpClient } from "./src/clickup.js";
import { downloadCsv, toCsv } from "./src/csv.js";
import { buildMarginReport, formatMoney, formatPercent, parseRateTables } from "./src/margin.js";
import { loadSettings, openOptionsPage } from "./src/storage.js";

const elements = {
  setupPanel: document.querySelector("#setupPanel"),
  setupButton: document.querySelector("#setupButton"),
  openOptions: document.querySelector("#openOptions"),
  runReport: document.querySelector("#runReport"),
  exportCsv: document.querySelector("#exportCsv"),
  status: document.querySelector("#status"),
  rangeLabel: document.querySelector("#rangeLabel"),
  summaryPanel: document.querySelector("#summaryPanel"),
  warningsPanel: document.querySelector("#warningsPanel"),
  warnings: document.querySelector("#warnings"),
  projectsPanel: document.querySelector("#projectsPanel"),
  projectRows: document.querySelector("#projectRows"),
  revenue: document.querySelector("#revenue"),
  cost: document.querySelector("#cost"),
  profit: document.querySelector("#profit"),
  margin: document.querySelector("#margin"),
};

let latestReport = null;
let settings = await loadSettings();
renderInitialState();

elements.openOptions.addEventListener("click", openOptionsPage);
elements.setupButton.addEventListener("click", openOptionsPage);
elements.runReport.addEventListener("click", runReport);
elements.exportCsv.addEventListener("click", exportEntries);

function renderInitialState() {
  const hasMinimumSettings = Boolean(settings.clickupToken && settings.workspaceId);
  elements.setupPanel.classList.toggle("hidden", hasMinimumSettings);
  elements.rangeLabel.textContent = `${settings.lookbackDays || 14}-day lookback`;
}

async function runReport() {
  setStatus("Loading ClickUp data...");
  elements.runReport.disabled = true;
  elements.exportCsv.disabled = true;

  try {
    settings = await loadSettings();
    if (!settings.clickupToken || !settings.workspaceId) {
      elements.setupPanel.classList.remove("hidden");
      throw new Error("Missing ClickUp token or workspace ID.");
    }

    const client = new ClickUpClient(settings.clickupToken);
    const { startDate, endDate } = dateRange(settings.lookbackDays);
    const members = await client.getWorkspaceMembers(settings.workspaceId);
    setStatus(`Loading time entries for ${members.length} members...`);
    const { entries, errors } = await client.getAllMemberTimeEntries({
      workspaceId: settings.workspaceId,
      members,
      startDate,
      endDate,
    });

    setStatus(`Hydrating ${entries.length} entries...`);
    const tasksById = await client.hydrateTasksForEntries(entries);
    const { peopleRates, projectRates } = parseRateTables(settings);
    latestReport = buildMarginReport({ entries, tasksById, peopleRates, projectRates });

    renderReport(latestReport, errors);
    setStatus(`Loaded ${entries.length} time entries from ${members.length} members.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.runReport.disabled = false;
    elements.exportCsv.disabled = !latestReport?.entries?.length;
  }
}

function renderReport(report, apiErrors) {
  elements.summaryPanel.classList.remove("hidden");
  elements.projectsPanel.classList.remove("hidden");

  elements.revenue.textContent = formatMoney(report.totals.revenue);
  elements.cost.textContent = formatMoney(report.totals.cost);
  elements.profit.textContent = formatMoney(report.totals.grossProfit);
  elements.margin.textContent = formatPercent(report.totals.margin);

  elements.projectRows.innerHTML = report.projects.length
    ? report.projects.map(renderProjectRow).join("")
    : `<tr><td colspan="7" class="empty">No time entries found in this range.</td></tr>`;

  renderWarnings(report, apiErrors);
}

function renderProjectRow(project) {
  return `<tr>
    <td>${escapeHtml(project.client)}</td>
    <td>${escapeHtml(project.project)}</td>
    <td>${project.trackedHours}</td>
    <td>${formatMoney(project.revenue)}</td>
    <td>${formatMoney(project.cost)}</td>
    <td>${formatPercent(project.margin)}</td>
    <td>${project.budgetHours ? formatPercent(project.budgetUsed) : "n/a"}</td>
  </tr>`;
}

function renderWarnings(report, apiErrors) {
  const warningRows = [
    ...report.missing.peopleRates.map((item) => `Missing people rate: ${item.label} (${item.id})`),
    ...report.missing.projectRates.map((item) => `Missing project mapping/rate: ${item.label} (${item.id})`),
    ...report.missing.taskLocation.map((item) => `Missing task location: ${item.label} (${item.id})`),
    ...apiErrors.map((item) => `Could not fetch assignee ${item.assigneeId}: ${item.error.message}`),
  ];

  elements.warningsPanel.classList.toggle("hidden", warningRows.length === 0);
  elements.warnings.innerHTML = warningRows.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
}

function exportEntries() {
  if (!latestReport?.entries?.length) return;
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`clickup-margin-report-${stamp}.csv`, toCsv(latestReport.entries));
}

function setStatus(message, type = "") {
  elements.status.className = type ? `status ${type}` : "status";
  elements.status.textContent = message;
}

function dateRange(lookbackDays) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - Number(lookbackDays || 14));
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

