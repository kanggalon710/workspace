import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPermissionMatrixFromPreset,
  PERMISSION_PRESETS,
  ALL_PERMISSION_KEYS,
} from "./schema.js";

test("admin preset grants write on every permission key", () => {
  const m = buildPermissionMatrixFromPreset("admin");
  for (const k of ALL_PERMISSION_KEYS) assert.equal(m[k], "write", `key ${k}`);
});

test("viewer preset is read-only on dashboard+map, none elsewhere", () => {
  const m = buildPermissionMatrixFromPreset("viewer");
  assert.equal(m["dashboard"], "read");
  assert.equal(m["map"], "read");
  for (const k of ALL_PERMISSION_KEYS) {
    if (k !== "dashboard" && k !== "map") assert.equal(m[k], "none", `key ${k}`);
  }
});

test("operator preset grants write only on its listed keys, none on the rest", () => {
  const m = buildPermissionMatrixFromPreset("operator");
  const granted = new Set(PERMISSION_PRESETS.operator.permissions);
  for (const k of ALL_PERMISSION_KEYS) {
    assert.equal(m[k], granted.has(k) ? "write" : "none", `key ${k}`);
  }
});

test("matrix has an entry for every canonical key and NO stray label/permissions keys", () => {
  const m = buildPermissionMatrixFromPreset("marketing");
  for (const k of ALL_PERMISSION_KEYS) assert.ok(k in m, `missing ${k}`);
  assert.equal((m as any).label, undefined);
  assert.equal((m as any).permissions, undefined);
  // every value is a valid level
  for (const k of Object.keys(m)) assert.ok(["none", "read", "write"].includes(m[k]));
});
