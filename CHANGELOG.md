# JABNET FTTH Asset Manager - Changelog

Semua perubahan signifikan, perbaikan bug, dan fitur baru dicatat di sini.
Format: `[Versi] - Tanggal - Ringkasan`

---

## [v5.0.0] - 2026-07-17 - Teamspace Fase 3 + pelengkap Fase 2: LENGKAP (pengganti Cicle penuh)

### Added - Fase 3
- **Laporan Kinerja terpadu** (FR-10xx + FR-1006, `/teamspace/performance`):
  - Skor deterministik 0-100 per anggota (`shared/performanceScore`, 7 test): bobot
    on-time 40 / penyelesaian 25 / check-in 15 / ops 20 - configurable via
    `app_settings.teamspace_score_weights`; bintang 1-5 + label; AI TIDAK menilai
  - Scope 3 tingkat: supervisor lihat semua · manager lihat timnya · member lihat dirinya
  - **Output ops disandingkan** (pembeda vs Cicle): tiket resolved, lead won,
    collection closed, laporan canvassing per user per periode
  - Donut distribusi status, on-time rate, cycle time, **Kemungkinan Penghambat**
    (> `teamspace_stuck_threshold_days`, default 40 - configurable, klik → buka kartu)
  - **Saran AI** (FR-1004): 1 paragraf via Claude API (`claude-haiku-4-5`), prompt
    angka-aktual anti-halusinasi, cache 24 jam; aktifkan via `teamspace_ai_enabled`
    + `anthropic_api_key` di app_settings
- **Cheers** (FR-1203, `/teamspace/cheers`): kirim apresiasi + notifikasi, kotak
  diterima/dikirim, leaderboard 30 hari
- **KPI snapshot harian** (§14.4): kolom teamspace di `kpi_snapshots`, di-upsert
  worker tiap 30 menit - dasar grafik tren
- **Open API scope `teamspace:read`** (FR-16xx): `/api/public/v1/teamspace/tasks`
  + `/teamspace/performance` untuk n8n/BI/AI (kartu Rahasia dikecualikan)

### Added - pelengkap Fase 2
- **Pengumuman bertarget** (FR-601..603): penerima terpilih (notifikasi hanya ke
  mereka), toggle **Rahasia** (staff lain tidak melihat sama sekali - filter
  server-side), **Selesai otomatis** (1/3/7 hari, status expired dianotasi)
- **View Kalender tugas** (FR-411): grid bulanan di Semua Tugas, kartu mini per
  tanggal tenggat dengan dot warna tim, klik → buka kartu
- **Recurring card** (FR-408) "Ulangi": harian/mingguan/bulanan per kartu - saat
  ditandai selesai, instance baru dibuat otomatis (checklist di-reset, tenggat
  digeser month-anchored, rule terbawa) + notifikasi

### Verifikasi
- typecheck 0 error · **426/426 unit test** (41 test Teamspace) · build produksi sukses
- Backlog tersisa (non-blocking): nested team tree UI, pencarian ⌘K konten
  Teamspace, voice note, Tiptap editor, WA digest - lihat PRD §3 Fase 3 opsional

---

## [v5.0.0-fase2] - 2026-07-17 - Teamspace Fase 2: Chat, Jadwal, Check-in, Dokumen & File

### Added
- **Chat Grup per tim** (FR-5xx): bubble WA-style + lampiran (gambar inline / file chip,
  validasi 25MB), panel Media (tab Media/Dokumen), unread badge di daftar tim & tab,
  hapus pesan (pengirim/manager, soft delete), polling 5s pause-on-blur
- **Jadwal tim** (FR-7xx): kalender **2 bulan berdampingan** gaya Cicle, event dengan
  pengulangan (harian/mingguan/bulanan - `shared/eventRecurrence`, monthly anchor-safe),
  peserta + notifikasi, toggle Rahasia (hanya peserta/pembuat), **feed iCal/webcal**
  per tim via token personal revocable (`calendar.ics?feedToken=`) untuk Google/Apple Calendar
- **Pertanyaan / Check-in rutin** (FR-8xx): jadwal per hari (Senin-Minggu) + jam,
  penerima terpilih, toggle Rahasia (jawaban hanya ke pembuat/manager), jawab inline,
  rekap per tanggal + completion rate; **worker scheduler** tick 60s (dedup harian,
  tahan downtime) mengirim notifikasi in-app + **WhatsApp via MPWA**
  (`TEAMSPACE_WORKER_ENABLED`, hormati `mpwa_enabled`)
- **Dokumen & File tim** (FR-9xx): folder/subfolder + breadcrumb, upload drag&drop /
  picker (multi-file), dokumen native **markdown + preview** (escape-safe), dokumen
  Rahasia via penerima terpilih (`content_recipients` polymorphic), arsip dokumen/file,
  streaming download terproteksi
- **TeamPage ber-tab** (FR-305): Ringkasan · Tugas · Chat · Jadwal · Pertanyaan ·
  Dokumen - mengikuti `enabledViews` tim, deep-link `?tab=`
- Permission keys baru: `team_chat`, `team_schedule`, `team_checkins`, `team_docs`
- shared murni + unit test: `checkinSchedule` (9 test), `eventRecurrence` + builder
  iCal RFC5545 (8 test)

### Notes
- Sisa Fase 2 (pengumuman bertarget+expiry - kolom DB sudah siap, view Kalender tugas,
  recurring card, nested team, pencarian ⌘K konten) + Fase 3 menyusul sesuai PRD §3
- Verifikasi: typecheck 0 error · 419/419 unit test · build produksi sukses

---

## [v5.0.0-fase1] - 2026-07-17 - Teamspace Fase 1: Tim + Board Tugas (PRD-JABNET-TEAMSPACE.md)

### Added
- **Modul Teamspace** (kolaborasi tim internal, pengganti Cicle):
  - **Tim & anggota**: tabel `teams` + `team_members` (role manager/member per tim), CRUD via `/api/teamspace/teams*`, guard "manager terakhir tidak bisa dihapus", arsip tim
  - **Board tugas per tim** di atas engine pipelines eksisting - pipeline milik tim (`pipelines.team_id`) di-provision otomatis saat tim dibuat dengan 4 list gaya Cicle: "To Do List / Dikerjakan / Selesai / Batal" (+ `semantic_type` per stage untuk laporan kinerja)
  - **RBAC 3 lapis** (`shared/teamAccess.ts`, 13 unit test): admin → manager per tim → creator → member+permission key; kapabilitas board tim diresolusi via keanggotaan di `getPipelineCapabilities` - isolasi dua arah dengan pipeline ops
  - **Checklist bertingkat** pada kartu (FR-406) dengan progress bar + badge board
  - **Label berwarna scoped per board** (FR-413) - palet 36 warna, picker + create inline di modal kartu
  - **Kartu**: tandai Selesai (`is_completed`/`completed_at` - dasar on-time rate), edit tenggat (datetime), **Rahasiakan** (`is_private` - hanya creator/assignee/follower/admin, enforced server-side di semua jalur baca), **Arsipkan** + daftar arsip, **Salin** (duplicate berikut label/checklist/assignee/values)
  - **Move permission per list** (FR-403): `pipeline_stages.move_permission` + enforcement di endpoint move (stage asal & tujuan)
  - **Semua Tugas** (`/teamspace/tasks`, FR-412): agregasi lintas tim batched (anti-N+1), view List + Tabel, filter nama/label/tim/kategori tanggal/"Tugas saya", 4 KPI tile
  - **Halaman**: TeamListPage (grid tim + buat tim), TeamPage (ringkasan hub + kelola anggota), AllTasksPage; group sidebar "Teamspace"; board tim di `/teamspace/boards/:id` (reuse PipelineBoardPage)
  - **Permission keys baru** group "Teamspace": `teams`, `team_tasks` + feature flag `teamspace` (auto-grant via migrasi permission eksisting)
- Migrasi startup idempotent `runTeamspaceMigrations()` (CREATE TABLE IF NOT EXISTS + ADD COLUMN via information_schema - konvensi codebase)

### Changed
- Gerbang fitur endpoint pipeline menerima key `pipelines` ATAU `team_tasks` (`requirePipelinesFeature`) - keamanan per-pipeline tetap di resolusi kapabilitas
- `GET /api/pipelines` menyembunyikan pipeline milik tim dari daftar ops (non-regresi pipeline leads/collections)
- `listCards` menyembunyikan kartu terarsip (kartu ops lama selalu `archived_at` NULL - perilaku tak berubah)
- `GET /api/pipelines/:id/cards` di-enrich `labels` + `checklistProgress` (batched)
- Link notifikasi kartu board tim mengarah ke `/teamspace/boards/:id`

### Notes
- Fase 2 (Chat, Pengumuman bertarget, Jadwal+iCal, Check-in via WA, Dokumen, view Kalender, recurring, nested team) dan Fase 3 (Laporan Kinerja+AI, Cheers, API scope) menyusul sesuai PRD §3
- Belum dideploy ke produksi - jalankan `npm run db` migration otomatis saat startup pertama

---

## [v4.2.8] - 2026-04-27 - Integration Audit & Auto-Pair ONT

### Added
- **KPI strip "Status Integrasi PPPoE & ONT"** di CustomersPage - 4 tile (Lengkap/PPPoE saja/ONT saja/Belum dihubungkan) + sub-row PPPoE & ONT online/offline counts, semua clickable filter
- **Filter dropdown "Integrasi"** dengan 8 opsi: all/fully/pppoe_only/ont_only/none/pppoe_online/pppoe_offline/ont_online/ont_offline
- **Tombol " Audit & Auto-Pair ONT"** di header KPI strip - buka dialog fuzzy match audit
- **IntegrationAuditDialog component** dengan: 4 KPI summary, filter pills (Semua/≥90/≥80/≥70%), per-customer candidate list dengan multiple match strategies, bulk select, apply pairing
- **4 fuzzy match strategy**: alphanumeric strip (95%), leading zero strip (92%), substring (80%), Levenshtein (70%)
- **Endpoint baru**:
  - `GET /api/customers/integration-audit` - fuzzy match analysis dengan 8s timeout untuk GenieACS fetch
  - `POST /api/customers/auto-pair-ont` - bulk save ontSerialNumber ke customer DB
- **Pre-fill auto-select** semua kandidat ≥90% saat dialog buka

### Changed
- Filter `filtered` useMemo dependencies sekarang include `filterIntegration`, `ontStatuses`, `onlineUsernames` untuk refresh ke status integrasi terbaru
- `clearAllFilters` + `activeFilterCount` + reset-page useEffect include `filterIntegration`

### Fixed
- Audit endpoint timeout - GenieACS fetch dibungkus `Promise.race` dengan 8s timeout supaya UI ngga gantung kalau host lambat
- `cn` import + duplicate `useQueryClient` import di CustomersPage

---

## [v4.2.7] - 2026-04-26 - Stage Advance Bug Fix + Pixel-Match Polish

### Fixed
- **CRITICAL BUG**: Stage tidak advance setelah teknisi tap "Selesaikan Stage" - stuck di stage yang sama
  - FE: hanya kirim `toStage` kalau stage isFinal, otherwise biarkan backend auto-advance
  - Backend: detect completingFinalStage (current=final & toStage=current) → close transition + mark resolved, ngga insert duplicate
  - Note/evidence/GPS sekarang attach ke CLOSING transition (data hasil), bukan entering baru
- `nextStageDefault` ngga lagi throw saat current = final (fallback ke current as completion target)
- React hooks order error di TechnicianWorkPage (useMemo setelah early return) - pindah hooks ke atas guard
- Pulse ring + 28x28 dot custom yang tidak match design - revert ke 24x24 dengan number, no pulse ring (mobile teknisi)
- Customer card padding inconsistent (`p-3.5` mix Tailwind) - replace dengan inline `padding: 14`
- Header padding kebalik (16x12 vs design 12x16) - fix exact

### Changed
- TechnicianWorkPage refactor jadi **inline styles literal** dari design source untuk minimize translation gap
- Stage row tint background pakai opacity 14% (8% literal dari `tpl.color + '08'` design)
- Pulse ring animation dipertahankan hanya di PortalTrackerPage (customer-facing) - sesuai design

### Verified End-to-End
- Stage 1 → 2 → 3 → 4 → 5 → 6 (final) advance flow tested via API + mobile UI
- Transitions table: closed transitions punya note/evidence/duration_sec, last (current) transition open
- Final stage completion → status=resolved + resolution dari note teknisi

---

## [v4.2.6] - 2026-04-26 - Jabnet Work Order Design System

### Added
- **Implementasi design "Jabnet Work Order"** - pixel-close dari Claude Design handoff (claude.ai/design)
- **6 workflow presets aligned dengan design**: psb (8 stages), gangguan (6), preventive (6), relokasi (6), upgrade (4), dismantle (4)
- **Stage `fields` array** - replace requires* booleans, support 10 field types: photo, checklist, notes, numeric, speedtest, barcode, signature, gps, eta, rating
- **TechnicianWorkPage two-screen flow**:
  - Screen 1: Stages list dengan progress dot + customer card + Navigasi/Phone CTA
  - Screen 2: Stage Execution - header gradient kategori + FieldCards conditional sesuai field types + Save Draft + Selesaikan Stage (emerald)
- **FieldCard components**: photo grid (3-cell + camera button), numeric input dengan unit pill + status indicator, barcode mono input + check, speedtest dark card 3-col, checklist tap-to-toggle, gps auto-capture, signature input + TTD area, rating 5-star, notes textarea
- **Customer Tracker page** `/portal/track/:ticketId`:
  - Hero gradient navy→blue dengan headline status dinamis
  - Teknisi card dengan rating + chat/call round buttons
  - Vertical timeline dengan pulse-ring animation di stage aktif
  - Update card dengan thumbnail foto preview
  - Chat overlay WhatsApp-style (mock untuk demo)
- **Backend endpoint** `GET /api/portal/tickets/:id/track` - full tracking data (ticket + stages + transitions + evidence + lead technician)
- **JABNET design tokens** di `client/index.css`:
  - `--jbn-navy/orange/success/warning/danger/info` + bg variants
  - `--jbn-cat-*` per-kategori stage colors
  - `.jbn-mono`, `.jbn-tabular`, `.jbn-pulse-ring` utility classes

### Changed
- Migration auto-re-apply preset kategori existing ke v4.2.6 fields format saat startup (skip kalau sudah migrated)
- Nama kategori default: warna disesuaikan dengan design palette (PSB navy #1e40af, Gangguan red, Preventive sky, Relokasi violet, Upgrade emerald, Dismantle slate)

### Schema Migrations (auto-run startup)
- `WorkflowStage.fields` - new optional array property (typed `StageFieldType`)
- Auto-re-apply 6 preset workflow ke ticket_categories existing (kalau belum punya v4.2.6 fields format)

---

## [v4.2.5] - 2026-04-26 - Action-Based Ticketing + Chatwoot

### Added - Action-Based Checkpoints (replace rigid stages)
- **8 action button** per tiket: depart/arrive/start_work/progress/pause/resume/escalate/complete + note
- **`ticket_checkpoints` table** (replaces stage rigid model)
- **Time metrics auto-derive**: travel = depart→arrive, setup = arrive→start_work, work = start_work→complete (minus pauses)
- **Smart action highlighting** di mobile UX - action paling relevan di-highlight primary, lainnya secondary/muted
- **State machine adaptive**: depart hilang setelah departed, resume muncul cuma kalau lagi paused
- **Endpoint baru**:
  - `POST /api/tickets/:id/checkpoint` - log action dengan validation requirement
  - `GET /api/tickets/:id/timeline` - checkpoints + time metrics

### Added - Chatwoot Integration
- **Webhook receiver** `POST /api/integrations/chatwoot/webhook` (public, HMAC-verified)
- **Auto-create tiket** dari conversation_created event berdasarkan keyword matching
- **Customer phone matching** dengan multi-format normalization (+62/0/8/62/raw)
- **Reverse linking**: callback ke Chatwoot set `jabnet_ticket_id` + `jabnet_ticket_url` custom_attributes
- **Auto-notify** saat tiket selesai (private note ke Chatwoot conversation)
- **Auto-notify checkpoint** untuk depart/arrive/complete (private note untuk relay manual ke customer)
- **Idempotent**: same conversation_id ngga bikin duplicate
- **Schema**: `chatwoot_config`, `chatwoot_keyword_rules`, `chatwoot_ticket_links`
- **Default keyword rules seed**: gangguan keywords → Gangguan/high · install keywords → Pemasangan/medium
- **Frontend**: ChatwootIntegrationCard di IntegrationPage dengan:
  - Form connection (URL, account_id, api_token, webhook_secret) dengan eye-toggle untuk sensitive fields
  - Test koneksi button
  - Webhook URL display + copy button
  - Keyword rules CRUD (add/delete dengan kategori + priority selector)
  - Cara setup guide collapsible

### Changed
- **TechnicianWorkPage rewrite** dari stage-driven ke action-driven
- Activity timeline jadi chronological reverse-order dengan icon-coded checkpoint
- Bottom sheet advance jadi universal (semua action pakai sheet yang sama)

### Auth Bypass List Updated
- `/api/integrations/chatwoot/webhook` di-skip dari auth + globalWriteGuard
- HMAC-SHA256 signature verification di handler kalau secret di-set

### Schema Migrations (auto-run startup)
- New table: `ticket_checkpoints` (action + timestamp + note + evidenceId + GPS + metadata)
- New tables: `chatwoot_config`, `chatwoot_keyword_rules`, `chatwoot_ticket_links`
- Auto-seed: 1 row default config (disabled) + 2 keyword rules (gangguan + install)
- Legacy tables `ticket_stage_transitions` di-keep untuk backward compat (v4.2.4 data)

---

## [v4.2.13] - 2026-04-29 - Customer Portal Domain Split

### Added
- **Customer Portal pindah ke `portal.jabnet.id`** - domain dedicated terpisah dari staff workspace
- **Frontend domain detection** di `App.tsx` - saat hostname=portal.jabnet.id, routing dibatasi ke `/portal/*` saja, sidebar staff disembunyikan
- **Backend host guard** middleware - block staff API dari portal domain (return 404)
- **Nginx vhost** `portal.jabnet.id` reverse proxy ke `localhost:3002`
- **SSL Let's Encrypt** via certbot untuk portal.jabnet.id
- Domain lama `fiber-tools.arkanova.id/portal/*` tetap accessible (backward compatible)

### Changed
- **MPWA templates** auto-update: `welcome_new_customer` dan `sahabat_perunggu` link sekarang `https://portal.jabnet.id`
- **SahabatKitDialog** QR code default ke `portal.jabnet.id`

### Fixed
- (v4.2.12 carryover) Parser GenieACS WAN Connections - iterate `WANPPPConnection.1-4` + `WANIPConnection.1-4` (ZTE F660 register PPPoE di slot `.2`)
- (v4.2.11 carryover) Parser GenieACS PPPoE detection - prioritas `VirtualParameters.pppoeUsername`, lalu nested 8×4
- (v4.2.10 carryover) PON Serial Number derivation dari `VirtualParameters.PonMac`
- (v4.2.9 carryover) Search di Perangkat ONT - kirim search query ke backend (filter cross-page)

---

## [v4.2.4] - 2026-04-26 - Ticketing Workflow Stages

### Added
- **Workflow stages flexible per kategori** - JSON array di `ticket_categories.workflow_stages` (key/label/icon/color/requiresPhoto/requiresGps/requiresNote/requiresSignature/slaMinutes/isFinal/sortOrder)
- **4 preset workflow**: gangguan, install, migrasi, survey - auto-seed + auto-backfill kategori existing
- **Per-stage time tracking** - table `ticket_stage_transitions` log enteredAt/exitedAt/durationSec/note/evidenceId/GPS
- **TechnicianWorkPage rewrite total** - vertical timeline + big sticky CTA + bottom sheet advance dengan camera-first capture
- **Quick actions di customer card mobile**:  Telepon · WA ·  Navigate (Google Maps directions)
- **Live SLA countdown banner** mobile + admin (gradual color hijau→merah)
- **Admin workflow preview** - expand kategori untuk lihat semua stage + Apply Preset button
- **Admin SLA badge** di list view (kolom status) + detail dialog header
- **Admin workflow timeline** di detail dialog - vertical progress dengan per-stage durasi
- **Endpoint baru**:
  - `GET /api/tickets/:id/workflow` - stages + transitions + SLA countdown
  - `POST /api/tickets/:id/advance-stage` - validate requirement, atomic state machine
  - `GET /api/tickets/:id/stage-transitions` - per-stage history
  - `GET /api/odps/:id/active-tickets` - active tickets + past resolution patterns di ODP

### Changed
- **Disciplined state machine** - advance stage validate per-stage requirement (no more free-form status update)
- **Auto-SLA deadline** saat create tiket (was: never set despite field existing)
- **Auto-status derive** dari stage: stage isFinal → status=resolved, advance dari open/assigned → in_progress
- **Customer card mobile** redesign jadi 3-column quick actions (Telepon/WA/Map)
- **Category dialog** redesign: expand untuk preview workflow + apply preset + edit SLA hours

### Fixed
- `slaDeadline` field tidak pernah di-calculate di create ticket (existing bug)
- Status transitions tidak pernah ada validation (existing gap - bisa jump status)
- TechnicianWorkPage UX sulit dipakai mobile teknisi lapangan (redesign total)

### Schema Migrations (auto-run startup)
- `ticket_categories.workflow_stages TEXT`
- `tickets.current_stage TEXT`, `tickets.stage_entered_at TEXT`
- New table `ticket_stage_transitions`
- Backfill `workflow_stages` untuk 5 kategori existing (detect by name)
- Backfill `current_stage` untuk tiket existing (status-based mapping)

---

## [v4.2.3] - 2026-04-26 - Boost Auto-Rollback Safety

### Added
- **Atomic revert flow**: worker dedicated 60 detik di `server/index.ts` - revert MikroTik DULU, baru mark expired
- **Retry mechanism**: kalau revert gagal, status tetap `active`, increment `revertAttempts`, retry next loop
- **Critical alert**: log `CRITICAL` setelah 10× gagal berturut-turut
- **Schema columns** di `point_redemptions`: `reverted_at`, `revert_error`, `revert_attempts`
- **Admin health UI**: alert banner di tab Speed Boost menampilkan redemption gagal revert + tombol Force Expire
- **Force Expire button**: muncul di redemption stuck (revertAttempts > 0), wajib alasan untuk audit
- **Endpoint baru**:
  - `GET /api/loyalty/admin/points/redemptions/health` - list redemption dengan revert issues
  - `POST /api/loyalty/admin/points/redemptions/:id/force-expire` - admin override

### Changed
- Verify dialog reminder: "auto-revert belum tersedia" → "✓ Auto-MikroTik aktif"
- Cancel/Hentikan dialog: confirm sekarang sebut nama profile asli yang akan di-revert
- Expire-overdue endpoint: response include `revertFailed` + `failures[]` array
- Worker expire: dipindah dari billing-sync-worker ke dedicated 60s loop di index.ts
- Toast manual expire: pakai `toast.warning` kalau ada revert fail

### Fixed
- **CRITICAL**: Customer dapat boost gratis selamanya kalau MikroTik offline saat expire (status DB di-mark expired tanpa revert profile)
- WA notif `sahabat_boost_expired` tidak lagi false-positive - hanya kirim setelah revert benar-benar sukses

---

## [v4.2.2] - 2026-04-26 - Speed-on-Demand & Marketing Daily Insights

### Added
- **Speed-on-Demand point system**: customer earn point dari bayar tepat waktu/early, tukar untuk speed boost sementara (2× / 3× lipat 6 / 24 jam)
- **Schema baru**: `point_transactions` (audit ledger), `point_redemptions` (lifecycle), 3 kolom point di `customer_loyalty`
- **Loyalty backfill**: auto-grant initial pts ke customer existing berdasarkan tenure (parse `MMYYNNNNN`)
- **Customer portal Boost tab**: hero balance, catalog, live countdown, celebration banner saat aktivasi
- **Admin Speed Boost tab**: KPI bar, redemption list, Verify/Tolak/Cancel actions, Pengaturan dialog
- **Pengaturan Loyalty Point dialog**: customize earn rules + catalog CRUD (per-event/promo)
- **MPWA template**: `sahabat_boost_activated`, `sahabat_boost_expired`, `sahabat_boost_rejected`
- **Public API endpoint**: `GET /api/public/v1/marketing/daily-report` untuk bot Telegram/BI tool
- **Auto-expire worker**: jalan tiap billing-sync cycle, kirim WA notif ke customer

### Changed
- Tab Speed Boost UI redesign telco-mature: flat KPI, hairline divider, segmented filter
- Pengaturan dialog: dark gradient header → light, form rows label-led
- Lead Pipeline drawer: Hapus button dipindah ke footer "Zona Berbahaya" (cegah misclick di sebelah close X)
- Portal Boost tab: polling interval 30s → 10s untuk faster transition detection

### Fixed
- DOM nesting warning di IntegrationPage Meta CAPI card (`<p><Badge>` → `<div>`)
- Filter auto-switch ke "Aktif" setelah verify redemption

---

## [v4.0.0] - 2026-04-14 - Field Service Management, Permissions & Full Workflow

### Highlights
- Work Order Enhancement: tim teknisi (senior+junior), GPS check-in/out, foto evidence, checklist, MTTR tracking
- Halaman Teknisi (`/work/:id`): mobile-first field operation page
- Flexible Permission System: checklist hak akses per user per fitur (31 permissions)
- Riwayat Canvassing: KPI, leaderboard, geo-based ODP coverage tracking
- Landing Page Lead Capture: form pendaftaran + WhatsApp CTA di coverage check
- Meta Conversions API: tracking Lead + Purchase events otomatis
- Marketing Ads: ODP cluster targeting, audience export, webhook lead capture

### Fitur Baru

**Work Order / Field Service Enhancement**
- Tim teknisi per tiket: lead (senior) + helper (junior) assignment
- GPS Check-in/Check-out: verifikasi lokasi saat tiba dan selesai
- Foto Evidence: before/during/after + power meter + ONT serial, geotagged
- Checklist interaktif per jenis tiket (template dari kategori)
- SLA Timer: countdown per tiket berdasarkan prioritas
- MTTR otomatis: Response Time, Work Time, Total Time
- Halaman teknisi mobile-first (`/work/:id`): timer kerja, capture foto dari kamera, GPS tracking
- Status flow: Baru → Dijadwalkan → Dalam Perjalanan → Dikerjakan → Selesai → Diverifikasi
- Infrastruktur link: tiket terhubung ke ODP + POP + ODC

**Flexible Permission System**
- 31 permission keys grouped dalam 7 kategori
- Checklist hak akses per user di form manajemen user
- 5 preset template: Admin, Operator, Marketing, Billing & NOC, Viewer
- Sidebar menu filter otomatis berdasarkan permissions user
- Admin bypass semua permission (otomatis full access)
- Server-side guard: hasPermission() + requirePermission()

**Riwayat Canvassing (`/canvassing/history`)**
- KPI: sesi bulan ini, lead per sesi, conversion rate, ODP tercanvass
- ODP coverage geo-based: hitung radius 200m dari aktivitas canvassing ke ODP
- Daftar ODP belum tercanvass (prioritas target canvassing)
- Session history: user, durasi, area, lead count, closing count
- Detail expand: leads (stage badge), field reports (severity badge)
- Leaderboard tim: ranking per marketing, progress bar

**Landing Page + Meta CAPI**
- Form pendaftaran di coverage check: nama, WA, alamat (auto-fill), paket
- Auto-create lead di pipeline (source: landing_page)
- Tombol WhatsApp langsung setelah daftar
- Meta Conversions API: trackLead (saat daftar) + trackPurchase (saat jadi pelanggan)
- Config Pixel ID + Access Token di halaman Integrasi API

**Marketing Ads Module**
- ODP Clustering: auto-group ODP berdekatan, budget recommendation per cluster
- Audience Export: Exclude (SHA-256), Lookalike Seed, Geo-Target JSON
- Webhook: Meta Lead Ads + TikTok Lead Gen → auto Lead Pipeline
- Dashboard: KPI lead dari ads per source

### Bug Fixes & Optimizations
- Fix sidebar: menu item highlight exact match (tidak overlap /canvassing vs /canvassing/history)
- Fix riwayat aktivitas: parse JSON content untuk assigned/converted (bukan raw JSON)
- Fix monitoring traffic chart: pindah side effect dari select ke queryFn
- Fix canvassing map mobile: viewport-based ODP rendering + MarkerClusterer saat zoom out
- Fix lead edit: owner-only permission check
- Hapus billing sync (app ini jadi induk billing)
- Audit query key: fix semua cross-page invalidation mismatch

### Schema Changes
- Users: +`permissions` (JSON array)
- Tickets: +`popId`, `odcId`, `checklist`, `slaDeadline`, `dispatchedAt`
- Ticket Categories: +`checklistTemplate`, `slaHours`
- Tabel baru: `ticket_team`, `ticket_evidence`, `ticket_gps_logs`

---

## [v3.1.0] - 2026-04-12 - GenieACS, Marketing Ads & Workflow Finalisasi

### Highlights
- Integrasi GenieACS TR-069 untuk manajemen perangkat ONT/CPE
- Marketing Ads module: geo-targeted audience export + webhook lead capture
- Unifikasi Pelanggan + PPPoE (auto-sync ke MikroTik)
- Konversi Lead → Pelanggan 1-klik + auto Work Order
- Customer ID auto-generate (format YYMMCKKNNNNN)
- Halaman Integrasi API dengan konfigurasi aktif

### Fitur Baru

**GenieACS TR-069 Integration**
- API client untuk GenieACS NBI (device list, detail, summon, reboot, refresh)
- Halaman Perangkat ONT: 730+ devices, stats online/offline, search, pagination
- Detail device 5 tabs: Overview, WAN Connections, WiFi, Connected Devices, Actions
- WAN Connection management: tambah + edit koneksi PPPoE/IP langsung via TR-069
- WiFi edit: ubah SSID + password langsung ke device
- Tag management: add/remove tags
- Bridge PPPoE username → pelanggan (auto-match)
- Light parser untuk performa (700+ devices dalam <1 detik)
- Integrasi ke halaman Pelanggan: kolom ONT status (online/offline + RX power)

**Marketing Ads Module**
- ODP Clustering: auto-group ODP berdekatan (<500m), hitung kapasitas, budget recommendation
- Audience Export: Exclude (SHA-256), Lookalike Seed (value-based), Geo-Target (JSON clusters)
- Webhook Meta Lead Ads: auto-parse → Lead Pipeline
- Webhook TikTok Lead Gen: auto-parse → Lead Pipeline
- Dashboard KPI: lead dari ads, closing, konversi, conversion rate per source
- Priority targeting berdasarkan utilisasi ODP (high/medium/low/skip)

**Workflow Automation**
- Konversi Lead → Pelanggan: 1-klik dari pipeline "won" stage
- Auto-fill data lead (nama, telp, alamat, GPS, ODP)
- Auto-generate Customer ID: format YYMMCKKNNNNN (tahun+bulan+cycle billing+kecamatan+urut)
- Auto-create PPPoE di MikroTik saat konversi
- Auto-generate Work Order "Pemasangan Baru"
- Traceability: customer.leadId → lead asal

**Halaman Integrasi API (Enhanced)**
- Form konfigurasi aktif per integrasi (Google Maps, MikroTik, GenieACS, Export/Import)
- Real-time connection test (cek koneksi setiap 60 detik)
- Status badge: Terhubung/Tidak Aktif/Belum Dikonfigurasi (berdasarkan test koneksi real)
- Billing sync card dihapus (app ini sekarang jadi induk billing)

### Bug Fixes
- Fix peta: customer markers dipisahkan dari MarkerClusterer (tidak bentrok angka dengan ODP)
- Fix query key mismatch: canvassing→leads, lead→customers, ticketing→dashboard
- Fix GenieACS WAN Connections: val() parser mengembalikan object bukan string
- Fix dialog konversi lead: z-index conflict dengan drawer (pindah ke page level)
- Fix GenieACS config: form value tidak tersimpan (double /api prefix + input binding)
- Fix performance: light parser + projection query untuk 730+ devices
- Fix tabel Perangkat ONT: responsive mobile + quick actions (summon/reboot per row)

### Schema Changes
- Customers: +`ont_serial_number`, +`lead_id`
- Tabel baru: `app_settings`, `ticket_categories`, `tickets`, `ticket_activities`

### Dependencies
- `routeros-client` v1.1.1 (MikroTik binary API)

---

## [v3.0.0] - 2026-04-10 - MikroTik Billing Integration, Work Order & Workflow Automation

### Highlights
- Integrasi penuh MikroTik RouterOS API (binary protocol) untuk billing & PPPoE
- Auto-sync pelanggan ke MikroTik PPP Secret (create/update/delete/isolir)
- Sistem Work Order / Ticketing terintegrasi pelanggan
- Konversi otomatis Lead → Pelanggan + PPPoE + Work Order (1-klik)
- Halaman Integrasi API dengan konfigurasi aktif
- Live Monitoring dashboard (CPU, RAM, Traffic, Logs real-time)

### Fitur Baru

**Billing & MikroTik**
- Integrasi RouterOS API via `routeros-client` (binary protocol, port 8728)
- Router MikroTik CRUD + test koneksi + system resource monitoring
- Paket Internet: CRUD PPP Profiles langsung dari MikroTik
- Sesi Aktif PPPoE: monitoring real-time + disconnect sesi
- Monitoring: CPU/RAM/Disk, interface stats, traffic chart (recharts), log viewer
- Simple Queue CRUD, DHCP leases, ARP table, IP neighbors, firewall address-list
- Auto-sync pelanggan → MikroTik: create/update/delete/isolir PPP Secret otomatis
- PPPoE fields di form pelanggan (router, profile, username, password)
- Detail dialog pelanggan dengan tab Info + PPPoE (status online/offline)

**Work Order / Ticketing System**
- Tabel: ticket_categories, tickets, ticket_activities
- 5 kategori default: Pemasangan Baru, Gangguan, Preventive Maintenance, Relokasi, Upgrade Paket
- Kategori custom: nama, warna, icon, sort order, aktif/nonaktif
- Auto-numbering: TKT-2026-0001
- Stats dashboard: Open, Dikerjakan, Tertunda, Selesai Bulan Ini
- Filter: search, status, kategori, prioritas
- Detail dialog: info tiket, status buttons, activity timeline, catatan
- Jadwal + estimasi durasi wajib per tiket
- Assign ke petugas + activity log otomatis

**Workflow Automation**
- Konversi Lead → Pelanggan (1-klik dari pipeline stage "won")
- Prefill data lead: nama, telepon, alamat, GPS, ODP terdekat
- Auto-assign port ODP
- Auto-create PPPoE di MikroTik
- Auto-generate Work Order "Pemasangan Baru"
- Duplicate prevention + traceability (customer.leadId)
- Badge "Pelanggan" di lead pipeline untuk lead yang sudah dikonversi

**Integrasi & Tools**
- Halaman Integrasi API: konfigurasi Google Maps, MikroTik, Billing, Export/Import
- Tabel app_settings untuk konfigurasi key-value
- Form aktif: API key, webhook URL, API token, auto-sync toggle
- Referensi API internal (35 endpoint terdokumentasi)
- Panduan setup step-by-step per integrasi

**Sidebar & Navigasi**
- Pelanggan dipindahkan ke group Billing & MikroTik
- Group "Manajemen" → "Integrasi & Tools"
- Menu Work Order di Billing & MikroTik
- BottomNav diupdate untuk billing items

### Bug Fixes
- Fix peta: customer markers dipisahkan dari MarkerClusterer agar tidak bentrok angka cluster dengan ODP
- Fix TypeScript: PppSession type compatibility dengan routeros-client camelCase fields
- Fix SystemResource dialog: support both camelCase dan dash-case field names

### Schema Changes
- Tabel baru: `app_settings`, `ticket_categories`, `tickets`, `ticket_activities`
- Customers: +`pppoe_password`, `pppoe_profile`, `pppoe_router_id`, `pppoe_mikrotik_id`, `lead_id`
- MikroTik routers: existing dari v2.6.0

### Dependencies
- `routeros-client` v1.1.1 (MikroTik API binary protocol)

---

## [v2.6.0] - 2026-04-09 - Profil Pengguna, Manajemen Tim Scalable & Coverage Publik

### Highlights

Rilis ini memperkuat **manajemen tim/HR** dan **self-service profil**, memindahkan **Cek Coverage ke halaman publik** (tanpa login), serta merapikan keseluruhan sidebar dan navigasi.

### Halaman Profil Saya (BARU) - `/profile`

- Halaman profil pribadi yang dapat diakses oleh **semua role** dengan mengklik kartu user di sidebar.
- **Hero card** dengan cover gradient + avatar mengambang, badge role/status/jabatan/cabang, dan deskripsi role.
- **4 stat strip**: Tanggal Bergabung · Login Terakhir · Cabang · **Persentase Kelengkapan Profil** (progress bar berwarna).
- **Data Pribadi** (editable sendiri): Nama, Email, No. HP/WhatsApp, Tanggal Lahir, Alamat, Kontak Darurat.
- **Data Tim & Jabatan** (read-only, dikelola admin): Employee ID, Jabatan, Departemen, Cabang, Tanggal Bergabung Tim, Role Sistem.
- **Catatan dari Admin** - section khusus muncul jika admin menambahkan catatan.
- **Ubah Password** dengan password strength meter 4-kriteria (panjang, huruf besar, huruf kecil, angka), validasi server-side, dan kemampuan toggle visibility.

### Manajemen User - Total Redesign untuk Skalabilitas

**Backend (`/api/users` POST/PUT)**:
- 11 field HR baru: `email`, `phone`, `employeeId`, `position`, `department`, `branch`, `address`, `joinDate`, `birthDate`, `emergencyContact`, `notes`.
- Validasi email & nomor HP (regex) di server.
- Auto migration `ALTER TABLE` di startup - tidak perlu reset DB.
- Endpoint baru `PATCH /api/auth/me` (self-service) dan `POST /api/auth/change-password`.

**Frontend (`UsersPage`)**:
- **4 stat cards** di header: Total User, Akun Aktif, Nonaktif, Administrator.
- **Role distribution chips** interaktif - klik untuk quick filter per role.
- **Filter bar lengkap**: search multi-field, filter role, filter status, sort (nama/terbaru/login/role), toggle Grid ↔ Table view.
- **Grid view** (UserCard) dengan info padat per user.
- **Table view** responsif dengan kolom adaptif per breakpoint.
- **Detail dialog**: hero card + grid Data Pribadi/Tim + metadata + catatan admin + toolbar aksi.
- **Create/Edit dialog dengan 3 tab**: Akun & Akses · Data Pribadi · Data Tim - semua field HR bisa diisi dari satu tempat.
- **Self-protection**: admin tidak bisa menonaktifkan/menghapus akun sendiri.

### Cek Coverage - Sekarang PUBLIK (`/coverage-check`)

- **Dipindahkan ke luar ProtectedRouter** - bisa diakses tanpa login oleh tim sales, customer, atau pihak ketiga.
- Endpoint `/api/coverage-check` dipindah ke **sebelum auth guard**.
- **`PublicShell` wrapper** baru dengan link "Login Staff".
- **Marker pin merah** (SVG teardrop) menggantikan circle marker biru sebelumnya.
- Link akses ditambahkan di **halaman login** dengan copy profesional.

### Sidebar - Refactor & Polishing

- **User card di sidebar sekarang clickable** → membuka `/profile` dengan active state styling.
- **Frozen footer dihilangkan** - kartu user, Dark Mode, dan Logout sekarang scrollable bersama nav.
- ChevronRight indicator pada user card sebagai affordance navigasi.
- "Cek Coverage" dihapus dari menu navigasi (sudah pindah ke public).

### Bug Fixes

- **Peta Jaringan blank** - fixed `no such column "district"` (POPs) dan `no such column "is_static"` (Customers) dengan auto migration di `storage.ts`.
- **Endpoint `/api/auth/me`** sekarang mengembalikan profil lengkap dari storage.
- **Build production** - fix esbuild bundling Vite ke output server. Build script sekarang pakai ESM output (`dist/index.mjs`) dengan `--packages=external`.

### Schema Changes (auto-migrated)

```sql
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN employee_id TEXT;
ALTER TABLE users ADD COLUMN position TEXT;
ALTER TABLE users ADD COLUMN department TEXT;
ALTER TABLE users ADD COLUMN branch TEXT;
ALTER TABLE users ADD COLUMN address TEXT;
ALTER TABLE users ADD COLUMN join_date TEXT;
ALTER TABLE users ADD COLUMN birth_date TEXT;
ALTER TABLE users ADD COLUMN emergency_contact TEXT;
ALTER TABLE users ADD COLUMN notes TEXT;
```

### Upgrade Notes

1. Extract zip ke direktori baru (atau backup yang lama dulu).
2. Copy `data.db` lama ke direktori baru (skema akan auto-migrate saat server start).
3. Jalankan `npm install` untuk install dependencies.
4. Jalankan `npm run dev` (development) atau `npm run build && npm start` (production).
5. Login → klik **kartu user di sidebar** → buka **Profil Saya** → lengkapi data pribadi.
6. (Admin) Buka **Manajemen User** → edit setiap user → isi tab **Data Pribadi** dan **Data Tim**.

---

## [v2.5.0] - 2026-04-07 - Cek Lokasi Coverage (Tool Internal CS)

### Fitur Baru: Halaman Cek Coverage untuk Customer Service

**Tujuan**: Memberi tim Customer Service tool internal untuk dengan cepat mengecek apakah suatu lokasi calon pelanggan tercover jaringan FTTH JABNET dan ODP mana yang harus dipakai. Halaman ini diakses **setelah login**, bukan publik.

> **Catatan iterasi**: Fitur ini awalnya didesain sebagai tool publik di halaman login (untuk calon pelanggan self-service), tapi setelah review dianggap lebih cocok sebagai **tool internal CS**. Endpoint publik dan form pendaftaran lead anonymous dihapus, fitur direlokasi ke halaman terproteksi `/coverage-check` dengan informasi yang jauh lebih kaya.

### UI: `CoverageCheckPage` (`/coverage-check`)

- **4 metode input lokasi target** (semua bisa dipakai):
  1. **Klik di peta interaktif** Google Maps (paling intuitif)
  2. **Search alamat** dengan Google Places Autocomplete (komponen dari `@react-google-maps/api`, restrict ke Indonesia)
  3. **Tombol GPS "Lokasi Saya"** via `navigator.geolocation`
  4. **Input manual lat/lng** (untuk paste koordinat dari WhatsApp share location)

- **Visualisasi peta**:
  - Marker biru di lokasi target
  - Lingkaran radius coverage 250 m (transparan biru)
  - Auto-pan & zoom ke lokasi target setelah cek

- **Panel hasil** (3 card stack):
  1. **Verdict** - 4 status warna:
     - `covered` (≤ 250 m + port available)
     - `covered_full` (≤ 250 m tapi penuh)
     - `marginal` (250-500 m)
     - `out_of_coverage` (> 500 m)
  2. **ODP Terbaik (Rekomendasi)** - ODP terdekat yang masih punya port available + active:
     - Nama, kode, alamat, kecamatan/desa, splitter type, status
     - Badge kapasitas (port tersedia / total)
     - **Estimasi power budget** otomatis dihitung dari jarak: total loss (dB), RX power (dBm), status (ok/warning/fail)
     - Asumsi yang dipakai: feeder loss + splitter ODP + 2 splice + 2 connector
  3. **Top 5 ODP terdekat** - list tabular berisi alternatif:
     - Ranking nomor (#1 highlighted), nama + kode + jarak
     - Progress bar utilization (hijau/amber/merah)
     - Badge "in-radius" jika dalam coverage 250 m

- **Layout responsive**: 12-column grid (peta 7 kolom + panel 5 kolom di desktop, stack di mobile)

### Backend Changes (`server/routes.ts`)

- **Endpoint baru `POST /api/coverage-check`** (auth-protected, semua role login)
  - Input: `{ lat, lng }`
  - Output:
    ```ts
    {
      target: { lat, lng },
      coverageRadiusMeters: 250,
      verdict: "covered" | "covered_full" | "marginal" | "out_of_coverage",
      nearestOdps: NearbyOdp[],   // top 5 sorted by distance
      recommended: NearbyOdp & { powerBudget: PowerBudget } | null
    }
    ```
  - Compute jarak haversine ke semua ODP, sort, ambil top 5
  - Rekomendasi = ODP terdekat dengan `availablePorts > 0` && `status === "active"` (fallback ke terdekat kalau semua penuh)
  - Power budget pakai `calculatePowerBudget()` dari `shared/schema.ts`: `fiberKm = jarak/1000`, `splitter = odp.splitterType` (default `1:8`), `splices=2`, `connectors=2`

- **Konstanta `COVERAGE_RADIUS_METERS = 250`** (drop cable standar FTTH)

### Perubahan dari iterasi sebelumnya yang dihapus

- Section "Cek Lokasi Coverage FTTH" di `LoginPage.tsx` (revert ke versi original - login form saja)
- `POST /api/public/check-coverage` (replaced dengan `/api/coverage-check` auth-protected)
- `POST /api/public/leads` (lead form anonymous tidak diperlukan untuk tool internal)
- Rate limiting publik (`publicRateBuckets`, `checkPublicRateLimit`) - tidak relevan karena auth-protected
- Bounding box geografis (`PUBLIC_LAT_RANGE`, `PUBLIC_LNG_RANGE`) - internal user bisa cek dimanapun
- Exception `/public/` di global auth guard

### File yang berubah

| File | Perubahan |
|---|---|
| `client/pages/CoverageCheckPage.tsx` | **NEW** - halaman tool internal |
| `client/pages/LoginPage.tsx` | Revert ke versi original (hapus section coverage check) |
| `client/App.tsx` | Tambah lazy import + route `/coverage-check` |
| `client/components/layout/Sidebar.tsx` | Tambah menu "Cek Coverage" di group UTAMA (icon Compass, tanpa role restriction) |
| `server/routes.ts` | Hapus 2 endpoint publik, tambah `POST /api/coverage-check` |
| `CHANGELOG.md` | Update entry v2.5.0 dengan pivot |

### Akses

- Group `UTAMA` di Sidebar (tanpa role restriction) → semua role login bisa akses (admin, operator, marketing, marketing_spv, viewer)
- Endpoint `/api/coverage-check` di-protect oleh global auth guard

---

## [v2.4.2] - 2026-04-07 - Customer Field Protection from Billing Sync

### Fitur Baru: Proteksi Field Manual

**Masalah yang dipecahkan**: Sebelumnya, setiap kali sync billing dijalankan, semua field pelanggan (alamat, koordinat, kecamatan, desa, dll) akan ditimpa data dari billing JABNET - termasuk perbaikan manual yang sudah dilakukan operator.

**Solusi**: Sistem auto-detect field-level protection.

- **Auto-Detect Manual Override**
  - Saat user mengedit pelanggan via FTTH Tools, sistem otomatis mendeteksi field mana yang berbeda dari data billing
  - Field yang diubah otomatis ditandai sebagai "manual override" dan disimpan di kolom baru `manual_overrides` (JSON array)
  - Tidak perlu klik checkbox atau lock manual - cukup edit, otomatis terlindungi

- **Sync Billing Sekarang Aman**
  - Saat sync billing, sistem akan **skip** field yang sudah ditandai sebagai manual override
  - Field operasional (status aktif/isolir, harga billing, status invoice, tanggal instalasi, PPPoE username) **tetap diperbarui** karena ini data billing operasional
  - Field yang dilindungi: nama, telepon, email, alamat, lat, lng, paket, kecamatan, desa/kelurahan, jenis pelanggan

- **UI Indikator Lock**
  - Icon gembok  di samping nama pelanggan yang memiliki field dilindungi
  - Hover tooltip: list field yang dilindungi
  - Banner di atas tabel: "X pelanggan memiliki field yang dilindungi"
  - Filter " Field Dilindungi" di filter Khusus

- **Tombol Buka Proteksi (Unlock)**
  - Icon unlock di tabel row untuk pelanggan yang memiliki proteksi
  - Dialog konfirmasi menampilkan list field yang akan dibuka
  - Setelah dibuka, sync billing berikutnya akan menimpa field-field tersebut
  - Berguna untuk reset ke data billing jika edit manual sudah tidak diperlukan

- **Info Panel di Form Edit**
  - Saat tidak ada lock: panel biru info "Proteksi Sync Otomatis" - menjelaskan field yang diedit akan otomatis dilindungi
  - Saat ada lock: panel kuning menampilkan badge field yang dilindungi + cara reset

### Backend Changes

- **Schema**: Tambah kolom `manual_overrides TEXT` di tabel `customers` (auto-migration)
- **`storage.updateCustomer()`**: Auto-detect changed billing-synced fields, append ke manualOverrides
- **`storage.upsertCustomerFromBilling()`**: Skip field yang ada di manualOverrides saat update
- **`storage.clearCustomerOverrides()`**: Method baru untuk reset overrides (semua atau spesifik)
- **API baru**: `POST /api/customers/:id/clear-overrides` - buka proteksi field

### Flow Lengkap

1. Operator sync billing → 700 pelanggan masuk dengan data billing
2. Operator edit alamat pelanggan #123 di FTTH Tools (alamat di billing salah/tidak lengkap)
3. Sistem otomatis mark `address` sebagai manual override untuk pelanggan #123
4. Besok operator sync billing lagi → semua field pelanggan #123 di-update **kecuali** alamat (karena sudah dilindungi)
5. Status billing, harga, isolir, dll tetap update normal
6. Jika nanti billing alamatnya benar, operator klik  unlock → sync berikutnya alamat akan ditimpa lagi

---

## [v2.4.1] - 2026-04-06 - Customer Filters, District View & Pagination

### Fitur Baru

- **Halaman Pelanggan - Filter Komprehensif**
  - Filter Kecamatan: dropdown semua kecamatan dari data pelanggan aktual, dengan jumlah pelanggan
  - Filter Desa/Kelurahan: cascading dari kecamatan terpilih
  - Filter Jenis Pelanggan: Rumahan / Bisnis
  - Filter Paket Layanan: dari data pelanggan yang ada
  - Filter ODP: pilih pelanggan per ODP
  - Filter Khusus: Belum Lunas, Lunas/OK, Belum Ada ODP
  - Pencarian diperluas: sekarang include kecamatan & desa/kelurahan
  - Toggle panel filter: bisa buka/tutup, badge jumlah filter aktif
  - Reset semua filter dengan satu klik

- **Ringkasan per Kecamatan (District View)**
  - Kartu per kecamatan dengan total pelanggan, aktif, isolir, jumlah desa
  - Progress bar visual aktif vs isolir per kecamatan
  - Expand untuk lihat detail desa/kelurahan: total, aktif, isolir per desa
  - Breakdown jenis pelanggan (Rumahan/Bisnis) per kecamatan
  - Klik "Filter" untuk langsung filter tabel ke kecamatan tersebut
  - Klik "Lihat" pada desa untuk filter ke desa spesifik

- **Pagination**
  - Pilihan 25 / 50 / 100 / 200 per halaman (default 50)
  - Navigasi halaman: first, prev, page numbers, next, last
  - Info "Menampilkan X-Y dari Z"
  - Auto-reset ke halaman 1 saat filter berubah

- **Sorting Tabel**
  - Klik header kolom: Nama, Kecamatan, Paket, Status
  - Toggle ascending/descending dengan visual indicator

- **Stats Cards Diperluas**
  - 6 kartu stats: Total, Aktif, Isolir, Non-Aktif, Rumahan, Bisnis
  - Klik kartu untuk langsung filter

- **Export CSV Pelanggan**
  - Export dengan semua kolom: ID, Nama, Jenis, Paket, Status, Telepon, Email, Alamat, Kecamatan, Desa, ODP, Port, Lat, Lng
  - Export mengikuti filter aktif (export hanya data yang tampil)

- **Kolom Tabel Baru**
  - Kolom "Kecamatan / Desa" terpisah di tabel
  - Badge jenis pelanggan (Rumahan/Bisnis) di kolom nama

### UI/UX
- Layout filter: panel 4-kolom grid, compact & responsive
- Quick filter pills: badge kecamatan/desa aktif di search bar
- Active filter count badge pada tombol Filter
- District view grid 2-kolom di desktop

---

## [v2.4] - 2026-04-06 - Deep Bug Fix, Analytics ODP Distance & Business Decision

### Fitur Baru

- **Halaman Keputusan Bisnis** (`/marketing/bisnis`)
  - Analisis laporan lapangan untuk strategi marketing
  - Distribusi masalah: 6 tipe laporan (Area Sepi, Akses Sulit, Kompetitor, Infrastruktur, Potensi Tinggi, Lainnya)
  - Severity breakdown: Info / Perhatian / Kritis dengan visual bar
  - Rekomendasi otomatis: Investasi / Hindari / Evaluasi berdasarkan data lapangan
  - Analisis per Area (ODP) dengan skor severity
  - Timeline laporan terbaru dengan filter per tipe
  - Export laporan lapangan ke CSV
  - Navigasi di Sidebar + Bottom Nav (mobile)

- **Jarak ODP di Analisis** (v2.4 highlight)
  - Setiap laporan lapangan sekarang menampilkan jarak ke ODP terdekat (meter/km)
  - Analisis per Area menampilkan rata-rata jarak ODP (~350 m, ~1.2 km)
  - Rekomendasi bisnis otomatis menyertakan konteks jarak ODP
  - Rekomendasi baru: jika jarak rata-rata >500m + ada potensi → evaluasi biaya kabel drop
  - Dashboard Marketing: Laporan Lapangan terbaru tampilkan nama ODP + jarak
  - Export CSV laporan lapangan include kolom "Jarak ODP (m)"

- **Dashboard Marketing diperkaya**
  - Kartu Laporan Lapangan: breakdown per tipe + severity bar
  - Daftar laporan terbaru dengan ODP name + jarak
  - Export ringkasan dashboard ke CSV

- **Kontak halaman** - Tombol export CSV di header

### Bug Fix Kritis

- **Canvassing tidak muncul di desktop web**
  - Root cause: CSS height chain break - `h-full` dengan `absolute inset-0` child tidak mendapat tinggi
  - Fix: Root div diubah ke `flex-1 min-h-0` + parent Layout `flex flex-col` untuk fullscreen pages
  - Layout.tsx: Tambah `flex flex-col` class untuk halaman fullscreen

- **Mobile tidak bisa input lead/laporan**
  - Root cause: Form AddLeadForm tidak bisa di-scroll saat keyboard muncul, tombol submit tertutup
  - Fix: Tambah `overflow-y-auto max-h-[90vh]` pada form container

- **Data lead & laporan tidak muncul di analytics/sidebar**
  - Root cause: Filter `todayLeads` menggunakan UTC date string (`toISOString().slice(0,10)`) - di Indonesia (UTC+7) tanggal bisa berbeda
  - Fix: Ganti ke session-scoped filtering - `sessionLeads` filter berdasarkan `createdAt >= mySession.startedAt`
  - `sessionLogs` sudah difilter server-side by `sessionId`

- **Peta snapping back saat re-render**
  - Root cause: Controlled `center` prop memaksa map kembali ke posisi awal setiap render
  - Fix: Uncontrolled center - `center={undefined}`, set via `onLoad` callback + `mapRef`

- **Timer durasi sesi tidak update**
  - Root cause: `setInterval` tanpa state update → UI tidak re-render
  - Fix: `setTick(v => v + 1)` setiap 30 detik untuk force re-render

- **Lead Pipeline: filter Kanban menghilangkan stage kolom**
  - Fix: Kanban mode sekarang menggunakan unfiltered leads agar semua kolom stage tetap tampil

- **Aktivitas "assigned" tampil JSON mentah** (`{"assignedTo":1}`)
  - Fix: Parse JSON dan tampilkan `assignedToName` atau fallback "Tim"

- **Prospect Finder CSV export gagal di Safari/mobile**
  - Fix: Append link ke body + delay `revokeObjectURL`

- **API error handling crash pada non-JSON response** (502/proxy error)
  - Fix: `try/catch` pada `res.json()` di `api.ts`

- **Drizzle ORM: `closedAt` tidak ter-clear saat lead pindah dari won/lost**
  - Root cause: `undefined` di Drizzle UPDATE = field di-skip (tidak di-set NULL)
  - Fix: Gunakan `null` explicitly: `closedAt: (stage === "won" || stage === "lost") ? now : null`

- **Lead creation: lat/lng/odpId falsy check salah**
  - Root cause: `lat || null` - koordinat `0` dianggap falsy
  - Fix: `lat != null ? Number(lat) : null`

- **Canvassing session end: tidak ada ownership check**
  - Fix: Validasi session milik user + return 404 jika session tidak ditemukan

- **Marketing SPV tidak bisa lihat semua sesi**
  - Fix: `marketing_spv` diperlakukan sebagai supervisor di sessions list

### UI/UX
- Sidebar: Tambah menu "Keputusan Bisnis" (TrendingUp icon) di group Marketing Tools
- Bottom Nav: Tambah "Keputusan Bisnis" di submenu Marketing Tools
- FieldReportForm: Hapus stale `!title` check di useEffect
- GPS error: Tampil toast alih-alih silent fallback
- Canvassing start timeout: 3s → 10s (lebih toleran untuk GPS lambat)
- myLeads query: Tambah `refetchInterval: 30000` untuk auto-refresh

---

## [v2.3] - 2026-04-03 - Marketing CRM: Canvassing + Lead Pipeline

### Fitur Baru

- **Role `marketing`** - User baru dengan akses khusus Marketing Tools (Canvassing, Lead Pipeline, Prospect Finder). Tidak bisa akses aset jaringan/core management.

- **Canvassing** (`/canvassing`)
  - Peta full-screen (Google Maps) dengan session management
  - Mulai/Akhiri sesi canvassing dengan nama & deskripsi wilayah
  - Mode tambah prospek: klik titik di peta → form slide-up
  - Form input: Nama, Nomor HP, Kategori (Rumahan/Bisnis/Perkantoran/Sekolah/Lainnya), Catatan
  - Auto-detect ODP terdekat + peringatan jarak >500m dari ODP
  - Coverage circle 200m radius per ODP (visualisasi jangkauan)
  - Marker lead berwarna per kategori di peta
  - Sidebar desktop: daftar lead hari ini + statistik sesi (total, tertarik)
  - Timer durasi sesi real-time

- **Lead Pipeline** (`/leads`)
  - Kanban board 6 stage: Prospek Baru → Dihubungi → Tertarik → Negosiasi → Closing → Tidak Jadi
  - Kartu lead dengan priority badge, kategori, nomor HP (masking jika belum di-assign), alamat
  - Filter: semua stage / stage tertentu / lead saya / belum ditugaskan
  - Statistik: total lead, closing, lead saya, conversion rate
  - Drawer detail lead:
    - Kontak (phone + alamat, tampil setelah di-assign atau admin)
    - Assignment (admin bisa assign ke user marketing)
    - Navigasi stage (prev/next + tombol Closing/Tidak Jadi cepat)
    - Loss reason input saat mark Tidak Jadi
    - Tambah catatan dengan tipe: Catatan / Telepon / WhatsApp / Kunjungan
    - Timeline riwayat aktivitas (stage change, assignment, catatan)
  - Auto-refresh setiap 30 detik

- **Phone/Address masking**
  - Nomor HP dan alamat lead di-mask (`••••••••`) sampai lead di-assign ke sales tersebut
  - Admin selalu bisa lihat kontak lengkap
  - Setelah assignment, sales hanya lihat lead miliknya

- **DB auto-migration**
  - Tabel baru: `canvassing_sessions`, `leads`, `lead_activities`, `prospects`, `odp_scrape_cache`
  - Auto-created saat server start (CREATE TABLE IF NOT EXISTS)
  - Indexes untuk performa query leads + activities

- **API helper `api.patch()`** - tambah method PATCH di `client/lib/api.ts`

### Sidebar Restructure
  - Group baru: **MARKETING TOOLS** (hanya admin + marketing)
  - Items: Canvassing (MapPinned), Lead Pipeline (ListChecks), Prospect Finder (Search)
  - Group TOOLS & ASET JARINGAN: hanya admin + operator
  - Group MANAJEMEN: hanya admin

---

## [v2.2] - 2026-04-03 - Prospect Finder + Auth & UI Finalisasi

### Fitur Baru
- **Prospect Finder** (`/prospects`)
  - Temukan calon pelanggan di sekitar infrastruktur (ODP/ODC/POP) via Google Places API (New)
  - Filter berdasarkan 5 kategori: Korporat, Pendidikan, Kesehatan, Komersial, Pemerintah
  - Radius: 200m / 500m / 1km / 2km (default mengikuti tipe aset)
  - Hasil diurutkan berdasarkan jarak terdekat
  - Nomor telepon di-fetch on-demand (tidak disimpan di DB, sesuai Google ToS)
  - Export hasil ke CSV
  - Sidebar navigation item "Prospect Finder" dengan ikon Crosshair

### Bug Fix
- **Login twice bug** - setelah login berhasil, halaman kadang balik ke login lagi karena race condition antara `setLocation("/")` dan state update React. Fix: `LoginPage` sekarang render `<Redirect to="/" />` saat user sudah terisi, tanpa `setLocation`.
- **Blank setelah update/restart** - app tampil kosong/tidak bisa diklik jika token di localStorage tidak sinkron dengan server. Fix: token divalidasi ke `/api/auth/me` saat startup.
- **Tidak redirect ke login saat 401** - semua request API yang return 401 kini otomatis dispatch event `auth:unauthorized` → AuthContext langsung clear session → redirect ke login.
- **Layer peta reset saat navigasi** - layer visibility (ODP on/off, Pelanggan, dll) kembali ke default setiap kali user pindah halaman. Fix: state layer disimpan ke `localStorage` dan dimuat kembali saat kembali ke peta.
- **Prospect Finder: unsupported place types** - tipe `clinic`, `office`, `corporate_office`, `preschool`, `hotel` tidak valid di Places API (New). Fix: diganti ke tipe yang didukung (`doctor`, `accounting`, `lodging`, dll).
- **Prospect Finder: API key referrer blocked** - request dari backend tidak memiliki header `Referer`. Fix: tambah header `Referer: APP_URL` pada semua request ke Google Places API.

### Security & Hardening
- Session cookie diperketat: `secure: true` (production), `httpOnly: true`, `sameSite: "lax"`
- Warning log saat `SESSION_SECRET` tidak diset di production
- TypeScript: `next: Function` → `next: NextFunction` di authMiddleware

### UI/UX
- **Sidebar collapsible** - tombol `◀` di header sidebar untuk menyembunyikan sidebar (desktop), map jadi full-width. State tersimpan di `localStorage`. Tab `▶` muncul di tepi kiri untuk expand kembali.
- **Popup/InfoWindow redesign** - layout simetris dengan aksen warna full-width di atas, tombol X di dalam container, stat cards rapi, port bar lebih prominent.
- **InfoWindow CSS override** - hapus semua padding/background default Google Maps, sembunyikan tombol X native Google Maps, gunakan close button custom di dalam popup.
- **ODP marker warna gradasi usage** - warna marker dan header popup mengikuti persentase port terpakai: Merah (0%=kosong) → Orange (1-33%) → Kuning (34-66%) → Hijau (67-99%) → Biru (100%=penuh). Berlaku di marker, label, popup, dan progress bar.

### Config & DevOps
- File `.env.example` lengkap dengan dokumentasi setiap variabel
- `APP_URL` dan `GOOGLE_MAPS_API_KEY` baca dari environment variable
- React Query retry: tidak retry untuk error 401/403 agar tidak hang

---

## [v2.0] - 2026-03-28 - Security Overhaul & Core Management

### Fitur Baru
- **Core Management** - OTB Manager, Bestray, Splitter, Core Manager, Koneksi Core
- **Splitter Chain** - visualisasi hierarki splitter dari POP → ODC → ODP
- **Power Budget Calculator** - kalkulasi link budget FTTH
- **Export/Import** - export data aset ke CSV/Excel
- **Log Aktivitas** - audit log semua aksi user (login, CRUD aset)
- **Manajemen User** - CRUD user, role admin/operator

### Security
- Password hashing ganti dari SHA-256 (tanpa salt) ke **bcrypt cost 12**
- Auto-upgrade hash lama ke bcrypt saat login berhasil (zero-downtime migration)
- Rate limiting login: 5 percobaan / 5 menit → lockout 15 menit
- Token sesi menggunakan `randomBytes(48)` - tidak lagi predictable
- Validasi password: minimal 8 karakter, huruf besar, huruf kecil, angka
- Validasi username: 3-30 karakter, alphanumeric
- Hapus hint kredensial default dari halaman login
- Password admin default dari env var `ADMIN_DEFAULT_PASSWORD`
- Global auth guard: semua `/api/*` (kecuali login) wajib token valid

### Bug Fix
- Map page blank setelah brute-force test mengunci akun di memory
- Vite HMR stale cache menyebabkan MapPage tidak update
- Panel z-index conflict: utility buttons tertutup panel layer

---

## [v1.0] - 2026-03-25 - Initial Release

### Fitur Awal
- Dashboard statistik jaringan
- Peta interaktif Google Maps dengan marker POP, ODC, ODP, Pelanggan, Tiang, Kabel
- CRUD aset: POP, ODC, ODP, Pelanggan, Tiang, Kabel
- Marker clustering untuk performa peta
- Tambah aset langsung dari peta (klik → form)
- InfoWindow popup saat klik marker
- Dark mode / Light mode
- Responsive mobile layout
- Sync billing pelanggan dari API eksternal
- Layer filter (tampilkan/sembunyikan tipe aset)
- Label nama dan garis hirarki pada peta
