# Spec - Pipeline Templates (Phase 5)

> Date: 2026-06-08 · Mitra-scoped · Pipelines-unification roadmap Phase 5.

## Goal

Let tenants save a configured pipeline's structure as a reusable **template** and create new pipelines
from templates (built-in or saved) - cloning stages, custom fields (incl. their visibility/required
rules), and automation rules. Speeds up standing up new workflows (Sales / Collection / Project / CS)
without rebuilding by hand.

## Decisions (confirmed)

1. **Captures:** full structure - stages + fields (with `config` rules) + automation rules (+ actions +
   field-maps). NOT cards/values/comments/access grants.
2. **Sources:** "Save as template" from an existing pipeline + a set of seeded **built-in** templates.
3. **Apply:** create a **new** pipeline from a template only (no merge-into-existing).
4. **Storage:** dedicated `pipeline_templates` table holding a portable JSON definition (internal keys,
   not DB ids).

## Core challenge: id remapping via stable keys

A pipeline's stage/field DB ids are referenced inside: field `config.visibleWhen`/`requiredWhen`
(fieldId + stage value), rule `conditions` (fieldId), `triggerStageId`, `triggerConfig` (field_date
`fieldId`; billing_sync `fieldMap.targetFieldId`; field_updated `fieldId`), rule actions
(`targetStageId`, `actionConfig` set_field `fieldId` / move_stage `stageId`), and rule `fieldMaps`
(`sourceFieldId`/`targetFieldId`). A template stores all of these by **stable internal key** (e.g.
`stage_0`, `field_2`); instantiation remaps key → freshly-created DB id.

## 1. Pure transform module - `shared/pipelineTemplate.ts` (no DB, unit-tested)

```ts
interface TemplateDefinition {
  pipeline: { name: string; description: string | null; color: string; icon: string | null };
  stages: { key: string; label: string; color: string; position: number; description: string | null }[];
  fields: { key: string; label: string; type: string; options: string | null; required: number; showOnCard: number; position: number; config: string | null }[];
  rules: TemplateRule[];
}
interface TemplateRule {
  name: string | null; triggerType: string; triggerStageKey: string | null;
  triggerConfig: any | null; conditions: any | null; enabled: number;
  actions: { actionType: string; actionConfig: any | null; targetStageKey: string | null; titleTemplate: string | null; copyAssignee: number; fieldMaps: { sourceFieldKey: string; targetFieldKey: string }[] }[];
}
```

- `pipelineToTemplate(input): TemplateDefinition` - input is the DB rows (pipeline, stages, fields, and
  rules each with their actions + fieldMaps). Builds `stageIdToKey` / `fieldIdToKey` (key = `stage_<i>` /
  `field_<i>` by position), then rewrites every reference (listed above) from id → key. **Drops** any
  action whose `targetPipelineId` is set (cross-pipeline; not portable) and notes the count.
- `remapFieldConfig(config: string | null, fieldKeyToId: Map<string,number>, stageKeyToId: Map<string,number>): string | null`
  - rewrite `visibleWhen`/`requiredWhen` keys → ids; leave other config keys (`multiple`) intact.
- `remapTemplateRule(rule: TemplateRule, fieldKeyToId, stageKeyToId): { ...insertable rule with ids... }`
  - rewrite triggerStageKey, triggerConfig, conditions, actions, fieldMaps keys → ids.
- `BUILTIN_TEMPLATES: TemplateDefinition[]` - starter definitions: **Sales**, **Collection**, **Project**,
  **Customer Service** (stages + a few base fields + at most one simple rule each).

The transform is pure (operates on plain objects/JSON strings); the storage layer does the DB I/O.

## 2. Schema + seed - `pipeline_templates`

```ts
export const pipelineTemplates = mysqlTable("pipeline_templates", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 64 }),
  color: varchar("color", { length: 16 }).notNull().default("#0EA5E9"),
  definition: text("definition").notNull(),       // JSON TemplateDefinition
  isBuiltin: int("is_builtin").notNull().default(0),
  createdBy: int("created_by"),
  createdAt: text("created_at").notNull(),
}, (t) => ({ byMitra: index("idx_pipeline_templates_mitra").on(t.mitraId) }));
```
`CREATE TABLE IF NOT EXISTS` at startup. After the table exists, seed `BUILTIN_TEMPLATES` per mitra
(when no builtin row with that name exists) with `is_builtin=1`.

## 3. Storage

- `createTemplateFromPipeline(pipelineId, { name, description }): Promise<PipelineTemplate>` - load
  pipeline + stages + fields + rules(+actions+fieldMaps) → `pipelineToTemplate` → insert definition.
- `listTemplates(): Promise<PipelineTemplate[]>` (mitra-scoped, builtins first then by name).
- `getTemplate(id)` / `deleteTemplate(id)` (reject when `is_builtin=1`).
- `instantiateTemplate(templateId, { name, color?, icon? }, userId): Promise<Pipeline>` - **two-pass**:
  1. create the pipeline (name from input; color/icon from input or the template);
  2. create stages in order → build `stageKeyToId`;
  3. create fields in order, each `config` passed through `remapFieldConfig` → build `fieldKeyToId`;
  4. for each rule: `remapTemplateRule(...)` then insert the rule + its actions + field-maps.
  All mitra-scoped; returns the new pipeline.

## 4. Routes (gated `requireWritePermission "pipelines"`; envelope sendSuccess/sendError)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/pipeline-templates` | list (mitra-scoped) |
| POST | `/api/pipeline-templates` `{fromPipelineId, name, description?}` | requires view on the source pipeline (`requirePipelineCapability(..., "view")`) |
| POST | `/api/pipeline-templates/:id/apply` `{name, color?, icon?}` | returns the new pipeline |
| DELETE | `/api/pipeline-templates/:id` | 409 if `is_builtin` |

## 5. Frontend - `PipelinesPage` + a small dialog

- **"Buat dari Template"** button → a dialog listing templates (name, icon, a brief stage/field count
  preview) → pick one → enter the new pipeline name → apply → navigate to the new board.
- **"Simpan sebagai Template"** action (pipeline settings/board overflow) → name + description → save.
- New hooks in `usePipelines.ts`: `usePipelineTemplates()`, `useApplyTemplate()`, `useSaveAsTemplate()`,
  `useDeleteTemplate()`.

## 6. Testing

`shared/pipelineTemplate.test.ts`: a **round-trip** - take a synthetic pipeline (stages/fields/rules with
DB ids cross-referencing each other, incl. a field `requiredWhen` referencing another field + stage, a
rule with conditions + a set_field action + a field-map, and one cross-pipeline action), run
`pipelineToTemplate` (assert ids replaced by keys, cross-pipeline action dropped), then `remapFieldConfig`
+ `remapTemplateRule` with fresh key→id maps (assert references resolve to the new ids consistently).

## Out of scope
- Apply-to-existing (merge) - new pipeline only.
- Cloning cards/values/comments/followers and access grants.
- Cross-pipeline automation actions in templates (dropped at snapshot).
- Cross-tenant/global template sharing (templates are mitra-scoped; builtins seeded per mitra).
