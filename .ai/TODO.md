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
- [x] **#2 (inti) `formatRupiah`** - `shared/currency.ts` (+test, 3) menggantikan 8 formatter
  `fmtRp`/`formatRp` inline via delegasi. (2026-08-12)
- [x] **#3 (inti) `<ScrollRow>`** - primitif `ui/scroll-row.tsx` + adopsi di TeamReportPanel
  & AllTasksPage. (2026-08-12)
- [x] **#6 A11y sweep** - 26 tombol ikon diberi `aria-label`; 3 `<img>` diberi `alt`;
  Dashboard alert-row + Phonebook dropzone keyboard-operable; MitraPage/UsersPage row
  `role=button`+keyboard. (2026-08-12)
- [x] **Normalisasi shadow (sebagian):** local `StatusBadge` (CustomersPage, IntegrationPage)
  + `EmptyState` (PortalDashboard) dipindah ke komponen `ui/`. (2026-08-12)

## Prioritas berikutnya (aman, mekanis dulu)
- [ ] **#2 sisa - shadow `StatTile`/`KpiCard` DITAHAN:** LoyaltyAdmin (`KpiCard`,
  filter-tab `StatTile`), TicketsDashboard (`KpiCard`), BugReports (`StatTile`) TIDAK
  dipindah karena punya fitur yang belum ada di `ui/StatTile` (nilai berwarna, pulse
  `urgent`, tab-filter aktif+dot). Butuh ekstensi `ui/StatTile` dulu (lihat DECISIONS).
- [x] **#3 SELESAI - adopsi `<ScrollRow>`:** 8 site pill/chip. SUDAH: TeamReportPanel,
  AllTasksPage, ContactsPage x2, BusinessDecisionPage, LeadPipelinePage, CardDetailModal
  (chip Pindah Stage), BroadcastTargetPage (status tabs). className diteruskan (zero visual).
  Sisa 14 pemakaian idiom `overflow-x-auto no-scrollbar` di codebase SENGAJA tidak dikonversi:
  tab-bar underline (Mitra/Users drawer, TeamModuleNav, SdmPage, SplitterChain, PointConfig),
  segmented `bg-muted/50` (MpwaPage, ReferralsTable), toolbar (PipelineBoard), grid responsif
  (MetricsStrip), gallery snap-x (AssetPhotosGallery), wrapper tabel (BugReports, Announcements,
  TicketCategories) - bukan target ScrollRow.
- [ ] **#4 Adopsi `dialogSize.ts`** - `w-[calc(100vw-2rem)]` masih hardcoded di **39 file**.
  CATATAN: bukan drop-in - `dialogSizeClass("normal")` mengubah lebar mobile (`100vw-1rem`)
  + memaksa preset `max-w`; perlu penilaian per-dialog (normalisasi visual, bukan zero-change).
- [ ] **#5 Adopsi `<StatTile>` (20+ page) & `<EmptyState>` (sisa ~42 page)** - penggantian
  mekanis markup manual. Portal `EmptyState` sudah (ronde ini). Bukan drop-in murni - butuh
  remap prop + terima pergeseran visual kecil.

## Aksesibilitas & semantik (kecil, tertarget)
- [x] **#6 A11y sweep** - SELESAI (2026-08-12): 26 `aria-label`, 3 `alt`, 2 `div`->`button`,
  2 row `role=button`+keyboard. (Audit awal "21/12" terkoreksi jadi 26/3 setelah cek ulang.)

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
- [x] **#9 LoyaltyAdminPage SELESAI** (2026-08-12): 3610 -> 558 baris. 7 file sibling di
  `client/pages/loyalty/` (shared, tiles [KpiCard/TierCard/StatTile], SummaryTab, DiscountRow,
  LeaderboardTable, ReferralsTable, PointRedemptionsTab, PointConfigDialog [+Mikrotik]). Kode
  komponen byte-identik (hanya import + `export`), import di-prune ke yang terpakai saja.
- [x] **CustomersPage SELESAI** (2026-08-12): 2623 -> 1455 baris. 7 file di
  `client/pages/customers/` (shared, CustomerForm, CustomerStatusBadge, DistrictCard,
  CustomerLocalEditForm, IntegrationAuditDialog, CustomerCommunication). Dead code `SyncModal`
  (~99 baris, 0 referensi) dihapus. Sisa: ganti `<table>` mentah -> `<DataTable>` +
  ekstrak 3 dialog inline (butuh prop-threading) = follow-up terpisah.
- [x] **IntegrationPage SELESAI** (2026-08-13): 3032 -> 2290 baris. 2 file di
  `client/pages/integration/` (shared [tipe + 7 komponen daun + data + getSettingValue],
  OmnichannelIntegrationCard [card Chatwoot mandiri]). Card berstate (`allSettings` dibaca
  banyak card) DITAHAN di main - ekstraksi butuh prop/context threading (risiko regresi).
  Semua target split file besar frontend (#9) SELESAI.

## Terpisah - RISIKO TINGGI (butuh rencana + persetujuan sendiri)
- [ ] **#10 Pecah `server/routes.ts` (16.972) & `server/storage.ts` (16.045)** jadi
  modul per-domain. JANGAN dikerjakan di dalam sweep umum. App LIVE - butuh strategi
  bertahap, test, dan approval eksplisit.
