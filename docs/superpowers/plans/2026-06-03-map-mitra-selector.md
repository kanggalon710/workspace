# JABNET Mitra Selector on /map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the JABNET owner view other mitras' map data on `/map` via a JABNET-only dropdown (default = own), read-only for other mitras.

**Architecture:** A pure `resolveMapMitraId()` gate decides the effective mitra (`?mitra` honored only for JABNET-root). The two map-data GET endpoints resolve that mitra and run the storage call inside `tenantContext.run`. `map-infra` cache becomes per-mitra with prefix invalidation. Client hooks thread an optional `mitraId`; MapPage shows a JABNET-only selector and switches to read-only when viewing another mitra.

**Tech Stack:** Express/Drizzle + AsyncLocalStorage tenant context (server); React + TanStack Query + shadcn `Combobox` (client). Tests via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-06-03-map-mitra-selector-design.md`

---

## Task 1: Pure `resolveMapMitraId` helper + tests

**Files:**
- Create: `server/map-helpers.ts`
- Test: `server/map-helpers.test.ts`

- [ ] **Step 1: Write failing test `server/map-helpers.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMapMitraId } from "./map-helpers.js";

test("JABNET root + valid mitra param -> that mitra", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: 7, activeMitraId: 1 }), 7);
});
test("JABNET root + NaN param -> activeMitraId", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: NaN, activeMitraId: 1 }), 1);
});
test("JABNET root + 0 or negative -> activeMitraId", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: 0, activeMitraId: 1 }), 1);
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: -3, activeMitraId: 1 }), 1);
});
test("non-JABNET + valid param -> activeMitraId (override ignored)", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: false, queryMitra: 7, activeMitraId: 3 }), 3);
});
test("non-JABNET + no param -> activeMitraId", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: false, queryMitra: NaN, activeMitraId: 3 }), 3);
});
test("JABNET root selecting own mitra -> own", () => {
  assert.equal(resolveMapMitraId({ isJabnetRoot: true, queryMitra: 1, activeMitraId: 1 }), 1);
});
```

Run: `npx tsx --test server/map-helpers.test.ts` → expect FAIL (module not found).

- [ ] **Step 2: Run test to confirm failure** — `npx tsx --test server/map-helpers.test.ts`.

- [ ] **Step 3: Implement `server/map-helpers.ts`**

```ts
/**
 * Decide which mitra's map data to serve. The cross-tenant override (?mitra) is
 * honored ONLY for JABNET-root; everyone else always gets their own active mitra.
 * Pure — unit-tested in map-helpers.test.ts.
 */
export function resolveMapMitraId(args: {
  isJabnetRoot: boolean;
  queryMitra: number;
  activeMitraId: number;
}): number {
  const { isJabnetRoot, queryMitra, activeMitraId } = args;
  if (isJabnetRoot && Number.isFinite(queryMitra) && queryMitra > 0) return queryMitra;
  return activeMitraId;
}
```

Run: `npx tsx --test server/map-helpers.test.ts` → expect ALL PASS. Then `npm run typecheck` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/map-helpers.ts server/map-helpers.test.ts
git commit -m "feat(map): pure resolveMapMitraId gate for JABNET cross-mitra view"
```

---

## Task 2: Backend — per-mitra map endpoints + cache fix

**Files:**
- Modify: `server/route-cache.ts` (add prefix invalidation)
- Modify: `server/routes.ts` (import, cache-bust middleware ~line 50, the two map-data endpoints ~2188–2223)

- [ ] **Step 1: Add `invalidateCachedPrefix` to `server/route-cache.ts`**

After the existing `export function invalidateCached(key: string)` (and before/after `invalidateAllCached`), add:

```ts
export function invalidateCachedPrefix(prefix: string): void {
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
```
(`cache` is the module-level Map already used by the other functions.)

- [ ] **Step 2: Import it + use prefix invalidation in the mutation middleware**

In `server/routes.ts`, update the route-cache import (line ~7) to include the new function:
```ts
import { getCached, setCached, invalidateCached, invalidateCachedPrefix } from "./route-cache.js";
```
Then in the mutation cache-bust middleware (~line 50), replace `invalidateCached("map-infra");` with:
```ts
      invalidateCachedPrefix("map-infra");
```
(Leave the `invalidateCached("dashboard");` lines unchanged.)

- [ ] **Step 3: Add import for the helper**

Near the top imports of `server/routes.ts`, add:
```ts
import { resolveMapMitraId } from "./map-helpers.js";
```

- [ ] **Step 4: Rewrite `GET /api/map-data/infra` (currently ~2188–2199)**

Replace the whole handler with:
```ts
router.get("/api/map-data/infra", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const target = resolveMapMitraId({
      isJabnetRoot: isJabnetRoot(req),
      queryMitra: Number(req.query.mitra),
      activeMitraId: req.authUser.activeMitraId,
    });
    const cacheKey = `map-infra:${target}`;
    const cached = getCached<any>(cacheKey);
    if (cached) return sendSuccess(res, cached);
    const data = await new Promise<any>((resolve, reject) => {
      tenantContext.run({ mitraId: target, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try { resolve(await storage.getMapInfra()); } catch (e) { reject(e); }
      });
    });
    setCached(cacheKey, data, 60_000);
    sendSuccess(res, data);
  } catch (err: any) {
    console.error("[map-infra]", err);
    sendError(res, err.message, 500);
  }
});
```

- [ ] **Step 5: Rewrite `GET /api/map-data/customers` (currently ~2201–2223)**

Replace the whole handler with:
```ts
router.get("/api/map-data/customers", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const bboxStr = String(req.query.bbox || "");
    if (!bboxStr) {
      return sendError(res, "Missing bbox query param (format: swLat,swLng,neLat,neLng)", 400);
    }
    const parts = bboxStr.split(",").map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN)) {
      return sendError(res, "Invalid bbox format", 400);
    }
    const [swLat, swLng, neLat, neLng] = parts;
    const limit = Math.min(Number(req.query.limit) || 500, 1000);
    const target = resolveMapMitraId({
      isJabnetRoot: isJabnetRoot(req),
      queryMitra: Number(req.query.mitra),
      activeMitraId: req.authUser.activeMitraId,
    });
    const customers = await new Promise<any[]>((resolve, reject) => {
      tenantContext.run({ mitraId: target, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try { resolve(await storage.getMapCustomersInBounds({ swLat, swLng, neLat, neLng }, limit)); }
        catch (e) { reject(e); }
      });
    });
    sendSuccess(res, { customers, count: customers.length, bbox: { swLat, swLng, neLat, neLng } });
  } catch (err: any) {
    console.error("[map-customers]", err);
    sendError(res, err.message, 500);
  }
});
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck` → 0 errors. Confirm `isJabnetRoot` and `tenantContext` are already in scope in routes.ts: `grep -n "function isJabnetRoot\|tenantContext" server/routes.ts | head` (both exist from prior work).

- [ ] **Step 7: Commit**

```bash
git add server/route-cache.ts server/routes.ts
git commit -m "feat(map): per-mitra map-data endpoints (JABNET ?mitra override) + per-mitra infra cache"
```

---

## Task 3: Frontend hooks — thread optional mitraId

**Files:**
- Modify: `client/hooks/useAssets.ts` (`useMapInfra` ~41–50, `useMapCustomers` ~51–66)

- [ ] **Step 1: Replace `useMapInfra`**

```ts
export function useMapInfra(mitraId?: number) {
  return useQuery({
    queryKey: [...queryKeys.mapInfra, mitraId ?? "self"] as const,
    queryFn: () => api.get<{
      pops: any[]; odcs: any[]; odps: any[]; poles: any[]; cables: any[];
    }>(mitraId != null ? `/map-data/infra?mitra=${mitraId}` : "/map-data/infra"),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Replace `useMapCustomers`**

```ts
export function useMapCustomers(bbox: Bbox | null, enabled = true, mitraId?: number) {
  return useQuery({
    queryKey: [...queryKeys.mapCustomers, mitraId ?? "self", bbox] as const,
    queryFn: () => {
      if (!bbox) throw new Error("bbox required");
      const q = `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}`;
      const suffix = mitraId != null ? `&mitra=${mitraId}` : "";
      return api.get<{ customers: any[]; count: number; bbox: Bbox }>(
        `/map-data/customers?bbox=${q}${suffix}`
      );
    },
    enabled: !!bbox && enabled,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` → 0 errors (existing callers pass no `mitraId`, still valid).
```bash
git add client/hooks/useAssets.ts
git commit -m "feat(map): map hooks accept optional mitraId (query param + cache key)"
```

---

## Task 4: MapPage — JABNET selector + read-only mode

**Files:**
- Modify: `client/pages/MapPage.tsx`

- [ ] **Step 1: Add imports**

Ensure these are imported at the top of `MapPage.tsx` (add any missing):
```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Combobox } from "@/components/ui/combobox";
```

- [ ] **Step 2: Add state + read-only flag, and pass mitraId to the hooks**

Replace lines 470–475 (from `const { user } = useAuth();` through the `useMapCustomers` call) with:
```ts
  const { user } = useAuth();
  const isMarketing = user?.role === "marketing";
  const isJabnetRoot = !!user?.isSystemAdmin;
  const ownMitraId = user?.activeMitraId ?? 1;
  const [viewMitraId, setViewMitraId] = useState<number>(ownMitraId);
  const viewingOther = viewMitraId !== ownMitraId;
  const readOnly = isMarketing || viewingOther;

  const { data: mitraListResp } = useQuery<any>({
    queryKey: ["/api/mitras", "map-selector"],
    queryFn: () => api.get<any>("/mitras"),
    enabled: isJabnetRoot,
    staleTime: 60_000,
  });
  const mitraOptions: Array<{ id: number; name: string }> = (mitraListResp ?? [])
    .map((m: any) => ({ id: m.id, name: m.displayName ?? m.name }));

  const mitraParam = viewingOther ? viewMitraId : undefined;
  const { data: infra, isLoading: infraLoading } = useMapInfra(mitraParam);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const { data: viewportCustomers, isLoading: customersLoading } = useMapCustomers(bbox, true, mitraParam);
```
> NOTE: `GET /api/mitras` returns the array directly (its handler does `sendSuccess(res, list)` and `api.get` unwraps `.data`), so `mitraListResp` is the array. Verify with `grep -n 'router.get("/api/mitras"' server/routes.ts` and the `sendSuccess` shape; if it returns `{ mitras: [...] }`, map over `mitraListResp.mitras` instead.

- [ ] **Step 3: Hard read-only guards (safety net — prevents wrong-tenant writes)**

In `handleMapClick` (~line 648), change:
```ts
    if (isMarketing) return; // marketing: view-only, no drawing
```
to:
```ts
    if (readOnly) return; // marketing OR viewing another mitra: view-only, no drawing
```
(`handleMapClick` is a `useCallback`; add `readOnly` to its dependency array — find the `], [` deps line at the end of that callback and include `readOnly`.)

In `handleAssetSubmit` (~line 688), add as the FIRST line inside the function body:
```ts
    if (readOnly) return; // safety: no asset writes while viewing another mitra
```

- [ ] **Step 4: Gate the editing toolbars/controls on `readOnly`**

Change the desktop toolbar guard (~line 1124) from `{!isMarketing && (` to `{!readOnly && (`.
Change the mobile FAB guard (~line 1175) from `{!isMarketing && (` to `{!readOnly && (`.
In the InfoPanel props (~lines 1078, 1086, 1093) change each `!isMarketing &&` to `!readOnly &&`.
For the second InfoPanel render (~lines 1275, 1284) which currently has NO marketing guard, prefix each handler with the read-only check, e.g. change `onAddCustomerDrop={selectedInfo.type === "odp" ? () => {` to `onAddCustomerDrop={!readOnly && selectedInfo.type === "odp" ? () => {` and the same for `onAddAssetAtCable={!readOnly && selectedInfo.type === "cable" ? (t) => {`.
(Use grep to confirm you caught all edit entry points: `grep -nE "onAddCustomerDrop|onAddAssetAtCable|onEdit=" client/pages/MapPage.tsx` — every one that creates/edits must be behind `!readOnly`.)

- [ ] **Step 5: Render the JABNET-only selector + read-only badge**

Immediately after the loading indicator block (right after the `{customersLoading && bbox && (...)}` block that ends ~line 1121), insert:
```tsx
        {/* ════════════════ JABNET MITRA SELECTOR (owner only) ════════════════ */}
        {isJabnetRoot && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 bg-card/95 backdrop-blur rounded-lg shadow-elev-md px-2 py-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground pl-1">Data mitra:</span>
            <div className="w-44">
              <Combobox
                options={mitraOptions.map((m) => ({
                  value: String(m.id),
                  label: m.id === ownMitraId ? `${m.name} (saya)` : m.name,
                }))}
                value={String(viewMitraId)}
                onChange={(v) => { if (v) setViewMitraId(Number(v)); }}
                searchPlaceholder="Cari mitra..."
              />
            </div>
            {viewingOther && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 whitespace-nowrap">
                Read-only
              </span>
            )}
          </div>
        )}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck` → 0 errors. `npm run build` → succeeds. Visually confirm (mentally) the selector overlay doesn't sit under another absolute control; if it collides with the search bar in practice, that's a position tweak only.

- [ ] **Step 7: Commit**

```bash
git add client/pages/MapPage.tsx
git commit -m "feat(map): JABNET-only mitra selector + read-only mode when viewing another mitra"
```

---

## Task 5: Full verification

- [ ] **Step 1: Tests** — `npx tsx --test server/map-helpers.test.ts server/feature-gate.test.ts server/billing-admin-helpers.test.ts server/reporting-helpers.test.ts` → all pass.
- [ ] **Step 2: Typecheck** — `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** — `npm run build` → success.
- [ ] **Step 4: Commit remainder** — `git add -A && git commit -m "chore(map): finalize mitra selector" || echo "nothing to commit"`.

---

## Self-Review (coverage vs spec)
- `resolveMapMitraId` gate (JABNET-only override) → Task 1. ✓
- `?mitra` on infra + customers via `tenantContext.run`; per-mitra `map-infra:<id>` cache + prefix invalidation → Task 2. ✓
- Hooks thread `mitraId` (param + cache key) → Task 3. ✓
- JABNET-only `<Combobox>` from `/api/mitras`, default own, read-only mode (controls hidden + hard write guard + badge) → Task 4. ✓
- Verify → Task 5. ✓
- Manual dev re-test (JABNET switches mitra; non-JABNET no dropdown + own data; per-mitra cache) is a post-deploy step.
- Out of scope per spec: editing other mitras, `dashboard` cache key, `/api/map-data`.
