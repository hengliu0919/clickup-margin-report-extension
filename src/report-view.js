import { formatMoney, formatPercent } from "./margin.js";
import { downloadCsv, toCsv } from "./csv.js";
import { escapeHtml, dateStamp } from "./dom.js";

// Renders a computed margin report into a container element. Stateless except for
// the currently selected breakdown tab. The dashboard owns data + refresh; this
// module only draws what it's given.
export class ReportView {
  constructor(root) {
    this.root = root;
    this.report = null;
    this.view = "projects";
    this.root.addEventListener("click", (e) => this.onClick(e));
  }

  /**
   * @param {object|null} report
   * @param {{ range?: {startLabel?: string, endLabel?: string}, timestamp?: string }} [meta]
   */
  render(report, { range, timestamp } = {}) {
    this.report = report;
    if (!report) {
      this.root.innerHTML = this.emptyShell("Run a report to see margins.");
      return;
    }
    const currency = report.currency || "USD";
    const t = report.totals;
    const rangeText = range?.startLabel
      ? `${range.startLabel} → ${range.endLabel}`
      : "";

    this.root.innerHTML = `
      ${rangeText ? `<p class="text-sm">${escapeHtml(rangeText)}${timestamp ? ` · ${escapeHtml(timestamp)}` : ""}</p>` : ""}
      ${this.alertsHtml(report)}
      ${this.coverageHtml(report)}
      ${this.warningsHtml(report)}
      <div class="card">
        <h2>Summary</h2>
        <div class="metrics-grid">
          ${metric("Revenue", formatMoney(t.revenue, currency))}
          ${metric("Cost", formatMoney(t.cost, currency))}
          ${metric("Gross Profit", formatMoney(t.grossProfit, currency))}
          ${metric("Margin", formatPercent(t.margin))}
          ${metric("Billable hrs", t.billableHours)}
          ${metric("Utilization", formatPercent(t.utilization))}
          ${metric("Effective rate", formatMoney(t.effectiveRate, currency))}
          ${metric("Tracked hrs", t.trackedHours)}
        </div>
        ${this.estimatedNoteHtml(report, currency)}
        <div class="cluster mt-4">
          <button class="btn btn-secondary btn-sm" data-export="entries"${report.entries?.length ? "" : " disabled"}>Export entries CSV</button>
          <button class="btn btn-secondary btn-sm" data-export="summary"${report.projects?.length ? "" : " disabled"}>Export project summary</button>
          <button class="btn btn-primary btn-sm" data-export="invoice"${report.projects?.some((p) => p.revenue > 0) ? "" : " disabled"}>Client invoice (billable)</button>
        </div>
      </div>
      <div class="card">
        <div class="section-heading">
          <div class="section-heading-content">
            <h2>Breakdown</h2>
            <p>${this.breakdownLabel()}</p>
          </div>
          <div class="section-heading-actions">
            <div class="tabs" role="tablist" aria-label="Breakdown grouping">
              ${this.breakdownTab("projects", "By project")}
              ${this.breakdownTab("people", "By person")}
              ${this.breakdownTab("tasks", "By task")}
            </div>
          </div>
        </div>
        <div class="table-container"><div class="table-scroll">
          <table><thead>${this.headHtml()}</thead><tbody>${this.rowsHtml()}</tbody></table>
        </div></div>
      </div>`;
  }

  breakdownTab(view, label) {
    const active = this.view === view;
    return `<button class="tab${active ? " tab-active" : ""}" role="tab" aria-selected="${active}" data-view="${view}" type="button">${label}</button>`;
  }

  breakdownLabel() {
    const map = { projects: this.report.projects, people: this.report.people, tasks: this.report.tasks };
    const noun = { projects: "project", people: "person", tasks: "task" }[this.view];
    const n = (map[this.view] || []).length;
    return `${n} ${noun}${n === 1 ? "" : noun === "person" ? "s" : "s"}`;
  }

  headHtml() {
    const cols = {
      projects: ["Client", "Project", "Hours", "Revenue", "Cost", "Gross Profit", "Margin", "Budget Used"],
      people: ["Person", "Role", "Tracked", "Billable", "Utilization", "Revenue", "Cost", "Margin"],
      tasks: ["Task", "Client", "Project", "Hours", "Billable", "Revenue", "Cost", "Margin"],
    }[this.view];
    return `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  }

  rowsHtml() {
    const currency = this.report.currency || "USD";
    const rows = { projects: this.report.projects, people: this.report.people, tasks: this.report.tasks }[this.view] || [];
    if (!rows.length) {
      const span = this.headHtml().match(/<th>/g).length;
      return `<tr><td colspan="${span}" class="table-empty"><div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-title">No time entries found</div>
        <div class="empty-state-description">Try increasing the lookback in Settings</div>
      </div></td></tr>`;
    }
    if (this.view === "projects") {
      return rows.map((p) => `<tr class="${p.belowTarget || p.overBudget ? "row-flag" : ""}">
        <td>${escapeHtml(p.client)}</td><td>${escapeHtml(p.project)}</td><td>${p.trackedHours}</td>
        <td>${formatMoney(p.revenue, currency)}</td><td>${formatMoney(p.cost, currency)}</td>
        <td>${formatMoney(p.grossProfit, currency)}</td><td>${this.marginCell(p)}</td>
        <td>${p.budgetHours ? `${formatPercent(p.budgetUsed)}${p.overBudget ? " ⚠️" : ""}` : "—"}</td></tr>`).join("");
    }
    if (this.view === "people") {
      return rows.map((p) => `<tr>
        <td>${escapeHtml(p.user)}</td><td>${escapeHtml(p.role || "—")}</td><td>${p.trackedHours}</td>
        <td>${p.billableHours}</td><td>${formatPercent(p.utilization)}</td>
        <td>${formatMoney(p.revenue, currency)}</td><td>${formatMoney(p.cost, currency)}</td>
        <td>${formatPercent(p.margin)}</td></tr>`).join("");
    }
    return rows.map((t) => `<tr>
      <td>${escapeHtml(t.task)}</td><td>${escapeHtml(t.client)}</td><td>${escapeHtml(t.project)}</td>
      <td>${t.trackedHours}</td><td>${t.billableHours}</td><td>${formatMoney(t.revenue, currency)}</td>
      <td>${formatMoney(t.cost, currency)}</td><td>${formatPercent(t.margin)}</td></tr>`).join("");
  }

  marginCell(p) {
    if (!p.targetMargin) return formatPercent(p.margin);
    const cls = p.belowTarget ? "status-error" : "status-success";
    return `<span class="${cls}">${formatPercent(p.margin)}</span> <span class="status-text">/ ${formatPercent(p.targetMargin)}</span>`;
  }

  alertsHtml(report) {
    const a = report.alerts || { belowTarget: [], overBudget: [] };
    const items = [
      ...a.belowTarget.map((x) => `<li><strong>${escapeHtml(x.label)}</strong> — margin ${formatPercent(x.margin)} is below target ${formatPercent(x.targetMargin)}</li>`),
      ...a.overBudget.map((x) => `<li><strong>${escapeHtml(x.label)}</strong> — ${x.trackedHours}h of ${x.budgetHours}h budget (${formatPercent(x.budgetUsed)})</li>`),
    ];
    if (!items.length) return "";
    return `<div class="alert alert-danger"><span class="alert-icon">🚩</span><div class="alert-content">
      <p class="alert-title">${items.length} project${items.length === 1 ? "" : "s"} need attention</p>
      <ul class="warning-list">${items.join("")}</ul></div></div>`;
  }

  coverageHtml(report) {
    const c = report.coverage;
    const failed = report.apiErrors?.length || 0;
    if (!c) return "";
    const incomplete = c.completedSlices < c.expectedSlices || c.truncatedWeeks > 0 || failed > 0;
    if (!incomplete) return "";
    const parts = [`Covers ${c.completedSlices} of ${c.expectedSlices} user-week slices.`];
    if (failed) parts.push(`${failed} fetch${failed === 1 ? "" : "es"} failed.`);
    if (c.truncatedWeeks) parts.push(`${c.truncatedWeeks} week(s) may be truncated.`);
    return `<div class="alert alert-warning"><span class="alert-icon">📡</span><div class="alert-content">
      <p class="alert-title">Partial data</p>
      <p class="alert-description">${escapeHtml(parts.join(" "))} Totals may be understated. Refresh to retry.</p></div></div>`;
  }

  warningsHtml(report) {
    const warnings = [
      ...report.missing.peopleRates.map((i) => ({ text: `Missing people rate: ${i.label} (${i.id})`, tab: "rates" })),
      ...report.missing.projectRates.map((i) => ({ text: `Missing project mapping/rate: ${i.label} (${i.id})`, tab: "rates" })),
      ...report.missing.taskLocation.map((i) => ({ text: `Missing task location: ${i.label} (${i.id})`, tab: null })),
      ...(report.apiErrors || []).map((i) => ({ text: `Could not fetch assignee ${i.assigneeId}: ${i.message || "Unknown error"}`, tab: null })),
    ];
    if (!warnings.length) return "";
    const lis = warnings.map((w) =>
      w.tab
        ? `<li>${escapeHtml(w.text)} — <a href="#" data-goto-tab="${w.tab}">fix in Rates</a></li>`
        : `<li>${escapeHtml(w.text)}</li>`
    );
    return `<div class="alert alert-warning"><span class="alert-icon">⚠️</span><div class="alert-content">
      <p class="alert-title">${warnings.length} warning${warnings.length === 1 ? "" : "s"} found</p>
      <ul class="warning-list">${lis.join("")}</ul></div></div>`;
  }

  estimatedNoteHtml(report, currency) {
    if (report.mixedCurrency) {
      return `<div class="alert alert-danger mt-3"><span class="alert-icon">⚠️</span><div class="alert-content">
        <p class="alert-title">Mixed currencies (${escapeHtml(report.currencies.join(", "))})</p>
        <p class="alert-description">Totals are summed as raw numbers and are NOT reliable — set one currency for all active people.</p></div></div>`;
    }
    if (report.totals.estimatedRevenue > 0) {
      return `<p class="text-sm mt-3">${formatMoney(report.totals.estimatedRevenue, currency)} of revenue is estimated from default bill rates (no project rate mapped).</p>`;
    }
    return "";
  }

  emptyShell(message) {
    return `<div class="card"><div class="empty-state">
      <div class="empty-state-icon">📊</div>
      <div class="empty-state-description">${escapeHtml(message)}</div></div></div>`;
  }

  onClick(e) {
    const tab = e.target.closest("[data-view]");
    if (tab) {
      this.view = tab.dataset.view;
      this.render(this.report, this.lastMeta);
      return;
    }
    const goto = e.target.closest("[data-goto-tab]");
    if (goto) {
      e.preventDefault();
      this.root.dispatchEvent(new CustomEvent("goto-tab", { bubbles: true, detail: goto.dataset.gotoTab }));
      return;
    }
    const exp = e.target.closest("[data-export]");
    if (exp && !exp.disabled) this.export(exp.dataset.export);
  }

  export(kind) {
    if (!this.report) return;
    if (kind === "entries" && this.report.entries?.length) {
      downloadCsv(`clickup-margin-report-${dateStamp()}.csv`, toCsv(this.report.entries));
    } else if (kind === "summary" && this.report.projects?.length) {
      const rows = this.report.projects.map((p) => ({
        client: p.client, project: p.project, tracked_hours: p.trackedHours, billable_hours: p.billableHours,
        utilization: p.utilization, revenue: p.revenue, cost: p.cost, gross_profit: p.grossProfit,
        margin: p.margin, target_margin: p.targetMargin || "", budget_hours: p.budgetHours || "",
        budget_used: p.budgetHours ? p.budgetUsed : "",
      }));
      downloadCsv(`clickup-margin-summary-${dateStamp()}.csv`, toCsv(rows));
    } else if (kind === "invoice") {
      const rows = this.report.projects.filter((p) => p.revenue > 0).map((p) => ({
        client: p.client, project: p.project, billable_hours: p.billableHours,
        effective_rate: p.effectiveRate, amount_due: p.revenue,
      }));
      if (rows.length) downloadCsv(`clickup-invoice-${dateStamp()}.csv`, toCsv(rows));
    }
  }

  // Keep meta for re-render on tab switch.
  setMeta(meta) {
    this.lastMeta = meta;
  }
}

function metric(label, value) {
  return `<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value">${escapeHtml(value)}</strong></div>`;
}
