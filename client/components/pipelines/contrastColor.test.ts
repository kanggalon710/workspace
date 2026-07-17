import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToRgb, perceivedBrightness, isDarkBg, readableTextColor, overlayTint } from "./contrastColor.js";

test("hexToRgb: parses #rrggbb, #rgb, hash opsional; tolak invalid", () => {
  assert.deepEqual(hexToRgb("#ffffff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb("000000"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexToRgb("#f00"), { r: 255, g: 0, b: 0 });
  assert.equal(hexToRgb("nope"), null);
  assert.equal(hexToRgb(""), null);
  // @ts-expect-error — guard runtime non-string
  assert.equal(hexToRgb(null), null);
});

test("readableTextColor: bg gelap → putih, bg terang → gelap (ekstrem)", () => {
  assert.equal(readableTextColor("#000000"), "#ffffff");
  assert.equal(readableTextColor("#ffffff"), "#111827");
  assert.equal(readableTextColor("#1f2937"), "#ffffff"); // slate-800
});

test("readableTextColor: SWATCHES stage di StageColumn", () => {
  // Biru/ungu/abu/merah cukup gelap → teks putih
  assert.equal(readableTextColor("#6B7280"), "#ffffff"); // gray-500
  assert.equal(readableTextColor("#3B82F6"), "#ffffff"); // blue-500
  assert.equal(readableTextColor("#8B5CF6"), "#ffffff"); // violet-500
  assert.equal(readableTextColor("#EF4444"), "#ffffff"); // red-500
  // Kuning/hijau terang → teks gelap
  assert.equal(readableTextColor("#F59E0B"), "#111827"); // amber-500
  assert.equal(readableTextColor("#22C55E"), "#111827"); // green-500
});

test("isDarkBg + overlayTint sejalan", () => {
  assert.equal(isDarkBg("#000000"), true);
  assert.equal(isDarkBg("#ffffff"), false);
  assert.equal(overlayTint("#000000"), "rgba(255,255,255,0.22)");
  assert.equal(overlayTint("#ffffff"), "rgba(0,0,0,0.10)");
});

test("hex invalid → fallback teks gelap / brightness null", () => {
  assert.equal(readableTextColor("garbage"), "#111827");
  assert.equal(perceivedBrightness("garbage"), null);
  assert.equal(isDarkBg("garbage"), false);
});
