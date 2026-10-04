import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkArray } from "./batch.js";

test("chunkArray splits into fixed-size chunks with remainder last", () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("chunkArray returns [] for empty input", () => {
  assert.deepEqual(chunkArray([], 10), []);
});

test("chunkArray with size >= length yields one chunk", () => {
  assert.deepEqual(chunkArray([1, 2], 5), [[1, 2]]);
});

test("chunkArray rejects non-positive size", () => {
  assert.throws(() => chunkArray([1], 0));
});
