import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFieldPerms, resolveFieldAccess, isFieldHiddenForRole, canEditField } from "./fieldPermissions.js";

const cfg = (perms: any) => JSON.stringify({ multiple: true, fieldPerms: perms });

test("parseFieldPerms: valid map, malformed dropped", () => {
  assert.deepEqual(parseFieldPerms(cfg({ 3: "view", 5: "hidden" })), { 3: "view", 5: "hidden" });
  assert.deepEqual(parseFieldPerms(null), {});
  assert.deepEqual(parseFieldPerms("not json"), {});
  assert.deepEqual(parseFieldPerms(cfg({ 3: "bogus", 4: "edit" })), { 4: "edit" }); // unknown level dropped
});

test("resolveFieldAccess: admin always edit", () => {
  const f = { config: cfg({ 3: "hidden" }) };
  assert.equal(resolveFieldAccess(f, 3, { isAdmin: true, baseEditable: false }), "edit");
});

test("resolveFieldAccess: explicit override per role", () => {
  const f = { config: cfg({ 3: "hidden", 4: "view" }) };
  assert.equal(resolveFieldAccess(f, 3, { isAdmin: false, baseEditable: true }), "hidden");
  assert.equal(resolveFieldAccess(f, 4, { isAdmin: false, baseEditable: true }), "view");
});

test("resolveFieldAccess: default inherits baseEditable", () => {
  const f = { config: cfg({ 3: "hidden" }) };
  assert.equal(resolveFieldAccess(f, 9, { isAdmin: false, baseEditable: true }), "edit");   // no override + cards cap
  assert.equal(resolveFieldAccess(f, 9, { isAdmin: false, baseEditable: false }), "view");  // no override + view only
  assert.equal(resolveFieldAccess({ config: null }, null, { isAdmin: false, baseEditable: true }), "edit");
});

test("isFieldHiddenForRole + canEditField", () => {
  const f = { config: cfg({ 3: "hidden", 4: "view" }) };
  assert.equal(isFieldHiddenForRole(f, 3, { isAdmin: false, baseEditable: true }), true);
  assert.equal(canEditField(f, 4, { isAdmin: false, baseEditable: true }), false);
  assert.equal(canEditField(f, 9, { isAdmin: false, baseEditable: true }), true);
  assert.equal(canEditField(f, 3, { isAdmin: true, baseEditable: false }), true); // admin
});
