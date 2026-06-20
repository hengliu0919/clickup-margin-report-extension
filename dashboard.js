import { buildMarginReport, parseRateTables, formatMoney } from "./src/margin.js";
import {
  loadSettings, saveSettings,
  loadInvoices, recordInvoices, setInvoicePaid, deleteInvoice, invoicedEntryIds,
} from "./src/storage.js";
import { getClickUpTab, sendToClickUpTab, ensureBridgeReady } from "./src/clickup-tab.js";
import { ReportView } from "./src/report-view.js";
import { RatesView } from "./src/rates-view.js";
import { RANGE_PRESETS, resolveRange } from "./src/date-range.js";
import { buildInvoices, invoiceNumber, dueDate } from "./src/invoice.js";
import { escapeHtml } from "./src/dom.js";

const tabs = {
  report: document.querySelector("#tab-report"),
  rates: document.querySelector("#tab-rates"),
  invoices: document.querySelector("#tab-invoices"),
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
const excludeInvoiced = document.querySelector("#excludeInvoiced");

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
// Toggling exclude-invoiced recomputes from cache (no re-fetch needed).
excludeInvoiced.addEventListener("change", () => recomputeReport());
// Invoices tab actions (mark paid / delete / open).
tabs.invoices.addEventListener("click", onInvoicesClick);

setupRangePicker();
setupCompanyForm();
renderStorageSummary();
renderInvoicesTab();
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
  // Complete the bridge handshake with fast pings first, so the heavy data
  // request doesn't race a not-yet-ready bridge and stall on its long timeout.
  await ensureBridgeReady(tab.id, { onStatus: (m) => setGlobalStatus(m) });
  const range = currentRange();
  const data = await sendToClickUpTab(
    tab.id,
    "GET_MARGIN_DATA",
    { startMs: range.startMs, endMs: range.endMs, lookbackDays: settings.lookbackDays },
    { onStatus: (m) => setGlobalStatus(m) }
  );
  return data;
}

// The content-script <-> page-bridge MessagePort handshake takes a moment after
// a fresh injection, so the very first request can fail transiently. Auto-retry
// a few times (keeping the loading state) before surfacing an error, so first
// load is seamless. "No ClickUp tab" is NOT transient — that needs user action.
const MAX_AUTO_RETRIES = 3;

function isTransientError(message = "") {
  return /Timed out|Could not read|page bridge|Receiving end does not exist|Could not establish connection|Could not connect/i.test(message);
}

async function runReport({ force = false, silentIfNoTab = false, attempt = 0 } = {}) {
  refreshBtn.disabled = true;
  setGlobalStatus("");
  // Only show the loading placeholder when we have nothing to display yet, so a
  // refresh of an existing report doesn't blank the screen.
  if (!currentReport) {
    reportView.renderState("loading", attempt > 0 ? "Connecting to ClickUp…" : "Reading time data from your ClickUp tab…");
  }
  try {
    settings = await loadSettings();
    ratesView.setSettings(settings);
    rawData = await fetchClickUpData();
    lastFetchedAt = Date.now();
    initConnection();
    recomputeReport();
  } catch (error) {
    const message = error?.message || "";
    const noTab = /Open a ClickUp/i.test(message);

    // Transient first-load failure: wait briefly and retry without alarming the user.
    if (!noTab && isTransientError(message) && attempt < MAX_AUTO_RETRIES) {
      refreshBtn.disabled = false;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return runReport({ force, silentIfNoTab, attempt: attempt + 1 });
    }

    if (noTab && !currentReport) {
      reportView.renderState("empty", "Open an app.clickup.com tab, then load your time data.", {
        actionLabel: "Load data",
        actionEvent: "retry",
      });
    } else if (!currentReport) {
      reportView.renderState("error", message || "Failed to load report.", {
        actionLabel: "Try again",
        actionEvent: "retry",
      });
    } else {
      // Keep the existing report visible; just surface the error inline.
      setGlobalStatus(message || "Failed to refresh", "error");
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

// Recompute the margin report from the cached raw ClickUp data + current rates.
// This is the fast path: edit a rate, see the margin change with no network call.
async function recomputeReport() {
  if (!rawData) {
    reportView.render(null);
    return;
  }
  const tasksById = new Map(
    rawData.entries.map((entry) => [entry.task?.id, entry.task]).filter(([taskId]) => taskId)
  );
  const { peopleRates, projectRates, rateOverrides } = parseRateTables(settings);
  const excludeEntryIds = excludeInvoiced?.checked ? await invoicedEntryIds() : null;
  const report = buildMarginReport({ entries: rawData.entries, tasksById, peopleRates, projectRates, rateOverrides, workspaceId: rawData.workspaceId, excludeEntryIds });
  report.apiErrors = rawData.errors || [];
  report.coverage = rawData.coverage || null;
  report.range = rawData.range || null;
  currentReport = report;

  const meta = { range: rawData.range, timestamp: relativeTime(lastFetchedAt) };
  reportView.setMeta(meta);
  reportView.render(report, meta);
}

// Build invoices from the current report, record them in the ledger (assigning
// sequential numbers and bumping the company's next number), then hand the
// numbered invoices to the invoice page for display/print.
async function generateInvoices() {
  if (!currentReport) return;
  const invoices = buildInvoices(currentReport);
  if (!invoices.length) {
    setGlobalStatus("No billable work to invoice in this range.", "warning");
    return;
  }

  const company = settings.company || {};
  const issueDate = todayStamp();
  const numbered = invoices.map((inv, i) => ({
    ...inv,
    number: invoiceNumber(company, i),
    issueDate,
    dueDate: dueDate(issueDate, company.paymentTerms),
  }));

  // Persist to the ledger so this time can be excluded next period + tracked/paid.
  const records = numbered.map((inv) => ({
    number: inv.number,
    client: inv.client,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    total: inv.total,
    currency: inv.currency,
    entryIds: inv.entryIds,
    paid: false,
    createdAt: issueDate,
  }));
  await recordInvoices(records);

  // Advance the next invoice number so future runs don't collide.
  const nextNum = Number(company.nextInvoiceNumber) || 1001;
  settings = await saveSettings({ ...settings, company: { ...company, nextInvoiceNumber: String(nextNum + numbered.length) } });
  setupRangePicker(); // settings object replaced; keep references fresh
  await renderInvoicesTab();

  const payload = {
    invoices: numbered,
    company,
    currency: currentReport.currency,
    range: currentReport.range,
    workspaceId: currentReport.workspaceId,
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

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderStorageSummary() {
  const p = (settings.peopleRates || []).length;
  const pr = (settings.projectRates || []).length;
  storageSummary.textContent = `People rates: ${p} rows · Project rates: ${pr} rows · Stored in this browser`;
}

// --- Invoices tab -----------------------------------------------------------
async function renderInvoicesTab() {
  const list = (await loadInvoices()).slice().reverse(); // newest first
  if (!list.length) {
    tabs.invoices.innerHTML = `<div class="card"><div class="empty-state">
      <div class="empty-state-icon">🧾</div>
      <div class="empty-state-title">No invoices yet</div>
      <div class="empty-state-description">Generate invoices from the Report tab. They’ll be tracked here, and their hours can be excluded from future reports.</div>
    </div></div>`;
    return;
  }
  const outstanding = list.filter((i) => !i.paid).reduce((s, i) => s + i.total, 0);
  const currency = list[0].currency || "USD";
  const rows = list.map((inv) => `<tr class="${inv.paid ? "" : "row-flag"}">
    <td>${escapeHtml(inv.number)}</td>
    <td>${escapeHtml(inv.client)}</td>
    <td>${escapeHtml(inv.issueDate)}</td>
    <td>${escapeHtml(inv.dueDate || "—")}</td>
    <td>${formatMoney(inv.total, inv.currency)}</td>
    <td>${inv.paid ? `<span class="badge badge-success">Paid</span>` : `<span class="badge badge-warning">Unpaid</span>`}</td>
    <td>
      <button class="btn btn-secondary btn-sm" data-inv-action="toggle-paid" data-number="${escapeHtml(inv.number)}">${inv.paid ? "Mark unpaid" : "Mark paid"}</button>
      <button class="btn btn-danger btn-sm" data-inv-action="delete" data-number="${escapeHtml(inv.number)}">Delete</button>
    </td>
  </tr>`).join("");

  tabs.invoices.innerHTML = `<div class="card">
    <div class="section-heading">
      <div class="section-heading-content">
        <h2>Invoice history</h2>
        <p>${list.length} invoice${list.length === 1 ? "" : "s"} · ${formatMoney(outstanding, currency)} outstanding</p>
      </div>
    </div>
    <div class="table-container"><div class="table-scroll"><table>
      <thead><tr><th>Number</th><th>Client</th><th>Issued</th><th>Due</th><th>Total</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>
    <p class="status-text mt-3">Deleting an invoice also un-marks its hours as invoiced, so they reappear in reports.</p>
  </div>`;
}

async function onInvoicesClick(e) {
  const btn = e.target.closest("[data-inv-action]");
  if (!btn) return;
  const number = btn.dataset.number;
  if (btn.dataset.invAction === "toggle-paid") {
    const list = await loadInvoices();
    const inv = list.find((i) => i.number === number);
    await setInvoicePaid(number, !inv?.paid);
  } else if (btn.dataset.invAction === "delete") {
    if (typeof confirm === "function" && !confirm(`Delete invoice ${number}? Its hours will no longer be marked invoiced.`)) return;
    await deleteInvoice(number);
    if (excludeInvoiced?.checked) recomputeReport();
  }
  renderInvoicesTab();
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
