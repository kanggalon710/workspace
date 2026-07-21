# Conditional / Row-level Permissions (Phase 3b-iii) - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per (restricted pipeline × role) card filter - a role sees/acts on a card only if its field values + stage match the role's condition; non-matching cards are invisible and un-actionable.

**Architecture:** A pure resolver decides whether a filter applies (admin/creator/open → none) and evaluates it via the Phase-4 condition engine. The filter is stored on the per-role `pipeline_access` grant. A centralized `requireCardAccess` guard + a list filter are applied at every card-access path. The access dialog adds a per-role card-filter builder.

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React. `.js` imports. Migration via `p4cColAdds` (info_schema-guarded ADD COLUMN).

---

### Task 1: Pure module - resolveCardFilter + cardPassesFilter

**Files:**
- Create: `shared/cardRowFilter.ts`
- Test: `shared/cardRowFilter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/cardRowFilter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCardFilter, cardPassesFilter } from "./cardRowFilter.js";
import type { FieldRuleCondition } from "./fieldRules.js";

const filter: FieldRuleCondition[][] = [[{ source: "field", fieldId: 1, op: "eq", value: "finance" }]];
const vals = (o: Record<number, string>) => new Map<number, string>(Object.entries(o).map(([k, v]) => [Number(k), v]));

test("resolveCardFilter: admin/creator/non-restricted/no-grant → null", () => {
  assert.equal(resolveCardFilter({ isAdmin: true, isCreator: false, restricted: true, grantFilter: filter }), null);
  assert.equal(resolveCardFilter({ isAdmin: false, isCreator: true, restricted: true, grantFilter: filter }), null);
  assert.equal(resolveCardFilter({ isAdmin: false, isCreator: false, restricted: false, grantFilter: filter }), null);
  assert.equal(resolveCardFilter({ isAdmin: false, isCreator: false, restricted: true, grantFilter: null }), null);
  assert.equal(resolveCardFilter({ isAdmin: false, isCreator: false, restricted: true, grantFilter: [] }), null);
});

test("resolveCardFilter: restricted + grant filter → the filter", () => {
  assert.deepEqual(resolveCardFilter({ isAdmin: false, isCreator: false, restricted: true, grantFilter: filter }), filter);
});

test("cardPassesFilter: null → true (no filtering)", () => {
  assert.equal(cardPassesFilter(null, { values: vals({}), stageId: 1 }), true);
});

test("cardPassesFilter: field match / no-match", () => {
  assert.equal(cardPassesFilter(filter, { values: vals({ 1: "Finance" }), stageId: 1 }), true);
  assert.equal(cardPassesFilter(filter, { values: vals({ 1: "sales" }), stageId: 1 }), false);
});

test("cardPassesFilter: stage source", () => {
  const f: FieldRuleCondition[][] = [[{ source: "stage", op: "eq", value: "5" }]];
  assert.equal(cardPassesFilter(f, { values: vals({}), stageId: 5 }), true);
  assert.equal(cardPassesFilter(f, { values: vals({}), stageId: 6 }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/cardRowFilter.test.ts`
Expected: FAIL - module missing.

- [ ] **Step 3: Write the module**

Create `shared/cardRowFilter.ts`:

```ts
/** Pure row-level (card) access filter. No DB, no I/O. Reuses the Phase-4 field-condition engine. */
import { evaluateFieldConditionGroups, type FieldRuleCondition, type FieldRuleCtx } from "./fieldRules.js";

/** Returns the active filter for a request, or null when no filtering applies (see-all). */
export function resolveCardFilter(args: {
  isAdmin: boolean; isCreator: boolean; restricted: boolean;
  grantFilter: FieldRuleCondition[][] | null;
}): FieldRuleCondition[][] | null {
  if (args.isAdmin || args.isCreator || !args.restricted) return null;
  if (!args.grantFilter || args.grantFilter.length === 0) return null;
  return args.grantFilter;
}

/** null filter → always true; else AND-within-group / OR-across-groups via the shared evaluator. */
export function cardPassesFilter(filter: FieldRuleCondition[][] | null, ctx: FieldRuleCtx): boolean {
  if (!filter || filter.length === 0) return true;
  return evaluateFieldConditionGroups(filter, ctx);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/cardRowFilter.test.ts`
Expected: PASS - all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/cardRowFilter.ts shared/cardRowFilter.test.ts
git commit -m "feat(pipelines): pure card row-filter resolver"
```

---

### Task 2: Schema + storage - cardFilter on grants + full-values reader

**Files:**
- Modify: `shared/schema.ts`, `server/storage.ts`

- [ ] **Step 1: Schema column**

In `shared/schema.ts`, add to the `pipelineAccess` table columns:
```ts
  cardFilter: text("card_filter"), // JSON FieldRuleCondition[][] - restricts which cards this role sees
```

- [ ] **Step 2: Migration**

In `server/storage.ts` `p4cColAdds` array, add:
```ts
      { table: "pipeline_access", column: "card_filter", ddl: "TEXT NULL" },
```

- [ ] **Step 3: getPipelineAccess / setPipelineAccess carry cardFilter**

In `server/storage.ts`:
- `getPipelineAccess` - add `cardFilter` to each grant:
  ```ts
      grants: rows.map((r) => ({
        roleId: r.roleId,
        capabilities: (r as any).capabilities ? parseCapabilities((r as any).capabilities) : capabilitiesFromLevel(r.level),
        cardFilter: (() => { try { return (r as any).cardFilter ? JSON.parse((r as any).cardFilter) : null; } catch { return null; } })(),
      })),
  ```
  and widen the return type to include `cardFilter: any | null` on each grant.
- `setPipelineAccess` - widen the `grants` param to `{ roleId: number; capabilities: PipelineCapability[]; cardFilter?: any | null }[]` and in the insert add:
  ```ts
        cardFilter: g.cardFilter && Array.isArray(g.cardFilter) && g.cardFilter.length ? JSON.stringify(g.cardFilter) : null,
  ```

- [ ] **Step 4: getCardFilterForRole + getAllCardValuesForPipeline**

Add to `server/storage.ts` (import `FieldRuleCondition` type from `../shared/fieldRules.js`):
```ts
  async getCardFilterForRole(pipelineId: number, roleId: number): Promise<import("../shared/fieldRules.js").FieldRuleCondition[][] | null> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId), eq(pipelineAccess.roleId, roleId)));
    if (!row || !(row as any).cardFilter) return null;
    try { const g = JSON.parse((row as any).cardFilter); return Array.isArray(g) && g.length ? g : null; } catch { return null; }
  }

  /** All field values (not just showOnCard) keyed by cardId - for row-level filtering on the board. */
  async getAllCardValuesForPipeline(pipelineId: number): Promise<Map<number, Record<number, string>>> {
    const mitraId = getMitraId();
    const fields = await this.db.select({ id: pipelineFields.id }).from(pipelineFields)
      .where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId)));
    const fieldIds = fields.map((f) => f.id);
    const out = new Map<number, Record<number, string>>();
    if (fieldIds.length === 0) return out;
    const rows = await this.db.select().from(pipelineCardValues)
      .where(and(eq(pipelineCardValues.mitraId, mitraId), inArray(pipelineCardValues.fieldId, fieldIds)));
    for (const r of rows) { const m = out.get(r.cardId) ?? {}; m[r.fieldId] = r.value ?? ""; out.set(r.cardId, m); }
    return out;
  }
```

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): pipeline_access.cardFilter + full-values reader + accessors"
```

---

### Task 3: Server enforcement - centralized requireCardAccess at every card path

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add imports + helpers**

At the top of `server/routes.ts`:
```ts
import { resolveCardFilter, cardPassesFilter } from "../shared/cardRowFilter.js";
```
Add helpers near `fieldAccessForRequest`:
```ts
async function getCardFilterForRequest(req: Request, pipelineId: number): Promise<import("../shared/fieldRules.js").FieldRuleCondition[][] | null> {
  const p = await storage.getPipeline(pipelineId);
  if (!p) return null;
  const grantFilter = req.authUser!.effectiveRoleId ? await storage.getCardFilterForRole(pipelineId, req.authUser!.effectiveRoleId) : null;
  return resolveCardFilter({
    isAdmin: isPipelineAdmin(req),
    isCreator: (p as any).createdBy === req.authUser!.id,
    restricted: (p as any).restricted === 1,
    grantFilter,
  });
}

/** Guard a single-card route by the requester's row filter. 404 (hide existence) when blocked. */
async function requireCardAccess(req: Request, res: Response, card: { id: number; pipelineId: number; stageId: number }): Promise<boolean> {
  const filter = await getCardFilterForRequest(req, card.pipelineId);
  if (!filter) return true;
  const rec = await storage.getCardValues(card.id);
  const values = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
  if (cardPassesFilter(filter, { values, stageId: card.stageId })) return true;
  sendError(res, "Kartu tidak ditemukan", 404);
  return false;
}
```

- [ ] **Step 2: Board list - filter cards**

In `GET /api/pipelines/:id/cards` (it already loads `cards` + `valuesByCard` via `getBoardCardValues`, and applies the 3b-i hidden-stripping). Add row-filtering BEFORE the existing value-stripping/return: resolve the filter once, load full values, drop non-matching cards. Read the current handler; insert after `cards`/`valuesByCard` are obtained and before the response map:
```ts
    const rowFilter = await getCardFilterForRequest(req, Number(req.params.id));
    let visibleCards = cards;
    if (rowFilter) {
      const fullValues = await storage.getAllCardValuesForPipeline(Number(req.params.id));
      visibleCards = cards.filter((c) => cardPassesFilter(rowFilter, {
        values: new Map<number, string>(Object.entries(fullValues.get(c.id) ?? {}).map(([k, v]) => [Number(k), String(v)])),
        stageId: c.stageId,
      }));
    }
```
Then build the response from `visibleCards` instead of `cards` (keep the existing field-perm hidden-stripping on `valuesByCard`).

- [ ] **Step 3: Single-card routes - add requireCardAccess**

Add `if (!(await requireCardAccess(req, res, card))) return;` immediately AFTER the card is fetched and its
existing pipeline-capability/permission gate passes, in EACH of these handlers (use the handler's actual
card variable - `card` or `cardForGuard`; read each):
- `GET /api/pipelines/cards/:cardId` (detail) - after `requirePipelineView`.
- `PATCH /api/pipelines/cards/:cardId` - after the capability gate (uses `cardForGuard`).
- `POST /api/pipelines/cards/:cardId/move` - after the gate (`cardForGuard`).
- `DELETE /api/pipelines/cards/:cardId` - after the gate.
- `PUT /api/pipelines/cards/:cardId/values` - after the gate (`card`).
- `GET` + `POST /api/pipelines/cards/:cardId/comments` - after the gate (`card`).
- `DELETE /api/pipelines/cards/comments/:id` - it resolves comment → card; after fetching that card.
- `GET` + `POST /api/pipelines/cards/:cardId/followers` + `DELETE /api/pipelines/cards/:cardId/followers/:userId` - after the gate.
- `GET` + `POST /api/pipelines/cards/:cardId/relations` + `DELETE /api/pipelines/cards/:cardId/relations/:relationId` - after the gate.
(The card object in each has `id`, `pipelineId`, `stageId` - `requireCardAccess` needs those three.)

Do NOT add it to `POST /api/pipelines/:id/cards` (create - no card yet).

- [ ] **Step 4: Export - filter cards**

In `GET /api/pipelines/:id/cards/export`, after `cards` + field-access are computed and before building
rows, drop non-matching cards:
```ts
    const rowFilter = await getCardFilterForRequest(req, pid);
    const exportCards = rowFilter
      ? cards.filter((c) => cardPassesFilter(rowFilter, {
          values: new Map<number, string>(Object.entries((await storage.getCardValues(c.id))).map(([k, v]) => [Number(k), String(v)])),
          stageId: c.stageId,
        }))
      : cards;
```
NOTE: `await` inside `.filter` does not work - instead, when `rowFilter` is set, build `exportCards` with a
for-loop (fetch values per card, push if it passes). Implement it as a loop, not an async `.filter`. Then
iterate `exportCards` to build CSV rows.

- [ ] **Step 5: relations/search - filter card results**

In `GET /api/pipelines/relations/search`, when `type === "card"`, after `searchRelatableEntities` returns
results, drop cards the requester can't access. Each card result has `id` + `pipelineId`? The search
returns `{ id, label, subtitle, pipelineId? }` for cards. For each card result, resolve its pipeline's
filter and check (cache filters per pipelineId to avoid refetch). If a result lacks the data needed to
check (no pipelineId), be conservative and drop it when ANY filter could apply - but since card results
include `pipelineId`, fetch the card (`storage.getCard`) for `stageId` + values and run `requireCardAccess`
logic inline (without sending 404 - just exclude). Implement a small inline filter loop over card results.
(Cap is ~20, so per-result fetch is fine.)

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): enforce row-level card access at all card paths"
```

---

### Task 4: Frontend - per-role card filter in PipelineAccessDialog

**Files:**
- Modify: `client/components/pipelines/PipelineAccessDialog.tsx`
- Modify: `client/hooks/usePipelines.ts` (access data type includes cardFilter)

**Context:** READ `PipelineAccessDialog.tsx` (the role × capability grid + how it loads/sends grants) and the access hooks. The grant shape gains `cardFilter`. Reuse `ConditionsBuilder` with the Stage source (as the field-rules editor does) for the per-role filter. Fields + stages for the builder come from the pipeline (the dialog has `pipelineId`; fetch via `usePipeline` if not already loaded).

- [ ] **Step 1: Carry cardFilter in the access data + payload**

In `usePipelines.ts`, the access query/types: add `cardFilter?: DraftCondition[][] | null` (or the
condition type used) to each grant in `PipelineAccessData`. The mutation that saves access must include
`cardFilter` per grant in the body sent to `PUT /api/pipelines/:id/access`.

- [ ] **Step 2: Per-role filter editor**

In `PipelineAccessDialog.tsx` (only when restricted): for each role row that has any capability granted,
add an optional collapsible **"Filter Kartu"** using `<ConditionsBuilder fields={fields} stages={stages} value={cardFilter[roleId] ?? []} onChange={...} />`. Maintain `cardFilter: Record<number, DraftCondition[][]>`
state, hydrate from the loaded grants' `cardFilter`. On save, include each role's `cardFilter` (omit when
empty) in the grant payload. Add a hint: "Kosong = role ini melihat semua kartu. Isi untuk membatasi
(mis. Departemen = Finance)."

- [ ] **Step 3: Server route accepts cardFilter**

In `server/routes.ts`, the `PUT /api/pipelines/:id/access` handler maps the body grants to
`storage.setPipelineAccess(...)`. Ensure it passes `cardFilter` through per grant (read the handler; add
`cardFilter: g.cardFilter ?? null` to the mapped grant objects). (Storage already persists it from Task 2.)
Also extend the access validation if it validates grant shape - accept the `cardFilter` array.

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/PipelineAccessDialog.tsx client/hooks/usePipelines.ts server/routes.ts
git commit -m "feat(pipelines): per-role card filter editor in access dialog"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests** - Run: `npx tsx --test shared/cardRowFilter.test.ts` → all PASS.
- [ ] **Step 2: Typecheck** - Run: `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** - Run: `npm run build` → success.
- [ ] **Step 4: Coverage audit** - Run: `grep -n "requireCardAccess\|getCardFilterForRequest\|cardPassesFilter" server/routes.ts` and confirm EVERY single-card route (detail/patch/move/delete/values/comments×3/followers×3/relations×3) plus board + export + search reference the guard/filter. List any card route that mutates/returns a card WITHOUT it.

---

## Self-Review

- **Spec coverage:** resolver + evaluator → Task 1. `cardFilter` storage + accessors + full-values reader → Task 2. Centralized `requireCardAccess` + `getCardFilterForRequest` applied to detail + all mutations + sub-resources + board + export + search; create excluded → Task 3 (enumerated). Editor per-role filter + payload + route passthrough → Task 4. Tests → Task 1 + Task 5 (incl. a coverage audit grep). All covered.
- **Placeholders:** Tasks 1-2 + 5 are full code. Tasks 3-4 give exact insertion points + the precise guard line for each enumerated route and flag the async-`.filter` pitfall (use a for-loop) - appropriate for spreading one guard across many existing handlers. Task 5 adds a grep audit to catch a missed route.
- **Type consistency:** `resolveCardFilter`/`cardPassesFilter` (Task 1) consumed by `getCardFilterForRequest`/`requireCardAccess` (Task 3). `getCardFilterForRole`/`getAllCardValuesForPipeline` (Task 2) used in Task 3. `requireCardAccess(req, res, card{id,pipelineId,stageId})` matches the card objects in the handlers. The `FieldRuleCondition[][]` filter type threads from `fieldRules.ts` through storage → resolver → guard. `cardFilter` grant field added consistently in get/setPipelineAccess (Task 2) + dialog payload (Task 4) + access route passthrough (Task 4 Step 3).

## Deploy note
One additive column (`pipeline_access.card_filter`) via startup `p4cColAdds` - no manual SQL. Purely additive + back-compat: grants without a `cardFilter`, open pipelines, admins/creators are unfiltered (current behavior). Reuses the Phase-4 condition engine + the access dialog already shown for restricted pipelines.
