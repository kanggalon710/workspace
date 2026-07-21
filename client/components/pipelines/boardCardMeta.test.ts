import { test } from "node:test";
import assert from "node:assert/strict";
import { cardAgeLabel, lastUpdateTone, isStalled, inDateRange, compareByDate, STALLED_DAYS } from "./boardCardMeta.js";

const now = new Date("2026-06-20T00:00:00.000Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

test("cardAgeLabel: today vs N days", () => {
  assert.equal(cardAgeLabel(daysAgo(0), now), "Hari ini");
  assert.equal(cardAgeLabel(daysAgo(3), now), "3h lalu");
  assert.equal(cardAgeLabel(null as any, now), "-");
});

test("lastUpdateTone: 1/7/14 day boundaries (uses updatedAt else createdAt)", () => {
  assert.equal(lastUpdateTone(daysAgo(0), daysAgo(20), now), "fresh");
  assert.equal(lastUpdateTone(daysAgo(1), daysAgo(20), now), "fresh");
  assert.equal(lastUpdateTone(daysAgo(5), daysAgo(20), now), "recent");
  assert.equal(lastUpdateTone(daysAgo(10), daysAgo(20), now), "warn");
  assert.equal(lastUpdateTone(daysAgo(30), daysAgo(40), now), "old");
  assert.equal(lastUpdateTone(null, daysAgo(0), now), "fresh");
});

test("isStalled: > STALLED_DAYS since last touch", () => {
  assert.equal(STALLED_DAYS, 14);
  assert.equal(isStalled(daysAgo(10), daysAgo(40), now), false);
  assert.equal(isStalled(daysAgo(20), daysAgo(40), now), true);
  assert.equal(isStalled(null, daysAgo(20), now), true);
  assert.equal(isStalled(null, null as any, now), false);
});

test("inDateRange: all / 7d / 30d / custom / null", () => {
  assert.equal(inDateRange(daysAgo(100), "all", now), true);
  assert.equal(inDateRange(daysAgo(3), "7d", now), true);
  assert.equal(inDateRange(daysAgo(10), "7d", now), false);
  assert.equal(inDateRange(daysAgo(20), "30d", now), true);
  assert.equal(inDateRange(daysAgo(40), "30d", now), false);
  assert.equal(inDateRange(daysAgo(5), { from: "2026-06-10", to: "2026-06-20" }, now), true);
  assert.equal(inDateRange(daysAgo(15), { from: "2026-06-10", to: "2026-06-20" }, now), false);
  assert.equal(inDateRange(daysAgo(5), { from: "", to: "" }, now), true);
  assert.equal(inDateRange(null, "7d", now), false);
  assert.equal(inDateRange(null, "all", now), true);
  assert.equal(inDateRange("2026-06-10T00:00:00.000Z", { from: "2026-06-10", to: "2026-06-20" }, now), true); // UTC start-of-day boundary inclusive
});

const A = { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-10T00:00:00Z" }; // dibuat lama, update baru
const B = { createdAt: "2026-01-05T00:00:00Z", updatedAt: "2026-01-06T00:00:00Z" }; // dibuat baru, update lama
const sortBy = <T extends { createdAt: string | null; updatedAt?: string | null }>(
  items: T[], field: "created" | "updated", dir: "asc" | "desc",
): T[] => [...items].sort((a, b) => compareByDate(a, b, field, dir));

test("compareByDate created: asc = terbaru dulu, desc = terlama dulu", () => {
  assert.deepEqual(sortBy([A, B], "created", "asc"), [B, A]);  // B dibuat 05 Jan (lebih baru)
  assert.deepEqual(sortBy([A, B], "created", "desc"), [A, B]);
});

test("compareByDate updated: pakai updatedAt, asc = terbaru dulu", () => {
  assert.deepEqual(sortBy([A, B], "updated", "asc"), [A, B]);  // A update 10 Jan (lebih baru)
  assert.deepEqual(sortBy([A, B], "updated", "desc"), [B, A]);
});

test("compareByDate updated: fallback ke createdAt bila updatedAt kosong", () => {
  const noUpd = { createdAt: "2026-01-20T00:00:00Z", updatedAt: null }; // fallback 20 Jan (terbaru)
  assert.deepEqual(sortBy([A, noUpd], "updated", "asc"), [noUpd, A]);
});

test("compareByDate: tanggal kosong/invalid dianggap paling lama", () => {
  const blank = { createdAt: null as string | null, updatedAt: null };
  assert.deepEqual(sortBy([blank, A], "created", "asc"), [A, blank]); // asc = terbaru dulu → A sebelum blank
});
