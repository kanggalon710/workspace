import { test } from "node:test";
import assert from "node:assert/strict";
import { BULK_OPS, BULK_MAX_CARDS, validateBulkRequest, applyTagChange, parseTags } from "./bulkCardOps.js";

test("BULK_OPS + cap", () => {
  assert.deepEqual(BULK_OPS, ["assign", "move", "set_field", "add_tag", "remove_tag", "delete"]);
  assert.equal(BULK_MAX_CARDS, 200);
});

test("validateBulkRequest: cardIds rules", () => {
  assert.equal(validateBulkRequest("delete", [1, 2], undefined).ok, true);
  assert.equal(validateBulkRequest("delete", [], undefined).ok, false);       // empty
  assert.equal(validateBulkRequest("delete", "x", undefined).ok, false);      // not array
  assert.equal(validateBulkRequest("delete", [1, -2], undefined).ok, false);  // non-positive
  assert.equal(validateBulkRequest("delete", Array.from({length: 201}, (_, i) => i + 1), undefined).ok, false); // over cap
  assert.equal(validateBulkRequest("bogus", [1], undefined).ok, false);       // unknown op
});

test("validateBulkRequest: per-op payload", () => {
  assert.equal(validateBulkRequest("assign", [1], { assigneeId: 5 }).ok, true);
  assert.equal(validateBulkRequest("assign", [1], { assigneeId: null }).ok, true);
  assert.equal(validateBulkRequest("assign", [1], {}).ok, false);
  assert.equal(validateBulkRequest("move", [1], { stageId: 9 }).ok, true);
  assert.equal(validateBulkRequest("move", [1], { stageId: 0 }).ok, false);
  assert.equal(validateBulkRequest("set_field", [1], { fieldId: 3, value: "x" }).ok, true);
  assert.equal(validateBulkRequest("set_field", [1], { fieldId: 3 }).ok, false);   // value missing
  assert.equal(validateBulkRequest("add_tag", [1], { tag: "VIP" }).ok, true);
  assert.equal(validateBulkRequest("add_tag", [1], { tag: "" }).ok, false);
});

test("parseTags + applyTagChange", () => {
  assert.deepEqual(parseTags(null), []);
  assert.deepEqual(parseTags('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseTags("garbage"), []);
  assert.deepEqual(applyTagChange(["a"], "add_tag", "b"), ["a", "b"]);
  assert.deepEqual(applyTagChange(["a", "b"], "add_tag", "a"), ["a", "b"]); // dedupe
  assert.deepEqual(applyTagChange(["a", "b"], "remove_tag", "a"), ["b"]);
  assert.deepEqual(applyTagChange(["a"], "remove_tag", "z"), ["a"]);        // absent no-op
});
