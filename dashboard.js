import { buildMarginReport, parseRateTables } from "./src/margin.js";
import { loadSettings } from "./src/storage.js";
import { getClickUpTab, sendToClickUpTab } from "./src/clickup-tab.js";
import { ReportView } from "./src/report-view.js";
import { RatesView } from "./src/rates-view.js";

const tabs = {
  report: document.querySelector("#tab-report"),
  rates: document.querySelector("#tab-rates"),
  settings: document.querySelector("#tab-settings"),
};
const tabButtons = [...document.querySelectorAll(".dash-tabs .tab")];
const connStatus = document.querySelector("#connStatus");
const globalStatus = document.querySelector("#globalStatus");
const refreshBtn = document.querySelector("#refreshBtn");
const storageSummary = document.querySelector("#storageSummary");

let settings = await loadSettings();
let rawData = null; // cached ClickUp fetch: { entries, users, errors, coverage, range }
let lastFetchedAt = null;

const reportView = new ReportView(tabs.report);
const ratesView = new RatesView(tabs.rates, {
  settings,
  importFromClickUp: fetchClickUpData,
  onChange: (next) => {
    // A rate edit doesn't need a new ClickUp fetch — recompute from cache.
    settings = next;
    renderStorageSummary();
    recomputeReport();
  },
  onStatus: (m, type) => setGlobalStatus(m, type),
});

// Deep-link from a report warning ("fix in Rates") to the Rates tab.
tabs.report.addEventListener("goto-tab", (e) => switchTab(e.detail));

for (const btn of tabButtons) {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
}
refreshBtn.addEventListener("click", () => runReport({ force: true }));

renderStorageSummary();
reportView.render(null);
initConnection();
// Auto-run on load if a ClickUp tab is available; otherwise the Report tab shows
// the empty state and the connection line nudges the user.
runReport({ silentIfNoTab: true });

function switchTab(name) {
  for (const [key, el] of Object.entries(tabs)) el.classList.toggle("hidden", key !== name);
  for (const btn of tabButtons) {
    const selected = btn.dataset.tab === name;
    btn.classList.toggle("tab-active", selected);
    btn.setAttribute("aria-selected", String(selected));
  }
}

async function initConnection() {
  const tab = await getClickUpTab({ preferActive: true });
  if (tab) {
    connStatus.textContent = "Connected to ClickUp";
    connStatus.className = "status-text status-success";
  } else {
    connStatus.textContent = "Open an app.clickup.com tab to load data";
    connStatus.className = "status-text status-error";
  }
}

async function fetchClickUpData() {
  const tab = await getClickUpTab({ preferActive: true });
  if (!tab) throw new Error("Open a ClickUp workspace tab first.");
  const data = await sendToClickUpTab(
    tab.id,
    "GET_MARGIN_DATA",
    { lookbackDays: settings.lookbackDays },
    { onStatus: (m) => setGlobalStatus(m) }
  );
  return data;
}

async function runReport({ force = false, silentIfNoTab = false } = {}) {
  refreshBtn.disabled = true;
  setGlobalStatus("Loading ClickUp data…");
  try {
    settings = await loadSettings();
    ratesView.setSettings(settings);
    rawData = await fetchClickUpData();
    lastFetchedAt = Date.now();
    setGlobalStatus("");
    initConnection();
    recomputeReport();
  } catch (error) {
    if (silentIfNoTab && /Open a ClickUp/i.test(error.message)) {
      setGlobalStatus("");
      reportView.render(null);
    } else {
      setGlobalStatus(error.message || "Failed to load report", "error");
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

// Recompute the margin report from the cached raw ClickUp data + current rates.
// This is the fast path: edit a rate, see the margin change with no network call.
function recomputeReport() {
  if (!rawData) {
    reportView.render(null);
    return;
  }
  const tasksById = new Map(
    rawData.entries.map((entry) => [entry.task?.id, entry.task]).filter(([taskId]) => taskId)
  );
  const { peopleRates, projectRates } = parseRateTables(settings);
  const report = buildMarginReport({ entries: rawData.entries, tasksById, peopleRates, projectRates });
  report.apiErrors = rawData.errors || [];
  report.coverage = rawData.coverage || null;
  report.range = rawData.range || null;

  const meta = { range: rawData.range, timestamp: relativeTime(lastFetchedAt) };
  reportView.setMeta(meta);
  reportView.render(report, meta);
}

function renderStorageSummary() {
  const p = (settings.peopleRates || []).length;
  const pr = (settings.projectRates || []).length;
  storageSummary.textContent = `People rates: ${p} rows · Project rates: ${pr} rows · Stored in this browser`;
}

function relativeTime(ts) {
  if (!ts) return "";
  const elapsed = Math.floor((Date.now() - ts) / 1000);
  if (elapsed < 60) return "just now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} min ago`;
  return new Date(ts).toLocaleTimeString();
}

function setGlobalStatus(message, type = "") {
  globalStatus.className = type ? `status-text status-${type}` : "status-text";
  globalStatus.textContent = message || "";
}
