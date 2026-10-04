import { test } from "node:test";
import assert from "node:assert/strict";
import { loadServerEnv } from "./env.js";

test("defaults: dev mode, port 3002, no proxy trust, canonical public url", () => {
  const e = loadServerEnv({});
  assert.equal(e.isProd, false);
  assert.equal(e.port, 3002);
  assert.equal(e.trustProxy, false);
  assert.equal(e.appPublicUrl, "https://workspace.jabnet.id");
  assert.equal(e.workersGloballyEnabled, true);
});

test("production: trust proxy defaults to exactly 1 hop", () => {
  const e = loadServerEnv({ NODE_ENV: "production" });
  assert.equal(e.isProd, true);
  assert.equal(e.trustProxy, 1);
});

test("TRUST_PROXY override: 'false'/'0' disable, positive int sets hops, junk throws", () => {
  assert.equal(loadServerEnv({ NODE_ENV: "production", TRUST_PROXY: "false" }).trustProxy, false);
  assert.equal(loadServerEnv({ NODE_ENV: "production", TRUST_PROXY: "0" }).trustProxy, false);
  assert.equal(loadServerEnv({ TRUST_PROXY: "2" }).trustProxy, 2);
  assert.throws(() => loadServerEnv({ TRUST_PROXY: "abc" }), /TRUST_PROXY/);
});

test("invalid PORT fails loudly instead of silently listening elsewhere", () => {
  assert.throws(() => loadServerEnv({ PORT: "abc" }), /PORT/);
});

test("invalid APP_PUBLIC_URL fails loudly", () => {
  assert.throws(() => loadServerEnv({ APP_PUBLIC_URL: "not a url" }), /APP_PUBLIC_URL/);
});

test("APP_PUBLIC_URL trailing slash is normalized away", () => {
  const e = loadServerEnv({ APP_PUBLIC_URL: "https://dev.example.com/" });
  assert.equal(e.appPublicUrl, "https://dev.example.com");
});

test("workerFlag: unset -> default AND global; explicit value wins", () => {
  const on = loadServerEnv({});
  assert.equal(on.workerFlag("BILLING_SYNC_ENABLED"), true);
  const off = loadServerEnv({ WORKERS_ENABLED: "false" });
  assert.equal(off.workerFlag("BILLING_SYNC_ENABLED"), false);
  const explicit = loadServerEnv({ BILLING_SYNC_ENABLED: "false" });
  assert.equal(explicit.workerFlag("BILLING_SYNC_ENABLED"), false);
  const explicitOn = loadServerEnv({ BILLING_SYNC_ENABLED: "TRUE" });
  assert.equal(explicitOn.workerFlag("BILLING_SYNC_ENABLED"), true);
});
