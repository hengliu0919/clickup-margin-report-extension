import { parseCsv } from "./csv.js";

const defaultPeopleRates = [
  {
    clickup_user_id: "216168054",
    display_name: "Demo Admin",
    role: "Project Manager",
    cost_rate: "65",
    default_bill_rate: "140",
    currency: "USD",
    active: true,
  },
  {
    clickup_user_id: "216168243",
    display_name: "Marco",
    role: "Designer",
    cost_rate: "55",
    default_bill_rate: "135",
    currency: "USD",
    active: true,
  },
  {
    clickup_user_id: "216168277",
    display_name: "Alice",
    role: "Senior Engineer",
    cost_rate: "85",
    default_bill_rate: "175",
    currency: "USD",
    active: true,
  },
];

const defaultProjectRates = [
  {
    scope_type: "list",
    scope_id: "901417274458",
    scope_name: "Client - Acme Co Website Redesign",
    client: "Acme Co",
    project: "Website Redesign",
    bill_rate: "150",
    budget_hours: "80",
    target_margin: "0.55",
    active: true,
  },
  {
    scope_type: "list",
    scope_id: "901417274459",
    scope_name: "Client - Northstar MSP Support Retainer",
    client: "Northstar",
    project: "MSP Support Retainer",
    bill_rate: "185",
    budget_hours: "40",
    target_margin: "0.50",
    active: true,
  },
  {
    scope_type: "list",
    scope_id: "901417274460",
    scope_name: "Client - Helio Mobile App Rescue",
    client: "Helio",
    project: "Mobile App Rescue",
    bill_rate: "175",
    budget_hours: "60",
    target_margin: "0.55",
    active: true,
  },
];

// Demo tables are opt-in (the "Load demo data" button), not the first-run default,
// so a real user starts from a clean slate instead of deleting Acme/Demo Admin rows.
export const demoSettings = {
  lookbackDays: 14,
  peopleRates: defaultPeopleRates,
  projectRates: defaultProjectRates,
};

// "Bill from" company details + invoice preferences used by the invoice document.
const defaultCompany = {
  name: "",
  email: "",
  address: "",
  invoicePrefix: "INV",
  nextInvoiceNumber: "1001",
  paymentTerms: "Net 30",
  notes: "",
};

// Selected reporting window. preset is a RANGE_PRESETS id; customStart/End are
// YYYY-MM-DD used only when preset === "custom".
const defaultRange = {
  preset: "this-month",
  customStart: "",
  customEnd: "",
};

export const defaultSettings = {
  lookbackDays: 14, // legacy; kept for back-compat with older exports
  range: defaultRange,
  peopleRates: [],
  projectRates: [],
  company: defaultCompany,
};

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

export async function loadSettings() {
  const storageKeys = [...Object.keys(defaultSettings), "peopleRatesCsv", "projectRatesCsv"];
  if (hasChromeStorage()) {
    const stored = await chrome.storage.local.get(storageKeys);
    return normalizeSettings({ ...defaultSettings, ...stored });
  }

  const raw = localStorage.getItem("clickupMarginReportSettings");
  return raw ? normalizeSettings({ ...defaultSettings, ...JSON.parse(raw) }) : normalizeSettings({ ...defaultSettings });
}

export async function saveSettings(settings) {
  const next = normalizeSettings({ ...defaultSettings, ...settings });
  if (hasChromeStorage()) {
    await chrome.storage.local.set(next);
    return next;
  }

  localStorage.setItem("clickupMarginReportSettings", JSON.stringify(next));
  return next;
}

export function openOptionsPage() {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }

  window.location.href = "dashboard.html";
}

function normalizeSettings(settings) {
  return {
    lookbackDays: Math.max(1, Number(settings.lookbackDays || defaultSettings.lookbackDays)),
    range: normalizeRange(settings.range),
    peopleRates: normalizePeopleRates(settings.peopleRates, settings.peopleRatesCsv),
    projectRates: normalizeProjectRates(settings.projectRates, settings.projectRatesCsv),
    company: normalizeCompany(settings.company),
  };
}

function normalizeRange(range) {
  const r = range && typeof range === "object" ? range : {};
  return {
    preset: string(r.preset || defaultRange.preset),
    customStart: string(r.customStart),
    customEnd: string(r.customEnd),
  };
}

function normalizeCompany(company) {
  const c = company && typeof company === "object" ? company : {};
  return {
    name: string(c.name),
    email: string(c.email),
    address: string(c.address),
    invoicePrefix: string(c.invoicePrefix || defaultCompany.invoicePrefix),
    nextInvoiceNumber: string(c.nextInvoiceNumber || defaultCompany.nextInvoiceNumber),
    paymentTerms: string(c.paymentTerms || defaultCompany.paymentTerms),
    notes: string(c.notes),
  };
}

function normalizePeopleRates(rows, legacyCsv) {
  // Prefer explicit rows; fall back to legacy CSV for older installs; otherwise
  // empty. No demo seeding here — that's opt-in via demoSettings.
  const sourceRows = Array.isArray(rows) ? rows : peopleRowsFromCsv(legacyCsv);
  return sourceRows.map((row) => ({
    clickup_user_id: string(row.clickup_user_id),
    display_name: string(row.display_name || row.username),
    role: string(row.role),
    cost_rate: string(row.cost_rate),
    default_bill_rate: string(row.default_bill_rate),
    currency: string(row.currency || "USD"),
    active: isActive(row.active),
  }));
}

function normalizeProjectRates(rows, legacyCsv) {
  const sourceRows = Array.isArray(rows) ? rows : projectRowsFromCsv(legacyCsv);
  return sourceRows.map((row) => ({
    scope_type: string(row.scope_type || "list"),
    scope_id: string(row.scope_id || row.clickup_list_id),
    scope_name: string(row.scope_name),
    client: string(row.client),
    project: string(row.project),
    bill_rate: string(row.bill_rate),
    budget_hours: string(row.budget_hours),
    target_margin: string(row.target_margin),
    active: isActive(row.active),
  }));
}

function peopleRowsFromCsv(csv = "") {
  return parseCsv(csv).map((row) => ({
    clickup_user_id: row.clickup_user_id,
    display_name: row.display_name || row.username,
    role: row.role,
    cost_rate: row.cost_rate,
    default_bill_rate: row.default_bill_rate,
    currency: row.currency || "USD",
    active: true,
  }));
}

function projectRowsFromCsv(csv = "") {
  return parseCsv(csv).map((row) => ({
    scope_type: "list",
    scope_id: row.scope_id || row.clickup_list_id,
    scope_name: row.scope_name,
    client: row.client,
    project: row.project,
    bill_rate: row.bill_rate,
    budget_hours: row.budget_hours,
    target_margin: row.target_margin,
    active: true,
  }));
}

function string(value) {
  return value == null ? "" : String(value);
}

function isActive(value) {
  if (value === false) return false;
  const normalized = string(value).trim().toLowerCase();
  return !["false", "0", "no", "inactive", "off"].includes(normalized);
}
