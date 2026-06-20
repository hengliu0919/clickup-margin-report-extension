import { formatMoney } from "./src/margin.js";
import { loadSettings } from "./src/storage.js";
import { escapeHtml, dateStamp } from "./src/dom.js";
import { taskUrl } from "./src/clickup-links.js";

const HANDOFF_KEY = "clickup-margin-invoice-data";

const elements = {
  meta: document.querySelector("#invoiceMeta"),
  clientSelect: document.querySelector("#clientSelect"),
  printBtn: document.querySelector("#printBtn"),
  empty: document.querySelector("#emptyState"),
  sheets: document.querySelector("#invoiceSheets"),
};

let invoices = [];
let company = {};
let issueDate = dateStamp();

init();

async function init() {
  const payload = readHandoff();
  const settings = await loadSettings();
  company = payload?.company || settings.company || {};

  // The dashboard now hands over fully-numbered invoices (recorded in the ledger).
  invoices = Array.isArray(payload?.invoices) ? payload.invoices : [];
  if (invoices.length && payload.invoices[0].issueDate) issueDate = payload.invoices[0].issueDate;
  if (!invoices.length) {
    showEmpty("Open the dashboard, run a report, then choose “Generate invoices”.");
    return;
  }

  elements.meta.textContent = `${invoices.length} invoice${invoices.length === 1 ? "" : "s"} · issued ${issueDate}`;
  renderClientFilter();
  renderSheets("all");

  elements.clientSelect.addEventListener("change", () => renderSheets(elements.clientSelect.value));
  elements.printBtn.addEventListener("click", () => window.print());
}

function readHandoff() {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function showEmpty(message) {
  elements.empty.classList.remove("hidden");
  if (message) elements.empty.querySelector(".empty-state-description").textContent = message;
  elements.meta.textContent = "Nothing to invoice";
  elements.clientSelect.classList.add("hidden");
  elements.printBtn.disabled = true;
}

function renderClientFilter() {
  const opts = ['<option value="all">All clients</option>'];
  for (const inv of invoices) {
    opts.push(`<option value="${escapeHtml(inv.client)}">${escapeHtml(inv.client)}</option>`);
  }
  elements.clientSelect.innerHTML = opts.join("");
}

function renderSheets(filter) {
  const shown = filter === "all" ? invoices : invoices.filter((i) => i.client === filter);
  elements.sheets.innerHTML = shown.map((inv) => sheetHtml(inv)).join("");
}

function sheetHtml(inv) {
  const number = inv.number;
  const due = inv.dueDate || "";
  const fromName = company.name || "Your company";
  const fromBlock = [company.name, company.email, company.address].filter(Boolean).join("\n") || "Set your company details in the dashboard Settings tab.";

  const lines = inv.lines
    .map((l) => {
      const auditUrl = taskUrl(l.taskId);
      // The project label is an audit link on screen (to the project's top task);
      // the .audit-arrow is hidden in print so the client-facing invoice is clean.
      const projectCell = auditUrl
        ? `<a class="audit-link" href="${escapeHtml(auditUrl)}" target="_blank" rel="noopener" title="Audit in ClickUp">${escapeHtml(l.project)}<span class="audit-arrow no-print" aria-hidden="true">↗</span></a>`
        : escapeHtml(l.project);
      return `<tr>
        <td>${projectCell}</td>
        <td class="num">${l.hours}</td>
        <td class="num">${formatMoney(l.rate, inv.currency)}</td>
        <td class="num">${formatMoney(l.amount, inv.currency)}</td>
      </tr>`;
    })
    .join("");

  return `<section class="invoice-sheet">
    <div class="invoice-head">
      <div>
        <p class="invoice-title">INVOICE</p>
        <p class="invoice-number">${escapeHtml(number)}</p>
      </div>
      <div class="text-right">
        <div class="invoice-from-name">${escapeHtml(fromName)}</div>
      </div>
    </div>

    <div class="invoice-parties">
      <div>
        <p class="invoice-party-label">From</p>
        <p class="invoice-party-body">${escapeHtml(fromBlock)}</p>
      </div>
      <div>
        <p class="invoice-party-label">Bill to</p>
        <p class="invoice-party-body">${escapeHtml(inv.client)}</p>
      </div>
    </div>

    <div class="invoice-dates">
      <span>Issue date: <strong>${escapeHtml(issueDate)}</strong></span>
      ${due ? `<span>Due date: <strong>${escapeHtml(due)}</strong></span>` : ""}
      ${company.paymentTerms ? `<span>Terms: <strong>${escapeHtml(company.paymentTerms)}</strong></span>` : ""}
    </div>

    <table class="invoice-table">
      <thead>
        <tr>
          <th>Project</th>
          <th class="num">Hours</th>
          <th class="num">Rate</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lines}
        <tr class="invoice-total-row">
          <td colspan="3" class="num">Total due</td>
          <td class="num">${formatMoney(inv.total, inv.currency)}</td>
        </tr>
      </tbody>
    </table>

    ${company.notes ? `<p class="invoice-notes">${escapeHtml(company.notes)}</p>` : ""}
  </section>`;
}
