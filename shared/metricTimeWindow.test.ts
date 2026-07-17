import { test } from "node:test";
import assert from "node:assert/strict";
import { TIME_PRESETS, resolveTimeWindow, dateInWindow } from "./metricTimeWindow.js";

const DAY = 86_400_000;
// Fixed reference instant: 2026-06-11T08:30:00 local. Tests that care about
// calendar boundaries assert via dateInWindow rather than hardcoding TZ offsets.
const NOW = new Date(2026, 5, 11, 8, 30, 0).getTime();

test("TIME_PRESETS exposes the expected ordered keys", () => {
  assert.deepEqual(
    TIME_PRESETS.map((p) => p.preset),
    ["all", "today", "yesterday", "7d", "30d", "this_month", "last_month", "this_year", "custom"],
  );
});

test("all / unknown / missing → null (no filtering)", () => {
  assert.equal(resolveTimeWindow("all", NOW), null);
  assert.equal(resolveTimeWindow("bogus", NOW), null);
  assert.equal(resolveTimeWindow("", NOW), null);
});

test("7d window is [now-7d, now]", () => {
  const w = resolveTimeWindow("7d", NOW)!;
  assert.equal(w.toMs, NOW);
  assert.equal(w.fromMs, NOW - 7 * DAY);
});

test("30d window is [now-30d, now]", () => {
  const w = resolveTimeWindow("30d", NOW)!;
  assert.equal(w.fromMs, NOW - 30 * DAY);
  assert.equal(w.toMs, NOW);
});

test("today window contains now and excludes yesterday's instant", () => {
  const w = resolveTimeWindow("today", NOW)!;
  assert.ok(w.fromMs <= NOW && NOW <= w.toMs);
  assert.ok(w.fromMs > NOW - DAY); // start is later than 24h ago (it's local midnight today)
});

test("yesterday window precedes today and excludes now", () => {
  const y = resolveTimeWindow("yesterday", NOW)!;
  const t = resolveTimeWindow("today", NOW)!;
  assert.ok(y.toMs < NOW);
  assert.ok(y.toMs <= t.fromMs); // yesterday ends at/just before today starts
});

test("this_month starts on the 1st at local midnight and includes now", () => {
  const w = resolveTimeWindow("this_month", NOW)!;
  assert.ok(w.fromMs <= NOW && NOW <= w.toMs);
  const start = new Date(w.fromMs);
  assert.equal(start.getDate(), 1);
  assert.equal(start.getMonth(), 5); // June (0-indexed)
});

test("last_month is the full previous calendar month", () => {
  const w = resolveTimeWindow("last_month", NOW)!;
  const start = new Date(w.fromMs);
  const end = new Date(w.toMs);
  assert.equal(start.getMonth(), 4); // May
  assert.equal(start.getDate(), 1);
  assert.equal(end.getMonth(), 4); // ends within May
});

test("this_year starts Jan 1 and includes now", () => {
  const w = resolveTimeWindow("this_year", NOW)!;
  assert.ok(w.fromMs <= NOW && NOW <= w.toMs);
  const start = new Date(w.fromMs);
  assert.equal(start.getMonth(), 0);
  assert.equal(start.getDate(), 1);
  assert.equal(start.getFullYear(), 2026);
});

test("custom uses startOf(from)..endOf(to)", () => {
  const w = resolveTimeWindow("custom", NOW, "2026-06-01", "2026-06-10")!;
  assert.ok(dateInWindow("2026-06-01", w)); // inclusive start
  assert.ok(dateInWindow("2026-06-10", w)); // inclusive end (end-of-day)
  assert.ok(dateInWindow("2026-06-10T23:59:00", w));
  assert.ok(!dateInWindow("2026-06-11", w));
  assert.ok(!dateInWindow("2026-05-31", w));
});

test("custom with missing from/to → null (defensive all-time)", () => {
  assert.equal(resolveTimeWindow("custom", NOW, null, "2026-06-10"), null);
  assert.equal(resolveTimeWindow("custom", NOW, "2026-06-01", null), null);
  assert.equal(resolveTimeWindow("custom", NOW), null);
});

test("dateInWindow: boundaries inclusive, invalid/empty date → false", () => {
  const w = resolveTimeWindow("7d", NOW)!;
  assert.ok(dateInWindow(new Date(NOW).toISOString(), w));
  assert.ok(dateInWindow(new Date(w.fromMs).toISOString(), w)); // inclusive low
  assert.ok(dateInWindow(new Date(w.toMs).toISOString(), w));   // inclusive high
  assert.ok(!dateInWindow(new Date(w.fromMs - 1).toISOString(), w));
  assert.ok(!dateInWindow("not-a-date", w));
  assert.ok(!dateInWindow("", w));
  assert.ok(!dateInWindow(null, w));
  assert.ok(!dateInWindow(undefined, w));
});
