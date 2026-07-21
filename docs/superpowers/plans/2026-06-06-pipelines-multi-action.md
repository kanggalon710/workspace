# Pipelines Multi-Action per Rule (P4d-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one pipeline automation rule run an ordered list of actions (1:N) instead of a single action, via a normalized `pipeline_rule_actions` table.

**Architecture:** New `pipeline_rule_actions` table (rule_id + position + action fields); `pipeline_rule_field_maps` re-homed to an `action_id`. The rule's legacy action columns are backfilled into a position-0 action and no longer read. The engine loops `applyAction` over a rule's actions. The API moves to an `actions[]` shape; the dialog gets a list of `<RuleActionEditor>`s with add/remove/reorder. Trigger + conditions stay rule-level.

**Tech Stack:** Node/Express + Drizzle MySQL + tsx; React 18 + TS + Vite; tests via `node:test` (`npx tsx --test`).

**Base branch:** `feat/pipelines-multi-action` (off `dev`). Spec: `docs/superpowers/specs/2026-06-06-pipelines-multi-action-design.md`.

**Canonical shapes (used across tasks - keep identical):**
- DB `PipelineRuleAction`: `{ id, mitraId, ruleId, position, actionType, actionConfig: string|null, targetPipelineId: number|null, targetStageId: number|null, titleTemplate: string|null, copyAssignee: number, createdAt }`.
- `ActionInput` (request → storage): `{ actionType: string; actionConfig?: any|null; targetPipelineId?: number|null; targetStageId?: number|null; titleTemplate?: string|null; copyAssignee?: number; fieldMaps?: {sourceFieldId:number; targetFieldId:number}[] }`.
- `RuleActionView` (GET enrichment / client): `PipelineRuleAction & { setFieldLabel?, setFieldType?, moveStageName?, assigneeName?, targetPipelineName?, targetStageName?, actionConfig: any, fieldMaps: ShapedFieldMap[] }`.
- `ActionDraft` (form): `{ actionType: PipelineRuleActionType; targetPipelineId: string; targetStageId: string; titleTemplate: string; copyAssignee: boolean; maps: {sourceFieldId:number|""; targetFieldId:number|""}[]; setFieldId: string; setFieldValue: string; moveStageId: string; assignUserId: string }`.

**Verification (whole-repo):** `npm run typecheck` (0) · `npx tsx --test server/pipeline-automation-helpers.test.ts` (all pass) · `npm run build`.

---

### Task 1: Schema - `pipeline_rule_actions` + field_maps `action_id`

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Add the actions table** (after the `pipelineRuleFieldMaps` table definition, ~line 628):

```ts
export const pipelineRuleActions = mysqlTable("pipeline_rule_actions", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ruleId: int("rule_id").notNull(),
  position: int("position").notNull().default(0),
  actionType: varchar("action_type", { length: 16 }).notNull(),
  actionConfig: text("action_config"),
  targetPipelineId: int("target_pipeline_id"),
  targetStageId: int("target_stage_id"),
  titleTemplate: varchar("title_template", { length: 255 }),
  copyAssignee: int("copy_assignee").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byRule: index("idx_rule_actions_mitra_rule").on(t.mitraId, t.ruleId, t.position),
}));

export type PipelineRuleAction = typeof pipelineRuleActions.$inferSelect;
```

- [ ] **Step 2: Add `actionId` to `pipelineRuleFieldMaps`**

In the `pipelineRuleFieldMaps` table, after `targetFieldId: int("target_field_id").notNull(),` add:
```ts
  actionId: int("action_id"),
```
Leave the existing `uniqueIndex("uniq_rule_field_map_source").on(t.ruleId, t.sourceFieldId)` AS-IS in the Drizzle schema for now (the runtime index swap happens in the migration, Task 2; Drizzle schema indexes are advisory here since tables are created via raw DDL).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors (purely additive). Note any residuals (there should be none - no consumer references the new table/column yet).

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(pipelines): schema for multi-action - pipeline_rule_actions + field_maps action_id (P4d-1)"
```

---

### Task 2: Startup migration

**Files:**
- Modify: `server/storage.ts` (the pipeline migration block - find with `grep -n "trigger_config" server/storage.ts`, add AFTER the P4c block)

Per [[reference-startup-add-column]]: info_schema guard + plain DDL; each ALTER in its own try/catch.

- [ ] **Step 1: Create table + add column + backfill + index swap**

Add after the P4c migration block:

```ts
// P4d-1 - multi-action
try {
  await this.pool.execute(`CREATE TABLE IF NOT EXISTS pipeline_rule_actions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mitra_id INT NOT NULL DEFAULT 1,
    rule_id INT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    action_type VARCHAR(16) NOT NULL,
    action_config TEXT NULL,
    target_pipeline_id INT NULL,
    target_stage_id INT NULL,
    title_template VARCHAR(255) NULL,
    copy_assignee INT NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    INDEX idx_rule_actions_mitra_rule (mitra_id, rule_id, position)
  )`);
} catch (e: any) { console.warn(`[migrate] create pipeline_rule_actions skipped: ${e?.message}`); }

try {
  const [cnt]: any = await this.pool.execute(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    ["pipeline_rule_field_maps", "action_id"],
  );
  if (Number((cnt as any[])[0].n) === 0) {
    await this.pool.execute("ALTER TABLE pipeline_rule_field_maps ADD COLUMN action_id INT NULL");
    console.log("[migrate] added pipeline_rule_field_maps.action_id");
  }
} catch (e: any) { console.warn(`[migrate] field_maps.action_id skipped: ${e?.message}`); }

// Backfill: one action per rule that has none yet; repoint its field-maps.
try {
  const [rules]: any = await this.pool.execute(
    `SELECT r.id, r.mitra_id, r.action_type, r.action_config, r.target_pipeline_id, r.target_stage_id, r.title_template, r.copy_assignee
     FROM pipeline_rules r
     LEFT JOIN pipeline_rule_actions a ON a.rule_id = r.id
     WHERE a.id IS NULL`,
  );
  const now = new Date().toISOString();
  for (const r of rules as any[]) {
    const [res]: any = await this.pool.execute(
      `INSERT INTO pipeline_rule_actions (mitra_id, rule_id, position, action_type, action_config, target_pipeline_id, target_stage_id, title_template, copy_assignee, created_at)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [r.mitra_id, r.id, r.action_type ?? "create_card", r.action_config ?? null, r.target_pipeline_id ?? null, r.target_stage_id ?? null, r.title_template ?? null, r.copy_assignee ?? 0, now],
    );
    const actionId = Number((res as any).insertId);
    await this.pool.execute(
      "UPDATE pipeline_rule_field_maps SET action_id = ? WHERE rule_id = ? AND action_id IS NULL",
      [actionId, r.id],
    );
  }
  if ((rules as any[]).length) console.log(`[migrate] backfilled ${(rules as any[]).length} rule(s) into pipeline_rule_actions`);
} catch (e: any) { console.warn(`[migrate] backfill rule actions skipped: ${e?.message}`); }

// Swap field-map unique index from (rule_id, source_field_id) → (action_id, source_field_id).
try { await this.pool.execute("ALTER TABLE pipeline_rule_field_maps DROP INDEX uniq_rule_field_map_source"); }
catch (e: any) { /* already dropped / never existed */ }
try { await this.pool.execute("ALTER TABLE pipeline_rule_field_maps ADD UNIQUE uniq_action_field_map_source (action_id, source_field_id)"); }
catch (e: any) { /* already added */ }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds (esbuild does not run the migration; this just confirms no syntax error).

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): startup migration - pipeline_rule_actions table + backfill + field-map index swap (P4d-1)"
```

---

### Task 3: Storage - action CRUD + rule wiring

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Import the new table/type**

Find the import of `pipelineRuleFieldMaps` from the shared schema (top of storage.ts) and add `pipelineRuleActions`. Add `PipelineRuleAction` to the type imports.

- [ ] **Step 2: Add action query + write methods**

After the existing `setRuleFieldMaps` method (~line 2244), add:

```ts
  async listRuleActions(ruleId: number): Promise<PipelineRuleAction[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRuleActions)
      .where(and(eq(pipelineRuleActions.mitraId, mitraId), eq(pipelineRuleActions.ruleId, ruleId)))
      .orderBy(asc(pipelineRuleActions.position), asc(pipelineRuleActions.id));
  }

  async getActionFieldMaps(actionId: number): Promise<PipelineRuleFieldMap[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRuleFieldMaps)
      .where(and(eq(pipelineRuleFieldMaps.mitraId, mitraId), eq(pipelineRuleFieldMaps.actionId, actionId)));
  }

  /** Replace ALL actions (and their field-maps) for a rule. */
  async setRuleActions(ruleId: number, actions: {
    actionType: string; actionConfig?: any | null;
    targetPipelineId?: number | null; targetStageId?: number | null;
    titleTemplate?: string | null; copyAssignee?: number;
    fieldMaps?: { sourceFieldId: number; targetFieldId: number }[];
  }[]): Promise<void> {
    const mitraId = getMitraId();
    // delete existing field-maps + actions for this rule
    await this.db.delete(pipelineRuleFieldMaps).where(and(eq(pipelineRuleFieldMaps.mitraId, mitraId), eq(pipelineRuleFieldMaps.ruleId, ruleId)));
    await this.db.delete(pipelineRuleActions).where(and(eq(pipelineRuleActions.mitraId, mitraId), eq(pipelineRuleActions.ruleId, ruleId)));
    const now = new Date().toISOString();
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const res = await this.db.insert(pipelineRuleActions).values({
        mitraId, ruleId, position: i,
        actionType: a.actionType,
        actionConfig: a.actionConfig != null ? JSON.stringify(a.actionConfig) : null,
        targetPipelineId: a.targetPipelineId ?? null,
        targetStageId: a.targetStageId ?? null,
        titleTemplate: a.titleTemplate ?? null,
        copyAssignee: a.copyAssignee ? 1 : 0,
        createdAt: now,
      } as any);
      const actionId = Number((res[0] as any).insertId);
      if (a.actionType === "create_card" && a.fieldMaps?.length) {
        for (const m of a.fieldMaps) {
          await this.db.insert(pipelineRuleFieldMaps).values({
            mitraId, ruleId, actionId, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId, createdAt: now,
          } as any);
        }
      }
    }
  }
```

- [ ] **Step 3: Wire `actions` into createRule / updateRule**

In `createRule`'s data type, add `actions?: { ... }[]` (same shape as `setRuleActions`'s param). After the rule row is inserted and `row` is selected (where it currently does `if (data.fieldMaps) await this.setRuleFieldMaps(...)`), replace that fieldMaps line with:
```ts
    if (data.actions) await this.setRuleActions(row!.id, data.actions);
```
Keep the legacy `actionType`/`actionConfig`/etc. columns being written from `data` (they stay as legacy backfill source - harmless). If they're no longer passed, they default to existing column defaults.

In `updateRule`'s data type, add `actions?: { ... }[]`. Where it currently does `if (data.fieldMaps !== undefined) await this.setRuleFieldMaps(id, data.fieldMaps);`, replace with:
```ts
    if (data.actions !== undefined) await this.setRuleActions(id, data.actions);
```

- [ ] **Step 4: Cascade delete actions in `deleteRule`**

In `deleteRule`, before/after the existing field-map delete, add a delete of the rule's actions:
```ts
    await this.db.delete(pipelineRuleActions).where(and(eq(pipelineRuleActions.ruleId, id), eq(pipelineRuleActions.mitraId, mitraId)));
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: storage.ts compiles. Residuals expected in `server/pipeline-automation.ts` (still calls old single-action path) + `server/routes.ts` (still sends single-action) + client - fixed in later tasks. Report residual list.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage - listRuleActions/getActionFieldMaps/setRuleActions + rule action wiring (P4d-1)"
```

---

### Task 4: Engine - `applyAction` + `applyRuleActions`

**Files:**
- Modify: `server/pipeline-automation.ts`

Read the file first. It currently has `applyRuleAction(rule, card, actorId)` (the action switch) called by `runStageEnterAutomations` + `runTimeTriggers`.

- [ ] **Step 1: Add `applyAction(action, card, actorId)`**

Add this function - it is the existing `applyRuleAction` switch, but reading from a `PipelineRuleAction` row (and field-maps via `getActionFieldMaps(action.id)`). Import `PipelineRuleAction` type.

```ts
import type { PipelineCard, PipelineRule, PipelineRuleAction } from "../shared/schema.js";

/** Run a single action against a card. Returns true if it mutated. Loop-safe (storage-direct). */
export async function applyAction(action: PipelineRuleAction, card: PipelineCard, actorId: number): Promise<boolean> {
  if (action.actionType === "create_card") {
    const targetStages = await storage.listStages(action.targetPipelineId!);
    if (!targetStages.some((s) => s.id === action.targetStageId)) {
      console.warn(`[automation] action ${action.id}: target stage ${action.targetStageId} no longer exists - skipped`);
      return false;
    }
    const assigneeId = (action.copyAssignee && card.assigneeId && await storage.canUserAccessPipeline(card.assigneeId, action.targetPipelineId!))
      ? card.assigneeId : null;
    if (action.copyAssignee && card.assigneeId && assigneeId === null) {
      console.warn(`[automation] action ${action.id}: assignee ${card.assigneeId} lacks access to pipeline ${action.targetPipelineId} - created unassigned`);
    }
    const newCard = await storage.createCard(action.targetPipelineId!, {
      stageId: action.targetStageId!,
      title: buildTargetTitle(action.titleTemplate, card.title),
      description: `Dibuat otomatis dari kartu #${card.id}`,
      assigneeId,
    }, actorId);
    const maps = await storage.getActionFieldMaps(action.id);
    if (maps.length) {
      const srcVals = await storage.getCardValues(card.id);
      const targetFieldIds = new Set((await storage.listFields(action.targetPipelineId!)).map((f) => f.id));
      const validMaps = maps.filter((m) => targetFieldIds.has(m.targetFieldId));
      const writes = pickMappedValues(validMaps, srcVals);
      if (writes.length) await storage.setCardValues(newCard.id, writes);
    }
    return true;
  }
  if (action.actionType === "set_field") {
    const cfg = parseActionConfig("set_field", action.actionConfig) as { fieldId: number; value: string } | null;
    const fieldIds = new Set((await storage.listFields(card.pipelineId)).map((f) => f.id));
    if (cfg && fieldIds.has(cfg.fieldId)) {
      await storage.setCardValues(card.id, [{ fieldId: cfg.fieldId, value: cfg.value }]);
      return true;
    }
    console.warn(`[automation] action ${action.id}: set_field config invalid or field missing - skipped`);
    return false;
  }
  if (action.actionType === "move_stage") {
    const cfg = parseActionConfig("move_stage", action.actionConfig) as { stageId: number } | null;
    const stageIds = new Set((await storage.listStages(card.pipelineId)).map((s) => s.id));
    if (cfg && stageIds.has(cfg.stageId) && cfg.stageId !== card.stageId) {
      await storage.moveCard(card.id, cfg.stageId, undefined, actorId);
      return true;
    }
    console.warn(`[automation] action ${action.id}: move_stage config invalid, stage missing, or no-op - skipped`);
    return false;
  }
  if (action.actionType === "assign") {
    const cfg = parseActionConfig("assign", action.actionConfig) as { assigneeId: number | null } | null;
    if (!cfg) { console.warn(`[automation] action ${action.id}: assign config invalid - skipped`); return false; }
    if (cfg.assigneeId != null && !(await storage.canUserAccessPipeline(cfg.assigneeId, card.pipelineId))) {
      console.warn(`[automation] action ${action.id}: assignee ${cfg.assigneeId} lacks access to pipeline ${card.pipelineId} - skipped`);
      return false;
    }
    await storage.updateCard(card.id, { assigneeId: cfg.assigneeId }, actorId);
    return true;
  }
  return false;
}

/** Run ALL of a rule's actions in order. Returns true if ANY action mutated. */
export async function applyRuleActions(rule: PipelineRule, card: PipelineCard, actorId: number): Promise<boolean> {
  const actions = await storage.listRuleActions(rule.id);
  let acted = false;
  for (const action of actions) {
    try {
      if (await applyAction(action, card, actorId)) acted = true;
    } catch (e: any) {
      console.warn(`[automation] rule ${rule.id} action ${action.id} failed: ${e?.message}`);
    }
  }
  return acted;
}
```

- [ ] **Step 2: Replace `applyRuleAction` calls with `applyRuleActions`**

In `runStageEnterAutomations` and `runTimeTriggers`, change `const acted = await applyRuleAction(rule, card, actorId);` (and the time variant `applyRuleAction(rule, card, rule.createdBy)`) to `applyRuleActions(...)`. Then DELETE the old `applyRuleAction` function entirely (it's replaced by `applyAction` + `applyRuleActions`).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: `pipeline-automation.ts` = 0 errors. Residuals only in `routes.ts` + client. Report residuals.

- [ ] **Step 4: Run helper tests (regression)**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: all pass (unchanged).

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(pipelines): engine - applyAction per action + applyRuleActions loop (P4d-1)"
```

---

### Task 5: Pure helper `shapeRuleActions` + tests (TDD)

**Files:**
- Modify: `server/pipeline-automation-helpers.ts`, `server/pipeline-automation-helpers.test.ts`

This shapes a rule's raw actions + field-maps into the GET response view (labels resolved from caller-provided lookups). Pure - no DB.

- [ ] **Step 1: Write failing tests**

Extend the import in the test file to add `shapeRuleActions`. Append:

```ts
test("shapeRuleActions: set_field/move_stage/assign labels + create_card target + maps", () => {
  const fields = new Map([[3, { label: "Status", type: "text" }]]);
  const stages = new Map([[7, "Lunas"]]);
  const users = new Map([[12, "Budi"]]);
  const pipes = new Map([[2, "Instalasi"]]);
  const tgtStages = new Map([[2, new Map([[20, "Survey"]])]]);
  const tgtFields = new Map([[2, new Map([[9, { label: "Harga", type: "number" }]])]]);
  const actions = [
    { id: 1, position: 0, actionType: "set_field", actionConfig: JSON.stringify({ fieldId: 3, value: "Diproses" }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 2, position: 1, actionType: "move_stage", actionConfig: JSON.stringify({ stageId: 7 }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 3, position: 2, actionType: "assign", actionConfig: JSON.stringify({ assigneeId: 12 }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 },
    { id: 4, position: 3, actionType: "create_card", actionConfig: null, targetPipelineId: 2, targetStageId: 20, titleTemplate: "X", copyAssignee: 1 },
  ];
  const mapsByAction = new Map([[4, [{ id: 5, sourceFieldId: 3, targetFieldId: 9 }]]]);
  const out = shapeRuleActions(actions as any, { fields, stages, users, pipes, tgtStages, tgtFields, mapsByAction });
  assert.equal(out[0].setFieldLabel, "Status");
  assert.deepEqual(out[0].actionConfig, { fieldId: 3, value: "Diproses" });
  assert.equal(out[1].moveStageName, "Lunas");
  assert.equal(out[2].assigneeName, "Budi");
  assert.equal(out[3].targetPipelineName, "Instalasi");
  assert.equal(out[3].targetStageName, "Survey");
  assert.equal(out[3].fieldMaps[0].sourceFieldLabel, "Status");
  assert.equal(out[3].fieldMaps[0].targetFieldLabel, "Harga");
});

test("shapeRuleActions: deleted refs → (dihapus) fallbacks", () => {
  const empty = new Map();
  const out = shapeRuleActions(
    [{ id: 1, position: 0, actionType: "move_stage", actionConfig: JSON.stringify({ stageId: 99 }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 }] as any,
    { fields: empty, stages: empty, users: empty, pipes: empty, tgtStages: empty, tgtFields: empty, mapsByAction: new Map() },
  );
  assert.equal(out[0].moveStageName, "Stage #99 (dihapus)");
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: FAIL - `shapeRuleActions` not exported.

- [ ] **Step 3: Implement `shapeRuleActions`**

Append to `server/pipeline-automation-helpers.ts` (it already has `shapeRuleFieldMaps`, `parseActionConfig`):

```ts
type Lk = {
  fields: Map<number, { label: string; type: string }>;
  stages: Map<number, string>;
  users: Map<number, string>;
  pipes: Map<number, string>;
  tgtStages: Map<number, Map<number, string>>;
  tgtFields: Map<number, Map<number, { label: string; type: string }>>;
  mapsByAction: Map<number, { id: number; sourceFieldId: number; targetFieldId: number }[]>;
};

/** Shape raw rule actions into the GET response view with resolved labels. Pure. */
export function shapeRuleActions(
  actions: { id: number; position: number; actionType: string; actionConfig: string | null; targetPipelineId: number | null; targetStageId: number | null; titleTemplate: string | null; copyAssignee: number }[],
  lk: Lk,
): any[] {
  return actions.map((a) => {
    const base: any = { ...a, actionConfig: null as any };
    if (a.actionType === "set_field") {
      const cfg = parseActionConfig("set_field", a.actionConfig) as { fieldId: number; value: string } | null;
      if (cfg) {
        base.actionConfig = cfg;
        base.setFieldLabel = lk.fields.get(cfg.fieldId)?.label ?? `Field #${cfg.fieldId} (dihapus)`;
        base.setFieldType = lk.fields.get(cfg.fieldId)?.type ?? null;
      }
    } else if (a.actionType === "move_stage") {
      const cfg = parseActionConfig("move_stage", a.actionConfig) as { stageId: number } | null;
      if (cfg) { base.actionConfig = cfg; base.moveStageName = lk.stages.get(cfg.stageId) ?? `Stage #${cfg.stageId} (dihapus)`; }
    } else if (a.actionType === "assign") {
      const cfg = parseActionConfig("assign", a.actionConfig) as { assigneeId: number | null } | null;
      if (cfg) { base.actionConfig = cfg; base.assigneeName = cfg.assigneeId == null ? undefined : (lk.users.get(cfg.assigneeId) ?? `User #${cfg.assigneeId} (dihapus)`); }
    } else if (a.actionType === "create_card") {
      base.targetPipelineName = a.targetPipelineId != null ? (lk.pipes.get(a.targetPipelineId) ?? `Pipeline #${a.targetPipelineId}`) : undefined;
      base.targetStageName = (a.targetPipelineId != null && a.targetStageId != null)
        ? (lk.tgtStages.get(a.targetPipelineId)?.get(a.targetStageId) ?? `Stage #${a.targetStageId} (dihapus)`) : undefined;
      const srcFields = lk.fields;
      const tgt = (a.targetPipelineId != null && lk.tgtFields.get(a.targetPipelineId)) || new Map<number, { label: string; type: string }>();
      base.fieldMaps = shapeRuleFieldMaps(lk.mapsByAction.get(a.id) ?? [], srcFields, tgt);
    }
    if (a.actionType !== "create_card") base.fieldMaps = [];
    return base;
  });
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: all pass (prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation-helpers.ts server/pipeline-automation-helpers.test.ts
git commit -m "feat(pipelines): pure shapeRuleActions helper for GET enrichment + tests (P4d-1)"
```

---

### Task 6: Routes - `actions[]` validation (POST/PATCH) + enrichment (GET)

**Files:**
- Modify: `server/routes.ts` (rule routes ~4627-4775)

- [ ] **Step 1: Extend the helper import**

Add `shapeRuleActions` to the existing import from `./pipeline-automation-helpers.js`.

- [ ] **Step 2: Add `validateActions` helper**

Near `validateActionConfig`/`validateRuleFieldMaps`, add:

```ts
async function validateActions(req: any, pipelineId: number, actions: any): Promise<string | null> {
  if (!Array.isArray(actions) || actions.length === 0) return "Minimal satu aksi wajib";
  for (const a of actions) {
    const t = String(a?.actionType ?? "");
    if (t === "create_card") {
      if (!a.targetPipelineId || !a.targetStageId) return "create_card: targetPipelineId & targetStageId wajib";
      if ((await getPipelineLevel(req, Number(a.targetPipelineId))) === "none") return "Tidak punya akses ke pipeline target";
      const mapErr = await validateRuleFieldMaps(pipelineId, Number(a.targetPipelineId), a.fieldMaps);
      if (mapErr) return mapErr;
    } else if (t === "set_field" || t === "move_stage" || t === "assign") {
      const cfgErr = await validateActionConfig(pipelineId, t, a.actionConfig);
      if (cfgErr) return cfgErr;
    } else {
      return `Tipe aksi tidak dikenal: ${t}`;
    }
  }
  return null;
}
```

- [ ] **Step 3: POST - accept `actions[]`**

In `router.post("/api/pipelines/:id/rules", ...)`, REMOVE the single-action branching (the `const actionType = ...`, the `if (actionType === "create_card") {...}` create_card block, the generic-action block, and the old `validateActionConfig`/`validateRuleFieldMaps` single calls). Keep the conditions + trigger validation. Replace the action handling with:
```ts
    const actErr = await validateActions(req, pid, b.actions);
    if (actErr) return sendError(res, actErr, 400);
    return sendSuccess(res, await storage.createRule(pid, {
      name: b.name,
      triggerType: (b.triggerType ?? "stage_enter"),
      triggerStageId: b.triggerStageId != null ? Number(b.triggerStageId) : null,
      triggerConfig: (b.triggerType === "time") ? (b.triggerConfig ?? null) : null,
      enabled: b.enabled,
      conditions: b.conditions ?? null,
      actions: b.actions.map((a: any) => ({
        actionType: String(a.actionType),
        actionConfig: a.actionConfig ?? null,
        targetPipelineId: a.targetPipelineId != null ? Number(a.targetPipelineId) : null,
        targetStageId: a.targetStageId != null ? Number(a.targetStageId) : null,
        titleTemplate: a.titleTemplate ?? null,
        copyAssignee: a.copyAssignee ? 1 : 0,
        fieldMaps: a.fieldMaps,
      })),
    }, req.authUser!.id));
```
(Keep the existing `validateTriggerConfig` + `validateConditions` calls earlier in the handler.)

- [ ] **Step 4: PATCH - accept `actions[]`**

In `router.patch(...)`, REMOVE the single-action `fieldMaps`/`actionConfig` validation blocks. After the trigger/conditions validation, add:
```ts
    if (b.actions !== undefined) {
      const actErr = await validateActions(req, pid, b.actions);
      if (actErr) return sendError(res, actErr, 400);
    }
```
In the `storage.updateRule(...)` call, REMOVE the `actionType`/`targetPipelineId`/`targetStageId`/`titleTemplate`/`copyAssignee`/`actionConfig`/`fieldMaps` fields and ADD:
```ts
        actions: b.actions !== undefined ? b.actions.map((a: any) => ({
          actionType: String(a.actionType),
          actionConfig: a.actionConfig ?? null,
          targetPipelineId: a.targetPipelineId != null ? Number(a.targetPipelineId) : null,
          targetStageId: a.targetStageId != null ? Number(a.targetStageId) : null,
          titleTemplate: a.titleTemplate ?? null,
          copyAssignee: a.copyAssignee ? 1 : 0,
          fieldMaps: a.fieldMaps,
        })) : undefined,
```
(Keep `name`, trigger fields, `conditions`, `enabled`. Preserve the "Rule tidak ditemukan"→404 catch.)

- [ ] **Step 5: GET - enrich with `actions[]`**

In `router.get("/api/pipelines/:id/rules", ...)`: load all actions for the page's rules and shape them. After `const rules = await storage.listRules(pid);` and the existing lookups (`pipeName`, `srcFields`, `selfStages`, `userName`), add:
```ts
    const actionsByRule = new Map<number, any[]>();
    const allActions: any[] = [];
    for (const r of rules) {
      const acts = await storage.listRuleActions(r.id);
      actionsByRule.set(r.id, acts);
      allActions.push(...acts);
    }
    // batch target pipelines across all create_card actions
    const tgtIds = [...new Set(allActions.filter((a) => a.actionType === "create_card" && a.targetPipelineId).map((a) => a.targetPipelineId as number))];
    const tgtStages = new Map<number, Map<number, string>>();
    const tgtFields = new Map<number, Map<number, { label: string; type: string }>>();
    await Promise.all(tgtIds.map(async (tid) => {
      const [stages, fields] = await Promise.all([storage.listStages(tid), storage.listFields(tid)]);
      tgtStages.set(tid, new Map(stages.map((s) => [s.id, s.label])));
      tgtFields.set(tid, new Map(fields.map((f) => [f.id, { label: f.label, type: f.type }])));
    }));
    // field-maps per action (only create_card actions have them)
    const mapsByAction = new Map<number, any[]>();
    await Promise.all(allActions.filter((a) => a.actionType === "create_card").map(async (a) => {
      mapsByAction.set(a.id, (await storage.getActionFieldMaps(a.id)).map((m) => ({ id: m.id, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId })));
    }));
    const lk = {
      fields: srcFields, stages: selfStages, users: userName,
      pipes: pipeName, tgtStages, tgtFields, mapsByAction,
    };
```
NOTE: `pipeName`/`srcFields`/`selfStages`/`userName` already exist in the handler as Maps (verify their shapes: `pipeName` Map<id,name>, `srcFields` Map<id,{label,type}>, `selfStages` Map<id,label>, `userName` Map<id,name>). Then in the per-rule `.map`, REMOVE the old single-action enrichment (`actionConfig`, `setFieldLabel`, `moveStageName`, `assigneeName`, the per-rule `fieldMaps`/`getRuleFieldMaps`, `targetPipelineName`/`targetStageName`) and ADD to the returned object:
```ts
        actions: shapeRuleActions(actionsByRule.get(r.id) ?? [], lk),
```
Keep the trigger enrichment (`triggerConfig`/`triggerFieldLabel`/`triggerStageScopeName`) and `conditions` enrichment as-is.

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: routes.ts = 0 errors. Only client residuals remain. Report.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): rule routes - actions[] validation + GET enrichment (P4d-1)"
```

---

### Task 7: Client hook types

**Files:**
- Modify: `client/hooks/usePipelines.ts`

- [ ] **Step 1: Add a `RuleActionView` type + put `actions` on `RuleWithMaps`**

Add a `RuleActionView` type and extend `RuleWithMaps`. Remove the now-obsolete single-action enriched fields (`setFieldLabel`, `setFieldType`, `moveStageName`, `assigneeName`, `fieldMaps`, `targetPipelineName`, `targetStageName`, `actionConfig`) from `RuleWithMaps` and instead add `actions`:

```ts
export type RuleActionView = {
  id: number; position: number; actionType: string;
  actionConfig: any | null;
  targetPipelineId: number | null; targetStageId: number | null;
  titleTemplate: string | null; copyAssignee: number;
  setFieldLabel?: string; setFieldType?: string | null;
  moveStageName?: string; assigneeName?: string;
  targetPipelineName?: string; targetStageName?: string;
  fieldMaps: RuleFieldMap[];
};
```
In `RuleWithMaps`: remove `actionConfig`, `setFieldLabel`, `setFieldType`, `moveStageName`, `assigneeName`, `targetPipelineName`, `targetStageName`, `fieldMaps` (the per-rule ones); add `actions?: RuleActionView[];`. Keep the trigger + conditions fields.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: NEW errors now appear in `ruleFormState.ts` + `PipelineRulesDialog.tsx` (they read the removed fields) - those are fixed in Tasks 8-10. Report the residual list (should be confined to those two files).

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): RuleWithMaps carries actions[] view (P4d-1)"
```

---

### Task 8: `ruleFormState.ts` - actions array

**Files:**
- Modify: `client/components/pipelines/ruleFormState.ts`

- [ ] **Step 1: Add `ActionDraft` + `emptyAction`, change `RuleDraft`**

Replace the flat action fields in `RuleDraft` (`actionType`, `targetPipelineId`, `targetStageId`, `titleTemplate`, `copyAssignee`, `maps`, `setFieldId`, `setFieldValue`, `moveStageId`, `assignUserId`) with `actions: ActionDraft[]`. Add:
```ts
export type ActionDraft = {
  actionType: PipelineRuleActionType;
  targetPipelineId: string;
  targetStageId: string;
  titleTemplate: string;
  copyAssignee: boolean;
  maps: { sourceFieldId: number | ""; targetFieldId: number | "" }[];
  setFieldId: string;
  setFieldValue: string;
  moveStageId: string;
  assignUserId: string;
};

export function emptyAction(): ActionDraft {
  return { actionType: "create_card", targetPipelineId: "", targetStageId: "", titleTemplate: "", copyAssignee: false, maps: [], setFieldId: "", setFieldValue: "", moveStageId: "", assignUserId: "" };
}
```
`emptyDraft()` keeps trigger + conditions fields and sets `actions: [emptyAction()]`.

- [ ] **Step 2: `ruleToDraft` maps `r.actions` → `ActionDraft[]`**

Replace the single-action hydration block (lines ~78-95) with:
```ts
  d.actions = (r.actions ?? []).map((a): ActionDraft => {
    const act = emptyAction();
    act.actionType = a.actionType as PipelineRuleActionType;
    if (a.actionType === "create_card") {
      act.targetPipelineId = a.targetPipelineId != null ? String(a.targetPipelineId) : "";
      act.targetStageId = a.targetStageId != null ? String(a.targetStageId) : "";
      act.titleTemplate = a.titleTemplate ?? "";
      act.copyAssignee = a.copyAssignee === 1;
      act.maps = (a.fieldMaps ?? []).map((m) => ({ sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId }));
    } else if (a.actionType === "set_field") {
      const cfg = a.actionConfig as SetFieldConfig | null;
      act.setFieldId = cfg ? String(cfg.fieldId) : "";
      act.setFieldValue = cfg?.value ?? "";
    } else if (a.actionType === "move_stage") {
      const cfg = a.actionConfig as MoveStageConfig | null;
      act.moveStageId = cfg ? String(cfg.stageId) : "";
    } else if (a.actionType === "assign") {
      const cfg = a.actionConfig as AssignConfig | null;
      act.assignUserId = cfg && cfg.assigneeId != null ? String(cfg.assigneeId) : "";
    }
    return act;
  });
  if (d.actions.length === 0) d.actions = [emptyAction()];
```

- [ ] **Step 3: `draftToPayload` emits `actions[]`**

Replace the per-action return blocks (lines ~135-176) with: build `triggerPart` + `conditions` as now, then map+validate each action into an `actions` array, returning ONE payload:
```ts
  const actions: Record<string, any>[] = [];
  for (const a of d.actions) {
    if (a.actionType === "create_card") {
      if (!a.targetPipelineId || !a.targetStageId) return { ok: false, error: "Lengkapi target create_card sebelum menyimpan" };
      actions.push({
        actionType: "create_card",
        targetPipelineId: Number(a.targetPipelineId),
        targetStageId: Number(a.targetStageId),
        titleTemplate: a.titleTemplate.trim() || null,
        copyAssignee: a.copyAssignee ? 1 : 0,
        fieldMaps: a.maps
          .filter((r) => r.sourceFieldId !== "" && r.targetFieldId !== "")
          .map((r) => ({ sourceFieldId: Number(r.sourceFieldId), targetFieldId: Number(r.targetFieldId) })),
      });
    } else if (a.actionType === "set_field") {
      if (!a.setFieldId) return { ok: false, error: "Pilih field tujuan (set_field)" };
      actions.push({ actionType: "set_field", actionConfig: { fieldId: Number(a.setFieldId), value: a.setFieldValue } });
    } else if (a.actionType === "move_stage") {
      if (!a.moveStageId) return { ok: false, error: "Pilih stage tujuan (move_stage)" };
      actions.push({ actionType: "move_stage", actionConfig: { stageId: Number(a.moveStageId) } });
    } else if (a.actionType === "assign") {
      actions.push({ actionType: "assign", actionConfig: { assigneeId: a.assignUserId ? Number(a.assignUserId) : null } });
    } else {
      return { ok: false, error: "Tipe aksi tidak dikenal" };
    }
  }
  if (actions.length === 0) return { ok: false, error: "Minimal satu aksi wajib" };
  return { ok: true, payload: { ...triggerPart, conditions, actions } };
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: ruleFormState.ts = 0 errors. Only `PipelineRulesDialog.tsx` residuals remain. Report.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/ruleFormState.ts
git commit -m "feat(pipelines): ruleFormState over actions[] - ActionDraft + draft<->payload (P4d-1)"
```

---

### Task 9: New `RuleActionEditor.tsx` component

**Files:**
- Create: `client/components/pipelines/RuleActionEditor.tsx`
- Reference (extract from): `client/components/pipelines/PipelineRulesDialog.tsx`

Extract the per-action UI (the `actionType` selector + the create_card/set_field/move_stage/assign blocks incl. field-map rows) currently inline in the dialog into a reusable component editing ONE `ActionDraft`.

- [ ] **Step 1: Create the component**

Create `client/components/pipelines/RuleActionEditor.tsx` exporting:
```ts
export function RuleActionEditor(props: {
  value: ActionDraft;
  onChange: (next: ActionDraft) => void;
  sourceFields: { id: number; label: string; type: string }[];
  selfStages: { id: number; label: string }[];
  allPipelines: { id: number; name: string }[];
  staffUsers: { id: number; name?: string; username?: string }[];
}): JSX.Element
```
Move the dialog's existing action JSX here, rebinding each field to `props.value.*` and emitting `props.onChange({ ...props.value, field: v })`. Key adaptations from the dialog's current inline version:
- The action-type `<Combobox>` sets `actionType`.
- create_card block: target pipeline/stage Comboboxes use `props.allPipelines` / the target pipeline's stages. NOTE: the dialog currently loads target stages/fields via a `usePipeline(targetPipelineId)` query at the dialog level for ONE target. Since each action can have its own target, fetch per-action inside `RuleActionEditor` with `usePipeline(value.targetPipelineId ? Number(value.targetPipelineId) : null)` and `usePipelineMutations(...)` for the "+ Buat di target" create-field affordance. (Import `usePipeline`, `usePipelineMutations` from `@/hooks/usePipelines`.)
- The field-map rows operate on `props.value.maps` via `onChange`.
- All buttons inside get `type="button"` (they render inside the dialog's `<form>`).
Use the same shadcn `FormField`/`Combobox`/`Input`/`Button`/`Switch` imports and styling as the dialog.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: the new component compiles. The dialog still has its old inline action code (residual errors there are fine until Task 10). Report.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/RuleActionEditor.tsx
git commit -m "feat(pipelines): RuleActionEditor component - single-action editor (P4d-1)"
```

---

### Task 10: Dialog - action list (add/remove/reorder) + read-side

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

- [ ] **Step 1: Replace single-action state/UI with an actions list**

- Remove the now-stale single-action state hooks (`actionType`, `targetPipelineId`, `targetStageId`, `titleTemplate`, `copyAssignee`, `maps`, `setFieldId`, `setFieldValue`, `moveStageId`, `assignUserId`) and their `applyDraft`/`currentDraft` lines; replace with one `const [actions, setActions] = useState<ActionDraft[]>([emptyAction()]);` (import `ActionDraft`, `emptyAction`). Update `applyDraft` to `setActions(d.actions)` and `currentDraft` to include `actions` (and drop the removed fields). Update `resetForm`/`startEdit` accordingly (they already go through `applyDraft`).
- Remove the dialog-level `targetPipe`/`targetMutations`/`createInTarget`/map helpers (now inside `RuleActionEditor`).
- In the form JSX, replace the entire inline action section (the `<FormField label="Aksi">` selector + create_card/set_field/move_stage/assign blocks + the inline field-map UI) with an actions list:
```tsx
              <fieldset className="space-y-3 border-0 p-0 m-0">
                <legend className="text-xs font-semibold text-muted-foreground mb-1">Aksi (urut dijalankan dari atas)</legend>
                {actions.map((a, i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Aksi #{i + 1}</span>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Naikkan" disabled={i === 0}
                          onClick={() => setActions((arr) => moveItem(arr, i, i - 1))}><ChevronUp className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Turunkan" disabled={i === actions.length - 1}
                          onClick={() => setActions((arr) => moveItem(arr, i, i + 1))}><ChevronDown className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Hapus aksi" disabled={actions.length === 1}
                          onClick={() => setActions((arr) => arr.filter((_, idx) => idx !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <RuleActionEditor
                      value={a}
                      onChange={(next) => setActions((arr) => arr.map((x, idx) => (idx === i ? next : x)))}
                      sourceFields={sourceFields}
                      selfStages={selfStages}
                      allPipelines={allPipelines ?? []}
                      staffUsers={staffUsers ?? []}
                    />
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => setActions((arr) => [...arr, emptyAction()])}>+ Tambah aksi</Button>
              </fieldset>
```
Add a small local helper near the other helpers:
```ts
  const moveItem = <T,>(arr: T[], from: number, to: number): T[] => {
    if (to < 0 || to >= arr.length) return arr;
    const copy = [...arr]; const [it] = copy.splice(from, 1); copy.splice(to, 0, it); return copy;
  };
```
Import `ChevronUp` from lucide-react. `sourceFields`, `selfStages`, `allPipelines`, `staffUsers` already exist in the dialog.

- [ ] **Step 2: Read-side - summary + detail over actions**

- Replace `actionSummary(r)` so it summarizes the action LIST. New version:
```tsx
  const actionSummary = (r: RuleWithMaps) => {
    const acts = r.actions ?? [];
    if (acts.length === 0) return <span className="italic text-muted-foreground">tanpa aksi</span>;
    const label = (a: any) =>
      a.actionType === "set_field" ? `set ${a.setFieldLabel ?? "?"}` :
      a.actionType === "move_stage" ? `pindah ke ${a.moveStageName ?? "?"}` :
      a.actionType === "assign" ? `tugaskan ${a.assigneeName ?? "kosong"}` :
      `buat kartu di ${a.targetPipelineName ?? "?"}`;
    return <span>{acts.length === 1 ? label(acts[0]) : `${acts.length} aksi: ${acts.map(label).join(" → ")}`}</span>;
  };
```
- In the detail panel, replace the single "Aksi" block + the create_card-specific block with a list over `r.actions`, each rendering its type-specific summary (reuse `label` above) and, for create_card, its `fieldMaps` (each `m.sourceFieldLabel → m.targetFieldLabel`). Keep the existing Trigger + Syarat (conditions) blocks unchanged.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: **0 typecheck errors**, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): rule dialog action list (add/remove/reorder) + read-side over actions (P4d-1)"
```

- [ ] **Step 5: Manual checklist (relay to user; run on dev)**

- Create rule: action #1 create_card in B, action #2 move_stage source → terminal → trigger → new card in B AND source moves.
- Two set_field actions → both applied; reorder → persists + fires in new order.
- Two create_card actions each with own field-maps → both create with correct mapped values.
- Edit a migrated single-action rule → its action hydrates; add a 2nd action; save.
- Remove down to one action; save → still works. Zero actions blocked (can't remove last; server rejects empty).
- A failing action (move to deleted stage) → others still run (check logs); rule still records fire.
- Dedup unchanged (once); time `every` re-fires the whole list.

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 schema → T1; §2 migration → T2; §3 engine → T4; §4 storage → T3; §5 routes → T6 (+ §enrichment helper → T5); §6 frontend → T7/T8/T9/T10; §7 edge cases → engine per-action try/catch (T4) + validateActions ≥1 (T6) + manual (T10).
- **Type consistency:** `ActionInput`/`setRuleActions` param shape identical in T3 + T6; `ActionDraft` identical in T8 + T9 + T10; `RuleActionView`/`actions` on `RuleWithMaps` (T7) consumed by `ruleToDraft` (T8) + read-side (T10); `shapeRuleActions` signature (T5) called in GET (T6) with the `lk` lookup object whose Maps match.
- **Residual-error tracking:** T7 removes single-action fields from `RuleWithMaps`, breaking `ruleFormState.ts` + dialog; fixed in T8 + T10. Each task states expected residuals.
- **Conditions stay rule-level** (unchanged) - trigger + conditions validation in routes is untouched.
- **No placeholders**; pure helper (`shapeRuleActions`) is TDD'd; client logic (`draftToPayload`/`ruleToDraft`) pure + reviewable; UI verified via typecheck/build/manual (no client test runner).
