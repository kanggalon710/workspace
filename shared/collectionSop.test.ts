import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSopAdvance, stageKeysForDivision, isSharedStage, parseOwnerDivisions, computeOverdue, roleClosesCard, type SopStageMeta } from "./collectionSop.js";

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

test("isSharedStage - owner kosong/all atau role terminal → shared", () => {
  assert.equal(isSharedStage({ key: "paid", ownerDivision: null, role: "paid" }), true);
  assert.equal(isSharedStage({ key: "wo", ownerDivision: "marketing", role: "writeoff" }), true); // terminal menang
  assert.equal(isSharedStage({ key: "x", ownerDivision: "all", role: "none" }), true);
  assert.equal(isSharedStage({ key: "y", ownerDivision: "", role: "none" }), true);
  assert.equal(isSharedStage({ key: "z", ownerDivision: undefined, role: "none" }), true);
  assert.equal(isSharedStage({ key: "cs1", ownerDivision: "cs", role: "none" }), false);
  assert.equal(isSharedStage({ key: "fin", ownerDivision: "finance", role: "none" }), false);
});

test("stageKeysForDivision - divisi + stage shared, case-insensitive, urutan terjaga", () => {
  // Shared di LADDER = paid, dismantel, written_off (role terminal, owner null).
  assert.deepEqual(stageKeysForDivision(LADDER, "cs"),
    ["delegasi_cs", "cs_kunjungan", "paid", "dismantel", "written_off"]);
  assert.deepEqual(stageKeysForDivision(LADDER, "MARKETING"),
    ["delegasi_marketing", "mkt_visit", "paid", "dismantel", "written_off"]);
  assert.deepEqual(stageKeysForDivision(LADDER, "finance"),
    ["contacted", "paid", "dismantel", "written_off"]);
  // Divisi tanpa stage sendiri tetap dapat stage shared.
  assert.deepEqual(stageKeysForDivision(LADDER, "nobody"),
    ["paid", "dismantel", "written_off"]);
});

test("stageKeysForDivision - stage owner null non-terminal ikut shared", () => {
  const stages: SopStageMeta[] = [
    { key: "cs1", ownerDivision: "cs", role: "none" },
    { key: "issue", ownerDivision: null, role: "none" },   // shared (owner kosong)
    { key: "mkt1", ownerDivision: "marketing", role: "none" },
  ];
  assert.deepEqual(stageKeysForDivision(stages, "cs"), ["cs1", "issue"]);
  assert.deepEqual(stageKeysForDivision(stages, "marketing"), ["issue", "mkt1"]);
});

test("parseOwnerDivisions - CSV set, trim/lowercase/dedupe, all/kosong → [] (shared)", () => {
  assert.deepEqual(parseOwnerDivisions("cs,marketing"), ["cs", "marketing"]);
  assert.deepEqual(parseOwnerDivisions(" CS , Marketing "), ["cs", "marketing"]); // trim + lowercase
  assert.deepEqual(parseOwnerDivisions("cs,cs,marketing"), ["cs", "marketing"]);   // dedupe
  assert.deepEqual(parseOwnerDivisions("cs"), ["cs"]);                              // legacy single = 1-element set
  assert.deepEqual(parseOwnerDivisions(""), []);                                    // kosong = shared
  assert.deepEqual(parseOwnerDivisions(null), []);
  assert.deepEqual(parseOwnerDivisions(undefined), []);
  assert.deepEqual(parseOwnerDivisions("all"), []);                                 // "all" = shared
  assert.deepEqual(parseOwnerDivisions("cs,all,marketing"), []);                    // "all" di mana pun = shared
});

test("multi-divisi - stage owner set 'cs,marketing' tampil di CS DAN Marketing, bukan Finance", () => {
  const stages: SopStageMeta[] = [
    { key: "shared_stage", ownerDivision: "cs,marketing", role: "none" },
    { key: "cs_only", ownerDivision: "cs", role: "none" },
    { key: "paid", ownerDivision: null, role: "paid" },
  ];
  assert.equal(isSharedStage(stages[0]!), false); // punya divisi spesifik → bukan shared
  assert.deepEqual(stageKeysForDivision(stages, "cs"), ["shared_stage", "cs_only", "paid"]);
  assert.deepEqual(stageKeysForDivision(stages, "marketing"), ["shared_stage", "paid"]);
  assert.deepEqual(stageKeysForDivision(stages, "finance"), ["paid"]); // finance tak termasuk set
});

const TODAY = Date.parse("2026-07-29T10:00:00"); // acuan waktu tetap (Date.now tak dipakai di test)

test("computeOverdue - promise: tanggal janji sudah lewat → overdue (reason promise)", () => {
  assert.deepEqual(computeOverdue({ promiseDate: "2026-07-25", todayMs: TODAY }), { overdue: true, reason: "promise" });
  // Hari-H (akhir hari) belum overdue.
  assert.deepEqual(computeOverdue({ promiseDate: "2026-07-29", todayMs: TODAY }), { overdue: false, reason: null });
  // Masa depan → tidak overdue.
  assert.deepEqual(computeOverdue({ promiseDate: "2026-08-01", todayMs: TODAY }), { overdue: false, reason: null });
});

test("computeOverdue - sla: hanya bila slaDays>0 dan daysInStage>=sla", () => {
  assert.deepEqual(computeOverdue({ slaDays: 3, daysInStage: 3, todayMs: TODAY }), { overdue: true, reason: "sla" });
  assert.deepEqual(computeOverdue({ slaDays: 3, daysInStage: 2.9, todayMs: TODAY }), { overdue: false, reason: null });
  // SLA 0/null → fitur SLA-overdue mati.
  assert.deepEqual(computeOverdue({ slaDays: 0, daysInStage: 99, todayMs: TODAY }), { overdue: false, reason: null });
  assert.deepEqual(computeOverdue({ slaDays: null, daysInStage: 99, todayMs: TODAY }), { overdue: false, reason: null });
});

test("computeOverdue - keduanya terpenuhi → reason 'promise' menang", () => {
  assert.deepEqual(computeOverdue({ promiseDate: "2026-07-01", slaDays: 3, daysInStage: 10, todayMs: TODAY }),
    { overdue: true, reason: "promise" });
});

test("computeOverdue - stage tanpa SLA tapi ada janji lewat → tetap overdue via promise", () => {
  assert.deepEqual(computeOverdue({ promiseDate: "2026-07-01", slaDays: 0, todayMs: TODAY }),
    { overdue: true, reason: "promise" });
});

test("roleClosesCard - hanya paid & writeoff menutup kartu; dismantel TIDAK", () => {
  assert.equal(roleClosesCard("paid"), true);
  assert.equal(roleClosesCard("writeoff"), true);
  assert.equal(roleClosesCard("WriteOff"), true); // case-insensitive
  assert.equal(roleClosesCard("dismantel"), false); // kartu tetap terbuka & terlihat di kolom Dismantel
  assert.equal(roleClosesCard("entry"), false);
  assert.equal(roleClosesCard("none"), false);
  assert.equal(roleClosesCard(null), false);
  assert.equal(roleClosesCard(undefined), false);
});

test("computeOverdue - tak ada janji & tak ada SLA → tidak overdue", () => {
  assert.deepEqual(computeOverdue({ todayMs: TODAY }), { overdue: false, reason: null });
  assert.deepEqual(computeOverdue({ promiseDate: null, slaDays: null, daysInStage: null, todayMs: TODAY }),
    { overdue: false, reason: null });
});
