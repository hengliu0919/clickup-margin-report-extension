// Build a Chrome Web Store upload zip containing only runtime files.
// Usage: npm run package   ->   dist/clickup-margin-report-<version>.zip
//
// Ships: manifest.json, root *.html/*.js/*.css, src/*.js, icons/*, PRIVACY.md.
// Excludes: dev tooling (scripts/, tests, node_modules, jsconfig, package*,
// docs, .git, *.md except PRIVACY) so nothing dev-only reaches users.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const rootPath = new URL(".", root).pathname;

const manifest = JSON.parse(fs.readFileSync(new URL("manifest.json", root), "utf8"));
const version = manifest.version;

const distDir = new URL("dist/", root).pathname;
fs.mkdirSync(distDir, { recursive: true });
const zipName = `clickup-margin-report-${version}.zip`;
const zipPath = `${distDir}${zipName}`;
fs.rmSync(zipPath, { force: true });

// Top-level entries to include. Globs are expanded by the shell via `zip`.
const includes = [
  "manifest.json",
  "src",
  "icons",
  "PRIVACY.md",
];
// Root files by extension (zip doesn't glob reliably cross-shell, so enumerate).
for (const f of fs.readdirSync(rootPath)) {
  if (/\.(html|js|css)$/.test(f) && fs.statSync(`${rootPath}${f}`).isFile()) includes.push(f);
}

const excludes = [
  "*.test.mjs",
  "node_modules/*",
  ".git/*",
  "scripts/*",
  "dist/*",
];

const args = ["-rq", zipPath, ...includes, "-x", ...excludes];
execFileSync("zip", args, { cwd: rootPath, stdio: "inherit" });

// Report contents + guardrails: fail if anything dev-only slipped in.
const listing = execFileSync("unzip", ["-l", zipPath], { encoding: "utf8" });
const banned = listing.split("\n").filter((l) => /\.test\.mjs|scripts\/|node_modules\/|jsconfig|package\.json|package-lock/.test(l));
if (banned.length) {
  console.error("Refusing to ship — dev files found in zip:\n" + banned.join("\n"));
  process.exit(1);
}

const fileCount = (listing.match(/\d\d:\d\d /g) || []).length;
const sizeKb = Math.round(fs.statSync(zipPath).size / 1024);
console.log(`\nBuilt ${zipPath}`);
console.log(`${fileCount} files · ${sizeKb} KB · version ${version}`);
console.log("Upload this to the Chrome Web Store Developer Dashboard.");
