# Card File/Photo Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users attach multiple files (images + documents) to a pipeline card, stored on the filesystem (never in MySQL), multi-tenant isolated and permission-aware.

**Architecture:** A pure validation module (`shared/attachmentRules.ts`) + generalized filesystem helpers in `server/uploads.ts` + a busboy multipart parser + 4 REST endpoints + a `pipeline_card_attachments` metadata table + a `CardAttachments` UI section in `CardDetailModal`. Bytes live under `uploads/<mitra-slug>/pipeline/YYYY/MM/`; DB stores only metadata + relative path.

**Tech Stack:** TypeScript, Drizzle (MySQL dialect), Express 5, busboy (new dep), React 18 + TanStack Query 5, `node:test` via `npx tsx --test`.

**Conventions (read before starting):**
- Tests: `npx tsx --test <file>` (NO `npm test`). Import extensions are `.js`.
- MySQL Drizzle: no `.returning()` — insert then re-select by `insertId` (see `addComment`).
- All storage methods are tenant-scoped via `getMitraId()` (AsyncLocalStorage).
- Response envelope: `sendSuccess(res, data)` / `sendError(res, msg, status)`.
- New tables: `CREATE TABLE IF NOT EXISTS` in the startup migration block in `server/storage.ts` (alongside the other `pipeline_card_*` tables ~line 6878). `ADD COLUMN IF NOT EXISTS` is NOT supported, but `CREATE TABLE IF NOT EXISTS` is.
- Capability guards in routes: `requirePermission(req,res,"pipelines")` (read) / `requireWritePermission(req,res,"pipelines")` (write), then `requirePipelineCapability(req,res,pid,cap)`, `requirePipelineView(req,res,pid)`, `requireCardAccess(req,res,card)`, `isPipelineAdmin(req)`.
- `<img>`/`<a>` requests authenticate via the `ftth_session` cookie (set at login, routes.ts:650; read in authMiddleware, routes.ts:184-190). No token in URLs.

---

### Task 1: Pure validation module `shared/attachmentRules.ts`

**Files:**
- Create: `shared/attachmentRules.ts`
- Test: `shared/attachmentRules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/attachmentRules.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTACHMENT_MAX_BYTES,
  fileExt,
  validateAttachment,
  mimeForExt,
} from "./attachmentRules.js";

test("fileExt: lowercased last segment, '' when none", () => {
  assert.equal(fileExt("Foto.JPG"), "jpg");
  assert.equal(fileExt("a.b.PDF"), "pdf");
  assert.equal(fileExt("noext"), "");
  assert.equal(fileExt(".hidden"), "");
  assert.equal(fileExt("archive.tar.gz"), "gz");
});

test("validateAttachment: accepts allowed image + doc", () => {
  const img = validateAttachment("photo.jpg", 1_000_000);
  assert.equal(img.ok, true);
  if (img.ok) { assert.equal(img.kind, "image"); assert.equal(img.mime, "image/jpeg"); }
  const xlsx = validateAttachment("Tagihan.xlsx", 2_000_000);
  assert.equal(xlsx.ok, true);
  if (xlsx.ok) { assert.equal(xlsx.kind, "file"); assert.equal(xlsx.ext, "xlsx"); }
});

test("validateAttachment: rejects disallowed ext, empty, over-cap", () => {
  assert.equal(validateAttachment("evil.exe", 10).ok, false);
  assert.equal(validateAttachment("empty.pdf", 0).ok, false);
  assert.equal(validateAttachment("big.zip", ATTACHMENT_MAX_BYTES + 1).ok, false);
});

test("mimeForExt: known + octet-stream fallback", () => {
  assert.equal(mimeForExt("png"), "image/png");
  assert.equal(mimeForExt("pdf"), "application/pdf");
  assert.equal(mimeForExt("unknownext"), "application/octet-stream");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/attachmentRules.test.ts`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` (attachmentRules.js missing).

- [ ] **Step 3: Write minimal implementation**

Create `shared/attachmentRules.ts`:

```ts
/** Pure rules for pipeline card attachments — no I/O, fully unit-testable. */

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB/file

export interface AttachmentType { ext: string; mime: string; kind: "image" | "file" }

export const ATTACHMENT_TYPES: AttachmentType[] = [
  { ext: "jpg",  mime: "image/jpeg", kind: "image" },
  { ext: "jpeg", mime: "image/jpeg", kind: "image" },
  { ext: "png",  mime: "image/png",  kind: "image" },
  { ext: "webp", mime: "image/webp", kind: "image" },
  { ext: "pdf",  mime: "application/pdf", kind: "file" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "file" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "file" },
  { ext: "zip",  mime: "application/zip", kind: "file" },
];

/** Lowercased extension after the final dot; "" when none or leading-dot only. */
export function fileExt(name: string): string {
  const base = String(name ?? "").trim();
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export type AttachmentValidation =
  | { ok: true; ext: string; mime: string; kind: "image" | "file" }
  | { ok: false; error: string };

/** Validate by EXTENSION (browser mime is unreliable for zip/docx/xlsx). */
export function validateAttachment(name: string, sizeBytes: number): AttachmentValidation {
  const ext = fileExt(name);
  const t = ATTACHMENT_TYPES.find((x) => x.ext === ext);
  if (!t) return { ok: false, error: "Tipe file tidak didukung" };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, error: "File kosong" };
  if (sizeBytes > ATTACHMENT_MAX_BYTES) return { ok: false, error: "File melebihi 25 MB" };
  return { ok: true, ext: t.ext, mime: t.mime, kind: t.kind };
}

/** Content-Type for streaming a stored extension; octet-stream fallback. */
export function mimeForExt(ext: string): string {
  return ATTACHMENT_TYPES.find((x) => x.ext === String(ext).toLowerCase())?.mime
    ?? "application/octet-stream";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/attachmentRules.test.ts`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add shared/attachmentRules.ts shared/attachmentRules.test.ts
git commit -m "feat(attachments): pure validation rules (types, size cap, ext/mime)"
```

---

### Task 2: Generalize `server/uploads.ts` for arbitrary files

**Files:**
- Modify: `server/uploads.ts` (add `buildAttachmentPath`, `saveUploadedFile`, `streamFile`; reuse existing `sanitizeSlug`, `sanitizeFeature`, `resolveSafe`, `crypto`, `path`)
- Test: `server/uploads.test.ts`

Read first: `server/uploads.ts:63-72` (`buildRelativePath` — hardcodes `.jpg`), `:93-136` (`saveBase64Photo` — has the `UPLOADS_READ_ONLY` guard + `resolveSafe`), `:162-185` (`streamPhoto`). The new helpers mirror these but preserve the real extension.

- [ ] **Step 1: Write the failing test**

Create `server/uploads.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttachmentPath } from "./uploads.js";

test("buildAttachmentPath: per-mitra dir, real ext, non-guessable suffix", () => {
  const p = buildAttachmentPath("JABNET", 142, "pdf");
  assert.match(p, /^jabnet\/pipeline\/\d{4}\/\d{2}\/142-[0-9a-f]{8}\.pdf$/);
});

test("buildAttachmentPath: sanitizes id + ext, no path escape", () => {
  const p = buildAttachmentPath("jabnet", "../etc/passwd", "png");
  assert.ok(!p.includes(".."));
  assert.match(p, /\.png$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/uploads.test.ts`
Expected: FAIL — `buildAttachmentPath` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `server/uploads.ts`, add an import near the top (the file already imports `path`, `crypto`, `existsSync`, `Response`, and has `sanitizeSlug`/`sanitizeFeature`/`resolveSafe` + the `UPLOADS_READ_ONLY` pattern). Add `import { writeFile } from "fs/promises";` if not already present (check the top of the file; `saveBase64Photo` already writes files, so a write import exists — reuse it). Then append:

```ts
import { mimeForExt } from "../shared/attachmentRules.js";

/** Relative path for a card attachment, preserving the real (sanitized) extension. */
export function buildAttachmentPath(slug: string, idHint: number | string, ext: string): string {
  const s = sanitizeSlug(slug);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const suffix = crypto.randomBytes(4).toString("hex");
  const safeId = String(idHint).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeExt = String(ext).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return path.posix.join(s, "pipeline", yyyy, mm, `${safeId}-${suffix}.${safeExt}`);
}

/** Persist an already-buffered upload under the per-mitra pipeline dir.
 *  Returns the relative path. Honors UPLOADS_READ_ONLY like saveBase64Photo. */
export async function saveUploadedFile(
  slug: string, idHint: number | string, buf: Buffer, ext: string,
): Promise<string> {
  if (process.env.UPLOADS_READ_ONLY === "true") {
    throw new Error("Uploads disabled di environment ini (UPLOADS_READ_ONLY=true).");
  }
  const relativePath = buildAttachmentPath(slug, idHint, ext);
  const absolutePath = resolveSafe(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buf);
  return relativePath;
}

/** Stream any stored file; content-type from the extension. `download` forces a save dialog. */
export async function streamFile(
  relativePath: string, res: Response, opts?: { download?: boolean; fileName?: string },
): Promise<void> {
  const absolutePath = resolveSafe(relativePath);
  if (!existsSync(absolutePath)) {
    res.status(404).json({ success: false, error: "File tidak ditemukan" });
    return;
  }
  const ext = path.extname(absolutePath).slice(1).toLowerCase();
  res.setHeader("Content-Type", mimeForExt(ext));
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (opts?.download) {
    const safeName = (opts.fileName ?? `file.${ext}`).replace(/[\r\n"]/g, "");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  }
  await new Promise<void>((resolve, reject) => {
    res.sendFile(absolutePath, (err) => (err ? reject(err) : resolve()));
  });
}
```

Note: `mkdir` and `writeFile` — confirm the existing imports. `saveBase64Photo` already does `mkdir(..., {recursive:true})` + a write, so both come from `fs/promises` at the top of the file. If `mkdir`/`writeFile` aren't both imported, add them to the existing `fs/promises` import line. Do NOT add a second import statement for the same module.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/uploads.test.ts`
Expected: PASS — 2/2.

- [ ] **Step 5: Commit**

```bash
git add server/uploads.ts server/uploads.test.ts
git commit -m "feat(attachments): saveUploadedFile + streamFile + buildAttachmentPath"
```

---

### Task 3: Schema + migration for `pipeline_card_attachments`

**Files:**
- Modify: `shared/schema.ts` (add table after `pipelineCardFollowers` ~line 551)
- Modify: `server/storage.ts` (CREATE TABLE in the migration block ~line 6901, after the `pipeline_card_followers` create)

- [ ] **Step 1: Add the Drizzle table to `shared/schema.ts`**

After the `pipelineCardFollowers` table definition, add:

```ts
export const pipelineCardAttachments = mysqlTable("pipeline_card_attachments", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  pipelineId: int("pipeline_id").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: varchar("file_path", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: int("size_bytes").notNull(),
  kind: varchar("kind", { length: 8 }).notNull().default("file"),
  uploadedBy: int("uploaded_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_card_attachments_mitra_card").on(t.mitraId, t.cardId),
}));

export type PipelineCardAttachment = typeof pipelineCardAttachments.$inferSelect;
```

- [ ] **Step 2: Add the CREATE TABLE to the migration block in `server/storage.ts`**

After the `CREATE TABLE IF NOT EXISTS pipeline_card_followers (...)` block (the `pipeline_card_*` group ~line 6901), add another `await this.db.execute(sql\`...\`)`:

```ts
await this.db.execute(sql`
  CREATE TABLE IF NOT EXISTS pipeline_card_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mitra_id INT NOT NULL DEFAULT 1,
    card_id INT NOT NULL,
    pipeline_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes INT NOT NULL,
    kind VARCHAR(8) NOT NULL DEFAULT 'file',
    uploaded_by INT NOT NULL,
    created_at TEXT NOT NULL,
    KEY idx_card_attachments_mitra_card (mitra_id, card_id)
  )
`);
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(attachments): pipeline_card_attachments table + migration"
```

---

### Task 4: Storage methods for attachments

**Files:**
- Modify: `server/storage.ts` (add methods near the other card methods, e.g. after `addComment` ~line 2040; add `pipelineCardAttachments` + `PipelineCardAttachment` to the schema import at the top)

Read first: `addComment` (storage.ts:2027-2038) for the insert+reselect+`logCardActivity` pattern; `getCommentPhotoMeta` for the select shape; `deleteComment` for the delete shape; `logCardActivity(cardId, actorId, type, detail?)` (private, 1915).

- [ ] **Step 1: Add the import**

In the big schema import in `server/storage.ts` (the `import { ... } from "@shared/schema"` / `"../shared/schema.js"` block), add `pipelineCardAttachments` and the type `PipelineCardAttachment`.

- [ ] **Step 2: Add the methods**

After `addComment`/`deleteComment`, add:

```ts
async addCardAttachment(data: {
  cardId: number; pipelineId: number; fileName: string; filePath: string;
  mimeType: string; sizeBytes: number; kind: string; uploadedBy: number;
}): Promise<PipelineCardAttachment> {
  const mitraId = getMitraId();
  const now = new Date().toISOString();
  const result = await this.db.insert(pipelineCardAttachments).values({
    mitraId, cardId: data.cardId, pipelineId: data.pipelineId,
    fileName: data.fileName, filePath: data.filePath, mimeType: data.mimeType,
    sizeBytes: data.sizeBytes, kind: data.kind, uploadedBy: data.uploadedBy, createdAt: now,
  } as any);
  const insertId = Number((result[0] as any).insertId);
  await this.logCardActivity(data.cardId, data.uploadedBy, "attachment_added", { fileName: data.fileName });
  const [row] = await this.db.select().from(pipelineCardAttachments)
    .where(and(eq(pipelineCardAttachments.id, insertId), eq(pipelineCardAttachments.mitraId, mitraId)));
  return row!;
}

async listCardAttachments(cardId: number): Promise<PipelineCardAttachment[]> {
  const mitraId = getMitraId();
  return this.db.select().from(pipelineCardAttachments)
    .where(and(eq(pipelineCardAttachments.mitraId, mitraId), eq(pipelineCardAttachments.cardId, cardId)))
    .orderBy(desc(pipelineCardAttachments.id));
}

async getCardAttachment(id: number): Promise<PipelineCardAttachment | undefined> {
  const mitraId = getMitraId();
  const [row] = await this.db.select().from(pipelineCardAttachments)
    .where(and(eq(pipelineCardAttachments.id, id), eq(pipelineCardAttachments.mitraId, mitraId)));
  return row;
}

async deleteCardAttachment(id: number, actorId: number): Promise<number> {
  const mitraId = getMitraId();
  const [row] = await this.db.select().from(pipelineCardAttachments)
    .where(and(eq(pipelineCardAttachments.id, id), eq(pipelineCardAttachments.mitraId, mitraId)));
  if (!row) return 0;
  const result: any = await this.db.delete(pipelineCardAttachments)
    .where(and(eq(pipelineCardAttachments.id, id), eq(pipelineCardAttachments.mitraId, mitraId)));
  await this.logCardActivity(row.cardId, actorId, "attachment_removed", { fileName: row.fileName });
  return Number(result?.[0]?.affectedRows ?? 0);
}
```

Note: `desc` must be in the drizzle-orm import at the top of storage.ts (it's used elsewhere — confirm; if missing, add it to the `import { eq, and, ... } from "drizzle-orm"` line).

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(attachments): storage CRUD + audit logging"
```

---

### Task 5: busboy multipart parser module

**Files:**
- Modify: `package.json` (add `busboy` dep + `@types/busboy` devDep)
- Create: `server/multipart.ts`

- [ ] **Step 1: Add the dependency**

Run:
```bash
npm install busboy@^1.6.0 && npm install -D @types/busboy@^1.5.4
```
Expected: installs cleanly (pure-JS, no native build).

- [ ] **Step 2: Write the parser**

Create `server/multipart.ts`:

```ts
import busboy from "busboy";
import type { Request } from "express";

export interface ParsedFile { fieldName: string; fileName: string; mimeType: string; buffer: Buffer }
export interface ParsedMultipart { files: ParsedFile[]; fields: Record<string, string> }

/** Parse a multipart/form-data request into in-memory files + fields.
 *  Aborts with an error if any single file exceeds maxBytes (no temp files). */
export function parseMultipart(req: Request, opts: { maxBytes: number; maxFiles?: number }): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: { fileSize: opts.maxBytes, files: opts.maxFiles ?? 20 } });
    } catch (e) { return reject(e); }

    const files: ParsedFile[] = [];
    const fields: Record<string, string> = {};
    let aborted = false;
    const fail = (err: Error) => { if (!aborted) { aborted = true; reject(err); } };

    bb.on("field", (name: string, val: string) => { fields[name] = val; });
    bb.on("file", (fieldName: string, stream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("limit", () => fail(new Error("File melebihi batas ukuran")));
      stream.on("close", () => {
        if (aborted) return;
        files.push({ fieldName, fileName: info.filename, mimeType: info.mimeType, buffer: Buffer.concat(chunks) });
      });
    });
    bb.on("error", fail);
    bb.on("close", () => { if (!aborted) resolve({ files, fields }); });
    req.pipe(bb);
  });
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds (busboy resolves as external).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json server/multipart.ts
git commit -m "feat(attachments): busboy multipart parser module"
```

---

### Task 6: Attachment endpoints in `server/routes.ts`

**Files:**
- Modify: `server/routes.ts` (add 4 routes near the comment/follower card routes ~line 5000; extend the uploads import line 14; add `parseMultipart` import)

Read first: the comment-photo endpoint (routes.ts:4988-4997) for the guard chain + `streamPhoto` usage; the follower POST (just below it) for the `requirePipelineCapability(...,"cards")` + `requireCardAccess` write pattern.

- [ ] **Step 1: Extend imports**

Change `import { streamPhoto, ensureMitraDirs, renameMitraDir, trashMitraDir } from "./uploads.js";` to also import `saveUploadedFile, streamFile`. Add:
```ts
import { parseMultipart } from "./multipart.js";
import { validateAttachment, ATTACHMENT_MAX_BYTES } from "../shared/attachmentRules.js";
import { deletePhoto } from "./uploads.js"; // if not already imported
```
(`deletePhoto` already exists in uploads.ts — fold it into the existing uploads import rather than a second statement.)

- [ ] **Step 2: Add the routes**

Add near the other card sub-resource routes (after the comment-photo route ~line 4997):

```ts
// ── Card attachments ──────────────────────────────────────────────────────
router.post("/api/pipelines/cards/:cardId/attachments", async (req, res) => {
  if (!requireWritePermission(req, res, "pipelines")) return;
  const card = await storage.getCard(Number(req.params.cardId));
  if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
  if (!(await requirePipelineCapability(req, res, card.pipelineId, "cards"))) return;
  if (!(await requireCardAccess(req, res, card))) return;
  let parsed;
  try {
    parsed = await parseMultipart(req, { maxBytes: ATTACHMENT_MAX_BYTES });
  } catch (e: any) {
    return sendError(res, e?.message || "Upload gagal", 413);
  }
  if (!parsed.files.length) return sendError(res, "Tidak ada file", 400);
  const slug = await storage.getMitraSlug(req.authUser!.activeMitraId);
  const created = [];
  for (const f of parsed.files) {
    const v = validateAttachment(f.fileName, f.buffer.length);
    if (!v.ok) return sendError(res, `${f.fileName}: ${v.error}`, 400);
    const relPath = await saveUploadedFile(slug, card.id, f.buffer, v.ext);
    const row = await storage.addCardAttachment({
      cardId: card.id, pipelineId: card.pipelineId, fileName: f.fileName, filePath: relPath,
      mimeType: v.mime, sizeBytes: f.buffer.length, kind: v.kind, uploadedBy: req.authUser!.id,
    });
    created.push(row);
  }
  sendSuccess(res, created, 201);
});

router.get("/api/pipelines/cards/:cardId/attachments", async (req, res) => {
  if (!requirePermission(req, res, "pipelines")) return;
  const card = await storage.getCard(Number(req.params.cardId));
  if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
  if (!(await requirePipelineView(req, res, card.pipelineId))) return;
  if (!(await requireCardAccess(req, res, card))) return;
  sendSuccess(res, await storage.listCardAttachments(card.id));
});

router.get("/api/pipelines/attachments/:id/raw", async (req, res) => {
  if (!requirePermission(req, res, "pipelines")) return;
  const att = await storage.getCardAttachment(Number(req.params.id));
  if (!att) return sendError(res, "File tidak ditemukan", 404);
  const card = await storage.getCard(att.cardId);
  if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
  if (!(await requirePipelineView(req, res, card.pipelineId))) return;
  if (!(await requireCardAccess(req, res, card))) return;
  await streamFile(att.filePath, res, { download: req.query.download === "1", fileName: att.fileName });
});

router.delete("/api/pipelines/attachments/:id", async (req, res) => {
  if (!requireWritePermission(req, res, "pipelines")) return;
  const att = await storage.getCardAttachment(Number(req.params.id));
  if (!att) return sendError(res, "File tidak ditemukan", 404);
  const card = await storage.getCard(att.cardId);
  if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
  if (!(await requireCardAccess(req, res, card))) return;
  // Delete only by the uploader OR a pipeline admin. isPipelineAdmin already covers
  // the admin/manage case; do NOT call requirePipelineCapability here (it writes its
  // own error response, which would double-send).
  if (att.uploadedBy !== req.authUser!.id && !isPipelineAdmin(req)) {
    return sendError(res, "Hanya pengunggah atau admin pipeline yang boleh menghapus", 403);
  }
  await deletePhoto(att.filePath);
  await storage.deleteCardAttachment(att.id, req.authUser!.id);
  sendSuccess(res, { deleted: true });
});
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(attachments): upload/list/raw/delete endpoints (capability + row-level gated)"
```

---

### Task 7: Client hooks in `client/hooks/usePipelines.ts`

**Files:**
- Modify: `client/hooks/usePipelines.ts` (add 3 hooks; reuse `getAuthHeaders` from `@/lib/api`, `compressImage` from `@/lib/imageCompress`)

Read first: an existing query+mutation pair in `usePipelines.ts` (e.g. `useCollectionsEngineMode`/`useSetCollectionsEngineMode`) for the `api`/`useQuery`/`useMutation`/`invalidateQueries` style. The `api` helper forces `Content-Type: application/json`, so uploads use a raw `fetch` with `getAuthHeaders()` and NO content-type (browser sets the multipart boundary).

- [ ] **Step 1: Add the hooks**

Add to `client/hooks/usePipelines.ts` (ensure imports: `import { getAuthHeaders } from "@/lib/api";` and `import { compressImage } from "@/lib/imageCompress";` — add if absent):

```ts
export interface CardAttachment {
  id: number; cardId: number; pipelineId: number; fileName: string; filePath: string;
  mimeType: string; sizeBytes: number; kind: "image" | "file"; uploadedBy: number; createdAt: string;
}

export function useCardAttachments(cardId: number | null) {
  return useQuery({
    queryKey: ["card-attachments", cardId],
    queryFn: () => api.get<CardAttachment[]>(`/pipelines/cards/${cardId}/attachments`),
    enabled: cardId != null,
  });
}

// Convert a compressed dataURL back into a File for multipart upload.
async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type });
}

export function useUploadAttachments(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const f of files) {
        // Compress JPEGs to save disk; keep png/webp/docs as-is (preserve alpha / binary).
        if (f.type === "image/jpeg") {
          try {
            const r = await compressImage(f, { maxDim: 1920, maxBytes: 1_500_000 });
            form.append("files", await dataUrlToFile(r.dataUrl, f.name));
            continue;
          } catch { /* fall through: upload original */ }
        }
        form.append("files", f);
      }
      const res = await fetch(`/api/pipelines/cards/${cardId}/attachments`, {
        method: "POST",
        headers: { ...getAuthHeaders() }, // NO Content-Type — browser sets multipart boundary
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Upload gagal");
      return json.data as CardAttachment[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-attachments", cardId] }),
  });
}

export function useDeleteAttachment(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/pipelines/attachments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-attachments", cardId] }),
  });
}
```

Note: confirm the delete helper name on `api` (it may be `api.del` or `api.delete`) by checking another mutation in this file; use whichever exists.

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(attachments): client hooks (list/upload-with-compress/delete)"
```

---

### Task 8: `CardAttachments` UI section + wire into `CardDetailModal`

**Files:**
- Create: `client/components/pipelines/CardAttachments.tsx`
- Modify: `client/components/pipelines/CardDetailModal.tsx` (render the section; pass `cardId`, `writable`, `caps`)

Read first: `CardDetailModal.tsx:25-33` (props: `cardId, pipelineId, writable, caps`) and the "Komentar & Lampiran" section (~line 140) for placement + styling. Get the current user id from `localStorage` `ftth_user` (same source `getAuthHeaders` uses) for the delete-button visibility.

- [ ] **Step 1: Create the component**

Create `client/components/pipelines/CardAttachments.tsx`:

```tsx
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, FileText, FileSpreadsheet, FileArchive, Download, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/imageCompress";
import { useCardAttachments, useUploadAttachments, useDeleteAttachment, type CardAttachment } from "@/hooks/usePipelines";

function currentUserId(): number {
  try { return JSON.parse(localStorage.getItem("ftth_user") || "{}")?.id ?? 0; } catch { return 0; }
}

function FileIcon({ name }: { name: string }) {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "xlsx") return <FileSpreadsheet className="size-5 text-success" />;
  if (ext === "zip") return <FileArchive className="size-5 text-warning" />;
  return <FileText className="size-5 text-muted-foreground" />;
}

export function CardAttachments({ cardId, writable, isAdmin }: {
  cardId: number; writable: boolean; isAdmin: boolean;
}): JSX.Element {
  const { data: items = [], isLoading } = useCardAttachments(cardId);
  const upload = useUploadAttachments(cardId);
  const del = useDeleteAttachment(cardId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const me = currentUserId();

  const doUpload = (files: FileList | null) => {
    if (!files || !files.length) return;
    upload.mutate(Array.from(files), {
      onError: (e: any) => toast.error(e?.message || "Upload gagal"),
      onSuccess: () => toast.success("File terunggah"),
    });
  };

  const canDelete = (a: CardAttachment) => writable && (a.uploadedBy === me || isAdmin);

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Paperclip className="size-3.5" /> Lampiran
      </h4>

      {writable && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); doUpload(e.dataTransfer.files); }}
          className={`mb-3 rounded-lg border border-dashed px-4 py-3 text-center text-xs transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border/60"}`}
        >
          <input ref={inputRef} type="file" multiple className="hidden"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.zip"
            onChange={(e) => { doUpload(e.target.files); e.target.value = ""; }} />
          <Button type="button" variant="ghost" size="sm" loading={upload.isPending}
            onClick={() => inputRef.current?.click()}>
            <Upload className="size-4 mr-1.5" /> Pilih file atau tarik ke sini
          </Button>
          <p className="mt-1 text-muted-foreground">Maks 25 MB · jpg, png, webp, pdf, docx, xlsx, zip</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada lampiran.</p>
      ) : (
        <div className="space-y-2">
          {items.filter((a) => a.kind === "image").length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {items.filter((a) => a.kind === "image").map((a) => (
                <div key={a.id} className="group relative">
                  <a href={`/api/pipelines/attachments/${a.id}/raw`} target="_blank" rel="noreferrer">
                    <img src={`/api/pipelines/attachments/${a.id}/raw`} alt={a.fileName}
                      className="aspect-square w-full rounded-md object-cover border border-border/40" />
                  </a>
                  {canDelete(a) && (
                    <button aria-label="Hapus" onClick={() => del.mutate(a.id)}
                      className="absolute top-1 right-1 rounded bg-background/80 p-1 opacity-0 group-hover:opacity-100">
                      <Trash2 className="size-3.5 text-destructive" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {items.filter((a) => a.kind === "file").map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1.5">
              <FileIcon name={a.fileName} />
              <span className="flex-1 min-w-0 truncate text-xs">{a.fileName}</span>
              <span className="text-2xs text-muted-foreground shrink-0">{formatBytes(a.sizeBytes)}</span>
              <a href={`/api/pipelines/attachments/${a.id}/raw?download=1`}
                className="text-muted-foreground hover:text-foreground" aria-label="Unduh">
                <Download className="size-4" />
              </a>
              {canDelete(a) && (
                <button aria-label="Hapus" onClick={() => del.mutate(a.id)}
                  className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire into `CardDetailModal`**

Import at the top of `CardDetailModal.tsx`:
```ts
import { CardAttachments } from "@/components/pipelines/CardAttachments";
```
Render it just above the "Komentar & Lampiran" `<section>` (the existing comment block ~line 140). Compute admin from caps (empty caps = full access): `const isCardAdmin = caps.length === 0 || caps.includes("manage");`. Then:
```tsx
<CardAttachments cardId={cardId} writable={writable} isAdmin={isCardAdmin} />
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/CardAttachments.tsx client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(attachments): Lampiran UI in card detail (upload/grid/download/delete)"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run all attachment tests**

Run: `npx tsx --test shared/attachmentRules.test.ts server/uploads.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 3: Wiring grep**

Run:
```bash
grep -rn "pipeline_card_attachments\|card-attachments\|saveUploadedFile\|parseMultipart" server/ client/ shared/ | grep -v node_modules
```
Expected: table referenced in schema + storage + migration; endpoints + hooks + UI all present.

- [ ] **Step 4: Add deploy caveats to the spec's runbook section**

Confirm the spec (`docs/superpowers/specs/2026-06-09-card-attachments-design.md`, section 9) still lists: (1) `busboy` needs `npm install` on cPanel; (2) flip dev `UPLOADS_READ_ONLY=false` to test. No code change — just verify it's there for the deploy step.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A && git commit -m "chore(attachments): final verification fixes" || echo "nothing to commit"
```

---

## Manual test checklist (post-merge, on dev with UPLOADS_READ_ONLY=false)

1. Open a card → "Lampiran" → upload a JPEG (confirm it compresses) + a PDF + an XLSX.
2. Image shows as a thumbnail; click → opens full. PDF/XLSX show as rows; download works.
3. Delete an attachment you uploaded → removed (file gone from disk + row gone).
4. As a non-uploader non-admin → delete button hidden; direct DELETE returns 403.
5. Another mitra's user cannot GET `/api/pipelines/attachments/<id>/raw` (404/403).
6. Upload a 30 MB zip → rejected ("File melebihi 25 MB"); `.exe` → rejected.
