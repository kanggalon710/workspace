import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreMetric, computeKpiScore, templateForRole, DEFAULT_KPI_TEMPLATES, type KpiRoleTemplate } from "./kpiAuto.js";

test("scoreMetric count: value/target di-clamp 0-100", () => {
  assert.equal(scoreMetric({ key: "t", label: "T", kind: "count", target: 20, weight: 1 }, 10), 50);
  assert.equal(scoreMetric({ key: "t", label: "T", kind: "count", target: 20, weight: 1 }, 20), 100);
  assert.equal(scoreMetric({ key: "t", label: "T", kind: "count", target: 20, weight: 1 }, 40), 100); // cap
  assert.equal(scoreMetric({ key: "t", label: "T", kind: "count", target: 20, weight: 1 }, 0), 0);
});

test("scoreMetric count tanpa target: ada output = 100", () => {
  assert.equal(scoreMetric({ key: "t", label: "T", kind: "count", weight: 1 }, 3), 100);
  assert.equal(scoreMetric({ key: "t", label: "T", kind: "count", weight: 1 }, 0), 0);
});

test("scoreMetric rate: apa adanya di-clamp", () => {
  assert.equal(scoreMetric({ key: "a", label: "A", kind: "rate", weight: 1 }, 95), 95);
  assert.equal(scoreMetric({ key: "a", label: "A", kind: "rate", weight: 1 }, 120), 100);
  assert.equal(scoreMetric({ key: "a", label: "A", kind: "rate", weight: 1 }, -5), 0);
});

const TPL: KpiRoleTemplate = { role: "teknisi", label: "Teknisi", metrics: [
  { key: "tickets", label: "WO", kind: "count", target: 20, weight: 50 },
  { key: "attendance", label: "Hadir", kind: "rate", weight: 30 },
  { key: "punctual", label: "Tepat", kind: "rate", weight: 20 },
] };

test("computeKpiScore: rata-rata tertimbang benar", () => {
  // tickets 10/20 => 50 (w50), attendance 100 (w30), punctual 100 (w20)
  // total = (50*50 + 100*30 + 100*20)/100 = (2500+3000+2000)/100 = 75
  const r = computeKpiScore(TPL, { tickets: 10, attendance: 100, punctual: 100 });
  assert.equal(r.total, 75);
  assert.equal(r.breakdown.length, 3);
  assert.equal(r.breakdown[0].score, 50);
  assert.equal(r.breakdown[0].target, 20);
});

test("computeKpiScore: metrik hilang dianggap 0", () => {
  const r = computeKpiScore(TPL, { tickets: 20 }); // attendance/punctual absen => 0
  // (100*50 + 0*30 + 0*20)/100 = 50
  assert.equal(r.total, 50);
});

test("computeKpiScore: bobot 0 diabaikan; total weight 0 => 0", () => {
  const empty: KpiRoleTemplate = { role: "x", label: "X", metrics: [{ key: "a", label: "A", kind: "rate", weight: 0 }] };
  assert.equal(computeKpiScore(empty, { a: 100 }).total, 0);
});

test("templateForRole: fallback ke default (case-insensitive)", () => {
  assert.equal(templateForRole(DEFAULT_KPI_TEMPLATES, "MARKETING").role, "marketing");
  assert.equal(templateForRole(DEFAULT_KPI_TEMPLATES, "role_asing").role, "default");
});

test("DEFAULT_KPI_TEMPLATES: setiap template total bobot 100", () => {
  for (const t of DEFAULT_KPI_TEMPLATES) {
    const sum = t.metrics.reduce((s, m) => s + m.weight, 0);
    assert.equal(sum, 100, `role ${t.role} total bobot != 100`);
  }
});
