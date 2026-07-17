import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PIPELINE_FIELD_TYPE_REGISTRY,
  getFieldTypeMeta,
  allowMultiple,
  canAddType,
  searchableFieldIds,
  filterableFields,
  sortableFields,
  cardMatchesFilter,
  compareCardsByField,
  parseFieldConfig,
  isMultiUser,
  parseCoordinate,
} from "./pipelineFieldTypes.js";
import { PIPELINE_FIELD_TYPES } from "./schema.js";
import type { PipelineField } from "./schema.js";

// Minimal field factory (only the props the helpers read).
function f(over: Partial<PipelineField> & { id: number; type: string }): PipelineField {
  return {
    id: over.id, mitraId: 1, pipelineId: 1, key: `k${over.id}`,
    label: over.label ?? `F${over.id}`, type: over.type, options: over.options ?? null,
    config: over.config ?? null,
    required: 0, showOnCard: 0, position: over.position ?? 0,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null,
  } as PipelineField;
}

test("registry has an entry for every PipelineFieldType, and keys match meta.type", () => {
  for (const t of PIPELINE_FIELD_TYPES) {
    const meta = PIPELINE_FIELD_TYPE_REGISTRY[t];
    assert.ok(meta, `missing registry entry for ${t}`);
    assert.equal(meta.type, t);
    assert.ok(meta.label.length > 0, `empty label for ${t}`);
  }
  // No stray entries beyond the union.
  assert.equal(Object.keys(PIPELINE_FIELD_TYPE_REGISTRY).length, PIPELINE_FIELD_TYPES.length);
});

test("getFieldTypeMeta returns meta for known types, undefined otherwise", () => {
  assert.equal(getFieldTypeMeta("phone")?.label, "Telepon");
  assert.equal(getFieldTypeMeta("nope"), undefined);
});

test("allowMultiple is the inverse of singleton", () => {
  for (const t of PIPELINE_FIELD_TYPES) {
    assert.equal(allowMultiple(t), !PIPELINE_FIELD_TYPE_REGISTRY[t].singleton);
  }
});

test("canAddType: non-singleton always allowed, singleton blocks a second, unknown rejected", () => {
  assert.equal(canAddType([], "nonexistent"), false);
  for (const meta of Object.values(PIPELINE_FIELD_TYPE_REGISTRY)) {
    if (meta.singleton) {
      assert.equal(canAddType([], meta.type), true, `${meta.type} addable when none exist`);
      assert.equal(canAddType([{ type: meta.type }], meta.type), false, `${meta.type} blocked when one exists`);
    } else {
      assert.equal(canAddType([{ type: meta.type }], meta.type), true, `${meta.type} dup allowed`);
    }
  }
});

test("searchable/filterable/sortable selectors pick the right fields", () => {
  const fields = [f({ id: 1, type: "text" }), f({ id: 2, type: "checkbox" }), f({ id: 3, type: "dropdown" })];
  assert.deepEqual(searchableFieldIds(fields), [1, 3]);            // text+dropdown searchable, checkbox not
  assert.deepEqual(filterableFields(fields).map((x) => x.id), [2, 3]); // checkbox+dropdown filterable
  assert.deepEqual(sortableFields(fields).map((x) => x.id), [1, 2, 3]); // text+checkbox+dropdown sortable
});

test("cardMatchesFilter: equality for scalars, membership for multiselect, empty filter passes", () => {
  const drop = f({ id: 3, type: "dropdown" });
  assert.equal(cardMatchesFilter({ 3: "A" }, drop, ""), true);   // empty filter => no constraint
  assert.equal(cardMatchesFilter({ 3: "A" }, drop, "A"), true);
  assert.equal(cardMatchesFilter({ 3: "B" }, drop, "A"), false);
  assert.equal(cardMatchesFilter(undefined, drop, "A"), false);
  const multi = f({ id: 4, type: "multiselect" });
  assert.equal(cardMatchesFilter({ 4: JSON.stringify(["X", "Y"]) }, multi, "Y"), true);
  assert.equal(cardMatchesFilter({ 4: JSON.stringify(["X"]) }, multi, "Y"), false);
  assert.equal(cardMatchesFilter({ 4: "not json" }, multi, "Y"), false);
  assert.equal(cardMatchesFilter(undefined, multi, "Y"), false);   // no values → no match
  assert.equal(cardMatchesFilter({ 4: "" }, multi, "Y"), false);   // empty stored value → no match
});

test("compareCardsByField: numeric, date, text; direction; empties last", () => {
  const num = f({ id: 1, type: "number" });
  assert.ok(compareCardsByField({ 1: "2" }, { 1: "10" }, num, "asc") < 0);   // numeric, not lexical
  assert.ok(compareCardsByField({ 1: "2" }, { 1: "10" }, num, "desc") > 0);
  const date = f({ id: 2, type: "date" });
  assert.ok(compareCardsByField({ 2: "2026-01-01" }, { 2: "2026-02-01" }, date, "asc") < 0);
  const text = f({ id: 3, type: "text" });
  assert.ok(compareCardsByField({ 3: "apel" }, { 3: "zebra" }, text, "asc") < 0);
  // empties sort last regardless of direction
  assert.ok(compareCardsByField({ 1: "" }, { 1: "5" }, num, "asc") > 0);
  assert.ok(compareCardsByField({ 1: "" }, { 1: "5" }, num, "desc") > 0);
  assert.equal(compareCardsByField({ 1: "" }, { 1: "" }, num, "asc"), 0);
});

test("user type is now labeled Assignee", () => {
  assert.equal(PIPELINE_FIELD_TYPE_REGISTRY.user.label, "Assignee");
});

test("parseFieldConfig: valid/missing/garbage", () => {
  assert.deepEqual(parseFieldConfig({ config: '{"multiple":true}' } as any), { multiple: true });
  assert.deepEqual(parseFieldConfig({ config: null } as any), {});
  assert.deepEqual(parseFieldConfig({ config: "not json" } as any), {});
});

test("isMultiUser: only user type with multiple=true", () => {
  assert.equal(isMultiUser(f({ id: 1, type: "user", config: '{"multiple":true}' } as any)), true);
  assert.equal(isMultiUser(f({ id: 1, type: "user", config: '{"multiple":false}' } as any)), false);
  assert.equal(isMultiUser(f({ id: 1, type: "user", config: null } as any)), false);
  assert.equal(isMultiUser(f({ id: 1, type: "dropdown", config: '{"multiple":true}' } as any)), false);
});

test("cardMatchesFilter: single assignee = equality, multi assignee = membership", () => {
  const single = f({ id: 5, type: "user" });
  assert.equal(cardMatchesFilter({ 5: "42" }, single, "42"), true);
  assert.equal(cardMatchesFilter({ 5: "42" }, single, "43"), false);
  const multi = f({ id: 6, type: "user", config: '{"multiple":true}' } as any);
  assert.equal(cardMatchesFilter({ 6: JSON.stringify(["42", "43"]) }, multi, "43"), true);
  assert.equal(cardMatchesFilter({ 6: JSON.stringify(["42"]) }, multi, "43"), false);
});

test("coordinate registry entry exists and is singleton", () => {
  const meta = PIPELINE_FIELD_TYPE_REGISTRY.coordinate;
  assert.ok(meta, "coordinate entry missing");
  assert.equal(meta.singleton, true);
  assert.equal(meta.label, "Koordinat");
});

test("parseCoordinate: valid object, out-of-range/garbage/empty → null", () => {
  assert.deepEqual(parseCoordinate(JSON.stringify({ lat: -6.12, lng: 106.81 })), { lat: -6.12, lng: 106.81 });
  assert.equal(parseCoordinate(JSON.stringify({ lat: 91, lng: 0 })), null);
  assert.equal(parseCoordinate(JSON.stringify({ lat: 0, lng: 181 })), null);
  assert.equal(parseCoordinate(JSON.stringify({ lat: "x", lng: 1 })), null);
  assert.equal(parseCoordinate("not json"), null);
  assert.equal(parseCoordinate(""), null);
  assert.equal(parseCoordinate(null), null);
});
