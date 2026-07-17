import { test } from "node:test";
import assert from "node:assert/strict";
import { RECURRENCE_MODES, parseRecurrence, dedupBeforeFire, recordAfterFire } from "./ruleRecurrence.js";

test("parseRecurrence: valid modes, else once", () => {
  assert.equal(parseRecurrence("once"), "once");
  assert.equal(parseRecurrence("on_reenter"), "on_reenter");
  assert.equal(parseRecurrence("always"), "always");
  assert.equal(parseRecurrence(null), "once");
  assert.equal(parseRecurrence(undefined), "once");
  assert.equal(parseRecurrence("garbage"), "once");
});

test("dedupBeforeFire / recordAfterFire: false only for always", () => {
  assert.equal(dedupBeforeFire("once"), true);
  assert.equal(dedupBeforeFire("on_reenter"), true);
  assert.equal(dedupBeforeFire("always"), false);
  assert.equal(recordAfterFire("once"), true);
  assert.equal(recordAfterFire("on_reenter"), true);
  assert.equal(recordAfterFire("always"), false);
});

test("RECURRENCE_MODES has 3 entries", () => {
  assert.equal(RECURRENCE_MODES.length, 3);
});
