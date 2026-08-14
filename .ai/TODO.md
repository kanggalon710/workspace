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
- [x] **#4 SELESAI (via `.dialog-w`, bukan `dialogSize.ts`)** (2026-08-13): 51 token
  `w-[calc(100vw-2rem)]` di 42 file -> utilitas CSS `.dialog-w` (`w-[calc(100vw-1rem)]
  sm:w-[calc(100vw-2rem)]`) di `index.css`. Tiap dialog tetap pegang `max-w`/`max-h` sendiri
  (TIDAK pakai `dialogSizeClass()` yg mem-bake max-w -> akan regresi desktop; lihat DECISIONS).
  Efek: >=640px pixel-identik, <640px gutter mobile 2rem->1rem (opt-in). 2 cap `min(...)`
  (combobox, PipelinesPage) sengaja tak disentuh. `dialogSizeClass()`/toggle tetap utuh.
- [ ] **#5 Adopsi `<StatTile>` (20+ page) & `<EmptyState>` (sisa ~42 page)** - penggantian
  mekanis markup manual. Portal `EmptyState` sudah (ronde ini). Bukan drop-in murni - butuh
  remap prop + terima pergeseran visual kecil.

## Aksesibilitas & semantik (kecil, tertarget)
- [x] **#6 A11y sweep** - SELESAI (2026-08-12): 26 `aria-label`, 3 `alt`, 2 `div`->`button`,
  2 row `role=button`+keyboard. (Audit awal "21/12" terkoreksi jadi 26/3 setelah cek ulang.)

## Warna token (besar, worst-first) - #7 SEBAGIAN (strategi lihat DECISIONS 2026-08-13)
- [x] **#7a TicketCategoriesPage SELESAI** (2026-08-13): 158 warna (64 arbitrary + 94 palet)
  -> token semantik. Navy brand `#1e40af/#1e3a8a` -> `blue-800/900` (tak ada padanan semantik,
  zero shift). 2 hover-gelap kolaps -> `hover:brightness-95`. 0 arbitrary `[#hex]` tersisa.
- [x] **#7b BroadcastTargetPage SELESAI** (2026-08-13): 76 swap status+neutral->token (page
  TANPA `dark:` = aman). Kategorikal violet/sky/blue ditinggal.
- [x] **#7c PointRedemptionsTab SELESAI** (2026-08-13): page ber-`dark:` pertama via manual
  per-pola (hapus 45 dark: status/neutral + map 79 dasar tint-aware + 3 hover fix). Alat
  `collapse-darkmode.mjs`. Kategorikal sky/violet utuh.
- [x] **#7d PointsTab SELESAI** (2026-08-13): portal, manual per-pola (hapus 28 dark: + map 43).
- [x] **#7e Batch SELESAI** (2026-08-13): BugReportsPage, UsersPage, LeadPipelinePage, RolesPage
  (manual per-pola, 8 hover fix, kategorikal utuh). Alat `collapse-darkmode.mjs` diperbaiki
  (preserve opacity: `bg-rose-500/10`->`bg-destructive/10`, bukan solid).
- [x] **#7f Batch SELESAI** (2026-08-13): MpwaPage, GenieAcsDevicesPage, MonitoringPage,
  AuditLogPage, ProfilePage (manual per-pola, 9 hover fix, kategorikal utuh).
- [x] **#7g Batch 9 SELESAI** (2026-08-13): CoverageCheckPage, loyalty/SummaryTab,
  tickets/panels, loyalty/ReferralsTable, PublicApiPage, customers/IntegrationAuditDialog,
  portal/dashboard/{BillingTab,shared}, customers/CustomerForm. 3 hover fix.
- [x] **#7h Batch 8 SELESAI** (2026-08-13): AppUpdateCard, Customer360Panel, portal/TrafficTab,
  CapacityCalculatorModal, DevDbSyncCard, collection/CollectionDetail, portal/WifiTab,
  MikrotikRoutersPage. 3 hover fix.
- [x] **#7i Batch 4 SELESAI** (2026-08-14): SahabatDetailDrawer, map/CableDetailPanel,
  ActiveSessionsPage, UpdateBanner (status-bersih ber-`dark:`). 5 koreksi manual pasca-alat:
  progress gold `bg-yellow-300`->`bg-warning` (bukan /40 pudar), callout `bg-emerald-50/50`->
  `bg-success/10` (bukan /50 over-saturasi), dot rusak `gray-400`->`bg-muted-foreground` (bukan
  bg-muted nyaris tak terlihat), 2 hover kolaps -> `hover:brightness-95` / drop redundant.
  AnnouncementsPage SENGAJA dilewati: `CATEGORY_CFG`/`SEVERITY_CFG` = palet KATEGORIKAL
  (sky/emerald/indigo/amber/violet per kategori) - harus utuh, bukan status.
- [x] **#7j Batch 3 SELESAI** (2026-08-14): loyalty/DiscountRow, mitra/MitraCard,
  portal/dashboard/TicketsTab. 4 koreksi manual (dot slate-400->muted-foreground, hover fix,
  drop redundant hover:text). loyalty/tiles.tsx DILEWATI: peta aksen kategorikal (indigo).
- [ ] **#7 sisa (MANUAL, batch/ronde).** Scan ulang tiap ronde (`grep -rlE "dark:(text|bg|border)-
  (rose|red|amber|green|emerald)"` lalu cek `bg-white dark:` + kategorikal). Sisa a.l.: LoyaltyAdminPage,
  collection/{PipelineManagerDialog,CollectionCard}, CanvassingReportsPage,
  portal/dashboard/{LoyaltyTab,OverviewTab[bg-white!]},
  MarketingDashboardPage, PermissionMatrixEditor, dst.
  CATATAN kategorikal (SKIP, bukan status): AnnouncementsPage (CATEGORY/SEVERITY_CFG),
  loyalty/tiles.tsx (aksen indigo/slate/emerald).
  BUTUH PENILAIAN TERPISAH (JANGAN alat buta): components/ui/status-badge.tsx (primitif inti),
  TicketHeatmapPage (skala warna), integration/shared + IntegrationPage (domain brand),
  NotificationBell (per tipe notif), CustomersPage (71), Dashboard (168, 14 famili),
  SplitterChainPage (viz splitter).
  HATI-HATI page kategorikal-berat (Dashboard 14 famili, IntegrationPage kartu brand) - butuh
  penilaian per-pakai lebih dalam, JANGAN pakai alat buta. bg-white+dark: -> `bg-card` (cek
  manual per page; PointRedemptions tak ada, page lain mungkin ada).
- [ ] **#7 CanvassingHistoryPage DITUNDA** - sub-tema HANGAT (coklat/taupe #827472/#350800/
  #504442/#755750/#f4f3f2 = warna teks+bg utama). Migrasi = re-tema penuh hangat->dingin,
  koheren hanya all-or-nothing. Keputusan aestetik sendiri (bukan shift kecil) - butuh OK user.
- [ ] **#7c File inline-`style={{}}` DITUNDA (rewrite, bukan swap):** TechnicianWorkPage
  (102 inline hex - SELURUH styling inline), `components/map/MapInfoWindow.tsx` (24). Butuh
  ronde rewrite arsitektur styling + approval sendiri (alat lapangan kritikal). Catatan: hex-nya
  = nilai token `--jbn-*`, alternatif aman low-value = `#hex -> var(--jbn-*)` tanpa rewrite.
- [ ] **#7d sisa:** ~602 kelas palet mentah di page lain + `bg-slate-50/40` di `FullBleedPage`
  -> `bg-muted`. Terapkan strategi map yang sama (DECISIONS): semantik utk yg berpadanan,
  palet-eksak utk navy/warna tanpa padanan, `hover:brightness-95` utk hover-gelap.

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
- [x] **PortalDashboardPage SELESAI** (2026-08-13): 2227 -> 242 baris. Folder
  `client/pages/portal/dashboard/` (shared [FEATURE flag + 9 leaf helper] + 7 file tab:
  Overview/Traffic[+fmt]/Billing/Wifi[+WifiInterfaceCard]/Tickets/Points/Loyalty). Byte-identik,
  import di-prune. Customer-facing tapi zero-behavior (reorganisasi murni).
- [x] **TicketingPage SELESAI** (2026-08-13): 2064 -> 646 baris. 4 file di
  `client/components/tickets/` (konvensi repo yg sudah ada): panels (5 panel + 2 helper +
  2 interface), CreateEditDialog, DetailDialog, CategoryManagementDialog. Byte-identik, prune.
- [x] **CollectionPipelinePage SELESAI** (2026-08-13): 2020 -> 719 baris. Folder
  `client/pages/collection/` (shared [helper+tipe+context StageCtx/useStages], CollectionCard,
  CollectionDetail, AssigneePicker[+body], CollectionSettingsDialog, PipelineManagerDialog
  [+StageDeleteDialog]). Dead code StatCard+MiniStat dihapus. Byte-identik, prune.
- [x] **TechnicianWorkPage SELESAI** (2026-08-13): 1819 -> 162 baris. Folder
  `client/pages/technician/` (shared [tipe+helper+9 leaf], ActiveMode, CompletedMode,
  CancelledMode, StageExecutionScreen). Byte-identik, prune (prune.mjs kini simpan doc-comment).
- [x] **MitraPage SELESAI** (2026-08-13): 1266 -> 249 baris. Folder `client/pages/mitra/`
  (shared [tipe+helper+5 leaf+consts], MitraCard, MitraDetailDrawer[+3 tab], MitraCreateDialog).
  Byte-identik, prune (prune.mjs kini dukung namespace import `import * as X`).
- [x] **CanvassingPage SELESAI** (2026-08-13): 1296 -> 810 baris. Folder
  `client/pages/canvassing/` (shared [Terra token+tipe+helper], ConfirmDialog, OdpInfoCard,
  AddLeadForm, FieldReportForm). Byte-identik, prune. Terra token terpusat -> kandidat #7.
- [x] **MapPage SELESAI** (2026-08-13): 1379 -> 946 baris. Folder `client/pages/map/`
  (shared [const+geo helper+tipe], AssetQuickForm, CableQuickForm, CableDetailPanel).
  Byte-identik, prune. Main masih besar (peta 1 komponen kompleks - sisa butuh threading state).
- [ ] **STOP split file besar:** GenieAcs (1449) & Dashboard (1428) = 1 komponen monolitik,
  ROI rendah (ekstraksi hanya tipe/leaf, main tetap ~1250). Kerjakan hanya bila diminta khusus.
  Semua file frontend >=1266 baris (13 file) sudah dipecah. Fokus berikutnya: #7 warna token
  (Canvassing/Terra sudah terpusat), #4 dialogSize, #5 StatTile/EmptyState, #10 backend.

## Terpisah - RISIKO TINGGI (butuh rencana + persetujuan sendiri)
- [ ] **#10 Pecah `server/routes.ts` (16.972) & `server/storage.ts` (16.045)** jadi
  modul per-domain. JANGAN dikerjakan di dalam sweep umum. App LIVE - butuh strategi
  bertahap, test, dan approval eksplisit.
