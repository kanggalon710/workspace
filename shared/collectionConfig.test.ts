import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENTRY_MODES, WRITEOFF_ACTIONS, validateStageMap, stageForOverdue, validateCollectionConfig,
} from "./collectionConfig.js";

const map = [
  { minOverdueDays: 1, maxOverdueDays: 7, stageId: 10, position: 0 },
  { minOverdueDays: 8, maxOverdueDays: 14, stageId: 11, position: 1 },
  { minOverdueDays: 181, maxOverdueDays: null, stageId: 99, position: 2 },
];

test("registries expose the expected keys", () => {
  assert.deepEqual(ENTRY_MODES.map((m) => m.mode), ["create", "move", "create_if_not_exists", "reopen"]);
  assert.deepEqual(WRITEOFF_ACTIONS.map((a) => a.action), ["move_stage", "custom_rule"]);
});

test("validateStageMap: ok / overlap / bad range / open-ended not last", () => {
  assert.equal(validateStageMap(map), null);
  assert.match(validateStageMap([{ minOverdueDays: 1, maxOverdueDays: 7, stageId: 10, position: 0 }, { minOverdueDays: 5, maxOverdueDays: 10, stageId: 11, position: 1 }]) ?? "", /tumpang tindih/);
  assert.match(validateStageMap([{ minOverdueDays: 10, maxOverdueDays: 5, stageId: 10, position: 0 }]) ?? "", /maksimum/);
  assert.match(validateStageMap([{ minOverdueDays: 1, maxOverdueDays: null, stageId: 10, position: 0 }, { minOverdueDays: 8, maxOverdueDays: 14, stageId: 11, position: 1 }]) ?? "", /tumpang tindih/);
  assert.match(validateStageMap([{ minOverdueDays: 0, maxOverdueDays: 7, stageId: 0, position: 0 }]) ?? "", /stage/);
});

test("stageForOverdue: in-range, open-ended, none", () => {
  assert.equal(stageForOverdue(map, 3), 10);
  assert.equal(stageForOverdue(map, 8), 11);
  assert.equal(stageForOverdue(map, 200), 99);
  assert.equal(stageForOverdue(map, 0), null);
  assert.equal(stageForOverdue(map, 100), null);
});

test("validateCollectionConfig: good + each failure", () => {
  const base = { enabled: true, entryThresholdDays: 7, entryMode: "create_if_not_exists", entryStageId: 10, paidStageId: 11, writeoffThresholdDays: 180, writeoffAction: "move_stage", writeoffStageId: 99, writeoffRuleId: null };
  assert.equal(validateCollectionConfig(base as any), null);
  assert.match(validateCollectionConfig({ ...base, entryThresholdDays: -1 } as any) ?? "", /ambang masuk/i);
  assert.match(validateCollectionConfig({ ...base, entryMode: "nope" } as any) ?? "", /mode entry/i);
  assert.match(validateCollectionConfig({ ...base, writeoffAction: "nope" } as any) ?? "", /aksi write-off/i);
  assert.match(validateCollectionConfig({ ...base, writeoffThresholdDays: 3 } as any) ?? "", />= ambang masuk/i);
  assert.match(validateCollectionConfig({ ...base, writeoffStageId: null } as any) ?? "", /stage tujuan write-off/i);
  assert.match(validateCollectionConfig({ ...base, writeoffAction: "custom_rule", writeoffRuleId: null } as any) ?? "", /rule/i);
  assert.equal(validateCollectionConfig({ ...base, writeoffThresholdDays: null, writeoffStageId: null } as any), null);
});
