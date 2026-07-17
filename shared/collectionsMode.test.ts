import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCollectionsMode, legacyCollectionsActive } from "./collectionsMode.js";

test("parseCollectionsMode: default + garbage → legacy", () => {
  assert.equal(parseCollectionsMode(null), "legacy");
  assert.equal(parseCollectionsMode(undefined), "legacy");
  assert.equal(parseCollectionsMode(""), "legacy");
  assert.equal(parseCollectionsMode("LEGACY"), "legacy");
  assert.equal(parseCollectionsMode("weird"), "legacy");
});

test("parseCollectionsMode: pipeline", () => {
  assert.equal(parseCollectionsMode("pipeline"), "pipeline");
});

test("legacyCollectionsActive", () => {
  assert.equal(legacyCollectionsActive("legacy"), true);
  assert.equal(legacyCollectionsActive("pipeline"), false);
});
