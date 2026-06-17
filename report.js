import { downloadCsv, toCsv } from "./src/csv.js";
import { buildMarginReport, formatMoney, formatPercent, parseRateTables } from "./src/margin.js";
import { loadSettings } from "./src/storage.js";

const elements = {
  loadingState: document.querySelector("#loadingState"),
  errorState: document.querySelector("#errorState"),
  errorMessage: document.querySelector("#errorMessage"),
  reportContent: document.querySelector("#reportContent"),
  warningsSection: document.querySelector("#warningsSection"),
  warningCount: document.querySelector("#warningCount"),
  warningList: document.querySelector("#warningList"),
  timestamp: document.querySelector("#timestamp"),
  rangeLabel: document.querySelector("#rangeLabel"),
  projectCount: document.querySelector("#projectCount"),
  refreshReport: document.querySelector("#refreshReport"),
  exportCsv: document.querySelector("#exportCsv"),
  projectRows: document.querySelector("#projectRows"),
  revenue: document.querySelector("#revenue"),
  cost: document.querySelector("#cost"),
  profit: document.querySelector("#profit"),
  margin: document.querySelector("#margin"),
};

let currentReport = null;

elements.refreshReport.addEventListener("click", runReport);
elements.exportCsv.addEventListener("click", exportEntries);

// Load report on page load
loadReport();

async function loadReport() {
  try {
    // Check if we have cached report data from popup
    const cached = sessionStorage.getItem("clickup-margin-report-data");
    if (cached) {
      const data = JSON.parse(cached);
      displayReport(data.report, data.timestamp);
      sessionStorage.removeItem("clickup-margin-report-data");
      return;
    }

    // Otherwise run fresh report
    await runReport();
  } catch (error) {
    showError(error.message || "Failed to load report");
  }
}

async function runReport() {
  elements.loadingState.classList.remove("hidden");
  elements.errorState.classList.add("hidden");
  elements.reportContent.classList.add("hidden");
  elements.refreshReport.disabled = true;

  try {
    const settings = await loadSettings();
    elements.rangeLabel.textContent = `${settings.lookbackDays || 14}-day lookback`;

    const tab = await getActiveClickUpTab();
    if (!tab) {
      throw new Error("Open ClickUp workspace to run report");
    }

    const data = await sendToClickUpTab(tab.id, "GET_MARGIN_DATA", {
      lookbackDays: settings.lookbackDays,
    });

    const tasksById = new Map(
      data.entries.map((entry) => [entry.task?.id, entry.task]).filter(([taskId]) => taskId)
    );
    const { peopleRates, projectRates } = parseRateTables(settings);
    const report = buildMarginReport({ entries: data.entries, tasksById, peopleRates, projectRates });

    report.apiErrors = data.errors || [];
    displayReport(report, Date.now());
  } catch (error) {
    showError(error.message || "Failed to generate report");
  } finally {
    elements.refreshReport.disabled = false;
  }
}

function displayReport(report, timestamp) {
  currentReport = report;

  elements.loadingState.classList.add("hidden");
  elements.errorState.classList.add("hidden");
  elements.reportContent.classList.remove("hidden");

  // Update timestamp
  const elapsed = Math.floor((Date.now() - timestamp) / 1000);
  if (elapsed < 60) {
    elements.timestamp.textContent = "just now";
  } else if (elapsed < 3600) {
    elements.timestamp.textContent = `${Math.floor(elapsed / 60)} min ago`;
  } else {
    elements.timestamp.textContent = new Date(timestamp).toLocaleTimeString();
  }

  // Update metrics
  elements.revenue.textContent = formatMoney(report.totals.revenue);
  elements.cost.textContent = formatMoney(report.totals.cost);
  elements.profit.textContent = formatMoney(report.totals.grossProfit);
  elements.margin.textContent = formatPercent(report.totals.margin);

  // Update project count
  elements.projectCount.textContent = `${report.projects.length} project${report.projects.length === 1 ? "" : "s"}`;

  // Render project table
  if (report.projects.length === 0) {
    elements.projectRows.innerHTML = `<tr>
      <td colspan="8" class="table-empty">
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-title">No time entries found</div>
          <div class="empty-state-description">Try increasing the lookback days in settings</div>
        </div>
      </td>
    </tr>`;
  } else {
    elements.projectRows.innerHTML = report.projects.map(renderProjectRow).join("");
  }

  // Render warnings
  renderWarnings(report);

  // Enable export
  elements.exportCsv.disabled = !report.entries?.length;
}

function renderProjectRow(project) {
  return `<tr>
    <td>${escapeHtml(project.client)}</td>
    <td>${escapeHtml(project.project)}</td>
    <td>${project.trackedHours}</td>
    <td>${formatMoney(project.revenue)}</td>
    <td>${formatMoney(project.cost)}</td>
    <td>${formatMoney(project.grossProfit)}</td>
    <td>${formatPercent(project.margin)}</td>
    <td>${project.budgetHours ? formatPercent(project.budgetUsed) : "—"}</td>
  </tr>`;
}

function renderWarnings(report) {
  const warnings = [
    ...report.missing.peopleRates.map((item) => `Missing people rate: ${item.label} (${item.id})`),
    ...report.missing.projectRates.map((item) => `Missing project mapping/rate: ${item.label} (${item.id})`),
    ...report.missing.taskLocation.map((item) => `Missing task location: ${item.label} (${item.id})`),
    ...(report.apiErrors || []).map(
      (item) =>
        `Could not fetch assignee ${item.assigneeId}: ${item.message || item.error?.message || "Unknown error"}`
    ),
  ];

  if (warnings.length === 0) {
    elements.warningsSection.classList.add("hidden");
    return;
  }

  elements.warningsSection.classList.remove("hidden");
  elements.warningCount.textContent = warnings.length;
  elements.warningList.innerHTML = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
}

function showError(message) {
  elements.loadingState.classList.add("hidden");
  elements.reportContent.classList.add("hidden");
  elements.errorState.classList.remove("hidden");
  elements.errorMessage.textContent = message;
}

function exportEntries() {
  if (!currentReport?.entries?.length) return;
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`clickup-margin-report-${stamp}.csv`, toCsv(currentReport.entries));
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
  const tabs = await chrome.tabs.query({ url: "https://app.clickup.com/*" });
  return tabs[0] || null;
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
