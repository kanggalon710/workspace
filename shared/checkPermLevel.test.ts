import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPermLevel, cleansePermissionMatrix, type PermissionLevel } from "./schema";

// Ladder: none < read < write < delete. `delete` adalah superset dari write + read.

test("checkPermLevel: read need is satisfied by read/write/delete", () => {
  for (const lvl of ["read", "write", "delete"] as PermissionLevel[]) {
    assert.equal(checkPermLevel({ cables: lvl }, "cables", "read"), true, `read ok for ${lvl}`);
  }
  assert.equal(checkPermLevel({ cables: "none" }, "cables", "read"), false);
  assert.equal(checkPermLevel({}, "cables", "read"), false);
});

test("checkPermLevel: write need is satisfied by write/delete only", () => {
  assert.equal(checkPermLevel({ cables: "write" }, "cables", "write"), true);
  assert.equal(checkPermLevel({ cables: "delete" }, "cables", "write"), true);
  assert.equal(checkPermLevel({ cables: "read" }, "cables", "write"), false);
  assert.equal(checkPermLevel({ cables: "none" }, "cables", "write"), false);
});

test("checkPermLevel: delete need is satisfied by delete only", () => {
  assert.equal(checkPermLevel({ cables: "delete" }, "cables", "delete"), true);
  assert.equal(checkPermLevel({ cables: "write" }, "cables", "delete"), false);
  assert.equal(checkPermLevel({ cables: "read" }, "cables", "delete"), false);
  assert.equal(checkPermLevel({ cables: "none" }, "cables", "delete"), false);
  assert.equal(checkPermLevel(undefined, "cables", "delete"), false);
});

test("cleansePermissionMatrix keeps delete as a valid stored level", () => {
  const out = cleansePermissionMatrix({ cables: "delete", pops: "write", odps: "read", bogus: "delete", weird: "x" });
  assert.equal(out.cables, "delete");
  assert.equal(out.pops, "write");
  assert.equal(out.odps, "read");
  // unknown keys dropped; invalid values coerced to none
  assert.equal((out as any).bogus, undefined);
  assert.equal(out.weird ?? undefined, undefined);
});
