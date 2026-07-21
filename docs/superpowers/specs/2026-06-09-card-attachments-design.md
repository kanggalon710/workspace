# Spec - Card File/Photo Attachments (SP1 of Advanced Pipeline Automation)

> Date: 2026-06-09 · Mitra-scoped · First sub-project of the Advanced Pipeline Automation epic.
> Driving AC: "/pipeline supports foto/file upload" (acceptance #1).

## Goal

Let users attach multiple files (images + documents) to a pipeline **card**, stored on the
**filesystem** (never in MySQL), fully multi-tenant isolated and permission-aware. Per-card only;
master-card / cross-card sync defers to a later sub-project (needs `master_card_id` from SP2).

## Decisions (confirmed)

1. **Transport:** `multipart/form-data` via **busboy** (pure-JS, streams to disk, enforces the size cap
   mid-stream). New runtime dependency.
2. **Bytes on filesystem, metadata in DB.** New table `pipeline_card_attachments` holds only metadata +
   a relative path. No base64 in MySQL.
3. **Delete:** the uploader OR a pipeline admin/`manage` capability only (not every card-editor).
4. **Allowed types:** `jpg, png, webp, pdf, docx, xlsx, zip`. **Cap 25 MB/file** (post client-compression
   for images).
5. **Image storage rules** (delegated): images client-compressed before upload (reuse
   `client/lib/imageCompress.ts`) - longest edge ≤1920px, ~82% quality, PNG-with-alpha kept as PNG;
   documents stored as-is.

## 1. Storage layout + multi-tenant isolation

Per-mitra, rooted at the existing uploads root (`server/uploads.ts` `getUploadRoot()`):

```
uploads/<mitra-slug>/pipeline/YYYY/MM/<cardId>-<8hex>.<ext>
```

- Slug resolved from the request's active mitra (`getMitraSlug`/existing helper).
- On-disk filename is non-guessable (`crypto.randomBytes(4)` hex suffix). The **original** filename is
  kept in DB (`file_name`) for display + download `Content-Disposition`.
- DB stores the **relative** path (e.g. `jabnet/pipeline/2026/06/142-7a3b1c9d.pdf`).
- **Isolation:** every read/stream/delete checks `attachment.mitra_id === active mitra`, plus a
  `..`/absolute-path/null-byte guard before `path.join`. A tenant cannot read another tenant's file
  (mitra check + unguessable path). Mirrors the established photo pattern.
- `UPLOADS_READ_ONLY=true` (dev default) → writes rejected with an explicit error (existing behavior in
  `saveBase64Photo`; new file helper honors the same flag).

## 2. `server/uploads.ts` generalization (additive - photo helpers untouched)

```ts
// Stream an uploaded file (already a Buffer assembled by busboy under the size cap) to the per-mitra
// pipeline dir. Returns the relative path + resolved extension. Honors UPLOADS_READ_ONLY.
export async function saveUploadedFile(
  slug: string, feature: string, idHint: number | string, buf: Buffer, originalName: string,
): Promise<{ relativePath: string; ext: string }>;

// Generalized streamPhoto: content-type from a mime map; optional download disposition.
export async function streamFile(
  relativePath: string, res: Response, opts?: { download?: boolean; fileName?: string },
): Promise<void>;
```

`buildAttachmentPath(slug, idHint, ext)` builds the relative path with the real extension (the existing
`buildRelativePath` hardcodes `.jpg`, so a sibling helper is added). `streamPhoto` stays for the photo
flows; `streamFile` is the generalized version used here.

## 3. Pure validation module - `shared/attachmentRules.ts` (no I/O, unit-tested)

```ts
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_TYPES: { ext: string; mime: string; kind: "image" | "file" }[] = [
  { ext: "jpg",  mime: "image/jpeg", kind: "image" },
  { ext: "jpeg", mime: "image/jpeg", kind: "image" },
  { ext: "png",  mime: "image/png",  kind: "image" },
  { ext: "webp", mime: "image/webp", kind: "image" },
  { ext: "pdf",  mime: "application/pdf", kind: "file" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "file" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "file" },
  { ext: "zip",  mime: "application/zip", kind: "file" },
];

// Lowercased, last-segment extension; "" if none.
export function fileExt(name: string): string;
// Validate by extension (mime is advisory - browsers lie). Returns the matched type or an error.
export function validateAttachment(name: string, sizeBytes: number):
 | { ok: true; ext: string; mime: string; kind: "image" | "file" }
 | { ok: false; error: string };
// content-type for streaming a given stored ext (mime map + octet-stream fallback).
export function mimeForExt(ext: string): string;
```

Rules: reject when ext not allowlisted (`"Tipe file tidak didukung"`), size 0 (`"File kosong"`), or
size > cap (`"File melebihi 25 MB"`). zip/docx/xlsx validated by extension (their real mime is
unreliable across browsers). The on-disk `ext` is taken from this allowlist, never from raw user input.

## 4. Schema + storage

New table (startup `CREATE TABLE IF NOT EXISTS` in `server/storage.ts`, alongside the other
`pipeline_card_*` tables):

```sql
CREATE TABLE IF NOT EXISTS pipeline_card_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mitra_id INT NOT NULL DEFAULT 1,
  card_id INT NOT NULL,
  pipeline_id INT NOT NULL,            -- denormalized: capability + row-level checks without a card join
  file_name VARCHAR(255) NOT NULL,     -- original name (display + download)
  file_path VARCHAR(255) NOT NULL,     -- relative to uploads root
  mime_type VARCHAR(128) NOT NULL,
  size_bytes INT NOT NULL,
  kind VARCHAR(8) NOT NULL DEFAULT 'file', -- image | file
  uploaded_by INT NOT NULL,
  created_at TEXT NOT NULL,
  INDEX idx_card_attachments_mitra_card (mitra_id, card_id)
);
```

Drizzle table def in `shared/schema.ts`. Storage methods (all mitra-scoped via `getMitraId()`):
- `addCardAttachment(data): Promise<CardAttachment>` (insert + re-select, MySQL pattern).
- `listCardAttachments(cardId): Promise<CardAttachment[]>` (ordered newest-first).
- `getCardAttachment(id): Promise<CardAttachment | undefined>`.
- `deleteCardAttachment(id): Promise<number>` (affectedRows).

## 5. Endpoints (`server/routes.ts`)

All under the main router (tenant context + capability helpers available). Reuse
`requirePipelineCapability(req,res,pid,cap)`, `isPipelineAdmin`, `requireCardAccess`.

| Endpoint | Guard |
|---|---|
| `POST /api/pipelines/cards/:cardId/attachments` (multipart, 1..N files) | `cards` cap + `requireCardAccess` + write-enabled; busboy cap 25 MB + allowlist; per file: validate → `saveUploadedFile` → `addCardAttachment` → audit `attachment_added`. Returns the new rows. |
| `GET /api/pipelines/cards/:cardId/attachments` | `view` cap + `requireCardAccess` → list metadata. |
| `GET /api/pipelines/attachments/:id/raw[?download=1]` | load row → mitra match → resolve its card → `view` cap + `requireCardAccess` → `streamFile` (inline, or `download` disposition). |
| `DELETE /api/pipelines/attachments/:id` | load row → mitra match → **uploader OR `isPipelineAdmin` OR `manage` cap** → `deletePhoto(file_path)` + `deleteCardAttachment` + audit `attachment_removed`. |

Busboy: stream each file part into a capped buffer; abort + 413 if it exceeds 25 MB; reject
disallowed extensions before writing. No temp files. The `/raw` endpoint is reachable by `<img>`/`<a>`
tags: `authMiddleware` already falls back from the `Authorization` header to the **`ftth_session`
cookie** (routes.ts:184-190) - the same mechanism that makes the comment-photo `<img>` work - so `/raw`
authenticates with no extra work. No token in the URL.

## 6. Frontend - `CardDetailModal`

New **"Lampiran"** section (distinct from the comment thread):
- Multi-file picker + drag-drop dropzone. Images run through `compressImage()` before the multipart POST;
  documents sent as-is. Per-file upload progress; client-side pre-check against the allowlist + size cap
  (mirrors the server, fail fast).
- **Images** → thumbnail grid (`<img src="/api/pipelines/attachments/:id/raw">`), click = lightbox.
  **Documents** → row with a type icon (Lucide: FileText/FileSpreadsheet/FileArchive), original name,
  human size; click = open `?download=1` (PDF opens inline in a new tab).
- Per-item delete button shown only when `attachment.uploaded_by === currentUser.id || isPipelineAdmin`.
- Empty state; loading skeleton; gated so it renders read-only when the user lacks `cards`.
- Hook(s) in `usePipelines.ts`: `useCardAttachments(cardId)` (list), `useUploadAttachments(cardId)`
  (multipart mutation w/ FormData), `useDeleteAttachment()` - invalidate the list on success.

Uses design-system components only; no hardcoded hex; semantic HTML.

## 7. Audit

Upload + delete write a `pipeline_card_activity` row (`attachment_added` / `attachment_removed`, detail =
file name) so the card timeline shows file activity. Reuses the existing activity table + viewer.

## 8. Testing

- `shared/attachmentRules.test.ts`: `fileExt` (none / multi-dot / uppercase), `validateAttachment`
  (allowed image, allowed doc, disallowed ext, zero size, over-cap), `mimeForExt` (known + fallback).
- `server/uploads.ts` new helpers: extension/path-traversal guard covered by a small unit test
  (`saveUploadedFile` rejects `..`/absolute; `mimeForExt` fallback).
- Endpoints + UI: typecheck + build + manual on dev.

## 9. Deploy caveats (runbook, not code)

1. **New dependency `busboy`** → after merge, cPanel needs `npm install` (pure-JS; safe with the
   `npm ci --omit=dev --ignore-scripts` flow). The esbuild bundle keeps it external, so node_modules
   must contain it on the server.
2. **Dev `UPLOADS_READ_ONLY=true`** → uploads rejected on dev. To test SP1 on dev, set it to `false` in
   `/home/jabnet/private/fiber-jabnet-dev/config/.env` and ensure the dev uploads dir is writable, then
   restart. Prod already writes uploads (canvassing/bug photos), so no change there.

## Out of scope

- Master-card attachments + sync-to-linked-card (needs `master_card_id` - SP2+).
- Server-side image transforms/thumbnails (compression is client-side).
- Virus scanning, external object storage (S3/R2) - revisit if cPanel disk pressure appears.
- Inline preview for docx/xlsx (download only; PDFs open in-browser).
