# Typed Card Comments + Per-Entry Attachments (`/pipelines`) - Design

> Tanggal: 2026-06-15 · Status: spec disetujui (brainstorm), siap → writing-plans
> Konteks: card detail `/pipelines` (`CardDetailModal`). Menambah dropdown tipe entri + upload (foto+file) per entri, dan merapikan UI/UX bagian Komentar & Lampiran.

## Konteks & masalah

Card detail saat ini punya 3 blok bertumpuk yang membingungkan:

1. **Lampiran** (`CardAttachments`) - upload multi-file generik (drag-drop, filesystem-backed, grid gambar + list file). UX sudah baik.
2. **Komentar & Lampiran** - komentar teks polos dengan foto opsional (`photoPath`) **yang composer-nya tidak bisa upload** (kolom ada, form tidak). Tanpa tipe.
3. **Aktivitas** - log sistem read-only menampilkan string tipe mentah (`commented`, `moved`).

Permintaan: (a) perbaiki UI/UX komentar & lampiran, (b) dropdown pilih tipe entri **Catatan / Telepon / WhatsApp / Kunjungan / Aktivitas**, (c) upload (foto + file) per entri, gambar **di-compress dulu** sebelum upload.

Polanya sudah ada di `/leads` (`LeadPipelinePage`): dropdown `note/call/whatsapp/visit` + lampir foto. Kita adopsi pola itu ke pipeline generik dengan reuse infrastruktur attachment yang sudah ada.

**Keputusan brainstorm (terkonfirmasi user):**
- **5 tipe**: `note` (Catatan), `call` (Telepon), `whatsapp` (WhatsApp), `visit` (Kunjungan), `activity` (Aktivitas).
- **Upload per entri = foto + file** (pdf/doc/xlsx), reuse tabel `pipeline_card_attachments` via kolom `comment_id`. Gambar di-compress client-side dulu.
- **Layout tetap 3 section** (Lampiran generik → Komentar bertipe → Aktivitas sistem), hanya dirapikan.

## Arsitektur

```
Composer (CardComments) --multipart {body,type,files[]}--▶ POST /cards/:id/comments
  files: JPEG di-compress (compressImage) sebelum append ke FormData
        |
        ▼
addComment(cardId, authorId, body, type)  → row pipeline_card_comments
  for each file: saveCardAttachment(..., commentId)  → pipeline_card_attachments (comment_id set)
        |
GET /cards/:id  --▶ comments[] tiap comment.attachments[] (group by comment_id)
                    + authorName (batch resolve, anti-N+1)
                    Lampiran generik = attachments WHERE comment_id IS NULL
```

Reuse tabel attachment (bukan tabel baru / single `photoPath`) membuat "foto + multi-file per entri" hampir gratis: jalur simpan/stream/hapus/compress sudah ada. `comments.photoPath` lama tetap terbaca (render legacy).

## Data model (2 kolom aditif, tanpa tabel baru)

| Tabel | Kolom baru | Tipe | Catatan |
|---|---|---|---|
| `pipeline_card_comments` | `type` | `varchar(16)` default `"note"` | salah satu dari catalog 5 tipe |
| `pipeline_card_attachments` | `comment_id` | `int` NULL | NULL = Lampiran kartu (perilaku lama); set = milik 1 komentar |

**Migrasi**: cek `information_schema.columns` lalu `ALTER TABLE ... ADD COLUMN` per kolom dengan try/catch terpisah (DB tolak `ADD COLUMN IF NOT EXISTS` - konvensi project, lihat [[reference-startup-add-column]]). Tambah ke blok migrasi startup `server/storage.ts`.

## Shared - `shared/cardCommentTypes.ts` (pure, tested)

Single source of truth:
```ts
export interface CardCommentType { key: string; label: string; icon: string; color: string }
export const CARD_COMMENT_TYPES: CardCommentType[] = [
  { key: "note",     label: "Catatan",   icon: "FileText",       color: "text-muted-foreground" },
  { key: "call",     label: "Telepon",   icon: "Phone",          color: "text-info" },
  { key: "whatsapp", label: "WhatsApp",  icon: "MessageSquare",  color: "text-success" },
  { key: "visit",    label: "Kunjungan", icon: "MapPin",         color: "text-warning" },
  { key: "activity", label: "Aktivitas", icon: "Activity",       color: "text-violet" },
];
export const CARD_COMMENT_TYPE_KEYS = CARD_COMMENT_TYPES.map((t) => t.key);
export function cardCommentType(key: string | null | undefined): CardCommentType; // fallback → note
export function isCardCommentType(key: string): boolean;
```
Dipakai composer (opsi dropdown) + timeline (ikon/label/warna). Ikon di-resolve di komponen via map nama→Lucide (JSX tetap di komponen, metadata tetap di module). Unit test: `cardCommentType` fallback + `isCardCommentType`.

## Backend

- `storage.addComment(cardId, authorId, body, type)` - terima `type` (validasi `isCardCommentType`, default `note`).
- `POST /api/pipelines/cards/:cardId/comments` → **multipart**:
  - gate `loadGuardedCard(req,res,"comment")` (tetap).
  - `parseMultipart(req, { maxBytes: ATTACHMENT_MAX_BYTES, maxFiles: 10, maxTotalBytes: 60MB })` → `fields.body`, `fields.type`, `files[]`.
  - `body` opsional bila `files.length > 0` (entri foto-only valid). Bila keduanya kosong → 400.
  - buat comment, lalu tiap file → `saveCardAttachment({ cardId, pipelineId, commentId, ... })`.
  - `notifyPipelineCardWatchers` tetap (judul "Komentar baru" / label tipe).
- **Helper bersama** `saveCardAttachment(...)`: ekstrak loop simpan-file yang sekarang inline di endpoint attachments generik (`/cards/:id/attachments`) menjadi satu fungsi, dipakai kedua endpoint (DRY). Endpoint generik memanggil dengan `commentId: null`.
- `storage.listComments(cardId)` tetap; **card-detail GET** (`GET /api/pipelines/cards/:id`):
  - batch ambil attachments kartu sekali → kelompokkan: `commentId IS NULL` → `attachments` (Lampiran), `commentId = X` → tempel ke `comment.attachments`.
  - batch resolve `authorId → name` (mitra-scoped via `getAssignableUsers`, anti-N+1), tempel `authorName` (fallback "Pengguna").
- `storage.listCardAttachments(cardId)` (dipakai `/cards/:id/attachments` GET) → filter `comment_id IS NULL` (Lampiran generik saja).
- `deleteComment(id)` → cascade: hapus attachment milik comment + file fisik (`deletePhoto`/unlink) lalu hapus comment.
- `deleteCardAttachment` (existing, by id) tetap jalan untuk attachment comment maupun generik.

## Frontend (SoC: keluarkan komentar dari `CardDetailModal` 383 baris)

- **`client/components/pipelines/CardComments.tsx`** (baru) = composer + timeline:
  - **Composer**: `<select>` 5 tipe + `<Input>` teks + tombol lampir (multi-file) + preview (thumbnail gambar / chip file) dengan tombol hapus + **Kirim**. JPEG di-compress (`compressImage`, maxDim 1920 / ~1.5MB) sebelum `FormData.append` (sama seperti `useUploadAttachments`).
  - **Timeline**: per item - ikon+warna by tipe, `authorName`, waktu relatif, teks, lalu `<AttachmentGallery>` untuk lampirannya (+ render legacy `photoPath` bila ada). EmptyState bila kosong.
- **`client/components/pipelines/AttachmentGallery.tsx`** (baru): presentasional - grid gambar + chip file + tombol hapus opsional. Diekstrak dari `CardAttachments`, dipakai oleh Lampiran generik **dan** tiap komentar (satu jalur render, DRY).
- `CardAttachments.tsx` → pakai `<AttachmentGallery>` untuk bagian list (composer drag-drop tetap).
- **`useAddComment`** mutation → multipart (`type` + `files`), mirror `useUploadAttachments` (compress + FormData + auth header tanpa Content-Type). Ganti `m.addComment` lama (JSON `{body}`); satu-satunya pemanggil = `CardComments`.
- Tipe `RuleWithMaps`/card-detail comment di `usePipelines.ts`: `comments[]` += `type`, `authorName`, `attachments[]`.
- **Aktivitas (sistem)**: humanize label tipe (`commented`→"Komentar ditambah", `moved`→"Dipindah stage", `created`→"Kartu dibuat", dst) via map kecil; fallback ke string mentah.

## Cross-cutting

- **Tenant isolation**: semua query via `getMitraId()`; attachment & comment scoped mitra.
- **Permission**: gate `comment` (write) untuk tambah; `view` untuk baca; hapus attachment = uploader atau admin (pola `CardAttachments` existing).
- **Compress**: gambar JPEG di-compress client-side sebelum upload (≤1920px / ~1.5MB). PNG/webp/dok dikirim apa adanya (preserve alpha/binary), seperti `useUploadAttachments` sekarang.
- **Limit**: 25MB/file (`ATTACHMENT_MAX_BYTES`), 10 file/req, 60MB total - reuse.
- **Best-effort author name**: gagal resolve → "Pengguna", tidak menggagalkan GET.

## Acceptance Criteria

1. Composer komentar punya dropdown 5 tipe (Catatan/Telepon/WhatsApp/Kunjungan/Aktivitas) + lampir multi-file.
2. Submit dengan/atau tanpa teks (asal ada teks atau ≥1 file) membuat comment bertipe + attachment ter-link (`comment_id` terisi).
3. Gambar JPEG ter-compress sebelum upload.
4. Timeline menampilkan ikon/label per tipe + nama author + waktu + teks + galeri lampiran (gambar thumbnail + chip file dapat diunduh).
5. Section **Lampiran** generik hanya menampilkan attachment `comment_id IS NULL` (tak tercampur lampiran komentar).
6. Hapus komentar ikut menghapus attachment + file fisiknya.
7. Aktivitas sistem tampil label manusiawi.
8. Tenant-scoped; permission gate tetap; `npm run typecheck` 0; build ok; test shared hijau.

## Out of scope

- Komentar bertipe TIDAK memicu automation engine (murni logging UI).
- Edit komentar, @mention, reaksi.
- Migrasi data legacy `comments.photoPath` → attachments (cukup render dua-duanya).
