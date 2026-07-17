import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDefaultPreset, type RolePresetLike } from "./rolePresets.js";
import { cleansePermissionMatrix, ALL_PERMISSION_KEYS } from "./schema.js";

const mk = (over: Partial<RolePresetLike>): RolePresetLike => ({
  id: 1, scope: "global", mitraId: 1, isActive: 1, isDefault: 0, permissions: {}, ...over,
});

test("resolveDefaultPreset: tenant default wins over global default", () => {
  const presets = [
    mk({ id: 1, scope: "global", isDefault: 1 }),
    mk({ id: 2, scope: "tenant", mitraId: 5, isDefault: 1 }),
  ];
  assert.equal(resolveDefaultPreset(presets, 5)?.id, 2);
});

test("resolveDefaultPreset: falls back to global default when tenant has none", () => {
  const presets = [mk({ id: 1, scope: "global", isDefault: 1 }), mk({ id: 2, scope: "tenant", mitraId: 5, isDefault: 0 })];
  assert.equal(resolveDefaultPreset(presets, 5)?.id, 1);
});

test("resolveDefaultPreset: ignores another tenant's default", () => {
  const presets = [mk({ id: 2, scope: "tenant", mitraId: 9, isDefault: 1 })];
  assert.equal(resolveDefaultPreset(presets, 5), null);
});

test("resolveDefaultPreset: null when no defaults", () => {
  assert.equal(resolveDefaultPreset([mk({ isDefault: 0 })], 5), null);
});

test("cleansePermissionMatrix: keeps valid levels, defaults unknown/invalid to none, no stray keys", () => {
  const m = cleansePermissionMatrix({ dashboard: "write", map: "read", bogus: "write", pops: "banana" } as any);
  assert.equal(m.dashboard, "write");
  assert.equal(m.map, "read");
  assert.equal(m.pops, "none");
  assert.equal((m as any).bogus, undefined);
  for (const k of ALL_PERMISSION_KEYS) assert.ok(["none", "read", "write"].includes(m[k]));
});

test("cleansePermissionMatrix: non-object → all none", () => {
  const m = cleansePermissionMatrix(undefined);
  for (const k of ALL_PERMISSION_KEYS) assert.equal(m[k], "none");
});
