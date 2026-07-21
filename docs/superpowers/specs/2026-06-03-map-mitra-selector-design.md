# Spec - JABNET-only Mitra Selector on /map

> **Date:** 2026-06-03
> **Status:** Approved design, ready for implementation plan.

## Goal

On `/map`, the JABNET owner can view other mitras' map data. JABNET-root
(`isSystemAdmin`) gets a **mitra dropdown** (default = own/JABNET). Selecting another
mitra shows that mitra's infra + customer markers, **read-only**. Non-JABNET users see
no dropdown and only their own data. This feature is **only** for JABNET.

## Decisions (from brainstorming)
- **View-only** when viewing another mitra: add/edit asset, add-customer, and canvassing
  controls are hidden; a "Menampilkan: <Mitra> (read-only)" badge is shown. Returning to
  own mitra restores full functionality.
- **JABNET-only:** the dropdown renders only for `isSystemAdmin`; the server override is
  honored only for JABNET-root. A non-JABNET user passing `?mitra=` gets their own data.
- Scope is the two endpoints the map renders markers from (`/api/map-data/infra` and
  `/api/map-data/customers`). `/api/map-data` is unused by MapPage. Asset-list hooks
  (`usePops`/`useOdcs`/`useOdps`/`useCustomers`) stay own-mitra - irrelevant in read-only.

## Architecture

### Effective-mitra resolution (the security gate)
A pure helper decides which mitra's data to serve:

```
resolveMapMitraId({ isJabnetRoot, queryMitra, activeMitraId }): number
  → if isJabnetRoot && queryMitra is a finite number > 0 → queryMitra
  → else → activeMitraId
```

Lives in a small testable module (`server/map-helpers.ts`). The override is gated here -
non-JABNET callers always get `activeMitraId`.

### Backend (`server/routes.ts`)
- `GET /api/map-data/infra?mitra=<id>`:
  - `const target = resolveMapMitraId({ isJabnetRoot: isJabnetRoot(req), queryMitra: Number(req.query.mitra), activeMitraId: req.authUser!.activeMitraId })`
  - cache key becomes **`map-infra:${target}`** (per-mitra; fixes a latent cross-tenant
    cache leak from the current fixed `"map-infra"` key).
  - resolve data inside `tenantContext.run({ mitraId: target, userId: req.authUser!.id, isSuperAdmin: true }, …)`.
- `GET /api/map-data/customers?bbox=…&mitra=<id>`:
  - same `target` resolution; run `getMapCustomersInBounds` inside `tenantContext.run({ mitraId: target, … })`. (Uncached.)
- Both endpoints require an authenticated user (they already run under `authMiddleware`).

### Cache invalidation (`server/route-cache.ts` + middleware)
- Add `invalidateCachedPrefix(prefix: string)` to `route-cache.ts` (delete every key that
  `startsWith(prefix)`).
- In the asset/customer mutation cache-bust middleware (`routes.ts` ~line 50), replace
  `invalidateCached("map-infra")` with `invalidateCachedPrefix("map-infra")` so all
  `map-infra:*` entries clear on any asset/customer mutation.

### Frontend (`client/hooks/useAssets.ts`, `client/pages/MapPage.tsx`)
- `useMapInfra(mitraId?: number)`: append `?mitra=<id>` when set; include `mitraId` in the
  query key so each mitra caches separately and switching refetches.
- `useMapCustomers(bbox, enabled, mitraId?: number)`: same - add `&mitra=<id>` and include
  `mitraId` in the query key (alongside bbox).
- `MapPage`:
  - `const ownMitraId = user?.activeMitraId ?? 1;` and `const [viewMitraId, setViewMitraId] = useState(ownMitraId);`
  - Mitra list via `GET /api/mitras` (already `isSystemAdmin`-gated), query enabled only
    when `user?.isSystemAdmin`.
  - Render a `<Combobox>` (or simple select) **only when `user?.isSystemAdmin`**, options =
    active mitras (own labeled as default). `onChange → setViewMitraId`.
  - Pass `viewMitraId` to `useMapInfra` / `useMapCustomers`.
  - `const viewingOther = viewMitraId !== ownMitraId;` → when true, force **read-only**:
    hide add/edit asset controls, add-customer-on-ODP, add-asset-on-cable, and canvassing
    entry (combine with existing `isMarketing` gating, e.g. `!viewingOther && …`), and show
    a read-only badge naming the mitra.

## Testing
- Unit (`server/map-helpers.test.ts`): `resolveMapMitraId` - JABNET + valid param → param;
  JABNET + missing/NaN/0/negative → activeMitraId; non-JABNET + param → activeMitraId.
- Manual on dev: as JABNET, switch dropdown → markers change to selected mitra, controls
  hidden + badge shown; switch back → full controls. As a non-JABNET mitra admin → no
  dropdown, own data only; hitting `/api/map-data/infra?mitra=1` returns own data, not
  mitra 1's. Confirm per-mitra cache (selecting A then B shows different data).
- `npm run typecheck` 0 errors; `npm run build` succeeds.

## Out of scope
- Editing other mitras' data (view-only by decision).
- Per-mitra fix for the `dashboard` cache key (same latent pattern, but not part of this
  feature).
- `/api/map-data` (`getMapData`) - unused by MapPage.

## Consistency with memory
- `reference-tenant-isolation-gotchas` - cross-mitra read via `tenantContext.run` with
  `isSuperAdmin:true`, gated to JABNET-root; mirrors `/api/billing/mitras` + `/api/public-config`.
- `isJabnetRoot(req)` (= `req.authUser.isSystemAdmin`) is the JABNET-root gate (already in routes.ts).
