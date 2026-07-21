# Pipelines Multi-Action per Rule (P4d-1) Design

> First slice of P4d (advanced automation). Turns a rule's action from **1:1** into
> **1:N** - one rule can run several ordered actions (e.g. `create_card` in B, then
> `move_stage` the source card to a terminal stage). Trigger and conditions stay at
> the rule level. Other P4d slices (advanced assign, OR/nested conditions, chaining)
> are separate, later specs.

**Base branch:** `feat/pipelines-multi-action` off `dev` (includes P4a-P4c + rule edit-mode).
**Status:** Approved design, ready for spec review.

**Context note:** `/pipelines` data on dev is still test data, so a normalized model
with a backfill migration is acceptable (no production rule data at risk).

---

## Goal

A rule carries an **ordered list of actions**. Any action type (`create_card`,
`set_field`, `move_stage`, `assign`) can appear any number of times, in any order.
On fire (trigger matched + rule conditions pass), the engine runs each action in
order. Dedup, loop-safety, and trigger/condition semantics are unchanged.

## Approach (data model decision)

**Normalized `pipeline_rule_actions` table**, chosen over a JSON `actions` array on
the rule. Normalization keeps create_card field-maps as FK rows (not buried in JSON),
gives clean ordering via a `position` column, and lets the engine loop uniformly.
A JSON array would lose the field-maps table + FK integrity. Migration cost is low
because dev rule data is test-only.

---

## 1. Data model

### New table `pipeline_rule_actions`
```ts
export const pipelineRuleActions = mysqlTable("pipeline_rule_actions", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ruleId: int("rule_id").notNull(),
  position: int("position").notNull().default(0),
  actionType: varchar("action_type", { length: 16 }).notNull(),   // create_card|set_field|move_stage|assign
  actionConfig: text("action_config"),                            // JSON: set_field/move_stage/assign config
  targetPipelineId: int("target_pipeline_id"),                    // create_card only
  targetStageId: int("target_stage_id"),                          // create_card only
  titleTemplate: varchar("title_template", { length: 255 }),      // create_card only
  copyAssignee: int("copy_assignee").notNull().default(0),        // create_card only
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byRule: index("idx_rule_actions_mitra_rule").on(t.mitraId, t.ruleId, t.position),
}));
```

### `pipeline_rule_field_maps` - re-home to the action
- Add `actionId: int("action_id")` (nullable for migration, then always set).
- A field-map now belongs to one **create_card action**, not the rule.
- Drop the old `uniqueIndex("uniq_rule_field_map_source")` on `(ruleId, sourceFieldId)`
  and add `uniqueIndex("uniq_action_field_map_source")` on `(actionId, sourceFieldId)`
  - so two create_card actions in one rule can each map the same source field.
- Keep `ruleId` column (denormalized; still used for delete-by-rule cleanup).

### `pipeline_rules` - action columns become legacy
`action_type`, `action_config`, `target_pipeline_id`, `target_stage_id`,
`title_template`, `copy_assignee` stay on the row but are **no longer read by the
engine** (kept to avoid a destructive migration; backfilled into the first action).
Trigger fields (`trigger_type`/`trigger_config`/`trigger_stage_id`), `conditions`,
`enabled`, `name` stay rule-level. **Conditions remain rule-level** - one condition
set gates all actions; per-action conditions are out of scope (a later slice).

### Types (`shared/schema.ts`)
```ts
export type PipelineRuleAction = typeof pipelineRuleActions.$inferSelect;
```

## 2. Migration (startup, idempotent - `server/storage.ts`)

Per [[reference-startup-add-column]] (info_schema guard + plain ALTER; DB rejects
`ADD COLUMN IF NOT EXISTS`):

1. `CREATE TABLE IF NOT EXISTS pipeline_rule_actions (...)` (raw DDL).
2. Add `pipeline_rule_field_maps.action_id INT NULL` (guarded).
3. Backfill (idempotent - skip rules that already have action rows):
   - For each rule with **zero** rows in `pipeline_rule_actions`, INSERT one action
     (position 0) from the rule's legacy columns
     (`action_type/action_config/target_*/title_template/copy_assignee`).
   - `UPDATE pipeline_rule_field_maps SET action_id = <that action id> WHERE rule_id = <rule> AND action_id IS NULL`.
4. Swap the field-map unique index: `DROP INDEX uniq_rule_field_map_source` then
   `ADD UNIQUE uniq_action_field_map_source (action_id, source_field_id)`, each in its
   own try/catch (idempotent - ignore "doesn't exist"/"duplicate key name").

Runs against `jabnet_fiber_dev` first; prod only on explicit OK (no prod rule data yet).

## 3. Engine (`server/pipeline-automation.ts`)

Split the current `applyRuleAction(rule, card, actorId)`:

- `applyAction(action: PipelineRuleAction, card, actorId): Promise<boolean>` - the
  existing per-type switch, but reading from an **action row** (its `actionConfig`,
  `target_*`, `title_template`, `copy_assignee`, and field-maps via
  `storage.getActionFieldMaps(action.id)`). Returns whether it mutated.
- `applyRuleActions(rule, card, actorId): Promise<boolean>` - load
  `storage.listRuleActions(rule.id)` ordered by `position`; run each via `applyAction`
  in a per-action try/catch (**one action failing logs + continues to the next** -
  judgment call, approved); return `acted = true if ANY action acted`.

`runStageEnterAutomations` and `runTimeTriggers` call `applyRuleActions` instead of
`applyRuleAction`. A fire is recorded when conditions pass AND `acted` is true (same
as today). **Loop-safety unchanged** - all actions mutate via `storage.*`, never the
HTTP routes, so a `move_stage`/`create_card` action cannot re-enter the automation
service.

## 4. Storage (`server/storage.ts`)

- `listRuleActions(ruleId): Promise<PipelineRuleAction[]>` - mitra-scoped, ordered by position.
- `getActionFieldMaps(actionId): Promise<PipelineRuleFieldMap[]>`.
- `setRuleActions(ruleId, actions[])` - replace-all: delete this rule's actions +
  their field-maps, then insert each action (position = index) and its field-maps
  (with `actionId`). One transaction-ish sequence (best-effort; dev-only data).
- `createRule`/`updateRule` accept `actions?: ActionInput[]` and call `setRuleActions`
  when provided (replaces the old single `actionType`/`actionConfig`/`fieldMaps` params
  for the action side; trigger/conditions/name/enabled params unchanged).
- `deleteRule` also deletes the rule's `pipeline_rule_actions` rows (field-maps already
  cleaned by rule_id).

`ActionInput` shape: `{ actionType, actionConfig?, targetPipelineId?, targetStageId?, titleTemplate?, copyAssignee?, fieldMaps?: {sourceFieldId,targetFieldId}[] }`.

## 5. Routes (`server/routes.ts`)

- **POST/PATCH** `/pipelines/:id/rules` body carries `actions: ActionInput[]`
  (replacing the top-level `actionType`/`actionConfig`/`targetPipelineId`/…/`fieldMaps`).
  - Validate `actions.length >= 1`.
  - Per action: create_card → target pipeline access (`getPipelineLevel === "none"` → 403)
    + `validateRuleFieldMaps`; set_field/move_stage/assign → `validateActionConfig`.
  - Trigger + conditions validated as today.
- **GET** enriches each rule with an `actions: [...]` array - each action shaped with
  its human labels (`setFieldLabel`/`moveStageName`/`assigneeName`/`targetPipelineName`/
  `targetStageName`/`fieldMaps` via `shapeRuleFieldMaps`), mirroring today's single-action
  enrichment but per action.
- **API shifts to `actions[]`** (drops the legacy single-action request/response shape).
  The rule dialog is the only client and dev data is test-only - judgment call, approved.

## 6. Frontend

### New component `client/components/pipelines/RuleActionEditor.tsx` (SoC)
Edits ONE action: action-type selector + per-type fields (set_field field+value;
move_stage stage; assign user) and, for create_card, the target pipeline/stage +
title template + copy-assignee + field-map rows. Props: `{ value: ActionDraft;
onChange; sourceFields; allPipelines; staffUsers; selfStages }`. This extracts the
action portion currently inline in `PipelineRulesDialog.tsx` into a reusable unit
(per [[feedback-coding-standards]]).

### `client/components/pipelines/ruleFormState.ts`
- `RuleDraft` drops the flat action fields (`actionType`, `setFieldId`, …, `maps`,
  target/title/copyAssignee) and gains `actions: ActionDraft[]`.
- `ActionDraft` = the per-action form shape.
- `draftToPayload` emits `actions: [...]` (validates ≥1 action + per-action rules);
  `ruleToDraft` maps `r.actions` → `ActionDraft[]`; `emptyDraft` seeds one default
  create_card action.

### `PipelineRulesDialog.tsx`
- Replace the single action block with a **list of `<RuleActionEditor>`** + an
  "+ Tambah aksi" button + per-action remove + **reorder up/down** (buttons, not
  drag - simpler; order matters for "create then close"). Judgment call, approved.
- Read-side: collapsed summary shows the trigger `→ N aksi` (with the first action
  inline if one); detail panel lists each action with its existing per-type rendering.

## 7. Edge cases

- **Zero actions** → validation error (≥1 required), both client and server.
- **One action failing** at fire time → logged, the remaining actions still run.
- **Dedup unchanged** → once-per-(rule, card); the whole action list runs as one unit.
- **Action-type switch in the editor** → stale per-type fields are simply not emitted
  for the new type (same accepted "inert" pattern as prior phases).
- **Reorder** only changes `position`; re-saving replaces all action rows.

## 8. Files

| File | Change |
|---|---|
| `shared/schema.ts` | + `pipelineRuleActions` table + type; `pipeline_rule_field_maps` + `actionId` |
| `server/storage.ts` | migration (table + action_id + backfill + index swap); `listRuleActions`/`getActionFieldMaps`/`setRuleActions`; create/update/delete rule action wiring |
| `server/pipeline-automation.ts` | `applyAction` (per action row) + `applyRuleActions` (loop); callers updated |
| `server/pipeline-automation-helpers.ts` (+ test) | `shapeRuleActions` pure helper for GET enrichment (label/field-map shaping per action) |
| `server/routes.ts` | POST/PATCH `actions[]` validation; GET `actions[]` enrichment |
| `client/hooks/usePipelines.ts` | `RuleWithMaps` carries `actions: RuleActionView[]` |
| `client/components/pipelines/RuleActionEditor.tsx` | **new** - single-action editor |
| `client/components/pipelines/ruleFormState.ts` | `RuleDraft.actions` + `ActionDraft`; draft↔payload over the array |
| `client/components/pipelines/PipelineRulesDialog.tsx` | action-list UI (add/remove/reorder) + read-side per-action |

## 9. Testing

Client has no unit runner; the pure server helper (`shapeRuleActions`) gets `node:test`
coverage (`tsx --test`), and `draftToPayload`/`ruleToDraft` are written pure/reviewable.
Gate = `npm run typecheck` (0) + `npm run build` + manual checklist:

- Create a rule with [create_card in B] + [move_stage source → terminal] → trigger →
  both fire in order; source card moves, new card created.
- Multiple set_field actions in one rule → all applied.
- Reorder actions → order persists + fires in new order.
- Remove an action; save a rule with one action (back to single) still works.
- Per-action create_card field-maps persist (two create_cards each with own maps).
- Edit an existing (migrated) rule → its single action hydrates; add a second; save.
- A failing action (e.g. move to a deleted stage) → others still run; logged.
- Dedup: re-entry doesn't double-fire (once mode); time `every` re-fires the whole list.

## Out of scope (later P4d slices)

- Per-action conditions (conditions stay rule-level).
- Advanced assign (role/round-robin) - P4d-2.
- OR/nested conditions - P4d-3.
- Chaining (action triggers another rule) - P4d-4.
- Drag-and-drop reorder (buttons suffice for now).

## Consistency with memory

- [[project-pipelines-engine]] - P4d-1; update the P4 line on merge.
- [[feedback-coding-standards]] - new `RuleActionEditor` component (SoC), pure
  `shapeRuleActions`/`draftToPayload` (DRY/testable), semantic markup.
- [[reference-startup-add-column]] - migration uses info_schema guard + plain ALTER.
- [[reference-api-response-envelope]] - routes use `sendSuccess`/`sendError`.
- [[reference-tenant-isolation-gotchas]] - all new storage methods scope by `getMitraId()`.
