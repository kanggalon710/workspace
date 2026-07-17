import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyNotifyDraft, notifyDraftToConfig, notifyConfigToDraft } from "./notifyConfig.js";

test("emptyNotifyDraft defaults to bell on, assignee", () => {
  const d = emptyNotifyDraft();
  assert.equal(d.notifyBell, true);
  assert.equal(d.notifyWebhook, false);
  assert.equal(d.bellTarget, "assignee");
});

test("notifyDraftToConfig: bell+webhook with fields", () => {
  const r = notifyDraftToConfig({ notifyBell: true, notifyWebhook: true, bellTarget: "user", bellUserId: "42", bellTitle: "Hi {title}", bellMessage: "msg", webhookUrl: "https://x" });
  assert.deepEqual(r, { ok: true, config: { channels: ["bell", "webhook"], bellTarget: "user", bellUserId: 42, bellTitle: "Hi {title}", bellMessage: "msg", webhookUrl: "https://x" } });
});

test("notifyDraftToConfig: errors", () => {
  assert.deepEqual(notifyDraftToConfig({ ...emptyNotifyDraft(), notifyBell: false, notifyWebhook: false }), { ok: false, error: "Pilih minimal satu channel notifikasi" });
  assert.deepEqual(notifyDraftToConfig({ ...emptyNotifyDraft(), bellTarget: "user", bellUserId: "" }), { ok: false, error: "Pilih user untuk notifikasi bell" });
  assert.deepEqual(notifyDraftToConfig({ ...emptyNotifyDraft(), notifyBell: false, notifyWebhook: true, webhookUrl: "" }), { ok: false, error: "Isi URL webhook" });
});

test("round-trip config→draft→config", () => {
  const cfg = { channels: ["bell"] as ("bell"|"webhook")[], bellTarget: "creator" as const };
  const d = notifyConfigToDraft(cfg);
  assert.equal(d.notifyBell, true);
  assert.equal(d.notifyWebhook, false);
  assert.equal(d.bellTarget, "creator");
  assert.deepEqual(notifyDraftToConfig(d), { ok: true, config: { channels: ["bell"], bellTarget: "creator" } });
});
