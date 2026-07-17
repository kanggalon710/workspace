import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePeriodBuckets,
  assignCountToBuckets,
  lastValueInBuckets,
  deltaPct,
  buildExecutiveFlags,
} from "./reporting-helpers.js";

const NOW = new Date("2026-06-02T10:00:00"); // fixed anchor for determinism

test("monthly: default 12 calendar-month buckets ending current month", () => {
  const b = computePeriodBuckets("monthly", undefined, undefined, NOW);
  assert.equal(b.length, 12);
  assert.equal(b[11].key, "2026-06");
  assert.equal(b[0].key, "2025-07");
  assert.equal(new Date(b[11].start).getMonth(), 5); // June = month 5
});

test("quarterly: default 8 buckets, current quarter last", () => {
  const b = computePeriodBuckets("quarterly", undefined, undefined, NOW);
  assert.equal(b.length, 8);
  assert.equal(b[7].key, "2026-Q2"); // Jun = Q2
});

test("daily: default 30 day buckets ending today", () => {
  const b = computePeriodBuckets("daily", undefined, undefined, NOW);
  assert.equal(b.length, 30);
  assert.equal(b[29].key, "2026-06-02");
});

test("weekly: default 12 rolling 7-day buckets", () => {
  const b = computePeriodBuckets("weekly", undefined, undefined, NOW);
  assert.equal(b.length, 12);
  assert.ok(new Date(b[11].end).getTime() > NOW.getTime());
});

test("explicit from/to monthly clamps to range", () => {
  const b = computePeriodBuckets("monthly", "2026-01-01", "2026-03-31", NOW);
  assert.deepEqual(b.map((x) => x.key), ["2026-01", "2026-02", "2026-03"]);
});

const NOW2 = new Date("2026-06-02T10:00:00");

test("assignCountToBuckets counts items per bucket by timestamp", () => {
  const buckets = computePeriodBuckets("monthly", "2026-04-01", "2026-06-30", NOW2);
  const items = [
    { t: "2026-04-10" }, { t: "2026-04-20" }, { t: "2026-06-01" },
    { t: "1900-01-01" },
  ];
  const out = assignCountToBuckets(items, (i) => i.t, buckets);
  assert.deepEqual(out.map((x) => x.value), [2, 0, 1]);
});

test("lastValueInBuckets picks latest snapshot value per bucket", () => {
  const buckets = computePeriodBuckets("monthly", "2026-05-01", "2026-06-30", NOW2);
  const snaps = [
    { d: "2026-05-05", v: 700 }, { d: "2026-05-28", v: 710 }, { d: "2026-06-01", v: 715 },
  ];
  const out = lastValueInBuckets(snaps, (s) => s.d, (s) => s.v, buckets);
  assert.deepEqual(out.map((x) => x.value), [710, 715]);
});

test("lastValueInBuckets carries forward last value over empty buckets", () => {
  const buckets = computePeriodBuckets("monthly", "2026-04-01", "2026-06-30", new Date("2026-06-02T10:00:00"));
  const snaps = [{ d: "2026-04-10", v: 700 }, { d: "2026-06-01", v: 715 }]; // no May sample
  const out = lastValueInBuckets(snaps, (s) => s.d, (s) => s.v, buckets);
  assert.deepEqual(out.map((x) => x.value), [700, 700, 715]); // May carries forward 700
});

test("lastValueInBuckets seeds from priorValue when first buckets are empty", () => {
  const buckets = computePeriodBuckets("monthly", "2026-05-01", "2026-06-30", new Date("2026-06-02T10:00:00"));
  const out = lastValueInBuckets([], (s: any) => s.d, (s: any) => s.v, buckets, 690);
  assert.deepEqual(out.map((x) => x.value), [690, 690]);
});

test("deltaPct computes percentage change, null-safe", () => {
  assert.equal(deltaPct(110, 100), 10);
  assert.equal(deltaPct(90, 100), -10);
  assert.equal(deltaPct(5, 0), null);
  assert.equal(deltaPct(5, null), null);
});

test("buildExecutiveFlags raises red flag when revenueAtRisk >10% of MRR", () => {
  const { redFlags, greenLights } = buildExecutiveFlags({
    mrr: 100_000_000, revenueAtRisk: 16_000_000, isolirCount: 93,
    newActivationsDeltaPct: 18, recoveryPct: 80,
  });
  assert.ok(redFlags.some((f) => /risk/i.test(f)));
  assert.ok(greenLights.some((g) => /aktivasi/i.test(g)));
});

test("buildExecutiveFlags green when healthy, no false red flags", () => {
  const { redFlags } = buildExecutiveFlags({
    mrr: 100_000_000, revenueAtRisk: 2_000_000, isolirCount: 10,
    newActivationsDeltaPct: 5, recoveryPct: 95,
  });
  assert.equal(redFlags.length, 0);
});
