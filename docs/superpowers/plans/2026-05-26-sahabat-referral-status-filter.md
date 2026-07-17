# Sahabat Referral Status Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah dimensi filter "Status Pelanggan" (3 grup: Belum daftar / Aktif / Non-aktif) di tab Referral pada `/loyalty` admin, plus kolom badge di tabel.

**Architecture:** Backend extend single SQL query di `listAllReferralsAdmin()` untuk include computed `refereeStatus` via JOIN `customers.is_isolir` + `customers.status`. Frontend refactor `ReferralsTable` di `LoyaltyAdminPage.tsx`: tambah primary segmented control, demote existing referral-status filter ke dropdown sekunder, tambah kolom badge.

**Tech Stack:** TypeScript / React 18 / Drizzle ORM (MySQL dialect via raw `sql\`\``) / TanStack Query 5 / shadcn-ui (`Select`, `Switch`, `Tooltip`).

**Spec reference:** [`docs/superpowers/specs/2026-05-26-sahabat-referral-status-filter-design.md`](../specs/2026-05-26-sahabat-referral-status-filter-design.md)

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `server/storage.ts:2903-2949` | `listAllReferralsAdmin()` query + mapping — single source of truth untuk admin referral listing | **Modify**: tambah 3 SELECT field (is_isolir, status, computed CASE) + 3 mapping fields |
| `client/pages/LoyaltyAdminPage.tsx:1433-1780` | `ReferralsTable` component — UI tab Referral | **Modify**: state baru `customerStatusFilter`, refactor filter bar layout, tambah kolom tabel, update filter combinator |
| `docs/superpowers/specs/2026-05-26-sahabat-referral-status-filter-design.md` | Spec reference | (no change — sudah committed `2de46f0`) |

**Tidak diubah**: `shared/schema.ts` (zero schema change), routes endpoint (signature sama), file lain.

---

## Pre-flight Check

Sebelum mulai coding: validasi enum `customers.status` di prod cPanel — pastikan definisi "Aktif" (`= 'active'`) tepat sasaran. Kalau ada nilai lain seperti `installing`/`prospect` yang sebetulnya juga "valid customer", catat di PR description (definisi tetap strict, tapi ops perlu tahu).

- [ ] **Step 0: Cek distribusi customers.status di prod cPanel**

```bash
ssh -i ~/.ssh/access-jabnet-cpanel jabnet@103.194.47.165 \
  "mysql -u jabnet_crm_user -p'Galon@12345' jabnet_fiber -e \"SELECT status, COUNT(*) FROM customers GROUP BY status ORDER BY 2 DESC;\""
```

Expected output (rough): mayoritas `active`, possibly minoritas `terminated` / `inactive` / `installing`. Catat hasilnya untuk PR description nanti. Tidak ada code change di step ini.

---

## Task 1: Extend Backend Query

**Files:**
- Modify: `server/storage.ts:2903-2949`

- [ ] **Step 1.1: Ubah SELECT clause + mapping di `listAllReferralsAdmin`**

Buka `server/storage.ts` di sekitar line 2903. Edit method `listAllReferralsAdmin` — ganti seluruh body method dengan versi di bawah (perubahan: tambah 2 kolom di SELECT, 1 computed CASE, 3 mapping field):

```ts
  async listAllReferralsAdmin(filter?: { status?: string; limit?: number; includeDeleted?: boolean }): Promise<any[]> {
    const mitraId = getMitraId();
    const limit = filter?.limit ?? 200;
    const includeDeleted = filter?.includeDeleted ? 1 : 0;
    const whereClause = filter?.status
      ? sql`WHERE r.mitra_id = ${mitraId} AND r.status = ${filter.status} AND (r.deleted_at IS NULL OR ${includeDeleted} = 1)`
      : sql`WHERE r.mitra_id = ${mitraId} AND (r.deleted_at IS NULL OR ${includeDeleted} = 1)`;
    const rows: any = ((await this.db.execute(sql`
      SELECT
        r.id, r.referrer_customer_id AS referrerCustomerId,
        r.referral_code AS referralCode,
        r.referee_phone AS refereePhone,
        r.referee_name AS refereeName,
        r.referee_customer_id AS refereeCustomerId,
        r.status,
        r.first_payment_at AS firstPaymentAt,
        r.reward_credited_at AS rewardCreditedAt,
        r.created_at AS createdAt, r.notes,
        r.deleted_at AS deletedAt,
        referrer.name AS referrerName, referrer.customer_id AS referrerBillingId,
        referee.name AS refereeCustomerName, referee.customer_id AS refereeBillingId,
        referee.is_isolir AS refereeIsIsolir,
        referee.status AS refereeCustomerStatusRaw,
        CASE
          WHEN r.referee_customer_id IS NULL THEN 'belum_daftar'
          WHEN referee.id IS NULL THEN 'non_aktif'
          WHEN COALESCE(referee.is_isolir, 0) = 0
               AND COALESCE(referee.status, 'active') = 'active' THEN 'aktif'
          ELSE 'non_aktif'
        END AS refereeStatus
      FROM customer_referrals r
      LEFT JOIN customers referrer ON referrer.id = r.referrer_customer_id AND referrer.mitra_id = ${mitraId}
      LEFT JOIN customers referee ON referee.id = r.referee_customer_id AND referee.mitra_id = ${mitraId}
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `))[0] as any);
    return (rows ?? []).map((r: any) => ({
      id: Number(r.id),
      referrerCustomerId: Number(r.referrerCustomerId),
      referrerName: r.referrerName ?? "—",
      referrerBillingId: r.referrerBillingId ?? null,
      referralCode: String(r.referralCode),
      refereePhone: r.refereePhone ?? null,
      refereeName: r.refereeName ?? null,
      refereeCustomerId: r.refereeCustomerId != null ? Number(r.refereeCustomerId) : null,
      refereeCustomerName: r.refereeCustomerName ?? null,
      refereeBillingId: r.refereeBillingId ?? null,
      refereeIsIsolir: Number(r.refereeIsIsolir ?? 0) === 1,
      refereeCustomerStatusRaw: r.refereeCustomerStatusRaw ?? null,
      refereeStatus: String(r.refereeStatus) as "belum_daftar" | "aktif" | "non_aktif",
      status: String(r.status),
      firstPaymentAt: r.firstPaymentAt ?? null,
      rewardCreditedAt: r.rewardCreditedAt ?? null,
      createdAt: String(r.createdAt),
      notes: r.notes ?? null,
      deletedAt: r.deletedAt ?? null,
    }));
  }
```

- [ ] **Step 1.2: Type-check backend**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors. Jika ada error, kemungkinan typo di SQL atau Drizzle `sql\`\`` interpolation. Re-baca diff dan fix.

- [ ] **Step 1.3: Smoke test endpoint via curl (dev server)**

Jalankan dev server kalau belum:
```bash
npm run dev
```

Di terminal lain, login dapatkan token:
```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234"}' | jq -r '.data.token')
echo "Token: $TOKEN"
```

Kalau password admin di local berbeda, ganti `Admin@1234`. Lalu cek response:
```bash
curl -s "http://localhost:5000/api/loyalty/admin/referrals?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[0] | {id, refereeName, refereeStatus, refereeIsIsolir, refereeCustomerStatusRaw}'
```

Expected: response object contains `refereeStatus` field dengan value salah satu dari `"belum_daftar"`, `"aktif"`, `"non_aktif"`. `refereeIsIsolir` boolean. `refereeCustomerStatusRaw` string atau null.

Kalau response tidak ada field tersebut → re-check Step 1.1 (mungkin typo di mapping).

- [ ] **Step 1.4: Verifikasi distribusi grup di local DB**

```bash
curl -s "http://localhost:5000/api/loyalty/admin/referrals?limit=500" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '[.data[] | .refereeStatus] | group_by(.) | map({status: .[0], count: length})'
```

Expected: array dengan 1-3 grup, total = jumlah referral. Σ count = total rows.

- [ ] **Step 1.5: Commit**

```bash
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): backend compute refereeStatus di listAllReferralsAdmin

Tambah computed field refereeStatus (belum_daftar/aktif/non_aktif) +
raw flags (refereeIsIsolir, refereeCustomerStatusRaw) via JOIN ke
customers.is_isolir + customers.status. Orphan FK guard via
'WHEN referee.id IS NULL THEN non_aktif'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend State & Filter Combinator

**Files:**
- Modify: `client/pages/LoyaltyAdminPage.tsx:1433-1473` (start of `ReferralsTable` component + state declarations + filter useMemo)

- [ ] **Step 2.1: Tambah state baru untuk customer status filter**

Di `ReferralsTable` component, cari blok state declarations (sekitar line 1437):

```ts
  const [statusFilter, setStatusFilter] = useState<string>("all");
```

Tepat di bawah baris itu, **tambah state baru**:

```ts
  const [customerStatusFilter, setCustomerStatusFilter] = useState<"all" | "belum_daftar" | "aktif" | "non_aktif">("all");
```

- [ ] **Step 2.2: Update filter combinator**

Cari `useMemo` untuk `filtered` di sekitar line 1470. **Ganti** dari:

```ts
  const filtered = useMemo(() => {
    if (statusFilter === "all") return referrals;
    return referrals.filter((r: any) => r.status === statusFilter);
  }, [referrals, statusFilter]);
```

menjadi:

```ts
  const filtered = useMemo(() => {
    let rows = referrals;
    if (customerStatusFilter !== "all") {
      rows = rows.filter((r: any) => r.refereeStatus === customerStatusFilter);
    }
    if (statusFilter !== "all") {
      rows = rows.filter((r: any) => r.status === statusFilter);
    }
    return rows;
  }, [referrals, customerStatusFilter, statusFilter]);
```

- [ ] **Step 2.3: Type-check**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors. (Tidak ada step commit di sini — gabung dengan Task 3 karena UI belum complete.)

---

## Task 3: Frontend Filter Bar Refactor — Primary Segmented Control + Secondary Dropdown

**Files:**
- Modify: `client/pages/LoyaltyAdminPage.tsx:1531-1571` (filter bar JSX)

Locate filter bar JSX di sekitar line 1531 — block yang mulai dengan `{/* Filter bar + Manual create CTA */}`.

- [ ] **Step 3.1: Cek imports `Select` component**

Pastikan `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` sudah di-import di top file. Cek di area imports (sekitar line 1-30):

```bash
grep -n "from \"@/components/ui/select\"" client/pages/LoyaltyAdminPage.tsx
```

Kalau **tidak ada** import-nya, tambah di area imports shadcn-ui:

```ts
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

- [ ] **Step 3.2: Ganti filter bar JSX**

Cari block ini di sekitar line 1533:

```tsx
      {/* Filter bar + Manual create CTA */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit overflow-x-auto">
          {(["all", "invited", "registered", "rewarded", "expired"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                statusFilter === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "Semua" : REFERRAL_STATUS_LABELS[s] ?? s}
              <span className="ml-1 opacity-60 font-normal">({s === "all" ? referrals.length : referrals.filter((r: any) => r.status === s).length})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              checked={!!showDeleted}
              onCheckedChange={onShowDeletedChange}
              id="show-deleted-referrals"
            />
            <label
              htmlFor="show-deleted-referrals"
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              Tampilkan terhapus
            </label>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setManualDialog(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Catat Referral
            </Button>
          )}
        </div>
      </div>
```

**Ganti dengan** (2 rows: primary segmented control by customer status, secondary row dengan dropdown referral status + switch + button):

```tsx
      {/* Primary filter — Status Pelanggan (segmented control) */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit overflow-x-auto no-scrollbar">
        {([
          { key: "all",          label: "Semua" },
          { key: "belum_daftar", label: "Belum daftar" },
          { key: "aktif",        label: "Aktif" },
          { key: "non_aktif",    label: "Non-aktif" },
        ] as const).map((opt) => {
          const count = opt.key === "all"
            ? referrals.length
            : referrals.filter((r: any) => r.refereeStatus === opt.key).length;
          return (
            <button
              key={opt.key}
              onClick={() => setCustomerStatusFilter(opt.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all whitespace-nowrap ${
                customerStatusFilter === opt.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
              <span className="ml-1 opacity-60 font-normal">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Secondary filter row — Status Referral dropdown + toggle + CTA */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground select-none">Status Referral:</label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua ({referrals.length})</SelectItem>
              {(["invited", "registered", "rewarded", "expired"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {REFERRAL_STATUS_LABELS[s] ?? s} ({referrals.filter((r: any) => r.status === s).length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              checked={!!showDeleted}
              onCheckedChange={onShowDeletedChange}
              id="show-deleted-referrals"
            />
            <label
              htmlFor="show-deleted-referrals"
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              Tampilkan terhapus
            </label>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setManualDialog(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Catat Referral
            </Button>
          )}
        </div>
      </div>
```

- [ ] **Step 3.3: Type-check**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 3.4: Smoke test di browser (dev)**

Login admin → buka `/loyalty` → tab Referral. Cek:
- Primary segmented control muncul dengan 4 pill (Semua / Belum daftar / Aktif / Non-aktif) — count di tiap pill
- Klik tiap pill → tabel ke-filter (mungkin masih tampak kolom Status Pelanggan belum ada, OK — itu Task 4)
- Dropdown "Status Referral" muncul di row bawah dengan 5 opsi (Semua + 4 status)
- Combine: pilih "Aktif" di segmented + "Reward" di dropdown → tabel makin ter-filter
- Toggle "Tampilkan terhapus" + button "Catat Referral" tetap berfungsi

Tidak ada commit di step ini — gabung dengan Task 4.

---

## Task 4: Tambah Kolom "Status Pelanggan" di Tabel

**Files:**
- Modify: `client/pages/LoyaltyAdminPage.tsx:1593-1602` (table headers) + `1605-1700` (table rows)

- [ ] **Step 4.1: Cek imports — `UserPlus`, `Tooltip` (kalau dipakai)**

```bash
grep -n "UserPlus\|Tooltip" client/pages/LoyaltyAdminPage.tsx | head -5
```

Pastikan `UserPlus` ter-import dari `lucide-react`. Kalau belum, tambah di import lucide existing:

```ts
import { ..., UserPlus } from "lucide-react";
```

(Untuk minimum churn, **skip tooltip** di iterasi ini — pakai label inline saja.)

- [ ] **Step 4.2: Tambah header kolom baru**

Cari `<thead>` di sekitar line 1593:

```tsx
              <thead className="bg-muted/40 text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Pengundang</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Kode Sahabat</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Tetangga Diundang</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Tanggal</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Terdaftar?</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Aksi</th>
                </tr>
              </thead>
```

Tambah `<th>` baru **setelah "Tetangga Diundang"** dan **sebelum "Status"**:

```tsx
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Status Pelanggan</th>
```

Hasil akhir:

```tsx
              <thead className="bg-muted/40 text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Pengundang</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Kode Sahabat</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Tetangga Diundang</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Status Pelanggan</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Tanggal</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Terdaftar?</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Aksi</th>
                </tr>
              </thead>
```

- [ ] **Step 4.3: Tambah cell baru di row**

Cari `<tbody>` block di sekitar line 1604. Setiap row punya cell `<td>` untuk Pengundang, Kode Sahabat, Tetangga Diundang, lalu Status, dst.

Cari `<td>` untuk "Tetangga Diundang" yang biasanya berisi `r.refereeName`:

```tsx
                      <td className="py-3 px-4">
                        <div className="text-sm font-medium">{r.refereeName ?? "—"}</div>
                        {r.refereePhone && <div className="text-[10px] text-muted-foreground font-mono">{r.refereePhone}</div>}
                      </td>
```

Tepat **setelah block tersebut** (sebelum cell Status lifecycle), tambah cell baru:

```tsx
                      <td className="py-3 px-4">
                        {r.refereeStatus === "belum_daftar" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <UserPlus className="h-3 w-3" />
                            Belum daftar
                          </span>
                        )}
                        {r.refereeStatus === "aktif" && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Aktif
                            </span>
                            {r.refereeCustomerName && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">
                                {r.refereeCustomerName}
                                {r.refereeBillingId && <span className="font-mono ml-1">#{r.refereeBillingId}</span>}
                              </div>
                            )}
                          </div>
                        )}
                        {r.refereeStatus === "non_aktif" && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              Non-aktif
                            </span>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {r.refereeIsIsolir
                                ? "Isolir"
                                : r.refereeCustomerStatusRaw && r.refereeCustomerStatusRaw !== "active"
                                  ? r.refereeCustomerStatusRaw
                                  : "—"}
                            </div>
                          </div>
                        )}
                      </td>
```

- [ ] **Step 4.4: Type-check + build**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors.

```bash
npm run build 2>&1 | tail -10
```

Expected: build sukses (esbuild bundle + Vite client build).

- [ ] **Step 4.5: Smoke test di browser**

Dev server jalan? Refresh `/loyalty` tab Referral.

Verifikasi:
- Kolom "Status Pelanggan" muncul di header tabel, posisi setelah "Tetangga Diundang"
- Setiap row tampilkan badge sesuai grup:
  - **Belum daftar**: badge slate dengan icon UserPlus
  - **Aktif**: badge emerald + dot pulse + sub-info nama customer + `#billingId`
  - **Non-aktif**: badge rose + sub-info "Isolir" atau status raw
- Filter primary "Aktif" → semua row punya badge emerald
- Filter primary "Non-aktif" → semua row punya badge rose
- Filter primary "Belum daftar" → semua row punya badge slate (no customer name)

Test edge case manual — pilih 1 customer di DB local, set `is_isolir=1`:
```bash
mysql -u root jabnet_fiber -e "UPDATE customers SET is_isolir = 1 WHERE id = (SELECT referee_customer_id FROM customer_referrals WHERE referee_customer_id IS NOT NULL LIMIT 1);"
```
Refresh page → customer terkait pindah ke grup "Non-aktif" dengan label "Isolir". Revert:
```bash
mysql -u root jabnet_fiber -e "UPDATE customers SET is_isolir = 0 WHERE is_isolir = 1;"
```

- [ ] **Step 4.6: Commit**

```bash
git add client/pages/LoyaltyAdminPage.tsx
git commit -m "$(cat <<'EOF'
feat(loyalty): filter Status Pelanggan + kolom badge di tab Referral

Tambah primary segmented control 4-grup (Semua/Belum daftar/Aktif/
Non-aktif) di atas filter status referral existing (di-demote ke
dropdown Select). Tambah kolom 'Status Pelanggan' di tabel referral
dengan badge berwarna + sub-info nama customer (aktif) atau alasan
non-aktif (Isolir/status raw).

Filter primary AND secondary AND showDeleted = compound filter
client-side. Count badge per pill dihitung dari unfiltered referrals
supaya stabil.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Empty State per Grup (opsional polish)

**Files:**
- Modify: `client/pages/LoyaltyAdminPage.tsx:1573-1588` (empty state block)

Tujuan: ganti pesan empty state generik ("Belum ada referral") jadi context-aware sesuai filter grup yang aktif.

- [ ] **Step 5.1: Edit empty state block**

Cari block ini di sekitar line 1573:

```tsx
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <div className="font-semibold text-sm">Belum ada referral</div>
            <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Referral akan muncul dari dua jalur: otomatis saat pelanggan share kode Sahabat ke tetangga,
              atau manual kalau admin catat referral dari obrolan offline.
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => setManualDialog(true)} className="mt-4 gap-1.5">
                <Plus className="h-4 w-4" /> Catat Referral Offline
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
```

Ganti dengan versi yang context-aware:

```tsx
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <div className="font-semibold text-sm">
              {customerStatusFilter === "belum_daftar" && "Semua referee sudah jadi pelanggan"}
              {customerStatusFilter === "aktif" && "Belum ada referee yang aktif sebagai pelanggan"}
              {customerStatusFilter === "non_aktif" && "Tidak ada referee yang isolir/terminated"}
              {customerStatusFilter === "all" && "Belum ada referral"}
            </div>
            <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              {customerStatusFilter === "all"
                ? "Referral akan muncul dari dua jalur: otomatis saat pelanggan share kode Sahabat ke tetangga, atau manual kalau admin catat referral dari obrolan offline."
                : "Coba ubah filter status di atas atau toggle 'Tampilkan terhapus' kalau perlu lihat data yang sudah dihapus."}
            </div>
            {canEdit && customerStatusFilter === "all" && (
              <Button size="sm" onClick={() => setManualDialog(true)} className="mt-4 gap-1.5">
                <Plus className="h-4 w-4" /> Catat Referral Offline
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
```

- [ ] **Step 5.2: Type-check + smoke test**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: 0 errors.

Smoke test: di browser, klik tiap pill yang counts-nya 0 (kalau ada) → pastikan pesan muncul sesuai grup.

- [ ] **Step 5.3: Commit**

```bash
git add client/pages/LoyaltyAdminPage.tsx
git commit -m "$(cat <<'EOF'
polish(loyalty): empty state context-aware per filter grup referral

Tiap grup (Belum daftar / Aktif / Non-aktif) punya pesan empty state
sendiri. Catat Referral CTA hanya muncul di grup 'Semua' (tidak
relevan di grup spesifik).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Full Verification & Edge Cases

- [ ] **Step 6.1: Edge case orphan FK**

Di DB local (atau staging), buat referral dengan `refereeCustomerId` yang menunjuk ke customer tidak ada:

```bash
mysql -u root jabnet_fiber <<'SQL'
SELECT id, referee_customer_id FROM customer_referrals WHERE referee_customer_id IS NOT NULL LIMIT 1;
SQL
# Catat <id> dan <real_customer_id>. Lalu break FK sementara:
mysql -u root jabnet_fiber -e "UPDATE customer_referrals SET referee_customer_id = 99999999 WHERE id = <id>;"
```

Refresh `/loyalty` → row terkait masuk grup **Non-aktif** (bukan Aktif, bukan Belum daftar).

Revert:
```bash
mysql -u root jabnet_fiber -e "UPDATE customer_referrals SET referee_customer_id = <real_customer_id> WHERE id = <id>;"
```

- [ ] **Step 6.2: Edge case soft-deleted referral**

Toggle "Tampilkan terhapus" → ON.
- Soft-deleted rows muncul dengan opacity 50% + strikethrough (perilaku existing)
- Tetap ter-filter oleh segmented primary
- Count badge segmented control **tidak berubah** saat toggle on/off (intended — count dihitung dari `referrals` yang sudah include deleted ones via API param)

Catatan: ini benar — `referrals` data dari API sudah include deleted saat toggle on, dan count badge dihitung dari `referrals.length`. Count akan **berubah** saat toggle on/off — itu intended behavior (total bertambah karena include deleted).

- [ ] **Step 6.3: Mobile (375px viewport)**

DevTools → Toggle device toolbar → set width 375px (iPhone SE) → buka `/loyalty` tab Referral.

Verifikasi:
- Segmented control scroll horizontal smooth (4 pill mungkin tidak muat semua → swipe horizontal works via `overflow-x-auto`)
- Dropdown "Status Referral" wrap ke bawah segmented control kalau perlu
- Tabel scroll horizontal — kolom "Status Pelanggan" tetap readable

- [ ] **Step 6.4: Performance sanity check**

Di browser DevTools → Network tab → buka tab Referral → klik request `GET /api/loyalty/admin/referrals?limit=200`.

Expected: response time <200ms local. Kalau >500ms, ada masalah JOIN — investigate.

- [ ] **Step 6.5: Final build + type-check**

```bash
npx tsc --noEmit 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

Expected: 0 errors, build sukses, esbuild output ≈ 1MB.

---

## Task 7: PR & Deploy

- [ ] **Step 7.1: Push & buat PR (atau langsung deploy via main)**

User pattern di JABNET = direct commit ke `main` (tidak biasa pakai PR untuk internal feature). Default: push langsung.

```bash
git log --oneline -5
git push origin main
```

- [ ] **Step 7.2: Verify GHA build**

```bash
gh run list --limit 3
# Tunggu workflow build sukses (≈2-3 min)
```

- [ ] **Step 7.3: Deploy ke cPanel (user trigger)**

User wajib trigger manual (per CLAUDE.md rule "NEVER deploy tanpa user explicit OK"):
1. Login cPanel `https://103.194.47.165:2083`
2. Git Version Control → repo ftth-tools → **Update from Remote**
3. Setup Node.js App → **Restart**

Konfirmasi ke user setelah deploy:
```bash
curl https://workspace.jabnet.id/api/health
# Expected: {"ok":true,...}
```

- [ ] **Step 7.4: Post-deploy smoke test prod**

Login `https://workspace.jabnet.id` → `/loyalty` tab Referral.

Verifikasi singkat:
- Segmented control 4 pill muncul
- Count distribusi masuk akal (mayoritas Aktif kalau prod sehat)
- Tidak ada error di console browser

---

## Self-Review Notes

- **Spec coverage**: ✓ Aturan kategori, backend SQL CASE, frontend filter primary+secondary, kolom badge, empty state, edge case orphan FK — semua tertutup.
- **Placeholder scan**: tidak ada TBD / TODO / "implement later" / "appropriate error handling" — semua step punya kode konkret.
- **Type consistency**: `refereeStatus` type union sama persis antara backend mapping (`Step 1.1`), frontend state (`Step 2.1`), filter check (`Step 2.2`), badge rendering (`Step 4.3`). `refereeIsIsolir` boolean → frontend conditional check. `refereeCustomerStatusRaw` string|null.
- **Import check**: `Select` family (Task 3.1), `UserPlus` icon (Task 4.1) — explicit grep step untuk memastikan tersedia sebelum dipakai.
- **Rollback**: tiap task 1 commit; revert per commit kalau diperlukan. Schema tidak berubah, jadi rollback aman.
