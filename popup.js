import { buildMarginReport, formatMoney, formatPercent, parseRateTables } from "./src/margin.js";
import { loadSettings, openOptionsPage } from "./src/storage.js";

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
  warningCount: document.querySelector("#warningCount"),
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
  getActiveClickUpTab().then((tab) => {
    renderTabState(Boolean(tab));
  });
}

async function runReport() {
  elements.runReport.disabled = true;
  elements.runReport.textContent = "Running...";

  try {
    settings = await loadSettings();
    const tab = await getActiveClickUpTab();
    if (!tab) {
      setStatus("Open ClickUp workspace", "error");
      return;
    }

    setStatus("Loading...", "active");
    const data = await sendToClickUpTab(tab.id, "GET_MARGIN_DATA", {
      lookbackDays: settings.lookbackDays,
    });

    setStatus("Calculating...", "active");
    const tasksById = new Map(data.entries.map((entry) => [entry.task?.id, entry.task]).filter(([taskId]) => taskId));
    const { peopleRates, projectRates } = parseRateTables(settings);
    const report = buildMarginReport({ entries: data.entries, tasksById, peopleRates, projectRates });

    // Store report in sessionStorage for report page
    report.apiErrors = data.errors || [];
    sessionStorage.setItem(
      "clickup-margin-report-data",
      JSON.stringify({ report, timestamp: Date.now() })
    );

    // Show quick summary
    displayQuickSummary(report);
    setStatus("Report ready", "success");
  } catch (error) {
    const friendly = friendlyError(error);
    setStatus(friendly.message, friendly.type);
  } finally {
    const tab = await getActiveClickUpTab();
    elements.runReport.disabled = !tab;
    elements.runReport.textContent = "Run Report";
  }
}

function displayQuickSummary(report) {
  elements.revenue.textContent = formatMoney(report.totals.revenue);
  elements.margin.textContent = formatPercent(report.totals.margin);
  elements.quickMetrics.classList.remove("hidden");
  elements.viewReport.classList.remove("hidden");

  // Show warnings if any
  const warningCount =
    report.missing.peopleRates.length +
    report.missing.projectRates.length +
    report.missing.taskLocation.length +
    (report.apiErrors?.length || 0);

  if (warningCount > 0) {
    elements.warningCount.textContent = warningCount;
    elements.warningBadge.classList.remove("hidden");
  } else {
    elements.warningBadge.classList.add("hidden");
  }
}

function viewReport() {
  chrome.tabs.create({ url: "report.html" });
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
    setStatus("Connecting...");
    await injectContentScript(tabId);
    response = await chrome.tabs.sendMessage(tabId, message);
  }

  if (!response?.ok) {
    throw new Error(response?.error || "Could not read ClickUp data");
  }

  return response.result;
}

async function injectContentScript(tabId) {
  if (!chrome.scripting?.executeScript) {
    throw new Error("Reload ClickUp tab");
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"],
  });
}

function isMissingReceiverError(error) {
  return /Receiving end does not exist|Could not establish connection/i.test(error?.message || "");
}
