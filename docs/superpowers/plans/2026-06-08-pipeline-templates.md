# Pipeline Templates (Phase 5) - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save a pipeline's full structure (stages + fields with rules + automation) as a reusable template and create new pipelines from templates (built-in or saved), with all stage/field id references remapped.

**Architecture:** A pure module rewrites stage/field references between DB ids and stable internal keys (one rewrite applied in both directions → snapshot and instantiate are inverses, validated by a round-trip test). A `pipeline_templates` table stores the portable JSON. Storage snapshots/instantiates; routes + a picker dialog expose it.

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React. `.js` import extensions. New table via `CREATE TABLE IF NOT EXISTS` at startup.

---

### Task 1: Pure transform module - snapshot/remap + built-ins

**Files:**
- Create: `shared/pipelineTemplate.ts`
- Test: `shared/pipelineTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/pipelineTemplate.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pipelineToTemplate,
  remapFieldConfig,
  remapTemplateRule,
  BUILTIN_TEMPLATES,
} from "./pipelineTemplate.js";

// A synthetic pipeline: 2 stages (ids 10,11), 2 fields (ids 20,21).
// field 21 has a requiredWhen referencing field 20 + stage 11.
// rule: trigger stage 10, condition on field 20, set_field action on field 21, fieldMap 20->21,
// plus one cross-pipeline action (targetPipelineId set) that must be dropped.
const input = {
  pipeline: { name: "Src", description: "d", color: "#111", icon: "target" },
  stages: [
    { id: 10, label: "New", color: "#222", position: 0, description: null },
    { id: 11, label: "Done", color: "#333", position: 1, description: "final" },
  ],
  fields: [
    { id: 20, label: "Type", type: "dropdown", options: '["a","b"]', required: 0, showOnCard: 1, position: 0, config: null },
    { id: 21, label: "Note", type: "text", options: null, required: 0, showOnCard: 0, position: 1,
      config: JSON.stringify({ requiredWhen: [[{ source: "field", fieldId: 20, op: "eq", value: "a" }, { source: "stage", op: "eq", value: "11" }]] }) },
  ],
  rules: [
    { name: "R1", triggerType: "stage_enter", triggerStageId: 10, triggerConfig: null,
      conditions: [[{ fieldId: 20, op: "eq", value: "a" }]], enabled: 1,
      actions: [
        { actionType: "set_field", actionConfig: { fieldId: 21, value: "x" }, targetStageId: 11, targetPipelineId: null, titleTemplate: null, copyAssignee: 0, fieldMaps: [{ sourceFieldId: 20, targetFieldId: 21 }] },
        { actionType: "create_card", actionConfig: null, targetStageId: null, targetPipelineId: 999, titleTemplate: "T", copyAssignee: 0, fieldMaps: [] },
      ] },
  ],
};

test("pipelineToTemplate replaces ids with keys and drops cross-pipeline actions", () => {
  const def = pipelineToTemplate(input);
  assert.deepEqual(def.stages.map((s) => s.key), ["stage_0", "stage_1"]);
  assert.deepEqual(def.fields.map((f) => f.key), ["field_0", "field_1"]);
  // field config rewritten to keys
  const cfg = JSON.parse(def.fields[1].config!);
  assert.equal(cfg.requiredWhen[0][0].fieldId, "field_0");
  assert.equal(cfg.requiredWhen[0][1].value, "stage_1");
  // rule rewritten to keys; cross-pipeline action dropped
  const r = def.rules[0];
  assert.equal(r.triggerStageKey, "stage_0");
  assert.equal(r.conditions[0][0].fieldId, "field_0");
  assert.equal(r.actions.length, 1); // create_card with targetPipelineId dropped
  assert.equal(r.actions[0].actionConfig.fieldId, "field_1");
  assert.equal(r.actions[0].targetStageKey, "stage_1");
  assert.deepEqual(r.actions[0].fieldMaps[0], { sourceFieldKey: "field_0", targetFieldKey: "field_1" });
});

test("remap round-trip: keys → fresh ids resolve consistently", () => {
  const def = pipelineToTemplate(input);
  // simulate instantiation assigning new ids
  const stageKeyToId = new Map([["stage_0", 100], ["stage_1", 101]]);
  const fieldKeyToId = new Map([["field_0", 200], ["field_1", 201]]);
  const newCfg = JSON.parse(remapFieldConfig(def.fields[1].config, fieldKeyToId, stageKeyToId)!);
  assert.equal(newCfg.requiredWhen[0][0].fieldId, 200);
  assert.equal(newCfg.requiredWhen[0][1].value, "101");
  const ruleData = remapTemplateRule(def.rules[0], fieldKeyToId, stageKeyToId);
  assert.equal(ruleData.triggerStageId, 100);
  assert.equal(ruleData.conditions[0][0].fieldId, 200);
  assert.equal(ruleData.actions[0].actionConfig.fieldId, 201);
  assert.equal(ruleData.actions[0].targetStageId, 101);
  assert.deepEqual(ruleData.actions[0].fieldMaps[0], { sourceFieldId: 200, targetFieldId: 201 });
});

test("built-in templates are well-formed", () => {
  assert.ok(BUILTIN_TEMPLATES.length >= 4);
  for (const t of BUILTIN_TEMPLATES) {
    assert.ok(t.pipeline.name && Array.isArray(t.stages) && Array.isArray(t.fields) && Array.isArray(t.rules));
    assert.ok(t.stages.every((s) => typeof s.key === "string"));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/pipelineTemplate.test.ts`
Expected: FAIL - module missing.

- [ ] **Step 3: Write the module**

Create `shared/pipelineTemplate.ts`:

```ts
/** Pure transforms for pipeline templates. No DB, no I/O.
 * Stage/field references are stored in templates by stable key (stage_<i>/field_<i>) and remapped
 * to fresh DB ids on instantiation. The same rewrite runs in both directions (snapshot vs apply),
 * so they are inverses. */

export interface TemplateDefinition {
  pipeline: { name: string; description: string | null; color: string; icon: string | null };
  stages: { key: string; label: string; color: string; position: number; description: string | null }[];
  fields: { key: string; label: string; type: string; options: string | null; required: number; showOnCard: number; position: number; config: string | null }[];
  rules: TemplateRule[];
}
export interface TemplateRule {
  name: string | null; triggerType: string; triggerStageKey: string | null;
  triggerConfig: any | null; conditions: any | null; enabled: number;
  actions: { actionType: string; actionConfig: any | null; targetStageKey: string | null; titleTemplate: string | null; copyAssignee: number; fieldMaps: { sourceFieldKey: string; targetFieldKey: string }[] }[];
}

type Mapper = (v: any) => any; // field/stage id<->key in one direction

/** Rewrite the field/stage refs inside a config JSON string (visibleWhen/requiredWhen condition groups).
 * mapField/mapStage map a single ref value in the desired direction; other config keys are untouched. */
function rewriteConfigRefs(config: string | null, mapField: Mapper, mapStage: Mapper): string | null {
  if (!config) return config;
  let obj: any;
  try { obj = JSON.parse(config); } catch { return config; }
  for (const key of ["visibleWhen", "requiredWhen"]) {
    if (!Array.isArray(obj[key])) continue;
    obj[key] = obj[key].map((group: any[]) => (Array.isArray(group) ? group.map((c: any) => {
      if (c?.source === "stage") return { ...c, value: String(mapStage(c.value)) };
      return { ...c, fieldId: mapField(c.fieldId) };
    }) : group));
  }
  return JSON.stringify(obj);
}

/** Rewrite a triggerConfig blob's field/stage refs in place (returns a new object). */
function rewriteTriggerConfig(tc: any, triggerType: string, mapField: Mapper, mapStage: Mapper): any {
  if (tc == null || typeof tc !== "object") return tc;
  const out = { ...tc };
  if (triggerType === "field_updated" && out.fieldId != null) out.fieldId = mapField(out.fieldId);
  if (triggerType === "time" && out.anchor === "field_date" && out.fieldId != null) out.fieldId = mapField(out.fieldId);
  if (triggerType === "billing_sync") {
    if (out.resolveStageId != null) out.resolveStageId = mapStage(out.resolveStageId);
    if (Array.isArray(out.fieldMap)) out.fieldMap = out.fieldMap.map((m: any) => ({ ...m, targetFieldId: mapField(m.targetFieldId) }));
  }
  return out;
}

```

Then the two clear directional functions (rules use different property names per direction -
`*Key` when snapshotting, `*Id` when instantiating - so keep them explicit rather than generic; the
shared `rewriteConfigRefs`/`rewriteTriggerConfig` helpers above map a single ref via the passed mapper).
The Step-1 test is the exact contract for both:

```ts
export function pipelineToTemplate(input: {
  pipeline: { name: string; description: string | null; color: string; icon: string | null };
  stages: { id: number; label: string; color: string; position: number; description: string | null }[];
  fields: { id: number; label: string; type: string; options: string | null; required: number; showOnCard: number; position: number; config: string | null }[];
  rules: any[];
}): TemplateDefinition {
  const stageIdToKey = new Map<number, string>();
  input.stages.forEach((s, i) => stageIdToKey.set(s.id, `stage_${i}`));
  const fieldIdToKey = new Map<number, string>();
  input.fields.forEach((f, i) => fieldIdToKey.set(f.id, `field_${i}`));
  const mf = (v: any) => fieldIdToKey.get(Number(v)) ?? v;
  const ms = (v: any) => stageIdToKey.get(Number(v)) ?? String(v);
  return {
    pipeline: { name: input.pipeline.name, description: input.pipeline.description ?? null, color: input.pipeline.color, icon: input.pipeline.icon ?? null },
    stages: input.stages.map((s, i) => ({ key: `stage_${i}`, label: s.label, color: s.color, position: i, description: s.description ?? null })),
    fields: input.fields.map((f, i) => ({ key: `field_${i}`, label: f.label, type: f.type, options: f.options ?? null, required: f.required ?? 0, showOnCard: f.showOnCard ?? 0, position: i, config: rewriteConfigRefs(f.config ?? null, mf, ms) })),
    rules: input.rules.map((r) => ({
      name: r.name ?? null, triggerType: r.triggerType, enabled: r.enabled ?? 1,
      triggerStageKey: r.triggerStageId != null ? (stageIdToKey.get(Number(r.triggerStageId)) ?? null) : null,
      triggerConfig: rewriteTriggerConfig(r.triggerConfig ?? null, r.triggerType, mf, ms),
      conditions: Array.isArray(r.conditions) ? r.conditions.map((g: any[]) => g.map((c: any) => ({ ...c, fieldId: mf(c.fieldId) }))) : (r.conditions ?? null),
      actions: (r.actions ?? []).filter((a: any) => !(a.targetPipelineId != null && a.targetPipelineId !== 0)).map((a: any) => {
        const ac = a.actionConfig && typeof a.actionConfig === "object" ? { ...a.actionConfig } : a.actionConfig;
        if (ac && typeof ac === "object") { if (ac.fieldId != null) ac.fieldId = mf(ac.fieldId); if (ac.stageId != null) ac.stageId = ms(ac.stageId); }
        return { actionType: a.actionType, actionConfig: ac, targetStageKey: a.targetStageId != null ? (stageIdToKey.get(Number(a.targetStageId)) ?? null) : null, titleTemplate: a.titleTemplate ?? null, copyAssignee: a.copyAssignee ?? 0, fieldMaps: (a.fieldMaps ?? []).map((m: any) => ({ sourceFieldKey: fieldIdToKey.get(Number(m.sourceFieldId)) ?? String(m.sourceFieldId), targetFieldKey: fieldIdToKey.get(Number(m.targetFieldId)) ?? String(m.targetFieldId) })) };
      }),
    })),
  };
}

export function remapFieldConfig(config: string | null, fieldKeyToId: Map<string, number>, stageKeyToId: Map<string, number>): string | null {
  return rewriteConfigRefs(config, (k) => fieldKeyToId.get(String(k)) ?? k, (k) => stageKeyToId.get(String(k)) ?? k);
}

/** Returns a `storage.createRule` data object (ids), built from a TemplateRule (keys). */
export function remapTemplateRule(rule: TemplateRule, fieldKeyToId: Map<string, number>, stageKeyToId: Map<string, number>) {
  const mf = (k: any) => fieldKeyToId.get(String(k)) ?? null;
  const ms = (k: any) => stageKeyToId.get(String(k)) ?? null;
  return {
    name: rule.name, triggerType: rule.triggerType as any, enabled: rule.enabled === 1,
    triggerStageId: rule.triggerStageKey != null ? ms(rule.triggerStageKey) : null,
    triggerConfig: rewriteTriggerConfig(rule.triggerConfig ?? null, rule.triggerType, mf, ms),
    conditions: Array.isArray(rule.conditions) ? rule.conditions.map((g: any[]) => g.map((c: any) => ({ ...c, fieldId: mf(c.fieldId) }))) : (rule.conditions ?? null),
    actions: rule.actions.map((a) => {
      const ac = a.actionConfig && typeof a.actionConfig === "object" ? { ...a.actionConfig } : a.actionConfig;
      if (ac && typeof ac === "object") { if (ac.fieldId != null) ac.fieldId = mf(ac.fieldId); if (ac.stageId != null) ac.stageId = ms(ac.stageId); }
      return { actionType: a.actionType, actionConfig: ac, targetStageId: a.targetStageKey != null ? ms(a.targetStageKey) : null, targetPipelineId: null, titleTemplate: a.titleTemplate, copyAssignee: a.copyAssignee, fieldMaps: a.fieldMaps.map((m) => ({ sourceFieldId: mf(m.sourceFieldKey)!, targetFieldId: mf(m.targetFieldKey)! })) };
    }),
  };
}
```

(In `pipelineToTemplate` the stage mapper `ms` yields a key string - correct for snapshot; in
`remapTemplateRule` it yields the numeric new id - correct for instantiate. So billing_sync's
`resolveStageId` round-trips: id → `stage_K` on snapshot, `stage_K` → new id on apply.)

Then add the built-ins (complete, minimal definitions):

```ts
const nowKeyStages = (labels: { label: string; color: string }[]) =>
  labels.map((l, i) => ({ key: `stage_${i}`, label: l.label, color: l.color, position: i, description: null }));

export const BUILTIN_TEMPLATES: TemplateDefinition[] = [
  { pipeline: { name: "Sales Pipeline", description: "CRM penjualan", color: "#0EA5E9", icon: "trending-up" },
    stages: nowKeyStages([{ label: "Prospek", color: "#6B7280" }, { label: "Kualifikasi", color: "#3B82F6" }, { label: "Negosiasi", color: "#F59E0B" }, { label: "Menang", color: "#22C55E" }, { label: "Kalah", color: "#EF4444" }]),
    fields: [
      { key: "field_0", label: "Telepon", type: "phone", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Nilai Deal", type: "number", options: null, required: 0, showOnCard: 1, position: 1, config: null },
      { key: "field_2", label: "Sumber", type: "dropdown", options: JSON.stringify(["inbound", "referral", "canvassing"]), required: 0, showOnCard: 0, position: 2, config: null },
    ], rules: [] },
  { pipeline: { name: "Collection Pipeline", description: "Penagihan", color: "#F59E0B", icon: "banknote" },
    stages: nowKeyStages([{ label: "Baru", color: "#6B7280" }, { label: "Dihubungi", color: "#3B82F6" }, { label: "Janji Bayar", color: "#8B5CF6" }, { label: "Lunas", color: "#22C55E" }, { label: "Hapus Buku", color: "#EF4444" }]),
    fields: [
      { key: "field_0", label: "Telepon", type: "phone", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Tagihan (Rp)", type: "number", options: null, required: 0, showOnCard: 1, position: 1, config: null },
      { key: "field_2", label: "Jatuh Tempo", type: "text", options: null, required: 0, showOnCard: 1, position: 2, config: null },
    ], rules: [] },
  { pipeline: { name: "Project Pipeline", description: "Manajemen proyek", color: "#8B5CF6", icon: "folder-kanban" },
    stages: nowKeyStages([{ label: "Backlog", color: "#6B7280" }, { label: "Dikerjakan", color: "#3B82F6" }, { label: "Review", color: "#F59E0B" }, { label: "Selesai", color: "#22C55E" }]),
    fields: [
      { key: "field_0", label: "Penanggung Jawab", type: "user", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Estimasi (hari)", type: "number", options: null, required: 0, showOnCard: 0, position: 1, config: null },
    ], rules: [] },
  { pipeline: { name: "Customer Service", description: "Tiket layanan", color: "#22C55E", icon: "headphones" },
    stages: nowKeyStages([{ label: "Masuk", color: "#6B7280" }, { label: "Diproses", color: "#3B82F6" }, { label: "Menunggu Pelanggan", color: "#F59E0B" }, { label: "Selesai", color: "#22C55E" }]),
    fields: [
      { key: "field_0", label: "Telepon", type: "phone", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Kategori", type: "dropdown", options: JSON.stringify(["teknis", "billing", "umum"]), required: 0, showOnCard: 1, position: 1, config: null },
    ], rules: [] },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/pipelineTemplate.test.ts`
Expected: PASS - all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/pipelineTemplate.ts shared/pipelineTemplate.test.ts
git commit -m "feat(pipelines): pure template snapshot/remap transforms + built-ins"
```

---

### Task 2: Schema + startup table + seed built-ins

**Files:**
- Modify: `shared/schema.ts`, `server/storage.ts`

- [ ] **Step 1: Add the table to schema**

In `shared/schema.ts`, near the other pipeline tables, add:
```ts
export const pipelineTemplates = mysqlTable("pipeline_templates", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 64 }),
  color: varchar("color", { length: 16 }).notNull().default("#0EA5E9"),
  definition: text("definition").notNull(),
  isBuiltin: int("is_builtin").notNull().default(0),
  createdBy: int("created_by"),
  createdAt: text("created_at").notNull(),
}, (t) => ({ byMitra: index("idx_pipeline_templates_mitra").on(t.mitraId) }));

export type PipelineTemplate = typeof pipelineTemplates.$inferSelect;
```

- [ ] **Step 2: Create the table at startup + seed built-ins**

In `server/storage.ts`, add `pipelineTemplates`/`PipelineTemplate` to the schema import, and `BUILTIN_TEMPLATES` from `../shared/pipelineTemplate.js`. In the pipeline-table startup block (near the `card_relations` create), add:
```ts
    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS pipeline_templates (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          icon VARCHAR(64),
          color VARCHAR(16) NOT NULL DEFAULT '#0EA5E9',
          definition TEXT NOT NULL,
          is_builtin INT NOT NULL DEFAULT 0,
          created_by INT,
          created_at TEXT NOT NULL,
          KEY idx_pipeline_templates_mitra (mitra_id)
        )
      `);
    } catch (e: any) {
      console.warn(`[migration] pipeline_templates create skipped: ${e.message}`);
    }
```

- [ ] **Step 3: Seed built-ins per mitra**

Add a storage method `seedBuiltinTemplates(mitraId: number)` (call it from the existing per-mitra seed loop, alongside `ensureMitraDirs`/`seedMitra...`):
```ts
  async seedBuiltinTemplates(mitraId: number): Promise<void> {
    const now = new Date().toISOString();
    for (const def of BUILTIN_TEMPLATES) {
      const [existing]: any = await this.pool.execute(
        `SELECT id FROM pipeline_templates WHERE mitra_id = ? AND name = ? AND is_builtin = 1 LIMIT 1`,
        [mitraId, def.pipeline.name],
      );
      if ((existing as any[]).length) continue;
      await this.pool.execute(
        `INSERT INTO pipeline_templates (mitra_id, name, description, icon, color, definition, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [mitraId, def.pipeline.name, def.pipeline.description, def.pipeline.icon, def.pipeline.color, JSON.stringify(def), now],
      );
    }
  }
```
Find where the startup seeds per mitra (search for `ensureMitraDirs(` or `seedCollectionStagesForMitra(`) and add `await this.seedBuiltinTemplates(m.id);` (or `(1)` for JABNET) in that loop.

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): pipeline_templates table + startup create + seed built-ins"
```

---

### Task 3: Storage - list/get/delete + create-from-pipeline

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Add methods**

In `server/storage.ts`, near the other pipeline methods, add (import `pipelineToTemplate` from `../shared/pipelineTemplate.js`; `listStages`/`listFields`/`listRules`/`listRuleActionsByRuleIds`/`listRuleFieldMaps...` already exist - use the available readers; if a per-rule fieldMaps reader is needed, use the existing one that the rules detail endpoint uses):

```ts
  async listTemplates(): Promise<PipelineTemplate[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineTemplates)
      .where(eq(pipelineTemplates.mitraId, mitraId))
      .orderBy(desc(pipelineTemplates.isBuiltin), asc(pipelineTemplates.name));
  }

  async getTemplate(id: number): Promise<PipelineTemplate | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineTemplates).where(and(eq(pipelineTemplates.id, id), eq(pipelineTemplates.mitraId, mitraId)));
    return row;
  }

  async deleteTemplate(id: number): Promise<number> {
    const mitraId = getMitraId();
    const result: any = await this.db.delete(pipelineTemplates)
      .where(and(eq(pipelineTemplates.id, id), eq(pipelineTemplates.mitraId, mitraId), eq(pipelineTemplates.isBuiltin, 0)));
    return Number(result?.[0]?.affectedRows ?? 0);
  }

  async createTemplateFromPipeline(pipelineId: number, data: { name: string; description?: string | null }, userId: number): Promise<PipelineTemplate> {
    const mitraId = getMitraId();
    const [pipe] = await this.db.select().from(pipelines).where(and(eq(pipelines.id, pipelineId), eq(pipelines.mitraId, mitraId)));
    if (!pipe) throw new Error("Pipeline tidak ditemukan");
    const stages = await this.listStages(pipelineId);
    const fields = await this.listFields(pipelineId);
    const rules = await this.listRules(pipelineId);
    const rulesFull = [];
    for (const r of rules) {
      const actions = await this.listRuleActions(r.id);
      const actsWithMaps = [];
      for (const a of actions) {
        const fieldMaps = await this.listRuleFieldMapsForAction(a.id); // see note
        actsWithMaps.push({ ...a, fieldMaps });
      }
      rulesFull.push({ ...r, conditions: r.conditions ? JSON.parse(r.conditions) : null, triggerConfig: r.triggerConfig ? JSON.parse(r.triggerConfig) : null, actions: actsWithMaps.map((a) => ({ ...a, actionConfig: a.actionConfig ? JSON.parse(a.actionConfig) : null })) });
    }
    const def = pipelineToTemplate({
      pipeline: { name: pipe.name, description: pipe.description, color: pipe.color, icon: pipe.icon },
      stages, fields, rules: rulesFull,
    });
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineTemplates).values({
      mitraId, name: data.name, description: data.description ?? null,
      icon: pipe.icon ?? null, color: pipe.color, definition: JSON.stringify(def), isBuiltin: 0, createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    return (await this.getTemplate(insertId))!;
  }
```
NOTE: use whatever per-action field-map reader exists. Search `listRuleFieldMaps` / how the rules-detail
endpoint loads `fieldMaps` per action, and reuse it. If the only reader is by rule, group its rows by
`actionId`. Adapt the `actsWithMaps` loop accordingly and report what you used.

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): template list/get/delete + create-from-pipeline (snapshot)"
```

---

### Task 4: Storage - instantiateTemplate (two-pass apply)

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Add instantiateTemplate**

In `server/storage.ts`, add (imports `remapFieldConfig`, `remapTemplateRule`, type `TemplateDefinition` from `../shared/pipelineTemplate.js`):
```ts
  async instantiateTemplate(templateId: number, data: { name: string; color?: string; icon?: string }, userId: number): Promise<Pipeline> {
    const tpl = await this.getTemplate(templateId);
    if (!tpl) throw new Error("Template tidak ditemukan");
    const def = JSON.parse(tpl.definition) as TemplateDefinition;
    // 1. pipeline
    const pipeline = await this.createPipeline({
      name: data.name, description: def.pipeline.description ?? undefined,
      color: data.color ?? def.pipeline.color, icon: data.icon ?? def.pipeline.icon ?? undefined,
    }, userId);
    // 2. stages → key→id
    const stageKeyToId = new Map<string, number>();
    for (const s of def.stages) {
      const created = await this.createStage(pipeline.id, { label: s.label, color: s.color, description: s.description });
      stageKeyToId.set(s.key, created.id);
    }
    // 3. fields → key→id (config rules remapped)
    const fieldKeyToId = new Map<string, number>();
    for (const f of def.fields) {
      const created = await this.createField(pipeline.id, {
        label: f.label, type: f.type,
        options: f.options ? (JSON.parse(f.options) as string[]) : null,
        required: f.required === 1, showOnCard: f.showOnCard === 1,
        config: remapFieldConfig(f.config, fieldKeyToId, stageKeyToId),
      });
      fieldKeyToId.set(f.key, created.id);
    }
    // NOTE: a field rule referencing a LATER field is remapped after both exist - so do a second pass
    // to fix configs that referenced not-yet-created fields:
    for (const f of def.fields) {
      if (!f.config) continue;
      const remapped = remapFieldConfig(f.config, fieldKeyToId, stageKeyToId);
      const fid = fieldKeyToId.get(f.key)!;
      await this.updateField(fid, { config: remapped });
    }
    // 4. rules
    for (const r of def.rules) {
      const ruleData = remapTemplateRule(r, fieldKeyToId, stageKeyToId);
      await this.createRule(pipeline.id, ruleData as any, userId);
    }
    return pipeline;
  }
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): instantiateTemplate (two-pass clone with id remap)"
```

---

### Task 5: Routes - templates API

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add the routes**

In `server/routes.ts`, near the pipeline routes, add (gating: list = `requirePermission "pipelines"`; the rest = `requireWritePermission "pipelines"`):
```ts
  router.get("/api/pipeline-templates", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    sendSuccess(res, await storage.listTemplates());
  });

  router.post("/api/pipeline-templates", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { fromPipelineId, name, description } = req.body ?? {};
    if (!name || !fromPipelineId) return sendError(res, "name + fromPipelineId wajib", 400);
    if (!(await requirePipelineCapability(req, res, Number(fromPipelineId), "view"))) return;
    try {
      sendSuccess(res, await storage.createTemplateFromPipeline(Number(fromPipelineId), { name: String(name), description: description ?? null }, req.authUser!.id));
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.post("/api/pipeline-templates/:id/apply", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const { name, color, icon } = req.body ?? {};
    if (!name) return sendError(res, "name pipeline baru wajib", 400);
    try {
      const pipeline = await storage.instantiateTemplate(Number(req.params.id), { name: String(name), color, icon }, req.authUser!.id);
      sendSuccess(res, pipeline);
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.delete("/api/pipeline-templates/:id", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const n = await storage.deleteTemplate(Number(req.params.id));
    if (n === 0) return sendError(res, "Template tidak ditemukan atau bawaan", 404);
    sendSuccess(res, { ok: true });
  });
```
Register these BEFORE any `/api/pipelines/:id` param route is not a concern (different prefix `pipeline-templates`), but keep them with the other pipeline routes.

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): template API (list/save/apply/delete)"
```

---

### Task 6: Frontend - template picker + save-as-template

**Files:**
- Modify: `client/hooks/usePipelines.ts`, `client/pages/PipelinesPage.tsx`
- Create: `client/components/pipelines/TemplatePickerDialog.tsx`

**Context:** READ `client/pages/PipelinesPage.tsx` (how pipelines are listed + the "create pipeline" action + navigation) and `client/hooks/usePipelines.ts` (api + mutation patterns).

- [ ] **Step 1: Hooks**

In `client/hooks/usePipelines.ts` add:
```ts
export function usePipelineTemplates() {
  return useQuery({ queryKey: ["pipeline-templates"], queryFn: () => api.get(`/pipeline-templates`) });
}
export function useTemplateMutations() {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ["pipeline-templates"] }); qc.invalidateQueries({ queryKey: ["pipelines"] }); };
  return {
    apply: useMutation({ mutationFn: ({ id, ...b }: any) => api.post(`/pipeline-templates/${id}/apply`, b), onSuccess: inv }),
    saveAs: useMutation({ mutationFn: (b: { fromPipelineId: number; name: string; description?: string }) => api.post(`/pipeline-templates`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/pipeline-templates/${id}`), onSuccess: inv }),
  };
}
```
(Match the file's real `api` delete method name + query hook imports.)

- [ ] **Step 2: TemplatePickerDialog**

Create `client/components/pipelines/TemplatePickerDialog.tsx`: a dialog that lists `usePipelineTemplates()` results (name, icon, a small "N stage · M field" count parsed from `definition`), lets the user pick one + type a new pipeline name, and calls `apply.mutateAsync({ id, name })` then invokes an `onCreated(pipeline)` callback (the page navigates to `/pipelines/<id>`). Use the project's Dialog/Button/Input components + design conventions. A builtin badge for `is_builtin === 1`; a delete (X) button for non-builtin templates calling `remove`.

- [ ] **Step 3: Wire into PipelinesPage**

In `PipelinesPage.tsx`: add a **"Buat dari Template"** button next to the existing create action that opens `TemplatePickerDialog`; on `onCreated`, navigate to the new board. Add a **"Simpan sebagai Template"** affordance per pipeline (e.g. in the existing per-pipeline menu/card) that prompts for a name and calls `saveAs.mutateAsync({ fromPipelineId, name })` + a success toast. (If pipelines are only listed as cards without a menu, add a small overflow button.)

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/TemplatePickerDialog.tsx client/pages/PipelinesPage.tsx
git commit -m "feat(pipelines): template picker + save-as-template UI"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests** - Run: `npx tsx --test shared/pipelineTemplate.test.ts` → all PASS.
- [ ] **Step 2: Typecheck** - Run: `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** - Run: `npm run build` → success.
- [ ] **Step 4: Wiring** - Run: `grep -rln "pipeline_templates\|pipelineTemplate\|instantiateTemplate\|TemplatePicker" server/ shared/ client/ | sort` → expect shared module + test, schema, storage, routes, hook, dialog, page.

---

## Self-Review

- **Spec coverage:** key-based definition + full id remap (config rules, conditions, triggerConfig, actions, fieldMaps) → Task 1. Drop cross-pipeline actions → Task 1 (filter). `pipeline_templates` table + migration + per-mitra builtin seed → Task 2. list/get/delete/create-from-pipeline → Task 3. instantiate two-pass → Task 4. Routes (list/save/apply/delete) with capability gating → Task 5. Frontend picker + save-as → Task 6. Round-trip test → Task 1; final → Task 7. All covered.
- **Placeholders:** Tasks 1-5 + 7 contain full code; Task 1 explicitly directs the implementer to write two clear directional functions (`pipelineToTemplate`/`remapTemplateRule`) using the Step-1 test as the contract, and ships complete built-in definitions. Task 3 flags the real per-action field-map reader to reuse; Task 6 integrates into the existing page/hooks. The billing_sync stage-mapper direction caveat is called out explicitly.
- **Type consistency:** `TemplateDefinition`/`TemplateRule` + `pipelineToTemplate`/`remapFieldConfig`/`remapTemplateRule`/`BUILTIN_TEMPLATES` (Task 1) consumed in Tasks 2 (seed), 3 (snapshot), 4 (instantiate). `remapTemplateRule` returns a shape matching `storage.createRule`'s `data` (verified against the signature: name/triggerType/triggerStageId/triggerConfig/conditions/enabled/actions[{actionType,actionConfig,targetStageId,targetPipelineId,titleTemplate,copyAssignee,fieldMaps[{sourceFieldId,targetFieldId}]}]). `PipelineTemplate` type (Task 2) used by storage methods (Task 3-4) + routes (Task 5).

## Deploy note
New table `pipeline_templates` created on startup; built-ins seeded per mitra (idempotent by name). Purely additive - no impact on existing pipelines.
