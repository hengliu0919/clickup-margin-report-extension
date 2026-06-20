import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "../src/csv.js";

test("round-trips simple rows", () => {
  const rows = [{ a: "1", b: "x" }, { a: "2", b: "y" }];
  const parsed = parseCsv(toCsv(rows));
  assert.deepEqual(parsed, rows);
});

test("quotes cells containing commas, quotes, and newlines", () => {
  const csv = toCsv([{ name: 'a,"b"\nc' }]);
  const parsed = parseCsv(csv);
  assert.equal(parsed[0].name, 'a,"b"\nc');
});

test("neutralizes formula-injection cells", () => {
  for (const dangerous of ["=SUM(A1)", "+1", "-1", "@cmd", "=HYPERLINK(\"x\")"]) {
    const csv = toCsv([{ name: dangerous }]);
    const lines = csv.split("\n");
    // Value line should start the cell with a guarding apostrophe.
    assert.ok(lines[1].includes(`'${dangerous.replaceAll('"', '""')}`) || lines[1].startsWith(`"'`),
      `expected guard for ${dangerous}, got ${lines[1]}`);
  }
});

test("does not alter safe cells", () => {
  const csv = toCsv([{ name: "Acme Co", rate: "150" }]);
  const parsed = parseCsv(csv);
  assert.equal(parsed[0].name, "Acme Co");
  assert.equal(parsed[0].rate, "150");
});
