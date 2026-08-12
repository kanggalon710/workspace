# TODO / Backlog - Optimasi Codebase

> Roadmap optimasi ber-prioritas. Tiap item mencantumkan **angka hasil audit**
> (grep-verified 2026-08-12) supaya ronde berikutnya langsung ke sasaran. Kerjakan
> per item, verifikasi hijau (typecheck + test + build), lalu update file ini +
> `PROGRESS.md`. **Tanpa memecah stabilitas/fitur** (app LIVE di produksi).

## Selesai
- [x] **#1 `<FullBleedPage>`** - ekstrak scaffold full-bleed yang identik di 6 file
  (Users, Roles, Mitra, Announcements, BugReports, PublicApi). Zero visual change.
  (2026-08-12)
- [x] `AGENTS.md` + folder `.ai/` (standar wajib-baca untuk semua AI agent).

## Prioritas berikutnya (aman, mekanis dulu)
- [ ] **#2 Helper `formatRupiah`** di `client/lib/utils.ts`; ganti `fmtRp` inline
  (LoyaltyAdminPage:99 + lainnya). Hapus deklarasi lokal `StatusBadge`/`StatTile` yang
  membayangi versi `ui/` di CustomersPage, IntegrationPage, LoyaltyAdminPage (3 page).
- [ ] **#3 `<FilterPillBar>` / scroll-row** - idiom `overflow-x-auto no-scrollbar
  -mx-4 md:mx-0 px-4 md:px-0` di **15 page** (5 di antaranya string identik). Ekstrak
  jadi satu komponen presentational.
- [ ] **#4 Adopsi `dialogSize.ts`** - `w-[calc(100vw-2rem)]` masih hardcoded di
  **39 file** padahal `client/lib/dialogSize.ts` (`dialogSizeClass`) sudah ada.
  Cluster terparah: `components/pipelines/*` (8 dialog), `components/teamspace/*` (5).
- [ ] **#5 Adopsi `<StatTile>` (20+ page) & `<EmptyState>` (43 page)** - penggantian
  mekanis markup manual dengan komponen yang sudah terbukti. Rendah risiko.

## Aksesibilitas & semantik (kecil, tertarget)
- [ ] **#6 A11y sweep:** `aria-label` untuk 21 tombol `size="icon"` tanpa label
  (terparah CustomersPage: 8); `alt` untuk 12 `<img>` tanpa alt; ganti `<div onClick>`
  page-level (ContactsPage, MitraPage, Dashboard, UsersPage, whatsapp/PhonebookPage)
  jadi `<button>`. (Backdrop BottomSheet boleh tetap.)

## Warna token (besar, worst-first)
- [ ] **#7 Migrasi warna hardcoded ke token.** 205 inline `style={{…#hex}}`, 93 arbitrary
  hex, ~602 kelas palet mentah. Urutan: `TechnicianWorkPage.tsx` (108 inline hex) ->
  `components/map/MapInfoWindow.tsx` (23) -> `TicketCategoriesPage.tsx` (50 arbitrary) ->
  `CanvassingHistoryPage.tsx` (32). Sekaligus ganti `bg-slate-50/40` di `FullBleedPage`
  jadi token (`bg-muted`) di satu tempat.

## Mobile-first
- [ ] **#8** 12 pemakaian `max-*:` di 4 komponen map-overlay
  (`MapCameraControls`, `MapLayerPanel`, `MapTypeSelector`, `MapMitraSelector`) -> ubah
  ke pola min-width. Juga 2 media query `max-width` di `client/index.css:493,516`.

## Pecah file raksasa (ekstraksi seam bebas-logika, termudah dulu)
- [ ] **#9 LoyaltyAdminPage** (3609) - termudah: ~10-11 dari ~15 deklarasi pindah ke
  sibling (SummaryTab, PointRedemptionsTab, LeaderboardTable, ReferralsTable,
  PointConfigDialog, MikrotikBoostConfigPanel, KpiCard/TierCard/DiscountRow).
- [ ] **CustomersPage** (2620) - medium: SyncModal, IntegrationAuditDialog, CustomerForm,
  CustomerLocalEditForm, DistrictCard, CustomerCommunication; ganti `<table>` mentah ->
  `<DataTable>`; hapus StatusBadge lokal.
- [ ] **IntegrationPage** (3050) - tersulit (state `allSettings` dibaca semua card);
  ekstrak tiap card `<h3>` (GenieACS, BillingSync, MPWA, Telegram, MetaCAPI, dll) +
  7 helper badge/toggle/snippet.

## Terpisah - RISIKO TINGGI (butuh rencana + persetujuan sendiri)
- [ ] **#10 Pecah `server/routes.ts` (16.972) & `server/storage.ts` (16.045)** jadi
  modul per-domain. JANGAN dikerjakan di dalam sweep umum. App LIVE - butuh strategi
  bertahap, test, dan approval eksplisit.
