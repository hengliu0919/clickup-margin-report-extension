import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { parseRateTables, buildMarginReport } from "../src/margin.js";

const root = new URL("../", import.meta.url);
const jsFiles = [
  "content-script.js",
  "options.js",
  "page-bridge.js",
  "popup.js",
  "report.js",
  "src/csv.js",
  "src/margin.js",
  "src/storage.js",
  "scripts/check.mjs",
];

for (const file of jsFiles) {
  execFileSync(process.execPath, ["--check", new URL(file, root).pathname], { stdio: "inherit" });
}

JSON.parse(fs.readFileSync(new URL("manifest.json", root), "utf8"));

const optionsHtml = fs.readFileSync(new URL("options.html", root), "utf8");
for (const expected of [
  "Rate Book Storage",
  "Advanced import/export",
  "Refresh ClickUp users/projects",
]) {
  if (!optionsHtml.includes(expected)) {
    throw new Error(`Options UX is missing "${expected}"`);
  }
}
if (optionsHtml.includes("Google Sheet")) {
  throw new Error("Publish UX should not expose Google Sheet storage yet");
}

const popupHtml = fs.readFileSync(new URL("popup.html", root), "utf8");
for (const expected of [
  "Run Report",
  "viewReport",
  "Open ClickUp",
]) {
  if (!popupHtml.includes(expected)) {
    throw new Error(`Popup UX is missing "${expected}"`);
  }
}

const reportHtml = fs.readFileSync(new URL("report.html", root), "utf8");
for (const expected of [
  "Project Breakdown",
  "Export CSV",
  "Refresh",
]) {
  if (!reportHtml.includes(expected)) {
    throw new Error(`Report page is missing "${expected}"`);
  }
}

const peopleRatesCsv = fs.readFileSync(new URL("sample-data/people-rates.csv", root), "utf8");
const projectRatesCsv = fs.readFileSync(new URL("sample-data/project-rates.csv", root), "utf8");
const { peopleRates, projectRates } = parseRateTables({ peopleRatesCsv, projectRatesCsv });
const entries = [
  {
    id: "e1",
    duration: 2 * 60 * 60 * 1000,
    billable: true,
    start: Date.now(),
    user: { id: 216168243, username: "Marco" },
    task: { id: "t1", name: "Homepage design" },
  },
];
const tasksById = new Map([
  ["t1", { id: "t1", name: "Homepage design", list: { id: "901417274458", name: "Client - Acme" } }],
]);
const report = buildMarginReport({ entries, tasksById, peopleRates, projectRates });

if (report.totals.revenue !== 300 || report.totals.cost !== 110) {
  throw new Error(`Unexpected smoke-test totals: ${JSON.stringify(report.totals)}`);
}

console.log("extension checks passed");
