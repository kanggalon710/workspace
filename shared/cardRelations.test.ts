import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RELATION_ENTITY_TYPES,
  isValidEntityType,
  relationHref,
  dedupeRelations,
} from "./cardRelations.js";

test("catalog has the 5 phase-1 types", () => {
  assert.deepEqual(RELATION_ENTITY_TYPES.map((t) => t.type).sort(),
    ["card", "collection", "customer", "lead", "odp"]);
});

test("isValidEntityType", () => {
  assert.equal(isValidEntityType("customer"), true);
  assert.equal(isValidEntityType("ticket"), false);
  assert.equal(isValidEntityType(""), false);
});

test("relationHref maps each type to a route", () => {
  assert.equal(relationHref("customer", 5), "/customers");
  assert.equal(relationHref("lead", 5), "/leads");
  assert.equal(relationHref("collection", 5), "/collections");
  assert.equal(relationHref("odp", 5), "/odps");
  assert.equal(relationHref("card", 9, { pipelineId: 3 }), "/pipelines/3?card=9");
});

test("relationHref for card without pipelineId falls back to /pipelines", () => {
  assert.equal(relationHref("card", 9), "/pipelines");
});

test("dedupeRelations removes same type+id", () => {
  const out = dedupeRelations([
    { entityType: "customer", entityId: 1 },
    { entityType: "customer", entityId: 1 },
    { entityType: "lead", entityId: 1 },
  ]);
  assert.equal(out.length, 2);
});
