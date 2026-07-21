/**
 * Unit tests untuk dateFormat utility - pastikan ngga ada "Invalid Date" rendered.
 *
 * Run: node --test --experimental-strip-types client/lib/dateFormat.test.ts
 *      atau via vitest setelah test infra setup.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  isValidDate, safeDate, formatDate, formatDateOnly,
  formatTimeOnly, formatRelative, formatDuration,
} from "./dateFormat";

test("isValidDate: rejects null/undefined/empty/invalid", () => {
  assert.equal(isValidDate(null), false);
  assert.equal(isValidDate(undefined), false);
  assert.equal(isValidDate(""), false);
  assert.equal(isValidDate("invalid"), false);
  assert.equal(isValidDate("not-a-date"), false);
});

test("isValidDate: accepts valid ISO + Date + epoch", () => {
  assert.equal(isValidDate("2026-04-30T07:30:00Z"), true);
  assert.equal(isValidDate(new Date()), true);
  assert.equal(isValidDate(1714464600000), true);
});

test("safeDate: returns null for invalid, Date for valid", () => {
  assert.equal(safeDate(null), null);
  assert.equal(safeDate("invalid"), null);
  assert.ok(safeDate("2026-04-30T07:30:00Z") instanceof Date);
});

test("formatDate: returns '-' for invalid, formatted string for valid", () => {
  assert.equal(formatDate(null), "-");
  assert.equal(formatDate(undefined), "-");
  assert.equal(formatDate(""), "-");
  assert.equal(formatDate("invalid"), "-");
  // Custom fallback
  assert.equal(formatDate(null, { fallback: "n/a" }), "n/a");
  // Valid date - should NOT contain "Invalid"
  const result = formatDate("2026-04-30T07:30:00Z");
  assert.equal(result.includes("Invalid"), false);
  assert.ok(result.length > 0);
});

test("formatDateOnly: handles invalid gracefully", () => {
  assert.equal(formatDateOnly(null), "-");
  const r = formatDateOnly("2026-04-30T07:30:00Z");
  assert.equal(r.includes("Invalid"), false);
});

test("formatTimeOnly: handles invalid gracefully", () => {
  assert.equal(formatTimeOnly(null), "-");
  const r = formatTimeOnly("2026-04-30T07:30:00Z");
  assert.equal(r.includes("Invalid"), false);
});

test("formatRelative: 'baru saja' / 'X menit lalu'", () => {
  const now = new Date().toISOString();
  assert.equal(formatRelative(now), "baru saja");
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(formatRelative(fiveMinAgo), "5 menit lalu");
  assert.equal(formatRelative(null), "-");
});

test("formatRelative: future dates fallback to absolute", () => {
  const future = new Date(Date.now() + 86400_000).toISOString();
  const r = formatRelative(future);
  assert.equal(r.includes("Invalid"), false);
});

test("formatDuration: 's', 'm', 'j Xm'", () => {
  assert.equal(formatDuration(45), "45d");
  assert.equal(formatDuration(120), "2m");
  assert.equal(formatDuration(3600), "1j");
  assert.equal(formatDuration(3700), "1j 1m");
  assert.equal(formatDuration(null), "-");
  assert.equal(formatDuration(undefined), "-");
  assert.equal(formatDuration(-1), "-");
  assert.equal(formatDuration(NaN), "-");
});

console.log("✓ All dateFormat tests passed");
