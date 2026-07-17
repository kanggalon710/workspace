import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOpticalPower, DEFAULT_OPTICAL_THRESHOLDS, OPTICAL_LEVEL_META } from "./opticalPower.js";

const T = DEFAULT_OPTICAL_THRESHOLDS; // { warn: -25, crit: -28 }

test("defaults match existing hardcoded UI thresholds (-25 / -28)", () => {
  assert.equal(T.warn, -25);
  assert.equal(T.crit, -28);
});

test("classification with default thresholds", () => {
  assert.equal(classifyOpticalPower(-21.5, T), "good");
  assert.equal(classifyOpticalPower(-25, T), "good");      // boundary: >= warn is good
  assert.equal(classifyOpticalPower(-26.2, T), "warn");
  assert.equal(classifyOpticalPower(-28, T), "warn");      // boundary: >= crit is warn
  assert.equal(classifyOpticalPower(-30.1, T), "crit");
});

test("accepts string input (API returns rxPower as string)", () => {
  assert.equal(classifyOpticalPower("-21.5", T), "good");
  assert.equal(classifyOpticalPower("-29", T), "crit");
});

test("unknown for missing/garbage values", () => {
  assert.equal(classifyOpticalPower(null, T), "unknown");
  assert.equal(classifyOpticalPower(undefined, T), "unknown");
  assert.equal(classifyOpticalPower("", T), "unknown");
  assert.equal(classifyOpticalPower("abc", T), "unknown");
  assert.equal(classifyOpticalPower(0, T), "good"); // 0 dBm is a valid (hot) reading, not unknown
});

test("custom thresholds honored (per-ISP configurable)", () => {
  assert.equal(classifyOpticalPower(-24, { warn: -23, crit: -26 }), "warn");
  assert.equal(classifyOpticalPower(-27, { warn: -23, crit: -26 }), "crit");
});

test("every level has display meta", () => {
  for (const k of ["good", "warn", "crit", "unknown"] as const) {
    assert.ok(OPTICAL_LEVEL_META[k].label.length > 0);
  }
});
