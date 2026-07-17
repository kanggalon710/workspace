# Spec — Enforce Per-Mitra Feature Toggles

> **Date:** 2026-06-03
> **Status:** Approved design (root-caused via systematic debugging), ready for plan.

## Bug / root cause

`mitras.features` (JSON `{featureKey: boolean}`) is editable in Kelola Mitra and saved
correctly (confirmed: mitra 7 "Diar Suherli" has `"loyalty":false`), but it is **never
enforced**:

- **Server:** every feature endpoint is gated only by RBAC permission
  (`hasPermission(req, "loyalty_admin")` etc.). `getUserEffectivePermissionsAtMitra`
  does not consult `features`. No `requireFeature` middleware exists.
- **Client:** sidebar items + routes gate only on the **permission**
  (`permission: "loyalty_admin"`). `activeMitra.features` is delivered but read **only**
  by `MitraPage.tsx` (to draw the toggles). Nothing reads it for access control.

Result: a disabled feature does nothing — the mitra's admin role still carries the
permission, so the menu shows, the route renders, and the API serves data. Affects all
12 features in `ALL_FEATURES`, not just loyalty.

## Fix approach (decided)

**Strip feature-disabled permissions at per-mitra permission resolution** — the single
chokepoint. `authMiddleware` re-resolves perms every request via
`getUserEffectivePermissionsAtMitra` (per-mitra, cached). If resolution nulls out the
permissions of disabled features, then **every existing gate** — client sidebar, client
routes, and all server `hasPermission` checks — respects it with zero per-endpoint or
per-route edits.

- **JABNET (mitra 1) is never gated** — it is the owner; all features always on.
  (`computeAuthFlags` already uses the mitra-1 resolution only for `ownerEff`/isSystemAdmin;
  the gate is a no-op when `mitraId === 1`.)
- **Cache:** the gated result is what gets cached. Bust the per-mitra perm cache when a
  mitra's `features` change (`PUT /api/mitras/:id`).
- A feature **absent** from the JSON = enabled (only explicit `false` disables), matching
  the creation default.

## Feature → permission mapping (conservative, confirmed)

```
loyalty          -> ["loyalty_admin"]
collections      -> ["collections"]
public_api       -> ["api_keys"]
marketing_ads    -> ["marketing_ads"]
bug_reports      -> ["bug_reports"]
announcements    -> ["announcements_admin"]
broadcast        -> ["broadcast", "whatsapp", "phonebooks"]
canvassing       -> ["canvassing", "prospects"]
mikrotik         -> ["routers", "monitoring"]
genieacs         -> ["devices"]
customer_portal  -> ["customer_portal_admin"]
chatwoot         -> []   // no staff permission exists; not gatable via perms (no-op)
```

Disabling a feature sets each mapped permission to `"none"` for that mitra's users.

## Components

1. **`shared/schema.ts`** — add `FEATURE_PERMISSIONS: Record<string, string[]>` next to
   `ALL_FEATURES`.
2. **`server/feature-gate.ts`** (new, pure) — `gatePermissionsByFeatures(perms, featuresJson, mitraId)`:
   clone perms; if `mitraId === 1` return unchanged; parse JSON (default `{}` on error);
   for each feature whose value `=== false`, set its mapped permission keys to `"none"`.
3. **`server/feature-gate.test.ts`** — unit tests (mitra-1 bypass, loyalty/broadcast strip,
   absent=enabled, malformed JSON = unchanged, unrelated perms untouched).
4. **`server/storage.ts`** — `getUserEffectivePermissionsAtMitra`: refactor so the resolved
   result is gated (load `mitras.features` for `mitraId`, call `gatePermissionsByFeatures`)
   **before** caching + returning, at the single cache-set point.
5. **`server/routes.ts`** — `PUT /api/mitras/:id`: when `features` are updated, call
   `invalidatePermCacheAtMitra()` so the toggle takes effect immediately.

## Testing

- Unit: `gatePermissionsByFeatures` cases above.
- Manual on dev: mitra "Diar Suherli" (loyalty + marketing_ads = false) admin → `/loyalty`
  and `/marketing/ads` menus hidden + API 403; an enabled feature still works; JABNET admin
  unaffected.
- `npm run typecheck` 0 errors; existing tests pass; `npm run build` succeeds.

## Out of scope
- Gating `chatwoot`/omnichannel (no staff permission to attach to) — left as no-op.
- A defense-in-depth `requireFeature` server middleware (the resolution-time strip is the
  single source of truth; can add later if a feature needs gating without a permission).
- Customer-facing portal auth (separate from staff permissions).

## Consistency with memory
- `reference-per-mitra-roles` / `reference-tenant-isolation-gotchas` — gating happens inside
  the existing per-mitra resolution; JABNET (mitra 1) stays owner-all-on.
