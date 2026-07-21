# Spec - Pipelines Automation: Within-Card Actions + Conditions (Phase 4b-1)

> **Date:** 2026-06-05
> **Status:** Approved design, ready for implementation plan.
> **Program:** "Customizable Multi-Tenant Pipeline / Kanban" - Phase 4b, slice 1.
> **Builds on:** P1 (engine) + P2 (custom fields) + P3 (RBAC) + P4a / P4a-ext (cross-pipeline `create_card` + field mapping).

## Goal

Extend the automation engine so a rule can, when a card **enters its trigger stage**, act on the
**same card** instead of only creating a card elsewhere:

- **set_field** - set one custom field of this card to a literal value.
- **move_stage** - move this card to another stage in the same pipeline.
- **assign** - set (or clear) the card's assignee.

…and gate any rule (new actions **and** the existing `create_card`) behind an optional **conditions**
layer (AND-only field tests). No-code, per source pipeline. One action per rule.

## P4b Decomposition
P4b grew to 5 action types + conditions, so it is split into two coherent slices:
- **P4b-1 (this spec):** conditions (IF) + within-card actions `set_field` / `move_stage` / `assign`.
  All mutate the same card via storage directly → loop-safe by the existing P4a mechanism.
- **P4b-2 (next):** integration actions - internal bell notification + outbound webhook (the n8n
  escape hatch), with a documented payload contract, delivery semantics, and SSRF/security handling.

(For reference, the remaining roadmap: P4c = time-based triggers via a worker; P4d = multi-action per
rule, role/round-robin assign, "copy from field"/formulas, OR / nested conditions, rule chaining.)

## Key Decisions (from brainstorming)
- **Data model = Approach A:** extend the flat `pipeline_rules` row - no new tables. Widen the
  `action_type` enum and add two nullable JSON-text columns (`action_config`, `conditions`). The
  legacy `create_card` columns + `pipeline_rule_field_maps` table stay exactly as-is, so **every
  existing rule keeps working untouched.** Rejected: a normalized conditions table (B - conditions
  are always loaded with their rule, never queried alone; overhead with no payoff) and a full
  `pipeline_rule_actions` engine (C - multi-action-per-rule richness belongs in P4d).
- **One action per rule.** Users compose multiple rules for multiple effects. Multi-action is P4d.
- **Trigger is unchanged:** "card enters stage X" (fires on move-into and create-into). No new
  trigger types in P4b-1.
- **Simple action variants only** (rich forms deferred to P4d):
  - set_field → one custom field of *this* pipeline + a literal typed value.
  - move_stage → a destination stage in *this* pipeline.
  - assign → a specific user (access-guarded) or `null` (unassign). No role / round-robin.
- **Conditions = AND-only** list of `{fieldId, op, value}` over *this* pipeline's custom fields.
  Empty / null = always run (back-compat). Evaluated **at trigger time only**.
- **Loop-safety unchanged:** all within-card mutations call `storage` directly (never the routes),
  so the automation service is not re-invoked. No chaining until P4d. The once-per-(rule,card)
  `pipeline_rule_fires` dedup remains the backstop.
- **Best-effort:** automation failures are caught + `console.warn`-logged, never break the user's
  card action (same pattern as P4a / notifications).
- DB changes target `jabnet_fiber_dev` first; new columns via startup info_schema check + plain
  `ALTER TABLE ADD COLUMN` (NOT `ADD COLUMN IF NOT EXISTS` - see `reference-startup-add-column`).
- All endpoints use `sendSuccess`; all storage tenant-scoped via `getMitraId()`.

## Data Model (`shared/schema.ts` - extend `pipeline_rules`, no new tables)

```ts
actionType:   varchar("action_type", { length: 16 })   // enum widened:
              //   create_card | set_field | move_stage | assign
actionConfig: text("action_config")    // NEW, nullable - JSON, type-specific params
conditions:   text("conditions")       // NEW, nullable - JSON, AND-list of conditions
```

`actionConfig` JSON shapes (exactly one per action type):
| actionType | actionConfig | Legacy columns (`target_*`, `title_template`, `copy_assignee`) |
|---|---|---|
| `create_card` | `null` | used as today + `pipeline_rule_field_maps` (UNCHANGED) |
| `set_field` | `{ "fieldId": N, "value": "..." }` | unused (NULL) |
| `move_stage` | `{ "stageId": N }` | unused (NULL) |
| `assign` | `{ "assigneeId": N \| null }` | unused (NULL) |

`conditions` JSON: `[{ "fieldId": N, "op": Op, "value": "..." }]`, AND across all.
`Op = "eq" | "neq" | "contains" | "gt" | "lt" | "empty" | "not_empty"`.
`null` or `[]` → always run.

Types (`shared/schema.ts`): widen `PipelineRuleActionType` to the 4-value union; add
`RuleCondition = { fieldId: number; op: Op; value?: string }` and the per-type `actionConfig`
TS shapes (exported for client + server reuse).

**Migration** (`server/storage.ts` startup block, idempotent, per `reference-startup-add-column`):
1. info_schema check → `ALTER TABLE pipeline_rules ADD COLUMN action_config TEXT NULL` (each DDL its
   own try/catch; **no** `IF NOT EXISTS`).
2. info_schema check → `ALTER TABLE pipeline_rules ADD COLUMN conditions TEXT NULL`.
3. `ALTER TABLE pipeline_rules MODIFY target_pipeline_id INT NULL` +
   `ALTER TABLE pipeline_rules MODIFY target_stage_id INT NULL` (so non-`create_card` rules need no
   placeholder values; tiny table, low-risk rewrite, idempotent - wrap in try/catch).

## Pure Helpers (`server/pipeline-automation-helpers.ts` + test - TDD)

- **`matchStageEnterRules(rules, stageId)`** - *change:* drop the `actionType === "create_card"`
  filter; return all **enabled** rules whose `triggerStageId === stageId` (the service dispatches by
  type). Update the existing tests (the "ignores non-create_card" test now asserts inclusion).
- **`evaluateConditions(conditions: RuleCondition[] | null, values: Map<number, string>): boolean`** -
  NEW. AND across all entries; `null`/`[]` → `true`. Semantics:
  - `eq` / `neq` / `contains` → string compare, case-insensitive (trimmed).
  - `gt` / `lt` → `Number(stored)` vs `Number(value)`; if either is `NaN` → condition is `false`.
  - `empty` / `not_empty` → presence test on the stored value (`""`/missing = empty).
  - Field not present in `values` → treated as empty string.
- **`parseActionConfig(type, raw: string | null): ConfigForType | null`** - NEW. Safe `JSON.parse` +
  shape guard per type. Returns `null` on malformed/missing required keys (service skips + warns).
  `create_card` → returns `null` (uses legacy columns; never reads `actionConfig`).
- **`parseConditions(raw: string | null): RuleCondition[]`** - NEW. Safe parse; malformed → `[]`
  (fail-open to "always run" rather than crash). Used by service + GET enrichment.

All helpers are pure and unit-tested (`npx tsx --test`).

## Service (`server/pipeline-automation.ts`)

`runStageEnterAutomations(card, actorId)` - for each rule from `matchStageEnterRules`:
1. `if (await storage.hasRuleFired(rule.id, card.id)) continue;`
2. **Conditions:** `const valsMap = toMap(await storage.getCardValues(card.id))`;
   `if (!evaluateConditions(parseConditions(rule.conditions), valsMap)) continue;`
   - **do NOT record a fire on condition-fail** (a genuine re-entry can re-evaluate later).
3. **Dispatch by `actionType`:**
   - `create_card` → existing logic (target-stage existence check, copy-assignee access guard, field
     maps) - UNCHANGED.
   - `set_field` → `cfg = parseActionConfig("set_field", rule.actionConfig)`; skip+warn if null or
     `cfg.fieldId ∉` this pipeline's fields; else `storage.setCardValues(card.id, [{fieldId: cfg.fieldId, value: cfg.value}])`.
   - `move_stage` → `cfg = parseActionConfig("move_stage", ...)`; skip+warn if null, `cfg.stageId ∉`
     this pipeline's stages, or `cfg.stageId === card.stageId` (no-op); else
     `storage.moveCard(card.id, { stageId: cfg.stageId }, actorId)`.
   - `assign` → `cfg = parseActionConfig("assign", ...)`; if `cfg.assigneeId != null` and
     `!await storage.canUserAccessPipeline(cfg.assigneeId, card.pipelineId)` → warn + skip the assign
     (do not fire); else apply assignee (`cfg.assigneeId` or `null`) via the existing card-update
     path (mitra-scoped). 
4. `await storage.recordRuleFire(rule.id, card.id)` - **only after the action actually ran.**

**Loop-safety:** every mutation goes through `storage` directly, never the create/move routes, so
the service is not re-invoked. `move_stage` changes the card's stage without re-triggering. The
`pipeline_rule_fires` unique row is the backstop. Whole loop wrapped in try/catch → `console.warn`,
never throws to the caller. Route wiring (`POST /cards`, `POST /cards/:id/move`) is UNCHANGED.

## Storage (`server/storage.ts`)

- `createRule` / `updateRule` persist `actionType`, `actionConfig` (stringified JSON or null),
  `conditions` (stringified JSON or null). For non-`create_card` types, `target_pipeline_id` /
  `target_stage_id` are written `NULL`.
- Reuse existing `setCardValues`, `moveCard`, `getCardValues`, `listFields`, `listStages`,
  `canUserAccessPipeline`. Add a small assignee setter only if no mitra-scoped path already exists
  (prefer reusing the existing card-update method).
- `listRules` returns the new columns (already `select()`s the row).

## Endpoints (`server/routes.ts` - `requirePipelineEdit` on source pipeline, `sendSuccess`)

`POST /api/pipelines/:id/rules` and `PATCH /api/pipelines/:id/rules/:ruleId` accept
`{ name?, triggerStageId, actionType, actionConfig?, conditions?, ...create_card fields }` and
**validate by `actionType`** (reject with `sendError(…, 400)` on failure):
- `set_field` → `actionConfig.fieldId` ∈ this pipeline's fields; `value` present.
- `move_stage` → `actionConfig.stageId` ∈ this pipeline's stages.
- `assign` → `assigneeId` is a user in this mitra, or `null`.
- `conditions` (any type) → each `fieldId` ∈ this pipeline's fields; `op` ∈ the 7 allowed; structure
  well-formed.
- `create_card` → existing validation UNCHANGED (target-pipeline same-mitra + caller access).

`GET /api/pipelines/:id/rules` - extend the existing P4a-ext enrichment so the response also resolves
display labels for the new types: `set_field` → field label (+ type); `move_stage` → stage label
(both from this pipeline's already-loaded `srcFields`/stages); `assign` → assignee name (batch user
lookup); and each condition's field label. Deleted entities → `"… (dihapus)"` fallback (same pattern
as field maps). No new endpoints.

## Frontend (`client/`)

- **`usePipelines.ts`:** `RuleWithMaps` gains `actionType`, `actionConfig` (parsed object),
  `conditions` (array), plus resolved label fields (`setFieldLabel`, `moveStageName`,
  `assigneeName`, per-condition `fieldLabel`). Mutations pass `actionType`/`actionConfig`/`conditions`
  through. New fields optional → cached/mutation-return shapes don't break typing.
- **`PipelineRulesDialog.tsx`:** add an **action-type selector** (Combobox / segmented). Per-type
  param inputs:
  - `create_card` → the existing form (target pipeline/stage, title template, copy-assignee, field
    maps) becomes this branch - UNCHANGED behavior.
  - `set_field` → field Combobox (this pipeline's fields) + a value input typed by the field
    (text / number / date / select-options).
  - `move_stage` → stage Combobox (this pipeline's stages).
  - `assign` → user Combobox + a "Kosongkan assignee" option.
  - **Conditions builder** (all types): repeatable rows `field Combobox · op select · value input`,
    "+ Tambah syarat", AND-joined; removable; empty = always run. Design-system components only.
- **Detail panel** (shipped in P4a-ext): render the new actions + conditions in plain Indonesian,
  e.g. *"Jika **Prioritas** = Tinggi → set field **Status Internal** = Diproses"*, *"… → pindahkan ke
  **Survei**"*, *"… → tugaskan ke **Budi**"*. Conditions shown as a "Syarat" subsection.

## Testing

- **Unit** (`server/pipeline-automation-helpers.test.ts`, `npx tsx --test`):
  - `evaluateConditions`: each op; AND of multiple; empty/null → true; numeric coercion incl.
    `NaN` → false; `contains` case-insensitive; missing field → empty.
  - `parseActionConfig`: each type with valid config; malformed JSON → null; missing required key →
    null; `create_card` → null.
  - `parseConditions`: valid array; malformed → `[]`.
  - `matchStageEnterRules`: now type-agnostic (includes set_field / move_stage / assign; still
    excludes disabled + other stages).
- **Manual on dev** (`jabnet_fiber_dev`, restart for migration):
  1. set_field rule → enter stage → field value set on the same card.
  2. move_stage rule → enter stage → card moves; verify **no loop** / no duplicate fire.
  3. assign rule → assignee with access set; assignee without access → skipped + warn, card
     unassigned.
  4. condition true → action runs; condition false → skipped; change data + re-enter → re-evaluates
     and runs (no fire was recorded on the earlier fail).
  5. existing `create_card` rules still fire unchanged; field maps intact.
  6. enable/disable toggle still sends only `{enabled}` and does not touch action/conditions.
  7. `npm run typecheck` → 0 errors; `npm run build` → OK.

## Out of Scope (P4b-1)
Notify-bell + webhook/n8n (→ P4b-2). Multi-action per rule, role / round-robin assign, "copy from
another field" / formulas, OR / nested conditions, new trigger types, time-based triggers, rule
chaining (→ P4c / P4d).

## Consistency with Memory
- [[project-pipelines-engine]] - P4b, slice 1 of the program (update the memo's P4 line).
- [[reference-api-response-envelope]] - all endpoints use `sendSuccess`.
- [[reference-startup-add-column]] - new columns via info_schema check + plain `ALTER TABLE ADD
  COLUMN`; `MODIFY` for the NOT-NULL relax; no `ADD COLUMN IF NOT EXISTS`.
- [[reference-tenant-isolation-gotchas]] - all rule queries filter `mitra_id`; set_field/move_stage
  targets are within the same (source) pipeline; assign enforces `canUserAccessPipeline`.
