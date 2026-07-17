import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCardFilter, cardPassesFilter } from "./cardRowFilter.js";
import type { FieldRuleCondition } from "./fieldRules.js";

const filter: FieldRuleCondition[][] = [[{ source: "field", fieldId: 1, op: "eq", value: "finance" }]];
const vals = (o: Record<number, string>) => new Map<number, string>(Object.entries(o).map(([k, v]) => [Number(k), v]));

test("resolveCardFilter: admin/creator/non-restricted/no-grant → null", () => {
  assert.equal(resolveCardFilter({ isAdmin: true, isCreator: false, restricted: true, grantFilter: filter }), null);
  assert.equal(resolveCardFilter({ isAdmin: false, isCreator: true, restricted: true, grantFilter: filter }), null);
  assert.equal(resolveCardFilter({ isAdmin: false, isCreator: false, restricted: false, grantFilter: filter }), null);
  assert.equal(resolveCardFilter({ isAdmin: false, isCreator: false, restricted: true, grantFilter: null }), null);
  assert.equal(resolveCardFilter({ isAdmin: false, isCreator: false, restricted: true, grantFilter: [] }), null);
});

test("resolveCardFilter: restricted + grant filter → the filter", () => {
  assert.deepEqual(resolveCardFilter({ isAdmin: false, isCreator: false, restricted: true, grantFilter: filter }), filter);
});

test("cardPassesFilter: null → true (no filtering)", () => {
  assert.equal(cardPassesFilter(null, { values: vals({}), stageId: 1 }), true);
});

test("cardPassesFilter: field match / no-match", () => {
  assert.equal(cardPassesFilter(filter, { values: vals({ 1: "Finance" }), stageId: 1 }), true);
  assert.equal(cardPassesFilter(filter, { values: vals({ 1: "sales" }), stageId: 1 }), false);
});

test("cardPassesFilter: stage source", () => {
  const f: FieldRuleCondition[][] = [[{ source: "stage", op: "eq", value: "5" }]];
  assert.equal(cardPassesFilter(f, { values: vals({}), stageId: 5 }), true);
  assert.equal(cardPassesFilter(f, { values: vals({}), stageId: 6 }), false);
});
