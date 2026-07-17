# JABNET Workspace — Release Notes v4.2.27

> **Codename:** Phonebook Tags + Smart Import
> **Release date:** 2026-05-13
> **Previous version:** v4.2.26

## v4.2.27 — Apa yang baru

### 🏷️ Tags per Kontak — Kategorisasi Fleksibel

Setiap kontak di phonebook sekarang punya **tags** (multi-label) untuk kategorisasi. Tags bisa apa aja:
- Per status: `VIP`, `Reseller`, `Calon Pelanggan`, `Pelanggan Lama`
- Per lokasi: `Cilawu`, `Tarogong`, `Banyuresmi`
- Per paket: `Paket-20M`, `Paket-50M`, `Premium`
- Per kategori bisnis: `B2B`, `B2C`, `Mitra`

**Fitur tag yang diimplement:**
- ✅ Tag chip badge berwarna deterministik (warna otomatis konsisten per tag string)
- ✅ Tag column di contact table (preview 3 tags + "+N more")
- ✅ Filter by tag — chip clickable di atas table (single-select toggle)
- ✅ Bulk-add tag — pilih kontak (multi-select) → klik "Tambah Tag" → pilih existing tag atau bikin baru
- ✅ Tag input di Contact Form (add/edit) dengan suggestion dari existing tags
- ✅ Tag merge logic: kalau kontak sudah punya `[VIP, Reseller]` lalu bulk-add `[Cilawu]` → result: `[VIP, Reseller, Cilawu]` (auto-dedup)
- ✅ Per-phonebook tag list endpoint dengan count: `GET /api/phonebooks/:id/tags`

### 🎯 Smart Filter Import dari Customers

Sebelumnya import dari Customers cuma list 300 kontak teratas. Sekarang di mode **"Dari Customers"** ada **Smart Filter section** untuk cari pelanggan berdasarkan:

- **📦 Paket** — dropdown dari list paket yang dipake di DB (mis. "JAB BEST", "MOON LITE")
- **🗺️ Kecamatan** — dropdown dari list kecamatan (Cilawu, Tarogong Kidul, dst)
- **📊 Status** — semua / aktif / isolir / overdue
- **🔍 Search** — text search di nama/customerId/phone

Result preview dengan badge ISOLIR di pelanggan isolir. Pilihan "Pilih Semua Yang Terlihat" untuk bulk-select cepat.

**Cocok untuk skenario:**
- Broadcast promo ke "Semua pelanggan Cilawu paket 20M"
- Broadcast reminder bayar ke "Semua pelanggan overdue di Tarogong"
- Bulk add ke phonebook "Pelanggan Isolir Bulan Ini" → tag `Reminder-Bayar`

### 📋 Import dari Phonebook Lain (Cross-Phonebook Copy)

Mode import baru: **"Phonebook Lain"** — copy/merge kontak dari phonebook lain ke phonebook tujuan.

**Use case:**
1. Lu punya phonebook "Semua Customer" (broadcast umum)
2. Mau bikin phonebook "VIP Cilawu" — pilih dari "Semua Customer", filter, copy
3. Atau merge 2 phonebook jadi satu

**Flow:**
1. Pilih phonebook sumber dari dropdown (auto-list semua kecuali target)
2. Search + multi-select kontak (atau pilih kosong = import semua)
3. Optional: tambah tag saat import (akan di-merge dengan tag existing kontak)

Endpoint: `POST /api/phonebooks/:id/import-from-phonebook` body `{sourcePhonebookId, contactIds?, addTags?}`

### ✨ Tag-on-Import (Auto-Kategorisasi)

Di semua mode import (Customers/Phonebook lain/CSV/Paste), ada section **"Tag untuk Kategori"** opsional di bawah. Tag yang lu add akan diaplikasi ke SEMUA kontak yang diimport.

**Workflow:**
1. Import smart filter "Customers paket JAB BEST"
2. Tambah tag: `Premium`, `Upsell-Candidate`
3. → Semua kontak yang diimport otomatis dapat 2 tag itu
4. Nanti broadcast tinggal filter tag "Premium" di phonebook

### 🔧 Technical Details

**Schema migration:**
- ALTER TABLE phonebook_contacts ADD COLUMN tags TEXT — JSON array of strings
- Idempotent migration (existing data unaffected)
- New index `idx_phonebook_contacts_customer` untuk lookup performance

**New endpoints:**
- `GET /api/phonebooks/:id/tags` → list tags dengan count `[{tag, count}]`
- `POST /api/phonebooks/contacts/bulk-add-tags` body `{contactIds, tags}` → merge
- `POST /api/phonebooks/contacts/bulk-remove-tag` body `{contactIds, tag}`
- `POST /api/phonebooks/:id/import-from-phonebook` body `{sourcePhonebookId, contactIds?, addTags?}`
- `GET /api/phonebook-import/customers?paket=&kecamatan=&status=&search=` → filtered customer list
- `GET /api/phonebook-import/customer-filters` → dropdown options (paket, kecamatan, status)

**Server features flags:** `phonebook-tags`, `phonebook-cross-import`, `phonebook-smart-filter`

---

# JABNET Workspace — Release Notes v4.2.26

> **Codename:** Broadcast Detail + Audit Trail
> **Release date:** 2026-05-13
> **Previous version:** v4.2.25

## v4.2.26 — Apa yang baru

### 🔍 Broadcast Detail View — Lihat Terkirim ke Siapa, Gagal ke Mana

Di list broadcast campaign (`/whatsapp/broadcast/pelanggan` atau `/reseller`), tombol **"Detail"** sekarang buka **full detail view** dengan transparansi penuh:

**Header section:**
- Status badge campaign (pending/sending/sent/failed/cancelled)
- 4 stats cards real-time: Total / Terkirim (+%) / Gagal / Pending
- Auto-refresh setiap 5 detik (saat campaign masih running)

**Informasi Broadcast:**
- 👤 **Oleh:** nama admin yang trigger broadcast, dengan @username + role
- 📱 **Device:** WhatsApp device yang dipake (nama, phone, provider)
- 📄 **Template:** template yang di-render (nama + key)
- 🎯 **Target:** customers / phonebook / direct recipients
- 🕐 **Mulai / Selesai:** timestamp dengan format Indonesia

**Recipients Table (per kontak):**
- Tabs filter status: All / ✓ Terkirim / ✗ Gagal / ⏳ Pending / ⊘ Skipped
- Search box (cari nama / phone / error message)
- Per row: status badge, phone, nama, customer ID, retry count, sent at, error short
- **Click row → modal detail** menampilkan:
  - Pesan yang dikirim (rendered dengan placeholder filled)
  - MPWA response JSON (untuk debug)
  - Error message lengkap (kalau gagal)
  - Customer ID linked

**Actions:**
- 🔄 **Retry Failed** — kirim ulang ke semua recipient yang gagal
- ✋ **Cancel Campaign** — stop campaign yang lagi running
- 📥 **Export CSV** — download semua recipients dengan status + error untuk audit

**URL state persistence:**
- `?detail=ID` di URL — refresh page tetap di detail view
- Browser back button balik ke list

### 👤 Audit Trail: "Oleh" di Campaign List

Di list broadcast, kolom **"Oleh:"** sekarang menampilkan nama admin pengirim (sebelumnya hardcoded "System"). Backend `GET /api/broadcast/campaigns` + `/:id` di-enrich dengan:
- `createdByUser`: `{ id, name, username, role }`
- `device`: `{ id, name, phone, provider }`
- `template`: `{ id, name, key }`

Berguna untuk audit dan accountability — siapa kirim apa, kapan, ke siapa, hasilnya gimana.

### ✏️ TypeScript Polish

Fix bug operator precedence di stats card: `counts.pending + (counts as any).sending ?? 0` → `counts.pending + ((counts as any).sending ?? 0)`. Sebelumnya `??` operand kanan unreachable karena bind salah.

---

# JABNET Workspace — Release Notes v4.2.25

> **Codename:** Phonebook + Template Preview
> **Release date:** 2026-05-13
> **Previous version:** v4.2.24

## v4.2.25 — Apa yang baru

### 📒 Phonebook — Custom Contact Lists

Menu baru `Notifikasi → Whatsapp → Phonebook` (`/whatsapp/phonebook`).

Phonebook = daftar kontak custom yang **terpisah dari database pelanggan**. Berguna untuk:
- Reseller VIP
- Tim internal
- Calon pelanggan (lead)
- Mitra bisnis
- Daftar broadcast khusus apapun

**Fitur:**
- Multi-phonebook (bikin sebanyak yang perlu, kasih nama + warna + deskripsi)
- Per-contact: nama, phone, email, alamat, notes
- **Custom fields** (JSON) untuk data fleksibel per kontak
- Linked customer support (optional FK ke `customers` table — untuk akses 28 params placeholder saat broadcast)

**Import options (3 mode):**
1. **Dari Customers** — multi-select dari database pelanggan, otomatis carry customerId + package + district
2. **Upload CSV** — drag file CSV (format: `name,phone,email,address,notes`, header detected auto)
3. **Paste Text** — paste daftar langsung dari Excel/Google Sheet

**Bulk operations:**
- Bulk delete (multi-select checkbox)
- Auto-detect duplicate phone (skip insert)
- Export CSV
- Cascade delete (hapus phonebook = hapus semua kontaknya)

### 🎯 Broadcast Form: Audience Source Toggle

Di `Broadcast Pelanggan` form, sekarang ada toggle **Sumber Penerima**:
- **Database Pelanggan** (default) — pakai customer list dengan quick filter + group-by
- **Phonebook** — pilih dari phonebook custom + select contacts

Saat pakai Phonebook, otomatis tampil dropdown list phonebook + checkbox kontak. Kalau kontak punya `customerId` linked, 28 params placeholder pelanggan tetap kerja saat render.

### 👁️ Template Live Preview di Broadcast Form

Saat **pilih template** di broadcast form, otomatis muncul **preview WhatsApp bubble** di kanan dengan:
- Sample data terisi (nama: John Doe, customer ID: 058500001, paket: 20 Mbps, dst.)
- Image header (kalau ada)
- WhatsApp markdown render (*bold*, _italic_, ~strike~)
- Footer text
- Button preview (sesuai mode native / text-link)
- Timestamp + double check ✓✓

Layout 2-kolom responsive — preview sticky di kanan (desktop) atau di bawah (mobile).

Status badges di bawah template selector: 🖼️ Image · 🔘 Button · Text+Link / Native mode · Filter: Belum Bayar (kalau template restrict ke unpaid).

### 🐛 Bug fixes & improvements

- Server version display 4.2.25 di `/api/health`
- Permission baru: `phonebooks` (untuk granular access control)
- `phonebookContactId` di-pass ke broadcast recipients untuk traceability

### Database Schema

**Tables baru:**
- `phonebooks` — id, name, description, color, icon, contact_count, created_by, created_at, updated_at
- `phonebook_contacts` — id, phonebook_id, name, phone, email, address, notes, custom_fields (JSON), customer_id (FK), created_at, updated_at

Indexes: `idx_phonebook_contacts_pb`, `idx_phonebook_contacts_phone`

---

# JABNET Workspace — Release Notes v4.2.24

> **Codename:** Broadcast Audience Grouping
> **Release date:** 2026-05-13
> **Previous version:** v4.2.23

## v4.2.24 — Apa yang baru

### 🎯 Broadcast Audience Quick Filter + Group-By

Halaman `Notifikasi → Whatsapp → Broadcast Pelanggan` (dan Reseller) sekarang punya **quick filter chips** + **group-by view** untuk memudahkan pemilihan audience.

#### Quick Filter Chips (multi-select)
- **📦 Paket** — chip untuk tiap paket internet aktif (dengan counter customer per-paket)
- **🗺️ Kecamatan** — chip per district (scrollable, dengan counter)
- **🔌 ODP** — chip per ODP yang punya customer aktif
- **Status** — toggle Semua / Aktif / Isolir
- **Search bar** — cari by nama / customer ID / alamat

Multi-select: bisa pilih multiple paket + multiple kecamatan + multiple ODP sekaligus. Counter live update saat filter berubah.

#### Group-By View
Toggle tampilan customer list dengan group-by:
- **Flat** (default) — semua customer dalam 1 list
- **By Paket** — group by package, header expandable
- **By Kecamatan** — group by district
- **By ODP** — group by ODP

Setiap group header punya:
- Counter total customer di group + counter berapa yang sudah dipilih
- Tombol **"Pilih Semua"** / **"Unselect"** per group
- Collapsible (klik panah untuk expand/collapse)

#### Improvements
- "Pilih Semua" button respect current filter (tidak overwrite selection sebelumnya, di-merge)
- Counter live: `X dipilih · Y match filter`
- "Reset semua filter" button kalau ada filter aktif
- Customer card tampilin paket + kecamatan + ODP icon kalau view flat
- Reseller broadcast: search + filter by kecamatan

### 🐛 Bug fixes
- Server version display di `/api/health` sekarang accurate
- `tsx watch` cleaner restart (kill stale process)

---

# JABNET Workspace — Release Notes v4.2.23

> **Codename:** WhatsApp Multi-Device + Full MPWA Integration
> **Release date:** 2026-05-12
> **Previous version:** v4.2.13

## v4.2.23 — Apa yang baru

### 📱 WhatsApp Feature v2 — PRD Restructure (4 submenu)

Sidebar baru grup **"Notifikasi"** dengan parent collapsible **"Whatsapp"** → 4 submenu:

1. **Nomor Whatsapp** (`/whatsapp/devices`) — Multi-device dengan 12 provider gateway support (6 unofficial: MPWA, Starsender, Watzap, Wablas, Fonnte, WACHAYO + 6 official: Mekari Qontak, Mobichat, Halo AI, Pancake, Kommo, Bales Otomatis)
2. **Template Whatsapp** (`/whatsapp/templates`) — Tabs Unofficial/Official, tipe Pelanggan/Reseller, 28 parameter dinamis, WYSIWYG editor (B/I/U), live preview WhatsApp bubble
3. **Broadcast Pelanggan** (`/whatsapp/broadcast/pelanggan`)
4. **Broadcast Reseller** (`/whatsapp/broadcast/reseller`)

### 🔌 Integrasi MPWA Lengkap (17 endpoint + webhook)

`MPWAClient` class implementasi spec resmi MPWA Jabnet:

- **Send:** text, media (image/video/audio/document), button (max 5 — reply/call/url/copy), list message, poll, location, vcard, product, channel, sticker
- **Device management:** generate QR, info, logout, delete
- **Tools:** check-number, info-user
- **Webhook receiver** untuk pesan masuk → auto-save ke `wa_inbox` table
- Frontend: QR connect modal di Nomor Whatsapp dengan 4 tab (Status / Webhook / Tools / Reconnect)

### 🎯 Template Builder Lengkap

- **Image upload** drag-drop (auto base64 → save ke `/public/uploads/wa-images/`, max 5MB)
- **Button builder** native interactive — max 5 button, 4 type (reply / call / url / copy)
- **Footer text** + **media attachment** (image/video/document)
- **Mode pengiriman** per-template:
  - **Native Button** (default) — interactive button tap-able di WhatsApp via MPWA `/public/send-button`
  - **Text + Link** (fallback) — render button jadi formatted text dengan link tap-able, 100% kompatibel semua versi WA
- Localhost image URL auto-skip + warning (MPWA server gak bisa fetch localhost)
- Default button image global setting (`wa_default_button_image`)
- 28 parameter dinamis dengan placeholder picker modal

### 📤 Broadcast Pipeline

- **Direct recipients** (manual select via checkbox) — bypass audience filter eval
- **Saved segments** + custom inline filter
- **Per-device routing** dengan rate limit per-device (1-30 detik)
- **Worker queue-based** dengan auto-resume saat server restart
- **Per-recipient tracking** di `broadcast_recipients` table (status: pending/sending/sent/failed/skipped)
- Manual input fields (`{{input_manual_text}}` / `{{input_manual_tanggal}}`) muncul dinamis saat template butuh

### 🗂️ URL State Persistence

Halaman template (`/whatsapp/templates`) sekarang persist via URL query — refresh page tidak balik ke list, tetap di form yang sedang dibuka (`?action=edit&id=23` / `?action=new&type=pelanggan`).

### 🔧 Server Improvements

- `tsx watch` mode untuk auto-reload dev server (no manual restart)
- `/api/health` endpoint dengan version + features info
- `/api/*` fallback return JSON 404 (bukan SPA HTML), error message lebih informatif
- Migrations idempotent — server restart aman tanpa data loss

### 🐛 Bug Fixes

- **Broadcast direct recipients persisted ke DB** (sebelumnya Drizzle drop field yang ga di-declare)
- **Schema fix** untuk `directRecipients`, `manualText`, `manualDate`, `deviceId`, `targetType`, `compatMode`
- **Placeholder substitution** support both `{single}` legacy dan `{{double_brace}}` PRD spec
- **Per-recipient render** dengan 28 params dari customer DB lookup

### 📊 Database Schema (new tables)

- `wa_devices` — multi-device dengan provider abstraction + QR state + webhook token
- `wa_inbox` — incoming messages dari webhook (untuk auto-reply/chatbot)
- `resellers` — database reseller untuk broadcast reseller
- `broadcast_campaigns` extended — `direct_recipients`, `device_id`, `target_type`, `compat_mode`, `manual_text`, `manual_date`
- `mpwa_templates` extended — `footer`, `buttons`, `media_url`, `media_type`, `template_type`, `template_channel`, `customer_filter`, `share_to_reseller`, `compat_mode`

### 🧪 Tests

- 35+ unit tests pass (`tsx --test server/*.test.ts`)
- MPWAClient: 22 tests (semua endpoint + button validation + payload shape)
- Broadcast flow: 13 tests (placeholder substitution + button parsing + direct recipients)

---


> **Codename:** Customer Portal Domain Split
> **Release date:** 2026-04-29
> **Previous version:** v4.2.12

## v4.2.13 — Apa yang baru

### 🌐 Customer Portal pindah ke `portal.jabnet.id`
Portal pelanggan sekarang punya **domain dedicated** terpisah dari staff workspace:

| Domain | Use case |
|---|---|
| `fiber-tools.arkanova.id` | Staff workspace — Pelanggan list, Tickets, Marketing, dst |
| `portal.jabnet.id` ⭐ | Customer portal — login OTP, dashboard, tagihan, WiFi config |

**Manfaat:**
- Customer ngga lihat URL `fiber-tools.arkanova.id` (terkesan internal/staff)
- Branding bersih `portal.jabnet.id`
- Security separation — staff API tidak accessible dari domain portal
- WhatsApp/QR sharing link lebih clean dan brandable

### Implementasi

**Frontend** (App.tsx):
- Detect `window.location.hostname === "portal.jabnet.id"`
- Saat di portal domain → routing **dibatasi ke `/portal/*`**, root `/` redirect ke `/portal/login`
- Sidebar/staff dashboard tidak ke-load (clean customer-facing UX)
- Domain lama `fiber-tools.arkanova.id/portal/*` **tetap accessible** (backward compatible)

**Backend** (index.ts):
- Middleware host guard — kalau request masuk dari `portal.jabnet.id` dan path bukan `/api/portal/*`, return 404 `"Endpoint tidak tersedia di domain ini"`
- Whitelist: `/api/portal/*`, `/api/health`, `/api/auth/me`
- Memblokir staff API dari portal domain (security defense-in-depth)

**MPWA Templates** auto-update:
- `welcome_new_customer` template
- `sahabat_perunggu` template
- Link sekarang `https://portal.jabnet.id` (dari sebelumnya fiber-tools)

**SahabatKitDialog**:
- QR code customer onboarding default pakai `portal.jabnet.id`
- Kalau diakses dari portal domain sendiri pakai `window.location.origin`

### Infrastructure
- Nginx vhost baru `/etc/nginx/sites-available/portal.jabnet.id`
- Reverse proxy ke `localhost:3002` (same backend)
- SSL via Let's Encrypt (`certbot --nginx -d portal.jabnet.id`)
- DNS A record `portal.jabnet.id → 103.194.46.164`

---

# JABNET Workspace — Release Notes v4.2.8

> **Codename:** Integration Audit & Auto-Pair ONT
> **Release date:** 2026-04-27
> **Previous version:** v4.2.7

## v4.2.8 — Apa yang baru

### 🎯 Status Integrasi PPPoE & ONT — sekarang visible langsung
Halaman Pelanggan dapat **KPI strip baru "Status Integrasi PPPoE & ONT"** yang menampilkan breakdown integrasi customer secara real-time:

- **✓ Lengkap** — punya PPPoE + ONT match GenieACS
- **📶 PPPoE saja** — punya PPPoE tapi belum kelink ke device GenieACS (perlu di-pair)
- **🖥 ONT saja** — punya ONT match tapi tidak punya PPPoE
- **— Belum dihubungkan** — sama sekali kosong

Plus **sub-row real-time**: PPPoE Online/Offline + ONT Online/Offline counts. **Klik tile mana saja → langsung filter table** ke customer yang masuk kategori itu. Bisa juga lewat filter dropdown "Integrasi" di filter panel (8 opsi: lengkap, pppoe_only, ont_only, none, pppoe_online/offline, ont_online/offline).

### ⚡ Audit & Auto-Pair ONT — fuzzy matching
Tombol baru di header KPI strip: **"⚡ Audit & Auto-Pair ONT"**. Cari pasangan ONT GenieACS untuk customer "PPPoE saja" pakai 4 strategi fuzzy match:

| Strategi | Confidence | Contoh |
|---|---|---|
| **Strip simbol** | 95% | `ridwan_001` ↔ `ridwan001` (underscore/dot/dash) |
| **Strip leading zero** | 92% | `052500015` ↔ `52500015` |
| **Substring** (≥6 char) | 80% | `ridwangarut2024` ↔ `ridwangarut` |
| **Levenshtein** ≤2 (typo) | 70% | `asepsuparman` ↔ `asepsuparmant` |

**UX dialog**:
- 4 KPI summary: Customer Unmatched / Punya Kandidat / Confident ≥90% / Tidak Ada Match
- Filter pills (Semua / ≥90% / ≥80% / ≥70%) untuk fokus ke high-confidence
- **Pre-fill auto-select** semua kandidat ≥90% saat dialog buka — admin tinggal review + Apply
- "Pilih semua ≥90%" untuk bulk approve
- Per-row click untuk pilih kandidat alternative (kalau confidence beberapa kandidat sama)
- Footer: jumlah dipilih + tombol "⚡ Apply N Pairing"
- Apply → simpan `ontSerialNumber` ke customer DB. Setelah ini sync `/ont-status` akan langsung match (pakai SN) bahkan kalau PPPoE username ngga match exact.

### 🛡 Safety
- **Timeout 8s** untuk GenieACS fetch — fail-fast supaya frontend ngga gantung
- Skip customer yang sudah punya `ontSerialNumber` — ngga override hasil pairing manual sebelumnya
- Confirm dialog sebelum apply
- Audit log di `audit_logs` untuk traceability
- Permission check `customer_view` write — hanya admin/staff dengan akses

### 📡 Endpoints baru
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET    | `/api/customers/integration-audit` | Scan + fuzzy match candidate analysis (8s timeout) |
| POST   | `/api/customers/auto-pair-ont` | Bulk apply pairs `[{customerId, deviceSerialNumber}]` |

---

## v4.2.7 — Apa yang baru

### 🐛 BUG FIX KRITIS: Stage tidak advance setelah Selesaikan
User report: setelah tap "Selesaikan Stage", tiket **stuck di stage yang sama**. Stage 1 sudah ✓ Selesai tapi card "Stage Saat Ini" tetap "1/6 · Diagnosa Awal", CTA tetap "Update Stage Diagnosa Awal".

**Akar masalah:**
- FE `submitCheckpoint` selalu kirim `toStage: stage.key` (stage yang sedang diisi)
- Backend `advanceTicketStage` interpretasi sebagai "navigate ke stage X" → re-enter same stage, bikin transition baru tapi `currentStage` ngga berubah

**Fix:**
- **FE**: Hanya kirim `toStage` kalau stage adalah final (`isFinal: true`); selain itu biarkan undefined → backend auto-advance via `nextStageDefault`
- **Backend**: 
  - Detect `completingFinalStage` (current stage isFinal & toStage = current key) → close transition, mark resolved, **TIDAK insert duplicate transition**
  - Note/evidence/GPS sekarang attach ke **CLOSING transition** (data hasil pengerjaan stage yang baru saja selesai), bukan ke entering transition baru — lebih correct semantically
- Backend handle case `nextStageDefault` return null saat current = final stage (fallback ke current as completion target)

**Verified end-to-end:**
- Stage 1 (diagnose_remote) → 2 (dispatch) → 3 (investigate) → 4 (repair) → 5 (verify) → 6 (confirm, isFinal) → status=resolved
- Transitions table benar: closed transitions punya note + evidence + duration_sec, last (current) transition open

### 🎨 Pixel-Match Polish dari Design "Jabnet Work Order"
Refactor TechnicianWorkPage dengan **inline styles literal** dari design source (mobile-teknisi.jsx) — tidak interpret, tidak embellish:

| Element | Sebelumnya | Sekarang (match design) |
|---------|------------|-------------------------|
| Stage dot di list | 28x28 dengan dot kecil putih + pulse ring | **24x24 dengan number** di tengah, no pulse ring |
| Header padding | `px-4 py-3` (16x12) | `padding: "12px 16px"` (12x16, match design) |
| Customer card padding | `p-3.5` (14px) | `padding: 14` (14px exact) |
| Card border-radius | `rounded-[10px]` | `borderRadius: 10` (sama, tapi inline) |
| Stage Saat Ini label | tracking-wider | `letterSpacing: 0.6` exact |
| Buttons row | `gap-2 mt-3` | `gap: 8, marginTop: 12` exact |
| Stages list bg | `bg-white rounded-[10px]` | `borderRadius: 10` + `border: "1px solid #e2e8f0"` |
| Stage row bg current | `${catColor}10` | `${catColor}14` (8% opacity literal dari design) |

Pulse ring animation **dipertahankan hanya di Customer Tracker** (PortalTrackerPage) — sesuai design source yang punya pulse ring di vertical timeline customer-facing, bukan di mobile teknisi stages list.

### Diagnostic Improvements
- Bug yang sama di backend `nextStageDefault` (current=final → throw error) sekarang ngga throw; di-treat sebagai completion request
- Activity log entry untuk stage advance mencakup `from→to` dan note completion

---

## v4.2.6 — Apa yang baru

### 🎨 Implementasi Design "Jabnet Work Order"
Berdasarkan design exploration via Claude Design (claude.ai/design) — handoff bundle dengan 7 artboards. Implementasi pixel-close untuk **Mobile Teknisi** + **Customer Tracker** (portal pelanggan).

### 🔧 Mobile Teknisi — Stage Execution UX

**Prinsip:** dynamic stages per kategori dengan field cards yang muncul sesuai requirement stage. Bukan checkpoint flat, tapi **stages-list → tap stage → execution screen dengan FieldCards**.

**Two-screen flow:**
1. **Stages List** — overview tiket + customer card (Navigasi/Phone) + list semua stages dengan progress dot. Tap stage current → masuk execution.
2. **Stage Execution** — header gradient warna kategori + FieldCards conditional sesuai field types:
   - **Photo**: 3-grid foto thumbnails + dashed-border camera button
   - **Numeric**: input + unit pill (dBm) + status indicator (normal range hijau / out-of-range amber)
   - **Barcode**: monospace scan input + check icon
   - **Speedtest**: dark card 3-column download/upload/latency dengan tabular-nums
   - **Checklist**: checkbox list dengan strikethrough done
   - **GPS**: auto-capture + status indicator
   - **Signature**: nama + area TTD placeholder
   - **Notes**: textarea
   - **Rating**: 5-star buttons
   - Bottom: Save Draft + Selesaikan Stage (emerald, full-width)

### 📦 Workflow Presets Aligned dengan Design

6 preset workflow kategori-spesifik (replace v4.2.4 generic):

| Kategori | Stages | Fields per stage |
|---|---|---|
| **Pemasangan Baru (PSB)** — 8 | Persiapan → Perjalanan → Survey → Penarikan Kabel → Instalasi → Pengukuran → Aktivasi → Penyelesaian | checklist+photo · gps+eta · photo+notes+gps · photo+numeric+notes · barcode+photo+notes · numeric+speedtest · speedtest+checklist · signature+photo+rating |
| **Gangguan (Corrective)** — 6 | Diagnosa Awal → Dispatch → Investigasi → Perbaikan → Verifikasi → Konfirmasi | notes+numeric · gps+eta · photo+notes+numeric · photo+notes+barcode · speedtest+numeric · signature+rating |
| **Preventive Maintenance** — 6 | Penjadwalan → Kunjungan → Inspeksi → Pengukuran Performance → Cleaning & Tuning → Laporan | notes · gps+photo · checklist+photo · numeric+speedtest · photo+checklist · signature+notes |
| **Relokasi** — 6 | Survey Lokasi Baru → Dismantle Lama → Mobilisasi → Instalasi Baru → Testing → Penyelesaian | photo+gps+notes · photo+barcode · gps · photo+barcode+numeric · speedtest · signature |
| **Upgrade Paket** — 4 | Verifikasi Order → Provisioning → Speed Test → Konfirmasi | notes · notes · speedtest · notes |
| **Dismantle** — 4 | Kunjungan → Lepas Perangkat → Lepas Kabel → Berita Acara | gps · photo+barcode · photo · signature+photo |

Auto-migration: kategori existing di re-applied ke preset baru saat startup (skip kalau sudah punya v4.2.6 fields format).

### 📱 Customer Tracker (Portal Pelanggan)

Halaman baru `/portal/track/:ticketId` — pelanggan bisa lihat realtime progress tiket mereka.

**Visual:**
- **Hero gradient** navy → blue dengan brand mark + ticket ID + headline status (mis: "Teknisi sedang menarik kabel ke rumah Anda") + progress bar dalam glass card + ETA
- **Teknisi card** — avatar gradient + name + team + rating bintang + chat/call buttons (round, brand color)
- **Vertical timeline** dengan stages — done check, current dengan **pulse ring animation**, future outline
- **Update card di stage aktif** — last update text + 2 thumbnail foto + count "+N foto"
- **Reschedule button** dashed border (placeholder)
- **Chat overlay** WhatsApp-style dengan message bubbles (mock untuk demo, integrasi Chatwoot via v4.2.5 webhook)

**Backend baru:**
- `GET /api/portal/tickets/:id/track` — full tracking data (ticket + stages + transitions + evidence + lead technician info), security check tiket harus milik portal customer

### 🎨 JABNET Design Tokens

CSS variables + utility classes ditambah di `client/index.css`:
- `--jbn-navy` `#1e40af` (brand primary, replace existing sky)
- `--jbn-cat-psb/gangguan/preventive/relokasi/upgrade/dismantle` — type-specific stage colors
- `--jbn-success/warning/danger/info` + `-bg` variants
- `.jbn-mono` → JetBrains Mono untuk ticket ID, numeric values, timestamps
- `.jbn-tabular` → tabular-nums
- `.jbn-pulse-ring` keyframes untuk stage active indicator

### ⚠️ Backward Compat

- Endpoint v4.2.5 `POST /api/tickets/:id/checkpoint` masih ada (untuk tiket lama yang pakai action-based flow)
- TechnicianWorkPage sekarang pakai `POST /api/tickets/:id/advance-stage` (existing v4.2.4 endpoint) dengan note + evidenceId + GPS metadata
- Tabel `ticket_checkpoints` (v4.2.5) di-keep — backward compat data

---

## v4.2.5 — Apa yang baru

### 🎯 Ticketing Redesign: dari rigid stages → action-based checkpoints

**Feedback v4.2.4:** stage workflow rigid (sequential preset) bikin teknisi bingung — kondisi lapangan ngga selalu jalan urut, dan admin pusing ngonfig requirement per stage.

**v4.2.5 redesign berdasarkan referensi Zendesk Field Service, BuildOps, FieldPulse:**

Daripada paksa stage urut, teknisi dapat **8 action button** yang bisa di-tap kapan saja, urutan apa saja:

| Action | Trigger | Validation |
|--------|---------|------------|
| 🚗 **Berangkat** | Otw ke lokasi | GPS wajib · auto status=in_progress |
| 📍 **Sampai** | Sudah di lokasi | GPS wajib |
| 🔧 **Mulai Kerja** | Setup selesai | (none) · auto status=in_progress |
| 📷 **Foto Progress** | Update tengah-tengah | Foto wajib |
| ⏸ **Jeda** | Berhenti sementara | Catatan alasan wajib |
| ▶ **Lanjut** | Resume kerja | (none) |
| 🚨 **Eskalasi** | Perlu bantuan | Catatan wajib |
| ✅ **Selesai** | Pengerjaan tuntas | Foto + catatan wajib · auto status=resolved |

**Time tracking auto-derive dari checkpoint pairs:**
- `depart → arrive` = travel time
- `arrive → start_work` = setup time
- `start_work → complete` = work time (minus pauses)
- `pause → resume` = pause durations (di-subtract dari work time)

Admin lihat: "Tim A travel rata-rata 32 menit, Tim B 18 menit — investigate" tanpa harus define stage upfront.

### 📱 TechnicianWorkPage rewrite (lagi)

- **Smart action highlighting**: action yang paling mungkin di-tap berikutnya di-highlight gradient warna (primary), action lain ditampilkan secondary/muted. State machine adaptive — kalau sudah depart, tombol Berangkat hilang dari grid.
- **Action grid 2-column** dengan icon + short label + description hint
- **Bottom sheet universal** untuk semua action — photo + note + GPS auto sesuai requirement action
- **Time metrics card**: 4-column Travel/Setup/Kerja/Total live update
- **Activity timeline** chronological dengan icon-coded checkpoint, foto thumbnail, GPS link
- **Checklist suggested optional** dari kategori (tap-to-toggle, ngga blokir flow)
- **Done state celebration** dengan summary metrics

### 🤖 Chatwoot Integration (auto-create tiket dari chat)

Implementasi berdasarkan [Chatwoot Webhook Events](https://www.chatwoot.com/docs/product/others/webhook-events) + [Custom Attributes API](https://developers.chatwoot.com/api-reference/conversations/update-custom-attributes).

**Flow:**
```
1. Customer chat WhatsApp/web widget → Chatwoot
2. Chatwoot fire webhook conversation_created → POST ke JABNET /api/integrations/chatwoot/webhook
3. JABNET:
   ├─ Match contact.phone_number ke customers.phone (multi-format normalization)
   ├─ Detect keyword di message (gangguan|pasang baru|dst)
   ├─ Auto-create tiket kategori sesuai keyword + priority
   └─ Callback ke Chatwoot: set custom_attributes 
      (jabnet_ticket_id + jabnet_ticket_url)
4. Agent CS lihat link di Chatwoot → klik untuk lihat tiket di JABNET
5. Saat tiket di JABNET di-resolve → JABNET kirim private note ke 
   Chatwoot conversation otomatis
```

**Auto-notify checkpoint:** Saat teknisi tap "Berangkat", "Sampai", atau "Selesai" — JABNET kirim private note ke Chatwoot conversation supaya agent CS bisa relay manual ke customer.

**Schema baru:**
- `chatwoot_config` — single-row config (URL, account_id, api_token, webhook_secret, toggles)
- `chatwoot_keyword_rules` — keyword → kategori + priority mapping (admin CRUD)
- `chatwoot_ticket_links` — link table tiket ↔ conversation (untuk reverse lookup)

**Default keyword rules auto-seed:**
- `gangguan,tidak bisa,mati,lemot,lambat,error,offline,putus,disconnected` → Gangguan + high priority
- `pasang baru,daftar,langganan,instalasi,subscribe` → Pemasangan + medium priority

**Endpoints baru:**
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET    | `/api/integrations/chatwoot/config` | Config + rules (token masked) |
| PUT    | `/api/integrations/chatwoot/config` | Update config |
| POST   | `/api/integrations/chatwoot/test` | Test koneksi |
| POST   | `/api/integrations/chatwoot/keyword-rules` | Tambah rule |
| PUT    | `/api/integrations/chatwoot/keyword-rules/:id` | Update rule |
| DELETE | `/api/integrations/chatwoot/keyword-rules/:id` | Hapus rule |
| POST   | `/api/integrations/chatwoot/webhook` | **Public** — Chatwoot push event di sini |

**Security:**
- Webhook public (Chatwoot ngga punya bearer auth ke external systems)
- HMAC-SHA256 signature verification kalau secret di-set di config
- API token + webhook secret di-mask di response (cuma show last 4 chars)

**Idempotency:** webhook double-fire (network glitch) ngga bikin duplicate ticket — link table primary key catch.

**Customer linking:** phone normalization ke 5 format (+62, 0, 8, 62, raw digits) supaya match consistent.

### ⚠️ Breaking Changes (minimal)

- Endpoint v4.2.4 `POST /api/tickets/:id/advance-stage` masih ada (backward compat) tapi **tidak dipakai** di mobile UI baru. Pakai `POST /api/tickets/:id/checkpoint` instead.
- Endpoint `GET /api/tickets/:id/workflow` masih return data v4.2.4 untuk legacy admin views, tapi mobile UX baru pakai `GET /api/tickets/:id/timeline`.
- Tabel `ticket_stage_transitions` (v4.2.4) di-keep untuk data history. Tabel baru `ticket_checkpoints` (v4.2.5) yang dipakai untuk all flows baru.

---

## v4.2.4 — Apa yang baru

### 🔧 Workflow Stages Flexible per Kategori
Sistem ticketing diubah dari **status flat hardcoded** (open/in_progress/resolved) menjadi **workflow stages per kategori** yang flexible. Setiap kategori punya urutan stage sendiri dengan requirement (foto/GPS/catatan/TTD) per stage.

**Contoh — Kategori "Gangguan" (SLA 4 jam):**
1. Persiapan Alat (15m) → 2. Perjalanan (45m, GPS wajib) → 3. Diagnosa (30m, foto+catatan wajib) → 4. Perbaikan (90m, foto wajib) → 5. Test Sinyal (15m, foto wajib) → 6. Selesai (catatan wajib)

**Contoh — Kategori "Pemasangan Baru" (SLA 24 jam):**
1. Survey Lokasi (foto+GPS) → 2. Siapkan ONT+Kabel (foto) → 3. Tarik Kabel (foto) → 4. Pasang ONT (foto) → 5. Aktivasi (foto speed test) → 6. Serah Terima (TTD pelanggan)

**4 preset workflow** auto-applied saat seed: `gangguan` · `install` · `migrasi` · `survey`. Admin bisa apply preset baru ke kategori existing via UI.

### 📱 TechnicianWorkPage — Mobile-First Redesign Total
Halaman teknisi (`/work/:id`) di-rewrite dari 1064 baris jadi stage-driven UX:

**Elemen utama:**
- **SLA countdown banner** live di header dengan progress bar (hijau→kuning→merah)
- **Customer card** dengan 3 quick action: 📞 Telepon · WA · 🗺 Navigate (link ke Google Maps directions)
- **Vertical timeline workflow** — stage selesai (✓ hijau), stage aktif (pulse + live timer), stage future (outline + requirement chips)
- **Big sticky bottom CTA** "Lanjut: [next stage]" dengan gradient warna stage
- **Bottom sheet advance** dengan camera-first capture (auto-compress 1280px), note textarea, GPS auto-fetch, validation client-side
- Section collapsible: Tim, Foto Bukti gallery, riwayat Activity
- Done state celebration banner saat tiket selesai

### ⏱ Time Tracking Per-Stage
Tabel baru `ticket_stage_transitions` log per-stage durasi:
- `enteredAt` / `exitedAt` / `durationSec` per stage
- Note + evidence_id + GPS koordinat saat transition
- Admin lihat "stuck-nya di mana": travel 5km tapi 45 menit? Repair 2 jam, kelamaan?

### 🛡 Disciplined State Machine (no more free-form)
**Sebelum:** PUT /tickets/:id bisa set status apa saja (resolved → open → closed jump bebas)

**Sekarang:**
- POST `/api/tickets/:id/advance-stage` validate requirement per stage:
  - `requiresPhoto: true` → wajib `evidenceId` di body, otherwise reject
  - `requiresGps: true` → wajib `lat`/`lng`, otherwise reject
  - `requiresNote: true` → wajib `note` non-empty
- Stage `isFinal: true` → auto-trigger status=resolved + resolvedAt
- Stage advance auto-update status=in_progress kalau masih open/assigned
- Hanya **team member atau admin** yang boleh advance (admin bisa `forceAdvance` skip validation)

### ⏰ SLA Tracking Aktif
**Sebelum:** field `slaDeadline` ada di schema tapi never set.

**Sekarang:**
- Auto-calculate saat create tiket: `slaDeadline = now() + category.slaHours * 3600`
- **Admin TicketingPage list view** — kolom Status sekarang menampilkan: status badge + stage indicator + SLA countdown (warna gradual: emerald → yellow → amber → rose → critical)
- **Admin Detail Dialog** — header SLA badge live + workflow timeline section dengan progress per stage
- **Mobile teknisi** — banner SLA dengan progress bar live update tiap detik

### 🌐 ODP Intelligence Endpoints
Backend siap untuk integrasi ODP-context:
- `GET /api/odps/:id/active-tickets` — list tiket aktif di ODP yang sama (untuk warning duplicate detection)
- Bonus: response include `resolutionPatterns` — 5 resolusi tiket sebelumnya di ODP yang sama (untuk auto-suggest)

### 🛠 Admin Category Management Diupgrade
- **Expand per kategori** untuk lihat workflow preview (semua stage dengan icon, durasi, requirement)
- **Apply Preset** button (Gangguan/Install/Migrasi/Survey) untuk reset workflow kategori existing
- **SLA hours editor** inline saat edit kategori
- **Tambah kategori** dengan dropdown preset selector + SLA jam

### 🗄 Schema Changes (Auto-migration)
Backend startup auto-run:
- `ticket_categories` → `+ workflow_stages TEXT` (JSON array)
- `tickets` → `+ current_stage TEXT, + stage_entered_at TEXT`
- New table `ticket_stage_transitions` (per-stage timing log)
- Backfill workflow_stages untuk 5 kategori existing dari nama (auto-detect: gangguan/install/migrasi/survey)
- Backfill current_stage untuk tiket existing (status-based: open→prep, in_progress→onsite, resolved→done)

### 📡 Endpoints Baru
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET    | `/api/tickets/:id/workflow` | Stages + transitions + SLA countdown |
| POST   | `/api/tickets/:id/advance-stage` | Advance ke stage berikutnya (validate requirement) |
| GET    | `/api/tickets/:id/stage-transitions` | Full per-stage history |
| GET    | `/api/odps/:id/active-tickets` | Active tickets + past resolution patterns |

---

## v4.2.3 — Apa yang baru

### 🛡️ Critical Safety: Boost Auto-Rollback Atomic Flow
Memperbaiki **gap kritis** di Speed-on-Demand v4.2.2 — kalau MikroTik offline saat boost expire, customer dapat boost gratis selamanya karena status DB sudah jadi `expired` padahal profile belum di-revert.

**Masalah lama (v4.2.2):**
1. Worker mark status=expired di DB
2. Coba revert MikroTik
3. Kalau revert gagal → kosong, ga ada retry; customer keep boost speed forever

**Solusi v4.2.3 (atomic + retry):**
1. **Revert MikroTik DULU** — coba ubah PPP profile ke `originalPppProfile` + disconnect session
2. **Hanya kalau sukses** → mark status=expired + set `revertedAt`
3. **Kalau gagal** → tetap status=active, increment `revertAttempts`, simpan `revertError`, retry next loop (60 detik)
4. **Setelah 10× gagal** → log CRITICAL error + admin alert via UI

**Schema baru di `point_redemptions`:**
- `reverted_at` — timestamp kapan PPP profile berhasil di-revert
- `revert_error` — error message terakhir kalau gagal (max 500 chars)
- `revert_attempts` — counter berapa kali coba revert

**Worker baru:**
- Background loop dedicated 60 detik di `server/index.ts` (sebelumnya nempel di billing-sync)
- Per-row revert dengan try-catch terpisah supaya 1 row gagal ga blokir row lain
- WA notif `sahabat_boost_expired` hanya di-send setelah revert benar-benar sukses

**Admin UI baru di `/loyalty` → tab Speed Boost:**
- **Health alert banner** — muncul otomatis kalau ada redemption gagal revert; menampilkan customer + jumlah attempts + error terakhir
- **Critical state** (warna merah) saat ada redemption gagal 5×+ berturut-turut
- **Tombol "Force Expire"** muncul di redemption stuck — admin bisa override setelah set profile manual lewat WinBox
- **Force Expire dialog** wajib alasan untuk audit trail

**Endpoint baru:**
- `GET /api/loyalty/admin/points/redemptions/health` — list redemption dengan revert issues
- `POST /api/loyalty/admin/points/redemptions/:id/force-expire` — admin override force-mark expired (body: `{reason}`)

**Verify dialog updated:**
- Reminder lama "auto-revert belum tersedia" diganti dengan ✓ konfirmasi auto-MikroTik aktif
- Cancel/Hentikan dialog confirm sekarang sebut nama profile asli yang akan di-revert

---

## v4.2.2 — Apa yang baru

### 🚀 Speed-on-Demand Loyalty Point System
Customer JABNET sekarang dapat point setiap bulan bayar tepat waktu, ditukar untuk **boost speed sementara** (2× / 3× lipat selama 6 / 24 jam).

**Schema baru:**
- `customer_loyalty` extend: `pointsBalance`, `pointsLifetimeEarned`, `pointsLifetimeRedeemed`
- `point_transactions` (audit ledger append-only)
- `point_redemptions` (lifecycle: pending → active → expired/rejected/cancelled)

**Earn rules** (configurable di admin):
- Bayar tepat waktu: +100 pts (default)
- Bayar early ≥3 hari sebelum jatuh tempo: +50 pts bonus
- Auto-jalan saat billing-sync detect payment, idempotent per pembayaran

**Catalog default Speed Boost** (admin bisa edit/add/delete):
- 2× speed 6 jam — 50 pts
- 2× speed 24 jam — 150 pts
- 3× speed 6 jam — 250 pts
- 3× speed 24 jam — 600 pts

**Loyalty Backfill** untuk customer existing (tier-based by tenure):
- Parse customer ID format `MMYYNNNNN` → tenure auto
- 6-11 bulan: 250 pts · 12-23 bulan: 1.000 pts · 24-35: 2.500 · 36-59: 5.000 · 60+: 10.000 pts
- Idempotent (skip kalau sudah pernah backfill via `source='initial_loyalty_grant'`)
- Test deployment: 581 customer dapat total 454.250 pts

**Customer portal** (tab "Boost"):
- Hero balance dark navy gradient telco-premium
- Live countdown active boost (per detik)
- Catalog cards dengan multiplier-aware gradient
- Confirm dialog 3-step process
- Toast & celebration banner saat status berubah pending → active
- Active boost banner dengan progress bar

**Admin** (tab "Speed Boost" di JABNET Sahabat):
- KPI flat row (Pending/Aktif/Selesai/Ditolak/Pts bulan ini) clickable filter
- List redemption per row dengan status dot, live countdown, Verify/Tolak/Hentikan actions
- Pengaturan dialog: customize earn rules + catalog reward CRUD (key/label/cost/multiplier/durasi/emoji)
- Backfill dialog: preview tier breakdown + sample customers + execute idempotent

**MPWA WA notif** (3 template baru auto-seed):
- `sahabat_boost_activated` — saat admin verify
- `sahabat_boost_expired` — saat durasi habis (auto via worker)
- `sahabat_boost_rejected` — saat admin tolak (point auto-refund)

**Background worker:**
- Auto-expire redemption yang lewat endAt setiap billing-sync cycle
- Send WA notif per redemption yang expired

### 📊 Open API Marketing Daily Report
Endpoint baru `GET /api/public/v1/marketing/daily-report` (scope `marketing:read`) untuk laporan harian tim marketing — designed untuk bot Telegram (openclaw) atau BI tool.

**Response structure:**
- `period` — tanggal & label
- `summary` — KPI canvassing/leads/sahabat hari ini + cumulative bulan ini
- `topPerformer` — best of the day
- `perCanvasser` — sessions, jam aktif, prospects, field reports per orang
- `perSales` — leads handled, won, breakdown call/wa/visit/note
- `hourly` — 24-jam matrix activity (productivity heatmap)
- `leadsBySource` — breakdown by source
- `pipeline` — current state snapshot
- `coverage` — districts dengan aktivitas hari ini

**Query**: `?date=YYYY-MM-DD` untuk hari spesifik (default: hari ini)

### 🎨 UI/UX Telco Mature Redesign
Tab Speed Boost & Pengaturan dialog di-redesign full ke pattern telco mature:
- KPI bar flat horizontal (numbers carry the design, no chunky colored boxes)
- Status indicators via dot + label (bukan colored badge)
- Filter chips proper segmented control
- Action buttons proper Button components dengan border + bg
- Dialog header light tone (no dark gradient untuk admin)
- Hairline divider list view (instead of card-in-card)

### 🐛 Bug Fixes
- Lead Pipeline drawer: tombol Hapus dipindah dari header (sebelah X close — rawan misclick) ke footer **Zona Berbahaya**
- Fix DOM nesting warning di IntegrationPage Meta CAPI card (`<p><Badge>` jadi `<div>`)
- Polish active redemption row: gradient strip kiri + status pill dengan border + countdown chip
- Filter auto-switch ke "Aktif" setelah Verify supaya admin langsung lihat hasil

### 🛡 Optimization
- Polling portal Boost tab dipercepat 30s → 10s (status change detection lebih cepat)
- Idempotency check di `earnPoints()` pakai `refId` (epoch payment date) cegah dobel award
- Atomic balance update (loyalty + tx insert) supaya state konsisten

---

# JABNET Workspace — Release Notes v4.2.1

> **Codename:** Telco Premium + Sahabat Ops
> **Release date:** 2026-04-25
> **Previous version:** v4.2.0

## v4.2.1 — Apa yang baru

### Portal pelanggan
- **Fix traffic live speed**: stale closure di polling `/api/portal/traffic/live` bikin "Live Speed — menunggu data..." nyangkut; sekarang pakai `useRef` jadi tick selalu baca nilai terbaru.
- **Fix portal Sahabat crash**: icon `Trophy` ga di-import → tab Sahabat crash. Sudah dibenerin.
- **Portal Sahabat** nambah: banner seasonal campaign (kalau aktif) + Top 10 Leaderboard Sahabat anonymized.
- **Foto profil**: avatar kolom baru — klik tombol kamera di Profile → auto-resize 256×256 JPEG → tampil di Sidebar & TopBar.

### Admin: JABNET Sahabat ops
- **Compact dashboard**: header & KPI dipadatkan, info concept di-toggle lewat tombol ℹ.
- **Input manual referral offline** (tab Referral): admin bisa catat referral dari telpon/WA/ketemu langsung.
- **Detail Drawer per-Sahabat**: klik leaderboard → panel lengkap (Ringkasan/Referral/Reward history) + quick actions.
- **Manual Issue Reward** dengan 11 preset (voucher, gratis hari, speed boost, cash, %) + alasan wajib untuk audit trail.
- **Ubah Tier wizard**: upgrade Pelanggan → RT/RW → Desa; form Desa include metadata BUMDes + revenue share + MoU URL.
- **Marketing Material Generator**: flyer 1080×1350 + QR code (3 tema) + pesan WA siap-share dari leaderboard.
- **Budget Tracker Widget**: total issued / applied / pending / sisa limit per bulan + alert kalau > 90%.
- **Fraud Guard**: auto-detect HP referee == customer existing, self-refer, referral circle A↔B.
- **Funnel + Cohort analytics**: stage conversion + cohort 6 bulan + avg time-to-reward.
- **Seasonal Campaign/Multiplier**: admin bikin promo periode tertentu, banner di admin & portal.
- **Statement bulanan WA**: manual trigger per-Sahabat atau broadcast ke semua.
- **Auto-WA referrer di setiap milestone**: saat dicatat, saat terdaftar, saat reward cair. Template MPWA baru: `sahabat_invite_recorded`, `sahabat_invite_registered`, `sahabat_monthly_statement`.

### Integrasi API
- **Telegram Bot**: adapter + pairing per-user (6-digit code, TTL 5 menit), 6 event notif marketing-ops, per-user prefs toggle.
- **Card Billing Sync** baru di Integrasi API: status, drift, last sync, Sync Now + Reconcile.
- **Card Telegram Bot** baru di Integrasi API.

### Marketing Ads
- **Campaign Tracker** full CRUD: tabel campaign dengan Spend/CTR/CPL/ROAS/Conversion.
- **Public API** scope `marketing:write`: `POST /api/public/v1/marketing/campaigns` dengan upsert-by-externalId untuk bot (Meta/TikTok/Google Ads sync).
- Dialog tambah/edit campaign dengan preset platform.

### Collection
- **Dashboard compact di mobile**: header shrink, 2 big card + 3 mini pill, filter chips horizontal-scroll. Desktop tetap 5 kolom uniform.

### Bug fixes
- `<Button asChild>` crash saat punya child > 1 elemen (navigation `/devices`, `/billing/packages`).
- AuthContext: tambah helper `updateCachedUser` + `refreshUser`.
- TypeScript strict: resolve 11 tipe error (AuthUser.isSystemAdmin, LeadPipelinePage, lucide `title` prop, `import.meta.env`, qrcode types).

### Migrations
- `users`: +5 kolom (`photo_url`, `telegram_chat_id`, `telegram_username`, `telegram_linked_at`, `telegram_prefs`)
- Tabel baru: `ad_campaigns` (17 kolom)

---

# JABNET Workspace — Release Notes v4.2.0

> **Codename:** Telco Premium Redesign
> **Release date:** 2026-04-24
> **Previous version:** v4.1.10

---

## 🎉 Highlights

Versi v4.2.0 adalah **transformasi menyeluruh UI/UX** dari v4.1.10 yang "functional" → enterprise telco premium, setara dengan MyTelkomsel, Biznet Home, Vodafone Business, dan Salesforce/Pipedrive CRM.

**Stats transformasi:**
- **200+ hardcoded colors removed** — semua migrate ke semantic tokens
- **17 komponen reusable baru** di `client/components/ui/`
- **3 halaman auth** (Login, Portal Login, OTP Verify) full redesign premium
- **4 halaman marketing** + Dashboard adopted new design system
- **1 Command Palette** (⌘K) global + 40+ route shortcuts
- **1 Bug fix** — AuthContext.canRead() + canWrite() (pre-existing bug di v4.1.10)

---

## 🎨 Design System (Phase 1 + 2)

### Design Tokens (`client/index.css` + `tailwind.config.ts`)
- Extended HSL variables: `success`, `warning`, `info`, chart palette (`chart-1`…`chart-8`), asset topology (`asset-pop`, `asset-odc`, `asset-odp`, `asset-pole`, `asset-cable`)
- Elevation shadows: `shadow-elev-sm`, `shadow-elev-md`, `shadow-elev-lg`
- Typography: Inter 100-900 + JetBrains Mono, `tracking-tight-display`, `tabular-nums` auto
- Pattern utilities: `bg-mesh`, `bg-grid-pattern`, `bg-dot-pattern`, `text-gradient-brand`
- Animations: `pulse-ring-success/warning/danger`, `shine-effect`

### Core Components (Phase 1)
| Component | Purpose |
|-----------|---------|
| `<PageHeader>` | Icon + title + description + breadcrumb + refresh + actions |
| `<PageContainer>` / `<PageSection>` | Spacing + max-width wrapper |
| `<StatTile>` | KPI card dengan icon + trend + semantic accent + loading state |
| `<StatusBadge>` | 6 variants × 4 appearances (subtle/solid/outline/dot) |
| `<SystemStatusDot>` | Pulsing operational/degraded/outage indicator |
| `<EmptyState>` | Icon + title + description + primary/secondary CTA |
| `<Skeleton>` + 6 variants | Loading placeholders per layout type |
| `<ErrorBoundary>` | Recovery UI saat component crash |
| Enhanced `<Button>` | +gradient, outline-primary, ghost-primary, success, warning + xs/xl sizes + loading |
| Enhanced `<Input>` | inputSize + leftIcon/rightIcon + error state |
| Enhanced `<Card>` | 6 variants + padding presets + interactive hover |

### Phase 2 Components
| Component | Purpose |
|-----------|---------|
| `<Command>` primitives | shadcn-style cmdk wrapper |
| `<CommandPalette>` | ⌘K global search with 40+ routes, grouped, permission-filtered |
| `<DataTable>` | TanStack table — sortable, paginated, searchable, with skeleton loading |
| `<FormField>` + `<FormRow>` + `<FormSection>` | Zod-ready form primitives |
| `<Combobox>` | Searchable select dengan icon + description |
| `<Popover>` | Radix popover primitive |

---

## 🏢 Layout Transformation

### TopBar (NEW)
- Breadcrumb auto-generated dari route
- ⌘K global search launcher (opens Command Palette)
- 3 traffic lights: Billing Sync / API / MikroTik (live status)
- Theme toggle (light/dark)
- Notification bell (integrated dari floating)
- User avatar + dropdown menu (profile, logout)
- Mobile: hamburger + page title + search icon + bell + theme + avatar

### Sidebar (Upgraded)
- Gradient logo "JABNET / FIBER OPERATIONS" dengan branded icon
- Reorganized Marketing group (CRM funnel order)
- Count badges per group
- Premium profile card dengan online status dot
- Version footer dengan live pulse indicator

### BottomNav (Mobile)
- Premium glass morphism
- Gradient top indicator pada active item
- Scale animation on active
- Asset color tokens di bottom sheet (asset-pop, asset-odc, dll)

### FloatingMenuButton (NEW)
- Pattern Google Maps / Gojek style
- 3 glass-morphism pills di kiri atas untuk `/map` dan `/canvassing` pada mobile
- Menu button (opens sidebar drawer) + page label pill + home shortcut
- Safe area insets aware

### BottomSheet (Upgraded)
- Spring animation 320ms cubic-bezier
- Swipe-from-handle only (60px drag zone)
- Body scroll lock
- Esc to close
- Close button X + description support

---

## 🚪 Authentication Pages (All 3 Redesigned)

### Staff Login (`/login`)
- **Mobile**: Gradient mesh hero band atas + elevated form card
- **Desktop**: Split 55/45 dengan hero kiri (feature pills + 3-stat trust + SSL badge) + form kanan
- Staff Portal badge, "Selamat datang kembali", password show/hide toggle, gradient CTA

### Portal Pelanggan (`/portal/login`)
- Gradient mesh hero (320px) dengan "Internet Cepat dalam Genggaman" text gradient
- "AKSES PORTAL" pill + "Halo, Pelanggan JABNET!" greeting
- Customer ID input besar (h-14, mono tracking) dengan auto-check icon
- Footer: Uptime/Support/Live Traffic + SSL badge

### OTP Verify (`/portal/verify`)
- Backdrop mesh subtle (opacity 30%) + dot pattern
- OTP boxes dengan active state (border-primary + shadow + scale 105%)
- Progress bar countdown TTL dengan color gradient (sky→primary → warning → danger)
- Success state animasi dengan ping pulse

---

## 👥 Customer Portal Dashboard

- Header mobile: gradient mesh backdrop + greeting "Halo, selamat datang, [Name]! 👋"
- Status pill dengan backdrop-blur (ONLINE/OFFLINE/ISOLIR)
- Bottom nav premium: gradient top indicator + rounded icon container dengan scale
- Quick Actions redesigned (2x2 grid dengan decorative overlay per tone)
- Badge urgency pada Tagihan (! untuk overdue, "Xh" untuk due soon)

---

## 📣 Marketing Module — Full CRM Premium

### Sidebar Reorganization (CRM Funnel Order)
```
MARKETING
├─ Dashboard Marketing        (Overview)
├─ Canvassing Lapangan        (Lead Gen: Field work)
├─ Prospect Finder            (Lead Gen: Semantic search)
├─ Lead Pipeline              (Pipeline: Kanban)
├─ Database Kontak            (Pipeline: Flat list)
├─ Riwayat Sesi               (Analytics: Session history)
├─ Laporan Lapangan           (Analytics: Field reports)
├─ Area Insights              (Analytics: was "Keputusan Bisnis")
└─ Iklan & Kampanye           (Acquisition campaigns)
```

### MarketingDashboardPage — Full Rewrite
- Hero Pipeline Momentum card (gradient mesh + circular conversion gauge)
- StatTile row (Prospek Baru / Dihubungi / Closing / Tidak Jadi)
- Pipeline Funnel dengan drop rate per stage
- Leaderboard Tim dengan medals (🥇🥈🥉)
- Activity feed clickable dengan semantic tone
- Field Report insights + severity distribution

### LeadPipelinePage — Enhanced Kanban Cards
- **Lead Temperature System**: Hot (flame icon + warning border), Stalled (alert + destructive border), Fresh (⚡ badge), Lead Baru (pulse dot)
- **Activity tracking**: Last update chip dengan color urgency (0-1h hijau, 2-7h abu, 8-14h amber, 15+ merah)
- **Semantic stat cards** dengan border-left color per metric (Total/Active/Won/Konversi)
- **Header baru** dengan gradient icon box + SPV badge + polish Kanban/List toggle

### ContactsPage (Database Kontak) — Full Rewrite
- PageHeader info accent
- Sticky filter card dengan Search + Source + Category chips
- Gradient avatars per category (emerald/amber/sky/violet/slate)
- Detail drawer dengan activity timeline + quick log + WhatsApp/Call CTAs

### BusinessDecisionPage (Area Insights) — Full Rewrite
- Rename dari "Keputusan Bisnis" → "Area Insights"
- Hero violet gradient dengan Distribusi Severity visualization
- Issue type matrix (6 kategori) dengan filter chip
- Recommendations section dengan semantic tones (invest/avoid/investigate)
- Per-area severity score visualization

---

## 🔧 Bug Fixes

### `AuthContext.canRead()` / `canWrite()` added
- **Bug**: v4.1.10 memiliki Sidebar, App.tsx WithPerm, PublicApiPage yang memanggil `canRead()` dari `useAuth()` tapi **tidak diexport** — causing silent errors saat Sidebar render
- **Fix**: Added `canRead(key)` dan `canWrite(key)` helpers ke AuthContext dengan logic:
  - Admin/administrator role → selalu true
  - Per-key via `user.permLevels[key]` (read/write)
  - Fallback ke legacy `user.permissions[]` array untuk read
- **Impact**: Permission-based UI filtering sekarang bekerja dengan benar

### `pt-16 md:pt-6` legacy padding fixed
- 5 pages (UsersPage, RolesPage, PublicApiPage, BugReportsPage, AnnouncementsPage) sebelumnya offset 64px untuk accommodate hamburger float
- Sekarang TopBar handle header space, adjusted ke `pt-4 md:pt-6`

---

## 🚀 New Features

### Command Palette (⌘K)
Press `Cmd+K` / `Ctrl+K` kapan saja untuk akses cepat:
- **Navigasi Utama** (Dashboard, Peta, Pelanggan, Marketing, Canvassing, Lead Pipeline, dll)
- **Aset Jaringan** (POP, ODC, ODP, Tiang, Kabel, OTB, Bestray, Splitter, dll)
- **Billing & Operations** (Tickets, Collection, Packages, Sessions, Monitoring, Routers, Devices)
- **Tools & Utilitas** (Splitter Chain, Power Budget, Export/Import, Insights, Ads)
- **Administrasi** (Users, Roles, Audit, Integrations, API Keys, MPWA, Announcements, Bug Reports)
- **Aksi Cepat** (Profil, Theme Toggle, Logout)

Keyboard: ↑↓ navigate, ⏎ select, esc close. Fuzzy search support.

### Showcase Page (`/showcase`)
Demo page untuk preview semua komponen Phase 2 — live DataTable, FormField + zod, Combobox, StatusBadge matrix, EmptyState variants, StatTile trends, Button variants.

---

## 🔨 Technical Improvements

### Dependencies Added
- `cmdk` — Command palette primitives
- `@tanstack/react-table` — DataTable sortable+paginated
- `zod` — Form validation schemas
- `@radix-ui/react-visually-hidden` — A11y helpers

### Build
- Version bumped `v4.1.10` → `v4.2.0`
- No breaking API changes (backward compat)
- TypeScript strict still passing

### Performance
- Lazy-loaded all 46+ routes via `lazy(() => import(...))`
- Skeleton loading replaces spinners (feels faster)
- `refetchInterval` preserved (60s dashboard, 30s pipeline, dll)

---

## 📦 Migration Guide dari v4.1.10

### For End Users
- Nothing. Fully backward-compatible.
- Login credentials sama, data tidak berubah.
- New feature: Press ⌘K untuk search cepat.

### For Developers / Claude Code
**DO:**
- Pakai `<PageHeader>` instead of manual `<h1>`
- Pakai `<StatTile>` instead of custom KPI div
- Pakai `<EmptyState>` instead of "Belum ada data" text
- Pakai `<Skeleton*>` instead of `<Loader2>` spinner
- Pakai `text-success`, `bg-warning/10`, `bg-destructive/15` instead of hardcoded hex
- Ikut pattern di `docs/DESIGN_SYSTEM.md` + Marketing Dashboard sebagai reference

**DON'T:**
- ❌ `const T = { accent: "#ff5f2e", ... }` — Terra tokens deprecated
- ❌ `style={{color: "#22C55E"}}` — pakai class `text-success`
- ❌ Manual loading spinner — pakai SkeletonCard/SkeletonTable
- ❌ Custom modal styling — pakai shadcn Dialog
- ❌ Inline breadcrumb — PageHeader handle otomatis

### Known Gaps (Phase 3 Backlog)
- CanvassingPage masih 97 Terra refs (map-heavy, risk refactor)
- PublicCoveragePage, CoverageDocsPage masih Terra (low-priority public pages)
- Some legacy pages (UsersPage, TicketingPage, LoyaltyAdminPage) masih ada bg-slate/bg-gray hardcoded
- Real-time WebSocket sync (still polling)
- Workflow automation / task inbox
- Lead duplication detection
- Multi-tenant revenue forecasting

---

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)** — Handoff memory (updated dengan design system rules)
- **[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)** — Full design system spec
- **[docs/UI_UX_AUDIT.md](docs/UI_UX_AUDIT.md)** — Audit awal v4.1.10
- **[RELEASE_NOTES.md](RELEASE_NOTES.md)** — This file

---

## 🎁 Credits

Redesign oleh Claude Code (Sonnet 4.6 + Opus 4.7) sebagai pair programmer untuk PT Arkanova Cipta Inovasi.

**Refactored pages (zero-downtime):**
- Login Staff, Portal Login, OTP Verify
- Dashboard (main)
- Marketing Dashboard, Lead Pipeline, Contacts, Area Insights
- Customer Portal Dashboard

**New pages:**
- `/showcase` — Phase 2 component demo

**Enterprise patterns adopted from:** Salesforce Sales Cloud · HubSpot CRM · Pipedrive · Close.com · Biznet Home · MyTelkomsel · Vodafone Business · Grab/Gojek mobile

---

_End of Release Notes v4.2.0_
