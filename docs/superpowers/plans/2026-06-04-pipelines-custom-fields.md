# Pipelines Dynamic Custom Fields (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-pipeline user-defined custom fields (11 types) with values on cards, editable in the card drawer, with opt-in chips on the board face - tenant-isolated, gated by the existing `pipelines` permission.

**Architecture:** Two new EAV tables (`pipeline_fields` defs + `pipeline_card_values`) created on startup via `CREATE TABLE IF NOT EXISTS`. Pure value-validation/encode/decode helpers (unit-tested). Storage methods + REST endpoints on the existing pipelines module, all responding via the `sendSuccess` envelope. React: a `FieldValueInput` switch component, a `ManageFieldsDialog`, drawer integration, and board chips.

**Tech Stack:** Node 20 · Express 5 · Drizzle ORM (MySQL) · React 18 · TS · Vite · TanStack Query 5 · Wouter · Tailwind/shadcn. Tests via `node:test` (`npx tsx --test`).

**Spec:** `docs/superpowers/specs/2026-06-04-pipelines-custom-fields-design.md`

**CRITICAL conventions (Phase-1 lessons - do not repeat the bugs):**
- **Every endpoint responds via `sendSuccess(res, data)`** (`server/routes.ts:138`) → `{success:true,data}`. The client `apiFetch` throws "Request failed" on raw `res.json(...)`. NEVER use raw `res.json` for pipeline routes.
- **New tables are created in the startup migration block** in `server/storage.ts` (next to the Phase-1 `CREATE TABLE IF NOT EXISTS pipelines...` block, ~line 6056) - NOT via `db:push`. Without this the feature 500s after deploy.
- Every storage query filters `mitraId = getMitraId()`.
- MySQL Drizzle: no `.returning()` - insert then reselect by `insertId` (filter mitraId on the reselect).
- DB changes target `jabnet_fiber_dev` first.

**Reference patterns:**
- Phase-1 pipeline storage section: `server/storage.ts` (search `===== Pipelines Engine (Phase 1)`).
- Phase-1 pipeline routes: `server/routes.ts:4189+` (search `Pipelines Engine (Phase 1)`).
- Field type union + tables: this plan, Task 1.
- Existing UI: `client/components/ui/{dialog,combobox,switch,form-field,input,textarea,button}.tsx`. Users list: `api.get<SafeUser[]>("/users")`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `shared/schema.ts` | `pipeline_fields` + `pipeline_card_values` tables, types, `PipelineFieldType` | Modify |
| `server/pipeline-field-helpers.ts` | Pure: validate/encode/decode/formatChip | Create |
| `server/pipeline-field-helpers.test.ts` | Unit tests | Create |
| `server/storage.ts` | Startup CREATE TABLE; field CRUD + value get/set methods | Modify |
| `server/routes.ts` | Field + value endpoints; extend 3 read endpoints | Modify |
| `client/hooks/usePipelines.ts` | `useFields` + field/value mutations; extend types | Modify |
| `client/components/pipelines/FieldValueInput.tsx` | One editor switching on field type | Create |
| `client/components/pipelines/ManageFieldsDialog.tsx` | Field management dialog | Create |
| `client/components/pipelines/CardDetailDrawer.tsx` | Add "Field Kustom" section | Modify |
| `client/pages/PipelineBoardPage.tsx` | Manage-fields button + card chips | Modify |

---

## Task 1: Schema - field tables, types, startup migration

**Files:**
- Modify: `shared/schema.ts` (after the Phase-1 `pipelineCardFollowers` table + types)
- Modify: `server/storage.ts` (startup migration block, after the Phase-1 `CREATE TABLE IF NOT EXISTS pipeline_card_followers` block)

- [ ] **Step 1: Add tables in `shared/schema.ts`** after the Phase-1 pipeline types. `index`, `uniqueIndex` are already imported (Phase 1 added them).

```ts
export const pipelineFields = mysqlTable("pipeline_fields", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  key: varchar("key", { length: 64 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  options: text("options"),               // JSON array of strings (dropdown/multiselect)
  required: int("required").notNull().default(0),
  showOnCard: int("show_on_card").notNull().default(0),
  position: int("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byPipeline: index("idx_pipeline_fields_mitra_pipeline").on(t.mitraId, t.pipelineId, t.position),
  uniqKey: uniqueIndex("uniq_pipeline_field_key").on(t.pipelineId, t.key),
}));

export const pipelineCardValues = mysqlTable("pipeline_card_values", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  fieldId: int("field_id").notNull(),
  value: text("value"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byCard: index("idx_pipeline_card_values_mitra_card").on(t.mitraId, t.cardId),
  uniqCardField: uniqueIndex("uniq_card_field").on(t.cardId, t.fieldId),
}));

export type PipelineField = typeof pipelineFields.$inferSelect;
export type PipelineCardValue = typeof pipelineCardValues.$inferSelect;
export type PipelineFieldType =
  | "text" | "textarea" | "number" | "currency" | "date"
  | "dropdown" | "multiselect" | "checkbox" | "user" | "phone" | "url";
export const PIPELINE_FIELD_TYPES: PipelineFieldType[] =
  ["text","textarea","number","currency","date","dropdown","multiselect","checkbox","user","phone","url"];
```

- [ ] **Step 2: Add startup migration in `server/storage.ts`.** Find the Phase-1 block that ends with `CREATE TABLE IF NOT EXISTS pipeline_card_followers (...)` and its closing `catch`. Immediately after that try/catch, add:

```ts
    // Pipelines Phase 2 - custom fields (EAV). Additive, idempotent.
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_fields (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          \`key\` VARCHAR(64) NOT NULL,
          label VARCHAR(255) NOT NULL,
          type VARCHAR(16) NOT NULL,
          options TEXT,
          required INT NOT NULL DEFAULT 0,
          show_on_card INT NOT NULL DEFAULT 0,
          position INT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE KEY uniq_pipeline_field_key (pipeline_id, \`key\`),
          KEY idx_pipeline_fields_mitra_pipeline (mitra_id, pipeline_id, position)
        )
      `);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_card_values (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          field_id INT NOT NULL,
          value TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE KEY uniq_card_field (card_id, field_id),
          KEY idx_pipeline_card_values_mitra_card (mitra_id, card_id)
        )
      `);
    } catch (e: any) {
      console.warn(`[migration] pipelines custom fields setup failed: ${e.message}`);
    }
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): custom field schema + startup migration"
```

---

## Task 2: Pure helpers + tests (validate / encode / decode / formatChip)

**Files:**
- Create: `server/pipeline-field-helpers.ts`
- Create: `server/pipeline-field-helpers.test.ts`

- [ ] **Step 1: Write the failing test** (`server/pipeline-field-helpers.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFieldValue, encodeFieldValue, decodeFieldValue, formatChipValue } from "./pipeline-field-helpers.js";

test("empty value is always valid (soft-required)", () => {
  assert.deepEqual(validateFieldValue("number", "", undefined), { ok: true });
  assert.deepEqual(validateFieldValue("dropdown", "", ["a"]), { ok: true });
});

test("number rejects non-numeric", () => {
  assert.equal(validateFieldValue("number", "12.5").ok, true);
  assert.equal(validateFieldValue("currency", "1000").ok, true);
  assert.equal(validateFieldValue("number", "abc").ok, false);
});

test("dropdown must be one of options", () => {
  assert.equal(validateFieldValue("dropdown", "b", ["a", "b"]).ok, true);
  assert.equal(validateFieldValue("dropdown", "z", ["a", "b"]).ok, false);
});

test("multiselect all values must be in options", () => {
  assert.equal(validateFieldValue("multiselect", JSON.stringify(["a","b"]), ["a","b","c"]).ok, true);
  assert.equal(validateFieldValue("multiselect", JSON.stringify(["a","z"]), ["a","b"]).ok, false);
  assert.equal(validateFieldValue("multiselect", "not json", ["a"]).ok, false);
});

test("checkbox must be 0 or 1", () => {
  assert.equal(validateFieldValue("checkbox", "1").ok, true);
  assert.equal(validateFieldValue("checkbox", "0").ok, true);
  assert.equal(validateFieldValue("checkbox", "true").ok, false);
});

test("date must be ISO-parseable", () => {
  assert.equal(validateFieldValue("date", "2026-06-04").ok, true);
  assert.equal(validateFieldValue("date", "notadate").ok, false);
});

test("user must be numeric id", () => {
  assert.equal(validateFieldValue("user", "42").ok, true);
  assert.equal(validateFieldValue("user", "abc").ok, false);
});

test("encode/decode multiselect round-trips; malformed decodes to []", () => {
  assert.equal(encodeFieldValue("multiselect", ["a", "b"]), JSON.stringify(["a", "b"]));
  assert.deepEqual(decodeFieldValue("multiselect", JSON.stringify(["a","b"])), ["a", "b"]);
  assert.deepEqual(decodeFieldValue("multiselect", "broken"), []);
  assert.deepEqual(decodeFieldValue("multiselect", null), []);
});

test("decode scalar returns string; null -> empty string", () => {
  assert.equal(decodeFieldValue("text", "hi"), "hi");
  assert.equal(decodeFieldValue("number", null), "");
});

test("formatChipValue renders human strings", () => {
  assert.equal(formatChipValue("checkbox", "1"), "Ya");
  assert.equal(formatChipValue("checkbox", "0"), "Tidak");
  assert.equal(formatChipValue("currency", "1500000"), "Rp 1.500.000");
  assert.equal(formatChipValue("multiselect", JSON.stringify(["a","b"])), "a, b");
  assert.equal(formatChipValue("text", "hello"), "hello");
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx tsx --test server/pipeline-field-helpers.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement** (`server/pipeline-field-helpers.ts`):

```ts
/** Pure helpers for pipeline custom fields - no DB, fully unit-testable. */

export type Validation = { ok: true } | { ok: false; error: string };

export function validateFieldValue(type: string, value: string, options?: string[]): Validation {
  if (value === "" || value == null) return { ok: true }; // soft-required: empty always allowed
  switch (type) {
    case "number":
    case "currency":
      return Number.isFinite(Number(value)) ? { ok: true } : { ok: false, error: "Harus berupa angka" };
    case "checkbox":
      return value === "0" || value === "1" ? { ok: true } : { ok: false, error: "Checkbox harus 0/1" };
    case "date":
      return Number.isNaN(Date.parse(value)) ? { ok: false, error: "Tanggal tidak valid" } : { ok: true };
    case "user":
      return /^\d+$/.test(value) ? { ok: true } : { ok: false, error: "User tidak valid" };
    case "dropdown":
      return (options ?? []).includes(value) ? { ok: true } : { ok: false, error: "Pilihan tidak valid" };
    case "multiselect": {
      let arr: unknown;
      try { arr = JSON.parse(value); } catch { return { ok: false, error: "Format multiselect tidak valid" }; }
      if (!Array.isArray(arr)) return { ok: false, error: "Format multiselect tidak valid" };
      const opts = options ?? [];
      return arr.every((v) => opts.includes(String(v))) ? { ok: true } : { ok: false, error: "Pilihan tidak valid" };
    }
    case "text": case "textarea": case "phone": case "url":
    default:
      return value.length <= 5000 ? { ok: true } : { ok: false, error: "Terlalu panjang" };
  }
}

export function encodeFieldValue(type: string, raw: unknown): string {
  if (type === "multiselect") return JSON.stringify(Array.isArray(raw) ? raw.map(String) : []);
  if (raw == null) return "";
  return String(raw);
}

export function decodeFieldValue(type: string, stored: string | null): unknown {
  if (type === "multiselect") {
    if (!stored) return [];
    try { const a = JSON.parse(stored); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
  }
  return stored ?? "";
}

export function formatChipValue(type: string, stored: string | null, options?: string[]): string {
  if (stored == null || stored === "") return "";
  switch (type) {
    case "checkbox": return stored === "1" ? "Ya" : "Tidak";
    case "currency": return "Rp " + Number(stored).toLocaleString("id-ID");
    case "number": return Number(stored).toLocaleString("id-ID");
    case "multiselect": {
      try { const a = JSON.parse(stored); return Array.isArray(a) ? a.join(", ") : String(stored); } catch { return String(stored); }
    }
    default: return String(stored);
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx tsx --test server/pipeline-field-helpers.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-field-helpers.ts server/pipeline-field-helpers.test.ts
git commit -m "feat(pipelines): custom field value helpers with tests"
```

---

## Task 3: Storage - field CRUD + reorder

**Files:**
- Modify: `server/storage.ts` (schema imports + new methods at end of the pipelines section, after `removeFollower`)

- [ ] **Step 1: Extend schema imports** in `server/storage.ts` (the `"../shared/schema.js"` block that already imports the pipeline tables): add `pipelineFields, pipelineCardValues, type PipelineField, type PipelineCardValue`.

- [ ] **Step 2: Add field methods** after `removeFollower`:

```ts
  async listFields(pipelineId: number): Promise<PipelineField[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineFields)
      .where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId)))
      .orderBy(asc(pipelineFields.position), asc(pipelineFields.id));
  }

  async createField(pipelineId: number, data: { label: string; type: string; options?: string[] | null; required?: boolean; showOnCard?: boolean; }): Promise<PipelineField> {
    const mitraId = getMitraId();
    const existing = await this.listFields(pipelineId);
    const base = String(data.label).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "field";
    const used = new Set(existing.map((f) => f.key));
    let key = base; let n = 2;
    while (used.has(key)) key = `${base}_${n++}`;
    const maxPos = existing.reduce((m, f) => Math.max(m, f.position), -1);
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineFields).values({
      mitraId, pipelineId, key, label: data.label, type: data.type,
      options: data.options && data.options.length ? JSON.stringify(data.options) : null,
      required: data.required ? 1 : 0, showOnCard: data.showOnCard ? 1 : 0,
      position: maxPos + 1, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineFields).where(and(eq(pipelineFields.id, insertId), eq(pipelineFields.mitraId, mitraId)));
    return row!;
  }

  async updateField(id: number, data: { label?: string; options?: string[] | null; required?: boolean; showOnCard?: boolean; }): Promise<PipelineField> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.label !== undefined) patch.label = data.label;
    if (data.options !== undefined) patch.options = data.options && data.options.length ? JSON.stringify(data.options) : null;
    if (data.required !== undefined) patch.required = data.required ? 1 : 0;
    if (data.showOnCard !== undefined) patch.showOnCard = data.showOnCard ? 1 : 0;
    await this.db.update(pipelineFields).set(patch).where(and(eq(pipelineFields.id, id), eq(pipelineFields.mitraId, mitraId)));
    const [row] = await this.db.select().from(pipelineFields).where(and(eq(pipelineFields.id, id), eq(pipelineFields.mitraId, mitraId)));
    if (!row) throw new Error("Field tidak ditemukan");
    return row;
  }

  async deleteField(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineCardValues).where(and(eq(pipelineCardValues.fieldId, id), eq(pipelineCardValues.mitraId, mitraId)));
    await this.db.delete(pipelineFields).where(and(eq(pipelineFields.id, id), eq(pipelineFields.mitraId, mitraId)));
  }

  async reorderFields(pipelineId: number, orderedIds: number[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.update(pipelineFields).set({ position: i, updatedAt: now })
        .where(and(eq(pipelineFields.id, orderedIds[i]), eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId)));
    }
  }
```

> Note: `updateField` deliberately does NOT change `type` (type is fixed at creation - changing it would invalidate stored values).

- [ ] **Step 3: Typecheck** → `npm run typecheck` (0 errors).

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage field CRUD + reorder"
```

---

## Task 4: Storage - card values get/set + show-on-card

**Files:**
- Modify: `server/storage.ts` (append after `reorderFields`)

- [ ] **Step 1: Add value methods**

```ts
  async getCardValues(cardId: number): Promise<Record<number, string>> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineCardValues)
      .where(and(eq(pipelineCardValues.mitraId, mitraId), eq(pipelineCardValues.cardId, cardId)));
    const out: Record<number, string> = {};
    for (const r of rows) out[r.fieldId] = r.value ?? "";
    return out;
  }

  async setCardValues(cardId: number, entries: { fieldId: number; value: string }[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    for (const { fieldId, value } of entries) {
      const isEmpty = value === "" || value == null;
      const [existing] = await this.db.select().from(pipelineCardValues)
        .where(and(eq(pipelineCardValues.mitraId, mitraId), eq(pipelineCardValues.cardId, cardId), eq(pipelineCardValues.fieldId, fieldId)));
      if (isEmpty) {
        if (existing) await this.db.delete(pipelineCardValues)
          .where(and(eq(pipelineCardValues.id, existing.id), eq(pipelineCardValues.mitraId, mitraId)));
        continue;
      }
      if (existing) {
        await this.db.update(pipelineCardValues).set({ value, updatedAt: now })
          .where(and(eq(pipelineCardValues.id, existing.id), eq(pipelineCardValues.mitraId, mitraId)));
      } else {
        await this.db.insert(pipelineCardValues).values({ mitraId, cardId, fieldId, value, createdAt: now } as any);
      }
    }
  }

  /** cardId -> { fieldId: value } for show_on_card fields of a pipeline (board chips). */
  async getShowOnCardValues(pipelineId: number): Promise<Record<number, Record<number, string>>> {
    const mitraId = getMitraId();
    const fields = await this.db.select().from(pipelineFields)
      .where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId), eq(pipelineFields.showOnCard, 1)));
    const fieldIds = fields.map((f) => f.id);
    if (fieldIds.length === 0) return {};
    const rows = await this.db.select().from(pipelineCardValues)
      .where(and(eq(pipelineCardValues.mitraId, mitraId), inArray(pipelineCardValues.fieldId, fieldIds)));
    const out: Record<number, Record<number, string>> = {};
    for (const r of rows) { (out[r.cardId] ??= {})[r.fieldId] = r.value ?? ""; }
    return out;
  }
```

- [ ] **Step 2: Typecheck** → `npm run typecheck` (0 errors). (`inArray` is already imported in storage.ts.)

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage card values get/set + show-on-card"
```

---

## Task 5: Routes - field endpoints, values endpoint, extend read endpoints

**Files:**
- Modify: `server/routes.ts` (pipelines block, ~lines 4189-4397)

- [ ] **Step 1: Add field + value endpoints.** Register the field routes among the other `/api/pipelines/:id/...` routes, and the card-values route among the `/api/pipelines/cards/...` routes - ALL before `GET /api/pipelines/:id` (the last route). Import the validator at the top of routes.ts if not present: `import { validateFieldValue } from "./pipeline-field-helpers.js";` (check existing imports first).

```ts
  router.get("/api/pipelines/:id/fields", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    sendSuccess(res, await storage.listFields(Number(req.params.id)));
  });

  router.post("/api/pipelines/:id/fields", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { label, type, options, required, showOnCard } = req.body ?? {};
    if (!label || !type) return sendError(res, "label & type wajib diisi", 400);
    sendSuccess(res, await storage.createField(Number(req.params.id), { label, type, options, required, showOnCard }));
  });

  router.patch("/api/pipelines/:id/fields/:fieldId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { label, options, required, showOnCard } = req.body ?? {};
    try {
      sendSuccess(res, await storage.updateField(Number(req.params.fieldId), { label, options, required, showOnCard }));
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.delete("/api/pipelines/:id/fields/:fieldId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    await storage.deleteField(Number(req.params.fieldId));
    sendSuccess(res, { ok: true });
  });

  router.post("/api/pipelines/:id/fields/reorder", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { orderedIds } = req.body ?? {};
    if (!Array.isArray(orderedIds)) return sendError(res, "orderedIds wajib array", 400);
    await storage.reorderFields(Number(req.params.id), orderedIds.map(Number));
    sendSuccess(res, { ok: true });
  });

  router.put("/api/pipelines/cards/:cardId/values", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const cardId = Number(req.params.cardId);
    const { values } = req.body ?? {};
    if (!Array.isArray(values)) return sendError(res, "values wajib array", 400);
    const card = await storage.getCard(cardId);
    if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
    const fields = await storage.listFields(card.pipelineId);
    const byId = new Map(fields.map((f) => [f.id, f]));
    for (const v of values) {
      const f = byId.get(Number(v.fieldId));
      if (!f) return sendError(res, `Field ${v.fieldId} tidak ada di pipeline ini`, 400);
      const opts = f.options ? (JSON.parse(f.options) as string[]) : undefined;
      const check = validateFieldValue(f.type, String(v.value ?? ""), opts);
      if (!check.ok) return sendError(res, `${f.label}: ${check.error}`, 400);
    }
    await storage.setCardValues(cardId, values.map((v: any) => ({ fieldId: Number(v.fieldId), value: String(v.value ?? "") })));
    sendSuccess(res, { ok: true });
  });
```

- [ ] **Step 2: Extend the 3 existing read endpoints** in the same block:

In `GET /api/pipelines/:id` - add fields:
```ts
    const stages = await storage.listStages(pipeline.id);
    const fields = await storage.listFields(pipeline.id);
    sendSuccess(res, { ...pipeline, stages, fields });
```

In `GET /api/pipelines/:id/cards` - attach show-on-card values:
```ts
    const cards = await storage.listCards(Number(req.params.id), { q, assigneeId });
    const valuesByCard = await storage.getShowOnCardValues(Number(req.params.id));
    sendSuccess(res, cards.map((c) => ({ ...c, values: valuesByCard[c.id] ?? {} })));
```

In `GET /api/pipelines/cards/:cardId` - add fields + all values:
```ts
    const [comments, activity, followers, fields, values] = await Promise.all([
      storage.listComments(card.id), storage.listActivity(card.id), storage.listFollowers(card.id),
      storage.listFields(card.pipelineId), storage.getCardValues(card.id),
    ]);
    sendSuccess(res, { ...card, comments, activity, followers, fields, values });
```

- [ ] **Step 3: Verify** → `npm run typecheck && npm run build` (0 errors, build OK).

- [ ] **Step 4: Manual API smoke on dev** (`npm run db:push` is NOT used - restart dev app so the startup migration creates the tables, then):
```bash
curl -s -X POST localhost:5000/api/pipelines/1/fields -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d '{"label":"Estimasi Biaya","type":"currency","showOnCard":true}'
curl -s localhost:5000/api/pipelines/1/fields -H "Authorization: Bearer TOKEN"
```
Expected: `{success:true,data:{...}}` with the created field; list returns it.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): field + value REST endpoints (sendSuccess), extend reads"
```

---

## Task 6: Frontend hooks - useFields + mutations + extend types

**Files:**
- Modify: `client/hooks/usePipelines.ts`

- [ ] **Step 1: Extend types + add hooks.** Update the type imports and `CardDetail`/`PipelineWithStages`:

```ts
import type { Pipeline, PipelineStage, PipelineCard, PipelineField } from "@shared/schema";

export type PipelineWithStages = Pipeline & { stages: PipelineStage[]; fields: PipelineField[] };
export type CardDetail = PipelineCard & {
  comments: { id: number; authorId: number; body: string; createdAt: string }[];
  activity: { id: number; actorId: number; type: string; detail: string | null; createdAt: string }[];
  followers: { id: number; userId: number }[];
  fields: PipelineField[];
  values: Record<number, string>;
};
```

Add a fields hook:
```ts
export function useFields(pipelineId: number | null) {
  return useQuery({
    queryKey: [KEY, "fields", pipelineId],
    queryFn: () => api.get<PipelineField[]>(`/pipelines/${pipelineId}/fields`),
    enabled: !!pipelineId,
  });
}
```

Add to the object returned by `usePipelineMutations(pipelineId)`:
```ts
    createField: useMutation({ mutationFn: (b: any) => api.post(`/pipelines/${pipelineId}/fields`, b), onSuccess: invalidate }),
    updateField: useMutation({ mutationFn: ({ fieldId, ...b }: any) => api.patch(`/pipelines/${pipelineId}/fields/${fieldId}`, b), onSuccess: invalidate }),
    deleteField: useMutation({ mutationFn: (fieldId: number) => api.delete(`/pipelines/${pipelineId}/fields/${fieldId}`), onSuccess: invalidate }),
    reorderFields: useMutation({ mutationFn: (orderedIds: number[]) => api.post(`/pipelines/${pipelineId}/fields/reorder`, { orderedIds }), onSuccess: invalidate }),
    setCardValues: useMutation({ mutationFn: ({ cardId, values }: any) => api.put(`/pipelines/cards/${cardId}/values`, { values }), onSuccess: invalidate }),
```

- [ ] **Step 2: Typecheck** → `npm run typecheck` (0 errors).

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): client hooks for fields + card values"
```

---

## Task 7: Frontend - FieldValueInput (one editor per type)

**Files:**
- Create: `client/components/pipelines/FieldValueInput.tsx`

- [ ] **Step 1: Build the component.** It takes a `PipelineField`, the current string value, an `onChange(value: string)`, and `disabled`. It uses `decodeFieldValue`/`encodeFieldValue` semantics inline (multiselect value is a JSON-array string). Verify component props (`Combobox` is single-select: `{options:{value,label}[], value, onChange}`; `Switch`: `{checked, onCheckedChange}`).

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import type { PipelineField } from "@shared/schema";

function parseOptions(f: PipelineField): string[] {
  if (!f.options) return [];
  try { const a = JSON.parse(f.options); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}

export function FieldValueInput({ field, value, onChange, disabled }: {
  field: PipelineField; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  const opts = parseOptions(field);
  switch (field.type) {
    case "textarea":
      return <Textarea value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <Input type="number" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case "currency":
      return <Input type="number" leftIcon={<span className="text-xs">Rp</span>} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <Input type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return <Input type="tel" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case "url":
      return <Input type="url" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case "checkbox":
      return <Switch checked={value === "1"} disabled={disabled} onCheckedChange={(c) => onChange(c ? "1" : "0")} />;
    case "dropdown":
      return <Combobox options={opts.map((o) => ({ value: o, label: o }))} value={value} onChange={(v) => onChange(v ?? "")} placeholder="Pilih…" />;
    case "multiselect":
      return <MultiSelect options={opts} value={value} disabled={disabled} onChange={onChange} />;
    case "user":
      return <UserSelect value={value} disabled={disabled} onChange={onChange} />;
    case "text":
    default:
      return <Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
}

function MultiSelect({ options, value, onChange, disabled }: { options: string[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  let selected: string[] = [];
  try { const a = JSON.parse(value || "[]"); selected = Array.isArray(a) ? a.map(String) : []; } catch { selected = []; }
  const toggle = (o: string) => {
    const next = selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o];
    onChange(JSON.stringify(next));
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button type="button" key={o} disabled={disabled} onClick={() => toggle(o)}
          className={`text-xs px-2 py-1 rounded-full border ${selected.includes(o) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent"}`}>
          {o}
        </button>
      ))}
      {options.length === 0 && <span className="text-xs text-muted-foreground">Belum ada opsi</span>}
    </div>
  );
}

function UserSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { data: users } = useQuery({ queryKey: ["/api/users"], queryFn: () => api.get<any[]>("/users") });
  const opts = (users ?? []).map((u) => ({ value: String(u.id), label: u.name || u.username }));
  return <Combobox options={opts} value={value} onChange={(v) => onChange(v ?? "")} placeholder="Pilih user…" />;
}
```

> Verify `Input` supports `leftIcon` (Phase-1 used it) and `type`. If `Switch` prop is `onCheckedChange` confirm in `switch.tsx`; adapt if different.

- [ ] **Step 2: Typecheck** → `npm run typecheck` (0 errors).

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/FieldValueInput.tsx
git commit -m "feat(pipelines): FieldValueInput editor for all 11 field types"
```

---

## Task 8: Frontend - ManageFieldsDialog

**Files:**
- Create: `client/components/pipelines/ManageFieldsDialog.tsx`

- [ ] **Step 1: Build the dialog** using the design system (`Dialog`, `Button`, `Input`, `Combobox`, `Switch`, `FormField`). It lists existing fields and has an add/edit form. Type is chosen on create only (Combobox of `PIPELINE_FIELD_TYPES`); for dropdown/multiselect an options editor (comma input → array) appears. `required` + `show_on_card` are switches. Delete uses a confirm.

```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { useFields, usePipelineMutations } from "@/hooks/usePipelines";
import { PIPELINE_FIELD_TYPES } from "@shared/schema";
import { Trash2, GripVertical, Plus } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  text: "Teks", textarea: "Teks Panjang", number: "Angka", currency: "Mata Uang (Rp)",
  date: "Tanggal", dropdown: "Dropdown", multiselect: "Multi-pilih", checkbox: "Checkbox",
  user: "User", phone: "Telepon", url: "URL",
};

export function ManageFieldsDialog({ pipelineId, open, onClose }: { pipelineId: number; open: boolean; onClose: () => void }) {
  const { data: fields } = useFields(open ? pipelineId : null);
  const m = usePipelineMutations(pipelineId);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);
  const [showOnCard, setShowOnCard] = useState(false);
  const needsOptions = type === "dropdown" || type === "multiselect";

  const add = async () => {
    if (!label.trim()) return;
    const options = needsOptions ? optionsText.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    if (needsOptions && (!options || options.length === 0)) { toast.error("Isi opsi (pisahkan dengan koma)"); return; }
    await m.createField.mutateAsync({ label: label.trim(), type, options, required, showOnCard });
    toast.success("Field ditambah");
    setLabel(""); setOptionsText(""); setRequired(false); setShowOnCard(false); setType("text");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Kelola Field Kustom</DialogTitle></DialogHeader>

        <div className="space-y-2">
          {(fields ?? []).map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-lg border p-2">
              <GripVertical className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{f.label}</div>
                <div className="text-[10px] text-muted-foreground">{TYPE_LABELS[f.type] ?? f.type}{f.required ? " · wajib" : ""}{f.showOnCard ? " · di kartu" : ""}</div>
              </div>
              <Switch checked={f.showOnCard === 1} onCheckedChange={(c) => m.updateField.mutateAsync({ fieldId: f.id, showOnCard: c })} />
              <Button variant="ghost" size="icon-sm" onClick={async () => { if (confirm(`Hapus field "${f.label}"? Nilai pada semua kartu ikut terhapus.`)) { await m.deleteField.mutateAsync(f.id); } }}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          {!fields?.length && <p className="text-xs text-muted-foreground">Belum ada field.</p>}
        </div>

        <div className="border-t pt-3 space-y-3">
          <FormField label="Nama field"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="mis. Estimasi Biaya" /></FormField>
          <FormField label="Tipe"><Combobox options={PIPELINE_FIELD_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} value={type} onChange={(v) => setType(v ?? "text")} /></FormField>
          {needsOptions && <FormField label="Opsi (pisahkan dengan koma)"><Input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder="A, B, C" /></FormField>}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={required} onCheckedChange={setRequired} /> Wajib diisi</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={showOnCard} onCheckedChange={setShowOnCard} /> Tampilkan di kartu</label>
          </div>
          <Button leftIcon={<Plus className="size-4" />} onClick={add} loading={m.createField.isPending}>Tambah Field</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

> Verify exact exports of `dialog.tsx` (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`) and `form-field.tsx` (`FormField` props `label`/`children`). Adapt names to the real exports. Drag-reorder of fields can be a follow-up - the `GripVertical` is decorative for now (reorder endpoint exists; wiring DnD here is optional polish, not required for this task).

- [ ] **Step 2: Typecheck + build** → `npm run typecheck && npm run build` (0 errors).

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/ManageFieldsDialog.tsx
git commit -m "feat(pipelines): ManageFieldsDialog (design-system field admin)"
```

---

## Task 9: Frontend - drawer "Field Kustom" section + board chips + manage button

**Files:**
- Modify: `client/components/pipelines/CardDetailDrawer.tsx`
- Modify: `client/pages/PipelineBoardPage.tsx`

- [ ] **Step 1: Drawer - add a "Field Kustom" section.** The `useCard` data now includes `fields` and `values`. Render `FieldValueInput` per field (sorted by `position`), holding local edits in state, with a "Simpan Field" button that calls `setCardValues`. Show "wajib diisi" when `required` and empty.

Add imports:
```tsx
import { FieldValueInput } from "@/components/pipelines/FieldValueInput";
```
Inside the drawer body (after the comments/activity sections), when `card.fields?.length`:
```tsx
<FieldCustomSection card={card} pipelineId={pipelineId} writable={writable} />
```
And add this component at the bottom of the file:
```tsx
import { useState as _useState } from "react"; // (reuse existing useState import; do not duplicate)

function FieldCustomSection({ card, pipelineId, writable }: { card: any; pipelineId: number; writable: boolean }) {
  const m = usePipelineMutations(pipelineId);
  const [draft, setDraft] = useState<Record<number, string>>(() => ({ ...(card.values ?? {}) }));
  const fields = [...(card.fields ?? [])].sort((a: any, b: any) => a.position - b.position);
  if (fields.length === 0) return null;
  const save = async () => {
    const values = fields.map((f: any) => ({ fieldId: f.id, value: draft[f.id] ?? "" }));
    try { await m.setCardValues.mutateAsync({ cardId: card.id, values }); } catch (e: any) { /* toast handled below */ }
  };
  return (
    <section>
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">Field Kustom</h4>
      <div className="space-y-3">
        {fields.map((f: any) => {
          const v = draft[f.id] ?? "";
          const emptyRequired = f.required === 1 && (v === "" || v === "[]");
          return (
            <div key={f.id}>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-medium">{f.label}</span>
                {emptyRequired && <span className="text-[10px] text-amber-600">wajib diisi</span>}
              </div>
              <FieldValueInput field={f} value={v} disabled={!writable} onChange={(nv) => setDraft((d) => ({ ...d, [f.id]: nv }))} />
            </div>
          );
        })}
      </div>
      {writable && <Button size="sm" className="mt-2" onClick={save} loading={m.setCardValues.isPending}>Simpan Field</Button>}
    </section>
  );
}
```
> Use `toast.error` on the `setCardValues` mutation error if a server 400 (type-mismatch) occurs - wire a `toast` import if not present. `useState` is already imported at the top of the drawer file; do not re-import.

- [ ] **Step 2: Board - add a "Kelola Field" button + render chips.**

In `PipelineBoardPage.tsx`:
- import `ManageFieldsDialog` + `formatChipValue` helper (client copy - re-implement a tiny `formatChip` locally OR import from a shared util; simplest: inline a small formatter). Add a button in the sticky header (write-gated) that opens `ManageFieldsDialog`.
- `usePipeline(pid)` now returns `fields`; the cards from `usePipelineCards` now have `values: {fieldId: value}`. For each card, render chips for `pipeline.fields.filter(f => f.showOnCard)` joined with `card.values`.

Header button:
```tsx
const [showFields, setShowFields] = useState(false);
// ...in header, next to search:
{writable && <Button variant="outline" size="sm" onClick={() => setShowFields(true)}>Kelola Field</Button>}
// ...near the drawer render:
{showFields && pid != null && <ManageFieldsDialog pipelineId={pid} open={showFields} onClose={() => setShowFields(false)} />}
```
Chip rendering inside the card (after the priority line), using a small inline formatter:
```tsx
{(pipeline?.fields ?? []).filter((f: any) => f.showOnCard).map((f: any) => {
  const raw = (c as any).values?.[f.id];
  if (raw == null || raw === "") return null;
  const text = f.type === "checkbox" ? (raw === "1" ? "Ya" : "Tidak")
    : f.type === "currency" ? "Rp " + Number(raw).toLocaleString("id-ID")
    : f.type === "multiselect" ? (() => { try { return (JSON.parse(raw) as string[]).join(", "); } catch { return raw; } })()
    : String(raw);
  return <span key={f.id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground mr-1">{f.label}: {text}</span>;
})}
```

- [ ] **Step 3: Verify** → `npm run typecheck && npm run build` (0 errors, build OK).

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/CardDetailDrawer.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): custom fields in card drawer + board chips + manage button"
```

---

## Task 10: Final verification + manual checklist

**Files:** none (verification only)

- [ ] **Step 1: Server tests** → `npx tsx --test server/pipeline-field-helpers.test.ts` (all pass) and `npx tsx --test server/pipeline-helpers.test.ts` (Phase-1, still 6/6).

- [ ] **Step 2: Full typecheck + build** → `npm run typecheck && npm run build` (0 errors, build OK).

- [ ] **Step 3: Manual end-to-end on dev** (`jabnet_fiber_dev`; restart app so the startup migration creates `pipeline_fields` + `pipeline_card_values` - do NOT run db:push):
  - Open a pipeline → "Kelola Field" → add one field of EACH type (dropdown/multiselect with options); toggle `show on card` on 1-2; mark one `required`.
  - Open a card → "Field Kustom" → set values for each type → Simpan → reopen card, values persisted.
  - Board: cards show chips for show-on-card fields; required-empty shows the indicator.
  - Type-mismatch: (via curl) PUT a non-numeric value to a number field → 400 with field label + reason; UI shows toast.
  - Delete a field → its values disappear from cards.
  - Read-only user: sees field values, no editors, no "Kelola Field" button.
  - Isolation: a different mitra can't see these fields/values; guessing a fieldId/cardId returns 403/404/empty, never another mitra's data.
  - Feature gate: disable `pipelines` for a mitra → endpoints + nav denied.

- [ ] **Step 4: Whole-implementation review** - dispatch a final reviewer (subagent-driven-development final step). The reviewer MUST explicitly check: (a) every new endpoint uses `sendSuccess` (not raw `res.json`); (b) the startup CREATE TABLE block exists for both tables; (c) tenant `mitraId` filter on every field/value query; (d) cross-layer hook↔endpoint↔storage signatures match; (e) value validation can't be bypassed. Then STOP - user merges to `dev`, pushes, restarts dev app (tables auto-create), tests; prod only on explicit OK.

---

## Self-Review Notes (author)
- **Spec coverage:** tables+migration (T1), helpers (T2), field CRUD (T3), values + show-on-card (T4), endpoints + extended reads (T5), hooks (T6), all-11-types editor (T7), manage dialog (T8), drawer section + chips (T9), verification (T10). All 11 types handled in T7. Soft-required = UI warning only, never server-blocked (T5 validates type only; T9 shows warning) - matches spec.
- **Phase-1 lessons enforced:** every endpoint in T5 uses `sendSuccess`; T1 adds startup CREATE TABLE (no db:push); T5 review item (a)/(b) in T10.
- **Type consistency:** storage `createField/updateField/deleteField/reorderFields/getCardValues/setCardValues/getShowOnCardValues` ↔ routes ↔ hooks (`createField/updateField/deleteField/reorderFields/setCardValues`, `useFields`). `PipelineFieldType`/`PIPELINE_FIELD_TYPES` defined T1, consumed T8. `validateFieldValue` defined T2, consumed T5.
- **Flagged adaptation points:** exact `Dialog`/`FormField`/`Switch`/`Combobox`/`Input(leftIcon)` prop names (T7, T8, T9) - verify against the real components before finalizing. Field drag-reorder UI deferred (endpoint exists; not wired) - noted in T8, not a spec gap (spec lists reorder among methods; UI reorder is polish).
