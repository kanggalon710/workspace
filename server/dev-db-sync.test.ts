import { test } from "node:test";
import assert from "node:assert/strict";
import { devDbSyncAvailable, tablesToMirror, tablesMissingInProd, copyColumns, buildCopySql } from "./dev-db-sync.js";

test("devDbSyncAvailable: only when flag on + prod≠current + current ends _dev", () => {
  const base = { DEV_DB_SYNC_ENABLED: "true", PROD_DB_NAME: "jabnet_fiber", DB_NAME: "jabnet_fiber_dev" };
  assert.equal(devDbSyncAvailable(base as any), true);
  assert.equal(devDbSyncAvailable({ ...base, DEV_DB_SYNC_ENABLED: "false" } as any), false); // flag off
  assert.equal(devDbSyncAvailable({ ...base, DB_NAME: "jabnet_fiber" } as any), false);       // prod === current
  assert.equal(devDbSyncAvailable({ ...base, DB_NAME: "jabnet_fiber" , PROD_DB_NAME: "jabnet_fiber" } as any), false);
  assert.equal(devDbSyncAvailable({ ...base, DB_NAME: "jabnet_fiber_prod" } as any), false);  // current not *_dev
  assert.equal(devDbSyncAvailable({ ...base, PROD_DB_NAME: "" } as any), false);              // prod empty
});

test("tablesToMirror: intersection, prod order preserved", () => {
  assert.deepEqual(tablesToMirror(["a", "b", "c"], ["c", "a"]), ["a", "c"]);
  assert.deepEqual(tablesToMirror(["a"], []), []);
});

test("tablesMissingInProd: dev tables absent in prod, dev order preserved", () => {
  // teamspace case: dev has `teams`/`team_members` but prod (older schema) doesn't → surfaced.
  assert.deepEqual(tablesMissingInProd(["customers", "users"], ["customers", "teams", "team_members", "users"]), ["teams", "team_members"]);
  assert.deepEqual(tablesMissingInProd(["a", "b"], ["a", "b"]), []);   // identical → nothing skipped
  assert.deepEqual(tablesMissingInProd([], ["a"]), ["a"]);             // empty prod → all dev skipped
});

test("copyColumns: intersection, prod order preserved", () => {
  assert.deepEqual(copyColumns(["id", "name", "extra"], ["id", "name"]), ["id", "name"]);
  assert.deepEqual(copyColumns(["x"], ["y"]), []);
});

test("buildCopySql: TRUNCATE + INSERT…SELECT with backtick-quoted identifiers", () => {
  const sql = buildCopySql("devdb", "proddb", "customers", ["id", "name"]);
  assert.deepEqual(sql, [
    "TRUNCATE TABLE `devdb`.`customers`",
    "INSERT INTO `devdb`.`customers` (`id`, `name`) SELECT `id`, `name` FROM `proddb`.`customers`",
  ]);
});

test("buildCopySql: empty cols → [] (skip signal)", () => {
  assert.deepEqual(buildCopySql("devdb", "proddb", "customers", []), []);
});

test("buildCopySql: doubles internal backticks in identifiers", () => {
  const sql = buildCopySql("dev`db", "prod", "t", ["id"]);
  assert.deepEqual(sql, [
    "TRUNCATE TABLE `dev``db`.`t`",
    "INSERT INTO `dev``db`.`t` (`id`) SELECT `id` FROM `prod`.`t`",
  ]);
});
