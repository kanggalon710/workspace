# PROGRESS - JABNET Workspace

> Entri terbaru di ATAS. Satu entri per satuan pekerjaan. Jelaskan KENAPA (git sudah
> mencatat APA). Jangan menulis ulang/menghapus entri lama; tambahkan entri koreksi.

## 2026-08-14 - Security Group C: hardening escalation lintas-tenant
**Agen:** claude | **Status:** selesai (di dev, belum deploy)
**Kenapa:** Lanjutan audit (user: "do c"). Tutup rantai escalation + inkonsistensi isolasi.
**Perubahan (server/storage.ts):**
- **M1** `_resolvePermsAtMitra`: fallback `users.role_id` HANYA dipakai kalau role milik mitra yg
  diminta (`role.mitraId === mitraId`); legacy `role==="admin"` full-access HANYA di mitra 1.
  (Cegah role mitra lain bocor sbg fallback lintas-tenant.)
- **M2** `updateUser`: propagasi `roleId` di-scope ke membership mitra KONTEKS AKTIF saja (dulu semua
  membership termasuk mitra 1). Edit role di /users kini hanya ubah role di tenant aktif; default
  global tetap ke-set.
- **M5** `updateUser`: guard min-1 System-Admin di mitra 1 (throw kalau demote System-Admin terakhir) -
  paritas dgn PATCH member.
- **M3** migrasi promote owner via username/name (field editable) kini BOOTSTRAP-ONLY (hanya saat 0
  System-Admin di mitra 1) - cegah re-promote tiap restart via nama yg diedit.
- **M6** self-heal repoint role asing kini juga cover mitra 1 (membership mitra 1 yg tunjuk role mitra
  lain -> Admin mitra 1; System-Admin tak tersentuh).
**Perubahan (server/routes.ts):**
- **M4** `POST/PUT /api/roles`: blok nama dicadangkan ("System-Admin"/"Administrator") saat create/rename
  (konstanta `RESERVED_ROLE_NAMES`). `canSeeAllData` DIBIARKAN utk admin tenant (supervisor mode
  INTERNAL tenant, storage tetap filter mitra - bukan escalation lintas-tenant).
- Roles CRUD lintas-tenant: `POST/PUT/DELETE /api/roles` kini honor `?mitraId`/role.mitraId utk
  System-Admin JABNET (paritas dgn GET) - hilangkan false-deny.
**Verifikasi:** `tsc` 0 error, build OK, 297/297 test pass.
**Nuansa perilaku (lebih benar, perlu cek manual):** M1 (role global tak berlaku lintas-tenant),
M2 (edit /users hanya tenant aktif). Common case (staff JABNET = member mitra 1) tetap normal.
**Belum deploy.** Sisa: settings per-mitra (ronde sendiri), deleteCollection/pipeline child (low).

## 2026-08-14 - Security: tutup lubang lintas-tenant (mitra-admin over-permit + ticket IDOR)
**Agen:** claude | **Status:** selesai (di dev, belum deploy)
**Kenapa:** Audit lintas-tenant (3 agent) menemukan bug isolasi nyata. User minta fix A+B ronde ini.
**Akar masalah (A):** `isMitraAdmin(req)` = "admin di mana pun", bukan "admin mitra target". Handler
mitra-management pakai `:id` dari URL tanpa cek `id === activeMitraId`. Admin mitra non-JABNET bisa
baca/ubah/hapus mitra lain (termasuk JABNET). Plus sink: `PUT/POST /api/users` menulis teks `role`
dari client mentah -> escalate ke "admin".
**Akar masalah (B):** endpoint child tiket (evidence/gps/team/comments/pauses/checkpoint/timeline)
tak verifikasi tiket `:id` milik mitra pemanggil (IDOR lintas-tenant baca/hapus).
**Perubahan:**
- Helper baru `canAdminMitra(req, targetMitraId)` = isJabnetRoot ATAU (isMitraAdmin && target===activeMitraId).
  Dipasang di `GET/PUT /api/mitras/:id`, `POST /api/mitras/:id/users`, `DELETE /api/mitras/:id/users/:userId`.
  `DELETE /api/mitras/:id` -> owner-only (`isJabnetRoot`). `PUT` field platform-sensitif (isActive/slug/
  features) hanya System-Admin JABNET.
- Sink role: `PUT /api/users/:id` berhenti tulis teks `role` client; `POST /api/users` teks legacy
  diturunkan aman (`role==="admin"?"admin":"operator"`) - resolusi roleId server-side tetap (terkunci).
- Helper `loadTicketInTenant(req,res)` (pakai `getTicket` ter-scope) dipasang di ~11 endpoint child tiket.
  Defense-in-depth storage: filter `mitraId=getMitraId()` di updateTicketTeamMember, removeTicketTeamMember,
  deleteTicketComment, deleteTicketEvidence.
**File:** server/routes.ts (helper + 5 handler mitra + 2 handler user + 11 route tiket),
server/storage.ts (4 method destruktif tiket).
**Verifikasi:** `tsc` 0 error, build OK, 297/297 test pass. Isolasi: System-Admin tetap lintas-tenant;
admin own-tenant tetap penuh atas mitra+tiket sendiri; fix `?mitraId`/remap sebelumnya utuh.
**Butuh tes manual runtime + belum deploy.** DITUNDA (Group C hardening + settings per-mitra + roles CRUD
lintas-tenant) - lihat TODO.

## 2026-08-14 - Fix: System-Admin JABNET gagal tambah user ke mitra lain
**Agen:** claude | **Status:** selesai (di dev, belum deploy)
**Kenapa:** yoga (System-Admin JABNET) tak bisa tambah dirinya ke mitra diar -> error
"Role bukan milik mitra ini". JABNET = pemilik lintas-tenant, harus bisa kelola mitra lain.
**Akar masalah:** Dropdown role di Add-Member (`MitraDetailDrawer` MembersTab) fetch
`GET /api/roles` TANPA param mitra -> backend scope ke `activeMitraId` (=1 utk sysadmin JABNET)
-> list role JABNET -> POST kirim roleId mitra-1 ke `/api/mitras/<diar>/users` -> handler tolak
`role.mitraId (1) !== mitraId (diar)`. Handler ini (POST 1372 + PATCH 1430) tak punya bypass
System-Admin (beda dg 3 handler `...mitra Anda` yg sudah punya).
**Perubahan:** (1) `GET /api/roles` terima `?mitraId` HANYA utk `isJabnetRoot` (else diabaikan ->
scope sendiri). (2) Frontend MembersTab fetch `/roles?mitraId=${mitra.id}` (queryKey + mitra.id)
+ default-role effect stale-safe (reset kalau roleId tak ada di list target). (3) Defense-in-depth:
POST+PATCH, saat `role.mitraId !== mitraId` DAN requester System-Admin -> remap ke role setara
milik mitra target (`getRoleByName(name, mitraId)` else `seedAdminRoleForMitra`) alih-alih 400.
Non-sysadmin tetap 400. Keputusan user: cross-tenant = System-Admin SAJA (JABNET Admin tidak);
default role = Admin milik mitra target.
**File:** server/routes.ts (GET /api/roles; POST /api/mitras/:id/users; PATCH
/api/mitras/:mitraId/members/:userId), client/pages/mitra/MitraDetailDrawer.tsx.
**Verifikasi:** `tsc` 0 error, build OK, 297/297 test pass. Isolasi terjaga: non-sysadmin
`?mitraId` diabaikan, remap sysadmin-only, `GET /api/mitras` tetap sysadmin-only,
guard min-1-System-Admin @mitra1 + System-Admin-only-@mitra1 utuh.
**Catatan:** Perlu tes manual runtime (login yoga -> mitra diar -> Anggota -> tambah diri ->
switch-tenant). Belum deploy ke produksi (tunggu OK user).

## 2026-08-14 - #7l: Batch 3 file warna -> token (tail lanjut)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut (user: continue). 3 file status-bersih (collection + SLA + portal overview).
**Perubahan:** CollectionPipelinePage (alert/callout sukses/tombol hapus), SlaCalendarPage
(toggle/callout/hapus), portal/dashboard/OverviewTab (bar+dot online, due-date bar, tempo).
Alat + 6 koreksi manual.
**File:** 3 file di atas.
**Verifikasi:** `tsc` 0 error, build OK. 0 badge tak-terlihat, 0 hover kolaps, 0 sisa palet.
**Koreksi manual:** (1) 2 tombol hapus `bg-destructive hover:bg-destructive`->`hover:brightness-95`;
(2) toggle off-track + bar offline `bg-muted`->`bg-muted-foreground/40` (bukan nyaris tak-terlihat);
(3) dot offline `bg-muted`->`bg-muted-foreground`; (4) due-date "ok" bar `bg-sky-500`->`bg-info`
(zero-shift: --info == sky-500, tapi dark-aware); (5) toolbar `bg-white dark:bg-slate-900`->
`bg-card` (permukaan tema; alat hapus dark: lalu bg-white sendirian salah di dark). Thumb toggle
`bg-white` DIPERTAHANKAN (knob kontrol, putih di kedua mode).
**DILEWATI sadar:** PowerBudgetPage - meteran ambang RX power (zona merah/kuning/hijau + garis
penanda) = DATA-VIZ, butuh verifikasi visual (tint /25 vs -200 solid). Ronde tersendiri.

## 2026-08-14 - #7k: Batch 3 file warna -> token (tail lanjut)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut (user: continue). 3 file status-bersih (collection + canvassing).
**Perubahan:** collection/PipelineManagerDialog (dialog hapus stage - merah/amber danger/warning),
collection/CollectionCard (badge urgensi/status), CanvassingReportsPage (KPI hari/kritis +
tombol/hapus). Alat + 3 koreksi manual.
**File:** 3 file di atas.
**Verifikasi:** `tsc` 0 error, build OK. 0 badge tak-terlihat, 0 hover kolaps, 0 sisa palet
(kecuali SEVERITY_CFG yg SENGAJA dipertahankan).
**Koreksi/keputusan manual:** (1) `SEVERITY_CFG` CanvassingReports (info=blue/warning=amber/
critical=red) DIPERTAHANKAN utuh - set severity koheren dg anggota `info` biru (kategorikal,
blue tak ditokenkan); setengah-token bikin set tak konsisten. (2) 2 tombol hapus `bg-destructive
hover:bg-destructive`->`hover:brightness-95`.
**DILEWATI sadar:** portal/dashboard/LoyaltyTab - tema reward dekoratif (gold/emerald) +
gradient `from-amber-50 to-emerald-50` ber-dark-tuning (alat akan rusak gradient dark).
PermissionMatrixEditor - tak ada kelas status/neutral.

## 2026-08-14 - #7j: Batch 3 file warna -> token (tail lanjut)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut (user: continue). 3 file status-bersih.
**Perubahan:** loyalty/DiscountRow (emerald=hemat/success, rose=batal/destructive),
mitra/MitraCard (badge+dot aktif/nonaktif), portal/dashboard/TicketsTab (status map
ditangani/selesai/ditutup). Alat + 4 koreksi manual.
**File:** 3 file di atas.
**Verifikasi:** `tsc` 0 error, build OK. Per file: 0 sisa palet, 0 dark: status/neutral,
0 badge tak-terlihat, 0 hover kolaps.
**Koreksi manual:** dot nonaktif `slate-400`->`bg-muted-foreground` (bukan bg-muted tak-terlihat);
tombol Terapkan `bg-success hover:bg-success`->`hover:brightness-95`; drop 3 `hover:text-*`
redundant (MitraCard toggle, DiscountRow Batalkan).
**DILEWATI sadar:** loyalty/tiles.tsx - peta aksen KATEGORIKAL (slate/indigo/emerald + dot
amber/emerald/rose per prop `color`/`dot`), bukan status -> harus utuh.

## 2026-08-14 - #7i: Batch 4 file warna -> token (tail lanjut)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut (user: continue). 4 file status-bersih ber-`dark:`.
**Perubahan:** SahabatDetailDrawer (2 dark:/status ternary+badge), map/CableDetailPanel
(4 dark:/KPI tiles+dot core), ActiveSessionsPage (2 dark:/online-error), UpdateBanner
(6 dark:/banner amber tunggal-warna=warning). Alat `collapse-darkmode.mjs` + 5 koreksi manual.
**File:** 4 file di atas.
**Verifikasi:** `tsc` 0 error, build OK (13s). Per file: 0 sisa palet status/neutral, 0 dark:
status/neutral, 0 badge tak-terlihat, 0 hover kolaps, kategorikal (orange icon cable) utuh.
**Koreksi manual pasca-alat (edge case penting):** (1) progress gold `bg-yellow-300`->`bg-warning`
solid (bukan `/40` pudar); (2) callout `bg-emerald-50/50`->`bg-success/10` (alat preserve op ->
`/50` over-saturasi krn base pindah 50->500); (3) dot core rusak `gray-400`->`bg-muted-foreground`
(bukan `bg-muted` nyaris tak terlihat sbg dot); (4) tombol `bg-warning hover:bg-warning`->
`hover:brightness-95`; (5) drop redundant `hover:text-destructive`.
**DILEWATI sadar:** AnnouncementsPage - `CATEGORY_CFG`/`SEVERITY_CFG` palet KATEGORIKAL per
kategori (sky/emerald/indigo/amber/violet), bukan status -> harus utuh, jangan ditokenkan.

## 2026-08-13 - #7h: Batch 8 file warna -> token (tail lanjut)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut (user: continue). 8 file status-bersih ber-`dark:`.
**Perubahan:** integrations/AppUpdateCard (8 dark:/16 map), tickets/Customer360Panel (3/18),
portal/dashboard/TrafficTab (11/13), shared/CapacityCalculatorModal (10/10),
integrations/DevDbSyncCard (6/14), collection/CollectionDetail (8/11),
portal/dashboard/WifiTab (5/12), MikrotikRoutersPage (1/16). 3 hover kolaps ->
`hover:brightness-95`. Kategorikal utuh.
**File:** 8 file di atas.
**Verifikasi:** `tsc` 0 error, build OK. Per file: 0 badge tak-terlihat, 0 hover kolaps,
0 sisa palet, 0 baris non-warna. Spot-check CapacityCalculator: success/destructive by kapasitas.
**DIKECUALIKAN sadar dari batch (butuh penilaian terpisah):** components/ui/status-badge.tsx
(primitif inti), TicketHeatmapPage (skala warna), integration/shared (domain brand),
NotificationBell (warna per tipe notif = kategorikal), OverviewTab (ada bg-white dark: pair).

## 2026-08-13 - #7g: Batch 9 file warna -> token (tail bersih)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut (user: continue). 9 file status-bersih ber-`dark:` (page + komponen + portal).
**Perubahan:** CoverageCheckPage (6 dark:/35 map), loyalty/SummaryTab (11/29),
components/tickets/panels (5/28), loyalty/ReferralsTable (15/16), PublicApiPage (6/24),
customers/IntegrationAuditDialog (9/25), portal/dashboard/BillingTab (9/12),
portal/dashboard/shared (19/33), customers/CustomerForm (6/14). 3 hover kolaps ->
`hover:brightness-95`. Kategorikal (sky/blue/violet/indigo/purple/orange/pink/fuchsia) utuh.
**File:** 9 file di atas (portal customer-facing termasuk - shift kecil + dark-aware).
**Verifikasi:** `tsc` 0 error, build OK. Per file: 0 badge tak-terlihat, 0 hover kolaps,
0 sisa palet, 0 baris non-warna berubah.

## 2026-08-13 - #7f: Batch 5 page warna -> token (Mpwa/GenieAcs/Monitoring/Audit/Profile)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut batch manual per-pola (user: merge main + continue). 5 page status-bersih.
**Perubahan:** MpwaPage (hapus 25 dark:, map 39), GenieAcsDevicesPage (18/51), MonitoringPage
(17/20), AuditLogPage (16/21), ProfilePage (13/25). 9 hover-gelap kolaps -> `hover:brightness-95`
(GenieAcs 8: badge status + tombol AlertDialog). Kategorikal (sky/blue/violet/indigo/orange/
purple/pink) + varian dark:-nya SENGAJA utuh.
**File:** client/pages/{MpwaPage,GenieAcsDevicesPage,MonitoringPage,AuditLogPage,ProfilePage}.tsx.
**Verifikasi:** `tsc` 0 error, build OK. Per file: 0 badge tak-terlihat, 0 hover kolaps,
0 sisa palet, 0 baris non-warna berubah.

## 2026-08-13 - #7e: Batch 4 page warna -> token (BugReports/Users/Leads/Roles)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut batch manual per-pola (user: "next batch"). 4 page status-bersih ber-`dark:`.
**Perubahan:** BugReportsPage (hapus 18 dark:, map 33), UsersPage (13/33), LeadPipelinePage
(27/68), RolesPage (13/32). Total 8 hover-gelap kolaps -> `hover:brightness-95`. Kategorikal
sky/violet/indigo/blue/purple + varian dark:-nya SENGAJA utuh (avatar role/user, warna stage).
**File:** client/pages/{BugReportsPage,UsersPage,LeadPipelinePage,RolesPage}.tsx.
**Verifikasi:** `tsc` 0 error, build OK. Per file: 0 badge tak-terlihat, 0 hover kolaps,
0 sisa palet status/neutral, 0 baris non-warna berubah, kategorikal utuh.
**Catatan (perbaikan alat):** `collapse-darkmode.mjs` diperbaiki - dulu `bg-rose-500/10` (tint
via opacity) salah jadi solid (drop opacity) -> teks tak terlihat di LeadPipeline. Kini opacity
di-preserve (`bg-{token}/{op}`). optim-18/19 DICEK ulang: originalnya tak punya pola pemicu
`bg-status-{400-900}/{op}`, jadi benar (tak terdampak).

## 2026-08-13 - #7d: PointsTab (portal) warna -> token (manual per-pola)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut manual per-pola. PointsTab (portal pelanggan, tab poin) semantik status
bersih; tak ada `bg-white dark:` (aman).
**Perubahan:** `client/pages/portal/dashboard/PointsTab.tsx`. Hapus 28 varian `dark:` status/
neutral + map 43 dasar -> token (tint-aware). Kategorikal sky/violet utuh. 0 hover kolaps.
**File:** client/pages/portal/dashboard/PointsTab.tsx.
**Verifikasi:** `tsc` 0 error, build OK. Diff color-only, 0 badge tak-terlihat, 0 hover kolaps,
0 sisa palet, 0 double-space. Customer-facing: shift kecil (emerald->green) + kini dark-aware.

## 2026-08-13 - #7c: PointRedemptionsTab - migrasi manual per-pola (page ber-dark:)
**Agen:** claude | **Status:** selesai (page pertama ber-`dark:` via pendekatan manual)
**Kenapa:** User pilih "manual, few per round". Page ini semantik status murni (pending=
warning, active=success, rejected=destructive, expired/cancelled=muted) - kandidat bersih.
**Perubahan:** `client/pages/loyalty/PointRedemptionsTab.tsx`. Pola: (1) HAPUS 45 varian
`dark:` status/neutral (token theme-aware sudah tangani terang+gelap), (2) map 79 kelas dasar
-> token (tint-aware bg: `bg-warning/15 text-warning` = badge terbaca; opacity dipertahankan
utk text). 3 hover-gelap kolaps -> `hover:brightness-95`. Kategorikal `sky`/`violet` + varian
`dark:`-nya SENGAJA dibiarkan (pembeda, bukan status; `dark:bg-sky-950` tetap ada).
**File:** client/pages/loyalty/PointRedemptionsTab.tsx (49 insert / 49 delete).
**Verifikasi:** `tsc` 0 error, build OK. 0 badge tak-terlihat, 0 hover kolaps, 0 double-space,
0 sisa palet status/neutral. Kategorikal utuh.
**Catatan:** Alat: `collapse-darkmode.mjs` (hapus dark: status/neutral + map dasar opacity-aware).
Pola terbukti; lanjut page status-bersih lain (BugReports/PointsTab/Users) 1-2 per ronde.

## 2026-08-13 - #7b: BroadcastTargetPage warna -> token + TEMUAN sweep tak aman
**Agen:** claude | **Status:** selesai (1 page aman) + temuan penting
**Kenapa:** Lanjut #7. BroadcastTargetPage TANPA varian `dark:` (0) -> aman dimigrasi.
**Perubahan:** `client/pages/whatsapp/BroadcastTargetPage.tsx` (76 swap). Famili status+neutral
-> token: rose->destructive, emerald->success, amber/yellow->warning, zinc->muted/foreground/
border. Badge tint di-map ke varian transparan (`bg-warning/15 text-warning`) = teks terbaca.
Famili kategorikal (violet/sky/blue) SENGAJA ditinggal (pembeda kategori, bukan status).
4 `bg-*-50/40` (sudah transparan) ditinggal (zero-change).
**File:** client/pages/whatsapp/BroadcastTargetPage.tsx.
**Verifikasi:** `tsc` 0 error, build OK. 0 hover kolaps, 0 badge tak-terlihat, diff color-only.
**TEMUAN (lihat DECISIONS):** Sweep warna BUTA ke page lain TIDAK aman - mayoritas punya
varian `dark:` LIVE + badge tint yg rusak oleh map buta (bukti: teks tak terlihat, kontras
kolaps). Sweep dihentikan; sisa #7 (page ber-`dark:`) butuh migrasi per-pola manual + OK user.

## 2026-08-13 - #7 (mulai): TicketCategoriesPage warna -> token semantik
**Agen:** claude | **Status:** selesai (1 file; sisa #7 ditunda per DECISIONS)
**Kenapa:** 158 warna hardcoded (64 arbitrary `[#hex]` + 94 kelas palet mentah) -> token
design system, jadi theme-aware + hapus arbitrary hex.
**Perubahan:** `client/pages/TicketCategoriesPage.tsx`. Map: slate->muted/muted-foreground/
foreground/border (per peran), rose->destructive, amber->warning, emerald->success. Navy
brand `#1e40af/#1e3a8a` (tanpa padanan semantik) -> kelas palet eksak `blue-800/blue-900`
(zero shift, 0 arbitrary hex tersisa). 2 tombol hover-gelap yang kolaps diberi
`hover:brightness-95` (jaga umpan-balik hover). 4 inline-style dinamis (`c.color`,
page-bg #f8fafc, dot final) + array picker kategori = DATA, sengaja tetap hex.
**File:** client/pages/TicketCategoriesPage.tsx (113 insert / 113 delete = swap 1:1 murni).
**Verifikasi:** `tsc` 0 error, build sukses. Diff: SEMUA baris berubah = swap warna (0
perubahan struktur JSX). 135 adopsi token semantik. `grep`: 0 arbitrary `[#hex]` di className.
**Catatan:** Ditunda (DECISIONS): TechnicianWorkPage+MapInfoWindow (inline-style = rewrite),
CanvassingHistoryPage (sub-tema hangat = re-tema penuh, keputusan aestetik). >=640px prod
default light = terjaga; near-exact utk mayoritas, emerald->green shift kecil disengaja.

## 2026-08-13 - #4: Utilitas `.dialog-w` (lebar dialog terpusat + refinement mobile)
**Agen:** claude | **Status:** selesai
**Kenapa:** Ekspresi lebar mobile `w-[calc(100vw-2rem)]` diulang 51x di 42 file. Sekaligus
inset ponsel dilonggarkan 2rem->1rem (mobile-first, di-opt-in user).
**Perubahan:** `client/index.css` `@layer utilities` tambah `.dialog-w =
w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)]`. 51 site swap token `w-[calc(100vw-2rem)]`
-> `dialog-w` (tiap dialog tetap pegang `max-w`/`max-h`/overflow sendiri). BUKAN pakai
`dialogSizeClass()` (lihat DECISIONS - itu akan meregresi lebar desktop).
**File:** client/index.css + 42 file dialog (RolesPage, UsersPage, MpwaPage, SdmPage,
CardDetailModal, portal/dashboard/*, teamspace/*, pipelines/*, dst).
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses. CSS terkompilasi dicek:
`.dialog-w` base `calc(100vw-1rem)` + `@media(min-width:640px)` `calc(100vw-2rem)` -> >=640px
**pixel-identik** dgn sebelumnya, <640px gutter 1rem. 2 cap `min(...)` sengaja tak disentuh.
**Catatan:** `dialogSizeClass()`/`DialogSizeToggle` (fitur toggle 3 dialog pipeline) tetap utuh.

## 2026-08-13 - #9: Pecah MapPage (1379 -> 946 baris)
**Agen:** claude | **Status:** selesai
**Kenapa:** 3 komponen form/panel sibling (AssetQuickForm, CableQuickForm, CableDetailPanel)
di depan main + blok konstanta/geo-helper/tipe.
**Perubahan:** folder `client/pages/map/`: `shared.tsx` (GARUT_CENTER/DEFAULT_ZOOM/
SNAP_THRESHOLD_METERS + geo helper haversineMeters/nearestOnSegment/findSnapPoint + tipe
SnapResult/QuickFormProps - murni, 0 import eksternal), lalu 3 file komponen. Main tinggal
shell peta (946 baris). Byte-identik (pindah + `export`); import di-prune.
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses, 0 deklarasi dobel di main.
**Catatan:** Main masih besar (peta = 1 komponen kompleks dgn state viewport/marker; sisa split
butuh threading state, risiko). GenieAcs (1449) & Dashboard (1428) monolitik -> STOP di sini
utk split (ROI rendah). Semua file >=1266 baris sudah dipecah tahap ini.

## 2026-08-13 - #9: Pecah CanvassingPage (1296 -> 810 baris)
**Agen:** claude | **Status:** selesai
**Kenapa:** Seam bagus: 4 komponen sibling independen (ConfirmDialog, OdpInfoCard, AddLeadForm,
FieldReportForm) + blok token/tipe/helper sebelum main.
**Perubahan:** folder `client/pages/canvassing/`: `shared.tsx` (Terra token `T` + tipe Odp/
Session/Lead/FieldLog + const LOG_TYPES/SEVERITY/CAT_*/TEAM_COLORS + helper haversine/
findNearestOdp/formatDuration/fmtTime), lalu 4 file komponen form/dialog. Main tinggal shell
peta+sesi (810 baris). Byte-identik (pindah + `export`); import di-prune.
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses, 0 deklarasi dobel di main.
**Catatan:** Import relatif `../../shared/schema` pecah saat file turun 1 folder -> di file
hasil ekstraksi diubah ke alias `@shared/schema` (location-independent, main tak disentuh).
Token Terra `T` (hex hardcoded) kini terpusat di canvassing/shared -> memudahkan migrasi #7
(warna token) nanti. Halaman ini kandidat utama #7.

## 2026-08-13 - #9: Pecah MitraPage (1266 -> 249 baris)
**Agen:** claude | **Status:** selesai
**Kenapa:** ROI tertinggi di antara file ~1300 baris: shell utama cuma ~230 baris, 11 komponen
sibling (~930 baris) siap diekstrak.
**Perubahan:** folder `client/pages/mitra/`: `shared.tsx` (tipe MitraItem/SafeUser/DetailTab +
helper getInitials/slugify/fmtDate + leaf Switch/MiniStat/KpiTile/InfoRow/FF + const
EMPTY_MITRA_FORM/EMPTY_ADMIN_FORM), `MitraCard`, `MitraDetailDrawer` (+OverviewTab/FeaturesTab/
MembersTab, coupled), `MitraCreateDialog`. Main tinggal shell + KPI grid (249 baris).
Byte-identik (pindah + `export`); import di-prune.
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses, 0 deklarasi dobel di main.
**Catatan:** Celah tool ke-3 diperbaiki: `import * as SwitchPrimitive` (namespace import)
sebelumnya di-drop prune -> prune.mjs kini pertahankan `import * as X` bila X dipakai.
Dashboard (1428) = 1 komponen monolitik (tak ada seam), GenieAcs (1449) mayoritas 1 komponen
besar - ROI split rendah, dilewati kecuali diminta.

## 2026-08-13 - #9: Pecah TechnicianWorkPage (1819 -> 162 baris)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut pecah file besar. State-machine mode-based -> tiap mode/screen komponen
mandiri prop-driven, banyak leaf helper dipakai lintas mode.
**Perubahan:** folder `client/pages/technician/`: `shared.tsx` (tipe + helper
extractRawNote/fmtTimeIDN/fmtDateTimeIDN/fmtDuration/fmtSLA/getGpsPosition/compressImage/
useLiveCountdown + leaf StageDot/Label/Badge/PriorityBadge/CustomFieldRender/FieldCard/
SpeedField/Metric/Activity14), lalu `ActiveMode`, `CompletedMode`, `CancelledMode`,
`StageExecutionScreen`. Main tinggal shell state-machine (162 baris, doc-comment header
dipertahankan). Byte-identik (pindah + `export`); import di-prune.
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses, 0 deklarasi dobel di main.
**Catatan:** Dua celah tool ketahuan & diperbaiki: (1) `compressImage` = `async function`
(regex exportize lama tak match) -> exportize kini dukung `async function`; (2) file diawali
block-comment `/** */` -> prune.mjs kini simpan preamble komentar lalu tetap prune import
(sebelumnya prune diam saat baris pertama komentar). Perbaikan generik, berguna utk split
berikutnya. Gate (tsc) menangkap sebelum commit.

## 2026-08-13 - #9: Pecah CollectionPipelinePage (2020 -> 719 baris) + hapus dead code
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut pecah file besar. File ini punya React context bersama (StageCtx/useStages)
+ banyak helper - butuh shared module supaya semua komponen anak bisa pakai.
**Perubahan:** folder `client/pages/collection/`: `shared.tsx` (helper isStageActive/fmtRp/
fmtDate/toDateInput/daysSince/ACTIVITY_CFG/SELECTABLE_OWNER_DIVISIONS + tipe CollectionStage/
StageHelpers/Assignee/CollectionWithCustomer + context StageCtx/useStages), lalu `CollectionCard`,
`CollectionDetail` (impor AssigneePicker), `AssigneePicker` (+_AssigneePickerBody),
`CollectionSettingsDialog`, `PipelineManagerDialog` (+StageDeleteDialog + consts ROLE_OPTIONS/
OVERDUE_ACTION_OPTIONS/group* helper). Main tinggal shell (719 baris). Dead code `StatCard` +
`MiniStat` (0 referensi) DIHAPUS. Byte-identik (pindah + `export`); import di-prune.
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses, 0 deklarasi dobel di main.
**Catatan:** File ini menyisipkan blok import di 2 tempat (1-18 dan 27-48) dengan helper const
di antaranya (20-26) - percobaan pertama header-nya kepotong (Button/toast/icon hilang), tsc
menangkap, header dirakit ulang jadi kontigu (1-18 + 27-48). Gate menangkap sebelum commit.
Sisa file besar: TechnicianWorkPage (1819), GenieAcsDevicesPage (1449), Dashboard (1428).

## 2026-08-13 - #9: Pecah TicketingPage (2064 -> 646 baris)
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjut pecah file besar. Ikuti konvensi yang SUDAH ada di repo: komponen tiket
diekstrak ke `client/components/tickets/` (sudah ada shared.ts, KanbanView, dll) - bukan
bikin folder baru.
**Perubahan:** 4 file di `client/components/tickets/`: `panels.tsx` (InfoRow, WorkflowSection,
TeamPanel, EvidencePanel, TechnicianWorkloadPanel + helper parseActivityContent +
FRONTEND_WORKFLOW_PRESETS + interface TechnicianWorkload/CsatStat - dikelompokkan karena saling
refer: DetailDialog->{semua}, TeamPanel->EvidencePanel->TechnicianWorkloadPanel), lalu
`CreateEditDialog.tsx`, `DetailDialog.tsx`, `CategoryManagementDialog.tsx`. Main tinggal shell
+ PAGE_SIZE (646 baris). Kode byte-identik (pindah + `export`); import di-prune.
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses, 0 deklarasi dobel di main.
**Catatan:** 2 helper (parseActivityContent, FRONTEND_WORKFLOW_PRESETS) awalnya terlewat oleh
regex audit (underscore/lowercase) - ketahuan oleh tsc, ditambahkan ke import panel. Gate
menangkapnya sebelum commit. Sisa file besar: CollectionPipelinePage (2020), TechnicianWorkPage (1819).

## 2026-08-13 - #9: Pecah PortalDashboardPage (2227 -> 242 baris)
**Agen:** claude | **Status:** selesai
**Kenapa:** File portal pelanggan raksasa; tiap tab = komponen module-scoped prop-driven
(referensi antar-tab NOL, tiap tab dipakai 1x di shell) -> seam ekstraksi bersih.
**Perubahan:** folder baru `client/pages/portal/dashboard/`: `shared.tsx`
(FEATURE_BILLING_ENABLED + 9 leaf helper: LoadingState/AlertCard/MiniStat/BigStat/
IdentityField/DataField/QuickAction/BillingStatusBadge/ReferralStat), lalu 7 file tab:
`OverviewTab`, `TrafficTab` (+fmtBytes/fmtMB/fmtSpeed), `BillingTab`, `WifiTab`
(+WifiInterfaceCard), `TicketsTab`, `PointsTab`, `LoyaltyTab`. Main tinggal shell (type Tab
+ TAB_DEFS + komponen utama, 242 baris). Kode byte-identik (hanya pindah + `export`); import
di-prune per file (over-keep-safe).
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses, cek 0 deklarasi dobel di main.
Perilaku identik (reorganisasi file). CATATAN: halaman customer-facing kritis - ekstraksi
byte-identik jadi tanpa perubahan perilaku, hanya reorganisasi.
**Catatan:** File portal >2000 baris kini terpecah. Sisa file besar frontend: TicketingPage
(2064), CollectionPipelinePage (2020) bisa menyusul pola sama bila diminta.

## 2026-08-13 - #3 tuntas: adopsi `<ScrollRow>` di 2 baris chip/pill terakhir
**Agen:** claude | **Status:** selesai
**Kenapa:** Menutup #3. Audit ulang 16 file pemakai idiom `overflow-x-auto no-scrollbar`:
hanya 2 yang benar-benar baris pill/chip filter (sisanya tab-bar underline, segmented
`bg-muted/50`, toolbar, grid responsif, gallery snap-x, atau wrapper tabel - bukan target).
**Perubahan:** `components/pipelines/CardDetailModal.tsx` (chip "Pindah Stage") +
`pages/whatsapp/BroadcastTargetPage.tsx` (status tabs pill) pakai `<ScrollRow>` (satu
`bleed="mobile"`). className diteruskan apa adanya -> zero visual change.
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses. Balance tag `<ScrollRow>` 1:1/file.
**Catatan:** Total adopsi ScrollRow kini 8 site. #3 DITUTUP - sisa 14 pemakaian idiom sengaja
tidak dikonversi (didokumentasikan di TODO). #5 (StatTile/EmptyState luas) masih terbuka.

## 2026-08-13 - #9: Pecah IntegrationPage (3032 -> 2290 baris)
**Agen:** claude | **Status:** selesai
**Kenapa:** File raksasa terakhir di roadmap split. Meski card berbagi state `allSettings`
(tak diekstrak), bagian daun murni + 1 card mandiri bisa dipisah tanpa ubah perilaku.
**Perubahan:** 2 file baru di `client/pages/integration/`: `shared.tsx` (tipe MikrotikRouter/
SettingItem + komponen daun ToggleSwitch/PasswordInput/IntegrationStatusBadge/MethodBadge/
GuideStep/CodeSnippet/FeatureBadges + data API_ENDPOINTS/INTEGRATION_SECTIONS + getSettingValue),
`OmnichannelIntegrationCard.tsx` (card Chatwoot mandiri, no props - hooks/state sendiri, hanya
impor ToggleSwitch+GuideStep dari shared). Main tinggal shell + komponen utama (2290 baris).
Kode byte-identik (hanya pindah + `export`); import di-prune per file (script scratchpad).
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses. Perilaku identik (reorganisasi file).
**Catatan:** Card berstate (`allSettings` dibaca banyak card) SENGAJA ditahan di main - ekstraksi
butuh threading prop/context (risiko regresi). Tersisa follow-up bila `ui/StatTile` diperluas.
Semua target split file besar frontend (#9) kini SELESAI; sisa hanya backend #10 (risiko tinggi).

## 2026-08-12 - #9: Pecah CustomersPage (2623 -> 1455 baris) + hapus dead code
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjutan #9. CustomersPage 2623 baris; deklarasi module-scoped prop-driven
diekstrak; ditemukan `SyncModal` (~99 baris) yang 0 referensi (dead code).
**Perubahan:** 7 file di `client/pages/customers/`: `shared.ts` (LOCKABLE_FIELDS,
parseOverrides, exportCustomersCSV, PAGE_SIZE_OPTIONS, DistrictSummary), `CustomerForm.tsx`,
`CustomerStatusBadge.tsx`, `DistrictCard.tsx`, `CustomerLocalEditForm.tsx`,
`IntegrationAuditDialog.tsx` (+pickBestSerial/interfaces/METHOD_LABELS internal),
`CustomerCommunication.tsx`. `SyncModal` dead code DIHAPUS (bukan diekstrak). Main tinggal
1455 baris (komponen utama + dialog inline + tabel). Import di-prune per file.
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses. Perilaku identik (kecuali hapus
dead code yang memang tak pernah dipakai).
**Catatan:** Sisa CustomersPage (tabel mentah -> `<DataTable>`, 3 dialog inline) butuh
prop-threading -> follow-up. IntegrationPage (3050) tersulit (state `allSettings` dibagi
semua card) -> ronde split tersendiri.

## 2026-08-12 - #9: Pecah LoyaltyAdminPage (3610 -> 558 baris)
**Agen:** claude | **Status:** selesai
**Kenapa:** File raksasa (3610 baris) susah dirawat; semua sub-komponen sudah module-scoped
& prop-driven -> ekstraksi seam bersih tanpa ubah perilaku.
**Perubahan:** 7 file baru di `client/pages/loyalty/`: `shared.ts` (helper/konstanta),
`tiles.tsx` (KpiCard/TierCard/StatTile), `SummaryTab.tsx`, `DiscountRow.tsx`,
`LeaderboardTable.tsx`, `ReferralsTable.tsx`, `PointRedemptionsTab.tsx`,
`PointConfigDialog.tsx` (+MikrotikBoostConfigPanel internal). Main tinggal shell + main
component (558 baris). Kode komponen byte-identik (hanya pindah + tambah `export`); import
tiap file di-prune otomatis ke yang terpakai (script scratchpad/prune.mjs, over-keep-safe).
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses. Perilaku identik (hanya
reorganisasi file). DAG import bersih (shared/tiles jadi daun, tanpa siklus).
**Catatan:** `StatTile`/`KpiCard`/`TierCard` tetap "shadow" yang ditahan (fitur khusus) -
kini terpusat di `loyalty/tiles.tsx`, memudahkan migrasi ke `ui/StatTile` nanti bila
diperluas. CustomersPage (2620) & IntegrationPage (3050) menyusul di ronde split berikutnya.

## 2026-08-12 - Optimasi Ronde 2b: adopsi `<ScrollRow>` lebih luas
**Agen:** claude | **Status:** selesai
**Kenapa:** Lanjutan #3 - sebarkan primitif `ScrollRow` ke baris filter-pill yang bersih.
**Perubahan:** Adopsi di ContactsPage (2 baris), BusinessDecisionPage, LeadPipelinePage
(total 6 site dengan ronde 2). className diteruskan apa adanya (zero visual change).
**Verifikasi:** `tsc` 0 error, 297 test pass, build sukses. Balance `<ScrollRow>` OK per file.
**Catatan:** #8 (mobile-first `max-*:` di komponen map) SENGAJA ditunda - itu bukan
scaling-down sederhana melainkan reposisi overlay khusus mobile; invert ke min-width butuh
uji visual di peta (tak bisa diverifikasi di sandbox), risiko regresi fitur inti.

## 2026-08-12 - Optimasi Ronde 2: formatRupiah + a11y sweep + ScrollRow + normalisasi shadow
**Agen:** claude | **Status:** selesai
**Kenapa:** Eksekusi roadmap optimasi (#2/#3/#6 + normalisasi design-system) yang aman untuk
app LIVE. User memilih "safe wins + normalisasi" dan menunda migrasi warna token (#7).
**Perubahan:**
- **DRY currency:** `shared/currency.ts` (`formatRupiah`) + `shared/currency.test.ts` (3 test)
  menggantikan 8 formatter `fmtRp`/`formatRp` inline (delegasi, call site tak berubah).
- **A11y:** 26 tombol ikon dapat `aria-label`; 3 `<img>` dapat `alt` (hapus komentar
  eslint-disable usang); Dashboard alert-row + Phonebook CSV-dropzone jadi keyboard-operable
  (`<button>` / `role=button`); MitraPage card + UsersPage row `role=button`+`onKeyDown`
  (dengan guard `e.target===e.currentTarget` agar kontrol nested tak dobel-trigger).
- **Primitif baru:** `client/components/ui/scroll-row.tsx` (`<ScrollRow>`), diadopsi di
  TeamReportPanel + AllTasksPage (zero visual change).
- **Normalisasi shadow:** local `StatusBadge` (Customers, Integration) jadi adapter domain
  yang delegasi ke `ui/StatusBadge`; local `EmptyState` portal dipindah ke `ui/EmptyState`.
**Verifikasi:** `tsc --noEmit` -> 0 error. `tsx --test shared/*.test.ts` -> 297 pass (naik dari
294), 0 fail. `npm run build` -> sukses (esbuild 4.0mb). Spot-grep: 8 file currency memakai
`formatRupiah`; 3 shadow lokal hilang.
**Catatan:** shadow `StatTile`/`KpiCard` (LoyaltyAdmin/TicketsDashboard/BugReports) DITAHAN
karena akan menghilangkan fitur (lihat DECISIONS). Sisa optimasi di `.ai/TODO.md`. Belum
di-deploy.

## 2026-08-12 - Standar AI Agent + roadmap optimasi + proof slice `<FullBleedPage>`
**Agen:** claude | **Status:** selesai
**Kenapa:** User minta codebase mengikuti prinsip dasar (semantic HTML, DRY, reusable
component, mobile-first, desain bersih) dan mengecilkan file raksasa, TANPA memecah
stabilitas/fitur (app LIVE). Juga minta satu file instruksi wajib-baca untuk semua AI
agent karena belum ada standar level-project. Ronde ini sengaja di-scope: dokumen +
roadmap + satu refactor kecil yang aman sebagai bukti pola.
**Perubahan:**
- `AGENTS.md` (root) - standar wajib-baca, menunda ke `~/.claude/CLAUDE.md` untuk aturan
  universal; berisi aturan spesifik project (reuse-first + tabel primitif UI, token-only,
  verifikasi 3-perintah, pola MySQL/izin/deploy).
- `.ai/TODO.md` - roadmap optimasi ber-prioritas dengan angka hasil audit grep-verified.
- `.ai/PROGRESS.md`, `.ai/DECISIONS.md` - inisialisasi state folder.
- `client/components/ui/full-bleed-page.tsx` - komponen baru `<FullBleedPage>`.
- 6 page memakainya menggantikan string scaffold yang identik: `MitraPage`, `UsersPage`,
  `RolesPage`, `AnnouncementsPage`, `BugReportsPage`, `PublicApiPage`.
**Verifikasi:** `npx tsc --noEmit` -> 0 error. `npx tsx --test shared/*.test.ts` ->
294 pass, 0 fail (tak berubah, proof slice tidak menyentuh `shared/`). `npm run build` ->
sukses (esbuild 4.0mb). Zero visual change (kelas dipertahankan byte-identik; 6 call site
tidak mengoper `className`).
**Catatan:** Sisa optimasi (formatRupiah, FilterPillBar, adopsi dialogSize/StatTile/
EmptyState, a11y sweep, migrasi warna token, pecah page besar, dan pecah routes.ts/
storage.ts) tercatat di `.ai/TODO.md` untuk ronde berikutnya. Belum di-deploy - keputusan
push/merge/deploy ada di user.
