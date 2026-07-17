import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeManualSyncCooldown,
  canWriteMitraIntegration,
  mapBillingSample,
} from "./billing-admin-helpers.js";

const NOW = new Date("2026-06-03T10:00:00Z").getTime();
const WINDOW = 10 * 60_000;

test("cooldown: no prior sync -> can sync", () => {
  const r = computeManualSyncCooldown(null, NOW, WINDOW);
  assert.equal(r.canSync, true);
  assert.equal(r.remainingSec, 0);
  assert.equal(r.nextAvailableAt, null);
});

test("cooldown: within window -> blocked with remaining + nextAvailableAt", () => {
  const last = new Date(NOW - 4 * 60_000).toISOString(); // 4 min ago
  const r = computeManualSyncCooldown(last, NOW, WINDOW);
  assert.equal(r.canSync, false);
  assert.equal(r.remainingSec, 360); // 6 min left
  assert.equal(r.nextAvailableAt, new Date(NOW - 4 * 60_000 + WINDOW).toISOString());
});

test("cooldown: exactly at window -> can sync", () => {
  const last = new Date(NOW - WINDOW).toISOString();
  assert.equal(computeManualSyncCooldown(last, NOW, WINDOW).canSync, true);
});

test("cooldown: malformed timestamp -> can sync (fail-open)", () => {
  assert.equal(computeManualSyncCooldown("not-a-date", NOW, WINDOW).canSync, true);
});

test("integration auth: non-root cannot write billing key (own mitra)", () => {
  const r = canWriteMitraIntegration({ isJabnetRoot: false, activeMitraId: 3, targetMitraId: 3, key: "billing_reseller_id" });
  assert.equal(r.allowed, false);
});

test("integration auth: non-root cannot edit another mitra", () => {
  const r = canWriteMitraIntegration({ isJabnetRoot: false, activeMitraId: 3, targetMitraId: 4, key: "google_maps_api_key" });
  assert.equal(r.allowed, false);
});

test("integration auth: non-root CAN edit own non-billing key", () => {
  const r = canWriteMitraIntegration({ isJabnetRoot: false, activeMitraId: 3, targetMitraId: 3, key: "google_maps_api_key" });
  assert.equal(r.allowed, true);
});

test("integration auth: JABNET root can edit billing key for another mitra", () => {
  const r = canWriteMitraIntegration({ isJabnetRoot: true, activeMitraId: 1, targetMitraId: 4, key: "billing_reseller_id" });
  assert.equal(r.allowed, true);
});

test("mapBillingSample: maps fields and caps at limit", () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({
    customer_id: i, nama_lengkap: `N${i}`, alamat_pelanggan: `A${i}`,
    paket_layanan: "10M", status_pelanggan: "aktif", is_isolir: 0,
  }));
  const out = mapBillingSample(rows, 10);
  assert.equal(out.length, 10);
  assert.deepEqual(out[0], { customer_id: 0, nama: "N0", alamat: "A0", paket: "10M", status: "aktif", is_isolir: 0 });
});

test("mapBillingSample: falls back to nama_panggilan", () => {
  const out = mapBillingSample([{ customer_id: 1, nama_panggilan: "Budi" }]);
  assert.equal(out[0].nama, "Budi");
});
