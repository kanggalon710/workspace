# Generic Pipelines Engine (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, tenant-isolated `/pipelines` module letting each mitra create Kanban pipelines (stages + cards with comments, activity log, and followers), fully separate from the existing hardcoded `/leads` and `/collections`.

**Architecture:** Six new `pipeline_*` MySQL tables (Drizzle), all `mitra_id`-scoped via the existing `tenantContext`/`getMitraId()` machinery. New storage methods on the existing `DatabaseStorage` class. New REST endpoints in `server/routes.ts` guarded by a new `pipelines` permission key + feature flag. React frontend (list page + Kanban board + card drawer) using native HTML5 drag-and-drop (same approach as `LeadPipelinePage`), TanStack Query, and the existing design system.

**Tech Stack:** Node 20 · Express 5 · Drizzle ORM (MySQL) · React 18 · TypeScript · Vite · TanStack Query 5 · Wouter · Tailwind/shadcn. Tests via `node:test` (`npx tsx --test`).

**Spec:** `docs/superpowers/specs/2026-06-04-generic-pipelines-engine-design.md`

**Reference patterns to copy:**
- Tenant-scoped storage CRUD + MySQL insert/reselect: `server/storage.ts:1611-1633` (`createCollectionStage`).
- Permission helpers: `server/routes.ts:221-249` (`hasPermission`/`requireWritePermission`).
- Permission key list + feature gating: `shared/schema.ts:1121-1204`.
- Native DnD Kanban: `client/pages/LeadPipelinePage.tsx` (`draggable`, `onDragStart`, `onDragOver`, `onDrop`).
- API client: `client/lib/api.ts:45-57` (`api.get/post/patch/delete`).

**Rule (from spec):** All DB changes apply to **`jabnet_fiber_dev`** first (Drizzle `db:push`), verified on `workspace-dev.jabnet.id`, before any prod promotion. Tables are additive - no ALTER on existing tables.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `shared/schema.ts` | 6 `pipeline_*` table defs + types; `pipelines` permission key, feature, FEATURE_PERMISSIONS entry | Modify |
| `server/pipeline-helpers.ts` | Pure functions: position reordering, move recompute, stage-delete guard | Create |
| `server/pipeline-helpers.test.ts` | Unit tests for the above | Create |
| `server/storage.ts` | All pipeline DB methods (pipelines/stages/cards/comments/activity/followers) | Modify |
| `server/routes.ts` | REST endpoints + notification wiring on card events | Modify |
| `client/lib/api.ts` | (no change - generic `api` client reused) | - |
| `client/hooks/usePipelines.ts` | TanStack Query hooks + mutations | Create |
| `client/pages/PipelinesPage.tsx` | `/pipelines` list page (grid, create/edit/archive) | Create |
| `client/pages/PipelineBoardPage.tsx` | `/pipelines/:id` Kanban board + stage mgmt + DnD | Create |
| `client/components/pipelines/CardDetailDrawer.tsx` | Card drawer: fields, comments, activity, followers | Create |
| `client/App.tsx` | Lazy routes for the two pages | Modify |
| `client/components/layout/Sidebar.tsx` | Nav entry | Modify |
| `client/components/layout/BottomNav.tsx` | Mobile nav entry (if applicable) | Modify |
| `client/components/CommandPalette*.tsx` | Command palette entry | Modify |

---

## Task 1: Schema - tables, types, permission key, feature flag

**Files:**
- Modify: `shared/schema.ts` (add tables near `collectionStages` ~line 444; add permission/feature entries ~lines 1121-1204)

- [ ] **Step 1: Add the six table definitions**

Add after the `collectionStages` block (~line 444). Use the same import style already present (`mysqlTable`, `int`, `varchar`, `text` are already imported):

```ts
// ===== Generic Pipelines Engine (Phase 1) - separate from leads/collections =====
export const pipelines = mysqlTable("pipelines", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).notNull().default("#0EA5E9"),
  icon: varchar("icon", { length: 64 }),
  position: int("position").notNull().default(0),
  isArchived: int("is_archived").notNull().default(0),
  createdBy: int("created_by").notNull(),
  updatedBy: int("updated_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const pipelineStages = mysqlTable("pipeline_stages", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  color: varchar("color", { length: 16 }).notNull().default("#6B7280"),
  position: int("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const pipelineCards = mysqlTable("pipeline_cards", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  stageId: int("stage_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assigneeId: int("assignee_id"),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  dueDate: text("due_date"),
  tags: text("tags"), // JSON array of strings
  position: int("position").notNull().default(0),
  createdBy: int("created_by").notNull(),
  updatedBy: int("updated_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const pipelineCardComments = mysqlTable("pipeline_card_comments", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  authorId: int("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});

export const pipelineCardActivity = mysqlTable("pipeline_card_activity", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  actorId: int("actor_id").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  detail: text("detail"), // JSON
  createdAt: text("created_at").notNull(),
});

export const pipelineCardFollowers = mysqlTable("pipeline_card_followers", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  userId: int("user_id").notNull(),
  createdAt: text("created_at").notNull(),
});
```

- [ ] **Step 2: Add inferred types**

Add right after the table block:

```ts
export type Pipeline = typeof pipelines.$inferSelect;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type PipelineCard = typeof pipelineCards.$inferSelect;
export type PipelineCardComment = typeof pipelineCardComments.$inferSelect;
export type PipelineCardActivity = typeof pipelineCardActivity.$inferSelect;
export type PipelineCardFollower = typeof pipelineCardFollowers.$inferSelect;
export type PipelineCardPriority = "low" | "medium" | "high" | "urgent";
```

- [ ] **Step 3: Register the permission key**

In `ALL_PERMISSIONS` (~line 1168, before the `mitra_admin` owner entry), add:

```ts
  { key: "pipelines", label: "Pipelines (Kanban)", group: "Tools" },
```

- [ ] **Step 4: Register the feature flag + mapping**

In `ALL_FEATURES` (~line 1185) add:

```ts
  { key: "pipelines", label: "Pipelines (Kanban)" },
```

In `FEATURE_PERMISSIONS` (~line 1203) add:

```ts
  pipelines: ["pipelines"],
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors). The new exports compile.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(pipelines): schema, types, permission key + feature flag"
```

---

## Task 2: Pure helper module + tests (position math + delete guard)

**Files:**
- Create: `server/pipeline-helpers.ts`
- Create: `server/pipeline-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/pipeline-helpers.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reorderPositions,
  computeInsertPosition,
  canDeleteStage,
} from "./pipeline-helpers.js";

test("reorderPositions returns contiguous 0-based positions in given order", () => {
  assert.deepEqual(reorderPositions([30, 10, 20]), [
    { id: 30, position: 0 },
    { id: 10, position: 1 },
    { id: 20, position: 2 },
  ]);
});

test("reorderPositions handles empty list", () => {
  assert.deepEqual(reorderPositions([]), []);
});

test("computeInsertPosition appends to end when toPosition is undefined", () => {
  // existing positions in destination: [0,1,2] -> append at 3
  assert.equal(computeInsertPosition(3, undefined), 3);
});

test("computeInsertPosition clamps to [0, count]", () => {
  assert.equal(computeInsertPosition(3, -5), 0);
  assert.equal(computeInsertPosition(3, 99), 3);
  assert.equal(computeInsertPosition(3, 1), 1);
});

test("canDeleteStage is false when stage holds cards", () => {
  assert.equal(canDeleteStage(2), false);
});

test("canDeleteStage is true when stage is empty", () => {
  assert.equal(canDeleteStage(0), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test server/pipeline-helpers.test.ts`
Expected: FAIL - `Cannot find module './pipeline-helpers.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/pipeline-helpers.ts`:

```ts
/** Pure helpers for the pipelines engine - no DB, fully unit-testable. */

/** Given an ordered list of ids, assign contiguous 0-based positions. */
export function reorderPositions(orderedIds: number[]): Array<{ id: number; position: number }> {
  return orderedIds.map((id, index) => ({ id, position: index }));
}

/**
 * Where to insert a card in a destination stage.
 * @param destCount how many cards currently in the destination stage (excluding the moved card)
 * @param toPosition requested index, or undefined to append
 */
export function computeInsertPosition(destCount: number, toPosition: number | undefined): number {
  if (toPosition === undefined || Number.isNaN(toPosition)) return destCount;
  return Math.max(0, Math.min(destCount, Math.floor(toPosition)));
}

/** A stage may only be deleted when it holds no cards. */
export function canDeleteStage(cardCount: number): boolean {
  return cardCount === 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test server/pipeline-helpers.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-helpers.ts server/pipeline-helpers.test.ts
git commit -m "feat(pipelines): pure position/guard helpers with tests"
```

---

## Task 3: Storage - pipelines CRUD

**Files:**
- Modify: `server/storage.ts` - add imports + a new `// ===== Pipelines =====` section (place near the collection-stage methods, ~line 1660)

- [ ] **Step 1: Extend the schema imports in storage.ts**

Find the big schema import block (top of `server/storage.ts`, near line 71 where `collectionStages` is imported) and add the new tables/types to it:

```ts
  pipelines, pipelineStages, pipelineCards,
  pipelineCardComments, pipelineCardActivity, pipelineCardFollowers,
  type Pipeline, type PipelineStage, type PipelineCard,
  type PipelineCardComment, type PipelineCardActivity, type PipelineCardFollower,
```

- [ ] **Step 2: Add the pipelines CRUD methods**

Add a new section in the `DatabaseStorage` class (after the collection-stage methods, ~line 1660). `getMitraId`, `eq`, `and`, `asc`, `inArray`, `sql` are already imported/in scope:

```ts
  // ============================================================
  // ===== Pipelines Engine (Phase 1) - tenant-scoped =====
  // ============================================================

  async listPipelines(includeArchived = false): Promise<Pipeline[]> {
    const mitraId = getMitraId();
    const where = includeArchived
      ? eq(pipelines.mitraId, mitraId)
      : and(eq(pipelines.mitraId, mitraId), eq(pipelines.isArchived, 0));
    return this.db.select().from(pipelines).where(where)
      .orderBy(asc(pipelines.position), asc(pipelines.id));
  }

  async getPipeline(id: number): Promise<Pipeline | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelines)
      .where(and(eq(pipelines.id, id), eq(pipelines.mitraId, mitraId)));
    return row;
  }

  async createPipeline(data: { name: string; description?: string; color?: string; icon?: string; }, userId: number): Promise<Pipeline> {
    const mitraId = getMitraId();
    const existing = await this.listPipelines(true);
    const maxPos = existing.reduce((m, p) => Math.max(m, p.position), -1);
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelines).values({
      mitraId, name: data.name, description: data.description ?? null,
      color: data.color ?? "#0EA5E9", icon: data.icon ?? null,
      position: maxPos + 1, isArchived: 0, createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelines).where(eq(pipelines.id, insertId));
    return row!;
  }

  async updatePipeline(id: number, data: { name?: string; description?: string; color?: string; icon?: string; }, userId: number): Promise<Pipeline> {
    const mitraId = getMitraId();
    const [target] = await this.db.select().from(pipelines)
      .where(and(eq(pipelines.id, id), eq(pipelines.mitraId, mitraId)));
    if (!target) throw new Error("Pipeline tidak ditemukan");
    const patch: any = { updatedAt: new Date().toISOString(), updatedBy: userId };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.color !== undefined) patch.color = data.color;
    if (data.icon !== undefined) patch.icon = data.icon;
    await this.db.update(pipelines).set(patch)
      .where(and(eq(pipelines.id, id), eq(pipelines.mitraId, mitraId)));
    const [row] = await this.db.select().from(pipelines).where(eq(pipelines.id, id));
    return row!;
  }

  async archivePipeline(id: number, userId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(pipelines)
      .set({ isArchived: 1, updatedAt: new Date().toISOString(), updatedBy: userId })
      .where(and(eq(pipelines.id, id), eq(pipelines.mitraId, mitraId)));
  }

  async reorderPipelines(orderedIds: number[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.update(pipelines).set({ position: i, updatedAt: now })
        .where(and(eq(pipelines.id, orderedIds[i]), eq(pipelines.mitraId, mitraId)));
    }
  }
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors).

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage CRUD for pipelines"
```

---

## Task 4: Storage - stages CRUD + reorder + card-count

**Files:**
- Modify: `server/storage.ts` (append to the pipelines section)

- [ ] **Step 1: Add stage methods**

Append in the pipelines section:

```ts
  async listStages(pipelineId: number): Promise<PipelineStage[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineStages)
      .where(and(eq(pipelineStages.mitraId, mitraId), eq(pipelineStages.pipelineId, pipelineId)))
      .orderBy(asc(pipelineStages.position), asc(pipelineStages.id));
  }

  async createStage(pipelineId: number, data: { label: string; color?: string }): Promise<PipelineStage> {
    const mitraId = getMitraId();
    const existing = await this.listStages(pipelineId);
    const maxPos = existing.reduce((m, s) => Math.max(m, s.position), -1);
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineStages).values({
      mitraId, pipelineId, label: data.label, color: data.color ?? "#6B7280",
      position: maxPos + 1, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineStages).where(eq(pipelineStages.id, insertId));
    return row!;
  }

  async updateStage(id: number, data: { label?: string; color?: string }): Promise<PipelineStage> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.label !== undefined) patch.label = data.label;
    if (data.color !== undefined) patch.color = data.color;
    await this.db.update(pipelineStages).set(patch)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.mitraId, mitraId)));
    const [row] = await this.db.select().from(pipelineStages)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.mitraId, mitraId)));
    if (!row) throw new Error("Stage tidak ditemukan");
    return row;
  }

  async countCardsInStage(stageId: number): Promise<number> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.stageId, stageId)));
    return rows.length;
  }

  /** Throws if the stage still holds cards (guarded delete). */
  async deleteStage(id: number): Promise<void> {
    const mitraId = getMitraId();
    const count = await this.countCardsInStage(id);
    if (count > 0) throw new Error("Stage masih berisi kartu - pindahkan atau hapus kartu dulu");
    await this.db.delete(pipelineStages)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.mitraId, mitraId)));
  }

  async reorderStages(pipelineId: number, orderedIds: number[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.update(pipelineStages).set({ position: i, updatedAt: now })
        .where(and(eq(pipelineStages.id, orderedIds[i]), eq(pipelineStages.mitraId, mitraId), eq(pipelineStages.pipelineId, pipelineId)));
    }
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage CRUD for stages + guarded delete"
```

---

## Task 5: Storage - cards CRUD + move + activity logging

**Files:**
- Modify: `server/storage.ts` (append to the pipelines section)

- [ ] **Step 1: Add the internal activity logger + card methods**

`computeInsertPosition` from the helper is used in `moveCard`. Add the import at the top of storage.ts:

```ts
import { computeInsertPosition } from "./pipeline-helpers.js";
```

Then append:

```ts
  private async logCardActivity(cardId: number, actorId: number, type: string, detail?: unknown): Promise<void> {
    const mitraId = getMitraId();
    await this.db.insert(pipelineCardActivity).values({
      mitraId, cardId, actorId, type,
      detail: detail === undefined ? null : JSON.stringify(detail),
      createdAt: new Date().toISOString(),
    } as any);
  }

  async listCards(pipelineId: number, opts?: { q?: string; assigneeId?: number }): Promise<PipelineCard[]> {
    const mitraId = getMitraId();
    let rows = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.pipelineId, pipelineId)))
      .orderBy(asc(pipelineCards.stageId), asc(pipelineCards.position), asc(pipelineCards.id));
    if (opts?.q) {
      const q = opts.q.toLowerCase();
      rows = rows.filter((c) => c.title.toLowerCase().includes(q));
    }
    if (opts?.assigneeId) rows = rows.filter((c) => c.assigneeId === opts.assigneeId);
    return rows;
  }

  async getCard(id: number): Promise<PipelineCard | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.id, id), eq(pipelineCards.mitraId, mitraId)));
    return row;
  }

  async createCard(pipelineId: number, data: { stageId: number; title: string; description?: string; assigneeId?: number | null; priority?: string; dueDate?: string | null; tags?: string[] | null; }, userId: number): Promise<PipelineCard> {
    const mitraId = getMitraId();
    const siblings = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.stageId, data.stageId)));
    const maxPos = siblings.reduce((m, c) => Math.max(m, c.position), -1);
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineCards).values({
      mitraId, pipelineId, stageId: data.stageId, title: data.title,
      description: data.description ?? null, assigneeId: data.assigneeId ?? null,
      priority: data.priority ?? "medium", dueDate: data.dueDate ?? null,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      position: maxPos + 1, createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    await this.logCardActivity(insertId, userId, "created");
    const [row] = await this.db.select().from(pipelineCards).where(eq(pipelineCards.id, insertId));
    return row!;
  }

  async updateCard(id: number, data: { title?: string; description?: string; assigneeId?: number | null; priority?: string; dueDate?: string | null; tags?: string[] | null; }, userId: number): Promise<PipelineCard> {
    const mitraId = getMitraId();
    const before = await this.getCard(id);
    if (!before) throw new Error("Kartu tidak ditemukan");
    const patch: any = { updatedAt: new Date().toISOString(), updatedBy: userId };
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.dueDate !== undefined) patch.dueDate = data.dueDate;
    if (data.tags !== undefined) patch.tags = data.tags ? JSON.stringify(data.tags) : null;
    await this.db.update(pipelineCards).set(patch)
      .where(and(eq(pipelineCards.id, id), eq(pipelineCards.mitraId, mitraId)));
    if (data.assigneeId !== undefined && data.assigneeId !== before.assigneeId) {
      await this.logCardActivity(id, userId, "reassigned", { old: before.assigneeId, new: data.assigneeId });
    } else {
      await this.logCardActivity(id, userId, "edited");
    }
    const [row] = await this.db.select().from(pipelineCards).where(eq(pipelineCards.id, id));
    return row!;
  }

  async moveCard(id: number, toStageId: number, toPosition: number | undefined, userId: number): Promise<PipelineCard> {
    const mitraId = getMitraId();
    const before = await this.getCard(id);
    if (!before) throw new Error("Kartu tidak ditemukan");
    // Destination siblings excluding the moved card.
    const dest = (await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.stageId, toStageId))))
      .filter((c) => c.id !== id)
      .sort((a, b) => a.position - b.position);
    const insertAt = computeInsertPosition(dest.length, toPosition);
    const reordered = [...dest.slice(0, insertAt), { id }, ...dest.slice(insertAt)];
    const now = new Date().toISOString();
    for (let i = 0; i < reordered.length; i++) {
      await this.db.update(pipelineCards)
        .set({ position: i, stageId: toStageId, updatedAt: now, updatedBy: userId })
        .where(and(eq(pipelineCards.id, reordered[i].id), eq(pipelineCards.mitraId, mitraId)));
    }
    if (before.stageId !== toStageId) {
      await this.logCardActivity(id, userId, "moved", { fromStage: before.stageId, toStage: toStageId });
    }
    const [row] = await this.db.select().from(pipelineCards).where(eq(pipelineCards.id, id));
    return row!;
  }

  async deleteCard(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineCardComments).where(and(eq(pipelineCardComments.cardId, id), eq(pipelineCardComments.mitraId, mitraId)));
    await this.db.delete(pipelineCardActivity).where(and(eq(pipelineCardActivity.cardId, id), eq(pipelineCardActivity.mitraId, mitraId)));
    await this.db.delete(pipelineCardFollowers).where(and(eq(pipelineCardFollowers.cardId, id), eq(pipelineCardFollowers.mitraId, mitraId)));
    await this.db.delete(pipelineCards).where(and(eq(pipelineCards.id, id), eq(pipelineCards.mitraId, mitraId)));
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage cards CRUD, move with reorder, activity log"
```

---

## Task 6: Storage - comments, followers, activity reads

**Files:**
- Modify: `server/storage.ts` (append to the pipelines section)

- [ ] **Step 1: Add comments/followers/activity methods**

```ts
  async listComments(cardId: number): Promise<PipelineCardComment[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCardComments)
      .where(and(eq(pipelineCardComments.mitraId, mitraId), eq(pipelineCardComments.cardId, cardId)))
      .orderBy(asc(pipelineCardComments.createdAt), asc(pipelineCardComments.id));
  }

  async addComment(cardId: number, authorId: number, body: string): Promise<PipelineCardComment> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineCardComments).values({
      mitraId, cardId, authorId, body, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    await this.logCardActivity(cardId, authorId, "commented");
    const [row] = await this.db.select().from(pipelineCardComments).where(eq(pipelineCardComments.id, insertId));
    return row!;
  }

  async deleteComment(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineCardComments)
      .where(and(eq(pipelineCardComments.id, id), eq(pipelineCardComments.mitraId, mitraId)));
  }

  async listActivity(cardId: number): Promise<PipelineCardActivity[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCardActivity)
      .where(and(eq(pipelineCardActivity.mitraId, mitraId), eq(pipelineCardActivity.cardId, cardId)))
      .orderBy(asc(pipelineCardActivity.createdAt), asc(pipelineCardActivity.id));
  }

  async listFollowers(cardId: number): Promise<PipelineCardFollower[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCardFollowers)
      .where(and(eq(pipelineCardFollowers.mitraId, mitraId), eq(pipelineCardFollowers.cardId, cardId)));
  }

  async addFollower(cardId: number, userId: number, actorId: number): Promise<void> {
    const mitraId = getMitraId();
    const existing = await this.db.select().from(pipelineCardFollowers)
      .where(and(eq(pipelineCardFollowers.mitraId, mitraId), eq(pipelineCardFollowers.cardId, cardId), eq(pipelineCardFollowers.userId, userId)));
    if (existing.length > 0) return; // idempotent (enforces unique card+user)
    await this.db.insert(pipelineCardFollowers).values({
      mitraId, cardId, userId, createdAt: new Date().toISOString(),
    } as any);
    await this.logCardActivity(cardId, actorId, "follower_added", { userId });
  }

  async removeFollower(cardId: number, userId: number, actorId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineCardFollowers)
      .where(and(eq(pipelineCardFollowers.mitraId, mitraId), eq(pipelineCardFollowers.cardId, cardId), eq(pipelineCardFollowers.userId, userId)));
    await this.logCardActivity(cardId, actorId, "follower_removed", { userId });
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage comments, followers, activity reads"
```

---

## Task 7: Routes - pipelines + stages endpoints

**Files:**
- Modify: `server/routes.ts` (add a new endpoint section; reuse `requirePermission`/`requireWritePermission` from lines 221-249)

- [ ] **Step 1: Add pipeline + stage endpoints**

Place in the main router section (alongside other `/api/...` route registrations). `storage`, `requirePermission`, `requireWritePermission`, `sendError` are in scope:

```ts
  // ===== Pipelines Engine (Phase 1) =====
  app.get("/api/pipelines", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const includeArchived = req.query.archived === "1";
    res.json(await storage.listPipelines(includeArchived));
  });

  app.post("/api/pipelines", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { name, description, color, icon } = req.body ?? {};
    if (!name || typeof name !== "string") return sendError(res, "Nama pipeline wajib diisi", 400);
    res.json(await storage.createPipeline({ name, description, color, icon }, req.authUser!.id));
  });

  app.get("/api/pipelines/:id", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const pipeline = await storage.getPipeline(Number(req.params.id));
    if (!pipeline) return sendError(res, "Pipeline tidak ditemukan", 404);
    const stages = await storage.listStages(pipeline.id);
    res.json({ ...pipeline, stages });
  });

  app.patch("/api/pipelines/:id", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { name, description, color, icon } = req.body ?? {};
    res.json(await storage.updatePipeline(Number(req.params.id), { name, description, color, icon }, req.authUser!.id));
  });

  app.post("/api/pipelines/:id/archive", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    await storage.archivePipeline(Number(req.params.id), req.authUser!.id);
    res.json({ ok: true });
  });

  app.post("/api/pipelines/reorder", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { orderedIds } = req.body ?? {};
    if (!Array.isArray(orderedIds)) return sendError(res, "orderedIds wajib array", 400);
    await storage.reorderPipelines(orderedIds.map(Number));
    res.json({ ok: true });
  });

  app.get("/api/pipelines/:id/stages", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    res.json(await storage.listStages(Number(req.params.id)));
  });

  app.post("/api/pipelines/:id/stages", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { label, color } = req.body ?? {};
    if (!label) return sendError(res, "Label stage wajib diisi", 400);
    res.json(await storage.createStage(Number(req.params.id), { label, color }));
  });

  app.patch("/api/pipelines/:id/stages/:stageId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { label, color } = req.body ?? {};
    res.json(await storage.updateStage(Number(req.params.stageId), { label, color }));
  });

  app.delete("/api/pipelines/:id/stages/:stageId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    try {
      await storage.deleteStage(Number(req.params.stageId));
      res.json({ ok: true });
    } catch (e: any) {
      return sendError(res, e.message ?? "Gagal hapus stage", 409);
    }
  });

  app.post("/api/pipelines/:id/stages/reorder", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { orderedIds } = req.body ?? {};
    if (!Array.isArray(orderedIds)) return sendError(res, "orderedIds wajib array", 400);
    await storage.reorderStages(Number(req.params.id), orderedIds.map(Number));
    res.json({ ok: true });
  });
```

> **Note on route ordering:** register `/api/pipelines/reorder` BEFORE `/api/pipelines/:id` is matched for POST - they don't collide (different methods/paths), but keep `/reorder` and `/cards/...` literal segments mindful of Express param matching. Card routes (Task 8) use `/api/pipelines/cards/...` which must be registered so `cards` is not captured as `:id` on GET `/api/pipelines/:id`. Express matches in registration order - register the literal `cards` routes BEFORE `/api/pipelines/:id` GET, OR (cleaner) keep card routes on distinct paths as written (`/api/pipelines/cards/:cardId`) and register them before the `/api/pipelines/:id` GET handler. **Action: register Task 8 card routes immediately above the `GET /api/pipelines/:id` handler.**

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): REST endpoints for pipelines + stages"
```

---

## Task 8: Routes - cards + comments + followers (with notifications)

**Files:**
- Modify: `server/routes.ts` (register these card routes immediately ABOVE `GET /api/pipelines/:id`, per the route-ordering note in Task 7)

- [ ] **Step 1: Find the existing notification helper**

Run: `grep -n "createNotification\|notifyUser\|async function notify\|insertNotification" server/storage.ts server/routes.ts | head`
Expected: a method like `storage.createNotification({ userId, type, title, body, ... })`. Use the exact signature you find. If the helper takes a `mitraId`, pass `req.authUser!.activeMitraId`. (Below assumes `storage.createNotification({ userId, type, title, message })` - adapt to the real signature.)

- [ ] **Step 2: Add card/comment/follower endpoints + notification fan-out**

```ts
  // --- helper: notify assignee + followers (except actor) ---
  async function notifyCardWatchers(cardId: number, actorId: number, title: string, message: string) {
    const card = await storage.getCard(cardId);
    if (!card) return;
    const followers = await storage.listFollowers(cardId);
    const targets = new Set<number>();
    if (card.assigneeId) targets.add(card.assigneeId);
    for (const f of followers) targets.add(f.userId);
    targets.delete(actorId);
    for (const uid of targets) {
      await storage.createNotification({ userId: uid, type: "pipeline_card", title, message });
    }
  }

  app.get("/api/pipelines/:id/cards", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const assigneeId = req.query.assignee ? Number(req.query.assignee) : undefined;
    res.json(await storage.listCards(Number(req.params.id), { q, assigneeId }));
  });

  app.post("/api/pipelines/:id/cards", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { stageId, title, description, assigneeId, priority, dueDate, tags } = req.body ?? {};
    if (!stageId || !title) return sendError(res, "stageId & title wajib diisi", 400);
    const card = await storage.createCard(Number(req.params.id), { stageId: Number(stageId), title, description, assigneeId, priority, dueDate, tags }, req.authUser!.id);
    await notifyCardWatchers(card.id, req.authUser!.id, "Kartu baru ditugaskan", `Kartu "${card.title}" dibuat`);
    res.json(card);
  });

  app.get("/api/pipelines/cards/:cardId", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const card = await storage.getCard(Number(req.params.cardId));
    if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
    const [comments, activity, followers] = await Promise.all([
      storage.listComments(card.id), storage.listActivity(card.id), storage.listFollowers(card.id),
    ]);
    res.json({ ...card, comments, activity, followers });
  });

  app.patch("/api/pipelines/cards/:cardId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const card = await storage.updateCard(Number(req.params.cardId), req.body ?? {}, req.authUser!.id);
    await notifyCardWatchers(card.id, req.authUser!.id, "Kartu diperbarui", `Kartu "${card.title}" diperbarui`);
    res.json(card);
  });

  app.post("/api/pipelines/cards/:cardId/move", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { toStageId, toPosition } = req.body ?? {};
    if (!toStageId) return sendError(res, "toStageId wajib diisi", 400);
    const card = await storage.moveCard(Number(req.params.cardId), Number(toStageId), toPosition === undefined ? undefined : Number(toPosition), req.authUser!.id);
    await notifyCardWatchers(card.id, req.authUser!.id, "Kartu dipindahkan", `Kartu "${card.title}" dipindahkan`);
    res.json(card);
  });

  app.delete("/api/pipelines/cards/:cardId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    await storage.deleteCard(Number(req.params.cardId));
    res.json({ ok: true });
  });

  app.get("/api/pipelines/cards/:cardId/comments", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    res.json(await storage.listComments(Number(req.params.cardId)));
  });

  app.post("/api/pipelines/cards/:cardId/comments", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { body } = req.body ?? {};
    if (!body) return sendError(res, "Komentar kosong", 400);
    const comment = await storage.addComment(Number(req.params.cardId), req.authUser!.id, body);
    await notifyCardWatchers(Number(req.params.cardId), req.authUser!.id, "Komentar baru", body.slice(0, 80));
    res.json(comment);
  });

  app.delete("/api/pipelines/cards/comments/:id", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    await storage.deleteComment(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/pipelines/cards/:cardId/followers", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    res.json(await storage.listFollowers(Number(req.params.cardId)));
  });

  app.post("/api/pipelines/cards/:cardId/followers", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { userId } = req.body ?? {};
    if (!userId) return sendError(res, "userId wajib diisi", 400);
    await storage.addFollower(Number(req.params.cardId), Number(userId), req.authUser!.id);
    res.json({ ok: true });
  });

  app.delete("/api/pipelines/cards/:cardId/followers/:userId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    await storage.removeFollower(Number(req.params.cardId), Number(req.params.userId), req.authUser!.id);
    res.json({ ok: true });
  });
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test of the API on dev**

Apply schema to dev DB first: `npm run db:push` (targets `jabnet_fiber_dev` via dev env). Then `npm run dev`, log in, and exercise:

```bash
# replace TOKEN with the logged-in staff token
curl -s -X POST localhost:5000/api/pipelines -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d '{"name":"Instalasi"}'
curl -s localhost:5000/api/pipelines -H "Authorization: Bearer TOKEN"
```
Expected: create returns a pipeline with `id`; list returns it.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): REST endpoints for cards, comments, followers + notifications"
```

---

## Task 9: Frontend - data hooks

**Files:**
- Create: `client/hooks/usePipelines.ts`

- [ ] **Step 1: Write the hooks**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Pipeline, PipelineStage, PipelineCard } from "@shared/schema";

export type PipelineWithStages = Pipeline & { stages: PipelineStage[] };
export type CardDetail = PipelineCard & {
  comments: { id: number; authorId: number; body: string; createdAt: string }[];
  activity: { id: number; actorId: number; type: string; detail: string | null; createdAt: string }[];
  followers: { id: number; userId: number }[];
};

const KEY = "pipelines";

export function usePipelines(includeArchived = false) {
  return useQuery({
    queryKey: [KEY, "list", includeArchived],
    queryFn: () => api.get<Pipeline[]>(`/pipelines${includeArchived ? "?archived=1" : ""}`),
  });
}

export function usePipeline(id: number | null) {
  return useQuery({
    queryKey: [KEY, "one", id],
    queryFn: () => api.get<PipelineWithStages>(`/pipelines/${id}`),
    enabled: !!id,
  });
}

export function usePipelineCards(id: number | null) {
  return useQuery({
    queryKey: [KEY, "cards", id],
    queryFn: () => api.get<PipelineCard[]>(`/pipelines/${id}/cards`),
    enabled: !!id,
  });
}

export function useCard(cardId: number | null) {
  return useQuery({
    queryKey: [KEY, "card", cardId],
    queryFn: () => api.get<CardDetail>(`/pipelines/cards/${cardId}`),
    enabled: !!cardId,
  });
}

export function usePipelineMutations(pipelineId?: number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [KEY] });
  };
  return {
    createPipeline: useMutation({ mutationFn: (b: any) => api.post("/pipelines", b), onSuccess: invalidate }),
    updatePipeline: useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/pipelines/${id}`, b), onSuccess: invalidate }),
    archivePipeline: useMutation({ mutationFn: (id: number) => api.post(`/pipelines/${id}/archive`, {}), onSuccess: invalidate }),
    createStage: useMutation({ mutationFn: (b: any) => api.post(`/pipelines/${pipelineId}/stages`, b), onSuccess: invalidate }),
    updateStage: useMutation({ mutationFn: ({ stageId, ...b }: any) => api.patch(`/pipelines/${pipelineId}/stages/${stageId}`, b), onSuccess: invalidate }),
    deleteStage: useMutation({ mutationFn: (stageId: number) => api.delete(`/pipelines/${pipelineId}/stages/${stageId}`), onSuccess: invalidate }),
    createCard: useMutation({ mutationFn: (b: any) => api.post(`/pipelines/${pipelineId}/cards`, b), onSuccess: invalidate }),
    updateCard: useMutation({ mutationFn: ({ cardId, ...b }: any) => api.patch(`/pipelines/cards/${cardId}`, b), onSuccess: invalidate }),
    moveCard: useMutation({ mutationFn: ({ cardId, toStageId, toPosition }: any) => api.post(`/pipelines/cards/${cardId}/move`, { toStageId, toPosition }), onSuccess: invalidate }),
    deleteCard: useMutation({ mutationFn: (cardId: number) => api.delete(`/pipelines/cards/${cardId}`), onSuccess: invalidate }),
    addComment: useMutation({ mutationFn: ({ cardId, body }: any) => api.post(`/pipelines/cards/${cardId}/comments`, { body }), onSuccess: invalidate }),
    addFollower: useMutation({ mutationFn: ({ cardId, userId }: any) => api.post(`/pipelines/cards/${cardId}/followers`, { userId }), onSuccess: invalidate }),
    removeFollower: useMutation({ mutationFn: ({ cardId, userId }: any) => api.delete(`/pipelines/cards/${cardId}/followers/${userId}`), onSuccess: invalidate }),
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (Confirm `@shared/schema` alias resolves - it's used elsewhere in client.)

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): client data hooks"
```

---

## Task 10: Frontend - Pipelines list page

**Files:**
- Create: `client/pages/PipelinesPage.tsx`
- Modify: `client/App.tsx` (lazy route `/pipelines`)

- [ ] **Step 1: Build the list page**

Use existing design-system components (`PageHeader`, `PageContainer`, `Card`, `Button`, `EmptyState`, `Input`, skeletons). Reference an existing page (e.g. `client/pages/RolesPage.tsx`) for exact import paths. Concrete skeleton:

```tsx
import { useState } from "react";
import { useLocation } from "wouter";
import { usePipelines, usePipelineMutations } from "@/hooks/usePipelines";
import { PageHeader, PageContainer } from "@/components/ui/page"; // adjust to real exports
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/context/AuthContext";
import { Layers, Plus } from "lucide-react";
import { toast } from "sonner";

export default function PipelinesPage() {
  const [, navigate] = useLocation();
  const { canWrite } = useAuth();
  const { data: pipelines, isLoading } = usePipelines();
  const { createPipeline } = usePipelineMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const writable = canWrite("pipelines");

  const onCreate = async () => {
    if (!name.trim()) return;
    const p: any = await createPipeline.mutateAsync({ name: name.trim() });
    toast.success("Pipeline dibuat");
    setShowCreate(false); setName("");
    navigate(`/pipelines/${p.id}`);
  };

  return (
    <PageContainer>
      <PageHeader icon={Layers} title="Pipelines" description="Kanban board kustom per mitra"
        accent="primary"
        actions={writable && <Button leftIcon={<Plus className="size-4" />} onClick={() => setShowCreate(true)}>Pipeline Baru</Button>} />
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[0,1,2].map(i => <Card key={i} className="h-28 animate-pulse" />)}</div>
      ) : !pipelines?.length ? (
        <EmptyState icon={Layers} title="Belum ada pipeline" description="Buat pipeline pertama untuk mulai." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pipelines.map((p) => (
            <Card key={p.id} className="p-4 cursor-pointer hover:shadow-elev-md transition" onClick={() => navigate(`/pipelines/${p.id}`)}>
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-semibold">{p.name}</span>
              </div>
              {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
            </Card>
          ))}
        </div>
      )}
      {/* Create dialog: minimal - name input + buttons. Use existing Dialog component. */}
      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onClick={() => setShowCreate(false)}>
          <Card className="p-4 w-[min(28rem,calc(100vw-2rem))]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Pipeline Baru</h3>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama pipeline" autoFocus />
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Batal</Button>
              <Button onClick={onCreate} loading={createPipeline.isPending}>Buat</Button>
            </div>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
```

> Note: confirm exact component import paths and `PageHeader` prop names against an existing page before finalizing; the design system is documented in CLAUDE.md.

- [ ] **Step 2: Register the route**

In `client/App.tsx`, follow the existing lazy-route pattern (e.g. how `LeadPipelinePage` is registered):

```tsx
const PipelinesPage = lazy(() => import("@/pages/PipelinesPage"));
// ...inside the router:
<Route path="/pipelines" component={PipelinesPage} />
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/pages/PipelinesPage.tsx client/App.tsx
git commit -m "feat(pipelines): pipelines list page + route"
```

---

## Task 11: Frontend - Kanban board page (stages + cards + DnD)

**Files:**
- Create: `client/pages/PipelineBoardPage.tsx`
- Modify: `client/App.tsx` (lazy route `/pipelines/:id`)

- [ ] **Step 1: Build the board with native DnD**

Mirror the native drag-drop pattern from `client/pages/LeadPipelinePage.tsx` (`draggable`, `onDragStart`, `onDragOver`, `onDrop`). Concrete skeleton:

```tsx
import { useState } from "react";
import { useRoute } from "wouter";
import { usePipeline, usePipelineCards, usePipelineMutations } from "@/hooks/usePipelines";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function PipelineBoardPage() {
  const [, params] = useRoute("/pipelines/:id");
  const pid = params ? Number(params.id) : null;
  const { canWrite } = useAuth();
  const writable = canWrite("pipelines");
  const { data: pipeline } = usePipeline(pid);
  const { data: cards } = usePipelineCards(pid);
  const m = usePipelineMutations(pid ?? undefined);
  const [dragId, setDragId] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const stages = pipeline?.stages ?? [];
  const visible = (cards ?? []).filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));

  const onDrop = async (stageId: number) => {
    if (dragId == null) return;
    await m.moveCard.mutateAsync({ cardId: dragId, toStageId: stageId, toPosition: undefined });
    setDragId(null);
  };

  return (
    <div className="flex flex-col h-full -m-4 md:-m-6 -mt-16 md:-mt-6 pb-20 md:pb-0">
      <div className="sticky top-0 z-10 bg-background pt-16 md:pt-6 px-4 md:px-6 pb-2 flex items-center gap-2">
        <h1 className="font-bold text-lg flex-1">{pipeline?.name ?? "Memuat…"}</h1>
        <Input inputSize="sm" placeholder="Cari kartu…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
      </div>
      <div className="flex-1 overflow-x-auto px-4 md:px-6">
        <div className="flex gap-3 min-h-full pb-4">
          {stages.map((stage) => {
            const stageCards = visible.filter((c) => c.stageId === stage.id);
            return (
              <div key={stage.id} className="w-72 shrink-0 flex flex-col"
                   onDragOver={(e) => { e.preventDefault(); }} onDrop={() => onDrop(stage.id)}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="font-semibold text-sm">{stage.label}</span>
                  <span className="text-xs text-muted-foreground">{stageCards.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {stageCards.map((c) => (
                    <Card key={c.id} draggable={writable}
                          onDragStart={() => setDragId(c.id)}
                          onClick={() => setSelectedCard(c.id)}
                          className={`p-3 cursor-pointer ${dragId === c.id ? "opacity-40" : ""}`}>
                      <div className="text-sm font-medium">{c.title}</div>
                      <div className="text-2xs text-muted-foreground mt-1">{c.priority}</div>
                    </Card>
                  ))}
                  {writable && (
                    <AddCardInline onAdd={async (title) => { await m.createCard.mutateAsync({ stageId: stage.id, title }); }} />
                  )}
                </div>
              </div>
            );
          })}
          {writable && <AddStageInline onAdd={async (label) => { await m.createStage.mutateAsync({ label }); toast.success("Stage ditambah"); }} />}
        </div>
      </div>
      {/* CardDetailDrawer from Task 12 */}
      {selectedCard != null && (
        <CardDetailDrawer cardId={selectedCard} pipelineId={pid!} onClose={() => setSelectedCard(null)} writable={writable} />
      )}
    </div>
  );
}

function AddCardInline({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [v, setV] = useState(""); const [open, setOpen] = useState(false);
  if (!open) return <Button variant="ghost" size="sm" className="justify-start" onClick={() => setOpen(true)}>+ Kartu</Button>;
  return (
    <div className="flex gap-1">
      <Input inputSize="sm" autoFocus value={v} onChange={(e) => setV(e.target.value)}
             onKeyDown={async (e) => { if (e.key === "Enter" && v.trim()) { await onAdd(v.trim()); setV(""); setOpen(false); } }} placeholder="Judul kartu" />
    </div>
  );
}

function AddStageInline({ onAdd }: { onAdd: (label: string) => Promise<void> }) {
  const [v, setV] = useState(""); const [open, setOpen] = useState(false);
  if (!open) return <Button variant="ghost" className="w-40 shrink-0" onClick={() => setOpen(true)}>+ Stage</Button>;
  return <div className="w-72 shrink-0"><Input autoFocus value={v} onChange={(e) => setV(e.target.value)}
             onKeyDown={async (e) => { if (e.key === "Enter" && v.trim()) { await onAdd(v.trim()); setV(""); setOpen(false); } }} placeholder="Nama stage" /></div>;
}
```

Import `CardDetailDrawer` from Task 12: `import { CardDetailDrawer } from "@/components/pipelines/CardDetailDrawer";`

- [ ] **Step 2: Register the route**

In `client/App.tsx`:

```tsx
const PipelineBoardPage = lazy(() => import("@/pages/PipelineBoardPage"));
<Route path="/pipelines/:id" component={PipelineBoardPage} />
```

Ensure `/pipelines/:id` is registered AFTER `/pipelines` (Wouter matches in order; literal `/pipelines` first is fine since `:id` requires a segment).

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS (CardDetailDrawer must exist - do Task 12 first OR stub it; recommended order: Task 12 then 11. If doing 11 first, temporarily comment the drawer usage and uncomment after Task 12.)

- [ ] **Step 4: Commit**

```bash
git add client/pages/PipelineBoardPage.tsx client/App.tsx
git commit -m "feat(pipelines): kanban board page with native drag-drop"
```

---

## Task 12: Frontend - Card detail drawer (fields, comments, activity, followers)

**Files:**
- Create: `client/components/pipelines/CardDetailDrawer.tsx`

> **Do this BEFORE Task 11's final build** so the import resolves.

- [ ] **Step 1: Build the drawer**

```tsx
import { useState } from "react";
import { useCard, usePipelineMutations } from "@/hooks/usePipelines";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";

export function CardDetailDrawer({ cardId, pipelineId, onClose, writable }: {
  cardId: number; pipelineId: number; onClose: () => void; writable: boolean;
}) {
  const { data: card, isLoading } = useCard(cardId);
  const m = usePipelineMutations(pipelineId);
  const [comment, setComment] = useState("");
  const [title, setTitle] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-background overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Detail Kartu</h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="size-4" /></Button>
        </div>
        {isLoading || !card ? <div className="animate-pulse h-40" /> : (
          <div className="space-y-4">
            <div>
              <Input defaultValue={card.title} disabled={!writable}
                onBlur={(e) => writable && e.target.value !== card.title && m.updateCard.mutateAsync({ cardId, title: e.target.value })} />
            </div>
            <Textarea defaultValue={card.description ?? ""} placeholder="Deskripsi" disabled={!writable}
              onBlur={(e) => writable && e.target.value !== (card.description ?? "") && m.updateCard.mutateAsync({ cardId, description: e.target.value })} />

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground mb-1">Komentar</h4>
              <div className="space-y-2">
                {card.comments.map((c) => (
                  <div key={c.id} className="text-sm bg-muted/50 rounded p-2">{c.body}
                    <div className="text-2xs text-muted-foreground mt-0.5">{new Date(c.createdAt).toLocaleString("id-ID")}</div>
                  </div>
                ))}
              </div>
              {writable && (
                <div className="flex gap-1 mt-2">
                  <Input inputSize="sm" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tulis komentar…" />
                  <Button size="sm" onClick={async () => { if (comment.trim()) { await m.addComment.mutateAsync({ cardId, body: comment.trim() }); setComment(""); } }}>Kirim</Button>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground mb-1">Aktivitas</h4>
              <ul className="space-y-1">
                {card.activity.map((a) => (
                  <li key={a.id} className="text-2xs text-muted-foreground">
                    <span className="font-medium">{a.type}</span> · {new Date(a.createdAt).toLocaleString("id-ID")}
                  </li>
                ))}
              </ul>
            </section>

            {writable && (
              <Button variant="destructive" size="sm" onClick={async () => { await m.deleteCard.mutateAsync(cardId); onClose(); }}>Hapus Kartu</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

(Followers add/remove UI: a simple user-picker can be added using the existing user list hook; for Phase 1 MVP, followers can be managed via the assignee field + the API - the picker is optional polish. If included, reuse the `Combobox` of users like other pages.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/CardDetailDrawer.tsx
git commit -m "feat(pipelines): card detail drawer (fields, comments, activity)"
```

---

## Task 13: Nav wiring - Sidebar, BottomNav, Command Palette

**Files:**
- Modify: `client/components/layout/Sidebar.tsx`
- Modify: `client/components/layout/BottomNav.tsx` (if it lists Tools items)
- Modify: the command palette component (find via grep)

- [ ] **Step 1: Find the nav config**

Run: `grep -rn "leads\|/leads\|Lead Pipeline" client/components/layout/Sidebar.tsx`
Expected: a nav-item array with `{ to, label, icon, permission }` shape. Follow it exactly.

- [ ] **Step 2: Add the Pipelines nav item**

In the Sidebar nav config (group "Tools"), add an entry mirroring an existing one:

```tsx
{ to: "/pipelines", label: "Pipelines", icon: Layers, permission: "pipelines" },
```

(Import `Layers` from `lucide-react` if not present.) Permission-filtering is automatic via the existing `permission` field - confirm by checking how other items are filtered.

- [ ] **Step 3: Add to Command Palette**

Run: `grep -rn "Lead Pipeline\|/leads" client/components/*Command* client/components/**/Command*`
Add a command entry for `/pipelines` (group "Tools" / "Navigasi") mirroring an existing route command.

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/components
git commit -m "feat(pipelines): nav entries (sidebar, command palette, bottomnav)"
```

---

## Task 14: Permission auto-migration sanity + feature-gate verification

**Files:**
- Verify only (no new code unless a gap is found): `server/storage.ts` (`upgradePermissionsV412`), `server/feature-gate.ts`

- [ ] **Step 1: Confirm the new permission key auto-grants on startup**

Run: `grep -n "ALL_PERMISSION_KEYS\|ALL_PERMISSIONS\|upgradePermissions" server/storage.ts | head`
Read `upgradePermissionsV412` and confirm it iterates `ALL_PERMISSION_KEYS` (so `pipelines` is auto-added to roles on next start). If it uses a hardcoded list, add `pipelines` there.

- [ ] **Step 2: Confirm feature-gating strips `pipelines` when disabled**

Run: `grep -n "FEATURE_PERMISSIONS\|stripDisabled\|featureGate" server/feature-gate.ts`
Confirm the new `pipelines` FEATURE_PERMISSIONS entry is consumed generically (it should be - the map is iterated). No code change expected.

- [ ] **Step 3: Restart dev + verify**

Restart `npm run dev`. As JABNET admin, confirm `/pipelines` nav appears. In `/roles`, confirm the new `Pipelines (Kanban)` permission shows in the matrix. Disable the `pipelines` feature for a test mitra in mitra admin → confirm that mitra's admin loses the nav + gets 403 on `/api/pipelines`.

- [ ] **Step 4: Commit (only if a code change was needed)**

```bash
git add -A
git commit -m "fix(pipelines): ensure permission auto-migration + feature gate cover pipelines"
```

---

## Task 15: Final verification + manual checklist (dev)

**Files:** none (verification only)

- [ ] **Step 1: Run all server tests**

Run: `npx tsx --test server/pipeline-helpers.test.ts`
Expected: PASS (6/6).

- [ ] **Step 2: Full typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 3: Manual end-to-end on dev (`jabnet_fiber_dev`)**

Walk the spec's manual checklist:
- Create pipeline → add 3 stages → add cards → drag card between stages → reorder → verify persistence + activity entries.
- Add a comment + a follower → assignee/follower receives a notification (bell).
- Archive pipeline → drops off default list, visible with `?archived=1`.
- `read`-only user: board visible, no mutate controls; `none` user: no nav.
- **Isolation:** log in as a different mitra → none of the first mitra's pipelines visible; guessing another mitra's card id → 404/403, never data.
- Feature gate: disable `pipelines` for a mitra → nav + endpoints denied.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review` for a whole-implementation review before the user promotes to prod. Then STOP - the user pushes to dev and tests on `workspace-dev.jabnet.id`; prod promotion happens only after explicit user OK (platform rule).

---

## Self-Review Notes (author)

- **Spec coverage:** pipelines/stages/cards CRUD (T3-T8), comments/activity/followers (T6,T8,T12), Kanban DnD (T11), permissions + feature gate (T1,T14), tenant isolation (every storage method via `getMitraId()`), notifications (T8), nav (T13), dev-first rollout (T8/T15). Out-of-scope items (custom fields, RBAC granularity, automation, attachments) intentionally absent.
- **Type consistency:** storage method names match route calls and hook calls (`moveCard`, `createCard`, `addComment`, `addFollower`, `archivePipeline`, etc.). Helper `computeInsertPosition` defined in T2, consumed in T5.
- **Known adaptation points (flagged inline):** exact `storage.createNotification` signature (T8 Step 1), design-system import paths + `PageHeader` props (T10), nav-config shape (T13). These require reading one existing file each before finalizing - called out so the implementer verifies rather than guesses.
- **Route ordering caveat** (T7/T8): literal `/api/pipelines/cards/...` routes must register before `GET /api/pipelines/:id` to avoid `cards` being captured as `:id`. Flagged explicitly.
