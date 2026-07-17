import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_PERMISSION_KEYS } from "./schema.js";

test("chatwoot permission keys are registered", () => {
  assert.ok(ALL_PERMISSION_KEYS.includes("chatwoot"));
  assert.ok(ALL_PERMISSION_KEYS.includes("chatwoot_settings"));
});
