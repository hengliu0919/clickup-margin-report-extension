import { downloadCsv, toCsv } from "./src/csv.js";
import { buildMarginReport, formatMoney, formatPercent, parseRateTables } from "./src/margin.js";
import { loadSettings, openOptionsPage } from "./src/storage.js";

const elements = {
  setupPanel: document.querySelector("#setupPanel"),
  setupButton: document.querySelector("#setupButton"),
  openClickUp: document.querySelector("#openClickUp"),
  reportPanel: document.querySelector("#reportPanel"),
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
elements.openClickUp.addEventListener("click", openClickUp);
elements.setupButton.addEventListener("click", openOptionsPage);
elements.runReport.addEventListener("click", runReport);
elements.exportCsv.addEventListener("click", exportEntries);

function renderInitialState() {
  elements.rangeLabel.textContent = `${settings.lookbackDays || 14}-day lookback`;
  if (typeof chrome === "undefined" || !chrome.tabs) return;
  getActiveClickUpTab().then((tab) => {
    renderTabState(Boolean(tab));
  });
}

async function runReport() {
  clearStatus();
  elements.runReport.disabled = true;
  elements.exportCsv.disabled = true;

  try {
    settings = await loadSettings();
    const tab = await getActiveClickUpTab();
    if (!tab) {
      renderTabState(false);
      setStatus("Open an app.clickup.com workspace tab first, then open this extension again.", "info");
      return;
    }

    renderTabState(true);
    setStatus("Loading ClickUp data...");
    setStatus("Asking the ClickUp tab for session data...");
    const data = await sendToClickUpTab(tab.id, "GET_MARGIN_DATA", {
      lookbackDays: settings.lookbackDays,
    });

    setStatus(`Calculating ${data.entries.length} time rows from ${data.users.length} members...`);
    const tasksById = new Map(data.entries.map((entry) => [entry.task?.id, entry.task]).filter(([taskId]) => taskId));
    const { peopleRates, projectRates } = parseRateTables(settings);
    latestReport = buildMarginReport({ entries: data.entries, tasksById, peopleRates, projectRates });

    renderReport(latestReport, data.errors || []);
    setStatus(`Loaded ${data.entries.length} time rows from workspace ${data.workspaceId}.`, "success");
  } catch (error) {
    const friendly = friendlyError(error);
    setStatus(friendly.message, friendly.type);
  } finally {
    const tab = await getActiveClickUpTab();
    renderTabState(Boolean(tab));
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
    ...apiErrors.map((item) => `Could not fetch assignee ${item.assigneeId}: ${item.message || item.error?.message || "Unknown error"}`),
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

function clearStatus() {
  setStatus("");
}

function renderTabState(isClickUpTab) {
  elements.setupPanel.classList.toggle("hidden", isClickUpTab);
  elements.reportPanel.classList.toggle("hidden", !isClickUpTab);
  elements.runReport.disabled = !isClickUpTab;
  if (!isClickUpTab) elements.exportCsv.disabled = true;
}

function openClickUp() {
  const url = "https://app.clickup.com/";
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener");
}

function friendlyError(error) {
  const message = error?.message || "";
  if (/Reload ClickUp|Could not read data|Could not read ClickUp/i.test(message)) {
    return {
      type: "warning",
      message: "Could not read the ClickUp tab. Reload ClickUp, then run the report again.",
    };
  }
  return {
    type: "error",
    message: message || "Something went wrong while building the report.",
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getActiveClickUpTab() {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith("https://app.clickup.com/") ? tab : null;
}

async function sendToClickUpTab(tabId, type, payload = {}) {
  const message = {
    target: "clickup-margin-report-content",
    type,
    payload,
  };

  let response;
  try {
    response = await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isMissingReceiverError(error)) throw error;
    setStatus("Connecting to the ClickUp tab...");
    await injectContentScript(tabId);
    response = await chrome.tabs.sendMessage(tabId, message);
  }

  if (!response?.ok) {
    throw new Error(response?.error || "Could not read data from the ClickUp tab.");
  }

  return response.result;
}

async function injectContentScript(tabId) {
  if (!chrome.scripting?.executeScript) {
    throw new Error("Reload the ClickUp tab once, then try again.");
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"],
  });
}

function isMissingReceiverError(error) {
  return /Receiving end does not exist|Could not establish connection/i.test(error?.message || "");
}
