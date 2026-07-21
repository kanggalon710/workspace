# Public API - Finance + Subscriber + Executive Report (Fase 1)

> **Status**: Design disetujui 2026-06-02. Lanjutan dari rekomendasi "data untuk AI reporting".
> **Goal**: Ekspos data revenue/billing, subscriber base, dan satu laporan executive one-shot ke Public API (`/api/public/v1/*`) supaya AI bisa bikin laporan harian → quarter. Tenant-scoped, agregat-only (tanpa PII), mengikuti pola `requireScope` + rate-limit yang sudah ada.

---

## Context

Public API saat ini (`server/public-api-routes.ts`, ~962 baris) sudah punya 6 scope read: `marketing:read` (lengkap), `reports:read` (daily/weekly/range summary), `leads:read`, `collections:read`, `sahabat:read`, `tickets:read`. **Lubang terbesar: tidak ada data revenue/billing & subscriber base** - padahal datanya ada.

### Temuan kualitas data (prod `jabnet_fiber`, 808 customers, read-only audit 2026-06-02)

| Field / sumber | Status | Implikasi |
|---|---|---|
| `customers.billing_price` | 782/808 terisi (Σ = Rp 135.775.350/bln, ARPU ~Rp 173.626) | **MRR/ARPU/revenue-at-risk computable** |
| `customers.status` / `is_isolir` | active 715 / isolir 93 (konsisten) | Distribusi aktif/isolir computable |
| `customers.install_date` | 808/808 terisi (ada garbage `1900-…` minoritas) | **Aktivasi baru per periode = histori asli (retroaktif)** |
| `customers.due_date`, `last_payment_date`, `isolir_date`, `lead_id` | **SEMUA kosong (0)** | Aging/days-to-pay/churn per-pelanggan & CAC loop TIDAK feasible dari customers |
| `collections` (415 row, 322 closed) | `opened_at`, `opened_due_date`, `opened_isolir_date`, `opened_amount`, `closed_at`, `closed_last_payment_date`, `close_reason` terisi | **Recovery rate, aging, days-to-pay, outstanding = computable dari collections** |
| Tabel snapshot KPI | TIDAK ADA (hanya `traffic_snapshots` untuk bandwidth) | Tren MRR & subscriber dari waktu ke waktu **tidak terekam historisnya** |

**Konsekuensi desain:** point-in-time KPI + tren aktivasi (install_date) + tren recovery (collections) bisa langsung. Tren MRR & subscriber count historis **harus dibangun ke depan** via snapshot.

---

## Arsitektur

### 1. Lazy daily KPI snapshot (tanpa worker)

Prod `WORKERS_ENABLED=false` (lihat memory `reference-prod-billing-sync-manual`), jadi tidak boleh mengandalkan background worker. Pakai **lazy snapshot**:

- Tabel baru **`kpi_snapshots`** - 1 baris per `(mitra_id, snapshot_date)`. Ukuran mungil (≤365 baris/tahun/mitra).
- **Penulis lazy** (`ensureKpiSnapshotForToday()` di `storage.ts`): dipanggil di awal handler endpoint finance/customers/executive. Cek "snapshot mitra ini untuk tanggal lokal hari ini sudah ada?" via 1 SELECT ringan. Kalau belum → hitung agregat (COUNT/SUM dari customers + collections) lalu INSERT. Idempotent (unique `(mitra_id, snapshot_date)`; pakai `INSERT … ON DUPLICATE KEY UPDATE` atau cek-lalu-insert).
- Karena cron keep-alive hit `/api/health` tiap 4 menit + traffic normal, snapshot hari itu pasti terbentuk begitu ada request finance/exec pertama. Beban ~1 agregat/hari/mitra.
- **Tanggal lokal**: pakai timezone server (WIB) - `snapshot_date` = `YYYY-MM-DD` lokal.

> Catatan: snapshot hanya dipicu oleh request ke endpoint baru ini (atau bisa juga dipanggil di `/health` kalau mau dijamin). MVP: panggil di handler finance/customers/executive. Cukup karena AI/cron yang konsumsi pasti hit endpoint tsb.

#### Schema `kpi_snapshots` (`shared/schema.ts`)

```ts
export const kpiSnapshots = mysqlTable("kpi_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  snapshotDate: varchar("snapshot_date", { length: 10 }).notNull(), // YYYY-MM-DD lokal
  activeCount: int("active_count").notNull().default(0),
  isolirCount: int("isolir_count").notNull().default(0),
  totalCount: int("total_count").notNull().default(0),
  mrr: bigint("mrr", { mode: "number" }).notNull().default(0),            // Σ billing_price pelanggan aktif (Rupiah)
  arpu: int("arpu").notNull().default(0),                                  // mrr / activeCount
  revenueAtRisk: bigint("revenue_at_risk", { mode: "number" }).notNull().default(0), // Σ billing_price isolir
  newActivations: int("new_activations").notNull().default(0),            // install_date == snapshot_date
  collectionsOpen: int("collections_open").notNull().default(0),
  collectionsClosedToday: int("collections_closed_today").notNull().default(0),
  outstandingAmount: bigint("outstanding_amount", { mode: "number" }).notNull().default(0), // Σ opened_amount collections open
  createdAt: text("created_at").notNull(),
});
```

Index/unique: `uniq_kpi_snapshot_mitra_date` UNIQUE `(mitra_id, snapshot_date)`. Startup migration block di `storage.ts` (`CREATE TABLE IF NOT EXISTS` + `ALTER … ADD INDEX` idempotent, errno 1061 ditangani seperti pola lain).

### 2. Scope baru

Tambah ke daftar scope (`server/public-api-routes.ts` schema + validasi). Auto-grantable saat create API key di `/api-keys`.

- `finance:read` - revenue, billing status, collections recovery (agregat).
- `customers:read` - subscriber base counts & activations (agregat).
- `/reports/executive` pakai scope **`reports:read`** yang sudah ada (gabungan agregat).

### 3. Param periode seragam

Semua endpoint time-series & executive menerima:
`?period=daily|weekly|monthly|quarterly` + opsional `?from=YYYY-MM-DD&to=YYYY-MM-DD`.

- Default tiap `period`: `daily`→30 bucket, `weekly`→12, `monthly`→12, `quarterly`→8 (bucket terakhir s/d hari ini).
- Bucketing pakai SQL date grouping pada kolom tanggal sumber (`install_date`, `opened_at`, atau `snapshot_date`).
- Return time-series: `{ period, buckets: [{ bucket: "2026-05", value: N }, ...] }`.
- Return headline metric: `{ value, prev, deltaPct }` (prev = periode sebelumnya yang setara).

---

## Endpoints & response shape

Base: `/api/public/v1`. Semua pakai envelope mentah JSON yang sama dengan endpoint public existing (lihat `requireScope`). Semua agregat - **tanpa PII**.

### `GET /finance/overview` - scope `finance:read`
Point-in-time (panggil `ensureKpiSnapshotForToday()` dulu).
```json
{
  "asOf": "2026-06-02T...Z",
  "mrr": { "value": 135775350, "prev": 134900000, "deltaPct": 0.6 },
  "arpu": 173626,
  "activeCount": 715,
  "isolirCount": 93,
  "revenueAtRisk": 16100000,
  "billingStatus": { "lunas": 34, "belum_lunas": 774 },
  "byPackage":  [{ "package": "20 Mbps", "count": 300, "mrr": 45000000 }],
  "byType":     [{ "type": "rumahan", "count": 781 }, { "type": "vip", "count": 27 }],
  "byDistrict": [{ "district": "Cilawu", "count": 120, "mrr": 20000000 }]
}
```
`prev`/`deltaPct` pada `mrr` diambil dari snapshot kemarin (null kalau belum ada).

### `GET /finance/timeseries?metric=mrr|active|isolir|revenue_at_risk&period=` - scope `finance:read`
Dari `kpi_snapshots`. Return `{ metric, period, buckets:[{bucket,value}] }`. Bucket bulanan/quarter = nilai snapshot pada/terakhir di tiap bucket (point-in-time, bukan sum).

### `GET /finance/collections?period=` - scope `finance:read`
Dari `collections` (sumber timestamp asli).
```json
{
  "period": "monthly",
  "openNow": 95,
  "outstandingAmount": 18250000,
  "recovery": [{ "bucket": "2026-05", "opened": 40, "closed": 35, "recoveryPct": 87.5 }],
  "aging": { "d0_7": 30, "d8_30": 40, "d31plus": 25 },     // open collections by age dari opened_at
  "avgDaysToPay": 9.3                                       // avg(closed_at - opened_at) untuk yang paid
}
```

### `GET /customers/overview` - scope `customers:read`
```json
{
  "asOf": "...",
  "total": 808, "active": 715, "isolir": 93,
  "newActivations": { "today": 2, "value": 45, "prev": 38, "deltaPct": 18.4 },  // value = periode default (bulan ini)
  "byPackage": [...], "byType": [...], "byDistrict": [...], "byVillage": [...]
}
```

### `GET /customers/timeseries?metric=new_activations|active|net_adds&period=` - scope `customers:read`
- `new_activations`: dari `install_date` (histori asli, retroaktif penuh). Buang baris `install_date < '2000-01-01'` (garbage).
- `active` / `net_adds`: dari `kpi_snapshots` (akumulasi ke depan; `net_adds` = `active[t] - active[t-1]`). Sebelum snapshot terkumpul, buckets bisa kosong/parsial - di-flag via field `coverage: "from 2026-06-02"`.

### `GET /reports/executive?period=&from=&to=` - scope `reports:read`
One-shot padat untuk AI. Memanggil agregator yang sama (reuse fungsi storage finance/customers/collections).
```json
{
  "period": "monthly", "range": { "from": "...", "to": "..." },
  "revenue":     { "mrr": {...delta}, "arpu": ..., "revenueAtRisk": ..., "outstandingAmount": ... },
  "subscribers": { "active": {...delta}, "isolir": ..., "newActivations": {...delta}, "churnNote": "needs snapshot history" },
  "collections": { "openNow": ..., "recoveryPct": {...delta}, "avgDaysToPay": ... },
  "operations":  { "ticketsOpen": ..., "slaNote": "expanded in Fase 2" },
  "trend":       { "mrr": [..buckets..], "newActivations": [..buckets..] },
  "redFlags":    ["Revenue at risk Rp 16.1jt (12% MRR) dari 93 pelanggan isolir"],
  "greenLights": ["Aktivasi baru bulan ini +18% vs bulan lalu"]
}
```
`redFlags`/`greenLights` = aturan ambang sederhana di server (mis. isolir>10% MRR → flag), meniru pola `/marketing/overview` yang sudah terbukti enak untuk AI.

---

## Privasi (guardrail wajib)

Scope `finance:read` & `customers:read` **agregat-only**. TIDAK ada field PII di response mana pun: `name`, `phone`, `email`, `address`, `pppoe_username/password`, `ont_serial_number`, `customer_id`. Breakdown maksimal sampai level grup (package/type/district/village). Drill-down per-pelanggan = di luar Fase 1 (kalau perlu, scope khusus `customers:pii` terpisah, jarang diberikan).

---

## Files to touch

| File | Perubahan |
|---|---|
| `shared/schema.ts` | + tabel `kpiSnapshots` + type `KpiSnapshot`. Import `bigint` kalau belum. |
| `server/storage.ts` | + startup migration `kpi_snapshots`. + method: `ensureKpiSnapshotForToday()`, `getFinanceOverview()`, `getFinanceTimeseries(metric,period,from,to)`, `getCollectionsFinance(period,...)`, `getCustomersOverview()`, `getCustomersTimeseries(metric,...)`, `getExecutiveReport(period,...)`. Semua tenant-scoped via `getMitraId()`. Pakai batched aggregate SQL (hindari N+1). |
| `server/public-api-routes.ts` | + 2 scope di list scope & validasi. + 6 endpoint (handler tipis → panggil storage). + entri di `/schema` endpoint list & `scopes`. |
| `client/pages/PublicApiPage.tsx` | (opsional, kalau scope di-hardcode di UI) tambah `finance:read`, `customers:read` ke daftar scope yang bisa dicentang saat create key. |

**Tidak diubah:** rate-limit, auth bearer, tenant context wiring - semua reuse.

---

## Verification plan

1. `npx tsc --noEmit` → 0 errors. `npm run build` → sukses.
2. Lokal (DB dev `jabnet_fiber_dev` mirror): buat API key scope `finance:read,customers:read,reports:read` via `/api-keys`.
3. `curl` tiap endpoint:
   - `/finance/overview` → MRR ≈ Σ billing_price aktif; cocokkan manual via SQL.
   - `/finance/collections?period=monthly` → recoveryPct & aging cocok dengan query `collections`.
   - `/customers/timeseries?metric=new_activations&period=monthly` → cocok dengan `GROUP BY install_date`.
   - `/reports/executive?period=monthly` → semua section terisi, redFlags muncul saat isolir tinggi.
4. Lazy snapshot: hit endpoint, cek `SELECT * FROM kpi_snapshots WHERE snapshot_date = CURDATE()` → 1 baris muncul; hit lagi → tidak duplikat.
5. Tenant isolation: key mitra lain (kalau ada) tidak lihat data JABNET.
6. Privasi: grep response → pastikan tak ada `phone`/`email`/`name`/`customer_id`.
7. `/api/public/v1/schema` → 2 scope + 6 endpoint baru muncul (untuk dokumentasi AI).

---

## Out of scope (Fase 1)

- Churn rate akurat per-pelanggan (butuh histori snapshot terkumpul / billing sync isi `isolir_date`).
- YoY comparison (butuh ≥1 tahun snapshot).
- CAC loop / lead→customer attribution (`lead_id` kosong).
- Network/capacity & operations/SLA penuh → **Fase 2** (`network:read`, `operations:read`).
- Engagement (broadcast) & loyalty time-series → **Fase 3**.
- Drill-down per-pelanggan / PII scope.
