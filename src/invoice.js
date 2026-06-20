// Pure invoice modeling: turn a computed margin report into one invoice per
// client. Client-facing — exposes only billable hours, rate, and amount due
// (never cost or margin). No DOM here so it can be unit-tested.

/**
 * @typedef {Object} InvoiceLine
 * @property {string} project
 * @property {number} hours      billable hours
 * @property {number} rate       effective rate (revenue / billable hours)
 * @property {number} amount     revenue for the project
 */

/**
 * @typedef {Object} Invoice
 * @property {string} client
 * @property {InvoiceLine[]} lines
 * @property {number} total
 * @property {string} currency
 */

/**
 * Build one invoice per client from a report's projects. Only projects with
 * revenue > 0 are billable. Projects are grouped by client; each becomes a line.
 * @param {object} report  result of buildMarginReport
 * @returns {Invoice[]}
 */
export function buildInvoices(report) {
  const byClient = new Map();
  for (const p of report.projects || []) {
    if (!(p.revenue > 0)) continue;
    if (!byClient.has(p.client)) byClient.set(p.client, []);
    byClient.get(p.client).push({
      project: p.project,
      hours: p.billableHours,
      rate: p.effectiveRate,
      amount: p.revenue,
      lastMs: p.lastMs || 0, // for the per-line "audit in ClickUp" timesheet link
    });
  }

  return [...byClient.entries()].map(([client, lines]) => ({
    client,
    lines: lines.sort((a, b) => b.amount - a.amount),
    total: round(lines.reduce((sum, l) => sum + l.amount, 0)),
    currency: report.currency || "USD",
    workspaceId: report.workspaceId || "",
  }));
}

/**
 * Format a sequential invoice number, e.g. INV-1001.
 * @param {{invoicePrefix?: string, nextInvoiceNumber?: string|number}} company
 * @param {number} [offset] add to the base number (for multiple invoices in one run)
 */
export function invoiceNumber(company, offset = 0) {
  // An explicitly empty prefix means "no prefix" — only default when undefined.
  const raw = company?.invoicePrefix;
  const prefix = (raw === undefined || raw === null ? "INV" : String(raw)).trim();
  const base = Number(company?.nextInvoiceNumber);
  const n = Number.isFinite(base) ? base + offset : offset + 1;
  return prefix ? `${prefix}-${n}` : String(n);
}

/**
 * Compute a due-date label from an issue date and a "Net N" payment term.
 * Falls back to the issue date when the term has no day count.
 * @param {string} issueDate  YYYY-MM-DD
 * @param {string} terms      e.g. "Net 30"
 */
export function dueDate(issueDate, terms) {
  const days = Number(String(terms || "").match(/(\d+)/)?.[1]);
  if (!issueDate || !Number.isFinite(days)) return issueDate || "";
  const d = new Date(`${issueDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
