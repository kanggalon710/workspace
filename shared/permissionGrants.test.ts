import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeGrants, parseGrants, mergeAdditiveGrants } from "./permissionGrants";

test("sanitizeGrants keeps valid keys/levels (incl. delete), drops the rest", () => {
  const g = sanitizeGrants({ customers: "read", tickets: "write", collections: "none", bogus_key: "write", map: "delete" });
  assert.deepEqual(g, { customers: "read", tickets: "write", map: "delete" });
});

test("sanitizeGrants handles non-objects", () => {
  assert.deepEqual(sanitizeGrants(null), {});
  assert.deepEqual(sanitizeGrants("x"), {});
  assert.deepEqual(sanitizeGrants(["customers"]), {});
});

test("parseGrants parses JSON and never throws", () => {
  assert.deepEqual(parseGrants('{"customers":"write"}'), { customers: "write" });
  assert.deepEqual(parseGrants("not-json"), {});
  assert.deepEqual(parseGrants(null), {});
});

test("mergeAdditiveGrants raises but never lowers", () => {
  const role = { customers: "none", tickets: "read", collections: "write" } as Record<string, "none" | "read" | "write">;
  const merged = mergeAdditiveGrants(role, { customers: "read", tickets: "write", collections: "read" });
  // customers none->read (raised), tickets read->write (raised), collections write stays write (grant read cannot lower)
  assert.equal(merged.customers, "read");
  assert.equal(merged.tickets, "write");
  assert.equal(merged.collections, "write");
});

test("mergeAdditiveGrants raises write->delete, and delete cannot be lowered", () => {
  const role = { cables: "write", pops: "delete" } as Record<string, "none" | "read" | "write" | "delete">;
  const merged = mergeAdditiveGrants(role, { cables: "delete", pops: "read" });
  assert.equal(merged.cables, "delete"); // write -> delete (raised)
  assert.equal(merged.pops, "delete");   // delete stays (grant read cannot lower)
});

test("mergeAdditiveGrants adds a brand-new key", () => {
  const merged = mergeAdditiveGrants({}, { hr_sdm: "read" });
  assert.equal(merged.hr_sdm, "read");
});

test("mergeAdditiveGrants does not mutate the role object", () => {
  const role = { customers: "none" } as Record<string, "none" | "read" | "write">;
  mergeAdditiveGrants(role, { customers: "write" });
  assert.equal(role.customers, "none");
});
