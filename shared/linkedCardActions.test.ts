import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpawnLineageConfig, masterForSpawn } from "./linkedCardActions.js";

test("parseSpawnLineageConfig: valid relation + reuse flag", () => {
  assert.deepEqual(parseSpawnLineageConfig(JSON.stringify({ relationType: "mirror", reuseExisting: true })),
    { relationType: "mirror", reuseExisting: true });
  assert.deepEqual(parseSpawnLineageConfig(JSON.stringify({ relationType: "duplicate" })),
    { relationType: "duplicate", reuseExisting: false }); // reuse defaults false
});

test("parseSpawnLineageConfig: null on missing/invalid/bad-json", () => {
  assert.equal(parseSpawnLineageConfig(null), null);
  assert.equal(parseSpawnLineageConfig(undefined), null);
  assert.equal(parseSpawnLineageConfig(""), null);
  assert.equal(parseSpawnLineageConfig("{not json"), null);
  assert.equal(parseSpawnLineageConfig(JSON.stringify({ relationType: "bogus" })), null);
  assert.equal(parseSpawnLineageConfig(JSON.stringify({ reuseExisting: true })), null); // no relationType
});

test("masterForSpawn: root → own id, spawned → source master", () => {
  assert.equal(masterForSpawn(null, 10), 10);
  assert.equal(masterForSpawn(0, 10), 10);
  assert.equal(masterForSpawn(undefined, 7), 7);
  assert.equal(masterForSpawn(5, 10), 5);
});
