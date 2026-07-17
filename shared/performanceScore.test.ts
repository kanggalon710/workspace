import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScore, parseScoreWeights, labelForScore, DEFAULT_SCORE_WEIGHTS } from "./performanceScore.js";

test("parseScoreWeights: default, partial, invalid, zero-sum", () => {
  assert.deepEqual(parseScoreWeights(null), DEFAULT_SCORE_WEIGHTS);
  assert.deepEqual(parseScoreWeights("oops"), DEFAULT_SCORE_WEIGHTS);
  assert.deepEqual(parseScoreWeights('{"onTime":50}'), { ...DEFAULT_SCORE_WEIGHTS, onTime: 50 });
  assert.deepEqual(parseScoreWeights('{"onTime":0,"completion":0,"checkin":0,"ops":0}'), DEFAULT_SCORE_WEIGHTS);
});

test("labelForScore boundaries", () => {
  assert.equal(labelForScore(80), "Sangat Baik");
  assert.equal(labelForScore(79), "Baik");
  assert.equal(labelForScore(60), "Baik");
  assert.equal(labelForScore(59), "Cukup");
  assert.equal(labelForScore(40), "Cukup");
  assert.equal(labelForScore(39), "Kurang");
});

test("computeScore: semua komponen penuh", () => {
  const r = computeScore({ onTimeRate: 1, completionRate: 1, checkinRate: 1, opsNorm: 1 })!;
  assert.equal(r.score, 100);
  assert.equal(r.stars, 5);
  assert.equal(r.label, "Sangat Baik");
});

test("computeScore: bobot standar campuran", () => {
  // 40×1 + 25×0.5 + 15×0 + 20×0.5 = 40+12.5+0+10 = 62.5 → 63
  const r = computeScore({ onTimeRate: 1, completionRate: 0.5, checkinRate: 0, opsNorm: 0.5 })!;
  assert.equal(r.score, 63);
  assert.equal(r.stars, 4);
  assert.equal(r.label, "Baik");
});

test("computeScore: null diredistribusi proporsional", () => {
  // checkin & ops null → bobot efektif onTime 40/65, completion 25/65
  const r = computeScore({ onTimeRate: 1, completionRate: 0, checkinRate: null, opsNorm: null })!;
  assert.equal(r.score, Math.round((40 / 65) * 100));
});

test("computeScore: semua null → null; clamp di luar 0..1", () => {
  assert.equal(computeScore({ onTimeRate: null, completionRate: null, checkinRate: null, opsNorm: null }), null);
  const r = computeScore({ onTimeRate: 2, completionRate: -1, checkinRate: null, opsNorm: null })!;
  assert.equal(r.score, Math.round((40 / 65) * 100));   // 2→1, -1→0
});

test("computeScore: skor rendah → bintang minimal 1", () => {
  const r = computeScore({ onTimeRate: 0, completionRate: 0, checkinRate: 0, opsNorm: 0 })!;
  assert.equal(r.score, 0);
  assert.equal(r.stars, 1);
  assert.equal(r.label, "Kurang");
});
