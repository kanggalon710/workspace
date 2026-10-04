import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAdminSeed } from "./adminSeed.js";

test("skips seeding when users already exist", () => {
  const d = decideAdminSeed(3, { ADMIN_DEFAULT_PASSWORD: "whatever-long" });
  assert.equal(d.action, "skip");
});

test("fails loudly on fresh install without ADMIN_DEFAULT_PASSWORD", () => {
  const d = decideAdminSeed(0, {});
  assert.equal(d.action, "fail");
  assert.match((d as any).reason, /ADMIN_DEFAULT_PASSWORD/);
});

test("fails on fresh install with blank/whitespace password", () => {
  const d = decideAdminSeed(0, { ADMIN_DEFAULT_PASSWORD: "   " });
  assert.equal(d.action, "fail");
});

test("fails on fresh install with a too-short password, without echoing it", () => {
  const d = decideAdminSeed(0, { ADMIN_DEFAULT_PASSWORD: "abc123" });
  assert.equal(d.action, "fail");
  assert.ok(!(d as any).reason.includes("abc123"));
});

test("seeds with standard default identity when password provided", () => {
  const d = decideAdminSeed(0, { ADMIN_DEFAULT_PASSWORD: "S3cret-enough" });
  assert.equal(d.action, "seed");
  if (d.action !== "seed") return;
  assert.equal(d.username, "chief0012");
  assert.equal(d.name, "Administrator");
  assert.equal(d.password, "S3cret-enough");
});

test("respects ADMIN_USERNAME / ADMIN_NAME overrides, trimmed", () => {
  const d = decideAdminSeed(0, {
    ADMIN_DEFAULT_PASSWORD: "S3cret-enough",
    ADMIN_USERNAME: "  owner01 ",
    ADMIN_NAME: " Pemilik Platform ",
  });
  assert.equal(d.action, "seed");
  if (d.action !== "seed") return;
  assert.equal(d.username, "owner01");
  assert.equal(d.name, "Pemilik Platform");
});
