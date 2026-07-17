import { test } from "node:test";
import assert from "node:assert/strict";
import { chatwootAccountUrl, chatwootContactsUrl, chatwootContactUrl, chatwootConversationUrl } from "./chatwootLinks.js";

test("account dashboard url", () => {
  assert.equal(chatwootAccountUrl("https://omni.jabnet.id", 3), "https://omni.jabnet.id/app/accounts/3/dashboard");
});

test("contacts list url, trailing slash on base is safe", () => {
  assert.equal(chatwootContactsUrl("https://omni.jabnet.id/", 3), "https://omni.jabnet.id/app/accounts/3/contacts");
});

test("single contact url (used by batch 2)", () => {
  assert.equal(chatwootContactUrl("https://omni.jabnet.id", 3, 42), "https://omni.jabnet.id/app/accounts/3/contacts/42");
});

test("conversation url", () => {
  assert.equal(chatwootConversationUrl("https://omni.jabnet.id", 3, 99), "https://omni.jabnet.id/app/accounts/3/conversations/99");
});

test("null when base or account missing", () => {
  assert.equal(chatwootAccountUrl("", 3), null);
  assert.equal(chatwootAccountUrl("https://x", null), null);
  assert.equal(chatwootContactUrl("https://x", 3, null), null);
  assert.equal(chatwootConversationUrl("https://x", 3, null), null);
});
