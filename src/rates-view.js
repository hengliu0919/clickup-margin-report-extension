import { downloadCsv, parseCsv, toCsv } from "./csv.js";
import { demoSettings, defaultSettings, saveSettings } from "./storage.js";
import { escapeHtml, escapeAttr, dateStamp } from "./dom.js";

const peopleCsvHeaders = ["clickup_user_id", "display_name", "role", "cost_rate", "default_bill_rate", "currency", "active"];
const projectCsvHeaders = ["scope_type", "scope_id", "scope_name", "client", "project", "bill_rate", "budget_hours", "target_margin", "active"];

// Renders + manages the editable rate tables (People + Project), CSV/JSON
// import/export, validation, and ClickUp import. Calls onChange after any save so
// the dashboard can recompute the report instantly (no ClickUp re-fetch needed).
export class RatesView {
  constructor(root, { settings, importFromClickUp, onChange, onStatus }) {
    this.root = root;
    this.settings = settings;
    this.importFromClickUp = importFromClickUp; // async () => {users, entries}
    this.onChange = onChange || (() => {});
    this.onStatus = onStatus || (() => {});
    this.render();
    this.root.addEventListener("input", (e) => this.onInput(e));
    this.root.addEventListener("change", (e) => this.onInput(e));
    this.root.addEventListener("click", (e) => this.onClick(e));
  }

  setSettings(settings) {
    this.settings = settings;
    this.render();
  }

  render() {
    const s = this.settings;
    const empty = !(s.peopleRates || []).length && !(s.projectRates || []).length;
    this.root.innerHTML = `
      ${empty ? this.onboardingHtml() : ""}
      <div class="card">
        <h2>Report Window</h2>
        <label>Lookback days
          <input id="lookbackDays" type="number" min="1" max="120" value="${escapeAttr(s.lookbackDays || 14)}" />
        </label>
        <p>Data comes from your logged-in ClickUp tab. The window is filtered to the last N days.</p>
        <div class="cluster mt-4">
          <button class="btn btn-secondary" data-action="import-clickup">Refresh ClickUp users/projects</button>
        </div>
        <div class="source-legend">
          <span><span class="badge badge-brand">ClickUp</span> read-only reference</span>
          <span><span class="badge badge-info">Local</span> editable margin settings</span>
        </div>
        <div class="status-text mt-3" data-role="import-status"></div>
      </div>

      <div class="card" id="people">
        <div class="section-heading">
          <div class="section-heading-content"><h2>People Rates</h2>
          <p>Names/IDs come from ClickUp. You fill role, cost rate, and default bill rate.</p></div>
          <div class="section-heading-actions"><button class="btn btn-secondary btn-sm" data-action="add-person">Add person</button></div>
        </div>
        <div class="table-container"><div class="table-scroll"><table class="editable-table">
          <thead><tr><th>Active</th><th>Person</th><th>Role</th><th>Cost/hr</th><th>Default bill/hr</th><th>Currency</th><th></th></tr></thead>
          <tbody data-role="people-rows">${this.peopleRowsHtml(s.peopleRates || [])}</tbody>
        </table></div></div>
      </div>

      <div class="card" id="project">
        <div class="section-heading">
          <div class="section-heading-content"><h2>Project Rates</h2>
          <p>ClickUp locations are read-only. You fill client, project, bill rate, budget, target margin.</p></div>
          <div class="section-heading-actions"><button class="btn btn-secondary btn-sm" data-action="add-project">Add project</button></div>
        </div>
        <div class="table-container"><div class="table-scroll"><table class="editable-table">
          <thead><tr><th>Active</th><th>ClickUp location</th><th>Client</th><th>Project</th><th>Bill/hr</th><th>Budget hrs</th><th>Target margin</th><th></th></tr></thead>
          <tbody data-role="project-rows">${this.projectRowsHtml(s.projectRates || [])}</tbody>
        </table></div></div>
      </div>

      <div class="card" data-role="validation-panel">${this.validationHtml()}</div>

      <div class="card">
        <details class="advanced-actions"><summary>Import / export &amp; reset</summary>
          <div class="action-groups">
            <div class="action-group"><h3>People CSV</h3>
              <div class="cluster"><button class="btn btn-secondary btn-sm" data-action="export-people">Export</button>
              <button class="btn btn-secondary btn-sm" data-action="import-people">Import</button></div></div>
            <div class="action-group"><h3>Project CSV</h3>
              <div class="cluster"><button class="btn btn-secondary btn-sm" data-action="export-project">Export</button>
              <button class="btn btn-secondary btn-sm" data-action="import-project">Import</button></div></div>
            <div class="action-group"><h3>Full backup</h3>
              <div class="cluster"><button class="btn btn-secondary btn-sm" data-action="export-json">Export JSON</button>
              <button class="btn btn-secondary btn-sm" data-action="import-json">Import JSON</button></div></div>
            <div class="action-group"><h3>Reset</h3>
              <div class="cluster"><button class="btn btn-secondary btn-sm" data-action="load-demo">Load demo data</button>
              <button class="btn btn-danger btn-sm" data-action="clear-rates">Clear all rates</button></div></div>
          </div>
          <input data-role="file-people" class="hidden" type="file" accept="text/csv,.csv" />
          <input data-role="file-project" class="hidden" type="file" accept="text/csv,.csv" />
          <input data-role="file-json" class="hidden" type="file" accept="application/json,.json" />
        </details>
        <div class="status-text mt-3" data-role="backup-status"></div>
      </div>`;

    this.el("file-people").addEventListener("change", (e) => this.importCsv(e, "people"));
    this.el("file-project").addEventListener("change", (e) => this.importCsv(e, "project"));
    this.el("file-json").addEventListener("change", (e) => this.importJson(e));
  }

  onboardingHtml() {
    return `<div class="alert alert-info"><span class="alert-icon">👋</span>
      <div class="alert-content"><p class="alert-title">Get started in 3 steps</p>
      <p class="alert-description">1. Open a ClickUp tab. 2. Click <strong>Refresh ClickUp users/projects</strong>. 3. Fill cost &amp; bill rates, then open the Report tab.</p>
      <p class="alert-description">Just exploring? <button class="btn btn-secondary btn-sm" data-action="load-demo">Load demo data</button></p></div></div>`;
  }

  peopleRowsHtml(rows) {
    return rows.map((row, i) => `<tr data-kind="people" data-index="${i}">
      <td><input type="checkbox" data-field="active" ${row.active ? "checked" : ""} /></td>
      <td>${this.sourceCell(isImportedId(row.clickup_user_id), row.display_name, "display_name", "Name", row.clickup_user_id || "manual")}</td>
      <td><input data-field="role" value="${escapeAttr(row.role)}" placeholder="Designer" /></td>
      <td><input data-field="cost_rate" value="${escapeAttr(row.cost_rate)}" inputmode="decimal" placeholder="85" /></td>
      <td><input data-field="default_bill_rate" value="${escapeAttr(row.default_bill_rate)}" inputmode="decimal" placeholder="175" /></td>
      <td><input data-field="currency" value="${escapeAttr(row.currency || "USD")}" placeholder="USD" /></td>
      <td><button class="btn btn-danger btn-sm" data-action="remove">Remove</button></td></tr>`).join("");
  }

  projectRowsHtml(rows) {
    return rows.map((row, i) => `<tr data-kind="project" data-index="${i}">
      <td><input type="checkbox" data-field="active" ${row.active ? "checked" : ""} /></td>
      <td>${this.sourceCell(isImportedId(row.scope_id), row.scope_name, "scope_name", "ClickUp List", `${row.scope_type || "list"}: ${row.scope_id || "manual"}`)}</td>
      <td><input data-field="client" value="${escapeAttr(row.client)}" placeholder="Client" /></td>
      <td><input data-field="project" value="${escapeAttr(row.project)}" placeholder="Project" /></td>
      <td><input data-field="bill_rate" value="${escapeAttr(row.bill_rate)}" inputmode="decimal" placeholder="150" /></td>
      <td><input data-field="budget_hours" value="${escapeAttr(row.budget_hours)}" inputmode="decimal" placeholder="80" /></td>
      <td><input data-field="target_margin" value="${escapeAttr(row.target_margin)}" inputmode="decimal" placeholder="0.55" /></td>
      <td><button class="btn btn-danger btn-sm" data-action="remove">Remove</button></td></tr>`).join("");
  }

  sourceCell(imported, label, field, placeholder, meta) {
    if (!imported) {
      return `<input data-field="${field}" value="${escapeAttr(label)}" placeholder="${escapeAttr(placeholder)}" />
        <span class="source-meta"><span class="badge badge-info">Local</span> ${escapeHtml(meta)}</span>`;
    }
    return `<div class="source-readonly" title="Synced from ClickUp. Re-import to refresh."><span class="source-label">${escapeHtml(label || "Unnamed")}</span>
      <span class="source-meta"><span class="badge badge-brand">ClickUp</span> ${escapeHtml(meta)}</span></div>`;
  }

  validationHtml() {
    const issues = validateSettings(this.settings);
    const badge = issues.length
      ? `<span class="badge badge-warning">${issues.length} issue${issues.length === 1 ? "" : "s"} to review</span>`
      : `<span class="badge badge-success">Ready to run</span>`;
    return `<div class="section-heading">
        <div class="section-heading-content"><h2>Validation</h2></div>
        <div class="section-heading-actions">${badge}</div>
      </div>${issues.length ? `<ul class="warning-list">${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""}`;
  }

  el(role) {
    return this.root.querySelector(`[data-role="${role}"]`);
  }

  refreshValidation() {
    this.el("validation-panel").innerHTML = this.validationHtml();
  }

  onInput(e) {
    const target = e.target;
    const rowEl = target.closest("tr[data-kind]");
    if (rowEl && target.dataset.field) {
      const index = Number(rowEl.dataset.index);
      const rows = rowEl.dataset.kind === "people" ? this.settings.peopleRates : this.settings.projectRates;
      rows[index][target.dataset.field] = target.type === "checkbox" ? target.checked : target.value;
      this.refreshValidation();
      this.persist();
      return;
    }
    if (target.id === "lookbackDays") {
      this.settings.lookbackDays = Math.max(1, Number(target.value || 14));
      this.persist();
    }
  }

  async persist() {
    // Debounce-free but cheap: save current settings and notify the dashboard so
    // the report recomputes from the cached ClickUp data immediately.
    this.settings = await saveSettings(this.collect());
    this.onChange(this.settings);
  }

  collect() {
    return {
      lookbackDays: this.settings.lookbackDays,
      peopleRates: this.settings.peopleRates,
      projectRates: this.settings.projectRates,
    };
  }

  async onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "remove") {
      const rowEl = btn.closest("tr[data-kind]");
      const index = Number(rowEl.dataset.index);
      const rows = rowEl.dataset.kind === "people" ? this.settings.peopleRates : this.settings.projectRates;
      rows.splice(index, 1);
      await this.persist();
      this.render();
      return;
    }
    if (action === "add-person") {
      this.settings.peopleRates.push({ clickup_user_id: manualId(), display_name: "", role: "", cost_rate: "", default_bill_rate: "", currency: "USD", active: true });
      await this.persist();
      this.render();
      return;
    }
    if (action === "add-project") {
      this.settings.projectRates.push({ scope_type: "list", scope_id: manualId(), scope_name: "", client: "", project: "", bill_rate: "", budget_hours: "", target_margin: "", active: true });
      await this.persist();
      this.render();
      return;
    }
    if (action === "load-demo") {
      this.settings = await saveSettings(demoSettings);
      this.render();
      this.onChange(this.settings);
      this.setBackup("Demo tables loaded.", "success");
      return;
    }
    if (action === "clear-rates") {
      if (typeof confirm === "function" && !confirm("Remove all people and project rates from this browser? This cannot be undone.")) return;
      this.settings = await saveSettings({ ...defaultSettings, lookbackDays: this.settings.lookbackDays });
      this.render();
      this.onChange(this.settings);
      this.setBackup("All rates cleared.", "success");
      return;
    }
    if (action === "import-clickup") return this.runImportFromClickUp(btn);
    if (action === "export-people") return this.exportCsv("people");
    if (action === "export-project") return this.exportCsv("project");
    if (action === "export-json") return this.exportJson();
    if (action === "import-people") return this.el("file-people").click();
    if (action === "import-project") return this.el("file-project").click();
    if (action === "import-json") return this.el("file-json").click();
  }

  async runImportFromClickUp(btn) {
    btn.disabled = true;
    this.setImport("Reading users and projects from ClickUp...");
    try {
      const data = await this.importFromClickUp();
      this.settings.peopleRates = mergePeopleRows(this.settings.peopleRates, data.users || []);
      this.settings.projectRates = mergeProjectRows(this.settings.projectRates, data.entries || []);
      this.settings = await saveSettings(this.collect());
      this.render();
      this.onChange(this.settings);
      this.setImport(`Imported ${(data.users || []).length} users and ${projectLocations(data.entries || []).length} ClickUp locations.`, "success");
    } catch (error) {
      this.setImport(error.message, "error");
    } finally {
      const b = this.root.querySelector('[data-action="import-clickup"]');
      if (b) b.disabled = false;
    }
  }

  exportCsv(kind) {
    const isPeople = kind === "people";
    const headers = isPeople ? peopleCsvHeaders : projectCsvHeaders;
    const rows = isPeople ? this.settings.peopleRates : this.settings.projectRates;
    const filename = `clickup-margin-report-${isPeople ? "people-rates" : "project-rates"}-${dateStamp()}.csv`;
    downloadCsv(filename, `${toCsv(rowsForCsv(rows, headers))}\n`);
    this.setBackup(`Exported ${rows.length} ${isPeople ? "people" : "project"} rows to CSV.`, "success");
  }

  async importCsv(event, kind) {
    const [file] = event.target.files || [];
    if (!file) return;
    const key = kind === "people" ? "peopleRates" : "projectRates";
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("CSV has no data rows.");
      this.settings = await saveSettings({ ...this.collect(), [key]: rows });
      this.render();
      this.onChange(this.settings);
      this.setBackup(`Imported ${this.settings[key].length} ${kind} rows from CSV.`, "success");
    } catch (error) {
      this.setBackup(`CSV import failed: ${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  exportJson() {
    const exportedAt = new Date().toISOString();
    const payload = { app: "clickup-margin-report", schemaVersion: 1, exportedAt, storage: "browser-local", settings: this.collect() };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clickup-margin-report-settings-${dateStamp(exportedAt)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.setBackup("Exported local settings backup.", "success");
  }

  async importJson(event) {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = parsed.settings || parsed;
      if (!imported || typeof imported !== "object") throw new Error("Backup is missing settings.");
      this.settings = await saveSettings(imported);
      this.render();
      this.onChange(this.settings);
      this.setBackup(`Imported ${this.settings.peopleRates.length} people and ${this.settings.projectRates.length} project rows.`, "success");
    } catch (error) {
      this.setBackup(`Import failed: ${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  setImport(message, type = "") {
    const e = this.el("import-status");
    if (e) {
      e.className = type ? `status-text status-${type}` : "status-text";
      e.textContent = message;
    }
    this.onStatus(message, type);
  }

  setBackup(message, type = "") {
    const e = this.el("backup-status");
    if (e) {
      e.className = type ? `status-text status-${type}` : "status-text";
      e.textContent = message;
    }
  }
}

// --- helpers (moved from options.js) ---
function manualId() {
  const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `manual-${rand}`;
}

function isImportedId(value) {
  return Boolean(value) && !String(value).startsWith("manual-");
}

function isPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function isRatio(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1;
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
  for (const sep of [" - ", " | ", ": "]) {
    if (cleaned.includes(sep)) {
      const [client, ...rest] = cleaned.split(sep);
      return { client: client.trim(), project: rest.join(sep).trim() || cleaned };
    }
  }
  return { client: cleaned || "Client", project: cleaned || "Project" };
}

function rowsForCsv(rows, headers) {
  return rows.map((row) => Object.fromEntries(headers.map((h) => [h, row[h] ?? ""])));
}
