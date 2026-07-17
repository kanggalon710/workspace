# Leads → Pipeline Import (dev snapshot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-time dev import that creates a JABNET (mitra 1) "Leads (Marketing)" pipeline in the existing `pipeline_*` engine, seeded from `leads`/`lead_activities` — cards, stages, typed columns (as custom fields), activity timeline (as comments + activity), coords/ODP, and photo evidence (via a new comment `photo_path`).

**Architecture:** One small engine extension (`pipeline_card_comments.photo_path` column + guarded serve endpoint + drawer thumbnail), then a thin import script over a pure, unit-tested mapping module. The live `/leads` page + `leads*` tables are read-only source. JABNET only; dev DB only.

**Tech Stack:** Drizzle MySQL; Express; React 18 + TS; `mysql2/promise` for the standalone script; tests via `node:test` (`npx tsx --test`). `tools/` is outside `tsconfig` (run via `tsx`), so the import script + mapping module are gated by the unit test + a `--help` smoke run, not `tsc`.

**Base branch:** `feat/leads-to-pipeline-import` (off `dev`). Spec: `docs/superpowers/specs/2026-06-07-leads-to-pipeline-import-design.md`.

**Verification gates:** `npm run typecheck` (0, for engine-side Tasks 1–2) · `npm run build` (green, Tasks 1–2) · `npx tsx --test tools/leadsToPipeline.test.ts` (pass, Task 3) · `npx tsx tools/import-leads-to-pipeline.ts --help` exits 0 (Task 4).

**Dev gotcha (baked in):** dev runs `UPLOADS_READ_ONLY=true`, so `saveBase64Photo` THROWS. The import therefore **only references existing `photoPath` files** (readable on dev) and **skips/annotates legacy base64-only photos** — it never writes photo files.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/schema.ts` (modify) | Add `photoPath` column to `pipelineCardComments` |
| `server/storage.ts` (modify) | Startup `ALTER` for `photo_path` (info_schema-guarded); `getCommentPhotoMeta(id)` |
| `server/routes.ts` (modify) | `GET /api/pipelines/cards/comments/:id/photo` (guarded, streams) |
| `client/hooks/usePipelines.ts` (modify) | `CardDetail.comments` shape gains `photoPath` |
| `client/components/pipelines/CardDetailDrawer.tsx` (modify) | Render comment photo thumbnail when `photoPath` present |
| `tools/leadsToPipeline.ts` (new) | Pure mapping: stage/field defs + lead→card/values + activity classify/map |
| `tools/leadsToPipeline.test.ts` (new) | `node:test` unit tests for the mapping |
| `tools/import-leads-to-pipeline.ts` (new) | Dev import script (`--reset`, `--help`) |

---

### Task 1: Engine schema — `pipeline_card_comments.photo_path`

**Files:** Modify `shared/schema.ts`, `server/storage.ts`

- [ ] **Step 1: Add the column to the table def**

In `shared/schema.ts`, the `pipelineCardComments` table currently is:
```ts
export const pipelineCardComments = mysqlTable("pipeline_card_comments", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  authorId: int("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_pipeline_card_comments_card").on(t.cardId),
}));
```
Add a nullable `photoPath` line after `body`:
```ts
  body: text("body").notNull(),
  photoPath: varchar("photo_path", { length: 255 }),
  createdAt: text("created_at").notNull(),
```
(`varchar` is already imported in this file — confirm by the other `varchar(...)` usages.)

- [ ] **Step 2: Add the guarded startup migration**

In `server/storage.ts`, find the Phase-4c additive-column block (the `const p4cColAdds: Array<{ table; column; ddl }> = [...]` loop near line 6674 that adds `pipeline_cards.stage_entered_at`). Immediately AFTER that loop's closing (after line ~6692, before the `MODIFY trigger_stage_id` try), add the same-shape guarded ALTER:
```ts
    // Leads→pipeline import — photo evidence on card comments. Additive, idempotent.
    try {
      const [rows]: any = await this.pool.execute(
        `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pipeline_card_comments' AND column_name = 'photo_path'`,
      );
      if (Number((rows as any[])[0]?.c ?? 0) === 0) {
        await this.pool.execute(`ALTER TABLE pipeline_card_comments ADD COLUMN photo_path VARCHAR(255)`);
        console.log(`[migration] Added pipeline_card_comments.photo_path ✓`);
      }
    } catch (e: any) {
      console.warn(`[migration] pipeline_card_comments.photo_path add failed: ${e.message}`);
    }
```
(DB rejects `ADD COLUMN IF NOT EXISTS` — the info_schema COUNT guard is required; mirrors the existing pattern.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors, green. (`PipelineCardComment` type + `listComments` now include `photoPath` automatically.)

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): pipeline_card_comments.photo_path column + guarded migration (leads-import)"
```

---

### Task 2: Photo serve endpoint + comment meta + drawer render

**Files:** Modify `server/storage.ts`, `server/routes.ts`, `client/hooks/usePipelines.ts`, `client/components/pipelines/CardDetailDrawer.tsx`

- [ ] **Step 1: Storage — `getCommentPhotoMeta`**

In `server/storage.ts`, near `listComments`/`addComment` (~line 1990), add:
```ts
  async getCommentPhotoMeta(id: number): Promise<{ id: number; cardId: number; photoPath: string | null; mitraId: number } | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db
      .select({
        id: pipelineCardComments.id,
        cardId: pipelineCardComments.cardId,
        photoPath: pipelineCardComments.photoPath,
        mitraId: pipelineCardComments.mitraId,
      })
      .from(pipelineCardComments)
      .where(and(eq(pipelineCardComments.id, id), eq(pipelineCardComments.mitraId, mitraId)));
    return row;
  }
```
(`and`, `eq`, `pipelineCardComments` are already imported/used in this file.)

- [ ] **Step 2: Route — guarded photo stream**

In `server/routes.ts`, find the comment routes (`DELETE /api/pipelines/cards/comments/:id` ~line 4598). Immediately after that route, add:
```ts
  router.get("/api/pipelines/cards/comments/:id/photo", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const meta = await storage.getCommentPhotoMeta(Number(req.params.id));
    if (!meta || !meta.photoPath) return sendError(res, "Foto tidak ditemukan", 404);
    const card = await storage.getCard(meta.cardId);
    if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
    if (!(await requirePipelineView(req, res, card.pipelineId))) return;
    await streamPhoto(meta.photoPath, res);
  });
```
(`requirePermission`, `requirePipelineView`, `sendError`, `streamPhoto`, `storage.getCard` are all already imported/used in this file. This path has more segments than `GET /api/pipelines/cards/:cardId`, so there is no route-matching conflict. `<img>` requests authenticate via the existing `ftth_session` cookie fallback — no extra work.)

- [ ] **Step 3: Client type — add `photoPath` to CardDetail.comments**

In `client/hooks/usePipelines.ts`, the `CardDetail` type's comments shape is:
```ts
  comments: { id: number; authorId: number; body: string; createdAt: string }[];
```
Change to:
```ts
  comments: { id: number; authorId: number; body: string; photoPath: string | null; createdAt: string }[];
```

- [ ] **Step 4: Drawer — render the thumbnail**

In `client/components/pipelines/CardDetailDrawer.tsx`, the comment map currently is:
```tsx
                {card.comments.map((c) => (
                  <div key={c.id} className="text-sm bg-muted/50 rounded p-2">
                    {c.body}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(c.createdAt).toLocaleString("id-ID")}</div>
                  </div>
                ))}
```
Change to (add the photo block between body and the date):
```tsx
                {card.comments.map((c) => (
                  <div key={c.id} className="text-sm bg-muted/50 rounded p-2">
                    {c.body}
                    {c.photoPath && (
                      <a
                        href={`/api/pipelines/cards/comments/${c.id}/photo`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block"
                      >
                        <img
                          src={`/api/pipelines/cards/comments/${c.id}/photo`}
                          alt="Foto"
                          loading="lazy"
                          className="max-h-40 rounded border border-border/50"
                        />
                      </a>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(c.createdAt).toLocaleString("id-ID")}</div>
                  </div>
                ))}
```

- [ ] **Step 5: Typecheck + build + commit**

Run: `npm run typecheck && npm run build` → 0 errors, green.
```bash
git add server/storage.ts server/routes.ts client/hooks/usePipelines.ts client/components/pipelines/CardDetailDrawer.tsx
git commit -m "feat(pipelines): card comment photo serve endpoint + drawer thumbnail (leads-import)"
```

---

### Task 3: Pure mapping module — `tools/leadsToPipeline.ts` (TDD)

**Files:** Create `tools/leadsToPipeline.ts`, `tools/leadsToPipeline.test.ts`

The module is I/O-free and reads DB-shape (snake_case) rows, since the import script passes raw `mysql2` rows straight through (no translation layer). It imports the lead stage/category constants from `shared/schema` (DRY).

- [ ] **Step 1: Write the failing test**

Create `tools/leadsToPipeline.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_PIPELINE_STAGES,
  LEAD_PIPELINE_FIELDS,
  leadToCard,
  leadToFieldValues,
  classifyActivity,
  activityToComment,
  activityToActivity,
} from "./leadsToPipeline.js";

const sampleLead = {
  id: 42,
  name: "Budi",
  phone: "08123",
  address: "Jl. Mawar",
  category: "rumahan",
  source: "canvassing",
  notes: "tertarik 50Mbps",
  district: "Cilawu",
  village: "Sukamaju",
  loss_reason: null,
  odp_id: 7,
  distance_meters: 120,
  lat: -7.2,
  lng: 107.9,
  stage: "interested",
  priority: "high",
  assigned_to: 5,
  created_by: 3,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-10T00:00:00.000Z",
};

test("LEAD_PIPELINE_STAGES: 6 stages, ordered, with labels+colors", () => {
  const s = LEAD_PIPELINE_STAGES();
  assert.equal(s.length, 6);
  assert.deepEqual(s.map((x) => x.key), ["new", "contacted", "interested", "negotiation", "won", "lost"]);
  assert.deepEqual(s.map((x) => x.position), [0, 1, 2, 3, 4, 5]);
  assert.equal(s[4].label, "Closing ✅");
  assert.equal(s[0].color, "#6B7280");
});

test("LEAD_PIPELINE_FIELDS: expected keys + types", () => {
  const byKey = Object.fromEntries(LEAD_PIPELINE_FIELDS.map((f) => [f.key, f]));
  assert.equal(byKey.phone.type, "phone");
  assert.equal(byKey.address.type, "textarea");
  assert.equal(byKey.category.type, "dropdown");
  assert.deepEqual(byKey.category.options, ["rumahan", "bisnis", "perkantoran", "sekolah", "lainnya"]);
  assert.equal(byKey.source.type, "dropdown");
  assert.equal(byKey.odp_id.type, "number");
  assert.equal(byKey.lat.type, "number");
  assert.equal(byKey.source_lead_id.type, "number");
});

test("leadToCard: maps title/stage/assignee/priority/dates", () => {
  const stageIdByKey = { new: 10, contacted: 11, interested: 12, negotiation: 13, won: 14, lost: 15 };
  const c = leadToCard(sampleLead, stageIdByKey);
  assert.equal(c.title, "Budi");
  assert.equal(c.stageId, 12);
  assert.equal(c.assigneeId, 5);
  assert.equal(c.priority, "high");
  assert.equal(c.createdBy, 3);
  assert.equal(c.createdAt, "2026-05-01T00:00:00.000Z");
  assert.equal(c.stageEnteredAt, "2026-05-10T00:00:00.000Z"); // updated_at preferred
});

test("leadToCard: unknown stage falls back to first stage", () => {
  const stageIdByKey = { new: 10, contacted: 11, interested: 12, negotiation: 13, won: 14, lost: 15 };
  const c = leadToCard({ ...sampleLead, stage: "weird" }, stageIdByKey);
  assert.equal(c.stageId, 10);
});

test("leadToFieldValues: stringifies numbers, omits null/empty, sets source_lead_id", () => {
  const vals = Object.fromEntries(leadToFieldValues(sampleLead).map((v) => [v.fieldKey, v.value]));
  assert.equal(vals.phone, "08123");
  assert.equal(vals.odp_id, "7");
  assert.equal(vals.distance_m, "120");
  assert.equal(vals.lat, "-7.2");
  assert.equal(vals.source_lead_id, "42");
  assert.equal("loss_reason" in vals, false); // null omitted
});

test("classifyActivity: comment vs activity buckets", () => {
  for (const t of ["note", "call", "whatsapp", "visit", "photo"]) assert.equal(classifyActivity(t), "comment");
  for (const t of ["stage_change", "assigned", "converted"]) assert.equal(classifyActivity(t), "activity");
});

test("activityToComment: labels body + carries author/date", () => {
  const cm = activityToComment({ id: 1, lead_id: 42, user_id: 5, type: "call", content: "tidak diangkat", created_at: "2026-05-02T00:00:00.000Z" });
  assert.equal(cm.body, "[Telepon] tidak diangkat");
  assert.equal(cm.authorId, 5);
  assert.equal(cm.createdAt, "2026-05-02T00:00:00.000Z");
  const photo = activityToComment({ id: 2, lead_id: 42, user_id: 5, type: "photo", content: null, created_at: "x" });
  assert.equal(photo.body, "[Foto]");
});

test("activityToActivity: passes type/detail/actor/date", () => {
  const av = activityToActivity({ id: 3, lead_id: 42, user_id: 5, type: "stage_change", content: '{"from":"new","to":"contacted"}', created_at: "2026-05-03T00:00:00.000Z" });
  assert.equal(av.type, "stage_change");
  assert.equal(av.detail, '{"from":"new","to":"contacted"}');
  assert.equal(av.actorId, 5);
  assert.equal(av.createdAt, "2026-05-03T00:00:00.000Z");
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx tsx --test tools/leadsToPipeline.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` — module doesn't exist).

- [ ] **Step 3: Implement `tools/leadsToPipeline.ts`**

```ts
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_STAGE_COLORS,
  LEAD_CATEGORIES,
} from "../shared/schema.js";

/** DB-shape (snake_case) lead row, as returned by a raw mysql2 SELECT. Only fields we read. */
export interface LeadRow {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  category?: string | null;
  source?: string | null;
  notes?: string | null;
  district?: string | null;
  village?: string | null;
  loss_reason?: string | null;
  odp_id?: number | null;
  distance_meters?: number | null;
  lat?: number | null;
  lng?: number | null;
  stage?: string | null;
  priority?: string | null;
  assigned_to?: number | null;
  created_by: number;
  created_at: string;
  updated_at?: string | null;
}

export interface ActivityRow {
  id: number;
  lead_id: number;
  user_id: number;
  type: string;
  content?: string | null;
  photo_path?: string | null;
  photo_data?: string | null;
  created_at: string;
}

const LEAD_SOURCES = ["prospect_finder", "canvassing", "referral", "inbound", "meta_ads", "tiktok_ads"];

/** The 6 lead stages as pipeline stage definitions (ordered). */
export function LEAD_PIPELINE_STAGES(): { key: string; label: string; color: string; position: number }[] {
  return LEAD_STAGES.map((key, i) => ({
    key,
    label: LEAD_STAGE_LABELS[key],
    color: LEAD_STAGE_COLORS[key],
    position: i,
  }));
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "phone" | "dropdown";
  options?: string[];
  showOnCard: boolean;
  position: number;
}

/** Custom-field definitions for the typed lead columns. */
export const LEAD_PIPELINE_FIELDS: FieldDef[] = [
  { key: "phone", label: "Telepon", type: "phone", showOnCard: true, position: 0 },
  { key: "source", label: "Sumber", type: "dropdown", options: LEAD_SOURCES, showOnCard: true, position: 1 },
  { key: "category", label: "Kategori", type: "dropdown", options: [...LEAD_CATEGORIES], showOnCard: false, position: 2 },
  { key: "district", label: "Kecamatan", type: "text", showOnCard: true, position: 3 },
  { key: "village", label: "Desa/Kelurahan", type: "text", showOnCard: false, position: 4 },
  { key: "address", label: "Alamat", type: "textarea", showOnCard: false, position: 5 },
  { key: "notes", label: "Catatan", type: "textarea", showOnCard: false, position: 6 },
  { key: "loss_reason", label: "Alasan Gagal", type: "text", showOnCard: false, position: 7 },
  { key: "odp_id", label: "ODP ID", type: "number", showOnCard: false, position: 8 },
  { key: "distance_m", label: "Jarak ODP (m)", type: "number", showOnCard: false, position: 9 },
  { key: "lat", label: "Lat", type: "number", showOnCard: false, position: 10 },
  { key: "lng", label: "Lng", type: "number", showOnCard: false, position: 11 },
  { key: "source_lead_id", label: "Sumber Lead ID", type: "number", showOnCard: false, position: 12 },
];

export interface CardDraft {
  title: string;
  stageId: number;
  assigneeId: number | null;
  priority: string;
  createdBy: number;
  createdAt: string;
  stageEnteredAt: string;
}

/** Map a lead row to pipeline_cards columns. Unknown stage → first stage. */
export function leadToCard(lead: LeadRow, stageIdByKey: Record<string, number>): CardDraft {
  const stageKey = lead.stage && stageIdByKey[lead.stage] != null ? lead.stage : LEAD_STAGES[0];
  return {
    title: lead.name,
    stageId: stageIdByKey[stageKey],
    assigneeId: lead.assigned_to ?? null,
    priority: lead.priority || "medium",
    createdBy: lead.created_by,
    createdAt: lead.created_at,
    stageEnteredAt: lead.updated_at || lead.created_at,
  };
}

/** Map a lead row to custom-field {fieldKey,value} pairs. Omits null/empty; stringifies numbers. */
export function leadToFieldValues(lead: LeadRow): { fieldKey: string; value: string }[] {
  const raw: [string, string | number | null | undefined][] = [
    ["phone", lead.phone],
    ["source", lead.source],
    ["category", lead.category],
    ["district", lead.district],
    ["village", lead.village],
    ["address", lead.address],
    ["notes", lead.notes],
    ["loss_reason", lead.loss_reason],
    ["odp_id", lead.odp_id],
    ["distance_m", lead.distance_meters],
    ["lat", lead.lat],
    ["lng", lead.lng],
    ["source_lead_id", lead.id],
  ];
  const out: { fieldKey: string; value: string }[] = [];
  for (const [fieldKey, v] of raw) {
    if (v === null || v === undefined) continue;
    const value = String(v).trim();
    if (value === "") continue;
    out.push({ fieldKey, value });
  }
  return out;
}

const COMMENT_TYPES = new Set(["note", "call", "whatsapp", "visit", "photo"]);
const ACTIVITY_LABELS: Record<string, string> = {
  note: "Catatan",
  call: "Telepon",
  whatsapp: "WhatsApp",
  visit: "Kunjungan",
  photo: "Foto",
};

/** Bucket a lead activity: user-thread "comment" vs audit "activity". */
export function classifyActivity(type: string): "comment" | "activity" {
  return COMMENT_TYPES.has(type) ? "comment" : "activity";
}

/** Map a comment-type lead activity to a pipeline_card_comments draft (photo handled by the script via photo_path). */
export function activityToComment(act: ActivityRow): { body: string; authorId: number; createdAt: string } {
  const label = ACTIVITY_LABELS[act.type] ?? act.type;
  const content = (act.content ?? "").trim();
  return {
    body: content ? `[${label}] ${content}` : `[${label}]`,
    authorId: act.user_id,
    createdAt: act.created_at,
  };
}

/** Map an audit-type lead activity to a pipeline_card_activity draft. */
export function activityToActivity(act: ActivityRow): { type: string; detail: string | null; actorId: number; createdAt: string } {
  return {
    type: act.type,
    detail: act.content ?? null,
    actorId: act.user_id,
    createdAt: act.created_at,
  };
}
```

- [ ] **Step 4: Run test → PASS**

Run: `npx tsx --test tools/leadsToPipeline.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add tools/leadsToPipeline.ts tools/leadsToPipeline.test.ts
git commit -m "feat(pipelines): pure leads→pipeline mapping module + tests (leads-import)"
```

---

### Task 4: Import script — `tools/import-leads-to-pipeline.ts`

**Files:** Create `tools/import-leads-to-pipeline.ts`

Standalone dev script: connects via `DB_*` env (mirrors `tools/legacy-sync-to-jabnet.mjs`), JABNET-only, writes only `pipeline_*` rows. `--reset` re-imports cleanly; `--help` prints usage and exits 0 (the smoke gate).

- [ ] **Step 1: Implement the script**

Create `tools/import-leads-to-pipeline.ts`:
```ts
import mysql from "mysql2/promise";
import {
  LEAD_PIPELINE_STAGES,
  LEAD_PIPELINE_FIELDS,
  leadToCard,
  leadToFieldValues,
  classifyActivity,
  activityToComment,
  activityToActivity,
  type LeadRow,
  type ActivityRow,
} from "./leadsToPipeline.js";

const MITRA_ID = 1; // JABNET only
const PIPELINE_NAME = "Leads (Marketing)";
const SENTINEL = "[leads-import]";
const PIPELINE_DESC = `Diimpor dari /leads (snapshot). ${SENTINEL}`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage: npx tsx tools/import-leads-to-pipeline.ts [--reset]",
      "",
      "  Snapshot-import JABNET (mitra 1) leads into a 'Leads (Marketing)' pipeline",
      "  on the DB given by DB_* env vars (use DB_NAME=jabnet_fiber_dev for dev).",
      "",
      "  --reset   delete a previously-imported pipeline (matched by sentinel) then re-import.",
      "",
      "  Photos: references existing lead activity photoPath files only; legacy base64-only",
      "  photos are skipped (dev is UPLOADS_READ_ONLY). Never writes photo files.",
    ].join("\n"),
  );
  process.exit(0);
}
const RESET = args.includes("--reset");

if (!process.env.DB_USER || !process.env.DB_NAME) {
  console.error("ERROR: DB_USER + DB_NAME wajib di-set (env / .env). Dev: DB_NAME=jabnet_fiber_dev.");
  process.exit(1);
}

const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

const nowIso = () => new Date().toISOString();
async function q(sql: string, params: any[] = []): Promise<any[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as any[];
}

async function main() {
  // 1. Existing imported pipeline?
  const existing = await q(
    `SELECT id FROM pipelines WHERE mitra_id = ? AND name = ? AND description LIKE ?`,
    [MITRA_ID, PIPELINE_NAME, `%${SENTINEL}%`],
  );
  if (existing.length) {
    if (!RESET) {
      console.error(`Pipeline "${PIPELINE_NAME}" sudah ada (id ${existing[0].id}). Pakai --reset untuk re-import.`);
      process.exit(1);
    }
    const pid = existing[0].id as number;
    const cards = await q(`SELECT id FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    const cardIds = cards.map((c: any) => c.id);
    if (cardIds.length) {
      const ph = cardIds.map(() => "?").join(",");
      for (const t of ["pipeline_card_comments", "pipeline_card_activity", "pipeline_card_values", "pipeline_card_followers"]) {
        await q(`DELETE FROM ${t} WHERE mitra_id = ? AND card_id IN (${ph})`, [MITRA_ID, ...cardIds]);
      }
    }
    await q(`DELETE FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipeline_fields WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipeline_stages WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipelines WHERE mitra_id = ? AND id = ?`, [MITRA_ID, pid]);
    console.log(`[reset] deleted prior pipeline id ${pid} + children`);
  }

  // System user for created_by/author/actor fallbacks (lowest user id).
  const us = await q(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  const SYSTEM_USER: number = us.length ? us[0].id : 1;

  // 2. Pipeline
  const pr = await q(
    `INSERT INTO pipelines (mitra_id, name, description, color, icon, position, is_archived, restricted, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
    [MITRA_ID, PIPELINE_NAME, PIPELINE_DESC, "#8B5CF6", "target", SYSTEM_USER, nowIso()],
  );
  const pipelineId = (pr as any).insertId as number;

  // 3. Stages
  const stageIdByKey: Record<string, number> = {};
  for (const s of LEAD_PIPELINE_STAGES()) {
    const r = await q(
      `INSERT INTO pipeline_stages (mitra_id, pipeline_id, label, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [MITRA_ID, pipelineId, s.label, s.color, s.position, nowIso()],
    );
    stageIdByKey[s.key] = (r as any).insertId;
  }

  // 4. Fields
  const fieldIdByKey: Record<string, number> = {};
  for (const f of LEAD_PIPELINE_FIELDS) {
    const r = await q(
      `INSERT INTO pipeline_fields (mitra_id, pipeline_id, \`key\`, label, type, options, required, show_on_card, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [MITRA_ID, pipelineId, f.key, f.label, f.type, f.options ? JSON.stringify(f.options) : null, f.showOnCard ? 1 : 0, f.position, nowIso()],
    );
    fieldIdByKey[f.key] = (r as any).insertId;
  }

  // 5. Leads → cards (+ values, comments, activity)
  const leads = (await q(`SELECT * FROM leads WHERE mitra_id = ? ORDER BY id ASC`, [MITRA_ID])) as LeadRow[];
  let nCards = 0, nValues = 0, nComments = 0, nActivity = 0, nPhotos = 0, nPhotoSkipped = 0;
  for (const lead of leads) {
    const c = leadToCard(lead, stageIdByKey);
    const cr = await q(
      `INSERT INTO pipeline_cards (mitra_id, pipeline_id, stage_id, title, assignee_id, priority, position, created_by, created_at, stage_entered_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [MITRA_ID, pipelineId, c.stageId, c.title, c.assigneeId, c.priority, c.createdBy ?? SYSTEM_USER, c.createdAt, c.stageEnteredAt],
    );
    const cardId = (cr as any).insertId as number;
    nCards++;

    for (const v of leadToFieldValues(lead)) {
      const fid = fieldIdByKey[v.fieldKey];
      if (!fid) continue;
      await q(
        `INSERT INTO pipeline_card_values (mitra_id, card_id, field_id, value, created_at) VALUES (?, ?, ?, ?, ?)`,
        [MITRA_ID, cardId, fid, v.value, nowIso()],
      );
      nValues++;
    }

    const acts = (await q(`SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY id ASC`, [lead.id])) as ActivityRow[];
    for (const a of acts) {
      if (classifyActivity(a.type) === "comment") {
        const cm = activityToComment(a);
        let photoPath: string | null = null;
        if (a.photo_path) { photoPath = a.photo_path; nPhotos++; }
        else if (a.photo_data) { nPhotoSkipped++; } // dev UPLOADS_READ_ONLY → cannot materialize base64
        await q(
          `INSERT INTO pipeline_card_comments (mitra_id, card_id, author_id, body, photo_path, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [MITRA_ID, cardId, cm.authorId ?? SYSTEM_USER, cm.body, photoPath, cm.createdAt],
        );
        nComments++;
      } else {
        const av = activityToActivity(a);
        await q(
          `INSERT INTO pipeline_card_activity (mitra_id, card_id, actor_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [MITRA_ID, cardId, av.actorId ?? SYSTEM_USER, av.type, av.detail, av.createdAt],
        );
        nActivity++;
      }
    }
  }

  console.log(
    `[done] pipeline ${pipelineId} "${PIPELINE_NAME}": ` +
      `${nCards} cards, ${nValues} field-values, ${nComments} comments ` +
      `(${nPhotos} photos linked, ${nPhotoSkipped} base64 skipped), ${nActivity} activity rows.`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("[error]", e);
    await pool.end();
    process.exit(1);
  });
```

- [ ] **Step 2: Smoke test (no DB needed)**

Run: `npx tsx tools/import-leads-to-pipeline.ts --help`
Expected: prints usage, exits 0 (proves imports resolve + the pure module loads cleanly).

- [ ] **Step 3: Commit**

```bash
git add tools/import-leads-to-pipeline.ts
git commit -m "feat(pipelines): dev import script leads→pipeline (--reset/--help) (leads-import)"
```

- [ ] **Step 4: Manual run checklist (relay; the USER runs this on dev — needs the dev DB)**

Run against the dev database (DB_NAME=jabnet_fiber_dev), e.g. on the dev cPanel box or via an SSH tunnel:
```bash
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=jabnet_crm_user DB_PASSWORD='Galon@12345' \
  DB_NAME=jabnet_fiber_dev npx tsx tools/import-leads-to-pipeline.ts --reset
```
Then verify:
- App on dev → `/pipelines` → "Leads (Marketing)" pipeline exists (JABNET).
- 6 stages in order (Prospek Baru → … → Closing ✅ / Tidak Jadi ❌) with the lead colors.
- Card count == JABNET leads count; open a card → custom fields populated (phone/source/kecamatan/odp/coords), comment timeline (catatan/telepon/wa/kunjungan), and a photo thumbnail renders for activities that had a photoPath.
- Activity log shows stage_change/assigned/converted entries.
- Re-run with `--reset` → still exactly one "Leads (Marketing)" pipeline, same counts (no duplicates).
- Other mitras' pipelines untouched; the `/leads` page + leads data unchanged.

---

## Self-Review notes (addressed)

- **Spec coverage:** photo column+migration → T1; serve endpoint+meta+type+render → T2; pure mapping (stages/fields/card/values/activities) → T3; import script (pipeline/stages/fields/cards/values/comments/activity, `--reset`) → T4. All spec §1–§6 mapped.
- **Refinements vs spec (deliberate):** (a) photos are **referenced only** (existing `photoPath`), base64-only skipped+counted — because dev `UPLOADS_READ_ONLY=true` makes `saveBase64Photo` throw; so the script imports **no** `server/uploads` dependency and writes no files. (b) `addComment` storage is **not** modified (the import inserts comments directly; the in-app comment UI gaining photos is out of scope) — YAGNI. (c) `activityToComment` returns `{body,authorId,createdAt}` and the script handles `photo_path` from the raw row (simpler than threading a `photoPathRef`).
- **DB-shape inputs:** the pure module reads snake_case (`assigned_to`, `odp_id`, `distance_meters`, `loss_reason`, `created_by`, `created_at`, `updated_at`, `photo_path`, `photo_data`, `user_id`) because the script passes raw `mysql2` rows through — no translation layer; tests use snake_case samples.
- **Type consistency:** `LEAD_PIPELINE_STAGES`/`LEAD_PIPELINE_FIELDS`/`leadToCard`/`leadToFieldValues`/`classifyActivity`/`activityToComment`/`activityToActivity` + `LeadRow`/`ActivityRow` (T3) are exactly the symbols imported by the script (T4); `CardDraft.stageId` resolved via `stageIdByKey` built from stage inserts; field keys in `LEAD_PIPELINE_FIELDS` match `leadToFieldValues` outputs; `CardDetail.comments.photoPath` (T2) matches the new column (T1) and the drawer render (T2).
- **No placeholders:** every code step is complete. "Find the …" instructions (T1 p4c block, T2 comment routes/map) locate existing code to edit, with the surrounding code quoted.
- **Standards:** pure `leadsToPipeline` module (SoC/TDD); thin I/O script; DRY reuse of `LEAD_*` constants + `streamPhoto`; semantic `<a>/<img>` with `alt` + `loading="lazy"`; mitra-scoped everywhere (import hardcodes mitra 1; serve endpoint uses `getMitraId` + pipeline-view); guarded migration via info_schema (no `IF NOT EXISTS`).
- **tsconfig:** `tools/` is outside `include`, so T3/T4 are gated by the unit test + `--help` smoke, not `tsc` (consistent with existing `.mjs` tools). T1/T2 (engine) are covered by `npm run typecheck` + `npm run build`.
