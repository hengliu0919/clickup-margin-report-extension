import fs from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const jsFiles = [
  "content-script.js",
  "dashboard.js",
  "invoice.js",
  "page-bridge.js",
  "popup.js",
  "src/clickup-links.js",
  "src/clickup-tab.js",
  "src/csv.js",
  "src/date-range.js",
  "src/dom.js",
  "src/glossary.js",
  "src/invoice.js",
  "src/margin.js",
  "src/rates-view.js",
  "src/report-view.js",
  "src/storage.js",
  "scripts/check.mjs",
  "scripts/design-lint.mjs",
];

// 1. Syntax check every script.
for (const file of jsFiles) {
  execFileSync(process.execPath, ["--check", new URL(file, root).pathname], { stdio: "inherit" });
}

// 2. Manifest is valid JSON and declares the expected hardening.
// Note: the "tabs" permission is required — the dashboard resolves the ClickUp
// tab via chrome.tabs.query({url}), which returns nothing (and hides tab URLs)
// without it. Verified by browser QA. See git history for the attempt to drop it.
const manifest = JSON.parse(fs.readFileSync(new URL("manifest.json", root), "utf8"));
if (!manifest.permissions?.includes("tabs")) {
  throw new Error('manifest must request "tabs" — chrome.tabs.query({url}) needs it to find the ClickUp tab');
}
if (!manifest.content_security_policy?.extension_pages) {
  throw new Error("manifest should declare an explicit extension_pages CSP");
}
if (manifest.options_page !== "dashboard.html") {
  throw new Error("manifest options_page should be dashboard.html");
}

// 3. HTML markers the UI depends on.
assertHtml("dashboard.html", [
  'data-tab="report"',
  'data-tab="rates"',
  'data-tab="settings"',
  'id="tab-report"',
  'id="refreshBtn"',
  'id="rangePreset"',
  'id="rangeStart"',
  'id="excludeInvoiced"',
  'data-tab="invoices"',
  'id="tab-invoices"',
  'src="dashboard.js"',
]);
const dashboardHtml = fs.readFileSync(new URL("dashboard.html", root), "utf8");
if (dashboardHtml.includes("Google Sheet")) {
  throw new Error("UX should not expose Google Sheet storage yet");
}

assertHtml("popup.html", ["Run Report", "viewReport", "Open ClickUp", "Open dashboard"]);
assertHtml("invoice.html", ['id="invoiceSheets"', 'id="clientSelect"', 'id="printBtn"', 'src="invoice.js"']);
assertHtml("dashboard.html", ['id="co-name"', 'id="co-prefix"', 'id="co-notes"']);

// View modules carry the report/rates markup now (built as innerHTML strings).
assertSource("src/report-view.js", ["By project", "By person", "By task", "Invoice CSV", "Generate invoices", "Utilization", "has-tip", "info-dot"]);
assertSource("src/rates-view.js", ["People Rates", "Project Rates", "Refresh ClickUp users/projects", "Clear all rates", "has-tip"]);

function assertHtml(file, markers) {
  const html = fs.readFileSync(new URL(file, root), "utf8");
  for (const marker of markers) {
    if (!html.includes(marker)) throw new Error(`${file} is missing "${marker}"`);
  }
}

function assertSource(file, markers) {
  const src = fs.readFileSync(new URL(file, root), "utf8");
  for (const marker of markers) {
    if (!src.includes(marker)) throw new Error(`${file} is missing "${marker}"`);
  }
}

// 4a. Design-system lint — fail on hardcoded colors, undefined classes, inline styles.
execFileSync(process.execPath, [new URL("scripts/design-lint.mjs", root).pathname], { stdio: "inherit" });

// 4. Run the unit + integration tests (node:test).
const testFiles = ["scripts/margin.test.mjs", "scripts/csv.test.mjs", "scripts/storage.test.mjs", "scripts/invoice.test.mjs", "scripts/links.test.mjs", "scripts/date-range.test.mjs", "scripts/ledger.test.mjs"].map(
  (file) => new URL(file, root).pathname
);
execFileSync(process.execPath, ["--test", ...testFiles], { stdio: "inherit" });

// 5. Optional static type check via JSDoc + tsc, if locally installed. Kept
// zero-dependency by default: only runs when ./node_modules has a real tsc, so
// PATH stubs or a missing install simply skip (never fail) the build.
const localTsc = new URL("node_modules/typescript/bin/tsc", root).pathname;
if (fs.existsSync(localTsc)) {
  execFileSync(process.execPath, [localTsc, "-p", "jsconfig.json", "--noEmit"], {
    stdio: "inherit",
    cwd: new URL(".", root).pathname,
  });
  console.log("type check passed");
} else {
  console.log("type check skipped (install typescript locally to enable: npm i -D typescript)");
}

console.log("extension checks passed");
