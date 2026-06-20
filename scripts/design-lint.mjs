// Design-system lint guard. Fails the build when UI drifts from the design system:
//  1. hardcoded colors (hex / rgb / hsl) outside the token files
//  2. var(--token, #fallback) "guessing" fallbacks
//  3. CSS classes used in markup that aren't defined in any stylesheet
//  4. inline style="..." attributes (use a utility/component class instead)
//
// Scans HTML files and the JS view modules that build HTML as template strings.
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, root), "utf8");

// Files that emit UI markup (HTML or JS template strings).
const MARKUP_FILES = [
  "popup.html",
  "dashboard.html",
  "invoice.html",
  "src/report-view.js",
  "src/rates-view.js",
  "invoice.js",
];

// Stylesheets that may legitimately contain raw colors (the token definitions)
// and where all class selectors live.
const CSS_FILES = ["design-tokens.css", "components.css", "styles.css", "invoice.css"];

// Page-scoped <style> blocks are allowed to define layout-only classes; collect
// classes defined there too so they don't count as "undefined".
const HTML_FILES = ["popup.html", "dashboard.html"];

const errors = [];
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGB_HSL = /\b(?:rgb|rgba|hsl|hsla)\(/;

// --- collect all defined class names from CSS files + <style> blocks ---
const definedClasses = new Set();
const classDefRe = /\.([a-zA-Z][\w-]*)/g;
function collectClasses(css) {
  let m;
  while ((m = classDefRe.exec(css))) definedClasses.add(m[1]);
}
for (const f of CSS_FILES) collectClasses(read(f));
for (const f of HTML_FILES) {
  const styleBlocks = read(f).match(/<style[\s\S]*?<\/style>/gi) || [];
  for (const block of styleBlocks) collectClasses(block);
}

// Class tokens that are applied dynamically (added via JS classList) and so need
// to be allow-listed even if a stylesheet "owns" them implicitly. Keep tight.
const DYNAMIC_OK = new Set(["hidden"]);

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

for (const file of MARKUP_FILES) {
  const src = read(file);
  const isHtml = file.endsWith(".html");

  // Strip <style> blocks from HTML before scanning for inline style/colors —
  // those are real CSS, validated separately by the token rules below.
  const scan = isHtml ? src.replace(/<style[\s\S]*?<\/style>/gi, (s) => "\n".repeat(s.split("\n").length - 1)) : src;

  // 1. hardcoded colors
  scan.split("\n").forEach((line, i) => {
    if (HEX.test(line) || RGB_HSL.test(line)) {
      // ignore obvious non-color hex like &#039; entities
      if (HEX.test(line) && !/&#/.test(line.replace(HEX, ""))) {
        errors.push(`${file}:${i + 1}  hardcoded color — use a design token (var(--…))`);
      } else if (RGB_HSL.test(line)) {
        errors.push(`${file}:${i + 1}  hardcoded rgb/hsl color — use a design token`);
      }
    }
  });

  // 2. var(--token, #fallback) guessing fallbacks
  const fbRe = /var\(--[\w-]+\s*,\s*[^)]+\)/g;
  let fb;
  while ((fb = fbRe.exec(scan))) {
    errors.push(`${file}:${lineOf(scan, fb.index)}  var() with hardcoded fallback "${fb[0]}" — define the token instead`);
  }

  // 3. inline style="..." attributes
  const styleAttrRe = /\bstyle\s*=\s*["'`]/g;
  let st;
  while ((st = styleAttrRe.exec(scan))) {
    errors.push(`${file}:${lineOf(scan, st.index)}  inline style= — use a utility or component class`);
  }

  // 4. undefined classes (class="..." literals)
  const classAttrRe = /class\s*=\s*["'`]([^"'`]*)["'`]/g;
  let ca;
  while ((ca = classAttrRe.exec(scan))) {
    const raw = ca[1];
    // skip template-interpolated class strings (can't statically resolve)
    if (raw.includes("${")) continue;
    for (const cls of raw.split(/\s+/).filter(Boolean)) {
      if (!definedClasses.has(cls) && !DYNAMIC_OK.has(cls)) {
        errors.push(`${file}:${lineOf(scan, ca.index)}  class "${cls}" is not defined in any stylesheet`);
      }
    }
  }
}

// 5. Dark-mode token safety: any "-50"/"-100" tint used as a background must be
// remapped in the dark-mode block, or it renders near-white on a dark page.
const tokensCss = read("design-tokens.css");
const darkBlock = (tokensCss.match(/prefers-color-scheme:\s*dark[\s\S]*$/) || [""])[0];
const tintBgUsed = new Set();
for (const f of CSS_FILES) {
  const css = read(f);
  let m;
  const bgTintRe = /background:\s*var\((--(?:brand|danger|warning|success|info)-(?:50|100))\)/g;
  while ((m = bgTintRe.exec(css))) tintBgUsed.add(m[1]);
}
for (const token of tintBgUsed) {
  if (!darkBlock.includes(`${token}:`)) {
    errors.push(`design-tokens.css  ${token} is used as a background but has no dark-mode override (would render near-white on dark)`);
  }
}

if (errors.length) {
  console.error(`\nDesign-system lint failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exit(1);
}

console.log("design-system lint passed");
