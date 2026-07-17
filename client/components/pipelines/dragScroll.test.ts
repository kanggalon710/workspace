import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeScrollDelta } from "./dragScroll.js";

test("edgeScrollDelta scrolls negative near the start edge", () => {
  assert.equal(edgeScrollDelta(10, 0, 1000), -24);
  assert.equal(edgeScrollDelta(79, 0, 1000), -24);
});

test("edgeScrollDelta scrolls positive near the end edge", () => {
  assert.equal(edgeScrollDelta(990, 0, 1000), 24);
  assert.equal(edgeScrollDelta(921, 0, 1000), 24);
});

test("edgeScrollDelta is 0 in the middle", () => {
  assert.equal(edgeScrollDelta(500, 0, 1000), 0);
  assert.equal(edgeScrollDelta(80, 0, 1000), 0);
  assert.equal(edgeScrollDelta(920, 0, 1000), 0);
});

test("edgeScrollDelta is 0 when the container is too small for two edge zones", () => {
  assert.equal(edgeScrollDelta(10, 0, 150), 0);
});

test("edgeScrollDelta honors custom edge/step", () => {
  assert.equal(edgeScrollDelta(30, 0, 1000, 40, 12), -12);
  assert.equal(edgeScrollDelta(975, 0, 1000, 40, 12), 12);
});
