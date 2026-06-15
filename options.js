import { downloadCsv, parseCsv, toCsv } from "./src/csv.js";
import { defaultSettings, loadSettings, saveSettings } from "./src/storage.js";

const peopleCsvHeaders = [
  "clickup_user_id",
  "display_name",
  "role",
  "cost_rate",
  "default_bill_rate",
  "currency",
  "active",
];

const projectCsvHeaders = [
  "scope_type",
  "scope_id",
  "scope_name",
  "client",
  "project",
  "bill_rate",
  "budget_hours",
  "target_margin",
  "active",
];

const fields = {
  lookbackDays: document.querySelector("#lookbackDays"),
};

const elements = {
  peopleRows: document.querySelector("#peopleRows"),
  projectRows: document.querySelector("#projectRows"),
  saveStatus: document.querySelector("#saveStatus"),
  importStatus: document.querySelector("#importStatus"),
  backupStatus: document.querySelector("#backupStatus"),
  validationSummary: document.querySelector("#validationSummary"),
  validationIssues: document.querySelector("#validationIssues"),
  importPeopleCsvFile: document.querySelector("#importPeopleCsvFile"),
  importProjectCsvFile: document.querySelector("#importProjectCsvFile"),
  importSettingsFile: document.querySelector("#importSettingsFile"),
};

let currentSettings = await loadSettings();
renderSettings(currentSettings);

document.querySelector("#saveTop").addEventListener("click", handleSave);
document.querySelector("#saveBottom").addEventListener("click", handleSave);
document.querySelector("#resetSamples").addEventListener("click", resetSamples);
document.querySelector("#addPerson").addEventListener("click", addPerson);
document.querySelector("#addProject").addEventListener("click", addProject);
document.querySelector("#importFromClickUp").addEventListener("click", importFromClickUp);
document.querySelector("#exportPeopleCsv").addEventListener("click", () => exportRateCsv("people"));
document.querySelector("#importPeopleCsv").addEventListener("click", () => elements.importPeopleCsvFile.click());
document.querySelector("#exportProjectCsv").addEventListener("click", () => exportRateCsv("project"));
document.querySelector("#importProjectCsv").addEventListener("click", () => elements.importProjectCsvFile.click());
document.querySelector("#exportSettings").addEventListener("click", exportSettings);
document.querySelector("#importSettings").addEventListener("click", () => elements.importSettingsFile.click());
elements.importPeopleCsvFile.addEventListener("change", (event) => importRateCsv(event, "people"));
elements.importProjectCsvFile.addEventListener("change", (event) => importRateCsv(event, "project"));
elements.importSettingsFile.addEventListener("change", importSettings);
elements.peopleRows.addEventListener("input", handleTableInput);
elements.peopleRows.addEventListener("change", handleTableInput);
elements.peopleRows.addEventListener("click", handleTableClick);
elements.projectRows.addEventListener("input", handleTableInput);
elements.projectRows.addEventListener("change", handleTableInput);
elements.projectRows.addEventListener("click", handleTableClick);

function renderSettings(settings) {
  fields.lookbackDays.value = settings.lookbackDays || 14;
  renderPeopleRows(settings.peopleRates || []);
  renderProjectRows(settings.projectRates || []);
  renderValidation();
}

function renderPeopleRows(rows) {
  elements.peopleRows.innerHTML = rows.map((row, index) => `
    <tr data-kind="people" data-index="${index}">
      <td><input type="checkbox" data-field="active" ${row.active ? "checked" : ""} /></td>
      <td>${renderSourceCell({
        imported: isImportedId(row.clickup_user_id),
        label: row.display_name,
        field: "display_name",
        placeholder: "Name",
        meta: row.clickup_user_id || "manual",
      })}</td>
      <td><input data-field="role" value="${escapeAttr(row.role)}" placeholder="Designer" /></td>
      <td><input data-field="cost_rate" value="${escapeAttr(row.cost_rate)}" inputmode="decimal" placeholder="85" /></td>
      <td><input data-field="default_bill_rate" value="${escapeAttr(row.default_bill_rate)}" inputmode="decimal" placeholder="175" /></td>
      <td><input data-field="currency" value="${escapeAttr(row.currency || "USD")}" placeholder="USD" /></td>
      <td><button type="button" class="icon-button" data-action="remove">Remove</button></td>
    </tr>
  `).join("");
}

function renderProjectRows(rows) {
  elements.projectRows.innerHTML = rows.map((row, index) => `
    <tr data-kind="project" data-index="${index}">
      <td><input type="checkbox" data-field="active" ${row.active ? "checked" : ""} /></td>
      <td>${renderSourceCell({
        imported: isImportedId(row.scope_id),
        label: row.scope_name,
        field: "scope_name",
        placeholder: "ClickUp List",
        meta: `${row.scope_type || "list"}: ${row.scope_id || "manual"}`,
      })}</td>
      <td><input data-field="client" value="${escapeAttr(row.client)}" placeholder="Client" /></td>
      <td><input data-field="project" value="${escapeAttr(row.project)}" placeholder="Project" /></td>
      <td><input data-field="bill_rate" value="${escapeAttr(row.bill_rate)}" inputmode="decimal" placeholder="150" /></td>
      <td><input data-field="budget_hours" value="${escapeAttr(row.budget_hours)}" inputmode="decimal" placeholder="80" /></td>
      <td><input data-field="target_margin" value="${escapeAttr(row.target_margin)}" inputmode="decimal" placeholder="0.55" /></td>
      <td><button type="button" class="icon-button" data-action="remove">Remove</button></td>
    </tr>
  `).join("");
}

function renderSourceCell({ imported, label, field, placeholder, meta }) {
  if (!imported) {
    return `
      <input data-field="${field}" value="${escapeAttr(label)}" placeholder="${escapeAttr(placeholder)}" />
      <span class="source-meta"><span class="source-badge local">Local</span> ${escapeHtml(meta)}</span>
    `;
  }

  return `
    <div class="source-readonly" title="Synced from ClickUp. Re-import to refresh this value.">
      <span class="source-label">${escapeHtml(label || "Unnamed")}</span>
      <span class="source-meta"><span class="source-badge clickup">ClickUp</span> ${escapeHtml(meta)}</span>
    </div>
  `;
}

function collectSettings() {
  return {
    lookbackDays: Math.max(1, Number(fields.lookbackDays.value || 14)),
    peopleRates: currentSettings.peopleRates,
    projectRates: currentSettings.projectRates,
  };
}

async function handleSave() {
  elements.saveStatus.className = "status";
  elements.saveStatus.textContent = "Saving...";
  currentSettings = await saveSettings(collectSettings());
  renderSettings(currentSettings);
  elements.saveStatus.className = "status success";
  elements.saveStatus.textContent = "Saved.";
}

async function resetSamples() {
  currentSettings = await saveSettings(defaultSettings);
  renderSettings(currentSettings);
  elements.saveStatus.className = "status success";
  elements.saveStatus.textContent = "Sample tables restored.";
}

async function exportRateCsv(kind) {
  const settings = await saveSettings(collectSettings());
  currentSettings = settings;
  renderSettings(currentSettings);

  const isPeople = kind === "people";
  const headers = isPeople ? peopleCsvHeaders : projectCsvHeaders;
  const rows = isPeople ? settings.peopleRates : settings.projectRates;
  const filename = `clickup-margin-report-${isPeople ? "people-rates" : "project-rates"}-${dateStamp()}.csv`;
  downloadCsv(filename, `${toCsv(rowsForCsv(rows, headers))}\n`);
  setBackupStatus(`Exported ${rows.length} ${isPeople ? "people" : "project"} rows to CSV.`, "success");
}

async function importRateCsv(event, kind) {
  const [file] = event.target.files || [];
  if (!file) return;

  const isPeople = kind === "people";
  const key = isPeople ? "peopleRates" : "projectRates";
  const label = isPeople ? "people" : "project";

  try {
    setBackupStatus(`Importing ${label} CSV...`);
    const rows = parseCsv(await file.text());
    if (!rows.length) throw new Error("CSV has no data rows.");

    currentSettings = await saveSettings({
      ...collectSettings(),
      [key]: rows,
    });
    renderSettings(currentSettings);
    setBackupStatus(`Imported ${currentSettings[key].length} ${label} rows from CSV.`, "success");
  } catch (error) {
    setBackupStatus(`CSV import failed: ${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
}

async function exportSettings() {
  const settings = await saveSettings(collectSettings());
  currentSettings = settings;
  renderSettings(currentSettings);

  const exportedAt = new Date().toISOString();
  const payload = {
    app: "clickup-margin-report",
    schemaVersion: 1,
    exportedAt,
    storage: "browser-local",
    settings,
  };
  downloadJson(`clickup-margin-report-settings-${dateStamp(exportedAt)}.json`, payload);
  setBackupStatus("Exported local settings backup.", "success");
}

async function importSettings(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  try {
    setBackupStatus("Importing settings...");
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("JSON must contain settings.");
    const importedSettings = parsed.settings || parsed;
    if (!importedSettings || typeof importedSettings !== "object") throw new Error("Backup is missing settings.");
    currentSettings = await saveSettings(importedSettings);
    renderSettings(currentSettings);
    setBackupStatus(`Imported ${currentSettings.peopleRates.length} people rows and ${currentSettings.projectRates.length} project rows.`, "success");
  } catch (error) {
    setBackupStatus(`Import failed: ${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
}

function addPerson() {
  currentSettings.peopleRates.push({
    clickup_user_id: `manual-${Date.now()}`,
    display_name: "",
    role: "",
    cost_rate: "",
    default_bill_rate: "",
    currency: "USD",
    active: true,
  });
  renderSettings(currentSettings);
}

function addProject() {
  currentSettings.projectRates.push({
    scope_type: "list",
    scope_id: `manual-${Date.now()}`,
    scope_name: "",
    client: "",
    project: "",
    bill_rate: "",
    budget_hours: "",
    target_margin: "",
    active: true,
  });
  renderSettings(currentSettings);
}

async function importFromClickUp() {
  setImportStatus("Looking for an open ClickUp tab...");
  const button = document.querySelector("#importFromClickUp");
  button.disabled = true;

  try {
    const tab = await getClickUpTab();
    if (!tab) throw new Error("Open a ClickUp workspace tab first, then click Import again.");

    setImportStatus("Reading users and projects from ClickUp...");
    const data = await sendToClickUpTab(tab.id, "GET_MARGIN_DATA", {
      lookbackDays: Math.max(1, Number(fields.lookbackDays.value || 14)),
    });

    const users = data.users || [];
    const entries = data.entries || [];
    currentSettings.peopleRates = mergePeopleRows(currentSettings.peopleRates, users);
    currentSettings.projectRates = mergeProjectRows(currentSettings.projectRates, entries);
    currentSettings = await saveSettings(collectSettings());
    renderSettings(currentSettings);
    setImportStatus(`Imported ${users.length} users and ${projectLocations(entries).length} ClickUp locations.`, "success");
  } catch (error) {
    setImportStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function mergePeopleRows(existingRows, users) {
  const rowsById = new Map(existingRows.map((row) => [String(row.clickup_user_id), row]));

  for (const user of users) {
    const id = String(user.id);
    const existing = rowsById.get(id);
    rowsById.set(id, {
      clickup_user_id: id,
      display_name: user.username || user.name || existing?.display_name || `User ${id}`,
      role: existing?.role || "",
      cost_rate: existing?.cost_rate || "",
      default_bill_rate: existing?.default_bill_rate || "",
      currency: existing?.currency || "USD",
      active: existing?.active ?? true,
    });
  }

  return [...rowsById.values()];
}

function mergeProjectRows(existingRows, entries) {
  const rowsById = new Map(existingRows.map((row) => [String(row.scope_id), row]));

  for (const location of projectLocations(entries)) {
    const existing = rowsById.get(location.id);
    const guessed = guessClientProject(location.name);
    rowsById.set(location.id, {
      scope_type: "list",
      scope_id: location.id,
      scope_name: location.name || existing?.scope_name,
      client: existing?.client || guessed.client,
      project: existing?.project || guessed.project,
      bill_rate: existing?.bill_rate || "",
      budget_hours: existing?.budget_hours || "",
      target_margin: existing?.target_margin || "0.50",
      active: existing?.active ?? true,
    });
  }

  return [...rowsById.values()];
}

function projectLocations(entries) {
  const locations = new Map();
  for (const entry of entries) {
    const list = entry.task?.list;
    if (!list?.id) continue;
    locations.set(String(list.id), { id: String(list.id), name: list.name || `List ${list.id}` });
  }
  return [...locations.values()];
}

function guessClientProject(scopeName = "") {
  const cleaned = scopeName.replace(/^Client\s*-\s*/i, "").trim();
  const separators = [" - ", " | ", ": "];
  for (const separator of separators) {
    if (cleaned.includes(separator)) {
      const [client, ...rest] = cleaned.split(separator);
      return { client: client.trim(), project: rest.join(separator).trim() || cleaned };
    }
  }
  return { client: cleaned || "Client", project: cleaned || "Project" };
}

function handleTableInput(event) {
  const target = event.target;
  const rowEl = target.closest("tr[data-kind]");
  if (!rowEl || !target.dataset.field) return;

  const index = Number(rowEl.dataset.index);
  const field = target.dataset.field;
  const rows = rowEl.dataset.kind === "people" ? currentSettings.peopleRates : currentSettings.projectRates;
  rows[index][field] = target.type === "checkbox" ? target.checked : target.value;
  renderValidation();
}

function handleTableClick(event) {
  const button = event.target.closest("button[data-action='remove']");
  if (!button) return;

  const rowEl = button.closest("tr[data-kind]");
  const index = Number(rowEl.dataset.index);
  const rows = rowEl.dataset.kind === "people" ? currentSettings.peopleRates : currentSettings.projectRates;
  rows.splice(index, 1);
  renderSettings(currentSettings);
}

function renderValidation() {
  const issues = validateSettings(currentSettings);
  elements.validationSummary.innerHTML = issues.length
    ? `<span class="badge warning">${issues.length} issue${issues.length === 1 ? "" : "s"} to review</span>`
    : `<span class="badge good">Ready enough to run</span>`;
  elements.validationIssues.innerHTML = issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("");
}

function validateSettings(settings) {
  const issues = [];
  const seenPeople = new Set();
  const seenProjects = new Set();

  for (const row of settings.peopleRates || []) {
    if (!row.active) continue;
    if (!isImportedId(row.clickup_user_id)) issues.push(`People row "${row.display_name || "Unnamed"}" is not connected to an imported ClickUp user.`);
    if (seenPeople.has(row.clickup_user_id)) issues.push(`Duplicate people row for ${row.display_name || row.clickup_user_id}.`);
    seenPeople.add(row.clickup_user_id);
    if (!row.display_name) issues.push(`People row ${row.clickup_user_id} is missing a display name.`);
    if (!isPositiveNumber(row.cost_rate)) issues.push(`${row.display_name || row.clickup_user_id} is missing a valid cost rate.`);
    if (!isPositiveNumber(row.default_bill_rate)) issues.push(`${row.display_name || row.clickup_user_id} is missing a valid default bill rate.`);
  }

  for (const row of settings.projectRates || []) {
    if (!row.active) continue;
    if (!isImportedId(row.scope_id)) issues.push(`Project row "${row.scope_name || row.project || "Unnamed"}" is not connected to an imported ClickUp location.`);
    if (seenProjects.has(row.scope_id)) issues.push(`Duplicate project row for ${row.scope_name || row.scope_id}.`);
    seenProjects.add(row.scope_id);
    if (!row.scope_name) issues.push(`Project row ${row.scope_id} is missing a ClickUp location name.`);
    if (!row.client) issues.push(`${row.scope_name || row.scope_id} is missing a client.`);
    if (!row.project) issues.push(`${row.scope_name || row.scope_id} is missing a project name.`);
    if (!isPositiveNumber(row.bill_rate)) issues.push(`${row.scope_name || row.scope_id} is missing a valid bill rate.`);
    if (row.budget_hours && !isPositiveNumber(row.budget_hours)) issues.push(`${row.scope_name || row.scope_id} has an invalid budget.`);
    if (row.target_margin && !isRatio(row.target_margin)) issues.push(`${row.scope_name || row.scope_id} target margin should be between 0 and 1.`);
  }

  return issues;
}

function isPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function isRatio(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1;
}

function isImportedId(value) {
  return Boolean(value) && !String(value).startsWith("manual-");
}

async function getClickUpTab() {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;
  const tabs = await chrome.tabs.query({ url: "https://app.clickup.com/*" });
  return tabs.find((tab) => tab.active) || tabs[0] || null;
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
    setImportStatus("Connecting to the ClickUp tab...");
    await injectContentScript(tabId);
    response = await chrome.tabs.sendMessage(tabId, message);
  }

  if (!response?.ok) {
    throw new Error(response?.error || "Could not read data from the ClickUp tab. Reload ClickUp after installing the extension.");
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

function setImportStatus(message, type = "") {
  elements.importStatus.className = type ? `status ${type}` : "status";
  elements.importStatus.textContent = message;
}

function setBackupStatus(message, type = "") {
  elements.backupStatus.className = type ? `status ${type}` : "status";
  elements.backupStatus.textContent = message;
}

function rowsForCsv(rows, headers) {
  return rows.map((row) =>
    Object.fromEntries(headers.map((header) => [header, row[header] ?? ""]))
  );
}

function dateStamp(date = new Date()) {
  return (typeof date === "string" ? date : date.toISOString()).slice(0, 10);
}

function downloadJson(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
