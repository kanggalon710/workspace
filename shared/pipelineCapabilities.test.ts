import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PIPELINE_CAPABILITIES, ACTION_CAPABILITIES, capabilitiesFromLevel, deriveLevel, parseCapabilities, resolvePipelineCapabilities,
  isAdminLockedRole,
} from "./pipelineCapabilities.js";

test("capabilitiesFromLevel bridges legacy view/edit", () => {
  assert.deepEqual(capabilitiesFromLevel("edit").sort(), [...ALL_PIPELINE_CAPABILITIES].sort());
  assert.deepEqual(capabilitiesFromLevel("view"), ["view"]);
  assert.deepEqual(capabilitiesFromLevel("none"), []);
});

test("deriveLevel: edit-class → edit, view → view, empty → none", () => {
  assert.equal(deriveLevel([...ALL_PIPELINE_CAPABILITIES]), "edit");
  assert.equal(deriveLevel(["cards"]), "edit");
  assert.equal(deriveLevel(["view"]), "view");
  assert.equal(deriveLevel([]), "none");
});

test("parseCapabilities: valid JSON array filtered to known keys; garbage → []", () => {
  assert.deepEqual(parseCapabilities(JSON.stringify(["view", "cards", "bogus"])), ["view", "cards"]);
  assert.deepEqual(parseCapabilities("not json"), []);
  assert.deepEqual(parseCapabilities(null), []);
});

test("resolvePipelineCapabilities: admin/creator → all", () => {
  const a = resolvePipelineCapabilities({ isAdmin: true, isCreator: false, restricted: true, keyLevel: "none", grantCapabilities: [] });
  assert.equal(a.size, ALL_PIPELINE_CAPABILITIES.length);
  const c = resolvePipelineCapabilities({ isAdmin: false, isCreator: true, restricted: true, keyLevel: "none", grantCapabilities: [] });
  assert.equal(c.size, ALL_PIPELINE_CAPABILITIES.length);
});

test("resolvePipelineCapabilities: open pipeline derives from global perm", () => {
  assert.equal(resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: false, keyLevel: "write", grantCapabilities: [] }).size, ALL_PIPELINE_CAPABILITIES.length);
  assert.deepEqual([...resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: false, keyLevel: "read", grantCapabilities: [] })], ["view"]);
  assert.equal(resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: false, keyLevel: "none", grantCapabilities: [] }).size, 0);
});

test("resolvePipelineCapabilities: restricted uses grant + implies view; empty → none", () => {
  const s = resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: true, keyLevel: "write", grantCapabilities: ["cards"] });
  assert.ok(s.has("cards"));
  assert.ok(s.has("view"));
  assert.equal(resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: true, keyLevel: "write", grantCapabilities: [] }).size, 0);
});

test("cards supersets the action capabilities (resolver)", () => {
  const s = resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: true, keyLevel: "none", grantCapabilities: ["cards"] });
  for (const a of ACTION_CAPABILITIES) assert.ok(s.has(a), `expected ${a}`);
  assert.ok(s.has("view"));
});

test("legacy edit level includes the actions", () => {
  const caps = capabilitiesFromLevel("edit");
  for (const a of ACTION_CAPABILITIES) assert.ok(caps.includes(a));
});

test("action-only grant: has its action, not others, derives to view", () => {
  const s = resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: true, keyLevel: "none", grantCapabilities: ["view", "comment"] });
  assert.ok(s.has("comment"));
  assert.ok(!s.has("export"));
  assert.ok(!s.has("cards"));
  assert.equal(deriveLevel([...s]), "view");
});

test("non-restricted write grants all incl. actions", () => {
  const s = resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: false, keyLevel: "write", grantCapabilities: [] });
  assert.ok(s.has("export") && s.has("comment") && s.has("assign") && s.has("import"));
});

test("isAdminLockedRole: system Admin/System-Admin locked, others not", () => {
  assert.equal(isAdminLockedRole({ name: "Admin", isSystem: 1 }), true);
  assert.equal(isAdminLockedRole({ name: "System-Admin", isSystem: 1 }), true);
  assert.equal(isAdminLockedRole({ name: "Admin", isSystem: 0 }), false); // custom role bernama Admin tidak terkunci
  assert.equal(isAdminLockedRole({ name: "Marketing", isSystem: 1 }), false);
  assert.equal(isAdminLockedRole({ name: "Read Only", isSystem: 1 }), false);
  assert.equal(isAdminLockedRole({}), false);
});
