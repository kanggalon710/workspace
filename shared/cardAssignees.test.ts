import { test } from "node:test";
import assert from "node:assert/strict";
import { allAssigneeIds, matchesAssigneeFilter } from "./cardAssignees.js";

test("allAssigneeIds: primary first, dedupe, drop null primary", () => {
  assert.deepEqual(allAssigneeIds(5, [7, 9]), [5, 7, 9]);
  assert.deepEqual(allAssigneeIds(5, [5, 7]), [5, 7]);   // dedupe primary in secondary
  assert.deepEqual(allAssigneeIds(null, [7, 9]), [7, 9]);
  assert.deepEqual(allAssigneeIds(undefined, []), []);
  assert.deepEqual(allAssigneeIds(7, [9, 9]), [7, 9]);   // dedupe within secondary
});

test("matchesAssigneeFilter: null filter true; primary or secondary match", () => {
  assert.equal(matchesAssigneeFilter(5, [7], null), true);
  assert.equal(matchesAssigneeFilter(5, [7], 5), true);   // primary
  assert.equal(matchesAssigneeFilter(5, [7], 7), true);   // secondary
  assert.equal(matchesAssigneeFilter(5, [7], 9), false);
  assert.equal(matchesAssigneeFilter(null, [], 9), false);
});
