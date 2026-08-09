# Division Access Restriction — Design

**Date:** 2026-08-08
**Status:** Approved (Phase 1 first)
**Author:** JABNET Workspace

## Problem

A user with a division role (e.g. **Marketing**) should only access that division's
modules. Other divisions (Keuangan, Layanan Pelanggan/CS, NOC, Teknik, HRD) must be
inaccessible **unless** the user is granted a special permission in settings.

The permission architecture to express this **already exists** (46 permission keys,
role→permission JSON, `hasPermission`/`canRead` checks). Two real problems remain:

1. **Restriction is not enforced on the backend (leaking).** The frontend hides pages
   via `<WithPerm>`, but dozens of **GET endpoints have no permission check**. Any
   logged-in user can read another division's data by hitting the API directly
   (or via a page that lacks gating). `globalWriteGuard` only covers mutations
   (POST/PUT/PATCH/DELETE); **GETs get zero automatic enforcement**.
2. **Managing 46 granular keys is tedious.** Admins want a coarse per-division toggle,
   with per-key exceptions ("special permission") on top.

## Goals

- **Phase 1 (must-ship, = "restrict access"):** every division-specific GET (and the
  remaining mutation fall-throughs) enforces the correct permission key. Two leaking
  client routes get guarded.
- **Phase 2:** a coarse per-division (per-group) toggle in `/roles` that bulk-sets a
  group's keys. Pure UI convenience; no schema change.
- **Phase 3:** per-user **additive** grants ("Both" model, add-only) folded into the
  permission resolver so all Phase 1 checks honor them for free.

## Non-goals

- No per-user *revocation* (grants are add-only; a user never has *less* than their role).
- No new "division" entity server-side — divisions map to existing `ALL_PERMISSIONS[].group`
  and the per-key checks remain the single choke point.
- Customer portal (`customer-portal-routes.ts`) and public API (`public-api-routes.ts`)
  are separate auth surfaces and out of scope.

## Background — how enforcement works today

- `authMiddleware` (`server/routes.ts:296`) populates `req.authUser` when a token is
  present but does **not** reject anonymous; a `router.use("/api", …)` gate at
  `routes.ts:2562` rejects anonymous for routes registered **after** it.
- `hasPermission(req, key)` / `hasWritePermission(req, key)` (`routes.ts:401/410`) resolve
  the user's per-mitra `permLevels` map via `checkPermLevel` (`shared/schema.ts:1673`).
  System-Admin and legacy `role==="admin"`@mitra1 bypass all checks.
- `globalWriteGuard` (`routes.ts:498`) maps URL→feature via `PATH_TO_FEATURE`
  (`routes.ts:454`) and enforces write perms — **mutations only**.
- Frontend: `<WithPerm permission="key">` (`client/App.tsx:127`), Sidebar filtering by
  `canRead` (`Sidebar.tsx:188`), `permLevels` cached in localStorage `ftth_user`.
- Effective perms resolved per `(user, mitra)` in `_resolvePermsAtMitra`
  (`storage.ts:11402`), 60 s cache (`server/perm-cache.ts`).

## Phase 1 — Close the enforcement leaks

### Approach

Add the missing read checks at the endpoint level (the single choke point). Prefer the
existing guard helper so the change is uniform and low-risk:

```ts
if (!requirePermission(req, res, "customers")) return; // 403 + early-return on miss
```

System-Admin/Admin already bypass, so admins are unaffected. A legitimate cross-division
user simply needs the key (granted via Phase 2/3 or `/roles`).

### Endpoints to gate (from audit)

| Area | Endpoints | Permission key |
|---|---|---|
| CS / customer data | `GET /api/customers`, `/api/customers/:id`, `/api/customers/:id/profile`, `/api/map-data/customers`, `/api/export/*` (4039–4200) | `customers` |
| Teknik / network | `/api/pops`, `/api/odcs`, `/api/odps`(+`/utilization`), `/api/poles`, `/api/cables`, `/api/otbs`, `/api/bestrays`, `/api/splitters`, `/api/cable-cores`, `/api/core-connections` (+`:id`), `/api/map-data/infra` | matching key (`pops`, `odcs`, …) |
| NOC / devices | `/api/mikrotik/*` (esp. `/ppp/secret`, `/ppp/active`, `/ppp/profile`, `/dhcp/leases`, `/arp`, `/sessions/active`, `/log`, `/firewall/*`), `/api/genieacs/*` (`devices`, `:id`, `/stats`) | `sessions` / `routers` / `devices` (per module) |
| Tickets | `/api/tickets`, `/api/tickets/:id` + sub-resources (evidence, gps, bast, comments, timeline, stats) | `tickets` |
| Billing / HR | `/api/billing/config`, `/api/hr/clients`, `/api/hr/holidays` | `billing_sync` / `hr_sdm` |
| Marketing (moderate) | `/api/marketing/ads/stats`, `/api/marketing/audience/geo-targets` | `marketing_ads` / `marketing_dashboard` |

### Shared allowlist (intentionally NOT gated)

These power the shared home pages every staffer sees; gating them would break a
non-admin's own home:

- **`GET /api/dashboard`** — used by Beranda (`/`, all staff) and DivisionHub
  (`/divisi/:key`). Returns aggregate KPI counts (not row-level PII). Stays open to any
  authenticated staff. *Conscious decision; revisit if aggregate counts must also be
  division-scoped (would need a trimmed endpoint).*
- Public/no-auth endpoints (`/api/health`, `/api/public-config`, `/api/auth/*`) — unchanged.

DivisionHub's other queries (`/api/marketing/dashboard`, `/api/collections/stats`,
`/api/hr/dashboard`, `/api/teamspace/performance`) already self-guard and the page hides
those sections via `canRead`, so no change needed.

### Client routes to guard

- `client/App.tsx` `/dashboard-jaringan` → wrap in `<WithPerm permission="dashboard">`.
- `client/App.tsx` `/work/:id` (TechnicianWorkPage) → wrap in `<WithPerm permission="tickets">`.

### Mutation fall-throughs to close

- `/api/import/*` (bulk create, `routes.ts:4234+`) — add `requireWritePermission` per
  resource, or add a `/api/import` → feature entry to `PATH_TO_FEATURE`.
- Add `/api/prospects` and `/api/export` prefixes to `PATH_TO_FEATURE`
  (`routes.ts:454`) so they don't fall through the write guard.

### Phase 1 verification

- `npm run typecheck` → 0 errors; `npm run build` → success.
- Manual: log in as a **Marketing** role user and confirm direct GETs to
  `/api/customers`, `/api/tickets`, `/api/pops`, `/api/mikrotik/.../ppp/secret` return
  **403**; `/api/dashboard` still returns 200 (Beranda works).
- Log in as **Admin/System-Admin** and confirm all endpoints still return 200 (bypass intact).
- Regression: Marketing user's own modules (`/api/marketing/*`, `/api/leads`) still 200.

## Phase 2 — Coarse per-division toggle in `/roles`

- `ALL_PERMISSIONS[].group` (`shared/schema.ts:1683`) already groups keys by division
  (NOC, Teknik, Marketing, Layanan Pelanggan, Keuangan, HRD, …). RolesPage already renders
  a per-group matrix.
- Add a per-group control: **None / Read / Write (whole division)** that bulk-sets every
  key in that group in the role's permission matrix. Individual keys remain editable
  afterward ("special permission" exception).
- No schema change, no resolver change. Writes the existing `roles.permissions` JSON.
- Verify: toggling "Keuangan → Write" sets `packages`/`collections`/`billing_sync` to
  write; flipping one key back to none persists.

## Phase 3 — Per-user additive grants ("Both", add-only)

- **Storage:** repurpose the existing `users.permissions` JSON field (`schema.ts:1588`,
  currently deprecated) as an **additive grant map** `{ key: "read"|"write" }`. Only
  raises levels.
- **Resolver:** in `_resolvePermsAtMitra` (`storage.ts:11402`), after building the role
  `perms` map, merge per-user grants with `max(roleLevel, grantLevel)` per key. Because
  `permLevels` then already reflects grants, **every Phase 1 check honors them with no
  per-endpoint change.**
- **Cache:** invalidate `perm-cache` on grant change (reuse existing invalidation hooks,
  e.g. `invalidatePermCacheAtMitra`).
- **API:** endpoint to set a user's grants (e.g. `PUT /api/users/:id/permission-grants`,
  admin-only), validating keys against `ALL_PERMISSION_KEYS` and levels against add-only.
- **UI:** "Akses Khusus" section in the UserDetailDrawer (UsersPage) to grant extra
  divisions/keys on top of the role.
- Verify: a Marketing user granted `collections` can read `/api/collections` and sees the
  Keuangan collections module; removing the grant restores restriction after cache TTL /
  invalidation.

## Risks & mitigations

- **Breaking a legitimately-shared endpoint** → the shared allowlist (`/api/dashboard`)
  is explicit; audit each endpoint's consumers before gating. Manual smoke test of Beranda
  + each division hub as a non-admin.
- **Missing a leaky endpoint** → Phase 1 endpoint list comes from a full audit; the
  `router.use("/api")` anonymous gate + per-endpoint checks are the two layers. A future
  hardening could add a GET-side default-deny, but that's out of scope here.
- **Phase 3 two-sources-of-truth confusion** → mitigated by add-only semantics and
  surfacing grants clearly in the user drawer.

## Rollout

Phase 1 → user tests → push. Phase 2 and Phase 3 follow as separate increments.
