import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_PIPELINE_STAGES,
  DEFAULT_COLLECTION_STAGES,
  COLLECTION_PIPELINE_FIELDS,
  collectionToCard,
  collectionToFieldValues,
  resolveMultiAssignees,
  classifyCollectionActivity,
  collectionActivityToComment,
  type CollectionRow,
  type CustomerLite,
} from "./collectionsToPipeline.js";

const col = (over: Partial<CollectionRow> = {}): CollectionRow => ({
  id: 7,
  customer_id: 42,
  stage: "contacted",
  issue_type: "no_answer",
  promise_date: null,
  opened_at: "2026-05-01T00:00:00.000Z",
  opened_amount: 150000,
  opened_due_date: "2026-05-01",
  opened_billing_status: "overdue",
  opened_isolir_date: null,
  closed_at: null,
  closed_last_payment_date: null,
  close_reason: null,
  priority: "high",
  notes: "telpon besok",
  assigned_to: 3,
  assigned_at: "2026-05-02T00:00:00.000Z",
  created_by: 1,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-03T00:00:00.000Z",
  ...over,
});

const cust = (over: Partial<CustomerLite> = {}): CustomerLite => ({
  name: "Budi",
  customer_id: "052500015",
  phone: "081234",
  pppoe_username: "budi052",
  package: "20Mbps",
  address: "Jl. Mawar",
  district: "Cilawu",
  village: "Sukamaju",
  lat: -7.2,
  lng: 107.9,
  ...over,
});

test("stages replicate rows ordered by position", () => {
  const out = COLLECTION_PIPELINE_STAGES([
    { key: "b", label: "B", color: "#111", position: 1, role: "none" },
    { key: "a", label: "A", color: "#222", position: 0, role: "entry" },
  ]);
  assert.deepEqual(out.map((s) => s.key), ["a", "b"]);
  assert.equal(out[0].position, 0);
});

test("stages fall back to defaults when rows empty", () => {
  const out = COLLECTION_PIPELINE_STAGES([]);
  assert.deepEqual(out, DEFAULT_COLLECTION_STAGES);
  assert.equal(out[0].key, "new");
  assert.equal(out.length, 6);
});

test("field values omit null/empty and emit coordinate", () => {
  const vals = collectionToFieldValues(col({ notes: "", close_reason: null }), cust());
  const map = Object.fromEntries(vals.map((v) => [v.fieldKey, v.value]));
  assert.equal(map.customer_id, "052500015");
  assert.equal(map.opened_amount, "150000");
  assert.equal(map.source_collection_id, "7");
  assert.equal(map.notes, undefined);
  assert.equal(map.close_reason, undefined);
  assert.equal(map.coordinate, JSON.stringify({ lat: -7.2, lng: 107.9 }));
});

test("coordinate omitted when lat/lng missing", () => {
  const vals = collectionToFieldValues(col(), cust({ lat: null, lng: null }));
  assert.ok(!vals.some((v) => v.fieldKey === "coordinate"));
});

test("card title falls back through name -> billing id -> placeholder", () => {
  const ids = { new: 10, contacted: 11 };
  assert.equal(collectionToCard(col(), cust(), ids, "new", 3).title, "Budi");
  assert.equal(collectionToCard(col(), cust({ name: "" }), ids, "new", 3).title, "052500015");
  assert.equal(
    collectionToCard(col(), cust({ name: "", customer_id: "" }), ids, "new", 3).title,
    "Pelanggan #42",
  );
});

test("card uses known stage, else first stage", () => {
  const ids = { new: 10, contacted: 11 };
  assert.equal(collectionToCard(col({ stage: "contacted" }), cust(), ids, "new", 3).stageId, 11);
  assert.equal(collectionToCard(col({ stage: "ghost" }), cust(), ids, "new", 3).stageId, 10);
  assert.equal(collectionToCard(col(), cust(), ids, "new", null).assigneeId, null);
});

test("resolveMultiAssignees dedups and keeps only valid", () => {
  const valid = new Set([3, 5]);
  const out = resolveMultiAssignees(
    [{ user_id: 3 }, { user_id: 3 }, { user_id: 9 }, { user_id: 5 }],
    valid,
  );
  assert.deepEqual(out, [3, 5]);
});

test("activity classify + comment body", () => {
  assert.equal(classifyCollectionActivity("call"), "comment");
  assert.equal(classifyCollectionActivity("stage_change"), "activity");
  const cm = collectionActivityToComment({
    id: 1, collection_id: 7, user_id: 3, type: "visit", content: "ketemu", photo_data: null, created_at: "x",
  });
  assert.equal(cm.body, "[Kunjungan] ketemu");
  assert.equal(cm.authorId, 3);
});

test("assignees field is type user with multiple config", () => {
  const f = COLLECTION_PIPELINE_FIELDS.find((x) => x.key === "assignees");
  assert.equal(f?.type, "user");
  assert.deepEqual(f?.config, { multiple: true });
});

test("date-ish fields use the date type", () => {
  for (const key of ["opened_due_date", "opened_isolir_date", "promise_date", "closed_payment_date"]) {
    const f = COLLECTION_PIPELINE_FIELDS.find((x) => x.key === key);
    assert.equal(f?.type, "date", `${key} should be a date field`);
  }
});

test("Tgl Isolir falls back to opened_at, normalized to YYYY-MM-DD", () => {
  // no snapshot isolir date -> use opened_at (mirrors /collections display)
  const a = collectionToFieldValues(
    col({ opened_isolir_date: null, opened_at: "2026-04-10T09:30:00.000Z" }), cust(),
  );
  assert.equal(Object.fromEntries(a.map((v) => [v.fieldKey, v.value])).opened_isolir_date, "2026-04-10");
  // explicit snapshot isolir date wins, datetime truncated to date (tz-safe)
  const b = collectionToFieldValues(col({ opened_isolir_date: "2026-04-15 00:00:00" }), cust());
  assert.equal(Object.fromEntries(b.map((v) => [v.fieldKey, v.value])).opened_isolir_date, "2026-04-15");
});

test("due date + promise date normalized to YYYY-MM-DD", () => {
  const vals = collectionToFieldValues(
    col({ opened_due_date: "2026-05-01 00:00:00", promise_date: "2026-05-06T10:00:00Z" }), cust(),
  );
  const map = Object.fromEntries(vals.map((v) => [v.fieldKey, v.value]));
  assert.equal(map.opened_due_date, "2026-05-01");
  assert.equal(map.promise_date, "2026-05-06");
});

test("Tgl Lunas mapped only for closed collections (payment date preferred)", () => {
  const open = collectionToFieldValues(col(), cust());
  assert.equal(Object.fromEntries(open.map((v) => [v.fieldKey, v.value])).closed_payment_date, undefined);
  const closed = collectionToFieldValues(
    col({ closed_at: "2026-05-20T00:00:00.000Z", closed_last_payment_date: "2026-05-19" }), cust(),
  );
  assert.equal(Object.fromEntries(closed.map((v) => [v.fieldKey, v.value])).closed_payment_date, "2026-05-19");
  // closed without a recorded payment date -> fall back to closed_at
  const closedNoPay = collectionToFieldValues(col({ closed_at: "2026-05-20T00:00:00.000Z" }), cust());
  assert.equal(Object.fromEntries(closedNoPay.map((v) => [v.fieldKey, v.value])).closed_payment_date, "2026-05-20");
});

test("pppoe username mapped from customer", () => {
  const vals = collectionToFieldValues(col(), cust());
  assert.equal(Object.fromEntries(vals.map((v) => [v.fieldKey, v.value])).pppoe_username, "budi052");
});
