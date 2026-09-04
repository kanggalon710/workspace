# STATE - JABNET Workspace
Updated: 2026-09-04 by claude-opus-5 (Claude Code)

## What this is
Platform operasional ISP fiber-to-the-home (PT Arkanova Cipta Inovasi / JABNET Garut).
Node 20 + Express 5 + Drizzle (MySQL) di belakang, React 18 + Vite 5 + Tailwind + shadcn/ui
di depan. Multi-tenant (mitra), 51+ halaman, navigasi berbasis divisi. Rincian arsitektur,
pola MySQL/Drizzle, dan design system ada di `CLAUDE.md` - baca itu sebelum menyentuh kode.

## Run and verify
```
npm run dev          # tsx watch + Vite middleware (lihat LOCAL-DEV.md untuk Docker MySQL)
npm run typecheck    # wajib 0 error
npx tsx --test shared/*.test.ts server/*.test.ts   # 449 test
npm run build        # dist/public + dist/index.mjs
```
Deploy: push -> GHA build -> cPanel `Git Version Control > Update from Remote` -> Restart Node App.
JANGAN deploy ke produksi tanpa OK eksplisit user.

## Produksi (penting, sempat membingungkan)
`https://workspace.jabnet.id` dilayani Passenger app **`~/repositories/workspace-main`**
dengan env `~/private/workspace-main/config/.env` dan DB **`jabnet_workspace_main`**.
Direktori `~/repositories/fiber-jabnet` + DB `jabnet_fiber` sudah TIDAK dijalankan
(tak ada di `~/nodevenv`, tak ada prosesnya) - env-nya masih ada dan menyesatkan.
SSH: `ssh jabnet@103.194.47.165`; MySQL: `mysql -u jabnet_workspace -p <pw di env> jabnet_workspace_main`.

## Works
- Build, typecheck, dan 449 unit test hijau di dev per 2026-09-04.
- Billing sync manual ("Sync Sekarang") berjalan di produksi - 799 pelanggan, 0 error.
- Fitur v5.x (Teamspace, divisi, HR/SDM, collection SOP) terdeploy; bundle produksi 28 Agu.
- **Auto-sync billing AKTIF sejak 2026-09-04 07:28 GMT.** `WORKERS_ENABLED=true` +
  `BILLING_SYNC_ENABLED=true` (+ `CHATWOOT_CONTACT_SYNC_ENABLED=false` eksplisit) di
  `~/private/workspace-main/config/.env`; app di-restart; `/api/billing/sync/status`
  mengembalikan `state:"idle"` (bukti `start()` jalan - sebelumnya "stopped"),
  `nextRunAt 2026-09-04T19:00:00Z`. Cadangan env: `.env.bak-20260904`.
- Cron keep-alive `*/4 * * * * curl .../api/health` DITAMBAHKAN 2026-09-04 (sebelumnya
  hilang, padahal CLAUDE.md gotcha #12 mengasumsikan ada). Cadangan crontab lama:
  `~/cron-backup-20260904.txt`.

## In progress
Tidak ada pekerjaan setengah jalan. Perubahan terakhir (fix pengumuman tim + status sync)
sudah selesai di dev dan belum di-deploy.

## Blocked, needs a human
- Fix pengumuman tim (4 perubahan kode) BELUM di-deploy - masih staged di dev. Butuh
  keputusan user untuk commit + push + Update from Remote + Restart.
- Perubahan UI status sync belum dicek di browser (butuh deploy atau DB lokal jalan).

## Traps
0. **Jam server = GMT, bukan WIB.** Node mewarisi TZ sistem, dan tidak ada `TZ=` di env app.
   Jadi `billing_sync_nightly_hour` dibaca sebagai jam GMT: di-set **19** supaya jatuh
   02:00 WIB. Kalau nanti TZ server/app diubah, angka ini WAJIB disesuaikan atau sync
   pindah ke jam sibuk.
1. `server/index.ts:21-26` - `flag()` mengembalikan `defaultVal && workersGloballyEnabled`.
   `WORKERS_ENABLED=false` mematikan SEMUA worker apa pun isi flag per-worker.
2. Tombol "Sync Sekarang" memanggil `billingSyncWorker.triggerManual()` LANGSUNG (routes.ts:4571),
   tidak lewat gate env. Jadi "sync terakhir" bisa terlihat segar walau auto-sync mati total.
3. `storage.getSetting/setSetting` (storage.ts:14204) GLOBAL, bukan per-mitra; `getMitraSetting`
   yang ter-scope tenant. Worker billing memakai yang global untuk observability-nya.
4. Route yang memanggil storage dengan `as any` menyembunyikan field yang di-drop diam-diam -
   itulah penyebab bug `teamId` pengumuman. Hindari `as any` di call storage.
5. `listAnnouncements()` adalah raw SQL: kolom baru di `shared/schema.ts` TIDAK otomatis ikut,
   harus ditambah manual ke SELECT-nya.

## Recently touched
server/storage.ts, server/routes.ts, server/billing-sync-worker.ts,
client/pages/IntegrationPage.tsx - semua oleh claude-opus-5 (Claude Code), 2026-09-04.
