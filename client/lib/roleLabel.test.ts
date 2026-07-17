import { test } from "node:test";
import assert from "node:assert/strict";
import { roleLabel } from "./roleLabel.js";

test("roleLabel prefers dynamic roleName over legacy role text", () => {
  assert.equal(roleLabel({ roleName: "Marketing", role: "operator" }), "Marketing");
  assert.equal(roleLabel({ roleName: "System-Admin", role: "admin" }), "System-Admin");
});

test("roleLabel falls back to legacy role when roleName absent/blank", () => {
  assert.equal(roleLabel({ role: "operator" }), "operator");
  assert.equal(roleLabel({ roleName: "", role: "viewer" }), "viewer");
  assert.equal(roleLabel({ roleName: "   ", role: "viewer" }), "viewer");
});

test("roleLabel returns empty string when nothing available (never invents a default)", () => {
  assert.equal(roleLabel({}), "");
  assert.equal(roleLabel(null), "");
  assert.equal(roleLabel(undefined), "");
  assert.equal(roleLabel({ roleName: null, role: null }), "");
});
