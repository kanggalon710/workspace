import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLeadPrefill } from "./cardToLead.js";

const fields = [
  { id: 10, type: "text" },
  { id: 11, type: "phone" },
  { id: 12, type: "coordinate" },
];

test("name from title; phone from phone field; lat/lng from coordinate field", () => {
  const values = { 10: "abaikan", 11: "08123456", 12: JSON.stringify({ lat: -7.1, lng: 107.9 }) };
  assert.deepEqual(detectLeadPrefill("  Budi Santoso ", values, fields), {
    name: "Budi Santoso", phone: "08123456", lat: -7.1, lng: 107.9,
  });
});

test("missing/empty fields omitted; only name present", () => {
  assert.deepEqual(detectLeadPrefill("Ana", {}, fields), { name: "Ana" });
  assert.deepEqual(detectLeadPrefill("Ana", { 11: "  " }, fields), { name: "Ana" });
});

test("first field of each type wins; bad coordinate JSON ignored", () => {
  const f2 = [{ id: 1, type: "phone" }, { id: 2, type: "phone" }, { id: 3, type: "coordinate" }];
  const values = { 1: "0811", 2: "0822", 3: "not-json" };
  assert.deepEqual(detectLeadPrefill("X", values, f2), { name: "X", phone: "0811" });
});
