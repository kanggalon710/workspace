# Spec - JABNET Sahabat: Filter Status Pelanggan di Tab Referral

**Date**: 2026-05-26
**Topic**: Pemisahan referee aktif vs non-aktif vs belum daftar di admin tab Referral
**Status**: Draft (awaiting user review)

## Konteks

Tab Referral di halaman `/loyalty` (`LoyaltyAdminPage.tsx`) saat ini hanya bisa difilter berdasarkan **status lifecycle referral** (`invited` / `registered` / `rewarded` / `expired`). Admin tidak punya cara cepat untuk membedakan referral berdasarkan **status pelanggan referee** - penting untuk follow-up operasional:

- Berapa banyak referee yang masih sekedar nama+HP, belum pasang? (perlu follow-up sales)
- Berapa banyak referee yang sekarang sudah jadi pelanggan aktif? (basis valid reward Sahabat)
- Berapa banyak referee yang sempat pasang lalu cabut/isolir? (fraud signal atau churn signal)

Spec ini menambah dimensi filter baru "Status Pelanggan" sebagai primary segmented control, sekaligus demote filter status referral existing ke dropdown sekunder.

## Goal

Tambah dimensi filter "Status Pelanggan" di tab Referral dengan 3 grup (Belum daftar / Aktif / Non-aktif) plus kolom baru "Status Pelanggan" di tabel referral dengan badge berwarna untuk visual scan cepat.

## Aturan Kategori (derived from existing fields, no schema change)

- **Belum daftar** = `customer_referrals.refereeCustomerId IS NULL`
- **Aktif** = `refereeCustomerId NOT NULL` AND `customers.isIsolir = 0` AND `customers.status = 'active'`
- **Non-aktif** = `refereeCustomerId NOT NULL` AND (`customers.isIsolir = 1` OR `customers.status != 'active'` OR customer record tidak ditemukan/orphan FK)

## Scope

**In scope**:
- Backend: extend `GET /api/loyalty/admin/referrals` agar response include `refereeStatus` + raw flags (`refereeIsIsolir`, `refereeCustomerStatusRaw`, `refereeCustomerName`, `refereeBillingId`)
- Frontend: ubah `ReferralsTable` di `LoyaltyAdminPage.tsx` - segmented control primary baru (4 pill: Semua / Belum daftar / Aktif / Non-aktif), demote filter status referral ke `<Select>` dropdown, tambah kolom "Status Pelanggan" di tabel
- Verifikasi manual (no automated test - konsisten dengan pattern existing admin pages)

**Out of scope (defer ke spec lain bila perlu)**:
- Fitur Import/Export referral - user menyatakan opsional/terakhir
- Edit referee - sudah ada (PUT `/api/loyalty/admin/referrals/:id` di line 4000 routes.ts)
- Logic pencabutan reward saat referee jadi non-aktif - orthogonal, fraud detection sudah ada terpisah
- Schema DB change - tidak perlu, derive dari field existing
- Server-side filter via query param `?refereeStatus=` - client-side filtering cukup untuk dataset current (≤200 baris)

## Arsitektur Backend

### Endpoint diubah (additive, non-breaking)

`GET /api/loyalty/admin/referrals?limit=200&includeDeleted=false`

Storage method yang di-edit (cek `server/storage.ts` saat implementasi - kandidat: `getReferralsAdmin` atau setara) - extend SQL query:

```sql
SELECT
  r.*,
  ref.name           AS referrer_name,
  ref.customer_id    AS referrer_billing_id,
  ree.name           AS referee_customer_name,
  ree.customer_id    AS referee_billing_id,
  ree.is_isolir      AS referee_is_isolir,
  ree.status         AS referee_customer_status,
  CASE
    WHEN r.referee_customer_id IS NULL THEN 'belum_daftar'
    WHEN ree.id IS NULL THEN 'non_aktif'                                     -- orphan FK guard
    WHEN COALESCE(ree.is_isolir, 0) = 0
         AND COALESCE(ree.status, 'active') = 'active' THEN 'aktif'
    ELSE 'non_aktif'
  END AS referee_status
FROM customer_referrals r
LEFT JOIN customers ref ON ref.id = r.referrer_customer_id
LEFT JOIN customers ree ON ree.id = r.referee_customer_id
WHERE r.mitra_id = ?
  AND (? OR r.deleted_at IS NULL)
ORDER BY r.created_at DESC
LIMIT ?;
```

Notes:
- LEFT JOIN ke `customers` by PK - biaya negligible, tidak butuh index baru
- `customers.id` adalah autoincrement int (PK), `customer_id` text adalah billing ID (e.g. "052500015")
- Branch orphan FK (`WHEN ree.id IS NULL`) memastikan referral dengan `refereeCustomerId` yang menunjuk ke customer terhapus tetap masuk grup `non_aktif`, bukan jatuh ke `aktif`

### Response shape (additive)

```ts
type ReferralAdminRow = {
  // existing fields tidak berubah
  id: number;
  mitraId: number;
  referrerCustomerId: number;
  referralCode: string;
  refereePhone: string | null;
  refereeName: string | null;
  refereeCustomerId: number | null;
  status: "invited" | "registered" | "rewarded" | "expired";
  firstPaymentAt: string | null;
  rewardCreditedAt: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  referrerName: string;
  referrerBillingId: string;

  // baru
  refereeStatus: "belum_daftar" | "aktif" | "non_aktif";
  refereeCustomerName: string | null;
  refereeBillingId: string | null;
  refereeIsIsolir: boolean;
  refereeCustomerStatusRaw: string | null;
};
```

## Arsitektur Frontend

### File diubah
`client/pages/LoyaltyAdminPage.tsx` - komponen `ReferralsTable` (line 1433+).

### State baru
```ts
const [customerStatusFilter, setCustomerStatusFilter] =
  useState<"all" | "belum_daftar" | "aktif" | "non_aktif">("all");
```

Existing `statusFilter` (referral lifecycle) tetap, tapi pindah dari segmented control ke `<Select>` dropdown sekunder.

### Layout filter bar

**Sebelum:**
```
[ Semua | Diundang | Terdaftar | Reward | Kadaluwarsa ]   [Toggle: Tampilkan terhapus] [+ Catat Referral]
```

**Sesudah:**
```
Primary (text-sm):
[ Semua (200) | Belum daftar (45) | Aktif (120) | Non-aktif (35) ]

Secondary (text-xs):
Status Referral: [Semua ▼]   [Toggle: Tampilkan terhapus]   [+ Catat Referral]
```

Segmented control pakai pola identik dengan existing (`p-1 bg-muted/50 rounded-lg`, pill `px-3 py-1.5 rounded-md` aktif `bg-background shadow-sm`). Setiap pill tampil count `(N)` dalam tanda kurung.

### Filter combinator

```ts
const filtered = useMemo(() => {
  let rows = referrals;
  if (customerStatusFilter !== "all") {
    rows = rows.filter(r => r.refereeStatus === customerStatusFilter);
  }
  if (statusFilter !== "all") {
    rows = rows.filter(r => r.status === statusFilter);
  }
  return rows;
}, [referrals, customerStatusFilter, statusFilter]);
```

Count badge per segmented button dihitung dari **unfiltered `referrals`** supaya jumlah grup stabil dan tidak berubah saat dropdown status referral diubah.

### Kolom "Status Pelanggan" baru di tabel

Posisi: setelah kolom "Tetangga Diundang" / sebelum kolom "Status" (lifecycle referral).

| Grup | Badge | Sub-info |
|---|---|---|
| `belum_daftar` | `bg-slate-100 text-slate-600` + icon `UserPlus` | "-" |
| `aktif` | `bg-emerald-100 text-emerald-700` + dot pulse | `refereeCustomerName` · `#refereeBillingId` (mono) |
| `non_aktif` | `bg-rose-100 text-rose-700` | label "Isolir" (kalau `refereeIsIsolir`) atau "Terminated" (kalau status non-active) |

Tooltip on hover untuk grup `non_aktif` (opsional, kalau cepat): full label `customers.status` raw.

### Empty state per grup

Gunakan `<EmptyState>` component existing:
- "Belum daftar (0)" → "Semua referee sudah jadi pelanggan."
- "Aktif (0)" → "Belum ada referee yang aktif sebagai pelanggan."
- "Non-aktif (0)" → "Tidak ada referee yang isolir/terminated."

### Tidak diubah
- Dialog Edit / Delete / Catat Referral / Link to customer - semua tetap
- Toggle "Tampilkan terhapus" - tetap orthogonal filter ke-3
- Click row → buka `SahabatDetailDrawer` untuk referrer - tetap perilaku existing
- Spinner loading state - tetap

## Testing & Verification

### Pre-implementation check
```sql
-- Validasi enum nilai `customers.status` di prod cPanel - pastikan definisi "Aktif" cocok
SELECT status, COUNT(*) FROM customers GROUP BY status;
```
Kalau ada nilai lain di luar `active` (mis. `installing`, `prospect`), keputusan: tetap pakai `= 'active'` strict - referee dalam status apapun selain `active` masuk Non-aktif. Catat ini di PR description.

### Type & build
```bash
npx tsc --noEmit    # 0 errors expected
npm run build       # esbuild + vite build sukses
```

### Manual verification (dev local)

Login admin, buka `/loyalty` → tab Referral. Data assumption: 78 referrals di mitra=1 (hasil resync sebelumnya).

1. **Segmented control** tampil 4 pill (Semua / Belum daftar / Aktif / Non-aktif) dengan count badge. Verifikasi Σ grup = total.
2. **Kolom "Status Pelanggan"** muncul di tabel dengan badge warna sesuai grup.
3. **Filter "Belum daftar"** → semua row punya `refereeCustomerId IS NULL` (cross-check via DB).
4. **Filter "Aktif"** → cross-check 1-2 baris:
   ```sql
   SELECT r.id, c.name, c.is_isolir, c.status
   FROM customer_referrals r
   JOIN customers c ON c.id = r.referee_customer_id
   WHERE r.id = <id-yang-tampil-di-grup-Aktif>;
   ```
   Expected: `is_isolir=0` AND `status='active'`.
5. **Filter "Non-aktif"** → cek isolir atau status non-active. Sub-info tampilkan alasan.
6. **Combine filter**: Primary "Non-aktif" + Secondary "Reward" → expected = referee yang sempat di-reward tapi sekarang cabut/isolir (fraud/churn signal).
7. **Toggle "Tampilkan terhapus"** → soft-deleted rows muncul, masih ter-filter oleh segmented + dropdown.
8. **Empty state**: paksa filter ke grup kosong, verify pesan custom muncul.
9. **Edge case - orphan FK**:
   ```sql
   -- Di staging: hapus 1 customer yang punya referral, atau set referee_customer_id ke ID tidak exist
   UPDATE customer_referrals SET referee_customer_id = 99999999 WHERE id = <test-id>;
   ```
   Expected: row masuk grup `non_aktif` (bukan `aktif`).
10. **Mobile (375px)**: segmented control scroll horizontal smooth, kolom Status Pelanggan readable.

### Performance check
Query response time 200 referrals dengan 2 LEFT JOIN: target <100ms lokal. Pantau via existing Express request timer middleware.

### Tidak ada automated test baru
Pattern existing JABNET admin pages tidak punya unit/integration test. Konsisten - verifikasi manual saja.

## Risiko & Mitigasi

| # | Risiko | Mitigasi |
|---|---|---|
| 1 | `customers.status` enum punya nilai di luar `active` (mis. `prospect`, `installing`) yang sebetulnya valid customer | Sebelum implementasi: query DISTINCT status di prod cPanel. Kalau ada surprise, evaluate apakah perlu daftar nilai-nilai "aktif" yang lebih lengkap (whitelist) - tapi default tetap `= 'active'` strict |
| 2 | Orphan `refereeCustomerId` (FK ke customer terhapus) salah masuk grup `aktif` | Sudah ada guard di SQL CASE: `WHEN ree.id IS NULL THEN 'non_aktif'` |
| 3 | Tag count badge tidak match dengan jumlah baris saat dropdown status referral aktif | Sengaja: count dari `referrals` unfiltered, bukan `filtered`. Konsisten dan stabil |
| 4 | Mobile layout pecah karena ada kolom baru | Pakai pattern existing - table sudah `overflow-x-auto`. Test viewport 375px |
| 5 | Bahasa label tidak konsisten | Patuhi tone existing: kasual Indonesia (mis. "Belum daftar" bukan "Belum Terdaftar"; "Non-aktif" bukan "Tidak Aktif") |

## Deploy

- Push ke `main` → GHA build → cPanel `Git Version Control → Update from Remote` → Restart Node.js App
- Zero schema migration / data fixup
- Rollback: revert commit + restart - backend tetap kompatibel (response field baru cuma additive, frontend lama abaikan)

## Out of Scope (defer)

- **Import referral** dari CSV/Excel - opsional per user (next spec)
- **Export referral** ke CSV/Excel - opsional per user (next spec)
- Link referee name di tabel → `/customers?focus=<id>` (deep-link ke detail customer) - YAGNI sekarang
- Server-side filter `?refereeStatus=` - bila dataset tumbuh >1000 baru pertimbangkan
- Cabut reward otomatis saat referee jadi non-aktif - orthogonal, di luar scope filter
