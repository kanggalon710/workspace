import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePipelineLevel } from "./pipeline-access-helpers.js";

test("admin always gets edit", () => {
  assert.equal(resolvePipelineLevel({ isAdmin: true, restricted: true, keyLevel: "none", grantLevel: "none" }), "edit");
});
test("unrestricted maps the pipelines key level", () => {
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: false, keyLevel: "write", grantLevel: "none" }), "edit");
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: false, keyLevel: "read", grantLevel: "none" }), "view");
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: false, keyLevel: "none", grantLevel: "none" }), "none");
});
test("restricted uses the grant, ignoring the key", () => {
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: true, keyLevel: "write", grantLevel: "view" }), "view");
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: true, keyLevel: "write", grantLevel: "edit" }), "edit");
});
test("restricted with no grant is none even if key is write", () => {
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: true, keyLevel: "write", grantLevel: "none" }), "none");
});
