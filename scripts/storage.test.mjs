import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, demoSettings } from "../src/storage.js";

test("default settings start empty (no demo seeding on first run)", () => {
  assert.deepEqual(defaultSettings.peopleRates, []);
  assert.deepEqual(defaultSettings.projectRates, []);
});

test("demo settings carry sample tables for opt-in load", () => {
  assert.ok(demoSettings.peopleRates.length > 0);
  assert.ok(demoSettings.projectRates.length > 0);
});
