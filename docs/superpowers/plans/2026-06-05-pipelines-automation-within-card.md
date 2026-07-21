# Pipelines Automation: Within-Card Actions + Conditions (P4b-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an automation rule, when a card enters its trigger stage, act on the *same* card - set a custom field, move the card to another stage in the same pipeline, or (re)assign it - and gate any rule (new actions and the existing `create_card`) behind an optional AND-list of field conditions.

**Architecture:** Approach A - extend the flat `pipeline_rules` row (no new tables): widen the `action_type` enum and add nullable `action_config` (JSON) + `conditions` (JSON) text columns. The legacy `create_card` columns + `pipeline_rule_field_maps` table are untouched, so every existing rule keeps working. One action per rule. Within-card mutations go through `storage` directly (never the routes), so the automation service is not re-invoked - loop-safe by the same mechanism as P4a. Conditions are evaluated at trigger time only.

**Tech Stack:** Drizzle ORM (MySQL dialect), Express 5, `sendSuccess`/`sendError` envelope, TanStack Query 5, React 18, shadcn/ui, Tailwind. Pure helpers unit-tested with `node:test` via `npx tsx --test`.

**Base spec:** `docs/superpowers/specs/2026-06-05-pipelines-automation-within-card-design.md`

---

### Task 1: Schema - widen action enum, add columns + condition/config types

**Files:**
- Modify: `shared/schema.ts` - `pipelineRules` table def (~586-603) + type exports (~630-632)

- [ ] **Step 1: Add the two nullable columns to `pipelineRules`**

In `shared/schema.ts`, locate the `pipelineRules` table (`export const pipelineRules = mysqlTable("pipeline_rules", {`). The two `target_*` columns are currently `.notNull()`; **relax both to nullable** (non-`create_card` rules leave them null) and add `actionConfig` + `conditions` after `updatedAt`. The columns block should read:

```ts
export const pipelineRules = mysqlTable("pipeline_rules", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  name: varchar("name", { length: 255 }),
  triggerStageId: int("trigger_stage_id").notNull(),
  actionType: varchar("action_type", { length: 16 }).notNull().default("create_card"),
  targetPipelineId: int("target_pipeline_id"),
  targetStageId: int("target_stage_id"),
  titleTemplate: varchar("title_template", { length: 255 }),
  copyAssignee: int("copy_assignee").notNull().default(0),
  enabled: int("enabled").notNull().default(1),
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  actionConfig: text("action_config"),
  conditions: text("conditions"),
}, (t) => ({
  byPipeline: index("idx_pipeline_rules_mitra_pipeline").on(t.mitraId, t.pipelineId),
}));
```

- [ ] **Step 2: Widen the action-type union + add condition/config types**

Replace the existing `export type PipelineRuleActionType = "create_card";` line (~632) with:

```ts
export type PipelineRuleActionType = "create_card" | "set_field" | "move_stage" | "assign";

export type RuleConditionOp = "eq" | "neq" | "contains" | "gt" | "lt" | "empty" | "not_empty";
export type RuleCondition = { fieldId: number; op: RuleConditionOp; value?: string };

export type SetFieldConfig = { fieldId: number; value: string };
export type MoveStageConfig = { stageId: number };
export type AssignConfig = { assigneeId: number | null };
```

Leave `export type PipelineRule = typeof pipelineRules.$inferSelect;` as-is - `targetPipelineId`/`targetStageId` now infer as `number | null`, and `actionConfig`/`conditions` as `string | null`.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors). If errors appear in `pipeline-automation.ts` about `targetPipelineId` being possibly null, that's expected - Task 5 fixes the service. For this task, confirm the errors are ONLY the now-`number|null` target columns in `pipeline-automation.ts` / `storage.ts` createRule; do not fix them here.

> Note: if `npm run typecheck` reports nothing fixable in this task's files, proceed. The follow-on tasks (4, 5) resolve the nullability fallout in storage + service.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(pipelines): widen rule action enum + action_config/conditions columns (P4b-1)"
```

---

### Task 2: Startup migration - add columns + relax NOT NULL

**Files:**
- Modify: `server/storage.ts` - automation migration block (after the `pipeline_rule_field_maps` `CREATE TABLE`, ~6515) and the `pipeline_rules` `CREATE TABLE` DDL (~6469-6486)

- [ ] **Step 1: Allow NULL on the two target columns in the CREATE TABLE DDL (fresh installs)**

In the `CREATE TABLE IF NOT EXISTS pipeline_rules (...)` block (~6469), change these two lines from `NOT NULL` to nullable:

```sql
          target_pipeline_id INT,
          target_stage_id INT,
```

(Leave every other column unchanged.)

- [ ] **Step 2: Add the additive column + NOT-NULL-relax migration (existing installs)**

Immediately AFTER the `pipeline_rule_field_maps` try/catch block (the line `} catch (e: any) { console.warn(`[migration] pipeline_rule_field_maps setup failed: ${e.message}`); }`, ~6515) and BEFORE the `// 2. Seed default admin user` comment, insert:

```ts
    // Pipelines Phase 4b-1 - within-card actions + conditions. Additive, idempotent.
    // This DB chokes on `ADD COLUMN IF NOT EXISTS` - explicit info_schema check per column.
    const pipelineRuleColAdds: Array<{ column: string; ddl: string }> = [
      { column: "action_config", ddl: "TEXT NULL" },
      { column: "conditions", ddl: "TEXT NULL" },
    ];
    for (const { column, ddl } of pipelineRuleColAdds) {
      try {
        const [rows]: any = await this.pool.execute(
          `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pipeline_rules' AND column_name = ?`,
          [column],
        );
        if (Number((rows as any[])[0]?.c ?? 0) === 0) {
          await this.pool.execute(`ALTER TABLE pipeline_rules ADD COLUMN ${column} ${ddl}`);
          console.log(`[migration] Added pipeline_rules.${column} ✓`);
        }
      } catch (e: any) {
        console.warn(`[migration] pipeline_rules.${column} add failed: ${e.message}`);
      }
    }
    // Relax legacy create_card-only target columns so non-create_card rules need no placeholder.
    // Idempotent: MODIFY to NULL on an already-nullable column is a harmless no-op.
    try {
      await this.pool.execute(`ALTER TABLE pipeline_rules MODIFY target_pipeline_id INT NULL`);
      await this.pool.execute(`ALTER TABLE pipeline_rules MODIFY target_stage_id INT NULL`);
    } catch (e: any) {
      console.warn(`[migration] pipeline_rules relax target NOT NULL failed: ${e.message}`);
    }
```

- [ ] **Step 2b: Verify build**

Run: `npm run build`
Expected: PASS (esbuild bundles `dist/index.mjs`). The migration SQL is plain strings - no type surface - so success here means it's syntactically wired in.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): startup migration for action_config/conditions + relax target NOT NULL (P4b-1)"
```

---

### Task 3: Pure helpers - conditions + config parsing (TDD)

**Files:**
- Modify: `server/pipeline-automation-helpers.ts`
- Test: `server/pipeline-automation-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

In `server/pipeline-automation-helpers.test.ts`, update the import line to add the new helpers and the condition type:

```ts
import { matchStageEnterRules, buildTargetTitle, pickMappedValues, shapeRuleFieldMaps, evaluateConditions, parseActionConfig, parseConditions } from "./pipeline-automation-helpers.js";
```

Replace the two existing `matchStageEnterRules` tests (the `returns enabled create_card rules…` and `empty when no stage match` tests) with these type-agnostic versions:

```ts
test("matchStageEnterRules returns ALL enabled rules whose triggerStageId matches (any action type)", () => {
  const rules = [
    rule(),
    rule({ id: 2, triggerStageId: 99 }),
    rule({ id: 3, enabled: 0 }),
    rule({ id: 4, actionType: "set_field" }),
    rule({ id: 5, actionType: "move_stage" }),
  ];
  const matched = matchStageEnterRules(rules as any, 10);
  assert.deepEqual(matched.map((r) => r.id), [1, 4, 5]);
});

test("matchStageEnterRules empty when no stage match", () => {
  assert.deepEqual(matchStageEnterRules([rule()] as any, 11), []);
});
```

Append these new test blocks to the end of the file:

```ts
test("evaluateConditions: null / empty list → always true", () => {
  assert.equal(evaluateConditions(null, new Map()), true);
  assert.equal(evaluateConditions([], new Map([[1, "x"]])), true);
});

test("evaluateConditions: eq / neq / contains are case-insensitive and trimmed", () => {
  const vals = new Map([[1, "  Tinggi "]]);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "eq", value: "tinggi" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "neq", value: "rendah" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "contains", value: "ngg" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "eq", value: "rendah" }], vals), false);
});

test("evaluateConditions: gt / lt parse numbers; NaN operand → false", () => {
  const vals = new Map([[1, "1500000"]]);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "gt", value: "1000000" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "lt", value: "1000000" }], vals), false);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "gt", value: "abc" }], vals), false);
  assert.equal(evaluateConditions([{ fieldId: 2, op: "gt", value: "5" }], new Map([[2, "x"]])), false);
});

test("evaluateConditions: empty / not_empty + missing field treated as empty", () => {
  assert.equal(evaluateConditions([{ fieldId: 1, op: "empty" }], new Map()), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "not_empty" }], new Map([[1, "v"]])), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "not_empty" }], new Map([[1, "  "]])), false);
});

test("evaluateConditions: AND across all entries", () => {
  const vals = new Map([[1, "Tinggi"], [2, "2000000"]]);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "eq", value: "Tinggi" }, { fieldId: 2, op: "gt", value: "1000000" }], vals), true);
  assert.equal(evaluateConditions([{ fieldId: 1, op: "eq", value: "Tinggi" }, { fieldId: 2, op: "gt", value: "9000000" }], vals), false);
});

test("parseActionConfig: valid per type", () => {
  assert.deepEqual(parseActionConfig("set_field", JSON.stringify({ fieldId: 3, value: "Diproses" })), { fieldId: 3, value: "Diproses" });
  assert.deepEqual(parseActionConfig("move_stage", JSON.stringify({ stageId: 7 })), { stageId: 7 });
  assert.deepEqual(parseActionConfig("assign", JSON.stringify({ assigneeId: 12 })), { assigneeId: 12 });
  assert.deepEqual(parseActionConfig("assign", JSON.stringify({ assigneeId: null })), { assigneeId: null });
});

test("parseActionConfig: malformed / missing key / create_card → null", () => {
  assert.equal(parseActionConfig("set_field", "{not json"), null);
  assert.equal(parseActionConfig("set_field", JSON.stringify({ fieldId: 3 })), null);
  assert.equal(parseActionConfig("move_stage", JSON.stringify({ stageId: "7" })), null);
  assert.equal(parseActionConfig("assign", JSON.stringify({ assigneeId: "x" })), null);
  assert.equal(parseActionConfig("set_field", null), null);
  assert.equal(parseActionConfig("create_card", JSON.stringify({ fieldId: 1, value: "a" })), null);
});

test("parseConditions: valid array, malformed → [], filters bad entries", () => {
  assert.deepEqual(parseConditions(JSON.stringify([{ fieldId: 1, op: "eq", value: "x" }])), [{ fieldId: 1, op: "eq", value: "x" }]);
  assert.deepEqual(parseConditions("nope"), []);
  assert.deepEqual(parseConditions(null), []);
  assert.deepEqual(parseConditions(JSON.stringify([{ fieldId: 1, op: "eq" }, { nope: true }])), [{ fieldId: 1, op: "eq" }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: FAIL - `evaluateConditions`, `parseActionConfig`, `parseConditions` are not exported; the updated `matchStageEnterRules` test fails because the current filter still requires `actionType === "create_card"`.

- [ ] **Step 3: Implement the helpers**

In `server/pipeline-automation-helpers.ts`:

(a) Update the import line to pull the condition type from schema:

```ts
import type { PipelineRule, RuleCondition } from "../shared/schema.js";
```

(b) Replace the existing `matchStageEnterRules` (drop the `actionType` filter):

```ts
export function matchStageEnterRules(rules: PipelineRule[], stageId: number): PipelineRule[] {
  return rules.filter((r) => r.enabled === 1 && r.triggerStageId === stageId);
}
```

(c) Append these three functions to the end of the file:

```ts
/** AND-evaluate field conditions against a card's values. null/empty → always true. */
export function evaluateConditions(conditions: RuleCondition[] | null, values: Map<number, string>): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => {
    const stored = (values.get(c.fieldId) ?? "").trim();
    const target = (c.value ?? "").trim();
    switch (c.op) {
      case "eq": return stored.toLowerCase() === target.toLowerCase();
      case "neq": return stored.toLowerCase() !== target.toLowerCase();
      case "contains": return stored.toLowerCase().includes(target.toLowerCase());
      case "gt": { const a = Number(stored), b = Number(target); return !Number.isNaN(a) && !Number.isNaN(b) && a > b; }
      case "lt": { const a = Number(stored), b = Number(target); return !Number.isNaN(a) && !Number.isNaN(b) && a < b; }
      case "empty": return stored === "";
      case "not_empty": return stored !== "";
      default: return false;
    }
  });
}

/** Safe-parse + shape-guard an action_config JSON string for a given action type.
 *  Returns null on malformed / missing-key / create_card (which uses legacy columns). */
export function parseActionConfig(
  type: string,
  raw: string | null,
): { fieldId: number; value: string } | { stageId: number } | { assigneeId: number | null } | null {
  if (type === "create_card" || !raw) return null;
  let obj: any;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== "object") return null;
  if (type === "set_field") {
    return (typeof obj.fieldId === "number" && typeof obj.value === "string") ? { fieldId: obj.fieldId, value: obj.value } : null;
  }
  if (type === "move_stage") {
    return (typeof obj.stageId === "number") ? { stageId: obj.stageId } : null;
  }
  if (type === "assign") {
    return (obj.assigneeId === null || typeof obj.assigneeId === "number") ? { assigneeId: obj.assigneeId } : null;
  }
  return null;
}

/** Safe-parse a conditions JSON string. Malformed → []. Filters entries missing fieldId/op. */
export function parseConditions(raw: string | null): RuleCondition[] {
  if (!raw) return [];
  let arr: any;
  try { arr = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.filter((c) => c && typeof c.fieldId === "number" && typeof c.op === "string") as RuleCondition[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: PASS (all tests, including the pre-existing `buildTargetTitle` / `pickMappedValues` / `shapeRuleFieldMaps` ones).

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation-helpers.ts server/pipeline-automation-helpers.test.ts
git commit -m "feat(pipelines): evaluateConditions + parseActionConfig/parseConditions helpers; matchStageEnterRules type-agnostic (P4b-1)"
```

---

### Task 4: Storage - persist actionType / actionConfig / conditions

**Files:**
- Modify: `server/storage.ts` - `createRule` (~2185) + `updateRule` (~2200)

- [ ] **Step 1: Extend `createRule` signature + insert**

Replace the `createRule` method (from `async createRule(` through its closing `return row!;` + `}`) with:

```ts
  async createRule(pipelineId: number, data: { name?: string | null; triggerStageId: number; actionType?: PipelineRuleActionType; targetPipelineId?: number | null; targetStageId?: number | null; titleTemplate?: string | null; copyAssignee?: boolean; enabled?: boolean; actionConfig?: any | null; conditions?: any | null; fieldMaps?: { sourceFieldId: number; targetFieldId: number }[]; }, userId: number): Promise<PipelineRule> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineRules).values({
      mitraId, pipelineId, name: data.name ?? null, triggerStageId: data.triggerStageId,
      actionType: data.actionType ?? "create_card",
      targetPipelineId: data.targetPipelineId ?? null, targetStageId: data.targetStageId ?? null,
      titleTemplate: data.titleTemplate ?? null, copyAssignee: data.copyAssignee ? 1 : 0,
      enabled: data.enabled === false ? 0 : 1,
      actionConfig: data.actionConfig != null ? JSON.stringify(data.actionConfig) : null,
      conditions: data.conditions != null ? JSON.stringify(data.conditions) : null,
      createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineRules).where(and(eq(pipelineRules.id, insertId), eq(pipelineRules.mitraId, mitraId)));
    if (data.fieldMaps) await this.setRuleFieldMaps(row!.id, data.fieldMaps);
    return row!;
  }
```

You will need `PipelineRuleActionType` imported in `storage.ts`. Find the existing import of `PipelineRule`/`PipelineRuleFieldMap` from `../shared/schema...` and add `PipelineRuleActionType` to it. (Grep: `grep -n "PipelineRuleFieldMap" server/storage.ts` - add the type to that same import statement.)

- [ ] **Step 2: Extend `updateRule` signature + patch**

Replace the `updateRule` method (from `async updateRule(` through its closing `return row;` + `}`) with:

```ts
  async updateRule(id: number, data: { name?: string | null; triggerStageId?: number; actionType?: PipelineRuleActionType; targetPipelineId?: number | null; targetStageId?: number | null; titleTemplate?: string | null; copyAssignee?: boolean; enabled?: boolean; actionConfig?: any | null; conditions?: any | null; fieldMaps?: { sourceFieldId: number; targetFieldId: number }[]; }): Promise<PipelineRule> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.triggerStageId !== undefined) patch.triggerStageId = data.triggerStageId;
    if (data.actionType !== undefined) patch.actionType = data.actionType;
    if (data.targetPipelineId !== undefined) patch.targetPipelineId = data.targetPipelineId;
    if (data.targetStageId !== undefined) patch.targetStageId = data.targetStageId;
    if (data.titleTemplate !== undefined) patch.titleTemplate = data.titleTemplate;
    if (data.copyAssignee !== undefined) patch.copyAssignee = data.copyAssignee ? 1 : 0;
    if (data.enabled !== undefined) patch.enabled = data.enabled ? 1 : 0;
    if (data.actionConfig !== undefined) patch.actionConfig = data.actionConfig != null ? JSON.stringify(data.actionConfig) : null;
    if (data.conditions !== undefined) patch.conditions = data.conditions != null ? JSON.stringify(data.conditions) : null;
    await this.db.update(pipelineRules).set(patch).where(and(eq(pipelineRules.id, id), eq(pipelineRules.mitraId, mitraId)));
    const [row] = await this.db.select().from(pipelineRules).where(and(eq(pipelineRules.id, id), eq(pipelineRules.mitraId, mitraId)));
    if (!row) throw new Error("Rule tidak ditemukan");
    if (data.fieldMaps !== undefined) await this.setRuleFieldMaps(id, data.fieldMaps);
    return row;
  }
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors in `storage.ts`. (The only remaining error, if any, is in `server/pipeline-automation.ts` create_card branch about `targetPipelineId` being `number | null` - Task 5 fixes it.)

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): createRule/updateRule persist actionType/actionConfig/conditions (P4b-1)"
```

---

### Task 5: Service - dispatch within-card actions + evaluate conditions

**Files:**
- Modify: `server/pipeline-automation.ts` (full rewrite of the file)

- [ ] **Step 1: Rewrite the service to branch by action type**

Replace the ENTIRE contents of `server/pipeline-automation.ts` with:

```ts
import { storage } from "./storage.js";
import {
  matchStageEnterRules, buildTargetTitle, pickMappedValues,
  evaluateConditions, parseActionConfig, parseConditions,
} from "./pipeline-automation-helpers.js";
import type { PipelineCard } from "../shared/schema.js";

/**
 * Run "card entered stage" automations for a card. Best-effort: never throws to the caller.
 * Loop-safe: all mutations call storage directly and do NOT re-invoke this service.
 */
export async function runStageEnterAutomations(card: PipelineCard, actorId: number): Promise<void> {
  try {
    const rules = matchStageEnterRules(await storage.listRules(card.pipelineId), card.stageId);
    for (const rule of rules) {
      if (await storage.hasRuleFired(rule.id, card.id)) continue;

      // Conditions (AND). Empty → always run. No fire recorded on condition-fail.
      const conds = parseConditions(rule.conditions);
      if (conds.length) {
        const rec = await storage.getCardValues(card.id);
        const valsMap = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
        if (!evaluateConditions(conds, valsMap)) continue;
      }

      let acted = false;

      if (rule.actionType === "create_card") {
        const targetStages = await storage.listStages(rule.targetPipelineId!);
        if (!targetStages.some((s) => s.id === rule.targetStageId)) {
          console.warn(`[automation] rule ${rule.id}: target stage ${rule.targetStageId} no longer exists - skipped`);
        } else {
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
          acted = true;
        }
      } else if (rule.actionType === "set_field") {
        const cfg = parseActionConfig("set_field", rule.actionConfig) as { fieldId: number; value: string } | null;
        const fieldIds = new Set((await storage.listFields(card.pipelineId)).map((f) => f.id));
        if (cfg && fieldIds.has(cfg.fieldId)) {
          await storage.setCardValues(card.id, [{ fieldId: cfg.fieldId, value: cfg.value }]);
          acted = true;
        } else {
          console.warn(`[automation] rule ${rule.id}: set_field config invalid or field missing - skipped`);
        }
      } else if (rule.actionType === "move_stage") {
        const cfg = parseActionConfig("move_stage", rule.actionConfig) as { stageId: number } | null;
        const stageIds = new Set((await storage.listStages(card.pipelineId)).map((s) => s.id));
        if (cfg && stageIds.has(cfg.stageId) && cfg.stageId !== card.stageId) {
          await storage.moveCard(card.id, cfg.stageId, undefined, actorId);
          acted = true;
        } else {
          console.warn(`[automation] rule ${rule.id}: move_stage config invalid, stage missing, or no-op - skipped`);
        }
      } else if (rule.actionType === "assign") {
        const cfg = parseActionConfig("assign", rule.actionConfig) as { assigneeId: number | null } | null;
        if (cfg) {
          if (cfg.assigneeId != null && !(await storage.canUserAccessPipeline(cfg.assigneeId, card.pipelineId))) {
            console.warn(`[automation] rule ${rule.id}: assignee ${cfg.assigneeId} lacks access to pipeline ${card.pipelineId} - skipped`);
          } else {
            await storage.updateCard(card.id, { assigneeId: cfg.assigneeId }, actorId);
            acted = true;
          }
        } else {
          console.warn(`[automation] rule ${rule.id}: assign config invalid - skipped`);
        }
      }

      if (acted) await storage.recordRuleFire(rule.id, card.id);
    }
  } catch (e: any) {
    console.warn(`[automation] runStageEnterAutomations failed for card ${card?.id}: ${e?.message}`);
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Verify helper tests still pass**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(pipelines): automation service dispatches set_field/move_stage/assign + conditions (P4b-1)"
```

---

### Task 6: Routes - validate new actions + conditions; enrich GET

**Files:**
- Modify: `server/routes.ts` - `GET` (~4595), `POST` (~4634), `PATCH` (~4649) rules handlers; add a `validateConditions` helper near `validateRuleFieldMaps`

- [ ] **Step 1: Add a `validateConditions` helper**

Find `validateRuleFieldMaps` (grep: `grep -n "validateRuleFieldMaps" server/routes.ts`). Directly ABOVE its definition, add:

```ts
async function validateConditions(pipelineId: number, conditions: any): Promise<string | null> {
  if (conditions == null) return null;
  if (!Array.isArray(conditions)) return "conditions harus berupa array";
  const ops = new Set(["eq", "neq", "contains", "gt", "lt", "empty", "not_empty"]);
  const ids = new Set((await storage.listFields(pipelineId)).map((f) => f.id));
  for (const c of conditions) {
    if (!c || typeof c.fieldId !== "number" || !ids.has(c.fieldId)) return "Kondisi merujuk field yang tidak ada di pipeline ini";
    if (typeof c.op !== "string" || !ops.has(c.op)) return "Operator kondisi tidak valid";
  }
  return null;
}
```

- [ ] **Step 2: Replace the POST handler**

Replace the entire `router.post("/api/pipelines/:id/rules", ...)` handler (~4634-4647) with:

```ts
  router.post("/api/pipelines/:id/rules", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    const pid = Number(req.params.id);
    const b = req.body ?? {};
    const actionType = (b.actionType ?? "create_card") as string;
    if (!b.triggerStageId) return sendError(res, "triggerStageId wajib", 400);

    const condErr = await validateConditions(pid, b.conditions);
    if (condErr) return sendError(res, condErr, 400);

    if (actionType === "create_card") {
      if (!b.targetPipelineId || !b.targetStageId) return sendError(res, "targetPipelineId, targetStageId wajib", 400);
      if ((await getPipelineLevel(req, Number(b.targetPipelineId))) === "none") return sendError(res, "Tidak punya akses ke pipeline target", 403);
      const mapErr = await validateRuleFieldMaps(pid, Number(b.targetPipelineId), b.fieldMaps);
      if (mapErr) return sendError(res, mapErr, 400);
      return sendSuccess(res, await storage.createRule(pid, {
        name: b.name, triggerStageId: Number(b.triggerStageId), actionType: "create_card",
        targetPipelineId: Number(b.targetPipelineId), targetStageId: Number(b.targetStageId),
        titleTemplate: b.titleTemplate, copyAssignee: b.copyAssignee, enabled: b.enabled,
        conditions: b.conditions ?? null, fieldMaps: b.fieldMaps,
      }, req.authUser!.id));
    }

    const cfgErr = await validateActionConfig(pid, actionType, b.actionConfig);
    if (cfgErr) return sendError(res, cfgErr, 400);
    return sendSuccess(res, await storage.createRule(pid, {
      name: b.name, triggerStageId: Number(b.triggerStageId),
      actionType: actionType as any, actionConfig: b.actionConfig ?? null,
      conditions: b.conditions ?? null, enabled: b.enabled,
    }, req.authUser!.id));
  });
```

- [ ] **Step 3: Add a `validateActionConfig` helper**

Directly below the `validateConditions` helper you added in Step 1, add:

```ts
async function validateActionConfig(pipelineId: number, actionType: string, cfg: any): Promise<string | null> {
  if (actionType === "set_field") {
    if (!cfg || typeof cfg.fieldId !== "number" || typeof cfg.value !== "string") return "set_field butuh actionConfig {fieldId, value}";
    const ids = new Set((await storage.listFields(pipelineId)).map((f) => f.id));
    if (!ids.has(cfg.fieldId)) return "Field tidak ada di pipeline ini";
    return null;
  }
  if (actionType === "move_stage") {
    if (!cfg || typeof cfg.stageId !== "number") return "move_stage butuh actionConfig {stageId}";
    const ids = new Set((await storage.listStages(pipelineId)).map((s) => s.id));
    if (!ids.has(cfg.stageId)) return "Stage tidak ada di pipeline ini";
    return null;
  }
  if (actionType === "assign") {
    if (!cfg || (cfg.assigneeId !== null && typeof cfg.assigneeId !== "number")) return "assign butuh actionConfig {assigneeId|null}";
    return null;
  }
  return "actionType tidak dikenal";
}
```

- [ ] **Step 4: Replace the PATCH handler**

Replace the entire `router.patch("/api/pipelines/:id/rules/:ruleId", ...)` handler (~4649-4676) with:

```ts
  router.patch("/api/pipelines/:id/rules/:ruleId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    const pid = Number(req.params.id);
    const b = req.body ?? {};

    if (b.conditions !== undefined) {
      const condErr = await validateConditions(pid, b.conditions);
      if (condErr) return sendError(res, condErr, 400);
    }
    if (b.targetPipelineId !== undefined && (await getPipelineLevel(req, Number(b.targetPipelineId))) === "none") {
      return sendError(res, "Tidak punya akses ke pipeline target", 403);
    }
    if (b.fieldMaps !== undefined) {
      const current = (await storage.listRules(pid)).find((r) => r.id === Number(req.params.ruleId));
      const tgt = b.targetPipelineId !== undefined ? Number(b.targetPipelineId) : current?.targetPipelineId;
      if (!tgt) return sendError(res, "Tidak bisa resolve pipeline target untuk fieldMaps", 400);
      const mapErr = await validateRuleFieldMaps(pid, tgt, b.fieldMaps);
      if (mapErr) return sendError(res, mapErr, 400);
    }
    if (b.actionConfig !== undefined && b.actionType !== undefined && b.actionType !== "create_card") {
      const cfgErr = await validateActionConfig(pid, String(b.actionType), b.actionConfig);
      if (cfgErr) return sendError(res, cfgErr, 400);
    }
    try {
      sendSuccess(res, await storage.updateRule(Number(req.params.ruleId), {
        name: b.name,
        triggerStageId: b.triggerStageId !== undefined ? Number(b.triggerStageId) : undefined,
        actionType: b.actionType,
        targetPipelineId: b.targetPipelineId !== undefined ? Number(b.targetPipelineId) : undefined,
        targetStageId: b.targetStageId !== undefined ? Number(b.targetStageId) : undefined,
        titleTemplate: b.titleTemplate, copyAssignee: b.copyAssignee, enabled: b.enabled,
        actionConfig: b.actionConfig, conditions: b.conditions,
        fieldMaps: b.fieldMaps,
      }));
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });
```

> Note: the enable/disable toggle PATCH still sends only `{enabled}` - `actionType`/`actionConfig`/`conditions` stay `undefined`, so `updateRule` leaves them untouched. The P4a-ext invariant (toggle doesn't disturb maps) is preserved.

- [ ] **Step 5: Enrich the GET handler with new-action + condition labels**

Replace the entire `router.get("/api/pipelines/:id/rules", ...)` handler (~4595-4632) with:

```ts
  router.get("/api/pipelines/:id/rules", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    const pid = Number(req.params.id);
    const rules = await storage.listRules(pid);

    // One-time lookups (source side + pipeline names + this pipeline's stages + users)
    const allPipes = await storage.listPipelines(true);
    const pipeName = new Map(allPipes.map((p) => [p.id, p.name]));
    const srcFieldList = await storage.listFields(pid);
    const srcFields = new Map(srcFieldList.map((f) => [f.id, { label: f.label, type: f.type }]));
    const selfStages = new Map((await storage.listStages(pid)).map((s) => [s.id, s.label]));
    const userName = new Map((await storage.getAllUsers()).map((u) => [u.id, (u.name as string) || (u.username as string)]));

    // Batched per distinct target pipeline (create_card only): stages + fields
    const targetIds = [...new Set(rules.filter((r) => r.actionType === "create_card" && r.targetPipelineId).map((r) => r.targetPipelineId as number))];
    const stagesByPipe = new Map<number, Map<number, string>>();
    const fieldsByPipe = new Map<number, Map<number, { label: string; type: string }>>();
    await Promise.all(targetIds.map(async (tid) => {
      const [stages, fields] = await Promise.all([storage.listStages(tid), storage.listFields(tid)]);
      stagesByPipe.set(tid, new Map(stages.map((s) => [s.id, s.label])));
      fieldsByPipe.set(tid, new Map(fields.map((f) => [f.id, { label: f.label, type: f.type }])));
    }));

    const withMaps = await Promise.all(rules.map(async (r) => {
      const conds = parseConditions(r.conditions);
      const conditions = conds.map((c) => ({
        ...c, fieldLabel: srcFields.get(c.fieldId)?.label ?? `Field #${c.fieldId} (dihapus)`,
      }));

      let actionConfig: any = null;
      let setFieldLabel: string | undefined, setFieldType: string | null | undefined;
      let moveStageName: string | undefined, assigneeName: string | undefined;
      if (r.actionType === "set_field") {
        const cfg = parseActionConfig("set_field", r.actionConfig) as { fieldId: number; value: string } | null;
        if (cfg) {
          actionConfig = cfg;
          setFieldLabel = srcFields.get(cfg.fieldId)?.label ?? `Field #${cfg.fieldId} (dihapus)`;
          setFieldType = srcFields.get(cfg.fieldId)?.type ?? null;
        }
      } else if (r.actionType === "move_stage") {
        const cfg = parseActionConfig("move_stage", r.actionConfig) as { stageId: number } | null;
        if (cfg) { actionConfig = cfg; moveStageName = selfStages.get(cfg.stageId) ?? `Stage #${cfg.stageId} (dihapus)`; }
      } else if (r.actionType === "assign") {
        const cfg = parseActionConfig("assign", r.actionConfig) as { assigneeId: number | null } | null;
        if (cfg) { actionConfig = cfg; assigneeName = cfg.assigneeId == null ? undefined : (userName.get(cfg.assigneeId) ?? `User #${cfg.assigneeId} (dihapus)`); }
      }

      const rawMaps = r.actionType === "create_card" ? await storage.getRuleFieldMaps(r.id) : [];
      const tgtFields = (r.targetPipelineId && fieldsByPipe.get(r.targetPipelineId)) || new Map<number, { label: string; type: string }>();
      return {
        ...r,
        actionConfig,
        conditions,
        targetPipelineName: r.targetPipelineId ? (pipeName.get(r.targetPipelineId) ?? `Pipeline #${r.targetPipelineId}`) : undefined,
        targetStageName: (r.targetPipelineId && r.targetStageId) ? (stagesByPipe.get(r.targetPipelineId)?.get(r.targetStageId) ?? `Stage #${r.targetStageId} (dihapus)`) : undefined,
        setFieldLabel, setFieldType, moveStageName, assigneeName,
        fieldMaps: shapeRuleFieldMaps(
          rawMaps.map((m) => ({ id: m.id, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId })),
          srcFields, tgtFields,
        ),
      };
    }));
    sendSuccess(res, withMaps);
  });
```

Add the import at the top of `server/routes.ts`: find the existing `import { shapeRuleFieldMaps } from "./pipeline-automation-helpers.js";` line and extend it to:

```ts
import { shapeRuleFieldMaps, parseActionConfig, parseConditions } from "./pipeline-automation-helpers.js";
```

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): rule endpoints validate within-card actions+conditions; GET enriches labels (P4b-1)"
```

---

### Task 7: Client hooks - extend `RuleWithMaps`

**Files:**
- Modify: `client/hooks/usePipelines.ts` (~3, ~13-17)

- [ ] **Step 1: Import the new types + extend `RuleWithMaps`**

Update the schema import (line 3) to add the new types:

```ts
import type { Pipeline, PipelineStage, PipelineCard, PipelineField, PipelineRule, PipelineRuleActionType, RuleCondition } from "@shared/schema";
```

Replace the `RuleWithMaps` type (lines 13-17) with:

```ts
export type RuleConditionWithLabel = RuleCondition & { fieldLabel?: string };
export type RuleWithMaps = PipelineRule & {
  fieldMaps?: RuleFieldMap[];
  targetPipelineName?: string;
  targetStageName?: string;
  // P4b-1 within-card actions + conditions (server-enriched)
  actionConfig?: { fieldId: number; value: string } | { stageId: number } | { assigneeId: number | null } | null;
  conditions?: RuleConditionWithLabel[];
  setFieldLabel?: string;
  setFieldType?: string | null;
  moveStageName?: string;
  assigneeName?: string;
};
```

All new fields are optional, so mutation-return shapes / cached payloads keep typechecking. The `createRule`/`updateRule` mutations already spread the whole body (`api.post(..., b)`), so no mutation changes are needed.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (`PipelineRuleActionType` is imported for use by the dialog in Task 9; if typecheck flags it as unused here, that's fine - it's re-exported via the import and consumed next task. If your linter errors on unused, leave it; tsc `noUnusedLocals` is off for imports used elsewhere - verify the command passes.)

> If `npm run typecheck` errors that `PipelineRuleActionType` is unused, remove it from this import and import it directly in `PipelineRulesDialog.tsx` instead (Task 9 Step 1 already imports from `@shared/schema`).

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): RuleWithMaps carries action config + conditions labels (P4b-1)"
```

---

### Task 8: `ConditionsBuilder` component

**Files:**
- Create: `client/components/pipelines/ConditionsBuilder.tsx`

- [ ] **Step 1: Create the component**

Create `client/components/pipelines/ConditionsBuilder.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Trash2 } from "lucide-react";
import type { PipelineField, RuleConditionOp } from "@shared/schema";

export type DraftCondition = { fieldId: number | ""; op: RuleConditionOp; value: string };

const OPS: { value: RuleConditionOp; label: string }[] = [
  { value: "eq", label: "sama dengan" },
  { value: "neq", label: "tidak sama dengan" },
  { value: "contains", label: "berisi" },
  { value: "gt", label: "lebih dari" },
  { value: "lt", label: "kurang dari" },
  { value: "empty", label: "kosong" },
  { value: "not_empty", label: "tidak kosong" },
];

const NEEDS_VALUE = (op: RuleConditionOp) => op !== "empty" && op !== "not_empty";

export function ConditionsBuilder({
  fields,
  value,
  onChange,
}: {
  fields: PipelineField[];
  value: DraftCondition[];
  onChange: (next: DraftCondition[]) => void;
}) {
  const setRow = (i: number, patch: Partial<DraftCondition>) =>
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => onChange([...value, { fieldId: "", op: "eq", value: "" }]);
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">
        Syarat (opsional) - semua harus terpenuhi (DAN)
      </div>
      {value.map((row, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <Combobox
              options={fields.map((f) => ({ value: String(f.id), label: f.label }))}
              value={row.fieldId === "" ? "" : String(row.fieldId)}
              onChange={(v) => setRow(i, { fieldId: v ? Number(v) : "" })}
              placeholder="Field…"
              searchPlaceholder="Cari field…"
            />
          </div>
          <div className="w-36 shrink-0">
            <Combobox
              options={OPS.map((o) => ({ value: o.value, label: o.label }))}
              value={row.op}
              onChange={(v) => setRow(i, { op: (v || "eq") as RuleConditionOp })}
              placeholder="Operator…"
              clearable={false}
            />
          </div>
          {NEEDS_VALUE(row.op) && (
            <div className="flex-1 min-w-0">
              <Input
                value={row.value}
                onChange={(e) => setRow(i, { value: e.target.value })}
                placeholder="Nilai…"
              />
            </div>
          )}
          <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => removeRow(i)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={addRow}>+ Tambah syarat</Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (Component is not yet imported anywhere - that's fine; it compiles standalone.)

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/ConditionsBuilder.tsx
git commit -m "feat(pipelines): ConditionsBuilder component for rule IF layer (P4b-1)"
```

---

### Task 9: Dialog - action-type selector + per-type form + conditions (write side)

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

- [ ] **Step 1: Imports + new form state**

Update the top of `PipelineRulesDialog.tsx`. Change the lucide import (line 9) and the hooks import (line 8), add `useQuery`/`api`, the `ConditionsBuilder` import, and the `PipelineRuleActionType` type:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { FormField, FormSection } from "@/components/ui/form-field";
import { useRules, usePipeline, usePipelines, usePipelineMutations } from "@/hooks/usePipelines";
import { ConditionsBuilder, type DraftCondition } from "./ConditionsBuilder";
import type { PipelineRuleActionType } from "@shared/schema";
import { Trash2, Plus, Zap, ChevronDown } from "lucide-react";
import { toast } from "sonner";
```

After the existing `const [expandedId, setExpandedId] = useState<number | null>(null);` (line 32), add:

```tsx
  const [actionType, setActionType] = useState<PipelineRuleActionType>("create_card");
  const [setFieldId, setSetFieldId] = useState("");
  const [setFieldValue, setSetFieldValue] = useState("");
  const [moveStageId, setMoveStageId] = useState("");
  const [assignUserId, setAssignUserId] = useState("");      // "" = kosongkan assignee
  const [conditions, setConditions] = useState<DraftCondition[]>([]);

  const { data: staffUsers } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => api.get<any[]>("/users"),
    enabled: open,
  });
```

- [ ] **Step 2: Reset the new state in `resetForm`**

Replace the `resetForm` function (lines 73-80) with:

```tsx
  const resetForm = () => {
    setTriggerStageId("");
    setTargetPipelineId("");
    setTargetStageId("");
    setTitleTemplate("");
    setCopyAssignee(false);
    setMaps([]);
    setActionType("create_card");
    setSetFieldId("");
    setSetFieldValue("");
    setMoveStageId("");
    setAssignUserId("");
    setConditions([]);
  };
```

- [ ] **Step 3: Build the conditions payload + rewrite `add`**

Replace the `add` function (lines 82-103) with:

```tsx
  const buildConditionsPayload = () =>
    conditions
      .filter((c) => c.fieldId !== "")
      .map((c) => ({
        fieldId: Number(c.fieldId),
        op: c.op,
        ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }),
      }));

  const add = async () => {
    const conditionsPayload = buildConditionsPayload();
    try {
      if (actionType === "create_card") {
        if (!triggerStageId || !targetPipelineId || !targetStageId) {
          toast.error("Lengkapi trigger & target sebelum menyimpan");
          return;
        }
        await m.createRule.mutateAsync({
          actionType: "create_card",
          triggerStageId: Number(triggerStageId),
          targetPipelineId: Number(targetPipelineId),
          targetStageId: Number(targetStageId),
          titleTemplate: titleTemplate.trim() || null,
          copyAssignee: copyAssignee ? 1 : 0,
          conditions: conditionsPayload,
          fieldMaps: maps
            .filter((r) => r.sourceFieldId !== "" && r.targetFieldId !== "")
            .map((r) => ({ sourceFieldId: Number(r.sourceFieldId), targetFieldId: Number(r.targetFieldId) })),
        });
      } else if (actionType === "set_field") {
        if (!triggerStageId || !setFieldId) { toast.error("Pilih trigger & field tujuan"); return; }
        await m.createRule.mutateAsync({
          actionType: "set_field",
          triggerStageId: Number(triggerStageId),
          actionConfig: { fieldId: Number(setFieldId), value: setFieldValue },
          conditions: conditionsPayload,
        });
      } else if (actionType === "move_stage") {
        if (!triggerStageId || !moveStageId) { toast.error("Pilih trigger & stage tujuan"); return; }
        await m.createRule.mutateAsync({
          actionType: "move_stage",
          triggerStageId: Number(triggerStageId),
          actionConfig: { stageId: Number(moveStageId) },
          conditions: conditionsPayload,
        });
      } else if (actionType === "assign") {
        if (!triggerStageId) { toast.error("Pilih trigger"); return; }
        await m.createRule.mutateAsync({
          actionType: "assign",
          triggerStageId: Number(triggerStageId),
          actionConfig: { assigneeId: assignUserId ? Number(assignUserId) : null },
          conditions: conditionsPayload,
        });
      }
      toast.success("Otomasi ditambahkan");
      resetForm();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menambah otomasi");
    }
  };
```

- [ ] **Step 4: Add the action-type selector + per-type fields in the "Tambah Otomasi" form**

In the `<FormSection title="Tambah Otomasi" ...>`, the trigger-stage `FormField` stays first. Immediately AFTER the trigger-stage `FormField` (the one closing at `</FormField>` right after the trigger `Combobox`, ~304) and BEFORE the "Buat kartu di pipeline" `FormField` (~306), insert the action selector:

```tsx
              <FormField label="Aksi" htmlFor="rule-action-type" required>
                <Combobox
                  options={[
                    { value: "create_card", label: "Buat kartu di pipeline lain" },
                    { value: "set_field", label: "Set nilai field (kartu ini)" },
                    { value: "move_stage", label: "Pindahkan kartu (stage lain)" },
                    { value: "assign", label: "Tugaskan kartu (assignee)" },
                  ]}
                  value={actionType}
                  onChange={(v) => setActionType((v || "create_card") as PipelineRuleActionType)}
                  placeholder="Pilih aksi…"
                  clearable={false}
                />
              </FormField>
```

Now wrap the existing `create_card` fields so they only show for that action. The block from the "Buat kartu di pipeline" `FormField` (~306) THROUGH the "Copy assignee toggle" `<div ...>...</div>` (ends ~412) is all create_card-specific. Wrap that whole run in `{actionType === "create_card" && ( ... )}`. Concretely:
- Directly BEFORE the `<FormField label="Buat kartu di pipeline" ...>` opening, insert `{actionType === "create_card" && (<>`.
- Directly AFTER the closing `</div>` of the "Copy assignee toggle" block (the `<div className="flex items-center gap-3 rounded-lg bg-muted/30 ...">` … `</div>`), insert `</>)}`.

Then, immediately AFTER that `</>)}`, add the per-type fields for the other three actions plus the shared conditions builder:

```tsx
              {actionType === "set_field" && (
                <>
                  <FormField label="Set field" htmlFor="rule-set-field" required>
                    <Combobox
                      options={sourceFields.map((f) => ({ value: String(f.id), label: f.label }))}
                      value={setFieldId}
                      onChange={(v) => setSetFieldId(v)}
                      placeholder="Pilih field…"
                      searchPlaceholder="Cari field…"
                      clearable={false}
                    />
                  </FormField>
                  <FormField label="Nilai" htmlFor="rule-set-value" hint="Untuk field pilihan, ketik salah satu opsi persis.">
                    <Input
                      id="rule-set-value"
                      value={setFieldValue}
                      onChange={(e) => setSetFieldValue(e.target.value)}
                      placeholder="Nilai field…"
                    />
                  </FormField>
                </>
              )}

              {actionType === "move_stage" && (
                <FormField label="Pindahkan ke stage" htmlFor="rule-move-stage" required>
                  <Combobox
                    options={selfStages.map((s) => ({ value: String(s.id), label: s.label }))}
                    value={moveStageId}
                    onChange={(v) => setMoveStageId(v)}
                    placeholder="Pilih stage tujuan…"
                    searchPlaceholder="Cari stage…"
                    clearable={false}
                  />
                </FormField>
              )}

              {actionType === "assign" && (
                <FormField label="Tugaskan ke" htmlFor="rule-assign-user" hint="Kosongkan untuk menghapus assignee.">
                  <Combobox
                    options={(staffUsers ?? []).map((u: any) => ({ value: String(u.id), label: (u.name as string) || (u.username as string) }))}
                    value={assignUserId}
                    onChange={(v) => setAssignUserId(v)}
                    placeholder="Pilih user (atau kosongkan)…"
                    searchPlaceholder="Cari user…"
                  />
                </FormField>
              )}

              <ConditionsBuilder fields={sourceFields} value={conditions} onChange={setConditions} />
```

- [ ] **Step 5: Make the submit button enabled-state action-aware**

Replace the final submit `<Button ...>Tambah Otomasi</Button>` (~414-422) with:

```tsx
              <Button
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={add}
                loading={m.createRule.isPending}
                disabled={
                  !triggerStageId ||
                  (actionType === "create_card" && (!targetPipelineId || !targetStageId)) ||
                  (actionType === "set_field" && !setFieldId) ||
                  (actionType === "move_stage" && !moveStageId)
                }
                className="w-full sm:w-auto"
              >
                Tambah Otomasi
              </Button>
```

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): rule dialog action-type selector + per-type fields + conditions (P4b-1)"
```

---

### Task 10: Dialog - summary line + detail panel for new actions (read side)

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx` - rule list summary (~184-209) + detail panel (~233-276)

- [ ] **Step 1: Add an action-summary helper**

Inside the component, after `const ruleList = rules ?? [];` (~123), add a helper that renders the one-line summary fragment per action type:

```tsx
  const actionSummary = (r: typeof ruleList[number]) => {
    if (r.actionType === "set_field")
      return <>set field <span className="font-semibold">{r.setFieldLabel ?? "?"}</span> = <span className="font-medium">{(r.actionConfig as any)?.value ?? ""}</span></>;
    if (r.actionType === "move_stage")
      return <>pindahkan ke <span className="font-semibold">{r.moveStageName ?? "?"}</span></>;
    if (r.actionType === "assign")
      return <>tugaskan ke <span className="font-semibold">{r.assigneeName ?? "kosong (hapus assignee)"}</span></>;
    // create_card
    return <>buat kartu di <span className="font-semibold">{r.targetPipelineName ?? pipeName(r.targetPipelineId!)}</span> / <span className="font-medium text-xs">{r.targetStageName ?? targetStageName(r.targetPipelineId!, r.targetStageId!)}</span></>;
  };
```

- [ ] **Step 2: Use the summary helper in the collapsed rule line**

In the collapsed summary `<span className="flex-1 min-w-0 text-sm leading-snug">` block (~184-209), replace the run that currently reads `→ buat kartu di {targetPipelineName} / {targetStageName}` (the spans from `<span className="text-muted-foreground text-xs"> → buat kartu di </span>` through the target-stage `<span ...>{...}</span>`, ~187-190) with a single arrow + the helper:

```tsx
                            <span className="text-muted-foreground text-xs"> → </span>
                            {actionSummary(r)}
```

Keep the trailing badges (`copyAssignee`, `titleTemplate`, `+N field`, `nonaktif`) as-is - they are harmless for non-create_card rules because those fields are null/empty. Additionally, after the existing `{r.fieldMaps && r.fieldMaps.length > 0 && (...)}` badge, add a conditions badge:

```tsx
                            {r.conditions && r.conditions.length > 0 && (
                              <span className="text-[10px] text-muted-foreground ml-1">· {r.conditions.length} syarat</span>
                            )}
```

- [ ] **Step 3: Make the detail panel action-aware**

In the detail panel (`{expanded && (<div className="border-t ...">`, ~233-276), replace the three create_card-specific sections - "Target", "Judul kartu baru", and "Salin assignee" (the three `<div>` blocks spanning ~239-258) - with a single action-aware block, and replace the "Pemetaan field" section so it only renders for create_card. The detail panel's inner content should become:

```tsx
                        <div className="border-t border-border/60 bg-muted/20 px-3 py-3 text-xs space-y-2.5">
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Trigger</div>
                            <div>Saat kartu masuk stage <span className="font-medium">{stageName(r.triggerStageId)}</span></div>
                          </div>

                          {r.conditions && r.conditions.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Syarat (semua harus terpenuhi)</div>
                              <div className="space-y-1">
                                {r.conditions.map((c, i) => (
                                  <div key={i}>
                                    <span className="font-medium">{c.fieldLabel ?? `Field #${c.fieldId}`}</span>{" "}
                                    <span className="text-muted-foreground">{c.op}</span>{" "}
                                    {c.op !== "empty" && c.op !== "not_empty" && <span className="font-medium">{c.value}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Aksi</div>
                            <div>{actionSummary(r)}</div>
                          </div>

                          {r.actionType === "create_card" && (
                            <>
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Judul kartu baru</div>
                                {r.titleTemplate
                                  ? <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{r.titleTemplate}</span>
                                  : <span className="italic text-muted-foreground">Menyalin judul kartu sumber</span>}
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Salin assignee</div>
                                {r.copyAssignee === 1
                                  ? <div>Ya <span className="text-muted-foreground">- hanya jika penerima punya akses ke pipeline target</span></div>
                                  : <div>Tidak</div>}
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Pemetaan field</div>
                                {r.fieldMaps && r.fieldMaps.length > 0 ? (
                                  <div className="space-y-1">
                                    {r.fieldMaps.map((m) => (
                                      <div key={m.id} className="flex items-center gap-1.5">
                                        <span className="font-medium">{m.sourceFieldLabel}</span>{typeChip(m.sourceFieldType)}
                                        <span className="text-muted-foreground">→</span>
                                        <span className="font-medium">{m.targetFieldLabel}</span>{typeChip(m.targetFieldType)}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="italic text-muted-foreground">Tidak ada field yang dipindahkan</div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): rule summary + detail panel render set_field/move_stage/assign + conditions (P4b-1)"
```

---

### Task 11: Full verification + dev manual test

**Files:** none (verification only)

- [ ] **Step 1: Run the whole helper test suite**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: PASS - all `matchStageEnterRules`, `buildTargetTitle`, `pickMappedValues`, `shapeRuleFieldMaps`, `evaluateConditions`, `parseActionConfig`, `parseConditions` tests green.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 type errors; `dist/index.mjs` bundled.

- [ ] **Step 3: Manual dev checklist** (on `jabnet_fiber_dev`; restart the dev Node app so the migration runs)

Verify each:
1. **set_field:** rule on pipeline A "enter Negosiasi → set field Status Internal = Diproses". Move a card into Negosiasi → the same card's field is set. Re-enter → no duplicate effect (fire dedup).
2. **move_stage:** rule "enter Baru → pindahkan ke Tindak Lanjut". Create a card into Baru → it lands in Tindak Lanjut, and **does not loop** (no further automation cascade), no duplicate fire.
3. **assign:** rule "enter Survei → tugaskan ke Budi". Budi has access → assigned. Change rule to a user without access to a restricted pipeline → fire skipped + server warns, card stays unassigned. Assign with "kosongkan" → assignee cleared.
4. **conditions:** add "HANYA jika Prioritas = Tinggi" to a set_field rule. Enter stage with Prioritas=Rendah → skipped. Set Prioritas=Tinggi, move out and back in → action runs (no fire was recorded on the earlier fail).
5. **back-compat:** an existing `create_card` rule (with field maps) still fires unchanged; its detail panel still shows target/title/assignee/maps.
6. **toggle invariant:** flip a rule's Aktif switch → only `{enabled}` is sent; reopening shows action + conditions intact.
7. **detail panel:** expand each rule type → summary line + detail sections render correct labels (field/stage/user names; condition field labels); deleted field/stage/user → "(dihapus)" fallback.

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(pipelines): P4b-1 verification fixups" || echo "nothing to commit"
```

---

## Self-Review Notes (author)

- **Spec coverage:** data model (Task 1-2), `evaluateConditions`/`parseActionConfig`/`parseConditions` + `matchStageEnterRules` change (Task 3), storage persistence (Task 4), service dispatch + conditions + loop-safety (Task 5), endpoint validation + GET enrichment (Task 6), hooks type (Task 7), conditions UI (Task 8), dialog form (Task 9), summary+detail read view (Task 10), verification (Task 11). All spec sections mapped.
- **Type consistency:** `RuleCondition` / `RuleConditionOp` / `*Config` defined in `shared/schema.ts` (Task 1), consumed by helpers (Task 3), service (Task 5), hooks (Task 7), and `ConditionsBuilder` (Task 8). `parseActionConfig(type, raw)` signature is identical across helper impl, service calls, and route enrichment. `matchStageEnterRules` is type-agnostic everywhere after Task 3.
- **No placeholders:** every code step shows complete, copy-ready code.
- **Loop-safety:** Task 5 keeps all mutations on `storage` (never routes); `move_stage` no-op guard (`cfg.stageId !== card.stageId`) + `recordRuleFire` only on `acted` prevent re-fire and condition-fail fires.
