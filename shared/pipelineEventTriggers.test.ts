import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_TRIGGER_TYPES,
  isEventTriggerType,
  eventRuleMatches,
} from "./pipelineEventTriggers.js";

test("catalog has the 3 phase-2 event types", () => {
  assert.deepEqual(EVENT_TRIGGER_TYPES.map((t) => t.type).sort(),
    ["assignee_changed", "card_updated", "field_updated"]);
});

test("isEventTriggerType", () => {
  assert.equal(isEventTriggerType("card_updated"), true);
  assert.equal(isEventTriggerType("field_updated"), true);
  assert.equal(isEventTriggerType("stage_enter"), false);
  assert.equal(isEventTriggerType("time"), false);
});

test("wrong trigger type never matches", () => {
  assert.equal(eventRuleMatches({ triggerType: "card_updated", triggerConfig: null }, "field_updated"), false);
});

test("card_updated / assignee_changed always match their event", () => {
  assert.equal(eventRuleMatches({ triggerType: "card_updated", triggerConfig: null }, "card_updated"), true);
  assert.equal(eventRuleMatches({ triggerType: "assignee_changed", triggerConfig: null }, "assignee_changed"), true);
});

test("field_updated without fieldId matches any field change", () => {
  assert.equal(eventRuleMatches({ triggerType: "field_updated", triggerConfig: null }, "field_updated", { changedFieldIds: [7] }), true);
  assert.equal(eventRuleMatches({ triggerType: "field_updated", triggerConfig: '{}' }, "field_updated", { changedFieldIds: [7] }), true);
});

test("field_updated with fieldId matches only when that field changed", () => {
  const rule = { triggerType: "field_updated", triggerConfig: '{"fieldId":5}' };
  assert.equal(eventRuleMatches(rule, "field_updated", { changedFieldIds: [5, 9] }), true);
  assert.equal(eventRuleMatches(rule, "field_updated", { changedFieldIds: [9] }), false);
  assert.equal(eventRuleMatches(rule, "field_updated", { changedFieldIds: [] }), false);
  assert.equal(eventRuleMatches(rule, "field_updated", {}), false);
});
