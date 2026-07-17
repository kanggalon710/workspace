import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pipelineToTemplate,
  remapFieldConfig,
  remapTemplateRule,
  BUILTIN_TEMPLATES,
} from "./pipelineTemplate.js";

// A synthetic pipeline: 2 stages (ids 10,11), 2 fields (ids 20,21).
// field 21 has a requiredWhen referencing field 20 + stage 11.
// rule: trigger stage 10, condition on field 20, set_field action on field 21, fieldMap 20->21,
// plus one cross-pipeline action (targetPipelineId set) that must be dropped.
const input = {
  pipeline: { name: "Src", description: "d", color: "#111", icon: "target" },
  stages: [
    { id: 10, label: "New", color: "#222", position: 0, description: null },
    { id: 11, label: "Done", color: "#333", position: 1, description: "final" },
  ],
  fields: [
    { id: 20, label: "Type", type: "dropdown", options: '["a","b"]', required: 0, showOnCard: 1, position: 0, config: null },
    { id: 21, label: "Note", type: "text", options: null, required: 0, showOnCard: 0, position: 1,
      config: JSON.stringify({ requiredWhen: [[{ source: "field", fieldId: 20, op: "eq", value: "a" }, { source: "stage", op: "eq", value: "11" }]] }) },
  ],
  rules: [
    { name: "R1", triggerType: "stage_enter", triggerStageId: 10, triggerConfig: null,
      conditions: [[{ fieldId: 20, op: "eq", value: "a" }]], enabled: 1,
      actions: [
        { actionType: "set_field", actionConfig: { fieldId: 21, value: "x" }, targetStageId: 11, targetPipelineId: null, titleTemplate: null, copyAssignee: 0, fieldMaps: [{ sourceFieldId: 20, targetFieldId: 21 }] },
        { actionType: "create_card", actionConfig: null, targetStageId: null, targetPipelineId: 999, titleTemplate: "T", copyAssignee: 0, fieldMaps: [] },
      ] },
  ],
};

test("pipelineToTemplate replaces ids with keys and drops cross-pipeline actions", () => {
  const def = pipelineToTemplate(input);
  assert.deepEqual(def.stages.map((s) => s.key), ["stage_0", "stage_1"]);
  assert.deepEqual(def.fields.map((f) => f.key), ["field_0", "field_1"]);
  // field config rewritten to keys
  const cfg = JSON.parse(def.fields[1].config!);
  assert.equal(cfg.requiredWhen[0][0].fieldId, "field_0");
  assert.equal(cfg.requiredWhen[0][1].value, "stage_1");
  // rule rewritten to keys; cross-pipeline action dropped
  const r = def.rules[0];
  assert.equal(r.triggerStageKey, "stage_0");
  assert.equal(r.conditions[0][0].fieldId, "field_0");
  assert.equal(r.actions.length, 1); // create_card with targetPipelineId dropped
  assert.equal(r.actions[0].actionConfig.fieldId, "field_1");
  assert.equal(r.actions[0].targetStageKey, "stage_1");
  assert.deepEqual(r.actions[0].fieldMaps[0], { sourceFieldKey: "field_0", targetFieldKey: "field_1" });
});

test("remap round-trip: keys → fresh ids resolve consistently", () => {
  const def = pipelineToTemplate(input);
  // simulate instantiation assigning new ids
  const stageKeyToId = new Map([["stage_0", 100], ["stage_1", 101]]);
  const fieldKeyToId = new Map([["field_0", 200], ["field_1", 201]]);
  const newCfg = JSON.parse(remapFieldConfig(def.fields[1].config, fieldKeyToId, stageKeyToId)!);
  assert.equal(newCfg.requiredWhen[0][0].fieldId, 200);
  assert.equal(newCfg.requiredWhen[0][1].value, "101");
  const ruleData = remapTemplateRule(def.rules[0], fieldKeyToId, stageKeyToId);
  assert.equal(ruleData.triggerStageId, 100);
  assert.equal(ruleData.conditions[0][0].fieldId, 200);
  assert.equal(ruleData.actions[0].actionConfig.fieldId, 201);
  assert.equal(ruleData.actions[0].targetStageId, 101);
  assert.deepEqual(ruleData.actions[0].fieldMaps[0], { sourceFieldId: 200, targetFieldId: 201 });
});

test("built-in templates are well-formed", () => {
  assert.ok(BUILTIN_TEMPLATES.length >= 5);
  for (const t of BUILTIN_TEMPLATES) {
    assert.ok(t.pipeline.name && Array.isArray(t.stages) && Array.isArray(t.fields) && Array.isArray(t.rules));
    assert.ok(t.stages.every((s) => typeof s.key === "string"));
  }
  const lead = BUILTIN_TEMPLATES.find((t) => t.pipeline.name === "Pipeline Lead");
  assert.ok(lead, "Pipeline Lead template exists");
  assert.equal(lead!.stages.length, 6);
  assert.equal(lead!.fields.length, 4);
  assert.deepEqual(lead!.stages.map((s) => s.label), ["Lead Baru", "Dihubungi", "Survey", "Negosiasi", "Won", "Lost"]);
  assert.ok(lead!.fields.some((f) => f.type === "phone"));
  assert.ok(lead!.fields.some((f) => f.type === "coordinate"));
});
