import test from "node:test";
import assert from "node:assert/strict";
import { resolveRange, RANGE_PRESETS } from "../src/date-range.js";

// Fixed "now": Wed 2026-06-10 14:00 local.
const now = new Date(2026, 5, 10, 14, 0, 0);

test("every preset resolves to a valid ordered range", () => {
  for (const p of RANGE_PRESETS) {
    if (p.id === "custom") continue;
    const r = resolveRange(p.id, { now });
    assert.ok(r.startMs <= r.endMs, `${p.id} start <= end`);
    assert.match(r.startLabel, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(r.endLabel, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("this-month spans the 1st to today", () => {
  const r = resolveRange("this-month", { now });
  assert.equal(r.startLabel, "2026-06-01");
  assert.equal(r.endLabel, "2026-06-10");
});

test("last-month spans the full previous month", () => {
  const r = resolveRange("last-month", { now });
  assert.equal(r.startLabel, "2026-05-01");
  assert.equal(r.endLabel, "2026-05-31");
});

test("this-week starts on Sunday", () => {
  const r = resolveRange("this-week", { now });
  assert.equal(new Date(r.startMs).getDay(), 0);
  assert.equal(r.endLabel, "2026-06-10");
});

test("last-7 covers 7 calendar days ending today", () => {
  const r = resolveRange("last-7", { now });
  assert.equal(r.startLabel, "2026-06-04");
  assert.equal(r.endLabel, "2026-06-10");
});

test("this-quarter starts at the quarter boundary", () => {
  const r = resolveRange("this-quarter", { now }); // Q2 = Apr 1
  assert.equal(r.startLabel, "2026-04-01");
});

test("this-year starts Jan 1", () => {
  const r = resolveRange("this-year", { now });
  assert.equal(r.startLabel, "2026-01-01");
});

test("custom uses provided dates and fixes reversed input", () => {
  const r = resolveRange("custom", { customStart: "2026-03-01", customEnd: "2026-03-15", now });
  assert.equal(r.startLabel, "2026-03-01");
  assert.equal(r.endLabel, "2026-03-15");
  const rev = resolveRange("custom", { customStart: "2026-03-15", customEnd: "2026-03-01", now });
  assert.ok(rev.startMs <= rev.endMs, "reversed range is corrected");
});
