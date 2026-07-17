# Collections — Custom Per-Mitra Pipeline (design)

> 2026-06-01 · feature for `/collections`. Approved by user.

## Goal

Tiap mitra punya pipeline collection sendiri yang bisa di-CRUD oleh admin:
ganti judul, warna, urutan (drag-drop), tambah/hapus stage. Hapus stage dengan
kartu di dalamnya → tanya: pindahkan kartu ke stage lain, atau hapus permanen
(warning keras). Mitra baru di-seed dari template default (clone stage milik
JABNET / mitra 1 saat ini).

## Key decision — automation anchoring via roles

Billing automation (auto-open saat isolir, auto-close saat lunas, auto write-off)
sekarang hardcode stage key (`new`/`paid`/`written_off`). Supaya pipeline bisa
fully custom tanpa mematikan otomasi, tiap stage punya **role** opsional:

- `entry` — stage tujuan auto-open (wajib tepat 1 per mitra)
- `paid` — terminal sukses, auto-close saat pembayaran terdeteksi (wajib tepat 1)
- `writeoff` — terminal gagal, target auto write-off (opsional 0/1; kalau tidak ada → auto write-off disabled)
- `none` — stage menengah biasa

Otomasi menargetkan stage **by role**, bukan by key. Stage pemegang role wajib
(`entry`/`paid`) tidak bisa dihapus sampai role dipindah ke stage lain.

(3-role model — pra-isolir & isolir digabung jadi satu `entry`; langkah lama
auto-promote `suspend`→`new` di-drop.)

## Data model

Tabel baru `collection_stages` (per-mitra):

| field | catatan |
|---|---|
| id, mitraId | |
| key | slug stabil, **immutable** setelah dibuat (kartu `collections.stage` menunjuk ke key ini) |
| label | judul tampilan — editable |
| color | hex — editable |
| position | int — urutan drag-drop |
| role | `none` \| `entry` \| `paid` \| `writeoff` |
| createdAt, updatedAt | |

Index: `idx_collection_stages_mitra (mitra_id)`, unique `(mitra_id, key)`.

**Default template** (seed mitra 1 dari konstanta `COLLECTION_STAGES` sekarang,
lalu clone ke tiap mitra lain/baru):
`suspend, new(role=entry), contacted, dikunjungi, issue, paid(role=paid), written_off(role=writeoff)`
— key/warna sama dengan sekarang ⇒ semua kartu collection existing tetap valid &
otomasi tetap jalan. `suspend` jadi kolom biasa (auto-open kini selalu mendarat di `entry`).

## Backend

- Endpoints (admin, scoped `activeMitraId`):
  - `GET /api/collections/stages` — list ordered by position
  - `POST /api/collections/stages` — create {label,color,role?}
  - `PATCH /api/collections/stages/:id` — edit {label?,color?,role?}
  - `PATCH /api/collections/stages/reorder` — body {orderedIds:number[]}
  - `DELETE /api/collections/stages/:id` — body {mode:"migrate"|"purge", targetKey?}
- Storage:
  - `getCollectionStages(mitraId?)`, `createCollectionStage`, `updateCollectionStage`,
    `reorderCollectionStages`, `deleteCollectionStage`.
  - `getCollectionStageKeyByRole(role)` (fallback ke konstanta legacy).
  - `seedCollectionStagesForMitra(mitraId)` — clone dari mitra 1; mitra 1 dari konstanta.
  - `moveCollectionStage` — tutup/buka-ulang berdasar **role** (`paid`/`writeoff` = terminal), bukan key hardcode.
  - `reconcileCollectionState` + `openCollectionFromCustomer` — pakai key role `entry`/`paid`.
- `billing-sync-worker.ts` — ganti `"new"`/`"paid"`/`"written_off"` dengan lookup role.
- `POST /api/mitras` — panggil `seedCollectionStagesForMitra(newId)`.
- Startup migration: create tabel + seed mitra 1 + backfill mitra lain.
- `/collections/:id/stage` — validasi target lawan stage milik mitra (dinamis,
  ganti array `VALID` hardcode); rule "issueType wajib di stage issue" di-relax (opsional).
- `/collections/stats` byStage tetap jalan (key dinamis, sudah generic).

## Frontend (`CollectionPipelinePage.tsx`)

- Fetch stages dari `/api/collections/stages` (ganti import konstanta statis).
  Kolom kanban render urut `position`, label & warna per-mitra.
- Tombol **"Kelola Pipeline"** (admin only) → dialog manajemen:
  - Baris stage draggable (reorder), tiap baris: color swatch (picker) + judul editable + role badge/select.
  - **+ Tambah Stage**.
  - **Hapus**: kalau stage punya kartu → dialog pilih (A) Pindahkan kartu ke stage lain (pilih target),
    atau (B) Hapus permanen (warning keras + ketik-untuk-konfirmasi). Stage role wajib (`entry`/`paid`)
    diblokir dari hapus dengan petunjuk pindah role dulu.
- Dialog stage-change kartu tetap; issueType jadi opsional.

## Out of scope
- Mengubah skema `collections.stage` jadi FK (tetap varchar key, cocok dengan key stabil).
- Per-stage custom fields / SLA.
