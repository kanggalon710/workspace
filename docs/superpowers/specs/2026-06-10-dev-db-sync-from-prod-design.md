# Spec - On-Demand "Tarik Data dari Production" (dev-only)

> Date: 2026-06-10 · Dev/staging-only feature · Build on `dev`. Mobile-first.
> An on-demand button version of the existing `mirror-prod-to-dev.sh` 02:00 cron.

## Goal

A clearly-visible button **in the dev app only** that copies the live production database
(`jabnet_fiber`) into the dev database (`jabnet_fiber_dev`), so after a tester has modified dev data
they can reset dev to match real production immediately - without waiting for the nightly mirror cron.

**Direction is strictly PROD → DEV.** Dev *pulls/overwrites itself* with prod's data. It NEVER writes to
production. Dev is disposable staging, so overwriting it is safe. The reverse (dev→prod) is explicitly
not built.

## Why this is safe

- It only ever **TRUNCATEs + writes the dev database**. Production is read-only in this flow (`SELECT`
  only).
- The dev-only safety flags (`BILLING_SYNC_ENABLED=false`, `MPWA_FORCE_DISABLED=true`,
  `UPLOADS_READ_ONLY=true`) live in the dev **env**, not the DB - so even though prod's billing/MPWA
  tokens get copied into the dev DB, the dev process still won't send real WhatsApp or sync billing.
- Mirrors what the proven `~/scripts/mirror-prod-to-dev.sh` cron already does, just on demand.

## Decisions (confirmed in brainstorming)

1. **Mechanism = Approach A: cross-DB `INSERT … SELECT`** via the existing mysql2 pool. The same MySQL
   user (`jabnet_crm_user`) already has access to both `jabnet_fiber` and `jabnet_fiber_dev` on the same
   host/socket, so no shell, no `mysqldump`, no dump files, and **no extra credentials** are needed - only
   the prod DB name.
2. **Full copy** of every table that exists in both schemas (customers, pipelines, mitra, users, settings,
   integrations, …) - dev becomes a faithful copy of prod.
3. **Button must be prominent/noticeable** (not buried) - a dedicated, visually distinct card with a
   "DEVELOPMENT" warning banner.

## 1. Gating & safety (critical - must be impossible to run on prod)

The same code is promoted to prod, so the feature is gated at **runtime by env**, not just by code:

- New env vars, set **only** in dev's `.env` (`/home/jabnet/private/fiber-jabnet-dev/config/.env`):
  - `DEV_DB_SYNC_ENABLED=true`
  - `PROD_DB_NAME=jabnet_fiber` (source schema to read from)
- A pure guard `devDbSyncAvailable(env)` returns true only when **all** hold:
  1. `DEV_DB_SYNC_ENABLED === "true"`, **and**
  2. `PROD_DB_NAME` is set and **differs** from the current `DB_NAME` (can't copy a DB onto itself), **and**
  3. the current `DB_NAME` looks like a dev DB (ends with `_dev`) - defence in depth so prod (DB_NAME
     `jabnet_fiber`, flag absent) can never enable it.
- On prod these vars are absent → the endpoint returns 404 and the button never renders.
- Endpoint additionally requires an authenticated **admin** (Administrator role / `settings` write).

## 2. Backend

### 2a. Pure module - `server/dev-db-sync.ts` (no I/O, unit-tested)
```ts
export function devDbSyncAvailable(env: NodeJS.ProcessEnv): boolean;
// the 3-part guard above.

export function tablesToMirror(prodTables: string[], devTables: string[]): string[];
// intersection (only tables present in BOTH schemas), stable order.

export function copyColumns(prodCols: string[], devCols: string[]): string[];
// intersection of column names - dev schema is usually NEWER (extra columns), so we copy only the
// shared columns to avoid "column count mismatch". Empty intersection → table skipped (reported).

export function buildCopySql(devDb: string, prodDb: string, table: string, cols: string[]): string[];
// returns the per-table statements: [ TRUNCATE devDb.table, INSERT INTO devDb.table (cols) SELECT cols FROM prodDb.table ]
// (identifiers backtick-quoted; cols come from information_schema, not user input.)
```

### 2b. Sync runner - in `server/storage.ts` (has the pool)
```ts
async runDevDbSyncFromProd(prodDb: string): Promise<{ tables: {table:string; rows:number; ok:boolean; error?:string}[]; totalRows:number; durationMs:number }>
```
- Read table lists from `information_schema.tables` for both schemas; `tablesToMirror`.
- `SET FOREIGN_KEY_CHECKS=0` for the duration; restore to 1 in `finally`.
- For each table: resolve `copyColumns` from `information_schema.columns`, run `buildCopySql` statements,
  capture `affectedRows`. One table failing is caught + reported; the loop continues (partial success).
- Sequential (no parallel) for predictable FK-off behavior. Not wrapped in a transaction (TRUNCATE
  implicitly commits) - acceptable for a dev reset; failures are reported per-table and re-runnable.

### 2c. Endpoint - `POST /api/dev/db-sync`
- Guard: `devDbSyncAvailable(process.env)` → else `sendError(res, "Not found", 404)`.
- Auth: admin (write `settings`).
- Call `storage.runDevDbSyncFromProd(process.env.PROD_DB_NAME!)`.
- After responding, write `tmp/restart.txt` (Passenger reload on next request) to clear in-memory caches
  (route-cache, permission cache, public-config) - same as the cron. Best-effort; ignore fs errors.
- Response: `sendSuccess(res, { tablesCopied, totalRows, durationMs, perTable })`.

### 2d. Expose availability to the client
- Add `devDbSync: devDbSyncAvailable(process.env)` to the existing `GET /api/public-config` payload
  (no auth, already cached) so the button can decide whether to render without a separate call.

## 3. Frontend - prominent button

- Hook `useDevDbSync()` → `POST /api/dev/db-sync`; on success invalidate all queries (`queryClient.clear()`
  / invalidate root) so the UI shows fresh prod data, then toast a summary.
- A dedicated **`DevDbSyncCard`** placed at the **top of the Integrations/Settings page** (above the fold),
  rendered only when `publicConfig.devDbSync === true`:
  - Distinct styling: amber/warning `Card variant`, a `StatusBadge` "LINGKUNGAN: DEVELOPMENT", database
    icon, bold title "Tarik Data dari Production", one-line description of what it does + that it
    **overwrites dev**.
  - Primary action button (size `lg`, warning/gradient, full-width on mobile): "Salin data prod → dev".
  - Confirmation dialog (mobile-first BottomSheet / desktop Dialog): explains dev data will be replaced,
    requires a deliberate confirm (type `SALIN` or a two-step arm) before firing.
  - While running: button `loading`, then a result toast/inline summary ("63 tabel · 41.200 baris · 8.2s"),
    with a per-table list shown if any table failed.
- Because the card only renders on dev (env-gated via public-config), prod users never see it.

## 4. Testing

- `server/dev-db-sync.test.ts`: `devDbSyncAvailable` (flag off; same DB name; non-`_dev` current DB;
  happy path), `tablesToMirror` (intersection), `copyColumns` (intersection + empty → skip),
  `buildCopySql` (correct TRUNCATE+INSERT, backtick quoting).
- Endpoint guard (404 when unavailable, 403 non-admin), runner, UI: typecheck + build + manual on dev.

## 5. Manual acceptance (on dev only)

1. On `workspace-dev.jabnet.id` → Integrations/Settings: the amber "Tarik Data dari Production" card is
   visible at the top with the DEVELOPMENT badge.
2. Modify some dev data (rename a customer, add a pipeline card). Click the button → confirm.
3. After the sync + reload: the dev modifications are gone; dev shows current production data. Toast shows
   the table/row summary.
4. On `workspace.jabnet.id` (prod): the card does **not** render, and `POST /api/dev/db-sync` returns 404.
5. Production data is unchanged throughout (verify a prod row before/after).

## Out of scope

- dev→prod (reverse) - deliberately never built.
- Copying `uploads/` files (cron is DB-only; `UPLOADS_READ_ONLY=true` on dev).
- Scheduling (the 02:00 mirror cron already covers periodic refresh).
- Selective/partial table choice - v1 is full mirror.
