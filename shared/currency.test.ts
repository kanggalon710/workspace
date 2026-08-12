import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRupiah } from "./currency.js";

test("formatRupiah formats Indonesian Rupiah with dot thousands separator", () => {
  assert.equal(formatRupiah(150000), "Rp 150.000");
  assert.equal(formatRupiah(50000), "Rp 50.000");
  assert.equal(formatRupiah(1234567), "Rp 1.234.567");
  assert.equal(formatRupiah(0), "Rp 0");
});

test("formatRupiah treats null/undefined as Rp 0 when no fallback given", () => {
  assert.equal(formatRupiah(null), "Rp 0");
  assert.equal(formatRupiah(undefined), "Rp 0");
});

test("formatRupiah returns fallback for falsy values when fallback provided", () => {
  // memuat pola lama `n ? Rp : "-"` (0/null/undefined -> fallback)
  assert.equal(formatRupiah(0, "-"), "-");
  assert.equal(formatRupiah(null, "-"), "-");
  assert.equal(formatRupiah(undefined, "-"), "-");
  assert.equal(formatRupiah(50000, "-"), "Rp 50.000");
});
