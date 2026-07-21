# Pipelines Time-based Triggers (P4c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable **time-based trigger** to pipeline automation rules - a rule fires based on elapsed time (anchored to stage-entry, card creation, or a date custom-field) rather than only on stage-enter - reusing the existing action + condition machinery, evaluated by a cron-hit tick endpoint.

**Architecture:** Extend the flat `pipeline_rules` row (Approach A) with `trigger_type` + `trigger_config` (JSON) and relax `trigger_stage_id` to nullable; add `stage_entered_at` to `pipeline_cards`. A pure `isTimeRuleDue` helper decides due-ness; the P4b-1 action switch is extracted into a shared `applyRuleAction`; a new `runTimeTriggers()` service scans `time` rules globally and fires per-mitra inside `tenantContext.run`. A secret-guarded `POST /api/pipelines/automation/tick` runs one pass, driven by a cPanel cron.

**Tech Stack:** Node 20 + Express 5 + Drizzle (MySQL) + tsx; React 18 + Vite + TanStack Query; tests via `node:test` (`npx tsx --test`).

**Base branch:** `feat/pipelines-time-triggers` (off `dev`, P4b-1 merged). Spec: `docs/superpowers/specs/2026-06-06-pipelines-time-triggers-design.md`.

**Verification commands (whole-repo):**
- Typecheck: `npm run typecheck` (must end at **0 errors** by Task 12; intermediate tasks list expected residuals).
- Helper tests: `npx tsx --test server/pipeline-automation-helpers.test.ts`
- Build: `npm run build`

---

### Task 1: Schema columns + trigger types

**Files:**
- Modify: `shared/schema.ts` (`pipelineRules` ~586-605, `pipelineCards` ~478-496, types ~634)

- [ ] **Step 1: Add columns to `pipelineRules`**

In the `pipelineRules` table definition, after the `conditions: text("conditions"),` line add:

```ts
  triggerType: varchar("trigger_type", { length: 16 }).notNull().default("stage_enter"),
  triggerConfig: text("trigger_config"),
```

And relax the trigger stage column - change:

```ts
  triggerStageId: int("trigger_stage_id").notNull(),
```
to:
```ts
  triggerStageId: int("trigger_stage_id"),
```

- [ ] **Step 2: Add `stageEnteredAt` to `pipelineCards`**

In `pipelineCards`, after `updatedAt: text("updated_at"),` add:

```ts
  stageEnteredAt: text("stage_entered_at"),
```

- [ ] **Step 3: Add trigger types**

After `export type PipelineRuleActionType = ...` add:

```ts
export type RuleTriggerType = "stage_enter" | "time";
export type TimeAnchor = "stage_entered" | "card_created" | "field_date";
export type TimeOffsetUnit = "hours" | "days";
export type TimeDirection = "after" | "before";
export type TimeRepeat = "once" | "every";
export type TimeTriggerConfig = {
  anchor: TimeAnchor;
  fieldId?: number;
  offsetN: number;
  offsetUnit: TimeOffsetUnit;
  direction: TimeDirection;
  repeat: TimeRepeat;
  repeatEveryN?: number;
};
```

- [ ] **Step 4: Typecheck (expect residuals)**

Run: `npm run typecheck`
Expected: errors ONLY in `server/storage.ts` (createRule/updateRule don't pass new fields - fine) and possibly none else yet. Relaxing `triggerStageId` to nullable may surface errors where code assumes non-null (`server/pipeline-automation.ts`, `client/components/pipelines/PipelineRulesDialog.tsx`). **Record the exact error list** - later tasks fix them (Task 4 storage, Task 5/6 service, Task 8 routes, Task 10/11 dialog). Do not chase errors outside this set.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(pipelines): schema for time triggers - trigger_type/config, stage_entered_at, relax trigger_stage_id (P4c)"
```

---

### Task 2: Startup migration

**Files:**
- Modify: `server/storage.ts` (the pipeline_rules startup migration block - find it by `grep -n "action_config" server/storage.ts`, the P4b-1 column-loop added after the `pipeline_rule_field_maps` migration)

Per [[reference-startup-add-column]]: the DB **rejects** `ADD COLUMN IF NOT EXISTS`. Use an info_schema COUNT guard + plain `ALTER TABLE ADD COLUMN`, each in its own try/catch. `MODIFY` is idempotent.

- [ ] **Step 1: Add the column + backfill migration**

Locate the P4b-1 loop that adds `action_config`/`conditions` (search `action_config`). Immediately AFTER that block, add:

```ts
// P4c - time-based trigger columns
for (const { table, column, ddl } of [
  { table: "pipeline_rules", column: "trigger_type", ddl: "VARCHAR(16) NOT NULL DEFAULT 'stage_enter'" },
  { table: "pipeline_rules", column: "trigger_config", ddl: "TEXT NULL" },
  { table: "pipeline_cards", column: "stage_entered_at", ddl: "TEXT NULL" },
]) {
  try {
    const [cnt]: any = await this.pool.execute(
      "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
      [table, column],
    );
    if (Number((cnt as any[])[0].n) === 0) {
      await this.pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      console.log(`[migrate] added ${table}.${column}`);
    }
  } catch (e: any) { console.warn(`[migrate] ${table}.${column} skipped: ${e?.message}`); }
}
try {
  await this.pool.execute("ALTER TABLE pipeline_rules MODIFY trigger_stage_id INT NULL");
} catch (e: any) { console.warn(`[migrate] relax trigger_stage_id skipped: ${e?.message}`); }
try {
  const [r]: any = await this.pool.execute(
    "UPDATE pipeline_cards SET stage_entered_at = created_at WHERE stage_entered_at IS NULL",
  );
  const n = Number((r as any)?.affectedRows ?? 0);
  if (n > 0) console.log(`[migrate] backfilled stage_entered_at for ${n} cards`);
} catch (e: any) { console.warn(`[migrate] backfill stage_entered_at skipped: ${e?.message}`); }
```

- [ ] **Step 2: Relax the CREATE TABLE DDL too** (for fresh installs)

If the migration block also has a `CREATE TABLE IF NOT EXISTS pipeline_rules (...)` raw DDL with `trigger_stage_id INT NOT NULL`, change it to `trigger_stage_id INT` and add `trigger_type VARCHAR(16) NOT NULL DEFAULT 'stage_enter'`, `trigger_config TEXT NULL` to that DDL. If `pipeline_cards` raw CREATE DDL exists, add `stage_entered_at TEXT`. (If these tables are created purely via Drizzle and there's no raw CREATE here, skip this step.)

- [ ] **Step 3: Build to confirm no syntax error**

Run: `npm run build`
Expected: build succeeds (esbuild bundles; does not type-check).

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): startup migration for P4c time-trigger columns + stage_entered_at backfill"
```

---

### Task 3: Pure helpers + tests (TDD)

**Files:**
- Modify: `server/pipeline-automation-helpers.ts`
- Test: `server/pipeline-automation-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `server/pipeline-automation-helpers.test.ts`. First extend the import line to add the two new functions:

```ts
import { matchStageEnterRules, buildTargetTitle, pickMappedValues, shapeRuleFieldMaps, evaluateConditions, parseActionConfig, parseConditions, parseTimeTriggerConfig, isTimeRuleDue } from "./pipeline-automation-helpers.js";
```

Then append these tests:

```ts
const T0 = "2026-06-01T00:00:00.000Z";              // anchor base
const baseCard = { createdAt: T0, stageEnteredAt: T0 };
const cfg = (over: any = {}) => ({
  anchor: "stage_entered", offsetN: 3, offsetUnit: "days", direction: "after", repeat: "once", ...over,
});

test("parseTimeTriggerConfig: valid per anchor", () => {
  assert.deepEqual(parseTimeTriggerConfig(JSON.stringify(cfg())), { anchor: "stage_entered", fieldId: undefined, offsetN: 3, offsetUnit: "days", direction: "after", repeat: "once", repeatEveryN: undefined });
  assert.deepEqual(parseTimeTriggerConfig(JSON.stringify(cfg({ anchor: "field_date", fieldId: 7, direction: "before" }))).fieldId, 7);
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ repeat: "every", repeatEveryN: 2 }))).repeatEveryN, 2);
});

test("parseTimeTriggerConfig: malformed / missing → null", () => {
  assert.equal(parseTimeTriggerConfig(null), null);
  assert.equal(parseTimeTriggerConfig("{nope"), null);
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ anchor: "bogus" }))), null);
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ offsetN: -1 }))), null);
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ anchor: "field_date" }))), null); // no fieldId
  assert.equal(parseTimeTriggerConfig(JSON.stringify(cfg({ repeat: "every" }))), null);      // no repeatEveryN
});

test("isTimeRuleDue: once fires only at/after threshold and only once", () => {
  const before = new Date("2026-06-03T00:00:00Z"); // +2d < +3d
  const after = new Date("2026-06-04T00:00:00Z");  // +3d
  assert.equal(isTimeRuleDue(cfg(), baseCard, new Map(), before, null), false);
  assert.equal(isTimeRuleDue(cfg(), baseCard, new Map(), after, null), true);
  assert.equal(isTimeRuleDue(cfg(), baseCard, new Map(), after, T0), false); // already fired
});

test("isTimeRuleDue: card_created anchor + hours unit", () => {
  const c = { anchor: "card_created", offsetN: 36, offsetUnit: "hours", direction: "after", repeat: "once" };
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), new Date("2026-06-02T11:00:00Z"), null), false); // +35h
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), new Date("2026-06-02T13:00:00Z"), null), true);  // +37h
});

test("isTimeRuleDue: field_date before-direction; unparseable → false", () => {
  const c = { anchor: "field_date", fieldId: 9, offsetN: 3, offsetUnit: "days", direction: "before", repeat: "once" };
  const vals = new Map([[9, "2026-06-10"]]);          // due − 3d = 2026-06-07
  assert.equal(isTimeRuleDue(c as any, baseCard, vals, new Date("2026-06-06T00:00:00Z"), null), false);
  assert.equal(isTimeRuleDue(c as any, baseCard, vals, new Date("2026-06-07T00:00:00Z"), null), true);
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map([[9, "garbage"]]), new Date("2026-07-01T00:00:00Z"), null), false);
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), new Date("2026-07-01T00:00:00Z"), null), false); // missing
});

test("isTimeRuleDue: every re-fires after interval, not before", () => {
  const c = { anchor: "stage_entered", offsetN: 1, offsetUnit: "days", direction: "after", repeat: "every", repeatEveryN: 2 };
  const now = new Date("2026-06-05T00:00:00Z");
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), now, null), true);                       // first, past +1d gate
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), now, "2026-06-04T00:00:00Z"), false);     // 1d since last < 2d
  assert.equal(isTimeRuleDue(c as any, baseCard, new Map(), now, "2026-06-02T00:00:00Z"), true);      // 3d since last ≥ 2d
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: FAIL - `parseTimeTriggerConfig`/`isTimeRuleDue` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `server/pipeline-automation-helpers.ts`. Extend the top import to include the type:

```ts
import type { PipelineRule, RuleCondition, TimeTriggerConfig } from "../shared/schema.js";
```

Then add at the end of the file:

```ts
function unitMs(unit: "hours" | "days"): number {
  return unit === "hours" ? 3_600_000 : 86_400_000;
}

/** Safe-parse + shape-guard a trigger_config JSON string for a time trigger. Malformed → null. */
export function parseTimeTriggerConfig(raw: string | null): TimeTriggerConfig | null {
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  if (!["stage_entered", "card_created", "field_date"].includes(o.anchor)) return null;
  if (typeof o.offsetN !== "number" || Number.isNaN(o.offsetN) || o.offsetN < 0) return null;
  if (o.offsetUnit !== "hours" && o.offsetUnit !== "days") return null;
  if (o.direction !== "after" && o.direction !== "before") return null;
  if (o.repeat !== "once" && o.repeat !== "every") return null;
  if (o.anchor === "field_date" && typeof o.fieldId !== "number") return null;
  if (o.repeat === "every" && !(typeof o.repeatEveryN === "number" && o.repeatEveryN > 0)) return null;
  return {
    anchor: o.anchor,
    fieldId: typeof o.fieldId === "number" ? o.fieldId : undefined,
    offsetN: o.offsetN, offsetUnit: o.offsetUnit, direction: o.direction,
    repeat: o.repeat,
    repeatEveryN: typeof o.repeatEveryN === "number" ? o.repeatEveryN : undefined,
  };
}

/** Decide whether a time-triggered rule is due to fire now. Never throws → false on any malformed input. */
export function isTimeRuleDue(
  cfg: TimeTriggerConfig,
  card: { createdAt: string; stageEnteredAt: string | null },
  values: Map<number, string>,
  now: Date,
  lastFiredAt: string | null,
): boolean {
  // 1. anchor timestamp
  let anchorMs: number;
  if (cfg.anchor === "stage_entered") anchorMs = Date.parse(card.stageEnteredAt ?? card.createdAt);
  else if (cfg.anchor === "card_created") anchorMs = Date.parse(card.createdAt);
  else {
    if (cfg.fieldId == null) return false;
    const raw = (values.get(cfg.fieldId) ?? "").trim();
    if (!raw) return false;
    anchorMs = Date.parse(raw);
  }
  if (Number.isNaN(anchorMs)) return false;

  // 2. threshold = anchor ± offset
  const delta = cfg.offsetN * unitMs(cfg.offsetUnit);
  const thresholdMs = cfg.direction === "before" ? anchorMs - delta : anchorMs + delta;
  const nowMs = now.getTime();
  if (nowMs < thresholdMs) return false;

  // 3. repeat / dedup
  if (cfg.repeat === "once") return lastFiredAt == null;
  if (lastFiredAt == null) return true;
  const lastMs = Date.parse(lastFiredAt);
  if (Number.isNaN(lastMs)) return true;
  const everyN = cfg.repeatEveryN && cfg.repeatEveryN > 0 ? cfg.repeatEveryN : 1;
  return nowMs - lastMs >= everyN * unitMs(cfg.offsetUnit);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: ALL tests pass (previous 19 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation-helpers.ts server/pipeline-automation-helpers.test.ts
git commit -m "feat(pipelines): pure helpers parseTimeTriggerConfig + isTimeRuleDue with tests (P4c)"
```

---

### Task 4: Storage - stage_entered_at writes, fire upsert, time-rule query, CRUD trigger fields

**Files:**
- Modify: `server/storage.ts` (`createCard` ~1885, `moveCard` ~1926, after `recordRuleFire` ~2261, `createRule` ~2185, `updateRule` ~2204)

- [ ] **Step 1: Set `stageEnteredAt` on create + move**

In `createCard`, in the `.values({...})` object add `stageEnteredAt: now,` (right after `createdAt: now,`).

In `moveCard`, the per-row update loop sets `{ position: i, stageId: toStageId, updatedAt: now, updatedBy: userId }`. Change the loop so the **moved card** (`reordered[i].id === id`) ALSO gets `stageEnteredAt: now` ONLY when the stage actually changed. Replace the loop body with:

```ts
    const stageChanged = before.stageId !== toStageId;
    for (let i = 0; i < reordered.length; i++) {
      const patch: any = { position: i, stageId: toStageId, updatedAt: now, updatedBy: userId };
      if (stageChanged && reordered[i].id === id) patch.stageEnteredAt = now;
      await this.db.update(pipelineCards).set(patch)
        .where(and(eq(pipelineCards.id, reordered[i].id), eq(pipelineCards.mitraId, mitraId)));
    }
```

- [ ] **Step 2: Add `getRuleFire`, `recordOrTouchRuleFire`, `listAllTimeRules`**

After `recordRuleFire` (ends ~2261) add:

```ts
  async getRuleFire(ruleId: number, sourceCardId: number): Promise<PipelineRuleFire | null> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineRuleFires)
      .where(and(eq(pipelineRuleFires.mitraId, mitraId), eq(pipelineRuleFires.ruleId, ruleId), eq(pipelineRuleFires.sourceCardId, sourceCardId)));
    return rows[0] ?? null;
  }

  /** Insert a fire row, or bump firedAt if one exists (for recurring time triggers). */
  async recordOrTouchRuleFire(ruleId: number, sourceCardId: number): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const existing = await this.getRuleFire(ruleId, sourceCardId);
    if (existing) {
      await this.db.update(pipelineRuleFires).set({ firedAt: now })
        .where(and(eq(pipelineRuleFires.id, existing.id), eq(pipelineRuleFires.mitraId, mitraId)));
      return;
    }
    try {
      await this.db.insert(pipelineRuleFires).values({ mitraId, ruleId, sourceCardId, firedAt: now } as any);
    } catch (e: any) {
      const dup = e?.code === "ER_DUP_ENTRY" || e?.errno === 1062 || String(e?.message).includes("Duplicate");
      if (!dup) console.warn(`[automation] recordOrTouchRuleFire failed (rule ${ruleId}, card ${sourceCardId}): ${e?.message}`);
    }
  }

  /** ALL enabled time-trigger rules across every mitra (tenant-agnostic - caller scopes per row). */
  async listAllTimeRules(): Promise<PipelineRule[]> {
    return this.db.select().from(pipelineRules)
      .where(and(eq(pipelineRules.triggerType, "time"), eq(pipelineRules.enabled, 1)))
      .orderBy(asc(pipelineRules.mitraId), asc(pipelineRules.id));
  }
```

- [ ] **Step 3: Carry trigger fields through `createRule` / `updateRule`**

In `createRule`, widen the `data` param type - add to its inline type: `triggerStageId?: number | null;` (change from `triggerStageId: number`), `triggerType?: RuleTriggerType;`, `triggerConfig?: any | null;`. Then in the `.values({...})`:
- change `triggerStageId: data.triggerStageId,` → `triggerStageId: data.triggerStageId ?? null,`
- add `triggerType: data.triggerType ?? "stage_enter",`
- add `triggerConfig: data.triggerConfig != null ? JSON.stringify(data.triggerConfig) : null,`

In `updateRule`, add to its `data` type: `triggerType?: RuleTriggerType;`, `triggerConfig?: any | null;` (and `triggerStageId?: number | null;` to allow null). Then in the patch builder add:

```ts
    if (data.triggerType !== undefined) patch.triggerType = data.triggerType;
    if (data.triggerConfig !== undefined) patch.triggerConfig = data.triggerConfig != null ? JSON.stringify(data.triggerConfig) : null;
```

Update the import at the top of `storage.ts` that brings in `PipelineRuleActionType` to also import `RuleTriggerType` (same `from "../shared/schema.js"` / `"@shared/schema"` line).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: storage.ts errors from Task 1 resolved. Residuals remain ONLY in `server/pipeline-automation.ts`, `server/routes.ts`, and `client/components/pipelines/PipelineRulesDialog.tsx` (fixed in Tasks 5/6, 8, 10/11). Confirm no NEW storage errors.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage - stage_entered_at writes, rule-fire upsert, listAllTimeRules, CRUD trigger fields (P4c)"
```

---

### Task 5: Service - extract `applyRuleAction` (no behavior change)

**Files:**
- Modify: `server/pipeline-automation.ts`

This is a pure refactor: lift the action `switch` out of `runStageEnterAutomations` so time triggers reuse it. Stage-enter behavior must stay identical.

- [ ] **Step 1: Add `applyRuleAction`**

In `server/pipeline-automation.ts`, add this function (it is the EXACT action logic currently inline in `runStageEnterAutomations`, lines ~28-84, returning whether it acted):

```ts
/** Run a rule's action against a card. Returns true if a mutation happened.
 *  Loop-safe: mutates via storage directly, never re-invokes the automation service. */
export async function applyRuleAction(rule: PipelineRule, card: PipelineCard, actorId: number): Promise<boolean> {
  if (rule.actionType === "create_card") {
    const targetStages = await storage.listStages(rule.targetPipelineId!);
    if (!targetStages.some((s) => s.id === rule.targetStageId)) {
      console.warn(`[automation] rule ${rule.id}: target stage ${rule.targetStageId} no longer exists - skipped`);
      return false;
    }
    const assigneeId = (rule.copyAssignee && card.assigneeId && await storage.canUserAccessPipeline(card.assigneeId, rule.targetPipelineId!))
      ? card.assigneeId : null;
    if (rule.copyAssignee && card.assigneeId && assigneeId === null) {
      console.warn(`[automation] rule ${rule.id}: assignee ${card.assigneeId} lacks access to pipeline ${rule.targetPipelineId} - created unassigned`);
    }
    const newCard = await storage.createCard(rule.targetPipelineId!, {
      stageId: rule.targetStageId!,
      title: buildTargetTitle(rule.titleTemplate, card.title),
      description: `Dibuat otomatis dari kartu #${card.id}`,
      assigneeId,
    }, actorId);
    const maps = await storage.getRuleFieldMaps(rule.id);
    if (maps.length) {
      const srcVals = await storage.getCardValues(card.id);
      const targetFieldIds = new Set((await storage.listFields(rule.targetPipelineId!)).map((f) => f.id));
      const validMaps = maps.filter((m) => targetFieldIds.has(m.targetFieldId));
      const writes = pickMappedValues(validMaps, srcVals);
      if (writes.length) await storage.setCardValues(newCard.id, writes);
    }
    return true;
  }
  if (rule.actionType === "set_field") {
    const cfg = parseActionConfig("set_field", rule.actionConfig) as { fieldId: number; value: string } | null;
    const fieldIds = new Set((await storage.listFields(card.pipelineId)).map((f) => f.id));
    if (cfg && fieldIds.has(cfg.fieldId)) {
      await storage.setCardValues(card.id, [{ fieldId: cfg.fieldId, value: cfg.value }]);
      return true;
    }
    console.warn(`[automation] rule ${rule.id}: set_field config invalid or field missing - skipped`);
    return false;
  }
  if (rule.actionType === "move_stage") {
    const cfg = parseActionConfig("move_stage", rule.actionConfig) as { stageId: number } | null;
    const stageIds = new Set((await storage.listStages(card.pipelineId)).map((s) => s.id));
    if (cfg && stageIds.has(cfg.stageId) && cfg.stageId !== card.stageId) {
      await storage.moveCard(card.id, cfg.stageId, undefined, actorId);
      return true;
    }
    console.warn(`[automation] rule ${rule.id}: move_stage config invalid, stage missing, or no-op - skipped`);
    return false;
  }
  if (rule.actionType === "assign") {
    const cfg = parseActionConfig("assign", rule.actionConfig) as { assigneeId: number | null } | null;
    if (!cfg) { console.warn(`[automation] rule ${rule.id}: assign config invalid - skipped`); return false; }
    if (cfg.assigneeId != null && !(await storage.canUserAccessPipeline(cfg.assigneeId, card.pipelineId))) {
      console.warn(`[automation] rule ${rule.id}: assignee ${cfg.assigneeId} lacks access to pipeline ${card.pipelineId} - skipped`);
      return false;
    }
    await storage.updateCard(card.id, { assigneeId: cfg.assigneeId }, actorId);
    return true;
  }
  return false;
}
```

- [ ] **Step 2: Rewrite `runStageEnterAutomations` to use it**

Replace the per-rule body inside the `for (const rule of rules)` loop so it delegates to `applyRuleAction`:

```ts
    for (const rule of rules) {
      if (await storage.hasRuleFired(rule.id, card.id)) continue;

      const conds = parseConditions(rule.conditions);
      if (conds.length) {
        const rec = await storage.getCardValues(card.id);
        const valsMap = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
        if (!evaluateConditions(conds, valsMap)) continue;
      }

      const acted = await applyRuleAction(rule, card, actorId);
      if (acted) await storage.recordRuleFire(rule.id, card.id);
    }
```

Remove the now-duplicated inline `let acted = false; if (rule.actionType === ...) {...}` block. Keep the outer `try/catch` and the `matchStageEnterRules(... )` line at the top.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: `server/pipeline-automation.ts` errors from Task 1 (nullable `targetPipelineId`/`targetStageId` were already non-null-asserted with `!`) stay resolved; this file should now be **0 errors**. Residuals remain only in `routes.ts` + dialog.

- [ ] **Step 4: Run helper tests (regression)**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: all pass (this refactor doesn't touch helpers, but confirms nothing broke imports).

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "refactor(pipelines): extract applyRuleAction shared by stage-enter (prep for time triggers) (P4c)"
```

---

### Task 6: Service - `runTimeTriggers()`

**Files:**
- Modify: `server/pipeline-automation.ts`

- [ ] **Step 1: Extend imports**

Top of file, extend the helper import to add `parseTimeTriggerConfig, isTimeRuleDue`, and add the tenant-context import:

```ts
import {
  matchStageEnterRules, buildTargetTitle, pickMappedValues,
  evaluateConditions, parseActionConfig, parseConditions,
  parseTimeTriggerConfig, isTimeRuleDue,
} from "./pipeline-automation-helpers.js";
import { tenantContext } from "./tenant-context.js";
```

- [ ] **Step 2: Add `runTimeTriggers`**

Append to `server/pipeline-automation.ts`:

```ts
/** One evaluation pass over ALL enabled time-trigger rules (every mitra).
 *  Driven by the cron-hit tick endpoint. Best-effort: never throws. */
export async function runTimeTriggers(): Promise<{ evaluated: number; fired: number }> {
  let evaluated = 0, fired = 0;
  let rules: PipelineRule[] = [];
  try {
    rules = await storage.listAllTimeRules();
  } catch (e: any) {
    console.warn(`[automation] runTimeTriggers: listAllTimeRules failed: ${e?.message}`);
    return { evaluated, fired };
  }

  // group rules by mitra so storage auto-scoping is correct inside tenantContext.run
  const byMitra = new Map<number, PipelineRule[]>();
  for (const r of rules) {
    const list = byMitra.get(r.mitraId) ?? [];
    list.push(r);
    byMitra.set(r.mitraId, list);
  }

  const now = new Date();
  for (const [mitraId, mitraRules] of byMitra) {
    await tenantContext.run({ mitraId, userId: 0, isSuperAdmin: false }, async () => {
      for (const rule of mitraRules) {
        try {
          const cfg = parseTimeTriggerConfig(rule.triggerConfig);
          if (!cfg) continue;
          const conds = parseConditions(rule.conditions);
          const cards = await storage.listCards(rule.pipelineId);
          for (const card of cards) {
            // optional stage scope
            if (rule.triggerStageId != null && card.stageId !== rule.triggerStageId) continue;
            try {
              const fire = await storage.getRuleFire(rule.id, card.id);
              if (cfg.repeat === "once" && fire) continue;

              const values = new Map<number, string>();
              if (conds.length || cfg.anchor === "field_date") {
                const rec = await storage.getCardValues(card.id);
                for (const [k, v] of Object.entries(rec)) values.set(Number(k), String(v));
              }
              if (conds.length && !evaluateConditions(conds, values)) continue;

              evaluated++;
              if (!isTimeRuleDue(cfg, { createdAt: card.createdAt, stageEnteredAt: (card as any).stageEnteredAt ?? null }, values, now, fire?.firedAt ?? null)) continue;

              const acted = await applyRuleAction(rule, card, rule.createdBy);
              if (acted) { await storage.recordOrTouchRuleFire(rule.id, card.id); fired++; }
            } catch (e: any) {
              console.warn(`[automation] time rule ${rule.id} card ${card.id} failed: ${e?.message}`);
            }
          }
        } catch (e: any) {
          console.warn(`[automation] time rule ${rule.id} failed: ${e?.message}`);
        }
      }
    });
  }
  return { evaluated, fired };
}
```

> Note: `tenantContext.run`'s context shape is `{ mitraId, userId, isSuperAdmin }` (see `server/tenant-context.ts`). If that file's `TenantCtx` has additional required fields, match them; `userId: 0` is the system actor.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: `pipeline-automation.ts` = 0 errors. Confirm `card.createdAt` and `stageEnteredAt` resolve (they're on the `pipeline_cards` select type after Task 1).

- [ ] **Step 4: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(pipelines): runTimeTriggers evaluation pass (per-mitra, dedup, conditions) (P4c)"
```

---

### Task 7: Tick endpoint + mount

**Files:**
- Create: `server/pipelines-tick-route.ts`
- Modify: `server/index.ts` (imports ~11-13, mounts ~80-82)

- [ ] **Step 1: Create the tick router**

```ts
// server/pipelines-tick-route.ts
import { Router, type Request, type Response } from "express";
import { runTimeTriggers } from "./pipeline-automation.js";

export const pipelinesTickRouter = Router();

/** Cron-driven evaluation of time-based pipeline automation rules.
 *  Guarded by a shared secret (header X-Automation-Secret == PIPELINE_TICK_SECRET).
 *  Intentionally NOT behind staff auth and NOT gated by WORKERS_ENABLED. */
pipelinesTickRouter.post("/api/pipelines/automation/tick", async (req: Request, res: Response) => {
  const secret = process.env.PIPELINE_TICK_SECRET;
  if (!secret) return res.status(503).json({ success: false, error: "tick disabled (PIPELINE_TICK_SECRET unset)" });
  const got = String(req.header("x-automation-secret") ?? "");
  // constant-time-ish compare
  if (got.length !== secret.length || !timingSafeEqualStr(got, secret)) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  try {
    const result = await runTimeTriggers();
    return res.json({ success: true, data: result });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message ?? "tick failed" });
  }
});

function timingSafeEqualStr(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 2: Mount it BEFORE the staff router in `server/index.ts`**

Add import near the other route imports (~line 12):

```ts
import { pipelinesTickRouter } from "./pipelines-tick-route.js";
```

Add the mount alongside the portal/public mounts (the block with `app.use(customerPortalRouter); app.use(publicApiRouter);`), BEFORE `app.use(router);`:

```ts
app.use(pipelinesTickRouter);
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Smoke-test locally (no secret → 503, bad secret → 401)**

Run (dev server must be running in another shell via `npm run dev`):
```bash
curl -s -X POST http://localhost:5000/api/pipelines/automation/tick -o - -w " [%{http_code}]"
```
Expected: `503` if `PIPELINE_TICK_SECRET` unset, or `401` with a wrong/absent header if set. (Port: match the app's dev port.)

- [ ] **Step 5: Commit**

```bash
git add server/pipelines-tick-route.ts server/index.ts
git commit -m "feat(pipelines): secret-guarded POST /api/pipelines/automation/tick (P4c)"
```

---

### Task 8: Routes - validateTriggerConfig + POST/PATCH/GET

**Files:**
- Modify: `server/routes.ts` (rule routes ~4627-4770; helper near `validateActionConfig`)

- [ ] **Step 1: Extend the helper import**

Find the import from `./pipeline-automation-helpers.js` (currently `{ shapeRuleFieldMaps, parseActionConfig, parseConditions }`) and add `parseTimeTriggerConfig`.

- [ ] **Step 2: Add `validateTriggerConfig`**

Near `validateActionConfig`/`validateConditions`, add:

```ts
async function validateTriggerConfig(
  pipelineId: number,
  triggerType: string,
  triggerStageId: number | null | undefined,
  triggerConfig: any,
): Promise<string | null> {
  const stages = await storage.listStages(pipelineId);
  const stageIds = new Set(stages.map((s) => s.id));

  if (triggerType === "stage_enter") {
    if (!triggerStageId || !stageIds.has(Number(triggerStageId))) return "triggerStageId wajib & harus stage di pipeline ini";
    return null;
  }
  if (triggerType !== "time") return "triggerType tidak dikenal";

  const c = triggerConfig;
  if (!c || typeof c !== "object") return "triggerConfig wajib untuk trigger waktu";
  if (!["stage_entered", "card_created", "field_date"].includes(c.anchor)) return "anchor tidak valid";
  if (typeof c.offsetN !== "number" || c.offsetN < 0) return "offsetN harus angka ≥ 0";
  if (c.offsetUnit !== "hours" && c.offsetUnit !== "days") return "offsetUnit harus hours/days";
  if (c.direction !== "after" && c.direction !== "before") return "direction harus after/before";
  if (c.repeat !== "once" && c.repeat !== "every") return "repeat harus once/every";
  if (c.repeat === "every" && !(typeof c.repeatEveryN === "number" && c.repeatEveryN > 0)) return "repeatEveryN harus > 0";
  if (c.anchor === "field_date") {
    const fields = await storage.listFields(pipelineId);
    const f = fields.find((x) => x.id === Number(c.fieldId));
    if (!f) return "fieldId untuk anchor tanggal tidak ditemukan";
    if (f.type !== "date") return "anchor field_date harus menunjuk field bertipe date";
  }
  if (triggerStageId != null && !stageIds.has(Number(triggerStageId))) return "batasan stage tidak valid";
  return null;
}
```

- [ ] **Step 3: POST - dispatch on triggerType**

In `router.post("/api/pipelines/:id/rules", ...)`, replace the early `if (!b.triggerStageId) return sendError(...)` guard with a trigger-type-aware validation. After `const condErr = await validateConditions(...)` block, insert:

```ts
    const triggerType = (b.triggerType ?? "stage_enter") as string;
    const trigErr = await validateTriggerConfig(pid, triggerType, b.triggerStageId != null ? Number(b.triggerStageId) : null, b.triggerConfig);
    if (trigErr) return sendError(res, trigErr, 400);
```

Then in BOTH `storage.createRule(pid, {...})` calls (create_card branch and the generic-action branch) add these fields to the object:

```ts
      triggerType,
      triggerStageId: b.triggerStageId != null ? Number(b.triggerStageId) : null,
      triggerConfig: triggerType === "time" ? (b.triggerConfig ?? null) : null,
```

Remove the old line `triggerStageId: Number(b.triggerStageId),` from each (replaced by the nullable version above). Note: for `create_card` a `time` trigger is allowed - the action validations (target pipeline access, fieldMaps) still run as before.

- [ ] **Step 4: PATCH - validate trigger when present**

In `router.patch(...)`, after the existing `if (b.conditions !== undefined) {...}` block, add:

```ts
    if (b.triggerType !== undefined || b.triggerConfig !== undefined || b.triggerStageId !== undefined) {
      const current = (await storage.listRules(pid)).find((r) => r.id === Number(req.params.ruleId));
      const tType = String(b.triggerType ?? current?.triggerType ?? "stage_enter");
      const tStage = b.triggerStageId !== undefined ? (b.triggerStageId != null ? Number(b.triggerStageId) : null)
        : (current?.triggerStageId ?? null);
      const tCfg = b.triggerConfig !== undefined ? b.triggerConfig
        : (current?.triggerConfig ? JSON.parse(current.triggerConfig) : null);
      const trigErr = await validateTriggerConfig(pid, tType, tStage, tCfg);
      if (trigErr) return sendError(res, trigErr, 400);
    }
```

Then in the `storage.updateRule(...)` call object add:

```ts
        triggerType: b.triggerType,
        triggerConfig: b.triggerConfig,
```

(`triggerStageId` is already passed; keep it - it now accepts null.)

- [ ] **Step 5: GET - enrich trigger for display**

In `router.get("/api/pipelines/:id/rules", ...)`, inside the `rules.map(async (r) => {...})`, before the `return {...}`, add:

```ts
      let triggerConfig: any = null;
      let triggerFieldLabel: string | undefined;
      const triggerStageScopeName = (r.triggerType === "time" && r.triggerStageId)
        ? (selfStages.get(r.triggerStageId) ?? `Stage #${r.triggerStageId} (dihapus)`)
        : undefined;
      if (r.triggerType === "time") {
        triggerConfig = parseTimeTriggerConfig(r.triggerConfig);
        if (triggerConfig?.anchor === "field_date" && triggerConfig.fieldId != null) {
          triggerFieldLabel = srcFields.get(triggerConfig.fieldId)?.label ?? `Field #${triggerConfig.fieldId} (dihapus)`;
        }
      }
```

And add to the returned object:

```ts
        triggerConfig, triggerFieldLabel, triggerStageScopeName,
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: `routes.ts` errors from Task 1 resolved → routes.ts = 0 errors. Only `PipelineRulesDialog.tsx` residuals remain.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): rule routes - validateTriggerConfig + POST/PATCH/GET time-trigger handling (P4c)"
```

---

### Task 9: Client hook types

**Files:**
- Modify: `client/hooks/usePipelines.ts`

- [ ] **Step 1: Extend imports + `RuleWithMaps`**

Add `TimeTriggerConfig` to the `@shared/schema` import. Then extend `RuleWithMaps` (after the P4b-1 fields) with:

```ts
  // P4c time triggers (server-enriched)
  triggerConfig?: TimeTriggerConfig | null;
  triggerFieldLabel?: string;
  triggerStageScopeName?: string;
```

(`triggerType` and `triggerStageId` already come from `PipelineRule`.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors; dialog residuals unchanged.

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): RuleWithMaps carries time-trigger display fields (P4c)"
```

---

### Task 10: Dialog - trigger selector + time-trigger form

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

The create form currently has a single "trigger stage" Combobox (~line 385-393) then the action selector (~406). Add a "Pemicu" selector above it and conditionally render either the stage picker (stage_enter) or the time fields (time).

- [ ] **Step 1: Add state**

Near the other `useState` hooks (~30-40) add:

```ts
  const [triggerType, setTriggerType] = useState<"stage_enter" | "time">("stage_enter");
  const [anchor, setAnchor] = useState<"stage_entered" | "card_created" | "field_date">("stage_entered");
  const [anchorFieldId, setAnchorFieldId] = useState("");
  const [offsetN, setOffsetN] = useState("3");
  const [offsetUnit, setOffsetUnit] = useState<"hours" | "days">("days");
  const [direction, setDirection] = useState<"after" | "before">("after");
  const [repeat, setRepeat] = useState<"once" | "every">("once");
  const [repeatEveryN, setRepeatEveryN] = useState("1");
  const [scopeStageId, setScopeStageId] = useState(""); // optional stage scope for time triggers
```

In the form-reset block (where `setTriggerStageId("")` etc. live, ~91) reset all of the above to defaults.

- [ ] **Step 2: Build the trigger config + dispatch in `add()`**

In the submit handler `add()` (~117), before the per-action branches, compute a shared trigger payload. Replace the per-branch `triggerStageId: Number(triggerStageId),` usage with spreading a `triggerPart`:

```ts
    let triggerPart: any;
    if (triggerType === "stage_enter") {
      if (!triggerStageId) { toast.error("Pilih stage trigger"); return; }
      triggerPart = { triggerType: "stage_enter", triggerStageId: Number(triggerStageId) };
    } else {
      if (anchor === "field_date" && !anchorFieldId) { toast.error("Pilih field tanggal untuk anchor"); return; }
      const n = Number(offsetN);
      if (!Number.isFinite(n) || n < 0) { toast.error("Offset harus angka ≥ 0"); return; }
      const cfg: any = { anchor, offsetN: n, offsetUnit, direction, repeat };
      if (anchor === "field_date") cfg.fieldId = Number(anchorFieldId);
      if (repeat === "every") {
        const e = Number(repeatEveryN);
        if (!Number.isFinite(e) || e <= 0) { toast.error("Interval ulang harus > 0"); return; }
        cfg.repeatEveryN = e;
      }
      triggerPart = {
        triggerType: "time",
        triggerStageId: scopeStageId ? Number(scopeStageId) : null,
        triggerConfig: cfg,
      };
    }
```

Then in each `m.createRule.mutateAsync({...})` action branch, REMOVE the `triggerStageId: Number(triggerStageId),` line and spread `...triggerPart,` instead. (Each branch already sets `actionType` + its own action fields - keep those.) The `create_card` branch's own guard `if (!triggerStageId || ...)` must drop the `!triggerStageId` part (trigger is validated above): change it to validate only target fields.

- [ ] **Step 3: Render the "Pemicu" selector + conditional fields**

Above the existing trigger-stage Combobox block (~385), insert a Pemicu selector:

```tsx
              <FormField label="Pemicu" htmlFor="rule-trigger-type">
                <Combobox
                  options={[
                    { value: "stage_enter", label: "Saat masuk stage" },
                    { value: "time", label: "Berbasis waktu" },
                  ]}
                  value={triggerType}
                  onChange={(v) => setTriggerType(v as any)}
                />
              </FormField>
```

Wrap the EXISTING trigger-stage Combobox in `{triggerType === "stage_enter" && (...)}`.

Add the time-trigger fields, rendered `{triggerType === "time" && (<> ... </>)}`:
- **Anchor** Combobox: options `stage_entered`→"Saat masuk stage", `card_created`→"Saat kartu dibuat", `field_date`→"Tanggal di field". Bind `anchor`/`setAnchor`.
- When `anchor === "field_date"`: a field Combobox built from `sourceFields.filter((f) => f.type === "date")` (the dialog already has `sourceFields` for conditions/maps), mapping to `{ value: String(f.id), label: f.label }`, bound to `anchorFieldId`.
- **Offset row** (use `<FormRow cols={3}>` if available, else stacked): number `<Input type="number" min={0}>` bound to `offsetN`; unit Combobox `hours`→"jam"/`days`→"hari" bound to `offsetUnit`; direction Combobox `after`→"sesudah"/`before`→"sebelum" bound to `direction`.
- **Repeat row**: Combobox `once`→"sekali"/`every`→"berulang tiap" bound to `repeat`; when `repeat === "every"`, a number Input bound to `repeatEveryN` (label "tiap N " + offsetUnit).
- **Batasan stage (opsional)** Combobox from `selfStages`/the pipeline's stages (same source the trigger-stage picker uses), with an empty option "- semua stage -", bound to `scopeStageId`.

Match the existing dialog's `<FormField>`/`<Combobox>`/`<Input>` styling used by the action fields below.

- [ ] **Step 4: Fix submit `disabled` guard**

The submit button `disabled` (~578) references `!triggerStageId`. Make it trigger-type-aware:

```tsx
                  (triggerType === "stage_enter" && !triggerStageId) ||
                  (triggerType === "time" && anchor === "field_date" && !anchorFieldId) ||
```

(Keep the existing action-specific disabled clauses.)

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: **0 typecheck errors** (last residuals cleared), build OK.

- [ ] **Step 6: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): rule dialog trigger selector + time-trigger form (P4c)"
```

---

### Task 11: Dialog - read-side (summary + detail render)

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

- [ ] **Step 1: Add a `triggerSummary(r)` helper**

Near the existing `actionSummary`/`stageName` helpers (~190), add:

```tsx
  const unitLabel = (u?: string) => (u === "hours" ? "jam" : "hari");
  function triggerSummary(r: RuleWithMaps): string {
    if (r.triggerType !== "time" || !r.triggerConfig) {
      return `Saat masuk ${stageName(r.triggerStageId)}`;
    }
    const c = r.triggerConfig;
    const anchorLabel =
      c.anchor === "stage_entered" ? "masuk stage" :
      c.anchor === "card_created" ? "kartu dibuat" :
      `[${r.triggerFieldLabel ?? "tanggal"}]`;
    const dir = c.direction === "before" ? "sebelum" : "setelah";
    const base = `⏱ ${c.offsetN} ${unitLabel(c.offsetUnit)} ${dir} ${anchorLabel}`;
    const rep = c.repeat === "every" ? `, ulang tiap ${c.repeatEveryN} ${unitLabel(c.offsetUnit)}` : "";
    const scope = r.triggerStageScopeName ? ` (di ${r.triggerStageScopeName})` : "";
    return base + rep + scope;
  }
```

- [ ] **Step 2: Use it in the collapsed summary**

The collapsed row (~259-260) renders `Saat masuk {stageName(r.triggerStageId)}`. Replace that span pair with `{triggerSummary(r)}`.

- [ ] **Step 3: Use it in the detail panel**

The detail "Trigger" block (~311-312) renders `Saat kartu masuk stage {stageName(r.triggerStageId)}`. Replace the inner `<div>` content with `{triggerSummary(r)}`. (The "Trigger" label heading stays.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors, build OK.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): rule dialog renders time-trigger summary + detail (P4c)"
```

---

### Task 12: Env, final verification, manual checklist

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the secret**

Add to `.env.example`:

```
# P4c - secret for the pipeline time-trigger cron tick (POST /api/pipelines/automation/tick).
# Leave unset to disable the endpoint (returns 503).
PIPELINE_TICK_SECRET=
```

- [ ] **Step 2: Full verification**

Run each, confirm output:
```bash
npm run typecheck                                        # 0 errors
npx tsx --test server/pipeline-automation-helpers.test.ts # all pass (25 tests)
npm run build                                            # success
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(pipelines): document PIPELINE_TICK_SECRET for time-trigger tick (P4c)"
```

- [ ] **Step 4: Manual dev test plan (after merge to dev + restart + cron/curl)**

Relay this checklist to the user - run against `jabnet_fiber_dev` with `PIPELINE_TICK_SECRET` set:

1. **set_field on time anchor:** create a rule, trigger=waktu, anchor=`masuk stage`, `0 hari sesudah`, action=set_field. Put a card in the stage. `curl -X POST -H "X-Automation-Secret: <s>" .../api/pipelines/automation/tick` → field set; response `{evaluated≥1, fired≥1}`.
2. **once dedup:** curl tick again → same card not re-fired (`fired` doesn't recount it).
3. **every recurrence:** rule anchor=`masuk stage`, `0 hari`, repeat=`tiap 1 hari`. First tick fires; immediate second tick does NOT (interval not elapsed). (Optionally backdate `fired_at` in DB to verify re-fire.)
4. **card_created anchor:** rule `N hari sejak dibuat` on an old card → fires.
5. **field_date H-N:** rule anchor=`field tanggal` (a date field), `3 hari sebelum`; set the field so today = date−3 → fires; a date far in the future → does not.
6. **stage scope:** rule with batasan stage = X; a card in stage Y is ignored, a card in X is evaluated.
7. **conditions gate:** add an IF condition that is false → card skipped (no fire); make it true → fires on next tick.
8. **move_stage loop-safety:** time rule action=move_stage to stage Z; after firing, no stage-enter automation cascades unexpectedly (move via storage, not routes).
9. **regression:** an existing stage-enter `create_card` rule + its field maps still fire on a real card move.
10. **auth:** tick with wrong/no secret → 401; unset env → 503.

- [ ] **Step 5: Update memory + finishing-branch**

After manual dev verification passes, update `[[project-pipelines-engine]]` (mark P4c built) and invoke `superpowers:finishing-a-development-branch`.

---

## Self-Review notes (addressed)

- **Spec coverage:** every spec §1-§7 maps to a task (§1→T1/T2, §2→T1/T2/T4, §3→T4/T6, §4→T3/T5/T6, §5→T7, §6→T10/T11, §7→T8). ✓
- **Type consistency:** `TimeTriggerConfig` shape identical in schema (T1), helper (T3), hook (T9), routes (T8). `applyRuleAction` signature `(rule, card, actorId)→Promise<boolean>` used in T5 + T6. `recordOrTouchRuleFire`/`getRuleFire`/`listAllTimeRules` defined T4, used T6. ✓
- **Residual-error tracking:** T1 relaxes a NOT-NULL that breaks the dialog + service + routes; those are explicitly fixed in T4/T5/T6/T8/T10/T11, and each task states which residuals are expected so implementers don't chase out-of-scope errors. ✓
- **TDD:** the only purely-unit-testable unit (helpers) is TDD in T3; storage/service/routes/UI verified via typecheck + build + the manual dev plan, consistent with this codebase's existing test surface.
