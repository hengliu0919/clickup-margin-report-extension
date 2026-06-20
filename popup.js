import { buildMarginReport, formatMoney, formatPercent, parseRateTables } from "./src/margin.js";
import { loadSettings, openOptionsPage } from "./src/storage.js";
import { getClickUpTab, sendToClickUpTab } from "./src/clickup-tab.js";

const elements = {
  openOptions: document.querySelector("#openOptions"),
  runReport: document.querySelector("#runReport"),
  viewReport: document.querySelector("#viewReport"),
  rangeLabel: document.querySelector("#rangeLabel"),
  notClickUpAlert: document.querySelector("#notClickUpAlert"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  quickMetrics: document.querySelector("#quickMetrics"),
  warningBadge: document.querySelector("#warningBadge"),
  warningBadgeText: document.querySelector("#warningBadgeText"),
  revenue: document.querySelector("#revenue"),
  margin: document.querySelector("#margin"),
};

let settings = await loadSettings();
renderInitialState();

elements.openOptions.addEventListener("click", openOptionsPage);
elements.runReport.addEventListener("click", runReport);
elements.viewReport.addEventListener("click", viewReport);

function renderInitialState() {
  elements.rangeLabel.textContent = `${settings.lookbackDays || 14}-day lookback`;
  if (typeof chrome === "undefined" || !chrome.tabs) return;
  getClickUpTab({ preferActive: true }).then((tab) => {
    renderTabState(Boolean(tab));
  });
}

async function runReport() {
  elements.runReport.disabled = true;
  elements.runReport.textContent = "Running...";

  try {
    settings = await loadSettings();
    const tab = await getClickUpTab({ preferActive: true });
    if (!tab) {
      setStatus("Open ClickUp workspace", "error");
      return;
    }

    setStatus("Loading...", "active");
    const data = await sendToClickUpTab(tab.id, "GET_MARGIN_DATA", {
      lookbackDays: settings.lookbackDays,
    }, { onStatus: (m) => setStatus(m, "active") });

    setStatus("Calculating...", "active");
    const tasksById = new Map(
      data.entries.map((entry) => [entry.task?.id, entry.task]).filter(([taskId]) => taskId)
    );
    const { peopleRates, projectRates, rateOverrides } = parseRateTables(settings);
    const report = buildMarginReport({ entries: data.entries, tasksById, peopleRates, projectRates, rateOverrides, workspaceId: data.workspaceId });
    report.apiErrors = data.errors || [];

    // Quick glance only — the full report lives in the dashboard, which re-fetches.
    displayQuickSummary(report);
    setStatus("Report ready", "success");
  } catch (error) {
    const friendly = friendlyError(error);
    setStatus(friendly.message, friendly.type);
  } finally {
    const tab = await getClickUpTab({ preferActive: true });
    elements.runReport.disabled = !tab;
    elements.runReport.textContent = "Run Report";
  }
}

function displayQuickSummary(report) {
  const currency = report.currency || "USD";
  elements.revenue.textContent = formatMoney(report.totals.revenue, currency);
  elements.margin.textContent = formatPercent(report.totals.margin);
  elements.quickMetrics.classList.remove("hidden");
  elements.viewReport.classList.remove("hidden");

  // Show warnings if any
  const warningCount =
    report.missing.peopleRates.length +
    report.missing.projectRates.length +
    report.missing.taskLocation.length +
    (report.apiErrors?.length || 0) +
    (report.alerts?.belowTarget?.length || 0) +
    (report.alerts?.overBudget?.length || 0);

  if (warningCount > 0) {
    elements.warningBadgeText.textContent = `${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`;
    elements.warningBadge.classList.remove("hidden");
  } else {
    elements.warningBadge.classList.add("hidden");
  }
}

function viewReport() {
  chrome.tabs.create({ url: "dashboard.html" });
}

function setStatus(message, type = "") {
  elements.statusText.textContent = message;
  elements.statusDot.className = "popup-status-dot";
  if (type === "error") elements.statusDot.classList.add("error");
  else if (type === "success") elements.statusDot.className = "popup-status-dot";
  else if (type === "active") elements.statusDot.className = "popup-status-dot";
  else if (type === "warning") elements.statusDot.classList.add("inactive");
  else elements.statusDot.classList.add("inactive");
}

function renderTabState(isClickUpTab) {
  elements.runReport.disabled = !isClickUpTab;
  elements.notClickUpAlert.classList.toggle("hidden", isClickUpTab);
  if (isClickUpTab) {
    setStatus("Connected to ClickUp", "success");
  } else {
    setStatus("Not connected", "error");
  }
}

function friendlyError(error) {
  const message = error?.message || "";
  if (/Reload ClickUp|Could not read data|Could not read ClickUp/i.test(message)) {
    return {
      type: "warning",
      message: "Reload ClickUp tab",
    };
  }
  return {
    type: "error",
    message: message || "Report failed",
  };
}
