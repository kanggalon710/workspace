import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCardParam } from "./cardParam.js";

test("parseCardParam extracts a positive integer card id, else null", () => {
  assert.equal(parseCardParam("?card=42"), 42);
  assert.equal(parseCardParam("?foo=1&card=7"), 7);
  assert.equal(parseCardParam("?card=abc"), null);
  assert.equal(parseCardParam("?card=0"), null);
  assert.equal(parseCardParam("?card=-3"), null);
  assert.equal(parseCardParam("?other=1"), null);
  assert.equal(parseCardParam(""), null);
});
