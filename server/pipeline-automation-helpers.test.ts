import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStageEnterRules, buildTargetTitle, pickMappedValues, shapeRuleFieldMaps, evaluateConditions, parseActionConfig, parseConditions, parseTimeTriggerConfig, isTimeRuleDue, shapeRuleActions, parseConditionGroups, evaluateConditionGroups } from "./pipeline-automation-helpers.js";

const rule = (over: any = {}) => ({
  id: 1, mitraId: 1, pipelineId: 1, name: null, triggerStageId: 10,
  actionType: "create_card", targetPipelineId: 2, targetStageId: 20,
  titleTemplate: null, copyAssignee: 0, enabled: 1, createdBy: 1, createdAt: "", updatedAt: null, ...over,
});

test("matchStageEnterRules returns ALL enabled rules whose triggerStageId matches (any action type)", () => {
  const rules = [
    rule(),
    rule({ id: 2, triggerStageId: 99 }),
    rule({ id: 3, enabled: 0 }),
    rule({ id: 4, actionType: "set_field" }),
    rule({ id: 5, actionType: "move_stage" }),
  ];
  const matched = matchStageEnterRules(rules as any, 10);
  assert.deepEqual(matched.map((r) => r.id), [1, 4, 5]);
});

test("matchStageEnterRules empty when no stage match", () => {
  assert.deepEqual(matchStageEnterRules([rule()] as any, 11), []);
});

test("buildTargetTitle copies source title when template is empty", () => {
  assert.equal(buildTargetTitle(null, "Pelanggan A"), "Pelanggan A");
  assert.equal(buildTargetTitle("", "Pelanggan A"), "Pelanggan A");
});

test("buildTargetTitle substitutes {title}", () => {
  assert.equal(buildTargetTitle("Survei: {title}", "Pelanggan A"), "Survei: Pelanggan A");
  assert.equal(buildTargetTitle("{title} / {title}", "X"), "X / X");
});

test("buildTargetTitle caps at 255 chars", () => {
  assert.equal(buildTargetTitle("{title}", "a".repeat(300)).length, 255);
});

test("pickMappedValues copies non-empty source values to target field ids", () => {
  const maps = [{ sourceFieldId: 1, targetFieldId: 10 }, { sourceFieldId: 2, targetFieldId: 20 }];
  const srcVals = { 1: "169999", 2: "" };
  assert.deepEqual(pickMappedValues(maps, srcVals), [{ fieldId: 10, value: "169999" }]);
});

test("pickMappedValues skips source fields with no value entry", () => {
  const maps = [{ sourceFieldId: 5, targetFieldId: 50 }];
  assert.deepEqual(pickMappedValues(maps, {}), []);
});

test("pickMappedValues empty maps → []", () => {
  assert.deepEqual(pickMappedValues([], { 1: "x" }), []);
});

test("shapeRuleFieldMaps: resolves labels and types from both maps", () => {
  const src = new Map([[1, { label: "Harga", type: "number" }]]);
  const tgt = new Map([[9, { label: "Harga Deal", type: "number" }]]);
  const out = shapeRuleFieldMaps([{ id: 5, sourceFieldId: 1, targetFieldId: 9 }], src, tgt);
  assert.deepEqual(out, [{
    id: 5, sourceFieldId: 1, targetFieldId: 9,
    sourceFieldLabel: "Harga", sourceFieldType: "number",
    targetFieldLabel: "Harga Deal", targetFieldType: "number",
  }]);
});

test("shapeRuleFieldMaps: missing source/target field → (dihapus) fallback + null type", () => {
  const out = shapeRuleFieldMaps(
    [{ id: 7, sourceFieldId: 2, targetFieldId: 3 }],
    new Map(), new Map(),
  );
  assert.equal(out[0].sourceFieldLabel, "Field #2 (dihapus)");
  assert.equal(out[0].sourceFieldType, null);
  assert.equal(out[0].targetFieldLabel, "Field #3 (dihapus)");
  assert.equal(out[0].targetFieldType, null);
});

test("shapeRuleFieldMaps: empty maps → []", () => {
  assert.deepEqual(shapeRuleFieldMaps([], new Map(), new Map()), []);
});

test("evaluateConditions: null / empty list → always true", () => {
  assert.equal(evaluateConditions(null, new Map()), true);
  assert.equal(evaluateConditions([], new Map([[1, "x"]])), true);
});

test("evaluateConditions: eq / neq / contains are case-insensitive and trimmed", () => {
  const vals = new Map([[1, "  Tinggi "]]);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "eq", value: "tinggi" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "neq", value: "rendah" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "contains", value: "ngg" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "eq", value: "rendah" }], vals), false);
});

test("evaluateConditions: gt / lt parse numbers; NaN operand → false", () => {
  const vals = new Map([[1, "1500000"]]);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "gt", value: "1000000" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "lt", value: "1000000" }], vals), false);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "gt", value: "abc" }], vals), false);
  assert.equal(evaluateConditions([{ fieldId: 2, op: "gt", value: "5" }], new Map([[2, "x"]])), false);
});

test("evaluateConditions: empty / not_empty + missing field treated as empty", () => {
  assert.equal(evaluateConditions([{ fieldId: 1, op: "empty" }], new Map()), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "not_empty" }], new Map([[1, "v"]])), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "not_empty" }], new Map([[1, "  "]])), false);
});

test("evaluateConditions: AND across all entries", () => {
  const vals = new Map([[1, "Tinggi"], [2, "2000000"]]);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "eq", value: "Tinggi" }, { fieldId: 2, op: "gt", value: "1000000" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "eq", value: "Tinggi" }, { fieldId: 2, op: "gt", value: "9000000" }], vals), false);
});

test("parseActionConfig: valid per type", () => {
  assert.deepEqual(parseActionConfig("set_field", JSON.stringify({ fieldId: 3, value: "Diproses" })), { fieldId: 3, value: "Diproses" });
  assert.deepEqual(parseActionConfig("move_stage", JSON.stringify({ stageId: 7 })), { stageId: 7 });
  assert.deepEqual(parseActionConfig("assign", JSON.stringify({ assigneeId: 12 })), { assigneeId: 12 });
  assert.deepEqual(parseActionConfig("assign", JSON.stringify({ assigneeId: null })), { assigneeId: null });
});

test("parseActionConfig: malformed / missing key / create_card → null", () => {
  assert.equal(parseActionConfig("set_field", "{not json"), null);
  assert.equal(parseActionConfig("set_field", JSON.stringify({ fieldId: 3 })), null);
  assert.equal(parseActionConfig("move_stage", JSON.stringify({ stageId: "7" })), null);
  assert.equal(parseActionConfig("assign", JSON.stringify({ assigneeId: "x" })), null);
  assert.equal(parseActionConfig("set_field", null), null);
  assert.equal(parseActionConfig("create_card", JSON.stringify({ fieldId: 1, value: "a" })), null);
});

test("parseConditions: valid array, malformed → [], filters bad entries", () => {
  assert.deepEqual(parseConditions(JSON.stringify([{ fieldId: 1, op: "eq", value: "x" }])), [{ fieldId: 1, op: "eq", value: "x" }]);
  assert.deepEqual(parseConditions("nope"), []);
  assert.deepEqual(parseConditions(null), []);
  assert.deepEqual(parseConditions(JSON.stringify([{ fieldId: 1, op: "eq" }, { nope: true }])), [{ fieldId: 1, op: "eq" }]);
});

const T0 = "2026-06-01T00:00:00.000Z";              // anchor base
const baseCard = { createdAt: T0, stageEnteredAt: T0 };
const cfg = (over: any = {}) => ({
  anchor: "stage_entered", offsetN: 3, offsetUnit: "days", direction: "after", repeat: "once", ...over,
});

test("parseTimeTriggerConfig: valid per anchor", () => {
  assert.deepEqual(parseTimeTriggerConfig(JSON.stringify(cfg())), { anchor: "stage_entered", fieldId: undefined, offsetN: 3, offsetUnit: "days", direction: "after", repeat: "once", repeatEveryN: undefined });
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ anchor: "field_date", fieldId: 7, direction: "before" })))!.fieldId, 7);
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ repeat: "every", repeatEveryN: 2 })))!.repeatEveryN, 2);
});

test("parseTimeTriggerConfig: malformed / missing → null", () => {
  assert.equal(parseTimeTriggerConfig(null), null);
  assert.equal(parseTimeTriggerConfig("{nope"), null);
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ anchor: "bogus" }))), null);
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ offsetN: -1 }))), null);
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ anchor: "field_date" }))), null); // no fieldId
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ repeat: "every" }))), null);      // no repeatEveryN
  assert.equal(parseTimeTriggerConfig('{"anchor":"stage_entered","offsetN":1e999,"offsetUnit":"days","direction":"after","repeat":"once"}'), null);               // 1e999 → Infinity offset
  assert.equal(parseTimeTriggerConfig('{"anchor":"stage_entered","offsetN":3,"offsetUnit":"days","direction":"after","repeat":"every","repeatEveryN":1e999}'), null); // 1e999 → Infinity interval
});

test("isTimeRuleDue: once fires only at/after threshold and only once", () => {
  const before = new Date("2026-06-03T00:00:00Z"); // +2d < +3d
  const after = new Date("2026-06-04T00:00:00Z");  // +3d
  assert.equal(isTimeRuleDue(cfg(), baseCard, new Map(), before, null), false);
  assert.equal(isTimeRuleDue(cfg(), baseCard, new Map(), after, null), true);
  assert.equal(isTimeRuleDue(cfg(), baseCard, new Map(), after, T0), false); // already fired
});

test("isTimeRuleDue: card_created anchor + hours unit", () => {
  const c = { anchor: "card_created", offsetN: 36, offsetUnit: "hours", direction: "after", repeat: "once" };
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), new Date("2026-06-02T11:00:00Z"), null), false); // +35h
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), new Date("2026-06-02T13:00:00Z"), null), true);  // +37h
});

test("isTimeRuleDue: field_date before-direction; unparseable → false", () => {
  const c = { anchor: "field_date", fieldId: 9, offsetN: 3, offsetUnit: "days", direction: "before", repeat: "once" };
  const vals = new Map([[9, "2026-06-10"]]);          // due − 3d = 2026-06-07
  assert.equal(isTimeRuleDue(c as any, baseCard, vals, new Date("2026-06-06T00:00:00Z"), null), false);
  assert.equal(isTimeRuleDue(c as any, baseCard, vals, new Date("2026-06-07T00:00:00Z"), null), true);
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map([[9, "garbage"]]), new Date("2026-07-01T00:00:00Z"), null), false);
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), new Date("2026-07-01T00:00:00Z"), null), false); // missing
});

test("isTimeRuleDue: every re-fires after interval, not before", () => {
  const c = { anchor: "stage_entered", offsetN: 1, offsetUnit: "days", direction: "after", repeat: "every", repeatEveryN: 2 };
  const now = new Date("2026-06-05T00:00:00Z");
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), now, null), true);                       // first, past +1d gate
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), now, "2026-06-04T00:00:00Z"), false);     // 1d since last < 2d
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), now, "2026-06-02T00:00:00Z"), true);      // 3d since last ≥ 2d
});

test("isTimeRuleDue: every does not fire before the initial offset gate", () => {
  const c = { anchor: "stage_entered", offsetN: 1, offsetUnit: "days", direction: "after", repeat: "every", repeatEveryN: 2 };
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), new Date("2026-06-01T06:00:00Z"), null), false); // 6h < 1d gate
});

test("shapeRuleActions: set_field/move_stage/assign labels + create_card target + maps", () => {
  const fields = new Map([[3, { label: "Status", type: "text" }]]);
  const stages = new Map([[7, "Lunas"]]);
  const users = new Map([[12, "Budi"]]);
  const pipes = new Map([[2, "Instalasi"]]);
  const tgtStages = new Map([[2, new Map([[20, "Survey"]])]]);
  const tgtFields = new Map([[2, new Map([[9, { label: "Harga", type: "number" }]])]]);
  const actions = [
    { id: 1, position: 0, actionType: "set_field", actionConfig: JSON.stringify({ fieldId: 3, value: "Diproses" }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 2, position: 1, actionType: "move_stage", actionConfig: JSON.stringify({ stageId: 7 }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 3, position: 2, actionType: "assign", actionConfig: JSON.stringify({ assigneeId: 12 }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 4, position: 3, actionType: "create_card", actionConfig: null, targetPipelineId: 2, targetStageId: 20, titleTemplate: "X", copyAssignee: 1 },
  ];
  const mapsByAction = new Map([[4, [{ id: 5, sourceFieldId: 3, targetFieldId: 9 }]]]);
  const out = shapeRuleActions(actions as any, { fields, stages, users, pipes, tgtStages, tgtFields, mapsByAction });
  assert.equal(out[0].setFieldLabel, "Status");
  assert.deepEqual(out[0].actionConfig, { fieldId: 3, value: "Diproses" });
  assert.equal(out[1].moveStageName, "Lunas");
  assert.equal(out[2].assigneeName, "Budi");
  assert.equal(out[3].targetPipelineName, "Instalasi");
  assert.equal(out[3].targetStageName, "Survey");
  assert.equal(out[3].fieldMaps[0].sourceFieldLabel, "Status");
  assert.equal(out[3].fieldMaps[0].targetFieldLabel, "Harga");
});

test("shapeRuleActions: deleted refs → (dihapus) fallbacks; null-assignee; non-create_card fieldMaps []", () => {
  const empty = new Map();
  const actions = [
    { id: 1, position: 0, actionType: "move_stage", actionConfig: JSON.stringify({ stageId: 99 }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 2, position: 1, actionType: "set_field", actionConfig: JSON.stringify({ fieldId: 88, value: "x" }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 3, position: 2, actionType: "assign", actionConfig: JSON.stringify({ assigneeId: 77 }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 4, position: 3, actionType: "assign", actionConfig: JSON.stringify({ assigneeId: null }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 5, position: 4, actionType: "create_card", actionConfig: null, targetPipelineId: 55, targetStageId: 66, titleTemplate: null, copyAssignee: 0 },
  ];
  const out = shapeRuleActions(actions as any, { fields: empty, stages: empty, users: empty, pipes: empty, tgtStages: empty, tgtFields: empty, mapsByAction: new Map() });
  assert.equal(out[0].moveStageName, "Stage #99 (dihapus)");
  assert.equal(out[0].fieldMaps.length, 0);                        // non-create_card → []
  assert.equal(out[1].setFieldLabel, "Field #88 (dihapus)");
  assert.equal(out[2].assigneeName, "User #77 (dihapus)");
  assert.equal(out[3].assigneeName, undefined);                    // null assignee → undefined
  assert.equal(out[4].targetPipelineName, "Pipeline #55 (dihapus)");
  assert.equal(out[4].targetStageName, "Stage #66 (dihapus)");
});

test("parseConditionGroups: legacy flat array → one AND group", () => {
  assert.deepEqual(parseConditionGroups(JSON.stringify([{ fieldId: 1, op: "eq", value: "x" }])), [[{ fieldId: 1, op: "eq", value: "x" }]]);
});

test("parseConditionGroups: {groups} shape parsed; empty groups dropped; null → []", () => {
  const raw = JSON.stringify({ groups: [[{ fieldId: 1, op: "eq", value: "a" }], [], [{ fieldId: 2, op: "not_empty" }]] });
  assert.deepEqual(parseConditionGroups(raw), [[{ fieldId: 1, op: "eq", value: "a" }], [{ fieldId: 2, op: "not_empty" }]]);
  assert.deepEqual(parseConditionGroups(null), []);
  assert.deepEqual(parseConditionGroups("{bad"), []);
  assert.deepEqual(parseConditionGroups(JSON.stringify({ groups: [[{ nope: true }]] })), []); // bad entries filtered → group empty → dropped
});

test("evaluateConditionGroups: no groups → true (always run)", () => {
  assert.equal(evaluateConditionGroups([], new Map()), true);
});

test("evaluateConditionGroups: ANY group passing → true; none → false", () => {
  const vals = new Map([[1, "Tinggi"], [2, "rendah"]]);
  assert.equal(evaluateConditionGroups([[{ fieldId: 1, op: "eq", value: "Tinggi" }, { fieldId: 2, op: "eq", value: "tinggi" }], [{ fieldId: 1, op: "eq", value: "Sedang" }]], vals), false);
  assert.equal(evaluateConditionGroups([[{ fieldId: 1, op: "eq", value: "Tinggi" }], [{ fieldId: 1, op: "eq", value: "Sedang" }]], vals), true);
  assert.equal(evaluateConditionGroups([[{ fieldId: 1, op: "eq", value: "Tinggi" }, { fieldId: 2, op: "not_empty" }]], vals), true);
});

test("parseActionConfig notify: valid bell+webhook / bell-user / malformed", () => {
  assert.deepEqual(parseActionConfig("notify", JSON.stringify({ channels: ["bell", "webhook"], bellTarget: "assignee", webhookUrl: "https://n8n/x" })),
    { channels: ["bell", "webhook"], bellTarget: "assignee", webhookUrl: "https://n8n/x" });
  assert.deepEqual(parseActionConfig("notify", JSON.stringify({ channels: ["bell"], bellTarget: "user", bellUserId: 7, bellTitle: "Hi {title}" })),
    { channels: ["bell"], bellTarget: "user", bellUserId: 7, bellTitle: "Hi {title}" });
  assert.deepEqual(parseActionConfig("notify", JSON.stringify({ channels: ["webhook"], webhookUrl: "https://hook.example/x" })),
    { channels: ["webhook"], webhookUrl: "https://hook.example/x" });
  assert.equal(parseActionConfig("notify", JSON.stringify({ channels: [] })), null);
  assert.equal(parseActionConfig("notify", JSON.stringify({ channels: ["bell"], bellTarget: "bad" })), null);
  assert.equal(parseActionConfig("notify", JSON.stringify({ channels: ["bell"], bellTarget: "user" })), null);
  assert.equal(parseActionConfig("notify", JSON.stringify({ channels: ["webhook"] })), null);
  assert.equal(parseActionConfig("notify", "{bad"), null);
});

test("shapeRuleActions notify: label from channels + target", () => {
  const empty = new Map();
  const out = shapeRuleActions(
    [{ id: 1, position: 0, actionType: "notify", actionConfig: JSON.stringify({ channels: ["bell", "webhook"], bellTarget: "creator", webhookUrl: "https://n8n/x" }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 }] as any,
    { fields: empty, stages: empty, users: empty, pipes: empty, tgtStages: empty, tgtFields: empty, mapsByAction: new Map() },
  );
  assert.equal(out[0].notifyLabel, "bell→creator, webhook");
  assert.equal(out[0].fieldMaps.length, 0);
});
