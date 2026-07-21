# Card Identity / Lineage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every pipeline card lineage anchors (`master_card_id`, `origin_card_id`, `relation_type`) so one business entity can exist as multiple cards across pipelines and be found as a group.

**Architecture:** A pure identity module (`shared/cardIdentity.ts`) + 3 nullable columns on `pipeline_cards` (master = root card's own id, self-referential) + an idempotent migration/backfill + a `getRelatedCards` read + one endpoint + a "Kartu Terkait" panel. SP2 establishes & surfaces lineage only; the actual cross-pipeline sync is SP3.

**Tech Stack:** TypeScript, Drizzle (MySQL), Express 5, React 18 + TanStack Query 5, `node:test` via `npx tsx --test`.

**Conventions:**
- Tests: `npx tsx --test <file>` (NO `npm test`). Import extensions `.js`.
- MySQL Drizzle: no `.returning()` - insert then re-select by `insertId`.
- Tenant-scoped via `getMitraId()`. Envelope: `sendSuccess(res, data)` / `sendError(res, msg, status)`.
- `ADD COLUMN`: append to the `loyaltyColumnAdditions` array (storage.ts ~690) - it guards each add with an `information_schema.columns` COUNT check + per-column try/catch. `ADD COLUMN IF NOT EXISTS` is NOT supported; this guarded pattern is.
- New index: append to the `runIndexMigrations` `indexes` array (storage.ts ~589) - guarded via `information_schema.statistics`.
- Route guards: `requirePermission(req,res,"pipelines")`, `requirePipelineView(req,res,pid)`, `requireCardAccess(req,res,card)`. `storage.getCard(id)` is mitra-scoped.

---

### Task 1: Pure identity module `shared/cardIdentity.ts`

**Files:**
- Create: `shared/cardIdentity.ts`
- Test: `shared/cardIdentity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/cardIdentity.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_RELATION_TYPES,
  isValidRelationType,
  relationTypeLabel,
  resolveMasterCardId,
} from "./cardIdentity.js";

test("isValidRelationType: only the 4 known types", () => {
  assert.equal(isValidRelationType("mirror"), true);
  assert.equal(isValidRelationType("duplicate"), true);
  assert.equal(isValidRelationType("linked"), true);
  assert.equal(isValidRelationType("child"), true);
  assert.equal(isValidRelationType("root"), false);
  assert.equal(isValidRelationType(""), false);
  assert.equal(isValidRelationType(null), false);
  assert.equal(isValidRelationType(42), false);
});

test("relationTypeLabel: known → label, unknown/null → ''", () => {
  assert.equal(relationTypeLabel("mirror"), "Mirror");
  assert.equal(relationTypeLabel("child"), "Turunan");
  assert.equal(relationTypeLabel("nope"), "");
  assert.equal(relationTypeLabel(null), "");
});

test("resolveMasterCardId: root → ownId, spawned → origin master", () => {
  assert.equal(resolveMasterCardId(null, 10), 10);   // root: no origin master
  assert.equal(resolveMasterCardId(0, 10), 10);      // 0 treated as none
  assert.equal(resolveMasterCardId(undefined, 7), 7);
  assert.equal(resolveMasterCardId(5, 10), 5);       // spawned: inherit origin master
});

test("CARD_RELATION_TYPES exported with 4 entries", () => {
  assert.equal(CARD_RELATION_TYPES.length, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/cardIdentity.test.ts`
Expected: FAIL - `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write minimal implementation**

Create `shared/cardIdentity.ts`:

```ts
/** Pure helpers for cross-pipeline card lineage - no I/O, unit-testable. */

export type CardRelationType = "mirror" | "duplicate" | "linked" | "child";

export const CARD_RELATION_TYPES: { type: CardRelationType; label: string }[] = [
  { type: "mirror",    label: "Mirror" },
  { type: "duplicate", label: "Duplikat" },
  { type: "linked",    label: "Tertaut" },
  { type: "child",     label: "Turunan" },
];

const VALID = new Set<string>(CARD_RELATION_TYPES.map((t) => t.type));

export function isValidRelationType(v: unknown): v is CardRelationType {
  return typeof v === "string" && VALID.has(v);
}

export function relationTypeLabel(v: string | null | undefined): string {
  return CARD_RELATION_TYPES.find((t) => t.type === v)?.label ?? "";
}

/** Master for a new card: inherit the origin's master, else (root) the card's own id. */
export function resolveMasterCardId(originMasterId: number | null | undefined, ownId: number): number {
  return originMasterId && originMasterId > 0 ? originMasterId : ownId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/cardIdentity.test.ts`
Expected: PASS - 4/4.

- [ ] **Step 5: Commit**

```bash
git add shared/cardIdentity.ts shared/cardIdentity.test.ts
git commit -m "feat(card-identity): pure relation-type + master resolver module"
```

---

### Task 2: Schema columns on `pipeline_cards`

**Files:**
- Modify: `shared/schema.ts` (the `pipelineCards` table ~line 479)

- [ ] **Step 1: Add the 3 columns + index**

In `shared/schema.ts`, inside `pipelineCards`, add the columns after `sourceRuleId` and add the index in the table's index callback:

```ts
  sourceCustomerId: int("source_customer_id"),
  sourceRuleId: int("source_rule_id"),
  masterCardId: int("master_card_id"),
  originCardId: int("origin_card_id"),
  relationType: varchar("relation_type", { length: 16 }),
}, (t) => ({
  byMitraPipelineStage: index("idx_pipeline_cards_mitra_pipeline_stage").on(t.mitraId, t.pipelineId, t.stageId, t.position),
  byMaster: index("idx_pipeline_cards_master").on(t.mitraId, t.masterCardId),
}));
```

(Keep the existing `byMitraPipelineStage` entry; just add `byMaster` alongside it.)

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(card-identity): master/origin/relation columns on pipeline_cards"
```

---

### Task 3: Migration - add columns, backfill, index

**Files:**
- Modify: `server/storage.ts` (the `loyaltyColumnAdditions` array ~690; the `runIndexMigrations` `indexes` array ~589; add a backfill after the column-additions loop)

- [ ] **Step 1: Add the 3 columns to the additions array**

In `server/storage.ts`, append to the `loyaltyColumnAdditions` array:

```ts
      { table: "pipeline_cards", column: "master_card_id", ddl: "INT NULL" },
      { table: "pipeline_cards", column: "origin_card_id", ddl: "INT NULL" },
      { table: "pipeline_cards", column: "relation_type",  ddl: "VARCHAR(16) NULL" },
```

- [ ] **Step 2: Add the idempotent backfill after the additions loop**

Immediately AFTER the `for (const { table, column, ddl } of loyaltyColumnAdditions) { ... }` loop closes, add:

```ts
    // Backfill card lineage: every existing card is its own master (idempotent via the WHERE guard).
    try {
      await this.pool.execute(
        `UPDATE pipeline_cards SET master_card_id = id WHERE master_card_id IS NULL`,
      );
    } catch (err: any) {
      if (err.errno !== 1146) console.warn(`[migration] pipeline_cards master backfill: ${err.message}`);
    }
```

- [ ] **Step 3: Add the index**

Append to the `indexes` array in `runIndexMigrations`:

```ts
      { table: "pipeline_cards", name: "idx_pipeline_cards_master", cols: "mitra_id, master_card_id" },
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "feat(card-identity): migration - columns + master backfill + index"
```

---

### Task 4: `createCard` sets lineage

**Files:**
- Modify: `server/storage.ts` (`createCard` ~1944)

- [ ] **Step 1: Extend the `data` param + insert values + post-insert master update**

Change the `createCard` signature's `data` type to add the three optional fields:

```ts
  async createCard(pipelineId: number, data: { stageId: number; title: string; description?: string; assigneeId?: number | null; priority?: string; dueDate?: string | null; tags?: string[] | null; sourceCustomerId?: number | null; sourceRuleId?: number | null; masterCardId?: number | null; originCardId?: number | null; relationType?: string | null; }, userId: number): Promise<PipelineCard> {
```

In the `.values({...})` object, add the three fields alongside `sourceRuleId`:

```ts
      sourceCustomerId: data.sourceCustomerId ?? null,
      sourceRuleId: data.sourceRuleId ?? null,
      masterCardId: data.masterCardId ?? null,
      originCardId: data.originCardId ?? null,
      relationType: data.relationType ?? null,
```

Then, immediately AFTER `const insertId = Number((result[0] as any).insertId);` and BEFORE the `logCardActivity` line, add the root self-reference:

```ts
    // Root card → its own master; spawned cards (SP3) pass masterCardId in.
    if (data.masterCardId == null) {
      await this.db.update(pipelineCards).set({ masterCardId: insertId })
        .where(and(eq(pipelineCards.id, insertId), eq(pipelineCards.mitraId, mitraId)));
    }
```

(The final `select ... where id = insertId` already re-reads the row, so the returned card reflects the set `masterCardId`.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(card-identity): createCard sets master (self for roots) + origin/relation"
```

---

### Task 5: `getRelatedCards` storage read

**Files:**
- Modify: `server/storage.ts` (add method near `getCard` ~1937; ensure `pipelines`, `pipelineStages` are imported - they are used elsewhere in the file)

- [ ] **Step 1: Add the method**

Add after `getCard`:

```ts
async getRelatedCards(cardId: number): Promise<Array<{
  id: number; pipelineId: number; pipelineName: string; stageId: number; stageLabel: string;
  title: string; relationType: string | null; originCardId: number | null;
}>> {
  const mitraId = getMitraId();
  const [self] = await this.db.select().from(pipelineCards)
    .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mitraId)));
  if (!self) return [];
  const masterId = self.masterCardId ?? self.id;
  const rows = await this.db
    .select({
      id: pipelineCards.id,
      pipelineId: pipelineCards.pipelineId,
      pipelineName: pipelines.name,
      stageId: pipelineCards.stageId,
      stageLabel: pipelineStages.label,
      title: pipelineCards.title,
      relationType: pipelineCards.relationType,
      originCardId: pipelineCards.originCardId,
    })
    .from(pipelineCards)
    .innerJoin(pipelines, eq(pipelines.id, pipelineCards.pipelineId))
    .innerJoin(pipelineStages, eq(pipelineStages.id, pipelineCards.stageId))
    .where(and(
      eq(pipelineCards.mitraId, mitraId),
      eq(pipelineCards.masterCardId, masterId),
      ne(pipelineCards.id, cardId),
    ));
  return rows;
}
```

Note: `ne` (not-equal) must be in the `drizzle-orm` import at the top of storage.ts. It is commonly already imported; if not, add `ne` to the `import { eq, and, ... } from "drizzle-orm"` line. `pipelines` and `pipelineStages` are already imported (used by other methods).

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(card-identity): getRelatedCards (siblings by master, with pipeline/stage)"
```

---

### Task 6: `GET /related` endpoint

**Files:**
- Modify: `server/routes.ts` (add near the other `/api/pipelines/cards/:cardId/...` routes, e.g. after the followers GET ~line 5000-5070)

Read first: the comment-photo or follower GET route for the `requirePermission` + `getCard` + `requirePipelineView` + `requireCardAccess` chain.

- [ ] **Step 1: Add the route**

```ts
router.get("/api/pipelines/cards/:cardId/related", async (req, res) => {
  if (!requirePermission(req, res, "pipelines")) return;
  const card = await storage.getCard(Number(req.params.cardId));
  if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
  if (!(await requirePipelineView(req, res, card.pipelineId))) return;
  if (!(await requireCardAccess(req, res, card))) return;
  sendSuccess(res, await storage.getRelatedCards(card.id));
});
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat(card-identity): GET /api/pipelines/cards/:cardId/related endpoint"
```

---

### Task 7: "Kartu Terkait" UI panel

**Files:**
- Create: `client/components/pipelines/CardRelatedCards.tsx`
- Modify: `client/hooks/usePipelines.ts` (add `useRelatedCards` + `RelatedCard` type)
- Modify: `client/components/pipelines/CardDetailModal.tsx` (render the panel near `CardRelations` ~line 140)

Read first: an existing `useQuery` hook in `usePipelines.ts` for the `api.get` style; `CardRelations.tsx` for the panel styling; `relationTypeLabel` from `@shared/cardIdentity`.

- [ ] **Step 1: Add the hook**

In `client/hooks/usePipelines.ts`:

```ts
export interface RelatedCard {
  id: number; pipelineId: number; pipelineName: string; stageId: number; stageLabel: string;
  title: string; relationType: string | null; originCardId: number | null;
}

export function useRelatedCards(cardId: number | null) {
  return useQuery({
    queryKey: ["card-related", cardId],
    queryFn: () => api.get<RelatedCard[]>(`/pipelines/cards/${cardId}/related`),
    enabled: cardId != null,
  });
}
```

- [ ] **Step 2: Create the panel**

Create `client/components/pipelines/CardRelatedCards.tsx`:

```tsx
import { Link2, ArrowUpRight } from "lucide-react";
import { useRelatedCards } from "@/hooks/usePipelines";
import { relationTypeLabel } from "@shared/cardIdentity";

export function CardRelatedCards({ cardId }: { cardId: number }): JSX.Element | null {
  const { data: items = [], isLoading } = useRelatedCards(cardId);
  if (isLoading || items.length === 0) return null; // hidden until siblings exist (SP3 creates them)
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Link2 className="size-3.5" /> Kartu Terkait
      </h4>
      <div className="space-y-1.5">
        {items.map((r) => (
          <a key={r.id} href={`/pipelines/${r.pipelineId}?card=${r.id}`}
            className="flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1.5 hover:bg-muted/40">
            {r.relationType && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">
                {relationTypeLabel(r.relationType)}
              </span>
            )}
            <span className="flex-1 min-w-0 truncate text-xs">{r.title}</span>
            <span className="shrink-0 text-2xs text-muted-foreground">{r.pipelineName} · {r.stageLabel}</span>
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into `CardDetailModal`**

Import at top: `import { CardRelatedCards } from "@/components/pipelines/CardRelatedCards";`
Render it directly below the existing `<CardRelations cardId={cardId} writable={writable} />` (line ~140):
```tsx
<CardRelatedCards cardId={cardId} />
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/CardRelatedCards.tsx client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(card-identity): Kartu Terkait panel + useRelatedCards hook"
```

---

### Task 8: Final verification

**Files:** none

- [ ] **Step 1: Run the pure tests**

Run: `npx tsx --test shared/cardIdentity.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 3: Wiring grep**

Run:
```bash
grep -rn "master_card_id\|masterCardId\|getRelatedCards\|card-related\|CardRelatedCards\|cardIdentity" server/ client/ shared/ | grep -v node_modules
```
Expected: columns in schema + migration; createCard sets master; getRelatedCards + endpoint + hook + panel all present.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "chore(card-identity): final verification fixes" || echo "nothing to commit"
```

---

## Manual test checklist (post-merge, on dev)

1. After restart, confirm the 3 columns exist and existing cards have `master_card_id = id`
   (`SELECT id, master_card_id FROM pipeline_cards LIMIT 5`).
2. Create a new card via the UI → `master_card_id` equals its own `id`; `origin_card_id`/`relation_type` null.
3. Open any card → "Kartu Terkait" panel is hidden (no siblings yet - expected until SP3 links cards).
4. Manually `UPDATE pipeline_cards SET master_card_id = <root id>, origin_card_id = <root id>, relation_type='mirror' WHERE id = <other card in another pipeline>` → open either card → the other appears in "Kartu Terkait" with the Mirror badge + correct pipeline/stage, link navigates.
