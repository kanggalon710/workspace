import { test } from "node:test";
import assert from "node:assert/strict";
import { reorderByDrag, moveByOffset } from "./stageReorder.js";

test("reorderByDrag: moves fromId to the index of toId (insert-before semantics)", () => {
  assert.deepEqual(reorderByDrag([1, 2, 3, 4], 1, 4), [2, 3, 1, 4]); // first -> before last
  assert.deepEqual(reorderByDrag([1, 2, 3, 4], 4, 1), [4, 1, 2, 3]); // last -> before first
  assert.deepEqual(reorderByDrag([1, 2, 3], 1, 2), [1, 2, 3]);       // adjacent fwd: lands where it was
  assert.deepEqual(reorderByDrag([1, 2, 3], 3, 2), [1, 3, 2]);       // adjacent back
  assert.deepEqual(reorderByDrag([1, 2, 3], 2, 2), [1, 2, 3]);       // same id -> no-op
  assert.deepEqual(reorderByDrag([1, 2, 3], 9, 1), [1, 2, 3]);       // missing fromId -> unchanged
  assert.deepEqual(reorderByDrag([1, 2, 3], 1, 9), [1, 2, 3]);       // missing toId -> unchanged
});

test("reorderByDrag: returns a new array, does not mutate input", () => {
  const input = [1, 2, 3];
  const out = reorderByDrag(input, 1, 3);
  assert.deepEqual(input, [1, 2, 3]);
  assert.notEqual(out, input);
});

test("moveByOffset: shifts id by dir, clamped at the ends", () => {
  assert.deepEqual(moveByOffset([1, 2, 3], 2, -1), [2, 1, 3]); // middle left
  assert.deepEqual(moveByOffset([1, 2, 3], 2, 1), [1, 3, 2]);  // middle right
  assert.deepEqual(moveByOffset([1, 2, 3], 1, -1), [1, 2, 3]); // first left -> no-op
  assert.deepEqual(moveByOffset([1, 2, 3], 3, 1), [1, 2, 3]);  // last right -> no-op
  assert.deepEqual(moveByOffset([1, 2, 3], 9, 1), [1, 2, 3]);  // missing id -> unchanged
});

test("moveByOffset: returns a new array, does not mutate input", () => {
  const input = [1, 2, 3];
  const out = moveByOffset(input, 2, 1);
  assert.deepEqual(input, [1, 2, 3]);
  assert.notEqual(out, input);
});
