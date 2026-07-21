# Design - /loyalty Edit & Delete

> **Status**: Spec - pending implementation plan
> **Owner**: hidayatulloh710@gmail.com
> **Created**: 2026-05-25
> **Scope**: `LoyaltyAdminPage` (referrals, discounts, sahabat profile, point redemptions)

## Context

Halaman `/loyalty` (LoyaltyAdminPage.tsx, 3015 baris) saat ini punya sebagian besar action lifecycle (apply/cancel discount, verify/reject/cancel redemption, upgrade tier sahabat, edit campaign/budget/expiry config) - tapi beberapa surface masih **read-only** atau action-nya tidak lengkap untuk koreksi/cleanup data:

- **Referrals (manual entry)** - bisa create + link, tidak ada edit (typo nama/HP) atau delete (duplicate/salah).
- **Discount rows** - bisa apply/cancel (lifecycle), tidak bisa edit nominal/source/reason atau hapus row permanen.
- **Sahabat profile** - view-only di drawer, tidak bisa adjust `pointsBalance`, override `sahabatLevel`, rename `sahabatCode`, atau freeze akun.
- **Redemption records** - bisa verify/reject/cancel/force-expire, tidak bisa edit (sebelum verify) atau hapus row salah input.

Outcome: Admin yang punya permission `loyalty_admin` write bisa edit + soft-delete row di 4 surface ini, dengan state guard untuk mencegah hapus data finansial yang sudah jadi (applied discount, active redemption). Semua action tercatat di `audit_logs`.

## Konsistensi dengan Memory

- [[feedback-credentials-in-db]] - tidak terdampak, ini bukan credential.
- [[project-multitenant-mitra]] - semua tabel sudah punya `mitra_id`; tenant isolation existing tetap berlaku.
- Pattern konsisten dengan endpoint existing di `routes.ts:3787-4602`: read pakai `hasPermission`, write pakai `hasWritePermission`, semua write panggil `logAudit()`.

## Approach

**Approach A (Recommended)**: Per-tabel `deleted_at TIMESTAMP NULL` + `is_frozen` flag di `customer_loyalty`. Semua list endpoint filter `WHERE deleted_at IS NULL`. Restore via SQL admin. Minimal churn.

**Approach B (rejected)**: Generic `loyalty_deletions` audit table - restore lebih ribet, query lebih banyak.

**Approach C (rejected)**: Pakai `status='deleted'` - tidak konsisten karena `customer_loyalty` tidak punya status, dan beberapa tabel status field-nya sudah dipakai untuk lifecycle.

Implementasi dengan Approach A.

## Schema Changes

`server/storage.ts` startup ALTER block (idempotent - cek `information_schema.columns` sebelum ALTER):

```sql
ALTER TABLE customer_referrals    ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE customer_discounts    ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE point_redemptions     ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE customer_loyalty      ADD COLUMN is_frozen TINYINT NOT NULL DEFAULT 0;
ALTER TABLE customer_loyalty      ADD COLUMN frozen_reason VARCHAR(255) NULL;
ALTER TABLE customer_loyalty      ADD COLUMN frozen_at TIMESTAMP NULL;
ALTER TABLE customer_loyalty      ADD COLUMN frozen_by INT NULL;
```

Drizzle `shared/schema.ts` update: tambahkan kolom-kolom ini ke definisi `customerReferrals`, `customerDiscounts`, `pointRedemptions`, `customerLoyalty`. Generated types langsung tersedia di `Storage` methods.

Index: tidak perlu - query soft-delete check pakai `WHERE deleted_at IS NULL` di list yang sudah ada index (primary key + foreign key existing cukup).

## Backend Endpoints

Semua endpoint baru di `server/routes.ts`, di-guard `hasWritePermission("loyalty_admin")`, semua panggil `logAudit(req, action, entity, entityId, label, payload)`.

### Referrals

| Method | Path | Body | State Guard | Notes |
|---|---|---|---|---|
| `PUT` | `/api/loyalty/admin/referrals/:id` | `{ refereeName?, refereePhone?, notes? }` | Block kalau `status === "rewarded"` (409) | Audit `UPDATE` `loyalty_referral` dengan diff before/after |
| `DELETE` | `/api/loyalty/admin/referrals/:id` | `{ reason? }` | Block kalau `status === "rewarded"` (409) | Soft delete; audit `DELETE` `loyalty_referral` |

Storage methods:
- `updateCustomerReferral(id: number, patch: Partial<CustomerReferral>)`
- `softDeleteCustomerReferral(id: number)`

Existing `getCustomerReferrals()` di-update: filter `WHERE deleted_at IS NULL` kecuali query param `?includeDeleted=true`.

### Discounts

| Method | Path | Body | State Guard | Notes |
|---|---|---|---|---|
| `PUT` | `/api/loyalty/admin/discounts/:id` | `{ discountType?, discountValue?, source?, reason? }` | Hanya `status === "pending"`; lain 409 | Audit `UPDATE` `loyalty_discount` |
| `DELETE` | `/api/loyalty/admin/discounts/:id` | `{ reason? }` | `status === "applied"` → 409 ("uang sudah keluar"). Lain (pending/cancelled/expired) OK. | Soft delete; audit `DELETE` `loyalty_discount` dengan `statusAtDelete` |

Existing `cancel` endpoint (`POST .../discounts/:id/cancel`) **tetap dipertahankan** - itu lifecycle transition (pending → cancelled, masih visible di history). `delete` baru menghapus dari UI list.

Storage methods:
- `updateCustomerDiscount(id: number, patch)`
- `softDeleteCustomerDiscount(id: number)`

`getCustomerDiscounts()` filter `WHERE deleted_at IS NULL` default; `?includeDeleted=true` tampilkan semua.

### Redemptions

| Method | Path | Body | State Guard | Notes |
|---|---|---|---|---|
| `PUT` | `/api/loyalty/admin/points/redemptions/:id` | `{ boostProfile?, durationDays?, pointsCost? }` | Hanya `status === "pending"` | Audit `UPDATE` `loyalty_redemption` |
| `DELETE` | `/api/loyalty/admin/points/redemptions/:id` | `{ reason? }` | `status === "active"` → 409 ("boost masih jalan, cancel dulu"). Pending → auto-refund poin lewat `refundRedemptionPoints()` (reuse logic existing) sebelum soft-delete. Cancelled/expired/rejected → langsung soft-delete (sudah di-refund saat cancel/reject). | Soft delete; audit `DELETE` `loyalty_redemption` |

Storage methods:
- `updatePointRedemption(id, patch)`
- `softDeletePointRedemption(id)`
- Helper `refundRedemptionPoints(id, reason)` (mungkin extract dari existing `cancel` handler kalau belum ada)

### Sahabat profile

4 endpoint baru:

| Method | Path | Body | Behavior |
|---|---|---|---|
| `POST` | `/api/loyalty/admin/sahabat/:customerId/points-adjust` | `{ delta: number, reason: string }` (reason required) | Atomic UPDATE `pointsBalance + delta WHERE pointsBalance + delta >= 0`. Kalau affectedRows=0 → 409 ("balance tidak cukup"). Tulis `point_transactions` row source=`admin_adjust`, `delta`, `reason`, `byUserId`. Audit `ADJUST` `sahabat_points` `{ delta, reason, before, after }`. Warning di UI kalau `\|delta\| > 10000`. |
| `POST` | `/api/loyalty/admin/sahabat/:customerId/level` | `{ level: enum, reason: string }` | level: `new\|perunggu\|perak\|emas\|platinum\|berlian\|ambassador`. Update `customer_loyalty.sahabatLevel`. Audit `UPDATE` `sahabat_level` `{ from, to, reason }`. |
| `POST` | `/api/loyalty/admin/sahabat/:customerId/code` | `{ sahabatCode: string }` | Validate regex `^SHB-[A-Z]{3}-\d{3}$`, validate unique (tabel `customer_loyalty.sahabatCode UNIQUE`). Update `sahabatCode` + `referralCode` legacy alias dalam 1 transaction. Audit `UPDATE` `sahabat_code` `{ from, to }`. |
| `POST` | `/api/loyalty/admin/sahabat/:customerId/freeze` | `{ frozen: boolean, reason?: string }` (reason required saat `frozen=true`) | Set `is_frozen`, `frozen_reason`, `frozen_at=NOW()`, `frozen_by=req.authUser.id`. Audit `FREEZE`/`UNFREEZE` `sahabat_account`. |

Existing `POST /api/loyalty/admin/sahabat/:customerId/tier` **tidak diubah**.

**Frozen guard**: tambah cek `if (loyalty.isFrozen) return` di flow reward issuance:
- `server/storage.ts` `processReferralReward()` (atau equivalent - confirm lokasi exact saat implementation)
- Milestone reward issuance
- Streak adjust auto-issue

Saat frozen aktif, referral inbound tetap di-record (tabel `customer_referrals`), tapi tidak generate voucher/credit/MPWA notification. Saat unfreeze, **tidak ada auto-replay** - admin manual issue reward kalau perlu.

### Backreference: sahabat code rename

Cek `shared/schema.ts` apakah `customer_referrals` (atau tabel lain) ada kolom `referrer_sahabat_code` text yang FK by string, bukan by `referrer_customer_id` int. Kalau ya, rename code wajib UPDATE turun dengan SQL transaction. Kalau semua link berbasis `referrer_customer_id` (FK int), aman tanpa migrasi turunan. **Action item di implementation phase**: confirm.

## Frontend Changes

Semua control hanya muncul kalau `canEdit = canWrite("loyalty_admin")` (variable existing di `LoyaltyAdminPage.tsx:111`). Saat `canEdit=false`, tombol render disabled dengan tooltip "Butuh izin loyalty_admin (write)".

### `ReferralsTable` (`client/pages/LoyaltyAdminPage.tsx:1219`)

- Tambah kolom **Aksi** kanan: `<DropdownMenu>` → **Edit**, **Hapus** (disabled + tooltip kalau status=`rewarded`).
- **Edit dialog** (`<Dialog max-w-md>`): form 3 field (`refereeName`, `refereePhone`, `notes`), tombol Simpan → `PUT /api/loyalty/admin/referrals/:id` → invalidate `referrals` query.
- **Delete confirm** (`<AlertDialog>`): pesan "Hapus referral ke {refereeName}?", optional textarea `reason`, tombol Hapus merah.

### `DiscountRow` (`client/pages/LoyaltyAdminPage.tsx:1008`)

- Tambah icon button **Edit** (Pencil) + **Hapus** (Trash2) di kanan row, di samping Apply/Cancel existing.
- **Edit dialog**: form 4 field (`discountType` select `[credit|voucher|service]`, `discountValue` number, `source` text, `reason` textarea). Disable submit + show help text kalau status ≠ `pending`.
- **Delete confirm**: standard AlertDialog. Disabled untuk `applied` dengan tooltip "Sudah dipakai customer, tidak bisa dihapus."

### `PointRedemptionsTab` (`client/pages/LoyaltyAdminPage.tsx:1585`)

- Tambah action **Edit** (disabled kecuali `pending`) + **Hapus** (disabled saat `active`).
- **Edit dialog**: form 3 field (`boostProfile` select, `durationDays` number, `pointsCost` number).
- **Delete confirm**: standard.

### `SahabatDetailDrawer` (`client/components/sahabat/SahabatDetailDrawer.tsx`)

Tambah section **"Admin Actions"** (collapsed by default, hanya render saat `canEdit`). Berisi 4 sub-form (accordion):

1. **Adjust Points** - input number `delta` (boleh negatif), textarea `reason` (required), preview "Balance: X → Y". Warning kuning kalau `|delta| > 10000`.
2. **Set Level** - select dropdown 7 option, current level tertera, textarea reason.
3. **Edit Sahabat Code** - input dengan regex hint `SHB-XXX-NNN`, validation client-side, AlertDialog confirm.
4. **Freeze/Unfreeze** - toggle switch + textarea reason (required saat freeze). Banner kuning kalau frozen: "Akun di-freeze {date} oleh {user}: {reason}".

### Filter "Tampilkan terhapus"

Tambah toggle pill di tab **Diskon**, **Referral**, **Redemption**: "Tampilkan terhapus" (default off). Saat on → query param `?includeDeleted=true` → backend tampilkan rows `deleted_at IS NOT NULL`. UI render baris dengan `opacity-50 line-through` + badge "Dihapus" + tooltip "Hapus pada {deleted_at}".

## Critical Files

| File | Change |
|---|---|
| `shared/schema.ts` (lines ~489-510 customerLoyalty, ~580 customerDiscounts, customerReferrals, pointRedemptions) | Tambah `deletedAt`, `isFrozen`, `frozenReason`, `frozenAt`, `frozenBy` kolom |
| `server/storage.ts` (startup ALTER block) | Idempotent ALTER 7 kolom |
| `server/storage.ts` | 9 method baru: 3× `update*`, 3× `softDelete*`, `adjustSahabatPoints`, `setSahabatLevel`, `setSahabatCode`, `setSahabatFrozen`. Update 3 `get*` list method untuk filter `deletedAt IS NULL`. Tambah `isFrozen` guard di reward issuance flows. |
| `server/routes.ts:3849-3960` | + `PUT/DELETE /referrals/:id`, + edit + delete discount/redemption endpoints, + 4 sahabat endpoint |
| `client/pages/LoyaltyAdminPage.tsx:1008` (`DiscountRow`) | Tambah Edit/Delete icon button + dialog state |
| `client/pages/LoyaltyAdminPage.tsx:1219` (`ReferralsTable`) | Tambah Aksi column + dropdown + dialog state |
| `client/pages/LoyaltyAdminPage.tsx:1585` (`PointRedemptionsTab`) | Tambah Edit/Delete row action |
| `client/pages/LoyaltyAdminPage.tsx` (TabsContent for discounts/referrals/redemptions) | Tambah "Tampilkan terhapus" toggle |
| `client/components/sahabat/SahabatDetailDrawer.tsx` | Tambah "Admin Actions" accordion 4 form |

**Yang tidak diubah:**
- Existing apply/cancel/verify/reject/cancel-redemption/force-expire endpoint - backward compatible
- `tier` endpoint existing
- Permission key `loyalty_admin` (tidak tambah key baru)

## Audit Logging

| Action | entity | payload |
|---|---|---|
| Edit referral | `UPDATE` `loyalty_referral` | diff before/after |
| Soft-delete referral | `DELETE` `loyalty_referral` | `{ reason }` |
| Edit discount | `UPDATE` `loyalty_discount` | diff |
| Soft-delete discount | `DELETE` `loyalty_discount` | `{ reason, statusAtDelete }` |
| Edit redemption | `UPDATE` `loyalty_redemption` | diff |
| Soft-delete redemption | `DELETE` `loyalty_redemption` | `{ reason, statusAtDelete }` |
| Points adjust | `ADJUST` `sahabat_points` | `{ delta, reason, before, after }` |
| Level set | `UPDATE` `sahabat_level` | `{ from, to, reason }` |
| Code rename | `UPDATE` `sahabat_code` | `{ from, to }` |
| Freeze | `FREEZE` `sahabat_account` | `{ reason }` |
| Unfreeze | `UNFREEZE` `sahabat_account` | `{}` |

`audit_logs` table existing, viewable via UserDetailDrawer "Aktivitas" tab.

## Verification Plan

### Local (`npm run dev`)

1. Restart dev → confirm ALTER TABLE jalan tanpa error.
2. Login admin (`canEdit=true`):
   - Tiap surface coba edit → confirm DB row ter-update + audit log catat.
   - Delete:
     - Referral status=`pending` → soft-delete OK, hilang dari list default.
     - Referral status=`rewarded` → 409 + toast error di UI.
     - Discount status=`applied` → 409.
     - Redemption status=`active` → 409.
   - Toggle "Tampilkan terhapus" → row deleted muncul dengan strikethrough.
3. Sahabat drawer:
   - Adjust points `-100` saat balance 50 → block (409, atomic guard).
   - Adjust `+500` → success, `point_transactions` row baru source=`admin_adjust`.
   - Freeze + buat referral inbound baru → no reward generated, no MPWA fire.
   - Unfreeze → reward normal lagi.
   - Rename `sahabatCode` ke value yang sudah ada → 409 (unique constraint).
4. Login Read-Only user (`canEdit=false`): tombol disabled dengan tooltip benar.
5. `npx tsc --noEmit` → 0 errors. `npm run build` → sukses.

### Post-deploy (cPanel)

1. `git push origin main` → GHA build → cPanel Update from Remote → Restart Node.js App.
2. SSH: `mysql -u jabnet_crm_user -p'Galon@12345' jabnet_fiber -e "SHOW COLUMNS FROM customer_referrals LIKE 'deleted_at'"` → ada.
3. Production smoke:
   - Login workspace.jabnet.id → /loyalty → edit 1 discount pending → confirm tersimpan, audit log catat.
   - Freeze 1 sahabat test, buat referral inbound → no reward → unfreeze.
4. `curl https://workspace.jabnet.id/api/billing/sync/health` → no drift.

### Rollback

- Schema ALTER pakai cek `information_schema` dulu (idempotent) → re-run safe.
- Soft delete: restore via SQL `UPDATE ... SET deleted_at = NULL WHERE id = ?`.
- Kalau bug critical → `git revert` commit; kolom baru harmless (unused), tidak perlu DROP.

## Risks

1. **Edit discount value retroaktif** - abuse potential untuk inflate reward. Mitigasi: edit hanya `pending` status, audit log diff lengkap.
2. **Points adjust unbounded** - admin bisa kasih juta poin. Mitigasi: warning UI kalau `\|delta\| > 10000`, audit log + reason required.
3. **Sahabat code rename backreference** - kalau ada FK by string (bukan customer_id int) di tabel lain, rename perlu UPDATE turun. **Action item**: confirm di implementation phase scan `referrer_sahabat_code` / similar columns di `shared/schema.ts`.
4. **Frozen guard coverage** - perlu semua reward issuance flow cek `isFrozen`. Scan: `processReferralReward`, milestone reward, streak adjust auto-issue. Missed branch = silent reward despite freeze.
5. **Race condition points adjust** - concurrent adjust dari 2 admin. Mitigasi: atomic `UPDATE customer_loyalty SET pointsBalance = pointsBalance + ? WHERE id = ? AND pointsBalance + ? >= 0`. Kalau affectedRows=0 → 409.
6. **Soft-delete DB growth** - table tumbuh terus karena tidak ada hard purge. Defer ke backlog kalau jadi masalah; estimate growth rate untuk decide perlu auto-purge job di masa depan.

## Out of Scope

- UI restore button untuk soft-deleted rows (manual SQL admin).
- Bulk delete / bulk freeze.
- Email/WA notif ke customer saat di-freeze (audit log cukup untuk internal).
- Auto-purge `deleted_at < NOW() - INTERVAL 365 DAY` (defer).
- Permission split (loyalty_destructive separate key) - pakai existing loyalty_admin write.
- Edit `tier` via UI (sudah ada endpoint existing).
