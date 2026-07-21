import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSopAdvance, stageKeysForDivision, type SopStageMeta } from "./collectionSop.js";

const LADDER: SopStageMeta[] = [
  { key: "new", ownerDivision: "sistem", slaDays: 3, nextStageKey: "contacted", role: "entry" },
  { key: "contacted", ownerDivision: "finance", slaDays: 4, nextStageKey: "delegasi_cs", role: "none" },
  { key: "delegasi_cs", ownerDivision: "cs", slaDays: 4, nextStageKey: "cs_kunjungan", role: "none" },
  { key: "cs_kunjungan", ownerDivision: "cs", slaDays: 3, nextStageKey: "delegasi_marketing", role: "none" },
  { key: "delegasi_marketing", ownerDivision: "marketing", slaDays: 4, nextStageKey: "mkt_visit", role: "none" },
  { key: "mkt_visit", ownerDivision: "marketing", slaDays: 3, nextStageKey: "written_off", role: "none" },
  { key: "paid", ownerDivision: null, slaDays: null, nextStageKey: null, role: "paid" },
  { key: "dismantel", ownerDivision: null, slaDays: null, nextStageKey: null, role: "dismantel" },
  { key: "written_off", ownerDivision: null, slaDays: null, nextStageKey: null, role: "writeoff" },
];
const byKey = new Map(LADDER.map((s) => [s.key, s]));
const terminal = new Set(["paid", "written_off", "dismantel"]);

test("advance ketika SLA terlampaui → stage berikutnya", () => {
  const d = decideSopAdvance("new", 3, byKey, terminal);
  assert.equal(d.advance, true);
  assert.equal(d.toStage, "contacted");
});

test("belum lewat SLA → tidak advance", () => {
  const d = decideSopAdvance("contacted", 3.9, byKey, terminal);
  assert.equal(d.advance, false);
  assert.equal(d.reason, "within_sla");
});

test("tepat di ambang SLA (>=) → advance", () => {
  assert.equal(decideSopAdvance("contacted", 4, byKey, terminal).advance, true);
  assert.equal(decideSopAdvance("delegasi_cs", 4.01, byKey, terminal).toStage, "cs_kunjungan");
  assert.equal(decideSopAdvance("cs_kunjungan", 3, byKey, terminal).toStage, "delegasi_marketing");
  assert.equal(decideSopAdvance("mkt_visit", 3, byKey, terminal).toStage, "written_off");
});

test("stage terminal tidak pernah advance", () => {
  assert.equal(decideSopAdvance("paid", 999, byKey, terminal).advance, false);
  assert.equal(decideSopAdvance("written_off", 999, byKey, terminal).reason, "terminal");
  assert.equal(decideSopAdvance("dismantel", 999, byKey, terminal).reason, "terminal");
});

test("stage tanpa SLA (mis. issue/suspend custom) → no_sla", () => {
  const m = new Map(byKey);
  m.set("issue", { key: "issue", ownerDivision: null, slaDays: 0, nextStageKey: null });
  assert.equal(decideSopAdvance("issue", 100, m, terminal).reason, "no_sla");
});

test("stage tak dikenal → stage_unknown", () => {
  assert.equal(decideSopAdvance("ngawur", 100, byKey, terminal).reason, "stage_unknown");
});

test("next stage hilang dari config → next_missing (tidak crash)", () => {
  const m = new Map<string, SopStageMeta>([["a", { key: "a", slaDays: 1, nextStageKey: "b" }]]);
  assert.equal(decideSopAdvance("a", 5, m, new Set()).reason, "next_missing");
});

test("stageKeysForDivision - case-insensitive", () => {
  assert.deepEqual(stageKeysForDivision(LADDER, "cs"), ["delegasi_cs", "cs_kunjungan"]);
  assert.deepEqual(stageKeysForDivision(LADDER, "MARKETING"), ["delegasi_marketing", "mkt_visit"]);
  assert.deepEqual(stageKeysForDivision(LADDER, "finance"), ["contacted"]);
  assert.deepEqual(stageKeysForDivision(LADDER, "nobody"), []);
});
