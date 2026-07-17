import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMapMitraId } from "./map-helpers.js";

test("JABNET root + valid mitra param -> that mitra", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: 7, activeMitraId: 1 }), 7);
});
test("JABNET root + NaN param -> activeMitraId", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: NaN, activeMitraId: 1 }), 1);
});
test("JABNET root + 0 or negative -> activeMitraId", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: 0, activeMitraId: 1 }), 1);
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: -3, activeMitraId: 1 }), 1);
});
test("non-JABNET + valid param -> activeMitraId (override ignored)", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: false, queryMitra: 7, activeMitraId: 3 }), 3);
});
test("non-JABNET + no param -> activeMitraId", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: false, queryMitra: NaN, activeMitraId: 3 }), 3);
});
test("JABNET root selecting own mitra -> own", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: 1, activeMitraId: 1 }), 1);
});
