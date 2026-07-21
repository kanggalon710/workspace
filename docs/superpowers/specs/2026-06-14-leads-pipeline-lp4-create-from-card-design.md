# LP4 - Create Lead dari Kartu Pipeline - Design

> Tanggal: 2026-06-14 · Status: spec disetujui (brainstorm), siap → writing-plans
> Epik: **Leads ↔ Pipeline Automation** ([[project-leads-pipeline-integration]]). Slice reverse setelah LP1+LP2 (DONE on dev).

## Konteks

LP1/LP2 = lead → card (forward). LP4 = arah balik: dari board `/pipelines`, user dapat **membuat lead** (source of truth di modul Leads yang sudah ada) dari sebuah kartu, tanpa pindah modul. Memenuhi Acceptance Criteria #9 ("Pipeline dapat membuat lead baru tanpa keluar dari modul pipelines") + #12 ("tetap pakai source of truth yang sama; jangan buat tabel lead baru").

**Keputusan brainstorm:**
- **Entry point** = tombol **"Buat Lead"** di modal detail kartu (kartu yang belum tertaut lead). Eksplisit, tanpa config per-pipeline, minim kejutan.
- **Card→Lead** = dialog konfirmasi **pre-filled + auto-detect** (nama=judul; phone/lat-lng terdeteksi dari field kartu by tipe; user edit lalu simpan).
- **Template/preset pipeline lead (#13) DIPECAH → LP4b** (fitur konvenien terpisah).
- **1 lead per kartu**: kartu yang sudah tertaut menampilkan badge "Tertaut ke Lead", tak bisa buat lagi.
- **Permission**: akses **edit pipeline** kartu (bukan butuh permission `marketing`) - user yang mengelola kartu boleh membuat lead tertaut.

## Arsitektur & alur

```
CardDetailModal (kartu BELUM tertaut lead)
  → tombol "Buat Lead"
  → CreateLeadFromCardDialog (pre-filled via detectLeadPrefill: judul→nama, field telepon→phone, field koordinat→lat/lng)
       user edit nama/telepon/alamat/kategori/koordinat → submit
  → POST /api/pipelines/cards/:cardId/create-lead { name, phone?, address?, lat?, lng?, category?, district?, village? }
       server (tenant-scoped):
         - getCardById(cardId) → pipelineId; cek akses edit pipeline; 404 cross-tenant
         - getLeadCardLinkByCard(cardId) → kalau ADA: 409 "Kartu sudah tertaut lead"
         - storage.createLead({ ...body, source:"pipeline", createdBy:actor, assignedTo:actor, createdAt })
         - storage.createLeadCardLink({ leadId, cardId, ruleId:null })
         - createAuditLog(CREATE lead, dari card)
         - TIDAK emitLeadEvent  ← anti-loop (kartu sudah eksis & tertaut)
       → { lead, link }
  → CardDetailModal re-render: badge "Tertaut ke Lead #<id>" (link /leads)
```

**Loop-safety (kritis):** path ini **tidak** memanggil `emitLeadEvent`. Kalau memanggil, lead_created akan memicu intake LP1 → bisa membuat kartu KEDUA di pipeline yang punya rule lead_created. Karena kartu sudah eksis dan langsung di-`lead_card_links`, tak perlu intake. Ini menutup risiko loop utama (saat create).

**Catatan dedup pada update berikutnya (keterbatasan diketahui):** LP4 menulis link dengan `ruleId: null`. Dedup `lead_id` di intake LP1 mencocokkan link by `ruleId === rule.id`, jadi link LP4 **tak terlihat** oleh rule `lead_updated`. Akibatnya, JIKA ada rule `lead_updated` dgn `dedupBy:"lead_id"` yang menarget pipeline yang sama dgn kartu LP4, meng-edit lead via `/leads` BISA membuat kartu duplikat. Risiko rendah (butuh konfigurasi rule `lead_updated` spesifik). **Refinement masa depan (bukan bagian LP4):** ubah dedup `lead_id` agar pipeline-scoped - cari link yang kartunya berada di pipeline target rule (apa pun asal/ruleId-nya), bukan match by `ruleId`. Ditunda agar tak mengubah semantik dedup LP1 di luar scope ini.

## Data model

**TANPA tabel/kolom baru.** Reuse `lead_card_links` (LP1). Tambah satu method storage lookup by card.

## Backend

### Storage (`server/storage.ts`)
- `getLeadCardLinkByCard(cardId: number): Promise<LeadCardLink | null>` - tenant-scoped (`mitra_id` + `card_id`), ambil 1 (untuk cek tautan + badge).
- Reuse: `createLead` (sudah return row), `createLeadCardLink` (LP1), `getCardById`/`getCard` (cek kartu + pipelineId), `createAuditLog`.

### Endpoints (`server/routes.ts`, di area pipeline cards)
- `GET /api/pipelines/cards/:cardId/lead-link` (gated `pipelines` read + akses pipeline kartu) → `{ link: { leadId, cardId } | null }` (untuk badge). 404 kalau kartu beda tenant.
- `POST /api/pipelines/cards/:cardId/create-lead` (gated `pipelines` write + `requirePipelineEdit`/capability untuk pipeline kartu):
  - Validasi: `name` wajib (400 kalau kosong). `lat`/`lng` numerik bila ada.
  - Cek kartu tenant-scoped (404 kalau tak ada / beda tenant).
  - Cek `getLeadCardLinkByCard` → 409 bila sudah tertaut.
  - `createLead({ name, phone, address, lat, lng, category, district, village, source:"pipeline", stage:"new", priority:"medium", createdBy:actor, assignedTo:actor, assignedBy:actor, assignedAt, createdAt })`.
  - `createLeadCardLink({ leadId: lead.id, cardId, ruleId: null })`.
  - audit `CREATE` `lead` (entityName=lead.name, details: {fromCardId}).
  - **Tanpa** `emitLeadEvent`.
  - Return `{ lead, link: { leadId, cardId } }`.

> Permission detail: gunakan helper akses pipeline yang sudah ada (`requirePipelineCapability`/`requirePipelineEdit` + `requireWritePermission("pipelines")`) seperti endpoint card lain. TIDAK pakai `requireMarketing` (agar user pipeline non-marketing tetap bisa).

## Pure module

`shared/cardToLead.ts` (no I/O, tested):
- `detectLeadPrefill(title, cardValues, fieldMetas): { name: string; phone?: string; lat?: number; lng?: number }`
  - `name` = `title.trim()`.
  - `phone` = value field PERTAMA bertipe `phone` (kalau ada, non-empty).
  - `lat`/`lng` = parse value field PERTAMA bertipe `coordinate` (JSON `{lat,lng}`; pakai `parseCoordinate` dari registry field bila tersedia, atau JSON.parse aman).
  - Hanya field yang punya nilai yang dipakai; sisanya undefined (user isi manual).
  - Input `cardValues: Record<fieldId,string>` + `fieldMetas: { id, type }[]` (klien punya keduanya di modal).

Dipakai **klien** untuk pre-fill dialog. Server tak perlu introspeksi field (percaya form yang dikirim) - tapi tetap memvalidasi `name`.

## Client

- **Source label**: `"pipeline"` → "Dari Pipeline" (registry LP1; otomatis di /leads via `sourceLabel`).
- **`CardDetailModal`** (`client/components/pipelines/CardDetailModal.tsx`):
  - Query `useCardLeadLink(cardId)`.
  - Bila `link == null` + user bisa edit: tombol **"Buat Lead"** (buka dialog). Bila ada: badge **"Tertaut ke Lead #<leadId>"** (anchor ke `/leads`, semantic `<a>`).
- **`CreateLeadFromCardDialog`** (baru): form pre-filled dari `detectLeadPrefill(card.title, cardValues, fieldMetas)` - input nama (required), telepon, alamat, kategori (select: rumahan/bisnis/perkantoran/sekolah/lainnya), kecamatan, desa, koordinat (read-only tampil bila terdeteksi). Submit → mutation. Mobile-first, `<form>`/`<FormField>`.
- **Hooks**: `useCardLeadLink(cardId)` (GET), `useCreateLeadFromCard()` (POST; `onSuccess` invalidate `["card-lead-link", cardId]` + `["leads"]` + toast).

## Cross-cutting
- **Tenant isolation (#15):** kartu, lead, link semua di mitra sama; storage tenant-scoped; endpoint 404 cross-tenant.
- **Audit:** create-lead → audit log.
- **Loop-safe:** no event emit (lihat atas).
- **DRY/semantic/mobile-first:** reuse FormField/Combobox/Button/Dialog; pure detection module tested.
- **Performance:** lookup link 1 query terindeks (`mitra_id, card_id` - `lead_card_links` punya index `idx_lead_card_links_card`).

## Acceptance Criteria (LP4)
1. Modal detail kartu (tanpa lead) menampilkan tombol "Buat Lead".
2. Klik → dialog pre-filled (nama=judul; phone/koordinat auto-detect dari field kartu).
3. Submit membuat lead (`source="pipeline"`) di modul Leads existing + baris `lead_card_links`.
4. Kartu yang sudah tertaut menampilkan badge + link ke /leads, dan tak bisa buat lead lagi (409 server-side guard).
5. Lead tampil di `/leads` dengan label sumber "Dari Pipeline".
6. Tidak membuat tabel lead baru; tidak memicu intake (no second card); tenant-isolated; audited.
7. Permission = akses edit pipeline kartu (bukan permission marketing).

## Out of scope LP4 (sengaja)
- Template/preset pipeline lead (#13) → **LP4b**.
- Auto-resolve nearest ODP saat create (ada di POST /marketing/leads; LP4 skip - bisa ditambah kemudian).
- Two-way/Mirror sync lead↔card → **dibuang** (LP5, YAGNI).
- Bulk "buat lead" untuk banyak kartu → defer.
