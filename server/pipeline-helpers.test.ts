import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reorderPositions,
  computeInsertPosition,
  canDeleteStage,
} from "./pipeline-helpers.js";

test("reorderPositions returns contiguous 0-based positions in given order", () => {
  assert.deepEqual(reorderPositions([30, 10, 20]), [
    { id: 30, position: 0 },
    { id: 10, position: 1 },
    { id: 20, position: 2 },
  ]);
});

test("reorderPositions handles empty list", () => {
  assert.deepEqual(reorderPositions([]), []);
});

test("computeInsertPosition appends to end when toPosition is undefined", () => {
  assert.equal(computeInsertPosition(3, undefined), 3);
});

test("computeInsertPosition clamps to [0, count]", () => {
  assert.equal(computeInsertPosition(3, -5), 0);
  assert.equal(computeInsertPosition(3, 99), 3);
  assert.equal(computeInsertPosition(3, 1), 1);
});

test("canDeleteStage is false when stage holds cards", () => {
  assert.equal(canDeleteStage(2), false);
});

test("canDeleteStage is true when stage is empty", () => {
  assert.equal(canDeleteStage(0), true);
});
