import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFieldValue, encodeFieldValue, decodeFieldValue, formatChipValue } from "./pipeline-field-helpers.js";

test("empty value is always valid (soft-required)", () => {
  assert.deepEqual(validateFieldValue("number", "", undefined), { ok: true });
  assert.deepEqual(validateFieldValue("dropdown", "", ["a"]), { ok: true });
});

test("number rejects non-numeric", () => {
  assert.equal(validateFieldValue("number", "12.5").ok, true);
  assert.equal(validateFieldValue("currency", "1000").ok, true);
  assert.equal(validateFieldValue("number", "abc").ok, false);
});

test("dropdown must be one of options", () => {
  assert.equal(validateFieldValue("dropdown", "b", ["a", "b"]).ok, true);
  assert.equal(validateFieldValue("dropdown", "z", ["a", "b"]).ok, false);
});

test("multiselect all values must be in options", () => {
  assert.equal(validateFieldValue("multiselect", JSON.stringify(["a","b"]), ["a","b","c"]).ok, true);
  assert.equal(validateFieldValue("multiselect", JSON.stringify(["a","z"]), ["a","b"]).ok, false);
  assert.equal(validateFieldValue("multiselect", "not json", ["a"]).ok, false);
});

test("checkbox must be 0 or 1", () => {
  assert.equal(validateFieldValue("checkbox", "1").ok, true);
  assert.equal(validateFieldValue("checkbox", "0").ok, true);
  assert.equal(validateFieldValue("checkbox", "true").ok, false);
});

test("date must be ISO-parseable", () => {
  assert.equal(validateFieldValue("date", "2026-06-04").ok, true);
  assert.equal(validateFieldValue("date", "notadate").ok, false);
});

test("user single: digits only", () => {
  assert.equal(validateFieldValue("user", "42").ok, true);
  assert.equal(validateFieldValue("user", "x").ok, false);
});

test("user multi: JSON array of digit strings", () => {
  assert.equal(validateFieldValue("user", JSON.stringify(["1", "2"]), undefined, { multiple: true }).ok, true);
  assert.equal(validateFieldValue("user", JSON.stringify(["1", "x"]), undefined, { multiple: true }).ok, false);
  assert.equal(validateFieldValue("user", "not json", undefined, { multiple: true }).ok, false);
  assert.equal(validateFieldValue("user", JSON.stringify({}), undefined, { multiple: true }).ok, false);
});

test("empty value always allowed (soft-required)", () => {
  assert.equal(validateFieldValue("user", "", undefined, { multiple: true }).ok, true);
});

test("encode/decode multiselect round-trips; malformed decodes to []", () => {
  assert.equal(encodeFieldValue("multiselect", ["a", "b"]), JSON.stringify(["a", "b"]));
  assert.deepEqual(decodeFieldValue("multiselect", JSON.stringify(["a","b"])), ["a", "b"]);
  assert.deepEqual(decodeFieldValue("multiselect", "broken"), []);
  assert.deepEqual(decodeFieldValue("multiselect", null), []);
});

test("decode scalar returns string; null -> empty string", () => {
  assert.equal(decodeFieldValue("text", "hi"), "hi");
  assert.equal(decodeFieldValue("number", null), "");
});

test("formatChipValue renders human strings", () => {
  assert.equal(formatChipValue("checkbox", "1"), "Ya");
  assert.equal(formatChipValue("checkbox", "0"), "Tidak");
  assert.equal(formatChipValue("currency", "1500000"), "Rp 1.500.000");
  assert.equal(formatChipValue("multiselect", JSON.stringify(["a","b"])), "a, b");
  assert.equal(formatChipValue("text", "hello"), "hello");
});

test("coordinate: valid {lat,lng} ok; out-of-range/garbage fail; empty ok", () => {
  assert.equal(validateFieldValue("coordinate", JSON.stringify({ lat: -6.1, lng: 106.8 })).ok, true);
  assert.equal(validateFieldValue("coordinate", JSON.stringify({ lat: 91, lng: 0 })).ok, false);
  assert.equal(validateFieldValue("coordinate", "not json").ok, false);
  assert.equal(validateFieldValue("coordinate", "").ok, true); // soft-required
});
