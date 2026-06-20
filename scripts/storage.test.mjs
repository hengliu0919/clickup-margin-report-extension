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

test("default settings include a company block with invoice defaults", () => {
  assert.equal(typeof defaultSettings.company, "object");
  assert.equal(defaultSettings.company.invoicePrefix, "INV");
  assert.equal(defaultSettings.company.paymentTerms, "Net 30");
});
