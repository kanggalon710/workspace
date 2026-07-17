import { test } from "node:test";
import assert from "node:assert/strict";
import { customerConnStatus, CUSTOMER_STATUS_META } from "./customerStatus.js";

test("isolir flag wins regardless of status text", () => {
  assert.equal(customerConnStatus({ isIsolir: 1, status: "active" }), "isolir");
  assert.equal(customerConnStatus({ isIsolir: 1, status: null }), "isolir");
});

test("status text classification", () => {
  assert.equal(customerConnStatus({ isIsolir: 0, status: "active" }), "active");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "Aktif" }), "active");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "suspend" }), "suspend");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "suspended" }), "suspend");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "terminated" }), "terminated");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "terminate" }), "terminated");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "isolir" }), "isolir");
});

test("default column value 'active' and unknown strings", () => {
  assert.equal(customerConnStatus({ isIsolir: 0, status: undefined }), "unknown");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "weird" }), "unknown");
  assert.equal(customerConnStatus({}), "unknown");
});

test("every status has display meta", () => {
  for (const k of ["active", "isolir", "suspend", "terminated", "unknown"] as const) {
    assert.ok(CUSTOMER_STATUS_META[k].label.length > 0);
    assert.ok(CUSTOMER_STATUS_META[k].variant.length > 0);
  }
});
