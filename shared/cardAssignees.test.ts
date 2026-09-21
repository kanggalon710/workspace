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

test("matchesAssigneeFilter: empty filter true; primary or secondary match (OR/ANY)", () => {
  assert.equal(matchesAssigneeFilter(5, [7], []), true);
  assert.equal(matchesAssigneeFilter(5, [7], [5]), true);       // primary, singleton
  assert.equal(matchesAssigneeFilter(5, [7], [7]), true);       // secondary, singleton
  assert.equal(matchesAssigneeFilter(5, [7], [9]), false);
  assert.equal(matchesAssigneeFilter(null, [], [9]), false);
  assert.equal(matchesAssigneeFilter(5, [7], [9, 7]), true);    // OR: matches via secondary even though 9 doesn't match
  assert.equal(matchesAssigneeFilter(5, [], [9, 11]), false);   // OR: none match
  assert.equal(matchesAssigneeFilter(null, [7, 9], [9]), true); // no primary, matches via secondary
});
