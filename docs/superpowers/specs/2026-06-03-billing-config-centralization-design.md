# Spec - Billing Config Centralization + Per-Mitra Sync + Maps Key Fallback

> **Date:** 2026-06-03
> **Status:** Approved design, ready for implementation plan.
> **Supersedes nothing.** The deferred auto-cron billing sync
> (`2026-06-03-scheduled-billing-sync-design.md`) remains on hold and separate.

Three related changes to the multi-tenant `/integrations` + `/customers` flow:

- **A. Centralize billing config under JABNET** - mitras no longer self-configure
  billing; only JABNET-root sets each mitra's billing_id from one panel.
- **B. Per-mitra manual sync button on `/customers`** - each mitra triggers a sync
  of its own customers, rate-limited to 1×/10 min per mitra.
- **C. Google Maps key per-mitra with JABNET fallback** - default rides JABNET's
  shared key; a mitra's own key overrides; clearing reverts to JABNET. Add text.

---

## A. Centralized Billing Config under JABNET

### Current state
- Non-JABNET mitras self-configure billing in `/integrations` via a "Profil Reseller"
  section: 6 fields (billing_id, nama, alamat, phone, email, password), Save → Verify
  (`POST /api/billing/verify-reseller`, strict 5-field identity match) → Tarik Pelanggan.
- Settings stored per-mitra in `mitra_integrations` via `GET/PUT /api/mitras/:id/integrations`.
- **Security hole:** those endpoints are gated only by `isMitraAdmin(req)` - they do
  **not** check `:id` is the caller's own mitra. Any mitra-admin could read/write another
  mitra's integrations by changing the URL id (the UI just never does).
- JABNET (mitra 1) = billing root, fixed `reseller_id = 12` via server `.env`.
- `isSystemAdmin` = `true` only for the System-Admin role at mitra 1 → the "JABNET-root" flag.

### Target behavior
- **Non-JABNET mitras:** the entire Billing Sync area in `/integrations` is **hidden**
  (gated on `isSystemAdmin`). Their other integrations (Maps, MPWA, etc.) stay editable.
- **JABNET-root:** a **"Billing Sync - Kelola per Mitra"** panel:
  - A `<Combobox>` of all mitras, each row showing current billing_id + last-sync status.
  - Select a **non-JABNET** mitra → reveals **one input (Billing ID)** + three buttons:
    **Konfirmasi** (save), **Test** (does this reseller_id pull customers), **Tarik
    Pelanggan** (sync that mitra now) + a result panel (totalFound + sample).
  - Select **JABNET** → read-only root card (reseller_id = 12 via server `.env`), no input.
  - The existing global sync-interval card (peak/off-peak, reconcile) stays, JABNET-only.
- Verification is **simplified**: with only billing_id as input, Test just checks the
  reseller_id returns customers from billing (`totalFound`, sample). The old 5-field
  identity match is dropped - JABNET is the trusted party assigning IDs.

### Backend (`server/routes.ts`, `billing-sync-worker.ts`)
- New guard `isJabnetRoot(req)` = `!!req.authUser?.isSystemAdmin`.
- Four new **JABNET-root-only** endpoints (403 otherwise):
  - `GET  /api/billing/mitras`
    → `[{ mitraId, name, slug, billingId, lastSyncAt, lastStatus, customerCount }]`.
  - `PUT  /api/billing/mitras/:id`  body `{ billingId }`
    → saves `billing_reseller_id` for that mitra (`withMitra` context). Validates numeric.
  - `POST /api/billing/mitras/:id/test`  body `{ billingId? }` (falls back to saved)
    → `{ ok, totalFound, sample }` via simplified data-pull.
  - `POST /api/billing/mitras/:id/sync`
    → full sync of that mitra (`withMitra` → existing `triggerManual`); returns stats.
    **Exempt** from the part-B cooldown (admin oversight must not get locked out).
- Worker refactor:
  - `fetchAllFromBilling(resellerIdOverride?: number)` - accept an explicit reseller_id,
    defaulting to the current `getMitraSetting("billing_reseller_id")` lookup.
  - `testResellerData(resellerId: number): Promise<{ totalFound: number; sample: any[] }>`
    - one list fetch (rumahan+bisnis+vip, aktif), dedupe, return count + first 10.
- **Security hardening** of `PUT /api/mitras/:id/integrations`:
  1. Editing a mitra `:id !== activeMitraId` requires `isJabnetRoot`.
  2. Any `billing_reseller_*` key is rejected (skipped) unless `isJabnetRoot`.
  Also apply guard (1) to `GET /api/mitras/:id/integrations`.
- The old `POST /api/billing/verify-reseller` is retired from the UI. Leave the route in
  place (harmless) but it is no longer called; do not extend it.

### Client (`IntegrationPage.tsx`)
- Remove the non-JABNET "Profil Reseller / Verifikasi Akses Data Pelanggan" section.
- Gate the whole Billing area on `isSystemAdmin`; non-JABNET sees nothing billing.
- Build the JABNET panel (Combobox + billing_id input + 3 buttons + result panel),
  calling the new `/api/billing/mitras*` endpoints.
- Keep the read-only JABNET-root info card for the JABNET row.

---

## B. Per-Mitra "Sinkron dengan Billing" button on `/customers`

### Target behavior
- New header button **"Sinkron dengan Billing"** in `CustomersPage` (next to Export CSV),
  shown only to users with `billing_sync` write permission.
- Click → `POST /api/billing/sync` (syncs the **caller's active mitra** via existing
  `triggerManual`) → toast with stats (`X dibuat, Y diperbarui`).
- Rate-limited to **1×/10 min per mitra**. While on cooldown the button is disabled with
  a live countdown ("Tersedia lagi 8:24"); on mount it reads the cooldown so the state is
  correct across reloads and across different users in the same mitra.

### Backend (`server/routes.ts`)
- **Persisted per-mitra cooldown** via mitra setting `billing_manual_sync_last_at`
  (ISO timestamp). Shared across all users in the mitra and survives restarts - unlike the
  in-memory per-user rate limiter. Window = `MANUAL_SYNC_COOLDOWN_MS = 10 * 60_000`.
- `GET /api/billing/sync/cooldown`
  → `{ canSync, remainingSec, nextAvailableAt }` for the active mitra.
- `POST /api/billing/sync` (reused): before running, read `billing_manual_sync_last_at`;
  if `now - last < cooldown` → **429** `{ error, remainingSec }`. On success, write the
  timestamp. Still requires `billing_sync` write. (The existing in-memory `billingSyncLimiter`
  stays as a coarse abuse guard.)

### Client (`CustomersPage.tsx`)
- Add the button + a `useQuery` on `/api/billing/sync/cooldown` (and a local 1s ticker to
  render the countdown). On 429, surface `remainingSec` and refresh the cooldown query.

---

## C. Google Maps Key - Per-Mitra with JABNET Fallback

### Current state (already works at the resolution layer)
- `/api/public-config` resolves the maps key inside the target mitra's context via
  `getMitraSetting("google_maps_api_key")`, which **falls back to global app_settings**
  when the mitra has no override.
- `PUT /api/mitras/:id/integrations` **deletes** the override when the value is empty
  (`value === ""` → `deleteMitraSetting`), so clearing reverts to the global key.
- JABNET's shared key lives in **global app_settings** `google_maps_api_key`.

So "isi kolom = pakai API sendiri; kosongkan = numpang JABNET" already holds. The only gap
is **UI clarity**.

### Target behavior (client only - `IntegrationPage.tsx`)
- In the Google Maps Platform section, add helper text, e.g.:
  > "Default memakai API Google Maps milik **JABNET** (sudah disediakan). Isi kolom ini
  >  dengan API key milik Anda sendiri untuk memakai kuota Anda. **Kosongkan** kolom lalu
  >  Simpan untuk kembali memakai API JABNET."
- Add a small status indicator reflecting the effective source: when the field is empty,
  show a badge **"Sedang memakai: API JABNET (default)"**; when filled, **"Memakai API key
  Anda sendiri"**.
- No backend change. (Confirm in implementation that the empty-value → delete path runs and
  `publicConfigCache` is cleared, which it already is.)

---

## Testing

- **A.** Guards: non-JABNET → 403 on all four `/api/billing/mitras*` endpoints, on
  cross-mitra `GET/PUT /api/mitras/:id/integrations`, and on `billing_reseller_*` writes via
  the generic integrations PUT. `testResellerData` / `fetchAllFromBilling(resellerIdOverride)`
  plumbing verified with a mocked `fetch`.
- **B.** Cooldown: first `POST /api/billing/sync` → 200 + timestamp written; immediate second
  → 429 with `remainingSec > 0`; `GET /api/billing/sync/cooldown` reflects state; mitra A's
  cooldown does not block mitra B.
- **C.** Resolution: mitra with own key → that key; mitra cleared → global (JABNET) key;
  empty PUT deletes the override and busts `publicConfigCache`.
- `npm run typecheck` → 0 errors. `npm run build` → success.

## Out of scope
- The deferred auto-cron billing sync (separate spec).
- Permission model of non-billing integrations (unchanged).
- Migrating/cleaning now-unused `billing_reseller_nama/phone/email/password` rows - left in
  DB, no longer read/written.
- Making the cooldown window or Maps default-key configurable via UI (constants/global
  settings are enough).

## Consistency with memory
- `reference-tenant-isolation-gotchas` - all per-mitra work wrapped in `withMitra`;
  `getMitraSetting` fallback-to-global is the mechanism behind the Maps default.
- `reference-prod-billing-sync-manual` - sync stays manual/operator-driven; this adds a
  per-mitra manual button, does not enable autonomous workers.
- `feedback-credentials-in-db` - billing_id and keys stored plain-text in DB is acceptable.
- `reference-per-mitra-roles` / multi-tenant - `isSystemAdmin` (System-Admin @ mitra 1) is
  the JABNET-root gate.
