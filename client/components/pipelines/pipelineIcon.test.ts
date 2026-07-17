import { test } from "node:test";
import assert from "node:assert/strict";
import { PIPELINE_ICON_MAP, PIPELINE_ICON_NAMES, resolvePipelineIcon, DEFAULT_PIPELINE_ICON } from "./pipelineIcon.js";

test("resolvePipelineIcon: known name returns its icon; unknown/null returns default", () => {
  assert.ok(PIPELINE_ICON_NAMES.includes("layers"));
  assert.ok(PIPELINE_ICON_NAMES.includes("target"));
  assert.equal(resolvePipelineIcon("layers"), PIPELINE_ICON_MAP["layers"]); // known name → its specific icon
  assert.equal(resolvePipelineIcon("target"), PIPELINE_ICON_MAP["target"]);
  assert.equal(resolvePipelineIcon("definitely-not-an-icon"), DEFAULT_PIPELINE_ICON);
  assert.equal(resolvePipelineIcon(null), DEFAULT_PIPELINE_ICON);
  assert.equal(resolvePipelineIcon(""), DEFAULT_PIPELINE_ICON);
});
