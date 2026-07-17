import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFieldConditionGroups,
  parseFieldRules,
  isFieldVisible,
  isFieldRequired,
  type FieldRuleCondition,
} from "./fieldRules.js";

const vals = (o: Record<number, string>) => new Map<number, string>(Object.entries(o).map(([k, v]) => [Number(k), v]));

test("field-source eq/neq/contains/empty", () => {
  const g: FieldRuleCondition[][] = [[{ source: "field", fieldId: 1, op: "eq", value: "corporate" }]];
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "Corporate" }), stageId: 5 }), true);
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "retail" }), stageId: 5 }), false);
});

test("stage-source compares stageId", () => {
  const g: FieldRuleCondition[][] = [[{ source: "stage", op: "eq", value: "7" }]];
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({}), stageId: 7 }), true);
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({}), stageId: 8 }), false);
});

test("AND within group, OR across groups", () => {
  const g: FieldRuleCondition[][] = [
    [{ source: "field", fieldId: 1, op: "eq", value: "a" }, { source: "stage", op: "eq", value: "2" }],
    [{ source: "field", fieldId: 1, op: "eq", value: "z" }],
  ];
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "a" }), stageId: 2 }), true);
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "a" }), stageId: 9 }), false);
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "z" }), stageId: 9 }), true);
});

test("empty groups → true", () => {
  assert.equal(evaluateFieldConditionGroups([], { values: vals({}), stageId: 1 }), true);
});

test("parseFieldRules safe-parses config", () => {
  assert.deepEqual(parseFieldRules(null), { visibleWhen: [], requiredWhen: [] });
  assert.deepEqual(parseFieldRules("not json"), { visibleWhen: [], requiredWhen: [] });
  const cfg = JSON.stringify({ multiple: true, visibleWhen: [[{ source: "field", fieldId: 1, op: "eq", value: "x" }]] });
  assert.equal(parseFieldRules(cfg).visibleWhen.length, 1);
  assert.equal(parseFieldRules(cfg).requiredWhen.length, 0);
});

test("isFieldVisible: no rule → true; with rule → evaluated", () => {
  const ctx = { values: vals({ 1: "yes" }), stageId: 1 };
  assert.equal(isFieldVisible({ config: null }, ctx), true);
  assert.equal(isFieldVisible({ config: JSON.stringify({ visibleWhen: [[{ source: "field", fieldId: 1, op: "eq", value: "yes" }]] }) }, ctx), true);
  assert.equal(isFieldVisible({ config: JSON.stringify({ visibleWhen: [[{ source: "field", fieldId: 1, op: "eq", value: "no" }]] }) }, ctx), false);
});

test("isFieldRequired: hidden → false; requiredWhen evaluated; else static flag", () => {
  const ctx = { values: vals({ 1: "x" }), stageId: 3 };
  assert.equal(isFieldRequired({ config: JSON.stringify({ visibleWhen: [[{ source: "field", fieldId: 1, op: "eq", value: "no" }]] }), required: 1 }, ctx), false);
  assert.equal(isFieldRequired({ config: JSON.stringify({ requiredWhen: [[{ source: "stage", op: "eq", value: "3" }]] }), required: 0 }, ctx), true);
  assert.equal(isFieldRequired({ config: JSON.stringify({ requiredWhen: [[{ source: "stage", op: "eq", value: "9" }]] }), required: 0 }, ctx), false);
  assert.equal(isFieldRequired({ config: null, required: 1 }, ctx), true);
  assert.equal(isFieldRequired({ config: null, required: 0 }, ctx), false);
});
