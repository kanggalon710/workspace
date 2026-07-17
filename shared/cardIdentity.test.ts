import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_RELATION_TYPES,
  isValidRelationType,
  relationTypeLabel,
  resolveMasterCardId,
} from "./cardIdentity.js";

test("isValidRelationType: only the 4 known types", () => {
  assert.equal(isValidRelationType("mirror"), true);
  assert.equal(isValidRelationType("duplicate"), true);
  assert.equal(isValidRelationType("linked"), true);
  assert.equal(isValidRelationType("child"), true);
  assert.equal(isValidRelationType("root"), false);
  assert.equal(isValidRelationType(""), false);
  assert.equal(isValidRelationType(null), false);
  assert.equal(isValidRelationType(42), false);
});

test("relationTypeLabel: known → label, unknown/null → ''", () => {
  assert.equal(relationTypeLabel("mirror"), "Mirror");
  assert.equal(relationTypeLabel("child"), "Turunan");
  assert.equal(relationTypeLabel("nope"), "");
  assert.equal(relationTypeLabel(null), "");
});

test("resolveMasterCardId: root → ownId, spawned → origin master", () => {
  assert.equal(resolveMasterCardId(null, 10), 10);   // root: no origin master
  assert.equal(resolveMasterCardId(0, 10), 10);      // 0 treated as none
  assert.equal(resolveMasterCardId(undefined, 7), 7);
  assert.equal(resolveMasterCardId(5, 10), 5);       // spawned: inherit origin master
});

test("CARD_RELATION_TYPES exported with 4 entries", () => {
  assert.equal(CARD_RELATION_TYPES.length, 4);
});
