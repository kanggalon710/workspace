import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MITRA_COLLECTION_STAGES,
  isMitraCollectionStage,
  mitraStageCloses,
  currentPeriod,
  prevPeriod,
  isValidPeriod,
  formatPeriodLabel,
  listRecentPeriods,
} from "./mitraCollection.js";

test("stage set: tepat 1 entry, lunas+menunggak menutup kartu", () => {
  const entries = MITRA_COLLECTION_STAGES.filter((s) => s.role === "entry");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, "belum_bayar");
  assert.equal(mitraStageCloses("lunas"), true);
  assert.equal(mitraStageCloses("menunggak"), true);
  assert.equal(mitraStageCloses("belum_bayar"), false);
  assert.equal(mitraStageCloses("dihubungi"), false);
  assert.equal(mitraStageCloses("janji_bayar"), false);
});

test("isMitraCollectionStage: hanya key terdaftar yang valid", () => {
  for (const s of MITRA_COLLECTION_STAGES) assert.equal(isMitraCollectionStage(s.key), true);
  assert.equal(isMitraCollectionStage("paid"), false);
  assert.equal(isMitraCollectionStage(""), false);
  assert.equal(isMitraCollectionStage("LUNAS"), false);
});

test("currentPeriod: format YYYY-MM dengan zero-pad bulan", () => {
  assert.equal(currentPeriod(new Date(2026, 9, 6)), "2026-10");
  assert.equal(currentPeriod(new Date(2026, 0, 1)), "2026-01");
  assert.equal(currentPeriod(new Date(2026, 11, 31)), "2026-12");
});

test("prevPeriod: mundur 1 bulan, termasuk lintas tahun", () => {
  assert.equal(prevPeriod("2026-10"), "2026-09");
  assert.equal(prevPeriod("2026-01"), "2025-12");
  assert.equal(prevPeriod("2026-03"), "2026-02");
});

test("isValidPeriod: terima YYYY-MM, tolak format lain", () => {
  assert.equal(isValidPeriod("2026-10"), true);
  assert.equal(isValidPeriod("2026-01"), true);
  assert.equal(isValidPeriod("2026-12"), true);
  assert.equal(isValidPeriod("2026-13"), false);
  assert.equal(isValidPeriod("2026-00"), false);
  assert.equal(isValidPeriod("2026-1"), false);
  assert.equal(isValidPeriod("26-10"), false);
  assert.equal(isValidPeriod("2026/10"), false);
  assert.equal(isValidPeriod(""), false);
  assert.equal(isValidPeriod("garbage"), false);
});

test("formatPeriodLabel: nama bulan Indonesia + tahun", () => {
  assert.equal(formatPeriodLabel("2026-10"), "Oktober 2026");
  assert.equal(formatPeriodLabel("2026-01"), "Januari 2026");
  assert.equal(formatPeriodLabel("2025-12"), "Desember 2025");
  // Period tidak valid → dikembalikan apa adanya (jangan crash di UI).
  assert.equal(formatPeriodLabel("garbage"), "garbage");
});

test("listRecentPeriods: urut terbaru dulu, mulai bulan berjalan", () => {
  const list = listRecentPeriods(4, new Date(2026, 1, 15)); // Feb 2026
  assert.deepEqual(list, ["2026-02", "2026-01", "2025-12", "2025-11"]);
  assert.equal(listRecentPeriods(1, new Date(2026, 9, 6))[0], "2026-10");
  assert.equal(listRecentPeriods(0).length, 0);
});
