import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportColumns, formatCardForExport, resolveImportRow, type ImportCtx } from "./cardCsv.js";

const fields = [{ id: 7, label: "Telepon", type: "phone" as const, options: null }, { id: 8, label: "Paket", type: "dropdown" as const, options: '["A","B"]' }];

test("buildExportColumns: base + per-field", () => {
  const cols = buildExportColumns(fields);
  assert.deepEqual(cols.slice(0, 5).map((c) => c.key), ["title", "stage", "assignee", "priority", "created"]);
  assert.deepEqual(cols.slice(5).map((c) => c.key), ["f_7", "f_8"]);
  assert.equal(cols[5].label, "Telepon");
});

test("formatCardForExport: base resolved + raw field values", () => {
  const row = formatCardForExport(
    { title: "Budi", priority: "high", createdAt: "2026-05-01T00:00:00.000Z", values: { 7: "0812", 8: "A" } },
    fields, "Negosiasi", "Andi",
  );
  assert.equal(row.title, "Budi");
  assert.equal(row.stage, "Negosiasi");
  assert.equal(row.assignee, "Andi");
  assert.equal(row.priority, "high");
  assert.equal(row.f_7, "0812");
  assert.equal(row.f_8, "A");
});

const ctx: ImportCtx = {
  stageByLabel: new Map([["negosiasi", 11], ["baru", 10]]),
  userByName: new Map([["andi", 3]]),
  fieldsById: new Map(fields.map((f) => [f.id, f])),
  firstStageId: 10,
};
const okValidate = () => null;

test("resolveImportRow: title required", () => {
  const r = resolveImportRow({ title: "", values: {} }, ctx, okValidate);
  assert.equal(r.ok, false);
});

test("resolveImportRow: stage by label, fallback to first", () => {
  const a = resolveImportRow({ title: "X", stage: "Negosiasi", values: {} }, ctx, okValidate);
  assert.equal(a.ok && a.draft.stageId, 11);
  const b = resolveImportRow({ title: "X", stage: "Ghost", values: {} }, ctx, okValidate);
  assert.equal(b.ok && b.draft.stageId, 10); // fallback firstStageId
});

test("resolveImportRow: assignee resolved or skipped; priority default", () => {
  const a = resolveImportRow({ title: "X", assignee: "Andi", priority: "weird", values: {} }, ctx, okValidate);
  assert.equal(a.ok && a.draft.assigneeId, 3);
  assert.equal(a.ok && a.draft.priority, "medium"); // invalid priority → medium
  const b = resolveImportRow({ title: "X", assignee: "Nobody", values: {} }, ctx, okValidate);
  assert.equal(b.ok && b.draft.assigneeId, null); // unknown assignee → null, not an error
});

test("resolveImportRow: field value failing validator → row error", () => {
  const bad = resolveImportRow({ title: "X", values: { 8: "Z" } }, ctx, (f) => (f.id === 8 ? "Nilai tidak valid" : null));
  assert.equal(bad.ok, false);
  assert.match((bad as any).error, /Paket/);
});

test("resolveImportRow: happy path → draft with values", () => {
  const r = resolveImportRow({ title: "Budi", stage: "Baru", values: { 7: "0812" } }, ctx, okValidate);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.draft.title, "Budi");
    assert.deepEqual(r.draft.values, [{ fieldId: 7, value: "0812" }]);
  }
});
