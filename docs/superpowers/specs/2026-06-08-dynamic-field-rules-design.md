# Spec — Dynamic Field Rules: conditional visibility + required (Phase 4)

> Date: 2026-06-08 · Mitra-scoped · Pipelines-unification roadmap Phase 4.

## Goal

Let tenants make a custom field **show/hide** and **become required** based on conditions over other
fields' values and the card's current stage — e.g. "IF Customer Type = Corporate THEN show NPWP",
"IF Stage = Negotiation THEN Proposal required". No code, all per-field config, reusing the existing
condition engine.

## Decisions (confirmed)

1. **Rule types:** both **visibility** (show/hide) and **conditional required**.
2. **Condition sources:** other custom **fields** + the card's **stage**.
3. **Required enforcement:** **block save** when a visible, required field is empty (the static legacy
   `required` flag stays soft/non-blocking — unchanged).
4. **Storage:** extend the existing `pipeline_fields.config` JSON (no new column/table).

## Condition model (`shared/fieldRules.ts`, pure + tested)

A superset of the automation `RuleCondition`, adding a stage source:
```ts
export type FieldRuleOp = "eq" | "neq" | "contains" | "gt" | "lt" | "empty" | "not_empty";
export interface FieldRuleCondition { source?: "field" | "stage"; fieldId?: number; op: FieldRuleOp; value?: string }
// groups: FieldRuleCondition[][]  — AND within a group, OR across groups (same as automation)
```
- `source: "field"` (default): compare `values.get(fieldId)` against `value` (case-insensitive, matches
  the existing operator semantics in `pipeline-automation-helpers.ts`).
- `source: "stage"`: compare the card's `stageId` against `Number(value)` (`eq`/`neq` meaningful).

Exports:
- `evaluateFieldConditionGroups(groups, ctx: { values: Map<number,string>; stageId: number }): boolean`
  (empty/absent groups → `true`).
- `parseFieldRules(config: string | null): { visibleWhen: FieldRuleCondition[][]; requiredWhen: FieldRuleCondition[][] }`
  (safe-parse; malformed → empty arrays; preserves other `config` keys are NOT needed here — only reads).
- `isFieldVisible(field: { config: string | null }, ctx): boolean` — `visibleWhen` empty → true; else evaluate.
- `isFieldRequired(field: { config: string | null; required: number }, ctx): boolean` —
  if not visible → **false**; else `requiredWhen` non-empty → evaluate it; else fall back to `required === 1`.

The module is pure (no DB) and imported by **both** client (reactive form) and server (save enforcement).

## Storage (`pipeline_fields.config` JSON)

```
config: { ...(existing, e.g. {"multiple":true} for user fields),
          visibleWhen?: FieldRuleCondition[][], requiredWhen?: FieldRuleCondition[][] }
```
No migration needed (`config` column already exists). Create/update field passes the rules through in
`config`. The field create/update **validation** (routes) checks, for every condition in both arrays:
- `op` ∈ the 7 operators;
- `source:"field"` → `fieldId` ∈ this pipeline's fields AND ≠ the field being edited (no self-reference);
- `source:"stage"` → `value` is a stage id of this pipeline.

## Server enforcement (`PUT /api/pipelines/cards/:cardId/values`)

Before `setCardValues`: build the effective values map = existing card values overlaid with the submitted
values, plus `card.stageId`. **Enforcement applies only to fields that have a `requiredWhen` rule** (the
new opt-in feature): for each such field, if it is **visible** AND its `requiredWhen` evaluates true AND
its effective value is empty → return `400` (`"<label>: wajib diisi"`). Fields without a `requiredWhen`
rule are never blocked here — the legacy static `required` flag keeps today's soft, non-blocking behavior
exactly as it is.

## Client (`CardDetailModal` field form)

- Compute `visible` + `required` per field reactively from the current in-form values + the card's
  `stageId`, using the shared evaluator.
- Hidden fields are not rendered; their stored values are **not** cleared (no data loss).
- `isFieldRequired` drives the **asterisk** (so both static-required and conditional-required visible
  fields are marked). The Save action is **blocked** (inline message) only for fields with a
  `requiredWhen` rule that evaluates true, is visible, and is empty — mirroring the server exactly.
  Static-required-only fields keep today's soft behavior (asterisk, no block).

## Field-rule editor (`ManageFieldsDialog`)

When creating/editing a field, two optional collapsible sections: **"Aturan Tampil (Visibility)"** and
**"Aturan Wajib"**, each using the existing `ConditionsBuilder`, **extended** so a condition row can pick
its **source** (a custom Field — excluding the field being edited — or **Stage**). Saved into
`config.visibleWhen` / `config.requiredWhen`.

## Testing

`shared/fieldRules.test.ts` — `evaluateFieldConditionGroups` (field + stage source, AND within group, OR
across groups, each operator), `isFieldVisible` (default-true, condition pass/fail), `isFieldRequired`
(default to static flag, requiredWhen pass/fail, hidden ⇒ not required). Server + client wiring via
typecheck + build.

## Out of scope
- Conditional **permissions** (Phase 3b RBAC).
- Condition sources beyond field + stage (assignee/priority/tags) — extend `source` later.
- Block-stage-move enforcement (we block save instead).
- Clearing hidden fields' stored values.
