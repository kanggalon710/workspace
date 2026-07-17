import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConditionGroups, evaluateConditionGroups, conditionsUseBilling } from "./pipeline-automation-helpers.js";
import { buildCollectionSnapshot } from "../shared/collectionMetrics.js";

const NOW = Date.parse("2026-01-31T00:00:00Z");
const overdue40 = buildCollectionSnapshot({ dueDate: "2025-12-22", billingPrice: 100000, billingStatus: "overdue", lastPaymentDate: null }, NOW);

test("parseConditionGroups keeps billing rows", () => {
  const raw = JSON.stringify({ groups: [[{ source: "billing", attr: "days_overdue", op: "gt", value: "30" }]] });
  const groups = parseConditionGroups(raw);
  assert.equal(groups.length, 1);
  assert.equal(groups[0][0].attr, "days_overdue");
  assert.equal(conditionsUseBilling(groups), true);
});

test("evaluateConditionGroups: billing days_overdue > 30 passes with snapshot, fails without", () => {
  const groups = parseConditionGroups(JSON.stringify({ groups: [[{ source: "billing", attr: "days_overdue", op: "gt", value: "30" }]] }));
  assert.equal(evaluateConditionGroups(groups, new Map(), overdue40), true);
  assert.equal(evaluateConditionGroups(groups, new Map(), null), false);
});

test("field conditions still work (back-compat, no source)", () => {
  const groups = parseConditionGroups(JSON.stringify({ groups: [[{ fieldId: 5, op: "eq", value: "yes" }]] }));
  assert.equal(conditionsUseBilling(groups), false);
  assert.equal(evaluateConditionGroups(groups, new Map([[5, "yes"]])), true);
  assert.equal(evaluateConditionGroups(groups, new Map([[5, "no"]])), false);
});
