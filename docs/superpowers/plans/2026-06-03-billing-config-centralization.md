# Billing Config Centralization + Per-Mitra Sync + Maps Fallback - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize billing-reseller config under JABNET-root, give each mitra a rate-limited manual "Sync dengan Billing" button on `/customers`, and clarify the Google Maps per-mitra key (fallback to JABNET's shared key).

**Architecture:** New pure helpers (`server/billing-admin-helpers.ts`) hold the testable logic (cooldown math, integration-write authorization, billing-sample mapping). The billing worker gains an explicit-reseller fetch path. New JABNET-root-only endpoints under `/api/billing/mitras*` manage per-mitra billing_id + test + sync. A persisted per-mitra cooldown gates the manual sync. Client changes hide billing from non-JABNET mitras, add the JABNET management panel, add the `/customers` sync button, and add Maps helper text.

**Tech Stack:** Node 20 + Express 5 + Drizzle (MySQL) on the server; React 18 + TanStack Query + shadcn/ui (`Combobox`) on the client. Tests via `node:test` run with `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-06-03-billing-config-centralization-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `server/billing-admin-helpers.ts` | Pure helpers: cooldown, integration-write auth, sample mapping | **Create** |
| `server/billing-admin-helpers.test.ts` | Unit tests for the helpers | **Create** |
| `server/billing-sync-worker.ts` | Add explicit-reseller fetch + `testResellerData` | Modify |
| `server/routes.ts` | New `/api/billing/mitras*` endpoints, cooldown on `/api/billing/sync`, integration-write guard, `isJabnetRoot` | Modify |
| `client/pages/IntegrationPage.tsx` | Remove non-JABNET reseller section; JABNET per-mitra panel; Maps helper text | Modify |
| `client/pages/CustomersPage.tsx` | Manual sync button + cooldown countdown | Modify |
| `.env.example` | (none - no new env) | - |

**Note on client tests:** this repo has no client test runner (only `node:test` server tests). Client tasks are verified by `npm run typecheck` + manual dev check, not unit tests.

---

## Task 1: Pure helpers + tests

**Files:**
- Create: `server/billing-admin-helpers.ts`
- Test: `server/billing-admin-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/billing-admin-helpers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/billing-admin-helpers.test.ts`
Expected: FAIL - `Cannot find module './billing-admin-helpers.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `server/billing-admin-helpers.ts`:

```ts
/**
 * Pure helpers for the JABNET-root billing admin panel + per-mitra manual sync.
 * No I/O - unit-tested in billing-admin-helpers.test.ts.
 */

export interface CooldownResult {
  canSync: boolean;
  remainingSec: number;
  nextAvailableAt: string | null;
}

/** Manual-sync cooldown: blocked until `windowMs` after the last sync timestamp. */
export function computeManualSyncCooldown(
  lastIso: string | null | undefined,
  nowMs: number,
  windowMs: number,
): CooldownResult {
  if (!lastIso) return { canSync: true, remainingSec: 0, nextAvailableAt: null };
  const last = new Date(lastIso).getTime();
  if (!Number.isFinite(last)) return { canSync: true, remainingSec: 0, nextAvailableAt: null };
  const elapsed = nowMs - last;
  if (elapsed >= windowMs) return { canSync: true, remainingSec: 0, nextAvailableAt: null };
  return {
    canSync: false,
    remainingSec: Math.ceil((windowMs - elapsed) / 1000),
    nextAvailableAt: new Date(last + windowMs).toISOString(),
  };
}

/** Authorization for writing a single mitra_integrations key. */
export function canWriteMitraIntegration(args: {
  isJabnetRoot: boolean;
  activeMitraId: number;
  targetMitraId: number;
  key: string;
}): { allowed: boolean; reason?: string } {
  const { isJabnetRoot, activeMitraId, targetMitraId, key } = args;
  if (key.startsWith("billing_reseller") && !isJabnetRoot) {
    return { allowed: false, reason: "Konfigurasi billing hanya bisa diatur oleh JABNET" };
  }
  if (targetMitraId !== activeMitraId && !isJabnetRoot) {
    return { allowed: false, reason: "Tidak boleh mengubah integrasi mitra lain" };
  }
  return { allowed: true };
}

/** Map raw billing rows to a compact preview sample (capped). */
export function mapBillingSample(rows: any[], limit = 10): Array<{
  customer_id: any; nama: any; alamat: any; paket: any; status: any; is_isolir: any;
}> {
  return (rows ?? []).slice(0, limit).map((c) => ({
    customer_id: c.customer_id,
    nama: c.nama_lengkap ?? c.nama_panggilan,
    alamat: c.alamat_pelanggan,
    paket: c.paket_layanan,
    status: c.status_pelanggan,
    is_isolir: c.is_isolir,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/billing-admin-helpers.test.ts`
Expected: PASS - all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add server/billing-admin-helpers.ts server/billing-admin-helpers.test.ts
git commit -m "feat(billing): pure helpers for cooldown, integration auth, sample mapping"
```

---

## Task 2: Worker - explicit-reseller fetch + `testResellerData`

**Files:**
- Modify: `server/billing-sync-worker.ts:360-423` (the `fetchAllFromBilling` method)

This refactors the single `fetchAllFromBilling` into three pieces: `resolveResellerId` (settings/JABNET resolution), `fetchResellerRows` (the actual fetch + dedupe, **no throw on empty**), and `fetchAllFromBilling` (calls both, keeps the throw-on-empty for the sync path). Adds public `testResellerData`.

- [ ] **Step 1: Add the import**

At the top of `server/billing-sync-worker.ts`, add to the existing imports:

```ts
import { mapBillingSample } from "./billing-admin-helpers.js";
```

- [ ] **Step 2: Replace `fetchAllFromBilling` (lines ~360-423) with the split methods**

Replace the entire existing `private async fetchAllFromBilling(...) { ... }` method with:

```ts
  /** Resolve reseller_id: explicit override wins, else per-mitra setting (JABNET=12 fallback). */
  private async resolveResellerId(override?: number): Promise<number> {
    if (override !== undefined && Number.isFinite(override) && override > 0) return override;
    const currentMitra = getMitraIdOrNull() ?? 1;
    const isJabnet = currentMitra === 1;
    const resellerFromSettings = await storage.getMitraSetting("billing_reseller_id");
    let resellerId: number;
    if (isJabnet) {
      resellerId = resellerFromSettings ? parseInt(resellerFromSettings) : 12;
    } else {
      if (!resellerFromSettings) {
        throw new Error(`Mitra ${currentMitra}: billing_reseller_id belum di-set. Atur via /integrations (JABNET).`);
      }
      resellerId = parseInt(resellerFromSettings);
    }
    if (!Number.isFinite(resellerId) || resellerId <= 0) {
      throw new Error(`Invalid reseller_id config for mitra ${currentMitra} (got "${resellerFromSettings}").`);
    }
    return resellerId;
  }

  /** Fetch all active customers (rumahan+bisnis+vip) for a reseller_id. Deduped. NO throw on empty. */
  private async fetchResellerRows(resellerId: number): Promise<BillingCustomerRecord[]> {
    const API_TOKEN = process.env.BILLING_API_TOKEN ?? "";
    if (!API_TOKEN) {
      throw new Error("BILLING_API_TOKEN belum di-set di .env server. Hubungi admin server.");
    }
    const BASE_URL = process.env.BILLING_API_URL || "https://billing.jabnet.id/api/pelanggan/list_pelanggan";

    const fetchOne = async (params: Record<string, string>): Promise<BillingCustomerRecord[]> => {
      const qs = new URLSearchParams({ ...params, reseller_id: String(resellerId), api_token: API_TOKEN });
      const r = await fetch(`${BASE_URL}?${qs}`, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`Billing API HTTP ${r.status} (reseller_id=${resellerId})`);
      const json: any = await r.json();
      return json?.data?.data_pelanggan ?? json?.data ?? [];
    };

    const [rumahan, bisnis, vip] = await Promise.all([
      fetchOne({ jenis_pelanggan: "rumahan", status_pelanggan: "aktif" }).catch(e => {
        console.warn(`[BillingSyncWorker] rumahan fetch warn (reseller=${resellerId}):`, e.message); return [];
      }),
      fetchOne({ jenis_pelanggan: "bisnis", status_pelanggan: "aktif" }).catch(e => {
        console.warn(`[BillingSyncWorker] bisnis fetch warn (reseller=${resellerId}):`, e.message); return [];
      }),
      fetchOne({ jenis_pelanggan: "vip", status_pelanggan: "aktif" }).catch(e => {
        console.warn(`[BillingSyncWorker] vip fetch warn (reseller=${resellerId}):`, e.message); return [];
      }),
    ]);
    const seen = new Set<string>();
    const combined: BillingCustomerRecord[] = [];
    for (const row of [...rumahan, ...bisnis, ...vip]) {
      const key = String((row as any).customer_id ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      combined.push(row);
    }
    return combined;
  }

  /** Sync path: resolve reseller + fetch. Throws on empty (treated as connectivity/cred error). */
  private async fetchAllFromBilling(resellerIdOverride?: number): Promise<BillingCustomerRecord[]> {
    const resellerId = await this.resolveResellerId(resellerIdOverride);
    const combined = await this.fetchResellerRows(resellerId);
    if (combined.length === 0) {
      throw new Error(`Billing API returned empty (reseller_id=${resellerId}) - check connectivity/credentials`);
    }
    return combined;
  }

  /** Admin "Test": does this reseller_id pull customers? Returns count + sample. NO throw on empty. */
  async testResellerData(resellerId: number): Promise<{ totalFound: number; sample: any[] }> {
    const rows = await this.fetchResellerRows(resellerId);
    return { totalFound: rows.length, sample: mapBillingSample(rows) };
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: 0 errors. (`fetchAllFromBilling` is still called with no args from `runOnce`/`forceResyncOne`; the new optional param is backward-compatible.)

- [ ] **Step 4: Commit**

```bash
git add server/billing-sync-worker.ts
git commit -m "feat(billing): split fetch into resolveResellerId + fetchResellerRows; add testResellerData"
```

---

## Task 3: JABNET-root billing-admin endpoints

**Files:**
- Modify: `server/routes.ts` (add `isJabnetRoot` near `isMitraAdmin` at line ~719; add endpoints near the other `/api/billing/*` routes around line ~3724)

- [ ] **Step 1: Add `isJabnetRoot` helper**

After `isMitraAdmin` (ends line ~725) add:

```ts
/** JABNET-root = System-Admin role at mitra 1 (cross-tenant owner). Gate for centralized billing config. */
function isJabnetRoot(req: Request): boolean {
  return !!req.authUser?.isSystemAdmin;
}
```

- [ ] **Step 2: Add the four endpoints**

After the `POST /api/billing/sync` handler (ends line ~3724), insert:

```ts
// -- JABNET-root billing admin: manage each mitra's reseller_id centrally --
const billingSampleToClient = (s: any[]) => s; // sample already mapped by worker

/** GET /api/billing/mitras - list all mitras + billing_id + last sync status + customer count. JABNET-root only. */
router.get("/api/billing/mitras", async (req: Request, res: Response) => {
  if (!isJabnetRoot(req)) return sendError(res, "Akses ditolak: khusus JABNET", 403);
  try {
    const mitras = await storage.listMitras(true);
    const out = [];
    for (const m of mitras) {
      const row = await new Promise<any>((resolve) => {
        tenantContext.run({ mitraId: m.id, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
          try {
            const billingId = (await storage.getMitraSetting("billing_reseller_id", { fallbackToGlobal: false })) ?? "";
            const lastAt = (await storage.getMitraSetting("billing_manual_sync_last_at", { fallbackToGlobal: false })) ?? null;
            const counts: any = ((await storage.db.execute(
              sql`SELECT COUNT(*) AS c FROM customers WHERE mitra_id = ${m.id}`,
            ))[0] as any);
            resolve({ billingId, lastAt, customerCount: Number(counts?.[0]?.c ?? 0) });
          } catch { resolve({ billingId: "", lastAt: null, customerCount: 0 }); }
        });
      });
      out.push({
        mitraId: m.id,
        name: (m as any).displayName ?? m.name,
        slug: m.slug,
        isJabnet: m.id === 1,
        billingId: row.billingId,
        lastSyncAt: row.lastAt,
        customerCount: row.customerCount,
      });
    }
    sendSuccess(res, { mitras: out });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/billing/mitras/:id - save billing_reseller_id for a mitra. JABNET-root only. */
router.put("/api/billing/mitras/:id", integrationsLimiter, async (req: Request, res: Response) => {
  if (!isJabnetRoot(req)) return sendError(res, "Akses ditolak: khusus JABNET", 403);
  const mitraId = Number(req.params.id);
  const billingId = String(req.body?.billingId ?? "").trim();
  if (mitraId === 1) return sendError(res, "JABNET adalah billing root (reseller_id=12, via .env) - tidak bisa diubah di sini", 400);
  const m = await storage.getMitra(mitraId);
  if (!m) return sendError(res, "Mitra tidak ditemukan", 404);
  if (billingId && !/^\d+$/.test(billingId)) return sendError(res, "Billing ID harus angka", 400);
  try {
    await new Promise<void>((resolve, reject) => {
      tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try {
          if (billingId) await storage.setMitraSetting("billing_reseller_id", billingId);
          else await storage.deleteMitraSetting("billing_reseller_id");
          resolve();
        } catch (e) { reject(e); }
      });
    });
    await logAudit(req, "UPDATE", "billing_reseller", mitraId, (m as any).name, { billingId: billingId || null });
    sendSuccess(res, { mitraId, billingId: billingId || null });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/billing/mitras/:id/test - does this reseller_id pull customers? JABNET-root only. */
router.post("/api/billing/mitras/:id/test", billingSyncLimiter, async (req: Request, res: Response) => {
  if (!isJabnetRoot(req)) return sendError(res, "Akses ditolak: khusus JABNET", 403);
  recordRateAttempt(BILLING_SYNC_LIMIT.bucket, rateLimitKey(req), BILLING_SYNC_LIMIT);
  const mitraId = Number(req.params.id);
  let billingId = String(req.body?.billingId ?? "").trim();
  try {
    if (!billingId) {
      billingId = await new Promise<string>((resolve) => {
        tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
          resolve((await storage.getMitraSetting("billing_reseller_id", { fallbackToGlobal: false })) ?? "");
        });
      });
    }
    const resellerId = parseInt(billingId);
    if (!Number.isFinite(resellerId) || resellerId <= 0) {
      return sendError(res, "Billing ID belum di-set / bukan angka", 400);
    }
    const t0 = Date.now();
    const { totalFound, sample } = await billingSyncWorker.testResellerData(resellerId);
    sendSuccess(res, { ok: totalFound > 0, resellerId, totalFound, elapsedMs: Date.now() - t0, sample });
  } catch (e: any) { sendError(res, `Test gagal: ${e.message}`, 502); }
});

/** POST /api/billing/mitras/:id/sync - full sync of a specific mitra. JABNET-root only. Exempt from manual cooldown. */
router.post("/api/billing/mitras/:id/sync", billingSyncLimiter, async (req: Request, res: Response) => {
  if (!isJabnetRoot(req)) return sendError(res, "Akses ditolak: khusus JABNET", 403);
  recordRateAttempt(BILLING_SYNC_LIMIT.bucket, rateLimitKey(req), BILLING_SYNC_LIMIT);
  const mitraId = Number(req.params.id);
  const m = await storage.getMitra(mitraId);
  if (!m) return sendError(res, "Mitra tidak ditemukan", 404);
  try {
    const stats = await new Promise<any>((resolve, reject) => {
      tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try { resolve(await billingSyncWorker.triggerManual(req.authUser!.id)); } catch (e) { reject(e); }
      });
    });
    await logAudit(req, "SYNC", "billing", mitraId, (m as any).name, stats);
    sendSuccess(res, { ...stats, mitraId, syncedAt: new Date().toISOString() });
  } catch (e: any) { sendError(res, `Sync gagal: ${e.message}`, 500); }
});
```

- [ ] **Step 3: Verify `sql` + `storage.db` are accessible**

Run: `grep -n "import { sql }\|from \"drizzle-orm\"\|storage.db\|public db" server/routes.ts server/storage.ts | head`
Expected: `sql` is importable in routes.ts (it is used elsewhere) and `storage.db` is reachable. If `storage.db` is private, replace the count query block with:
```ts
const counts: any = ((await storage.pool.execute("SELECT COUNT(*) AS c FROM customers WHERE mitra_id = ?", [m.id]))[0] as any);
resolve({ billingId, lastAt, customerCount: Number(counts?.[0]?.c ?? 0) });
```
Then run `npm run typecheck`. Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(billing): JABNET-root endpoints to manage per-mitra billing_id (list/save/test/sync)"
```

---

## Task 4: Per-mitra manual-sync cooldown on `/api/billing/sync`

**Files:**
- Modify: `server/routes.ts` (constant near line ~509; `POST /api/billing/sync` at line ~3711; new cooldown GET endpoint)

- [ ] **Step 1: Add the cooldown constant + import**

Near the rate-limit constants (line ~509) add:

```ts
const MANUAL_SYNC_COOLDOWN_MS = 10 * 60_000; // 1 manual sync per mitra per 10 minutes
```

At the top imports of `routes.ts`, add:

```ts
import { computeManualSyncCooldown } from "./billing-admin-helpers.js";
```

- [ ] **Step 2: Add cooldown enforcement to `POST /api/billing/sync`**

Replace the body of the existing handler (lines ~3711-3724) with:

```ts
router.post("/api/billing/sync", billingSyncLimiter, async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  recordRateAttempt(BILLING_SYNC_LIMIT.bucket, rateLimitKey(req), BILLING_SYNC_LIMIT);
  if (!hasWritePermission(req, "billing_sync")) {
    return sendError(res, "Akses ditolak: billing_sync write required", 403);
  }
  // Per-mitra cooldown (persisted, shared across users in the mitra)
  const lastAt = await storage.getMitraSetting("billing_manual_sync_last_at", { fallbackToGlobal: false });
  const cd = computeManualSyncCooldown(lastAt, Date.now(), MANUAL_SYNC_COOLDOWN_MS);
  if (!cd.canSync) {
    return res.status(429).json({
      success: false,
      error: `Sync baru bisa dilakukan lagi dalam ${Math.ceil(cd.remainingSec / 60)} menit`,
      remainingSec: cd.remainingSec,
      nextAvailableAt: cd.nextAvailableAt,
    });
  }
  try {
    const stats = await billingSyncWorker.triggerManual(req.authUser.id);
    await storage.setMitraSetting("billing_manual_sync_last_at", new Date().toISOString());
    await logAudit(req, "SYNC", "billing", undefined, "manual_trigger", stats);
    sendSuccess(res, { ...stats, syncedAt: new Date().toISOString() });
  } catch (e: any) {
    sendError(res, `Sync gagal: ${e.message}`, 500);
  }
});
```

- [ ] **Step 3: Add the cooldown GET endpoint**

Immediately after the handler above, insert:

```ts
/** GET /api/billing/sync/cooldown - manual-sync availability for the active mitra. */
router.get("/api/billing/sync/cooldown", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const lastAt = await storage.getMitraSetting("billing_manual_sync_last_at", { fallbackToGlobal: false });
  const cd = computeManualSyncCooldown(lastAt, Date.now(), MANUAL_SYNC_COOLDOWN_MS);
  sendSuccess(res, { ...cd, cooldownMinutes: MANUAL_SYNC_COOLDOWN_MS / 60_000 });
});
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(billing): per-mitra 10-min cooldown on manual sync + cooldown status endpoint"
```

---

## Task 5: Harden `/api/mitras/:id/integrations` writes

**Files:**
- Modify: `server/routes.ts:1242-1305` (GET + PUT integration handlers)

- [ ] **Step 1: Add import**

Add to the top imports of `routes.ts` (combine with the Task 4 import line):

```ts
import { computeManualSyncCooldown, canWriteMitraIntegration } from "./billing-admin-helpers.js";
```

- [ ] **Step 2: Guard cross-mitra GET**

In `GET /api/mitras/:id/integrations` (line ~1242), after `const mitraId = Number(req.params.id);` and the `getMitra` null-check, add:

```ts
    if (mitraId !== req.authUser!.activeMitraId && !isJabnetRoot(req)) {
      return sendError(res, "Tidak boleh melihat integrasi mitra lain", 403);
    }
```

- [ ] **Step 3: Guard PUT per-key**

In `PUT /api/mitras/:id/integrations` (line ~1261), inside the `for (const it of items)` loop, replace the existing key-validation block so each key is authorization-checked. The loop body becomes:

```ts
          for (const it of items) {
            if (!it?.key || typeof it.key !== "string") { skipped.push("(missing key)"); continue; }
            if (it.key.length > 100 || /[^a-z0-9_]/i.test(it.key)) { skipped.push(it.key); continue; }
            const authz = canWriteMitraIntegration({
              isJabnetRoot: isJabnetRoot(req),
              activeMitraId: req.authUser!.activeMitraId,
              targetMitraId: mitraId,
              key: it.key,
            });
            if (!authz.allowed) { skipped.push(it.key); continue; }
            if (it.value === null || it.value === undefined || it.value === "") {
              await storage.deleteMitraSetting(it.key);
            } else {
              await storage.setMitraSetting(it.key, String(it.value), { isSecret: isSecretIntegrationKey(it.key) });
            }
            applied.push(it.key);
            if (it.key === "google_maps_api_key") publicConfigCache.clear();
          }
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Manual guard check (dev server)**

Run the dev server (`npm run dev`), then as a **non-JABNET** mitra admin token:
```bash
curl -s -X PUT http://localhost:3002/api/mitras/3/integrations \
  -H "Authorization: Bearer <non-jabnet-admin-token>" -H "Content-Type: application/json" \
  -d '{"settings":[{"key":"billing_reseller_id","value":"99"}]}'
```
Expected: response shows `billing_reseller_id` in `skipped`, not `applied`.

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts
git commit -m "fix(security): restrict cross-mitra + billing_reseller_* integration writes to JABNET root"
```

---

## Task 6: Client - IntegrationPage billing panel (JABNET-only)

**Files:**
- Modify: `client/pages/IntegrationPage.tsx` (remove non-JABNET reseller section ~1430-1709; gate billing on `isSystemAdmin`; add JABNET per-mitra panel)

- [ ] **Step 1: Add `isSystemAdmin` + Combobox import + panel state**

Near the top of the component (after `const { user } = useAuth();` at line ~348) add:

```ts
  const isSystemAdmin = !!user?.isSystemAdmin;
```

Ensure `Combobox` is imported (top of file, with other ui imports):

```ts
import { Combobox } from "@/components/ui/combobox";
```

Replace the reseller state block (lines ~723-732) with the new JABNET-panel state:

```ts
  // JABNET-root per-mitra billing management
  const [selBillingMitra, setSelBillingMitra] = useState<string>("");
  const [selBillingId, setSelBillingId] = useState("");
  const [billMitraSaving, setBillMitraSaving] = useState(false);
  const [billMitraTesting, setBillMitraTesting] = useState(false);
  const [billMitraSyncing, setBillMitraSyncing] = useState(false);
  const [billMitraTestResult, setBillMitraTestResult] = useState<any | null>(null);

  const { data: billingMitras, refetch: refetchBillingMitras } = useQuery<any>({
    queryKey: ["/api/billing/mitras"],
    queryFn: () => api.get<any>("/billing/mitras"),
    enabled: isSystemAdmin,
    staleTime: 30_000,
  });
  const billingMitraList: any[] = billingMitras?.mitras ?? [];

  // When a mitra is picked, prefill its current billing_id
  useEffect(() => {
    if (!selBillingMitra) { setSelBillingId(""); setBillMitraTestResult(null); return; }
    const m = billingMitraList.find((x) => String(x.mitraId) === selBillingMitra);
    setSelBillingId(m?.billingId ?? "");
    setBillMitraTestResult(null);
  }, [selBillingMitra, billingMitras]);
```

- [ ] **Step 2: Add the panel handlers**

Replace the old `handleSaveResellerProfile` / `handleVerifyReseller` (and the `mitraIntegrations` reseller `useEffect`/query, lines ~734-800+) with:

```ts
  const handleSaveBillingMitra = async () => {
    if (!selBillingMitra) return;
    setBillMitraSaving(true);
    try {
      await api.put(`/billing/mitras/${selBillingMitra}`, { billingId: selBillingId.trim() || null });
      toast.success("Billing ID tersimpan");
      refetchBillingMitras();
    } catch (err: any) { toast.error(`Gagal menyimpan: ${err.message}`); }
    finally { setBillMitraSaving(false); }
  };

  const handleTestBillingMitra = async () => {
    if (!selBillingMitra) return;
    setBillMitraTesting(true);
    setBillMitraTestResult(null);
    try {
      const result: any = await api.post(`/billing/mitras/${selBillingMitra}/test`, { billingId: selBillingId.trim() });
      setBillMitraTestResult(result);
      if (result?.ok) toast.success(`Berhasil - ${result.totalFound} pelanggan ditemukan`);
      else toast.warning("Reseller ID ini tidak mengembalikan pelanggan");
    } catch (err: any) { toast.error(err.message ?? "Test gagal"); }
    finally { setBillMitraTesting(false); }
  };

  const handleSyncBillingMitra = async () => {
    if (!selBillingMitra) return;
    setBillMitraSyncing(true);
    try {
      const result: any = await api.post(`/billing/mitras/${selBillingMitra}/sync`, {});
      toast.success(`Sync selesai - ${result?.updated ?? 0} updated, ${result?.created ?? 0} created`, {
        description: `Total ${result?.total ?? 0} · error ${result?.errors ?? 0}`,
      });
      refetchBillingMitras();
    } catch (err: any) { toast.error(`Sync gagal: ${err.message}`); }
    finally { setBillMitraSyncing(false); }
  };
```

- [ ] **Step 3: Replace the reseller section JSX (lines ~1430-1709) with the JABNET panel**

Delete the entire `{activeMitraId === 1 ? (...) : (...)}` reseller block (lines ~1430 through its closing `)}` after the actions footer ~1709) and replace with:

```tsx
          {/* -- Billing config: JABNET-root manages every mitra's billing_id -- */}
          {!isSystemAdmin ? null : (
          <section id="billing-mitra-admin" className="rounded-lg border bg-gradient-to-br from-sky-50/60 to-blue-50/40 dark:from-sky-950/20 dark:to-blue-950/10 border-sky-200/60 dark:border-sky-900/40 p-4 space-y-3">
            <header className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Billing Sync - Kelola per Mitra</h3>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Pilih mitra lalu atur Billing ID (reseller_id) billing.jabnet.id. Hanya JABNET yang bisa mengatur ini.
                </p>
              </div>
            </header>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Mitra</Label>
              <Combobox
                options={billingMitraList.map((m) => ({
                  value: String(m.mitraId),
                  label: `${m.name}${m.isJabnet ? " (root)" : ""}`,
                  description: m.isJabnet ? "Billing root · reseller_id 12" : `Billing ID: ${m.billingId || "-"} · ${m.customerCount} pelanggan`,
                }))}
                value={selBillingMitra}
                onChange={setSelBillingMitra}
                searchPlaceholder="Cari mitra..."
              />
            </div>

            {selBillingMitra && billingMitraList.find((x) => String(x.mitraId) === selBillingMitra)?.isJabnet ? (
              <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-[11px] text-muted-foreground">
                JABNET adalah billing provider root - memakai <strong>reseller_id = 12</strong> dengan token dari server <code className="font-mono">.env</code>. Tidak ada yang perlu diatur di sini.
              </div>
            ) : selBillingMitra ? (
              <>
                <div className="space-y-1.5 max-w-xs">
                  <Label htmlFor="bill-mitra-id" className="text-xs font-medium">Billing ID <span className="text-destructive">*</span></Label>
                  <Input id="bill-mitra-id" inputMode="numeric" value={selBillingId} onChange={(e) => setSelBillingId(e.target.value)} placeholder="mis. 27" />
                  <p className="text-[11px] text-muted-foreground"><code className="font-mono">kode_reseller</code> di billing.jabnet.id</p>
                </div>

                {billMitraTestResult && (
                  <div className={`rounded-md border p-3 text-xs ${billMitraTestResult.ok ? "bg-green-50/60 dark:bg-green-950/20 border-green-200/60" : "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/60"}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      {billMitraTestResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                      {billMitraTestResult.ok ? `${billMitraTestResult.totalFound} pelanggan ditemukan` : "Tidak ada pelanggan"}
                      <span className="text-muted-foreground font-normal">· {billMitraTestResult.elapsedMs}ms</span>
                    </div>
                    {Array.isArray(billMitraTestResult.sample) && billMitraTestResult.sample.length > 0 && (
                      <ul className="mt-1 space-y-0.5 font-mono-tight text-[11px]">
                        {billMitraTestResult.sample.map((s: any) => (
                          <li key={s.customer_id}>{s.customer_id} · {s.nama} · {s.paket}{s.is_isolir ? <span className="ml-1 text-amber-600">[isolir]</span> : null}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveBillingMitra} disabled={billMitraSaving}>
                    {billMitraSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Konfirmasi
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleTestBillingMitra} disabled={billMitraTesting}>
                    {billMitraTesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TestTube className="h-4 w-4 mr-1" />}Test
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleSyncBillingMitra} disabled={billMitraSyncing}>
                    {billMitraSyncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}Tarik Pelanggan
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">Pilih mitra untuk mulai.</p>
            )}
          </section>
          )}
```

- [ ] **Step 4: Gate the global Billing Sync card on `isSystemAdmin`**

Find the global Billing Sync card (line ~1337, comment `{/* Card - Billing Sync (billing.jabnet.id) */}`). Wrap its render with `{isSystemAdmin && ( ... )}` so non-JABNET mitras see no billing card at all. (If it is a sibling element, wrap the JSX element; ensure the closing `)}` is added correctly, then run typecheck.)

- [ ] **Step 5: Verify it compiles**

Run: `npm run typecheck`
Expected: 0 errors. Remove any now-unused imports/vars flagged (e.g. `PasswordInput`, old `reseller*` state) - delete what the compiler reports as unused.

- [ ] **Step 6: Commit**

```bash
git add client/pages/IntegrationPage.tsx
git commit -m "feat(integrations): JABNET-root per-mitra billing panel; hide billing from other mitras"
```

---

## Task 7: Client - Google Maps helper text + source badge

**Files:**
- Modify: `client/pages/IntegrationPage.tsx` (Google Maps section - find by label "Google Maps API Key" / `google_maps_api_key`)

- [ ] **Step 1: Locate the Maps input**

Run: `grep -n "Google Maps\|google_maps_api_key\|googleMapsApiKey\|mapsKey" client/pages/IntegrationPage.tsx | head`
Note the input + its state variable for the maps key (e.g. `mapsKey`).

- [ ] **Step 2: Add helper text + source badge under the Maps input**

Directly under the Google Maps API key `<Input>`, add (use the actual maps key state var name from Step 1 in place of `mapsKey`):

```tsx
                <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                  Default memakai API Google Maps milik <strong>JABNET</strong> (sudah disediakan). Isi kolom ini dengan API key milik Anda sendiri untuk memakai kuota Anda. <strong>Kosongkan</strong> kolom lalu simpan untuk kembali memakai API JABNET.
                </p>
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium mt-1 px-2 py-0.5 rounded-full ${mapsKey.trim() ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" : "bg-muted text-muted-foreground"}`}>
                  {mapsKey.trim() ? "Memakai API key Anda sendiri" : "Sedang memakai: API JABNET (default)"}
                </span>
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add client/pages/IntegrationPage.tsx
git commit -m "feat(integrations): explain Google Maps key fallback to JABNET + show active source"
```

---

## Task 8: Client - `/customers` sync button + cooldown

**Files:**
- Modify: `client/pages/CustomersPage.tsx` (header button group at line ~1253)

- [ ] **Step 1: Add imports + state + cooldown query**

Ensure these are imported at the top of `CustomersPage.tsx`:
```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
```
(Add only the ones not already present.)

Inside the component (near other hooks, after `const { canWrite } = useAuth();` ~line 827), add:

```ts
  const canBillingSync = canWrite?.("billing_sync") ?? false;
  const [syncing, setSyncing] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const { data: cooldown, refetch: refetchCooldown } = useQuery<any>({
    queryKey: ["/api/billing/sync/cooldown"],
    queryFn: () => api.get<any>("/billing/sync/cooldown"),
    enabled: canBillingSync,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const nextAt = cooldown?.nextAvailableAt ? new Date(cooldown.nextAvailableAt).getTime() : 0;
  const remainingMs = Math.max(0, nextAt - nowTick);
  const onCooldown = remainingMs > 0;
  const mmss = `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}`;

  const handleBillingSync = async () => {
    setSyncing(true);
    try {
      const r: any = await api.post("/billing/sync", {});
      toast.success(`Sync selesai - ${r?.updated ?? 0} diperbarui, ${r?.created ?? 0} dibuat`, {
        description: `Total ${r?.total ?? 0} pelanggan · error ${r?.errors ?? 0}`,
      });
      refetchCooldown();
    } catch (err: any) {
      const m = (err && err.message) || "Sync gagal";
      toast.error(m);
      refetchCooldown();
    } finally { setSyncing(false); }
  };
```

> If `canWrite` is not a function in this page's `useAuth()` shape, check how permissions are read elsewhere in the file (`grep -n "canWrite\|hasPermission\|permLevels" client/pages/CustomersPage.tsx`) and use that pattern. If no billing permission gate is readily available, gate the button on the user simply being authenticated and let the server's 403 handle authorization.

- [ ] **Step 2: Add the button to the header group**

In the header button group (line ~1253, after the Export CSV `<Button>`), add:

```tsx
          {canBillingSync && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBillingSync}
              disabled={syncing || onCooldown}
              title={onCooldown ? `Tersedia lagi dalam ${mmss}` : "Tarik data terbaru dari billing"}
            >
              {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {onCooldown ? `Sinkron (${mmss})` : "Sinkron dengan Billing"}
            </Button>
          )}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Manual check (dev server)**

Run `npm run dev`, open `/customers`, click "Sinkron dengan Billing":
- Expect a success toast, then the button shows a countdown and is disabled.
- Click again immediately → server returns 429; toast shows the "tersedia lagi" message.

- [ ] **Step 5: Commit**

```bash
git add client/pages/CustomersPage.tsx
git commit -m "feat(customers): per-mitra manual billing sync button with 10-min cooldown countdown"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run all server tests**

Run: `npx tsx --test server/billing-admin-helpers.test.ts server/reporting-helpers.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success (Vite client + esbuild `dist/index.mjs`).

- [ ] **Step 4: Final commit (if anything pending)**

```bash
git add -A && git commit -m "chore(billing): finalize centralization + per-mitra sync + maps fallback" || echo "nothing to commit"
```

---

## Self-Review Notes (coverage vs spec)

- **A - centralization:** Tasks 3 (endpoints), 5 (security guard), 6 (client panel + hide). ✓
- **A - simplified Test (billing_id only):** Task 2 (`testResellerData`) + Task 3 (`/test` endpoint) + Task 6 (panel). ✓
- **B - per-mitra sync button + 10-min cooldown:** Task 1 (cooldown helper), Task 4 (endpoint + enforcement), Task 8 (button). ✓
- **C - Maps fallback text + source badge:** Task 7 (client only; backend already supports). ✓
- **Tests:** Task 1 (helpers) + manual curl checks (Tasks 5, 8) + Task 9 (suite/typecheck/build). Endpoint guards rely on the tested `canWriteMitraIntegration`/`computeManualSyncCooldown` helpers + manual curl; no HTTP integration harness exists in this repo. ✓
- **Deploy:** standard `git push` → GHA → cPanel pull → restart (per CLAUDE.md). No new env var. JABNET's shared Maps key must already be in **global app_settings** `google_maps_api_key` (operational; unchanged).
