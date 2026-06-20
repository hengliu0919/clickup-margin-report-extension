import { buildMarginReport, parseRateTables } from "./src/margin.js";
import { loadSettings, saveSettings } from "./src/storage.js";
import { getClickUpTab, sendToClickUpTab } from "./src/clickup-tab.js";
import { ReportView } from "./src/report-view.js";
import { RatesView } from "./src/rates-view.js";
import { RANGE_PRESETS, resolveRange } from "./src/date-range.js";

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
const rangePreset = document.querySelector("#rangePreset");
const rangeStart = document.querySelector("#rangeStart");
const rangeEnd = document.querySelector("#rangeEnd");

let settings = await loadSettings();
let rawData = null; // cached ClickUp fetch: { entries, users, errors, coverage, range }
let lastFetchedAt = null;
let currentReport = null; // latest computed report (for the invoice handoff)

// Maps Settings-tab company input ids to the company setting keys.
const COMPANY_FIELDS = {
  "co-name": "name",
  "co-email": "email",
  "co-address": "address",
  "co-prefix": "invoicePrefix",
  "co-next": "nextInvoiceNumber",
  "co-terms": "paymentTerms",
  "co-notes": "notes",
};

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
tabs.report.addEventListener("generate-invoices", generateInvoices);
tabs.report.addEventListener("retry", () => runReport({ force: true }));

for (const btn of tabButtons) {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
}
refreshBtn.addEventListener("click", () => runReport({ force: true }));

setupRangePicker();
setupCompanyForm();
renderStorageSummary();
initConnection();
// Auto-run on load. runReport renders a loading placeholder, then either the
// report, an actionable empty state (no ClickUp tab), or an error with retry.
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

function currentRange() {
  const r = settings.range || { preset: "this-month" };
  return resolveRange(r.preset, { customStart: r.customStart, customEnd: r.customEnd });
}

async function fetchClickUpData() {
  const tab = await getClickUpTab({ preferActive: true });
  if (!tab) throw new Error("Open a ClickUp workspace tab first.");
  const range = currentRange();
  const data = await sendToClickUpTab(
    tab.id,
    "GET_MARGIN_DATA",
    { startMs: range.startMs, endMs: range.endMs, lookbackDays: settings.lookbackDays },
    { onStatus: (m) => setGlobalStatus(m) }
  );
  return data;
}

async function runReport({ force = false, silentIfNoTab = false } = {}) {
  refreshBtn.disabled = true;
  setGlobalStatus("");
  // Only show the loading placeholder when we have nothing to display yet, so a
  // refresh of an existing report doesn't blank the screen.
  if (!currentReport) reportView.renderState("loading", "Reading time data from your ClickUp tab…");
  try {
    settings = await loadSettings();
    ratesView.setSettings(settings);
    rawData = await fetchClickUpData();
    lastFetchedAt = Date.now();
    initConnection();
    recomputeReport();
  } catch (error) {
    const noTab = /Open a ClickUp/i.test(error.message);
    if (silentIfNoTab && noTab && !currentReport) {
      reportView.renderState("empty", "Open an app.clickup.com tab, then load your time data.", {
        actionLabel: "Load data",
        actionEvent: "retry",
      });
    } else if (!currentReport) {
      reportView.renderState("error", error.message || "Failed to load report.", {
        actionLabel: "Try again",
        actionEvent: "retry",
      });
    } else {
      // Keep the existing report visible; just surface the error inline.
      setGlobalStatus(error.message || "Failed to refresh", "error");
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
  const report = buildMarginReport({ entries: rawData.entries, tasksById, peopleRates, projectRates, workspaceId: rawData.workspaceId });
  report.apiErrors = rawData.errors || [];
  report.coverage = rawData.coverage || null;
  report.range = rawData.range || null;
  currentReport = report;

  const meta = { range: rawData.range, timestamp: relativeTime(lastFetchedAt) };
  reportView.setMeta(meta);
  reportView.render(report, meta);
}

// Hand the current report + company details to the invoice page and open it.
function generateInvoices() {
  if (!currentReport) return;
  const payload = {
    report: {
      projects: currentReport.projects,
      currency: currentReport.currency,
      range: currentReport.range,
      workspaceId: currentReport.workspaceId,
    },
    company: settings.company,
  };
  // localStorage (not sessionStorage) so the new invoice tab — a separate
  // browsing context — can read the handoff across tabs of the same origin.
  localStorage.setItem("clickup-margin-invoice-data", JSON.stringify(payload));
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    chrome.tabs.create({ url: "invoice.html" });
  } else {
    window.open("invoice.html", "_blank");
  }
}

function renderStorageSummary() {
  const p = (settings.peopleRates || []).length;
  const pr = (settings.projectRates || []).length;
  storageSummary.textContent = `People rates: ${p} rows · Project rates: ${pr} rows · Stored in this browser`;
}

function setupRangePicker() {
  rangePreset.innerHTML = RANGE_PRESETS.map(
    (r) => `<option value="${r.id}">${r.label}</option>`
  ).join("");
  const r = settings.range || { preset: "this-month" };
  rangePreset.value = r.preset;
  rangeStart.value = r.customStart || "";
  rangeEnd.value = r.customEnd || "";
  toggleCustomDates();

  rangePreset.addEventListener("change", async () => {
    settings = await saveSettings({ ...settings, range: { ...settings.range, preset: rangePreset.value } });
    toggleCustomDates();
    // Re-fetch for a new range (custom waits until both dates are set).
    if (rangePreset.value !== "custom") runReport({ force: true });
  });

  for (const el of [rangeStart, rangeEnd]) {
    el.addEventListener("change", async () => {
      settings = await saveSettings({
        ...settings,
        range: { preset: "custom", customStart: rangeStart.value, customEnd: rangeEnd.value },
      });
      if (rangeStart.value && rangeEnd.value) runReport({ force: true });
    });
  }
}

function toggleCustomDates() {
  const isCustom = rangePreset.value === "custom";
  rangeStart.classList.toggle("hidden", !isCustom);
  rangeEnd.classList.toggle("hidden", !isCustom);
}

function setupCompanyForm() {
  const company = settings.company || {};
  for (const [id, key] of Object.entries(COMPANY_FIELDS)) {
    const el = document.getElementById(id);
    if (el) el.value = company[key] ?? "";
  }
  const status = document.querySelector("#companySaveStatus");
  for (const id of Object.keys(COMPANY_FIELDS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("change", async () => {
      const next = { ...(settings.company || {}) };
      for (const [fid, key] of Object.entries(COMPANY_FIELDS)) {
        next[key] = document.getElementById(fid)?.value ?? "";
      }
      settings = await saveSettings({ ...settings, company: next });
      if (status) {
        status.className = "status-text status-success";
        status.textContent = "Saved";
      }
    });
  }
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
