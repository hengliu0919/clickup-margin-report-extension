import { formatMoney, formatPercent } from "./margin.js";
import { downloadCsv, toCsv } from "./csv.js";
import { escapeHtml, dateStamp } from "./dom.js";
import { taskUrl } from "./clickup-links.js";
import { TIPS } from "./glossary.js";

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
      <div class="card summary-card">
        <div class="hero-metrics">
          ${hero("Revenue", formatMoney(t.revenue, currency), TIPS.revenue)}
          ${hero("Gross Profit", formatMoney(t.grossProfit, currency), TIPS.grossProfit)}
          ${hero("Margin", formatPercent(t.margin), TIPS.margin, marginClass(t.margin))}
        </div>
        <div class="sub-metrics">
          ${sub("Cost", formatMoney(t.cost, currency), TIPS.cost)}
          ${sub("Billable hrs", t.billableHours, TIPS.billableHours)}
          ${sub("Tracked hrs", t.trackedHours, TIPS.trackedHours)}
          ${sub("Utilization", formatPercent(t.utilization), TIPS.utilization)}
          ${sub("Effective rate", formatMoney(t.effectiveRate, currency), TIPS.effectiveRate)}
        </div>
        ${this.estimatedNoteHtml(report, currency)}
        <div class="cluster mt-4">
          <button class="btn btn-secondary btn-sm" data-export="entries"${report.entries?.length ? "" : " disabled"}>Export entries CSV</button>
          <button class="btn btn-secondary btn-sm" data-export="summary"${report.projects?.length ? "" : " disabled"}>Export project summary</button>
          <button class="btn btn-secondary btn-sm" data-export="invoice"${report.projects?.some((p) => p.revenue > 0) ? "" : " disabled"}>Invoice CSV</button>
          <button class="btn btn-primary btn-sm has-tip" data-tip="${escapeHtml(TIPS.generateInvoices)}" aria-label="Generate invoices: ${escapeHtml(TIPS.generateInvoices)}" data-action="generate-invoices"${report.projects?.some((p) => p.revenue > 0) ? "" : " disabled"}>Generate invoices</button>
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
              ${this.breakdownTab("types", "By type")}
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
    const map = { projects: this.report.projects, people: this.report.people, tasks: this.report.tasks, types: this.report.types };
    const noun = { projects: "project", people: "person", tasks: "task", types: "type" }[this.view];
    const n = (map[this.view] || []).length;
    const plural = n === 1 ? "" : noun === "person" ? "s" : "s";
    return `${n} ${n === 1 ? noun : noun + plural}`;
  }

  headHtml() {
    const cols = {
      projects: ["Client", "Project", "Hours", "Revenue", "Cost", "Gross Profit", "Margin", "Budget Used"],
      people: ["Person", "Role", "Tracked", "Billable", "Utilization", "Revenue", "Cost", "Margin"],
      tasks: ["Task", "Client", "Project", "Hours", "Billable", "Revenue", "Cost", "Margin"],
      types: ["Task type", "Tracked", "Billable", "Utilization", "Revenue", "Cost", "Margin"],
    }[this.view];
    return `<tr>${cols.map((c) => `<th>${this.headLabel(c)}</th>`).join("")}</tr>`;
  }

  // Column header with an optional tooltip for finance terms.
  headLabel(col) {
    const tipFor = {
      Hours: TIPS.trackedHours, Tracked: TIPS.trackedHours, Billable: TIPS.billableHours,
      Revenue: TIPS.revenue, Cost: TIPS.cost, "Gross Profit": TIPS.grossProfit,
      Margin: TIPS.margin, Utilization: TIPS.utilization, "Budget Used": TIPS.budgetUsed,
    };
    const tip = tipFor[col];
    return tip
      ? `<span class="has-tip" data-tip="${escapeHtml(tip)}" tabindex="0" aria-label="${escapeHtml(col)}: ${escapeHtml(tip)}">${escapeHtml(col)}</span>`
      : escapeHtml(col);
  }

  rowsHtml() {
    const currency = this.report.currency || "USD";
    const rows = { projects: this.report.projects, people: this.report.people, tasks: this.report.tasks, types: this.report.types }[this.view] || [];
    if (!rows.length) {
      const span = this.headHtml().match(/<th>/g).length;
      return `<tr><td colspan="${span}" class="table-empty"><div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-title">No time entries found</div>
        <div class="empty-state-description">Try increasing the lookback in Settings</div>
      </div></td></tr>`;
    }
    // Audit links point at a real ClickUp task: task rows -> their own task;
    // project/person rows -> their top task (most hours). ClickUp's timesheet
    // can't be URL-filtered by person/task, so we never link there (it lands on
    // the viewer's own "My timesheet" and looks empty).
    if (this.view === "projects") {
      return rows.map((p) => `<tr class="${p.belowTarget || p.overBudget || p.overBudgetAmount ? "row-flag" : ""}">
        <td>${escapeHtml(p.client)}</td><td>${escapeHtml(p.project)}</td>
        <td>${this.hoursCell(p.trackedHours, p.topTaskId, p.topTaskName)}</td>
        <td>${formatMoney(p.revenue, currency)}</td><td>${formatMoney(p.cost, currency)}</td>
        <td>${formatMoney(p.grossProfit, currency)}</td><td>${this.marginCell(p)}</td>
        <td>${this.budgetCell(p, currency)}</td></tr>`).join("");
    }
    if (this.view === "people") {
      return rows.map((p) => `<tr>
        <td>${escapeHtml(p.user)}</td><td>${escapeHtml(p.role || "—")}</td>
        <td>${this.hoursCell(p.trackedHours, p.topTaskId, p.topTaskName)}</td>
        <td>${this.hoursCell(p.billableHours, p.topTaskId, p.topTaskName)}</td><td>${formatPercent(p.utilization)}</td>
        <td>${formatMoney(p.revenue, currency)}</td><td>${formatMoney(p.cost, currency)}</td>
        <td>${formatPercent(p.margin)}</td></tr>`).join("");
    }
    if (this.view === "types") {
      return rows.map((t) => `<tr>
        <td>${escapeHtml(t.type)}</td>
        <td>${t.trackedHours}</td><td>${t.billableHours}</td><td>${formatPercent(t.utilization)}</td>
        <td>${formatMoney(t.revenue, currency)}</td><td>${formatMoney(t.cost, currency)}</td>
        <td>${formatPercent(t.margin)}</td></tr>`).join("");
    }
    return rows.map((t) => `<tr>
      <td>${this.taskLinkCell(t.task, t.taskId)}</td><td>${escapeHtml(t.client)}</td><td>${escapeHtml(t.project)}</td>
      <td>${this.hoursCell(t.trackedHours, t.taskId, t.task)}</td>
      <td>${this.hoursCell(t.billableHours, t.taskId, t.task)}</td><td>${formatMoney(t.revenue, currency)}</td>
      <td>${formatMoney(t.cost, currency)}</td><td>${formatPercent(t.margin)}</td></tr>`).join("");
  }

  // A numeric cell that links to a ClickUp task for audit. No link if no task.
  hoursCell(value, taskId, taskName) {
    const url = taskUrl(taskId);
    if (!url) return String(value);
    const tip = taskName ? `Audit in ClickUp: ${taskName}` : "Audit in ClickUp";
    return `<a class="audit-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(tip)}">${value}<span class="audit-arrow" aria-hidden="true">↗</span></a>`;
  }

  taskLinkCell(name, taskId) {
    const url = taskUrl(taskId);
    if (!url) return escapeHtml(name);
    return `<a class="audit-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="Open task in ClickUp">${escapeHtml(name)}<span class="audit-arrow" aria-hidden="true">↗</span></a>`;
  }

  // Budget Used cell shows the hours-budget %, and the $-budget % when a dollar
  // budget is set. Each chip is hover-explained with the underlying figures.
  budgetCell(p, currency) {
    const parts = [];
    if (p.budgetHours) {
      const tip = `${p.trackedHours}h tracked of ${p.budgetHours}h budget`;
      parts.push(`<span class="has-tip" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${formatPercent(p.budgetUsed)} of hours${p.overBudget ? " ⚠️" : ""}</span>`);
    }
    if (p.budgetAmount) {
      const tip = `${formatMoney(p.revenue, currency)} billed of ${formatMoney(p.budgetAmount, currency)} budget`;
      parts.push(`<span class="has-tip" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${formatPercent(p.budgetAmountUsed)} of $ budget${p.overBudgetAmount ? " ⚠️" : ""}</span>`);
    }
    return parts.length ? parts.join(" · ") : "—";
  }

  marginCell(p) {
    if (!p.targetMargin) return formatPercent(p.margin);
    const cls = p.belowTarget ? "status-error" : "status-success";
    return `<span class="${cls}">${formatPercent(p.margin)}</span> <span class="status-text">/ ${formatPercent(p.targetMargin)}</span>`;
  }

  alertsHtml(report) {
    const a = report.alerts || { belowTarget: [], overBudget: [], overBudgetAmount: [] };
    const currency = report.currency || "USD";
    const items = [
      ...a.belowTarget.map((x) => `<li><strong>${escapeHtml(x.label)}</strong> — margin ${formatPercent(x.margin)} is below target ${formatPercent(x.targetMargin)}</li>`),
      ...a.overBudget.map((x) => `<li><strong>${escapeHtml(x.label)}</strong> — ${x.trackedHours}h of ${x.budgetHours}h budget (${formatPercent(x.budgetUsed)})</li>`),
      ...(a.overBudgetAmount || []).map((x) => `<li><strong>${escapeHtml(x.label)}</strong> — ${formatMoney(x.revenue, currency)} of ${formatMoney(x.budgetAmount, currency)} budget (${formatPercent(x.budgetAmountUsed)})</li>`),
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

  // Loading / empty / error placeholders with an optional action button. The
  // dashboard uses this so the user is never stuck on a blank "connecting" card.
  /**
   * @param {"loading"|"empty"|"error"} kind
   * @param {string} message
   * @param {{ actionLabel?: string, actionEvent?: string }} [opts]
   */
  renderState(kind, message, { actionLabel, actionEvent } = {}) {
    this.report = null;
    const icon = kind === "error" ? "⚠️" : kind === "loading" ? "⏳" : "📊";
    const title = kind === "error" ? "Couldn’t load data" : kind === "loading" ? "Loading…" : "No report yet";
    const action = actionLabel
      ? `<button class="btn btn-primary btn-sm mt-3" data-state-action="${escapeHtml(actionEvent || "")}">${escapeHtml(actionLabel)}</button>`
      : "";
    this.root.innerHTML = `<div class="card"><div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${escapeHtml(title)}</div>
      <div class="empty-state-description">${escapeHtml(message)}</div>
      ${action}</div></div>`;
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
    const gen = e.target.closest("[data-action='generate-invoices']");
    if (gen && !gen.disabled) {
      this.root.dispatchEvent(new CustomEvent("generate-invoices", { bubbles: true }));
      return;
    }
    const stateBtn = e.target.closest("[data-state-action]");
    if (stateBtn) {
      this.root.dispatchEvent(new CustomEvent(stateBtn.dataset.stateAction || "retry", { bubbles: true }));
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

function infoDot(tip) {
  return `<span class="info-dot has-tip" data-tip="${escapeHtml(tip)}" tabindex="0" role="img" aria-label="${escapeHtml(tip)}">?</span>`;
}

function hero(label, value, tip, valueClass = "") {
  return `<div class="hero-metric">
    <div class="hero-metric-label">${escapeHtml(label)}${tip ? infoDot(tip) : ""}</div>
    <div class="hero-metric-value ${valueClass}">${escapeHtml(value)}</div>
  </div>`;
}

function sub(label, value, tip) {
  return `<div class="sub-metric">
    <div class="sub-metric-label">${escapeHtml(label)}${tip ? infoDot(tip) : ""}</div>
    <div class="sub-metric-value">${escapeHtml(value)}</div>
  </div>`;
}

// Tint the headline margin green/red against a 50% rule-of-thumb.
function marginClass(margin) {
  if (!Number.isFinite(margin) || margin === 0) return "";
  return margin >= 0.5 ? "is-good" : "is-bad";
}
