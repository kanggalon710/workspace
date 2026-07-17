# Per-Mitra Feature Gating — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make per-mitra feature toggles (`mitras.features`) actually enforce access by stripping a disabled feature's permissions at per-mitra permission resolution — the single chokepoint that all client menus/routes and server endpoints already respect.

**Architecture:** A pure `gatePermissionsByFeatures()` helper applies a `FEATURE_PERMISSIONS` mapping. `getUserEffectivePermissionsAtMitra` gates the resolved perms before caching. JABNET (mitra 1) is never gated. The mitra-update endpoint busts the per-mitra perm cache so toggles take effect immediately.

**Tech Stack:** Node/Express/Drizzle (server), `node:test` via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-06-03-per-mitra-feature-gating-design.md`

---

## Task 1: Mapping + pure gate helper + tests

**Files:**
- Modify: `shared/schema.ts` (after `ALL_FEATURES` / `FeatureKey`, ~line 1187)
- Create: `server/feature-gate.ts`
- Create: `server/feature-gate.test.ts`

- [ ] **Step 1: Add `FEATURE_PERMISSIONS` to `shared/schema.ts`**

After the `export type FeatureKey = ...` line (~1187):

```ts
// Which permission keys each feature gates. Disabling a feature for a mitra strips these
// permissions at per-mitra resolution (see server/feature-gate.ts). Keys map to ALL_PERMISSIONS.
export const FEATURE_PERMISSIONS: Record<string, string[]> = {
  loyalty: ["loyalty_admin"],
  collections: ["collections"],
  public_api: ["api_keys"],
  marketing_ads: ["marketing_ads"],
  bug_reports: ["bug_reports"],
  announcements: ["announcements_admin"],
  broadcast: ["broadcast", "whatsapp", "phonebooks"],
  canvassing: ["canvassing", "prospects"],
  mikrotik: ["routers", "monitoring"],
  genieacs: ["devices"],
  customer_portal: ["customer_portal_admin"],
  chatwoot: [],
};
```

- [ ] **Step 2: Write the failing test `server/feature-gate.test.ts`**

First check how server files import shared schema (alias vs relative): `grep -nE "from \"@shared/schema\"|from \"\\.\\./shared/schema" server/storage.ts server/routes.ts | head`. Use the SAME specifier in `feature-gate.ts` (Step 4). The test imports the local module with `.js`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { gatePermissionsByFeatures } from "./feature-gate.js";

type L = "none" | "read" | "write";
const base: Record<string, L> = {
  loyalty_admin: "write", collections: "write", broadcast: "read",
  whatsapp: "write", phonebooks: "read", dashboard: "read", api_keys: "write",
};

test("mitra 1 (JABNET) is never gated", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ loyalty: false }), 1);
  assert.equal(out.loyalty_admin, "write");
});
test("loyalty:false strips loyalty_admin, leaves others", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ loyalty: false }), 7);
  assert.equal(out.loyalty_admin, "none");
  assert.equal(out.collections, "write");
});
test("broadcast:false strips broadcast+whatsapp+phonebooks", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ broadcast: false }), 7);
  assert.equal(out.broadcast, "none");
  assert.equal(out.whatsapp, "none");
  assert.equal(out.phonebooks, "none");
});
test("feature absent => enabled (perm retained)", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ collections: true }), 7);
  assert.equal(out.loyalty_admin, "write");
});
test("explicit true keeps permission", () => {
  const out = gatePermissionsByFeatures(base, JSON.stringify({ loyalty: true }), 7);
  assert.equal(out.loyalty_admin, "write");
});
test("malformed JSON => perms unchanged", () => {
  const out = gatePermissionsByFeatures(base, "{not json", 7);
  assert.equal(out.loyalty_admin, "write");
});
test("null/empty features => unchanged", () => {
  assert.equal(gatePermissionsByFeatures(base, null, 7).loyalty_admin, "write");
  assert.equal(gatePermissionsByFeatures(base, "", 7).loyalty_admin, "write");
});
test("does not mutate input object", () => {
  gatePermissionsByFeatures(base, JSON.stringify({ loyalty: false }), 7);
  assert.equal(base.loyalty_admin, "write");
});
```

Run: `npx tsx --test server/feature-gate.test.ts` → expect FAIL (module not found).

- [ ] **Step 3: Run test to confirm it fails** — `npx tsx --test server/feature-gate.test.ts`.

- [ ] **Step 4: Implement `server/feature-gate.ts`**

Use the SAME shared-schema import specifier found in Step 2 (shown here as `@shared/schema`; replace if the repo uses a relative path like `../shared/schema.js`):

```ts
import { FEATURE_PERMISSIONS } from "@shared/schema";

type Level = "none" | "read" | "write";

/**
 * Strip the permissions of any disabled feature for a mitra.
 * Pure — no I/O. JABNET (mitra 1) is the owner and is never gated.
 * A feature absent from `featuresJson` is treated as enabled; only explicit `false` disables.
 * Malformed/empty JSON leaves perms unchanged (fail-open to avoid lockout).
 */
export function gatePermissionsByFeatures(
  perms: Record<string, Level>,
  featuresJson: string | null | undefined,
  mitraId: number,
): Record<string, Level> {
  const out: Record<string, Level> = { ...perms };
  if (mitraId === 1) return out;
  if (!featuresJson) return out;
  let features: Record<string, unknown>;
  try { features = JSON.parse(featuresJson) ?? {}; } catch { return out; }
  for (const [feature, permKeys] of Object.entries(FEATURE_PERMISSIONS)) {
    if (features[feature] === false) {
      for (const pk of permKeys) out[pk] = "none";
    }
  }
  return out;
}
```

Run: `npx tsx --test server/feature-gate.test.ts` → expect ALL PASS. Then `npm run typecheck` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts server/feature-gate.ts server/feature-gate.test.ts
git commit -m "feat(feature-gating): FEATURE_PERMISSIONS map + pure gatePermissionsByFeatures helper"
```

---

## Task 2: Apply gating in `getUserEffectivePermissionsAtMitra`

**Files:**
- Modify: `server/storage.ts` (the method at ~line 6232; add import near the existing perm-cache import ~line 112)

This refactors so the resolved result is gated once before caching. The current method has a top cache-check and FOUR internal `setCachedPermsAtMitra(cacheKey, ...)` calls. We move all caching to a thin public wrapper and gate in between.

- [ ] **Step 1: Add the import**

Near the top of `server/storage.ts`, alongside the existing `import { ... } from "./perm-cache";` (line ~112), add:

```ts
import { gatePermissionsByFeatures } from "./feature-gate.js";
```

- [ ] **Step 2: Rename the existing method to a private uncached resolver**

Change the signature line (~6232) from:
```ts
  async getUserEffectivePermissionsAtMitra(
    userId: number,
    mitraId: number
  ): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }> {
    const cacheKey = `${userId}:${mitraId}`;
    const cached = getCachedPermsAtMitra(cacheKey);
    if (cached) return cached;
```
to:
```ts
  private async _resolvePermsAtMitra(
    userId: number,
    mitraId: number
  ): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }> {
```
(i.e. rename to `_resolvePermsAtMitra`, make it `private`, and DELETE the `const cacheKey` + `const cached` + `if (cached) return cached;` lines — caching moves to the wrapper.)

- [ ] **Step 3: Remove the 4 internal cache writes**

Inside `_resolvePermsAtMitra`, there are four `setCachedPermsAtMitra(cacheKey, X);` calls (each immediately before a `return X;`). DELETE each `setCachedPermsAtMitra(cacheKey, ...)` line, leaving the `return` statements. After this, `cacheKey` is no longer referenced in the method (good — it was removed in Step 2). The method now just resolves and returns, never caches.

- [ ] **Step 4: Add the public wrapper that gates + caches**

Immediately ABOVE `_resolvePermsAtMitra`, add the public method:

```ts
  async getUserEffectivePermissionsAtMitra(
    userId: number,
    mitraId: number
  ): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }> {
    const cacheKey = `${userId}:${mitraId}`;
    const cached = getCachedPermsAtMitra(cacheKey);
    if (cached) return cached;

    const result = await this._resolvePermsAtMitra(userId, mitraId);

    // Enforce per-mitra feature toggles: strip disabled features' permissions.
    // JABNET (mitra 1) is the owner and is never gated.
    let featuresJson: string | null = null;
    if (mitraId !== 1) {
      try {
        const rows: any = ((await this.db.execute(
          sql`SELECT features FROM mitras WHERE id = ${mitraId} LIMIT 1`,
        ))[0] as any);
        featuresJson = rows?.[0]?.features ?? null;
      } catch { featuresJson = null; }
    }
    const gated = { ...result, perms: gatePermissionsByFeatures(result.perms, featuresJson, mitraId) };
    setCachedPermsAtMitra(cacheKey, gated);
    return gated;
  }
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck` → 0 errors. Then `npx tsx --test server/feature-gate.test.ts server/billing-admin-helpers.test.ts server/reporting-helpers.test.ts` → all pass (sanity: nothing else broke). Confirm via grep that the only remaining `setCachedPermsAtMitra` for this cache key is in the new wrapper: `grep -n "setCachedPermsAtMitra\|getCachedPermsAtMitra\|_resolvePermsAtMitra" server/storage.ts`.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts
git commit -m "feat(feature-gating): gate resolved per-mitra permissions by mitra.features"
```

---

## Task 3: Bust perm cache when a mitra's features change

**Files:**
- Modify: `server/routes.ts` (`PUT /api/mitras/:id`, ~line 964; add import)

- [ ] **Step 1: Ensure `invalidatePermCacheAtMitra` is imported in routes.ts**

Check: `grep -n "invalidatePermCacheAtMitra\|from \"./perm-cache" server/routes.ts`. If not imported, add:
```ts
import { invalidatePermCacheAtMitra } from "./perm-cache.js";
```
(If `perm-cache` is already imported with other names, add `invalidatePermCacheAtMitra` to that import list instead of a new line.)

- [ ] **Step 2: Invalidate cache after a successful features update**

In `PUT /api/mitras/:id`, after the `await pool.execute(\`UPDATE mitras SET ...\`)` succeeds (just after the `if (pendingSlugRename) storage.invalidateMitraSlugCache(id);` line), add:

```ts
    if (b.features && typeof b.features === "object") {
      // Feature toggle changes effective permissions for this mitra's users — drop cached perms.
      invalidatePermCacheAtMitra();
    }
```

(`invalidatePermCacheAtMitra()` with no args clears all per-mitra entries — coarse but correct; feature toggles are rare.)

- [ ] **Step 3: Verify** — `npm run typecheck` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "fix(feature-gating): bust per-mitra perm cache when mitra features change"
```

---

## Task 4: Full verification

- [ ] **Step 1: Tests** — `npx tsx --test server/feature-gate.test.ts server/billing-admin-helpers.test.ts server/reporting-helpers.test.ts` → all pass.
- [ ] **Step 2: Typecheck** — `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** — `npm run build` → success.
- [ ] **Step 4: Commit any remainder** — `git add -A && git commit -m "chore(feature-gating): finalize" || echo "nothing to commit"`.

---

## Task 5 (added after final review): close the legacy admin-text bypass

**Why:** the final whole-implementation review found that the gate (which works via `permLevels`)
is bypassed by a pre-existing legacy shortcut `role === "admin" && !roleId` that sits *in front
of* `permLevels`. The default mitra admin (created by `POST /api/mitras` with `role='admin'`,
global `role_id=NULL`) hits it — exactly the bug actor (confirmed: dev user 37 `diar_suherli_admin`,
mitra 7). Seeded JABNET admins are **System-Admin** (`isSystemAdmin=true`), so tightening the
shortcut to JABNET-only does not lock them out.

**Files:**
- Modify: `server/routes.ts` — lines ~223 (`hasPermission`), ~231 (`hasWritePermission`),
  ~322 (`globalWriteGuard`), ~339 (`isSystemAdmin` helper).
- Modify: `client/context/AuthContext.tsx` — `canRead` (~165) and `canWrite` (~177).

- [ ] **Server:** to each of the four lines that read
  `if (req.authUser.role === "admin" && !req.authUser.roleId) return true;` (or `return next();`
  in `globalWriteGuard`), append `&& req.authUser.activeMitraId === 1` to the condition. After the
  change the legacy text-admin shortcut only applies inside JABNET (mitra 1); every non-JABNET mitra
  user is governed by their per-mitra `permLevels` (now feature-gated). Do NOT touch `isMitraAdmin`
  (intra-tenant mitra-admin capability stays).
- [ ] **Client `canRead`:** replace
  `if (user.role === "administrator" || user.role === "admin") return true;` with
  `if (user.isSystemAdmin) return true;`
- [ ] **Client `canWrite`:** replace the same `role === "administrator" || "admin"` bypass with
  `if (user.isSystemAdmin) return true;`
- [ ] Verify: `npm run typecheck` 0 errors; `npm run build` succeeds.
- [ ] Commit: `git commit -m "fix(security): legacy admin-text bypass defers to per-mitra permLevels (JABNET-only)"`

**Out of scope:** the many other page-level `role === "admin"` checks (edit/delete buttons in
LeadPipeline, Contacts, etc.) — user chose chokepoint-only. They are server-enforced already.

## Self-Review (coverage vs spec)
- Mapping + pure helper + tests → Task 1. ✓
- Enforcement at resolution (JABNET-exempt, gate before cache) → Task 2. ✓
- Immediate effect via cache bust on toggle → Task 3. ✓
- Verify → Task 4. ✓
- Manual dev re-test (Diar Suherli loyalty/marketing_ads hidden + 403) is a post-deploy step for the user — not automatable here (no mitra-admin creds).
- `chatwoot` maps to `[]` (no-op) by design.
