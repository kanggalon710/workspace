# Typed Card Comments + Per-Entry Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a type dropdown (Catatan/Telepon/WhatsApp/Kunjungan/Aktivitas) and per-entry multi-file attachments (images compressed client-side) to pipeline card comments in `/pipelines`, and tidy the comments/attachments UI.

**Architecture:** Two additive columns (`pipeline_card_comments.type`, `pipeline_card_attachments.comment_id`) reuse the existing filesystem-backed attachment pipeline (`parseMultipart` + `saveUploadedFile` + `streamFile`). The comment POST becomes multipart (text fields + files); the card-detail GET groups attachments per comment and resolves author names (batched). Frontend extracts a reusable `AttachmentGallery` and a `CardComments` component (composer + timeline) out of the 383-line `CardDetailModal`.

**Tech Stack:** Express 5 + Drizzle (MySQL/mysql2), React 18 + TanStack Query, shadcn/ui, Lucide, `node:test` via `npx tsx --test`.

**Conventions (read before starting):**
- Sibling imports in shared modules use the `.js` extension (moduleResolution: Bundler). `import x from "./foo.js"`.
- DB rejects `ADD COLUMN IF NOT EXISTS` — use the info_schema-guarded `loyaltyColumnAdditions` array in `server/storage.ts` (pattern at `server/storage.ts:778-795`).
- All storage queries are tenant-scoped via `getMitraId()`.
- Staff `/api/*` must respond via `sendSuccess`/`sendError`.
- Do NOT push or deploy — the user does that.

**Local verification harness** (used in later tasks; start once, reuse):
```bash
podman run -d --name jabtc -e MYSQL_ROOT_PASSWORD=p -e MYSQL_DATABASE=jabnet_fiber -p 33306:3306 mysql:8
# wait until ready:
for i in $(seq 1 30); do podman exec jabtc mysqladmin ping -uroot -pp --silent 2>/dev/null | grep -q alive && break; sleep 1; done
DB_HOST=127.0.0.1 DB_PORT=33306 DB_USER=root DB_PASSWORD=p DB_NAME=jabnet_fiber npx drizzle-kit push --force
npm run build
# run server in the Bash tool's run_in_background mode (NOT plain &, which dies with the shell):
#   DB_HOST=127.0.0.1 DB_PORT=33306 DB_USER=root DB_PASSWORD=p DB_NAME=jabnet_fiber WORKERS_ENABLED=false PORT=3002 NODE_ENV=production SESSION_SECRET=x node dist/index.mjs
# teardown at the end: podman rm -f jabtc
```

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `shared/cardCommentTypes.ts` | Create | Pure catalog of the 5 comment types + lookup/guard helpers |
| `shared/cardCommentTypes.test.ts` | Create | Unit tests for the catalog helpers |
| `shared/schema.ts` | Modify | `pipelineCardComments.type` + `pipelineCardAttachments.commentId` columns |
| `server/storage.ts` | Modify | Migration rows; `addComment(type)`; `addCardAttachment(commentId)`; `listCardAttachments` filter; `getAttachmentsByCardGrouped`; `deleteCommentCascade` |
| `server/routes.ts` | Modify | `saveOneAttachment` helper; comment POST → multipart; card-detail GET enrichment; comment DELETE cascade |
| `client/hooks/usePipelines.ts` | Modify | `CardDetail.comments` type (+type/authorName/attachments); `addComment` → multipart |
| `client/components/pipelines/AttachmentGallery.tsx` | Create | Presentational image-grid + file-chip list with optional delete |
| `client/components/pipelines/CardAttachments.tsx` | Modify | Use `<AttachmentGallery>` for the list portion |
| `client/components/pipelines/CardComments.tsx` | Create | Typed composer + timeline |
| `client/components/pipelines/CardDetailModal.tsx` | Modify | Replace inline comments/activity with `<CardComments>`; humanize system activity |

---

## Task 1: Shared comment-type catalog (pure, TDD)

**Files:**
- Create: `shared/cardCommentTypes.ts`
- Test: `shared/cardCommentTypes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/cardCommentTypes.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_COMMENT_TYPES, CARD_COMMENT_TYPE_KEYS, cardCommentType, isCardCommentType,
} from "./cardCommentTypes.js";

test("catalog has the 5 expected types in order", () => {
  assert.deepEqual(CARD_COMMENT_TYPE_KEYS, ["note", "call", "whatsapp", "visit", "activity"]);
  assert.equal(CARD_COMMENT_TYPES.length, 5);
});

test("cardCommentType returns the matching entry", () => {
  assert.equal(cardCommentType("whatsapp").label, "WhatsApp");
  assert.equal(cardCommentType("visit").icon, "MapPin");
});

test("cardCommentType falls back to note for unknown/empty", () => {
  assert.equal(cardCommentType("bogus").key, "note");
  assert.equal(cardCommentType(null).key, "note");
  assert.equal(cardCommentType(undefined).key, "note");
});

test("isCardCommentType validates membership", () => {
  assert.equal(isCardCommentType("call"), true);
  assert.equal(isCardCommentType("bogus"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/cardCommentTypes.test.ts`
Expected: FAIL — cannot find module `./cardCommentTypes.js`.

- [ ] **Step 3: Write minimal implementation**

Create `shared/cardCommentTypes.ts`:
```ts
/** Pure catalog of pipeline card comment/entry types. No DB, no I/O, no JSX.
 *  `icon` is a Lucide component name resolved in the UI; `color` is a Tailwind text token. */
export interface CardCommentType {
  key: string;
  label: string;
  icon: string;   // lucide-react export name
  color: string;  // tailwind text-* token (must exist in the design system)
}

export const CARD_COMMENT_TYPES: CardCommentType[] = [
  { key: "note",     label: "Catatan",   icon: "FileText",      color: "text-muted-foreground" },
  { key: "call",     label: "Telepon",   icon: "Phone",         color: "text-info" },
  { key: "whatsapp", label: "WhatsApp",  icon: "MessageSquare", color: "text-success" },
  { key: "visit",    label: "Kunjungan", icon: "MapPin",        color: "text-warning" },
  { key: "activity", label: "Aktivitas", icon: "Activity",      color: "text-primary" },
];

export const CARD_COMMENT_TYPE_KEYS = CARD_COMMENT_TYPES.map((t) => t.key);

const BY_KEY: Record<string, CardCommentType> = Object.fromEntries(
  CARD_COMMENT_TYPES.map((t) => [t.key, t]),
);

/** Lookup with a safe fallback to "note" (the default column value). */
export function cardCommentType(key: string | null | undefined): CardCommentType {
  return (key && BY_KEY[key]) || BY_KEY["note"];
}

export function isCardCommentType(key: string): boolean {
  return key in BY_KEY;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/cardCommentTypes.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/cardCommentTypes.ts shared/cardCommentTypes.test.ts
git commit -m "feat(pipelines): shared card comment-type catalog (typed comments)"
```

---

## Task 2: Schema columns + startup migration

**Files:**
- Modify: `shared/schema.ts:545-555` (comments), `shared/schema.ts:592-606` (attachments)
- Modify: `server/storage.ts:775-778` (migration array)

- [ ] **Step 1: Add the `type` column to `pipelineCardComments`**

In `shared/schema.ts`, the `pipelineCardComments` table currently is:
```ts
export const pipelineCardComments = mysqlTable("pipeline_card_comments", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  authorId: int("author_id").notNull(),
  body: text("body").notNull(),
  photoPath: varchar("photo_path", { length: 255 }),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_pipeline_card_comments_card").on(t.cardId),
}));
```
Add a `type` column after `body`:
```ts
  body: text("body").notNull(),
  type: varchar("type", { length: 16 }).notNull().default("note"), // note|call|whatsapp|visit|activity
  photoPath: varchar("photo_path", { length: 255 }),
```

- [ ] **Step 2: Add the `commentId` column to `pipelineCardAttachments`**

In `shared/schema.ts`, in `pipelineCardAttachments`, add `commentId` after `cardId`:
```ts
  cardId: int("card_id").notNull(),
  commentId: int("comment_id"), // NULL = card-level attachment; set = belongs to a comment
  pipelineId: int("pipeline_id").notNull(),
```

- [ ] **Step 3: Register both columns in the startup migration array**

In `server/storage.ts`, the `loyaltyColumnAdditions` array ends with the `leads` campaign rows (`server/storage.ts:775-777`). Append:
```ts
      { table: "leads", column: "ad_name",  ddl: "TEXT NULL" },
      { table: "pipeline_card_comments",    column: "type",       ddl: "VARCHAR(16) NOT NULL DEFAULT 'note'" },
      { table: "pipeline_card_attachments", column: "comment_id", ddl: "INT NULL" },
    ];
```
(The loop right below at `server/storage.ts:779` applies these idempotently via an info_schema existence check.)

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Verify the migration applies on a fresh DB**

Start the verification harness (see header). After `drizzle-kit push` + server boot, confirm columns exist:
```bash
podman exec jabtc mysql -uroot -pp jabnet_fiber -e \
  "SHOW COLUMNS FROM pipeline_card_comments LIKE 'type'; SHOW COLUMNS FROM pipeline_card_attachments LIKE 'comment_id';"
```
Expected: both rows listed (`type varchar(16)`, `comment_id int`).

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): comment.type + attachment.comment_id columns + migration"
```

---

## Task 3: Storage — typed comments, comment-linked attachments, grouping, cascade delete

**Files:**
- Modify: `server/storage.ts` — `addComment` (2263), `addCardAttachment` (2281), `listCardAttachments` (2301), `deleteComment` (2275); add `getAttachmentsByCardGrouped`, `getCommentAttachmentsToDelete`.

- [ ] **Step 1: `addComment` accepts a validated type**

Replace `addComment` (`server/storage.ts:2263-2273`) with:
```ts
  async addComment(cardId: number, authorId: number, body: string, type?: string | null): Promise<PipelineCardComment> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const safeType = type && isCardCommentType(type) ? type : "note";
    const result = await this.db.insert(pipelineCardComments).values({
      mitraId, cardId, authorId, body, type: safeType, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    await this.logCardActivity(cardId, authorId, "commented");
    const [row] = await this.db.select().from(pipelineCardComments).where(and(eq(pipelineCardComments.id, insertId), eq(pipelineCardComments.mitraId, mitraId)));
    return row!;
  }
```
Add the import at the top of `server/storage.ts` (with the other `../shared/*` imports):
```ts
import { isCardCommentType } from "../shared/cardCommentTypes.js";
```

- [ ] **Step 2: `addCardAttachment` accepts an optional `commentId`**

Replace `addCardAttachment` (`server/storage.ts:2281-2297`) data shape + insert:
```ts
  async addCardAttachment(data: {
    cardId: number; commentId?: number | null; pipelineId: number; fileName: string; filePath: string;
    mimeType: string; sizeBytes: number; kind: string; uploadedBy: number;
  }): Promise<PipelineCardAttachment> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineCardAttachments).values({
      mitraId, cardId: data.cardId, commentId: data.commentId ?? null, pipelineId: data.pipelineId,
      fileName: data.fileName, filePath: data.filePath, mimeType: data.mimeType,
      sizeBytes: data.sizeBytes, kind: data.kind, uploadedBy: data.uploadedBy, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    await this.logCardActivity(data.cardId, data.uploadedBy, "attachment_added", { fileName: data.fileName });
    const [row] = await this.db.select().from(pipelineCardAttachments)
      .where(and(eq(pipelineCardAttachments.id, insertId), eq(pipelineCardAttachments.mitraId, mitraId)));
    return row!;
  }
```

- [ ] **Step 3: `listCardAttachments` returns only card-level (un-linked) attachments**

Replace `listCardAttachments` (`server/storage.ts:2301-2306`):
```ts
  async listCardAttachments(cardId: number): Promise<PipelineCardAttachment[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCardAttachments)
      .where(and(
        eq(pipelineCardAttachments.mitraId, mitraId),
        eq(pipelineCardAttachments.cardId, cardId),
        isNull(pipelineCardAttachments.commentId),
      ))
      .orderBy(desc(pipelineCardAttachments.id));
  }
```
Ensure `isNull` is imported from `drizzle-orm` at the top of `server/storage.ts` (it imports `eq, and, desc, …` already — add `isNull` to that import list if missing).

- [ ] **Step 4: Add a grouped lookup for a card's comment attachments (anti-N+1)**

Add right after `listCardAttachments`:
```ts
  /** All comment-linked attachments for a card, grouped by commentId. One query. */
  async getAttachmentsByCardGrouped(cardId: number): Promise<Map<number, PipelineCardAttachment[]>> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineCardAttachments)
      .where(and(
        eq(pipelineCardAttachments.mitraId, mitraId),
        eq(pipelineCardAttachments.cardId, cardId),
        isNotNull(pipelineCardAttachments.commentId),
      ))
      .orderBy(asc(pipelineCardAttachments.id));
    const map = new Map<number, PipelineCardAttachment[]>();
    for (const r of rows) {
      const cid = (r as any).commentId as number;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(r);
    }
    return map;
  }
```
Add `isNotNull` to the `drizzle-orm` import list (`asc` is already imported — confirm; it is used at `server/storage.ts:2260`).

- [ ] **Step 5: Cascade-delete a comment's attachments**

Add a helper that returns file paths to unlink, then deletes rows. Add after `deleteComment` (`server/storage.ts:2275-2279`):
```ts
  /** File paths of a comment's attachments (so the route can unlink files), then delete those rows. */
  async deleteCommentAttachments(commentId: number): Promise<string[]> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineCardAttachments)
      .where(and(eq(pipelineCardAttachments.mitraId, mitraId), eq(pipelineCardAttachments.commentId, commentId)));
    const paths = rows.map((r) => r.filePath).filter(Boolean) as string[];
    if (rows.length) {
      await this.db.delete(pipelineCardAttachments)
        .where(and(eq(pipelineCardAttachments.mitraId, mitraId), eq(pipelineCardAttachments.commentId, commentId)));
    }
    return paths;
  }
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage for typed comments + comment-linked attachments"
```

---

## Task 4: Routes — extract attachment-save helper, multipart comment POST, cascade delete

**Files:**
- Modify: `server/routes.ts` — attachment POST (5571-5595), comment POST (5540-5549), comment DELETE (5551-5559).

- [ ] **Step 1: Extract a shared single-file save helper**

Above the `// ── Card attachments ──` block (`server/routes.ts:5570`), add a module-level helper (place it near the other top-level helpers like `validateTriggerConfig`, i.e. outside the route registration but in the same module scope). It encapsulates the per-file loop body currently inline at `server/routes.ts:5585-5594`:
```ts
/** Validate + persist one uploaded file as a card attachment row. Shared by the
 *  generic attachments endpoint (commentId=null) and the comment endpoint. Returns
 *  the created row, or throws an Error whose message is safe to surface (400). */
async function saveOneAttachment(opts: {
  slug: string; cardId: number; pipelineId: number; commentId: number | null;
  file: { fileName: string; buffer: Buffer }; uploadedBy: number;
}): Promise<PipelineCardAttachment> {
  const v = validateAttachment(opts.file.fileName, opts.file.buffer.length);
  if (!v.ok) throw new Error(`${opts.file.fileName}: ${v.error}`);
  const relPath = await saveUploadedFile(opts.slug, opts.cardId, opts.file.buffer, v.ext);
  return storage.addCardAttachment({
    cardId: opts.cardId, commentId: opts.commentId, pipelineId: opts.pipelineId,
    fileName: opts.file.fileName, filePath: relPath, mimeType: v.mime,
    sizeBytes: opts.file.buffer.length, kind: v.kind, uploadedBy: opts.uploadedBy,
  });
}
```
Add `import type { PipelineCardAttachment } from "../shared/schema.js";` if not already imported (check the existing schema import block at the top of `server/routes.ts`).

- [ ] **Step 2: Use the helper in the generic attachments endpoint**

Replace the per-file loop in the attachments POST (`server/routes.ts:5583-5594`, the `const created = []; for (const f ...) { ... }` block) with:
```ts
    const slug = await storage.getMitraSlug(req.authUser!.activeMitraId);
    const created = [];
    for (const f of parsed.files) {
      try {
        created.push(await saveOneAttachment({
          slug, cardId: card.id, pipelineId: card.pipelineId, commentId: null,
          file: { fileName: f.fileName, buffer: f.buffer }, uploadedBy: req.authUser!.id,
        }));
      } catch (e: any) {
        return sendError(res, e?.message || "Upload gagal", 400);
      }
    }
    sendSuccess(res, created, 201);
```

- [ ] **Step 3: Convert the comment POST to multipart (body + type + files)**

Replace the comment POST handler (`server/routes.ts:5540-5549`) with:
```ts
  router.post("/api/pipelines/cards/:cardId/comments", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const card = await loadGuardedCard(req, res, "comment");
    if (!card) return;
    let parsed;
    try {
      parsed = await parseMultipart(req, { maxBytes: ATTACHMENT_MAX_BYTES, maxFiles: 10, maxTotalBytes: 60 * 1024 * 1024 });
    } catch (e: any) {
      return sendError(res, e?.message || "Upload gagal", 413);
    }
    const body = (parsed.fields.body ?? "").trim();
    const type = parsed.fields.type ?? "note";
    if (!body && parsed.files.length === 0) return sendError(res, "Komentar atau lampiran wajib diisi", 400);
    const comment = await storage.addComment(card.id, req.authUser!.id, body || "(lampiran)", type);
    if (parsed.files.length) {
      const slug = await storage.getMitraSlug(req.authUser!.activeMitraId);
      for (const f of parsed.files) {
        try {
          await saveOneAttachment({
            slug, cardId: card.id, pipelineId: card.pipelineId, commentId: comment.id,
            file: { fileName: f.fileName, buffer: f.buffer }, uploadedBy: req.authUser!.id,
          });
        } catch (e: any) {
          return sendError(res, e?.message || "Upload gagal", 400);
        }
      }
    }
    await notifyPipelineCardWatchers(card.id, req.authUser!.id, "Komentar baru", (body || "lampiran").slice(0, 80));
    sendSuccess(res, comment);
  });
```

- [ ] **Step 4: Cascade attachment files on comment delete**

Replace the comment DELETE handler (`server/routes.ts:5551-5559`) with:
```ts
  router.delete("/api/pipelines/cards/comments/:id", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const cardId = await storage.getCommentCardId(Number(req.params.id));
    if (cardId === null) return sendError(res, "Komentar tidak ditemukan", 404);
    const card = await storage.getCard(cardId);
    if (!(await guardCard(req, res, card, "comment"))) return;
    const paths = await storage.deleteCommentAttachments(Number(req.params.id));
    for (const p of paths) await deletePhoto(p);
    await storage.deleteComment(Number(req.params.id));
    sendSuccess(res, { ok: true });
  });
```
(`deletePhoto` is already imported — used at `server/routes.ts:5626`.)

- [ ] **Step 5: Enrich the card-detail GET (per-comment attachments + author names)**

In the card-detail GET (`server/routes.ts:5218-5232`), after the `Promise.all` that loads `comments, activity, …`, add grouping + author resolution and attach to comments. Replace the final `sendSuccess(...)` line of that handler with:
```ts
    const attByComment = await storage.getAttachmentsByCardGrouped(card.id);
    const userList = await storage.getAssignableUsers(req.authUser!.activeMitraId, false);
    const nameById = new Map(userList.map((u) => [u.id, u.name || u.username]));
    const commentsOut = comments.map((c) => ({
      ...c,
      authorName: nameById.get(c.authorId) ?? "Pengguna",
      attachments: attByComment.get(c.id) ?? [],
    }));
    sendSuccess(res, { ...card, comments: commentsOut, activity, followers, fields, values: visibleValues, fieldAccess });
```

- [ ] **Step 6: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 7: End-to-end API verification**

With the harness running (rebuild + restart the server first), exercise the flow:
```bash
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin@1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["user"]["token"])')
PID=$(curl -s -X POST http://localhost:3002/api/pipelines -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"C"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
SID=$(curl -s -X POST http://localhost:3002/api/pipelines/$PID/stages -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"label":"S"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
CID=$(curl -s -X POST http://localhost:3002/api/pipelines/$PID/cards -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"stageId\":$SID,\"title\":\"Card\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
# comment with type + a file attachment (multipart):
printf 'hello pdf' > /tmp/a.pdf
curl -s -X POST http://localhost:3002/api/pipelines/cards/$CID/comments -H "Authorization: Bearer $TOKEN" \
  -F 'type=visit' -F 'body=Survey lokasi' -F 'files=@/tmp/a.pdf' | python3 -c 'import sys,json;d=json.load(sys.stdin);print("comment ok:",d.get("success"),"type:",d.get("data",{}).get("type"))'
# card detail: comment carries type, authorName, attachments[]; generic Lampiran excludes it:
curl -s http://localhost:3002/api/pipelines/cards/$CID -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];c=d["comments"][0];print("type:",c["type"],"author:",c["authorName"],"attachments:",len(c["attachments"]))'
curl -s http://localhost:3002/api/pipelines/cards/$CID/attachments -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;print("generic lampiran count (want 0):",len(json.load(sys.stdin)["data"]))'
```
Expected: `comment ok: True type: visit`; `type: visit author: Administrator attachments: 1`; `generic lampiran count (want 0): 0`.

- [ ] **Step 8: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): multipart typed comments + per-comment attachments + cascade delete"
```

---

## Task 5: Client hook — multipart addComment + comment detail type

**Files:**
- Modify: `client/hooks/usePipelines.ts` — `CardDetail` (37-43), `addComment` (161).

- [ ] **Step 1: Extend the `CardDetail.comments` type**

In `client/hooks/usePipelines.ts`, replace the `comments` line of `CardDetail` (`client/hooks/usePipelines.ts:38`) with:
```ts
  comments: { id: number; authorId: number; authorName?: string; body: string; type?: string; photoPath: string | null; attachments?: CardAttachment[]; createdAt: string }[];
```
(`CardAttachment` is already exported from this file — used by `useCardAttachments`. If the type alias is declared below this line, move the `CardDetail` type after it or rely on TS hoisting of `type` aliases, which is fine within a module.)

- [ ] **Step 2: Convert `addComment` to multipart (type + files), reusing the compress flow**

Replace the `addComment` mutation (`client/hooks/usePipelines.ts:161`) with a multipart version mirroring `useUploadAttachments` (`client/hooks/usePipelines.ts:339-362`):
```ts
    addComment: useMutation({
      mutationFn: async ({ cardId, body, type, files }: { cardId: number; body: string; type: string; files?: File[] }) => {
        const form = new FormData();
        form.append("body", body ?? "");
        form.append("type", type ?? "note");
        for (const f of files ?? []) {
          if (f.type === "image/jpeg") {
            try {
              const r = await compressImage(f, { maxDim: 1920, maxBytes: 1_500_000 });
              form.append("files", await dataUrlToFile(r.dataUrl, f.name));
              continue;
            } catch { /* fall through: upload original */ }
          }
          form.append("files", f);
        }
        const res = await fetch(`/api/pipelines/cards/${cardId}/comments`, {
          method: "POST", headers: { ...getAuthHeaders() }, body: form,
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Gagal mengirim");
        return json.data;
      },
      onSuccess: invalidate,
    }),
```
(`compressImage`, `dataUrlToFile`, `getAuthHeaders` are already imported/defined in this file.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): multipart addComment hook + typed comment detail"
```

---

## Task 6: `AttachmentGallery` component (extract from CardAttachments)

**Files:**
- Create: `client/components/pipelines/AttachmentGallery.tsx`
- Modify: `client/components/pipelines/CardAttachments.tsx` (use the gallery for the list portion)

- [ ] **Step 1: Create the presentational gallery**

Create `client/components/pipelines/AttachmentGallery.tsx` (extracted from the list rendering in `CardAttachments.tsx`):
```tsx
// SoC: presentational image-grid + file-chip list for card attachments.
// Reused by CardAttachments (card-level) and CardComments (per-entry).
import { FileText, FileSpreadsheet, FileArchive, Download, Trash2 } from "lucide-react";
import { formatBytes } from "@/lib/imageCompress";
import type { CardAttachment } from "@/hooks/usePipelines";

function FileIcon({ name }: { name: string }) {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "xlsx") return <FileSpreadsheet className="size-5 text-success" />;
  if (ext === "zip") return <FileArchive className="size-5 text-warning" />;
  return <FileText className="size-5 text-muted-foreground" />;
}

export function AttachmentGallery({ items, canDelete, onDelete }: {
  items: CardAttachment[];
  canDelete?: (a: CardAttachment) => boolean;
  onDelete?: (id: number) => void;
}): JSX.Element | null {
  if (!items.length) return null;
  const images = items.filter((a) => a.kind === "image");
  const files = items.filter((a) => a.kind !== "image");
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((a) => (
            <div key={a.id} className="group relative">
              <a href={`/api/pipelines/attachments/${a.id}/raw`} target="_blank" rel="noreferrer">
                <img src={`/api/pipelines/attachments/${a.id}/raw`} alt={a.fileName}
                  className="aspect-square w-full rounded-md object-cover border border-border/40" />
              </a>
              {canDelete?.(a) && onDelete && (
                <button aria-label="Hapus" onClick={() => onDelete(a.id)}
                  className="absolute top-1 right-1 rounded bg-background/80 p-1 opacity-0 group-hover:opacity-100">
                  <Trash2 className="size-3.5 text-destructive" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {files.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1.5">
          <FileIcon name={a.fileName} />
          <span className="flex-1 min-w-0 truncate text-xs">{a.fileName}</span>
          <span className="text-2xs text-muted-foreground shrink-0">{formatBytes(a.sizeBytes)}</span>
          <a href={`/api/pipelines/attachments/${a.id}/raw?download=1`}
            className="text-muted-foreground hover:text-foreground" aria-label="Unduh">
            <Download className="size-4" />
          </a>
          {canDelete?.(a) && onDelete && (
            <button aria-label="Hapus" onClick={() => onDelete(a.id)}
              className="text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Use the gallery inside `CardAttachments`**

In `client/components/pipelines/CardAttachments.tsx`: delete the local `FileIcon` function and the entire `items.length === 0 ? … : ( <div className="space-y-2"> … </div> )` list block, and replace the render branch with:
```tsx
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada lampiran.</p>
      ) : (
        <AttachmentGallery items={items} canDelete={canDelete} onDelete={doDelete} />
      )}
```
Update imports: remove now-unused `FileText, FileSpreadsheet, FileArchive, Download` from the lucide import (keep `Paperclip, Trash2, Upload`); remove the unused `formatBytes` import; add `import { AttachmentGallery } from "./AttachmentGallery";`.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build ok.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/AttachmentGallery.tsx client/components/pipelines/CardAttachments.tsx
git commit -m "refactor(pipelines): extract reusable AttachmentGallery"
```

---

## Task 7: `CardComments` component (typed composer + timeline)

**Files:**
- Create: `client/components/pipelines/CardComments.tsx`

- [ ] **Step 1: Create the component**

Create `client/components/pipelines/CardComments.tsx`:
```tsx
// SoC: typed comment composer + timeline for a pipeline card.
// Type metadata from shared/cardCommentTypes; attachments rendered via AttachmentGallery.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Phone, MessageSquare, MapPin, Activity, Paperclip, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AttachmentGallery } from "./AttachmentGallery";
import { CARD_COMMENT_TYPES, cardCommentType } from "@shared/cardCommentTypes";
import type { CardDetail } from "@/hooks/usePipelines";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Phone, MessageSquare, MapPin, Activity,
};

function TypeIcon({ type }: { type?: string }) {
  const meta = cardCommentType(type);
  const Cmp = ICONS[meta.icon] ?? FileText;
  return <Cmp className={`size-3.5 shrink-0 ${meta.color}`} />;
}

export function CardComments({ comments, canComment, onSend, sending }: {
  comments: CardDetail["comments"];
  canComment: boolean;
  onSend: (args: { body: string; type: string; files: File[] }) => Promise<void>;
  sending: boolean;
}): JSX.Element {
  const [type, setType] = useState("note");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!body.trim() && files.length === 0) { toast.error("Komentar atau lampiran wajib diisi"); return; }
    try {
      await onSend({ body: body.trim(), type, files });
      setBody(""); setFiles([]); setType("note");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengirim");
    }
  };

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Komentar</h4>

      <div className="space-y-3">
        {comments.map((c) => {
          const meta = cardCommentType(c.type);
          return (
            <div key={c.id} className="rounded-lg border border-border/40 bg-muted/30 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
                <TypeIcon type={c.type} />
                <span className="font-medium text-foreground">{meta.label}</span>
                <span>·</span>
                <span>{c.authorName ?? "Pengguna"}</span>
                <span>·</span>
                <span>{new Date(c.createdAt).toLocaleString("id-ID")}</span>
              </div>
              {c.body && c.body !== "(lampiran)" && <p className="text-sm whitespace-pre-wrap">{c.body}</p>}
              {c.photoPath && (
                <a href={`/api/pipelines/cards/comments/${c.id}/photo`} target="_blank" rel="noreferrer" className="mt-1 block">
                  <img src={`/api/pipelines/cards/comments/${c.id}/photo`} alt="Foto" loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    className="max-h-40 rounded border border-border/50" />
                </a>
              )}
              {c.attachments && c.attachments.length > 0 && (
                <div className="mt-1.5"><AttachmentGallery items={c.attachments} /></div>
              )}
            </div>
          );
        })}
        {comments.length === 0 && <p className="text-xs text-muted-foreground">Belum ada komentar.</p>}
      </div>

      {canComment && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1.5">
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipe entri"
              className="h-9 shrink-0 rounded-md border border-input bg-transparent px-2 text-xs">
              {CARD_COMMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <Input inputSize="sm" value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Tulis catatan…" aria-label="Isi komentar" />
            <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} aria-label="Lampirkan">
              <Paperclip className="size-4" />
            </Button>
            <Button type="button" size="sm" loading={sending} onClick={submit}>
              <Send className="size-4 mr-1" /> Kirim
            </Button>
            <input ref={inputRef} type="file" multiple className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.zip"
              onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-2xs">
                  {f.name}
                  <button aria-label="Buang" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/CardComments.tsx
git commit -m "feat(pipelines): CardComments typed composer + timeline"
```

---

## Task 8: Wire `CardComments` into `CardDetailModal` + humanize system activity

**Files:**
- Modify: `client/components/pipelines/CardDetailModal.tsx` (286-331)

- [ ] **Step 1: Replace the inline "Komentar & Lampiran" section**

In `client/components/pipelines/CardDetailModal.tsx`, delete the entire `<section>` block for "Komentar & Lampiran" (`client/components/pipelines/CardDetailModal.tsx:291-319`) and the local `comment` state (`client/components/pipelines/CardDetailModal.tsx:92`). Replace the section with:
```tsx
              <CardComments
                comments={card.comments}
                canComment={writable && canComment}
                sending={m.addComment.isPending}
                onSend={(args) => m.addComment.mutateAsync({ cardId, ...args })}
              />
```
Add `import { CardComments } from "@/components/pipelines/CardComments";` near the `CardAttachments` import (`client/components/pipelines/CardDetailModal.tsx:16`).

- [ ] **Step 2: Humanize the system activity labels**

Replace the "Aktivitas" section (`client/components/pipelines/CardDetailModal.tsx:321-331`) with a labeled version:
```tsx
              <section>
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Aktivitas (sistem)</h4>
                <ul className="space-y-1">
                  {card.activity.map((a) => (
                    <li key={a.id} className="text-[10px] text-muted-foreground">
                      <span className="font-medium">{ACTIVITY_LABELS[a.type] ?? a.type}</span> · {new Date(a.createdAt).toLocaleString("id-ID")}
                    </li>
                  ))}
                  {card.activity.length === 0 && <li className="text-[10px] text-muted-foreground">Belum ada aktivitas.</li>}
                </ul>
              </section>
```
Add this constant above the component (top of the file, after imports):
```tsx
const ACTIVITY_LABELS: Record<string, string> = {
  created: "Kartu dibuat",
  moved: "Dipindah stage",
  commented: "Komentar ditambah",
  attachment_added: "Lampiran ditambah",
  attachment_removed: "Lampiran dihapus",
  assigned: "Assignee diubah",
  updated: "Kartu diperbarui",
  field_updated: "Field diperbarui",
};
```

- [ ] **Step 3: Verify the `comment`/`canComment` refs still resolve**

Confirm `canComment` (`client/components/pipelines/CardDetailModal.tsx:88`) is still declared and the removed `comment`/`setComment` state has no other references:
```bash
grep -n "setComment\|comment\b" client/components/pipelines/CardDetailModal.tsx
```
Expected: only `canComment`, `card.comments`, and `m.addComment` remain (no bare `comment` state).

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build ok.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(pipelines): wire CardComments + humanized system activity into card detail"
```

---

## Task 9: Final verification + teardown

- [ ] **Step 1: Full suite**

Run: `npm run typecheck && npx tsx --test shared/*.test.ts && npm run build`
Expected: 0 type errors; all shared tests pass (includes the new `cardCommentTypes` tests); build ok.

- [ ] **Step 2: Re-run the end-to-end API check from Task 4 Step 7**

Rebuild + restart the harness server, re-run the curl block. Confirm: typed comment created, `authorName` populated, per-comment attachment count = 1, generic Lampiran count = 0.

- [ ] **Step 3: Spot-check delete cascade**

```bash
# delete the comment created above; its attachment row + file should be gone
CMID=$(curl -s http://localhost:3002/api/pipelines/cards/$CID -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["comments"][0]["id"])')
curl -s -X DELETE http://localhost:3002/api/pipelines/cards/comments/$CMID -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;print("deleted:",json.load(sys.stdin).get("success"))'
podman exec jabtc mysql -uroot -pp jabnet_fiber -e "SELECT COUNT(*) AS n FROM pipeline_card_attachments WHERE comment_id IS NOT NULL;"
```
Expected: `deleted: True`; count `n = 0`.

- [ ] **Step 4: Teardown**

```bash
pkill -f "node dist/index.mjs" 2>/dev/null; podman rm -f jabtc
```

- [ ] **Step 5: Update memory**

Append the feature to `memory/project-leads-pipeline-integration.md` (or a new `memory/project-pipeline-card-comments.md`) noting: typed comments (5 types) + per-comment attachments reuse `pipeline_card_attachments.comment_id`; composer/timeline in `CardComments.tsx`; gallery in `AttachmentGallery.tsx`; catalog in `shared/cardCommentTypes.ts`. Add a one-line index entry to `MEMORY.md`.

---

## Self-Review Notes (author check — all resolved)

- **Spec coverage:** AC1 dropdown → Task 7; AC2 submit text/file + linked attachment → Tasks 3-4,7; AC3 compress → Task 5; AC4 timeline icons/author/gallery → Tasks 4-5,7; AC5 generic Lampiran excludes comment files → Task 3 Step 3; AC6 cascade delete → Tasks 3-4; AC7 humanized activity → Task 8; AC8 tenant/perm/typecheck → throughout + Task 9.
- **Type consistency:** `saveOneAttachment` opts shape matches `addCardAttachment` data shape (incl. `commentId`); `addComment(cardId, authorId, body, type)` signature matches the route call; `CardDetail.comments[]` (type/authorName/attachments) matches the GET enrichment and `CardComments` props.
- **Color tokens:** all `text-*` tokens used (`muted-foreground/info/success/warning/primary`) exist in the design system (no `text-violet`).
- **No placeholders:** every code step shows full code.
