import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMULA_TERM_KEYS, parseFormula, evaluateFormula } from "./metricFormula.js";

test("FORMULA_TERM_KEYS is a..h", () => {
  assert.deepEqual(FORMULA_TERM_KEYS, ["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("precedence: * binds tighter than +", () => {
  assert.equal(evaluateFormula("a+b*c", { a: 1, b: 2, c: 3 }), 7);
});

test("parentheses override precedence", () => {
  assert.equal(evaluateFormula("(a+b)*c", { a: 1, b: 2, c: 3 }), 9);
});

test("division works and is left-associative", () => {
  assert.equal(evaluateFormula("a/b", { a: 10, b: 4 }), 2.5);
  assert.equal(evaluateFormula("a-b-c", { a: 10, b: 3, c: 2 }), 5);
});

test("divide-by-zero yields 0 (whole result)", () => {
  assert.equal(evaluateFormula("a/b", { a: 1, b: 0 }), 0);
  assert.equal(evaluateFormula("a/b+c", { a: 1, b: 0, c: 5 }), 0);
});

test("(a/b)*100 computes a percentage", () => {
  assert.equal(evaluateFormula("(a/b)*100", { a: 3, b: 4 }), 75);
});

test("numeric literals (incl. decimals) are allowed", () => {
  assert.equal(evaluateFormula("a*1.5", { a: 2 }), 3);
});

test("parseFormula accepts a valid expression over the allowed keys", () => {
  assert.deepEqual(parseFormula("(a/b)*100", ["a", "b"]), { ok: true });
});

test("parseFormula rejects an unknown identifier", () => {
  const r = parseFormula("a+z", ["a"]);
  assert.equal(r.ok, false);
});

test("parseFormula rejects unbalanced parens", () => {
  assert.equal(parseFormula("(a+b", ["a", "b"]).ok, false);
});

test("parseFormula rejects empty / trailing-operator / double-operator", () => {
  assert.equal(parseFormula("", ["a"]).ok, false);
  assert.equal(parseFormula("a+", ["a"]).ok, false);
  assert.equal(parseFormula("a++b", ["a", "b"]).ok, false);
});

test("evaluateFormula throws on a parse error (engine catches it)", () => {
  assert.throws(() => evaluateFormula("a+", { a: 1 }));
  assert.throws(() => evaluateFormula("a+z", { a: 1 }));
});
