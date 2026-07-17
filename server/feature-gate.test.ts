import { test } from "node:test";
import assert from "node:assert/strict";
import { gatePermissionsByFeatures } from "./feature-gate.js";

type L = "none" | "read" | "write";
const base: Record<string, L> = {
  loyalty_admin: "write", collections: "write", broadcast: "read",
  whatsapp: "write", phonebooks: "read", dashboard: "read", api_keys: "write",
};

test("mitra 1 (JABNET) is never gated", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ loyalty: false }), 1);
  assert.equal(out.loyalty_admin, "write");
});
test("loyalty:false strips loyalty_admin, leaves others", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ loyalty: false }), 7);
  assert.equal(out.loyalty_admin, "none");
  assert.equal(out.collections, "write");
});
test("broadcast:false strips broadcast+whatsapp+phonebooks", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ broadcast: false }), 7);
  assert.equal(out.broadcast, "none");
  assert.equal(out.whatsapp, "none");
  assert.equal(out.phonebooks, "none");
});
test("feature absent => enabled (perm retained)", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ collections: true }), 7);
  assert.equal(out.loyalty_admin, "write");
});
test("explicit true keeps permission", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ loyalty: true }), 7);
  assert.equal(out.loyalty_admin, "write");
});
test("malformed JSON => perms unchanged", () => {
  const out = gatePermissionsByFeatures(base, "{not json", 7);
  assert.equal(out.loyalty_admin, "write");
});
test("null/empty features => unchanged", () => {
  assert.equal(gatePermissionsByFeatures(base, null, 7).loyalty_admin, "write");
  assert.equal(gatePermissionsByFeatures(base, "", 7).loyalty_admin, "write");
});
test("does not mutate input object", () => {
  gatePermissionsByFeatures(base, JSON.stringify({ loyalty: false }), 7);
  assert.equal(base.loyalty_admin, "write");
});
