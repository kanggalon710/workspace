# Division Access Restriction — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the backend enforcement leaks so a division-role user (e.g. Marketing) can no longer read another division's data via ungated GET endpoints or two unguarded client routes.

**Architecture:** The single choke point is per-endpoint permission checks. Mutations are already covered by `globalWriteGuard`; **GETs are not**, so each division-specific GET gets an explicit `requirePermission(req, res, "<key>")` early-return. Two client routes get wrapped in `<WithPerm>`. A couple of mutation prefixes are added to `PATH_TO_FEATURE`. System-Admin/Admin already bypass all checks, so admins are unaffected.

**Tech Stack:** Node 20 + Express 5 (`server/routes.ts`), React 18 + Wouter (`client/App.tsx`), TypeScript.

## Global Constraints

- Canonical guard call (copy verbatim): `if (!requirePermission(req, res, "<key>")) return;` — defined at `server/routes.ts:418`. Returns `false` and sends 403 on a missing read.
- **Division-level reads for network assets** (decision 2026-08-08): network-asset GETs are readable by a holder of ANY Teknik/NOC network key, not just the narrow per-asset key — because shared pages (NOC Dashboard, Export/Import, Splitter Chain, Power Budget) read many asset lists at once. Add a helper `requireAnyPermission(req, res, features: string[]): boolean` (mirrors `requirePermission`, passes if `hasPermission(req, f)` is true for ANY `f`) and a constant `NETWORK_READ_KEYS = ["map","pops","odcs","odps","poles","cables","otbs","bestrays","splitters","cable_cores","core_connections","splitter_chain","power_budget","export_import","dashboard"]`. Gate asset GETs with `if (!requireAnyPermission(req, res, NETWORK_READ_KEYS)) return;`. Marketing/CS/Keuangan hold none of these → still 403.
- The guard needs `req`. Handlers written as `async (_req, res)` MUST rename the first param `_req` → `req` when adding a guard.
- **Do NOT gate `GET /api/dashboard`** (`routes.ts:2576`) — it powers Beranda (`/`, all staff) and DivisionHub (`/divisi/:key`). It stays open to any authenticated staff (aggregate KPI counts only). This is the intentional shared allowlist.
- Permission keys are the exact strings in `shared/schema.ts` `ALL_PERMISSIONS` (e.g. `customers`, `pops`, `odcs`, `odps`, `poles`, `cables`, `otbs`, `bestrays`, `splitters`, `cable_cores`, `core_connections`, `map`, `tickets`, `devices`, `monitoring`, `billing_sync`, `hr_sdm`, `marketing_ads`, `export_import`, `dashboard`).
- **No HTTP test harness exists** in this repo (only pure-logic `shared/*.test.ts`). Verification per task = `npm run typecheck` (0 errors) + grep-confirm the guard was added + confirm the endpoint's client consumers require the same-or-higher permission. Final integration verification = `npm run build` + manual curl smoke test.
- Commit only the files each task changed. Do not push (user runs deploy).
- Before gating an endpoint, grep the client for its consumers (`grep -rn "<path>" client/`) and confirm no shared/lower-permission page depends on it. If a shared page (Beranda/DivisionHub) consumes it, add it to the allowlist instead of gating — flag this to the reviewer.

---

### Task 1: Gate CS / customer-data GETs → `customers`

**Files:**
- Modify: `server/routes.ts` — `GET /api/customers` (`:3147`, currently `async (_req, res)`), `GET /api/customers/:id` (`:3412`), `GET /api/customers/:id/profile` (`:3424`), `GET /api/map-data/customers` (`:2635`).

**Interfaces:**
- Consumes: `requirePermission(req, res, feature): boolean` (`routes.ts:418`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm consumers**

Run: `grep -rn "/api/customers\b\|/api/map-data/customers" client/ | grep -v node_modules`
Expected: consuming pages are CustomersPage (already `WithPerm permission="customers"`) and MapPage (`map`). Note MapPage — if it calls `/api/map-data/customers`, that data is customer PII; gating behind `customers` means a map-only user loses customer pins. If MapPage requires only `map`, flag to reviewer whether map pins need `customers` too. Default: gate behind `customers` (customer PII).

- [ ] **Step 2: Add guard to `GET /api/customers` (rename `_req`→`req`)**

At `routes.ts:3147`, change the handler signature and add the guard as the first line:

```ts
router.get("/api/customers", async (req, res) => {
  if (!requirePermission(req, res, "customers")) return;
```

- [ ] **Step 3: Add guard to `GET /api/customers/:id`, `/:id/profile`, `/api/map-data/customers`**

Add `if (!requirePermission(req, res, "customers")) return;` as the first statement inside each handler body (`:3412`, `:3424`, `:2635`). These already use `req`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Grep-confirm**

Run: `grep -n 'requirePermission(req, res, "customers")' server/routes.ts`
Expected: at least 4 new matches near the customer endpoints.

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts
git commit -m "fix(perms): gate customer-data GET endpoints behind customers permission"
```

---

### Task 2: Gate network-asset GETs → per-asset key; `map-data/infra` → `map`

**Files:**
- Modify: `server/routes.ts` — GETs: `/api/pops` (`:2668`), `/api/odcs` (`:2715`), `/api/odps` (`:2762`) + `/api/odps/utilization`, `/api/poles` (`:3641`), `/api/cables` (`:3688`), `/api/otbs` (`:3739`), `/api/bestrays` (`:3793`), `/api/splitters` (`:3847`), `/api/cable-cores` (`:3894`), `/api/core-connections` (`:3945`), each `:id` variant, and `/api/map-data/infra` (`:2611`). Most use `async (_req, res)`.

**Interfaces:**
- Consumes: `requirePermission` (`routes.ts:418`).
- Produces: nothing.

**Division-level guard (revised 2026-08-08):** all asset **collection + `:id` + `/utilization`** GETs use `if (!requireAnyPermission(req, res, NETWORK_READ_KEYS)) return;` (see Global Constraints for the helper + key set). `/api/map-data/infra` uses `if (!requirePermission(req, res, "map")) return;` (its only consumer, MapPage, requires `map`). First add the `requireAnyPermission` helper + `NETWORK_READ_KEYS` constant next to `requirePermission` (`routes.ts:~430`).

- [ ] **Step 1: Confirm consumers**

Run: `grep -rn "/api/map-data/infra\|/api/odps\b\|/api/pops\b" client/ | grep -v node_modules`
Expected: MapPage uses `/api/map-data/infra` (gate behind `map` — MapPage already requires `map`, no regression). Individual asset lists are consumed by their own pages (each already `WithPerm` on the matching key). If any shared page (Beranda/DivisionHub) consumes a raw asset list, allowlist it instead — flag to reviewer.

- [ ] **Step 2: Add guards (rename `_req`→`req` where needed)**

For each endpoint, set the signature to `async (req, res)` (if it was `_req`) and add the first line, e.g.:

```ts
router.get("/api/pops", async (req, res) => {
  if (!requirePermission(req, res, "pops")) return;
```

Repeat with the matching key for odcs/odps/poles/cables/otbs/bestrays/splitters/cable-cores/core-connections, their `:id` variants, `/api/odps/utilization` (`odps`), and `/api/map-data/infra` (`map`).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Grep-confirm**

Run: `grep -nE 'requirePermission\(req, res, "(pops|odcs|odps|poles|cables|otbs|bestrays|splitters|cable_cores|core_connections|map)"\)' server/routes.ts`
Expected: matches for every asset key plus `map`.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "fix(perms): gate network-asset GET endpoints behind their asset permissions"
```

---

### Task 3: Gate export GETs → `export_import`; add import/prospects to write guard

**Files:**
- Modify: `server/routes.ts` — export GETs `/api/export/pops`..`/api/export/full-report` (`:4039`–`:4200`, all `async (_req, res)`); `PATH_TO_FEATURE` array (`:454`).

**Interfaces:**
- Consumes: `requirePermission` (`routes.ts:418`), `PATH_TO_FEATURE` (`routes.ts:454`).
- Produces: nothing.

Rationale: `/api/export/*` and `/api/import/*` back the single Tools page `/export-import` (permission `export_import`). Gating both behind `export_import` matches the existing UI. Import POSTs become auto-guarded once mapped (globalWriteGuard covers mutations). `/api/prospects` (top-level) is added so its writes stop falling through. **Trade-off to flag:** `/api/export/customers` + `/api/export/full-report` contain customer PII but are gated behind `export_import` (the tool), matching current page scoping; tightening those to also require `customers` is a possible follow-up, out of Phase 1 scope.

- [ ] **Step 1: Add guard to each export GET (rename `_req`→`req`)**

For each of the 9 export handlers (`:4039`–`:4200`), set signature `async (req, res)` and add:

```ts
  if (!requirePermission(req, res, "export_import")) return;
```

- [ ] **Step 2: Add `/api/import` and `/api/prospects` to PATH_TO_FEATURE**

In the `PATH_TO_FEATURE` array (`routes.ts:454`), under the `// Tools` section, add:

```ts
  { pattern: /^\/api\/import\b/, feature: "export_import" },
  { pattern: /^\/api\/prospects\b/, feature: "prospects" },
```

(Place `/api/prospects` — note `prospects` is a real key — anywhere in the array; order only matters for overlapping prefixes, and neither overlaps an earlier entry.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Grep-confirm**

Run: `grep -c 'requirePermission(req, res, "export_import")' server/routes.ts && grep -n "api\\\\/import\\\\b\|api\\\\/prospects\\\\b" server/routes.ts`
Expected: ≥9 export guards; both new PATH_TO_FEATURE entries present.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "fix(perms): gate export GETs + guard import/prospects mutations"
```

---

### Task 4: Gate NOC GETs → `monitoring` (MikroTik) / `devices` (GenieACS)

**Files:**
- Modify: `server/routes.ts` — all `GET /api/mikrotik/*` handlers (incl. `/routers/:id/ppp/secret` `:16529`, `/ppp/active` `:16518`, `/ppp/profile`, `/dhcp/leases`, `/arp`, `/sessions/active`, `/log`, `/firewall/*`, `/queue`, and the `/api/mikrotik/routers` list); `GET /api/genieacs/stats` (`:14288`), `/api/genieacs/devices` (`:14375`), `/api/genieacs/devices/:id` (`:14388`).

**Interfaces:**
- Consumes: `requirePermission` (`routes.ts:418`).
- Produces: nothing.

**Decision (division-level, revised 2026-08-08):** MikroTik/GenieACS reads are consumed cross-page by many keys — ActiveSessionsPage (`sessions`), MikrotikRoutersPage (`routers`), PaketInternetPage (`packages`), IntegrationPage (`integrations`), **CustomersPage (`customers`, reads `ppp/secret`)**, GenieAcsDevicesPage (`devices`). A flat single-key gate would break those pages. Add two constants next to `NETWORK_READ_KEYS`:

```ts
const MIKROTIK_READ_KEYS = ["dashboard","sessions","devices","monitoring","routers","packages","customers","integrations"];
const GENIEACS_READ_KEYS = ["dashboard","devices","monitoring","customers","integrations"];
```

Gate every `GET /api/mikrotik/*` with `if (!requireAnyPermission(req, res, MIKROTIK_READ_KEYS)) return;` and every `GET /api/genieacs/*` with `if (!requireAnyPermission(req, res, GENIEACS_READ_KEYS)) return;` (helper from Task 2). Marketing keys (marketing_dashboard/canvassing/leads/contacts/prospects/marketing_ads) are in neither set → Marketing gets 403. Gate GETs only; the write guard already covers mutations. These handlers already use `req` (no rename).

- [ ] **Step 1: Enumerate the MikroTik + GenieACS GET handlers**

Run: `grep -n 'router.get("/api/mikrotik\|router.get("/api/genieacs' server/routes.ts`
Expected: every MikroTik + GenieACS GET route to guard.

- [ ] **Step 2: Add constants + guards**

Add the two constants next to `NETWORK_READ_KEYS`. Then add `if (!requireAnyPermission(req, res, MIKROTIK_READ_KEYS)) return;` as the first statement of each `GET /api/mikrotik/*` handler, and `if (!requireAnyPermission(req, res, GENIEACS_READ_KEYS)) return;` as the first statement of each `GET /api/genieacs/*` handler.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Grep-confirm**

Run: `grep -c 'requireAnyPermission(req, res, MIKROTIK_READ_KEYS)' server/routes.ts && grep -c 'requireAnyPermission(req, res, GENIEACS_READ_KEYS)' server/routes.ts`
Expected: MikroTik count == number of MikroTik GET routes; GenieACS count == number of GenieACS GET routes (≥3).

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "fix(perms): division-level gate for MikroTik + GenieACS GET endpoints"
```

---

### Task 5: Gate ticket GETs → `tickets`

**Files:**
- Modify: `server/routes.ts` — `GET /api/tickets` (`:12717`), `/api/tickets/:id`, ticket sub-resources (evidence, gps, bast, comments, timeline), `/api/tickets/stats|sla-stats|workload-by-technician|csat-by-technician|odp-repeat-issues` (`:12596`–`:12633`), `/api/ticket-categories` (`:12557`).

**Interfaces:**
- Consumes: `requirePermission` (`routes.ts:418`).
- Produces: nothing.

- [ ] **Step 1: Enumerate ticket GET handlers**

Run: `grep -n 'router.get("/api/tickets\|router.get("/api/ticket-categories' server/routes.ts`
Expected: full list of ticket-related GET routes.

- [ ] **Step 2: Add guards**

Add `if (!requirePermission(req, res, "tickets")) return;` as the first statement in each ticket-related GET handler from Step 1. (`/work/:id` page reads these; that page is gated in Task 7.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Grep-confirm**

Run: `grep -c 'requirePermission(req, res, "tickets")' server/routes.ts`
Expected: count == number of ticket GET routes from Step 1.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "fix(perms): gate ticket GET endpoints behind tickets permission"
```

---

### Task 6: Gate billing/HR/marketing-moderate GETs

**Files:**
- Modify: `server/routes.ts` — `GET /api/billing/config` (`:10893`) → `billing_sync`; `GET /api/marketing/ads/stats` (`:12366`) + `GET /api/marketing/audience/geo-targets` (`:12341`) → `marketing_ads`.

**Interfaces:**
- Consumes: `requirePermission` (`routes.ts:418`).
- Produces: nothing.

**Decision (revised 2026-08-08):** **Do NOT gate `/api/hr/clients` or `/api/hr/holidays`** — they are consumed by `EssAbsenPage` (`/hr/absen`), the all-staff self-service attendance page. Gating them behind `hr_sdm` would break attendance for every non-HR staffer. They stay in the shared allowlist (login-only), like `/api/dashboard`. This task gates only `/api/billing/config` and the two marketing-ads GETs.

- [ ] **Step 1: Confirm consumers**

Run: `grep -rn "/api/billing/config\|/api/marketing/ads/stats\|/api/marketing/audience/geo-targets" client/ | grep -v node_modules`
Expected: `/api/billing/config` has no problematic shared consumer (a settings/finance page or none); marketing-ads endpoints only under a `marketing_ads`-gated page (or none). If `/api/billing/config` is read by a page a non-finance user can open, flag to reviewer before gating.

- [ ] **Step 2: Add guards**

- `/api/billing/config` (`:10893`): `if (!requirePermission(req, res, "billing_sync")) return;`
- `/api/marketing/ads/stats` (`:12366`) and `/api/marketing/audience/geo-targets` (`:12341`): `if (!requirePermission(req, res, "marketing_ads")) return;`

Do NOT touch `/api/hr/clients` or `/api/hr/holidays`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Grep-confirm**

Run: `grep -nE 'requirePermission\(req, res, "(billing_sync|marketing_ads)"\)' server/routes.ts`
Expected: one `billing_sync` match at billing/config and two `marketing_ads` matches at the ads endpoints.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "fix(perms): gate billing/HR/marketing-ads GET endpoints"
```

---

### Task 7: Guard the two leaking client routes

**Files:**
- Modify: `client/App.tsx` — `/dashboard-jaringan` (`:239`, currently `component={Dashboard}`) and `/work/:id` (`:289`, currently `component={TechnicianWorkPage}`).

**Interfaces:**
- Consumes: `WithPerm` (`App.tsx:127`), existing render-prop route pattern (`App.tsx:247`).
- Produces: nothing.

- [ ] **Step 1: Convert `/dashboard-jaringan` to WithPerm render-prop**

Replace `<Route path="/dashboard-jaringan" component={Dashboard} />` (`:239`) with:

```tsx
<Route path="/dashboard-jaringan">{() => <WithPerm permission="dashboard"><Dashboard /></WithPerm>}</Route>
```

- [ ] **Step 2: Convert `/work/:id` to WithPerm render-prop**

Replace `<Route path="/work/:id" component={TechnicianWorkPage} />` (`:289`) with:

```tsx
<Route path="/work/:id">{() => <WithPerm permission="tickets"><TechnicianWorkPage /></WithPerm>}</Route>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Grep-confirm**

Run: `grep -n 'permission="dashboard"><Dashboard\|permission="tickets"><TechnicianWorkPage' client/App.tsx`
Expected: both wrapped routes present; no remaining `component={Dashboard}` / `component={TechnicianWorkPage}`.

- [ ] **Step 5: Commit**

```bash
git add client/App.tsx
git commit -m "fix(perms): guard /dashboard-jaringan and /work/:id routes"
```

---

### Task 8: Full verification (build + manual smoke test)

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: success (Vite client + esbuild `dist/index.mjs`).

- [ ] **Step 2: Start dev server**

Run: `npm run dev` (background). Confirm `curl -s http://localhost:5000/api/health` → `{"ok":true}` (adjust port if different).

- [ ] **Step 3: Obtain a Marketing-role token and an Admin token**

Log in via `POST /api/auth/login` for a Marketing-role user and for `admin`. Capture each `token`.

- [ ] **Step 4: Confirm restriction as Marketing (expect 403)**

```bash
for p in /api/customers /api/tickets /api/pops /api/genieacs/devices "/api/mikrotik/routers/1/ppp/secret"; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $MKT_TOKEN" "http://localhost:5000$p"
done
```
Expected: `403` for each.

- [ ] **Step 5: Confirm shared + own-division still work as Marketing (expect 200)**

```bash
for p in /api/dashboard /api/marketing/leads; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $MKT_TOKEN" "http://localhost:5000$p"
done
```
Expected: `200` for each (Beranda + Marketing's own modules unaffected).

- [ ] **Step 6: Confirm Admin bypass (expect 200)**

```bash
for p in /api/customers /api/tickets /api/pops /api/genieacs/devices; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" "http://localhost:5000$p"
done
```
Expected: `200` for each.

- [ ] **Step 7: Import write-guard check (expect 403 as Marketing)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $MKT_TOKEN" -H "Content-Type: application/json" -d '{}' "http://localhost:5000/api/import/pops"
```
Expected: `403` (globalWriteGuard via new PATH_TO_FEATURE entry).

- [ ] **Step 8: Report results to user**

Summarize the pass/fail matrix. Do NOT push — the user runs deploy.

---

## Self-Review notes

- **Spec coverage:** Phase 1 spec items all mapped — customer GETs (T1), network GETs + map-data/infra (T2), export GETs + import/prospects fall-throughs (T3), MikroTik/GenieACS (T4), tickets (T5), billing/HR/marketing-ads (T6), client routes `/dashboard-jaringan` + `/work/:id` (T7), shared `/api/dashboard` allowlist honored (Global Constraints + T8 Step 5), verification (T8). Phase 2/3 intentionally excluded.
- **Placeholder scan:** none — every step has the exact guard line/key.
- **Type/name consistency:** single guard signature `requirePermission(req, res, "<key>")` used throughout; keys match `ALL_PERMISSIONS`. `_req`→`req` rename called out wherever the handler used `_req`.
- **Known trade-offs flagged:** `/api/export/customers` + `/api/export/full-report` gated behind `export_import` (matches UI, contains PII — possible future tightening); all `/api/mikrotik/*` GETs behind `monitoring` (simplest consistent NOC gate).
