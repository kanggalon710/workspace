# Pipelines Condition Groups - OR-of-AND (P4d-3) Design

> P4d slice. Rule conditions go from a single implicit-AND flat list to
> **ANY-of-groups**: the rule fires if **any** group matches, where a group
> matches when **all** its conditions match - i.e. `(A∧B) ∨ (C∧D)`. Connectors
> are fixed (top = OR, within-group = AND). Conditions stay rule-level (one set
> per rule, gating all its actions). No DB migration (conditions is opaque JSON).

**Base branch:** `feat/pipelines-condition-groups` off `dev` (includes P4a-P4c, edit-mode, P4d-1).
**Status:** Approved design, ready for spec review.

---

## Goal

Replace the flat `RuleCondition[]` (AND-only) with **groups**: `RuleCondition[][]`
(stored as `{ groups: RuleCondition[][] }`). Rule passes iff some group's
conditions all pass. Legacy flat arrays are auto-treated as one AND group, so no
data rewrite. The dialog gets a grouped builder ("DAN" within a group, "ATAU"
between groups).

## Coding standards applied

- **DRY:** `evaluateConditionGroups` reuses the existing `evaluateConditions`
  (per-group AND) - the OR is just `.some()` over groups.
- **SoC / testable:** parsing + evaluation stay in the pure
  `pipeline-automation-helpers.ts` module (TDD).
- **Semantic HTML5:** each group is a `<fieldset>` with a `<legend>`; icon buttons
  get `aria-label`.

---

## 1. Data model

`pipeline_rules.conditions` (TEXT JSON) now holds **`{ groups: RuleCondition[][] }`**.
- New type in `shared/schema.ts` (after `RuleCondition`):
  ```ts
  export type RuleConditionGroup = RuleCondition[]; // AND within a group
  ```
- **Backward-compat (no migration):** the parser accepts BOTH shapes -
  a legacy flat `RuleCondition[]` → treated as a single AND group `[arr]`;
  the new `{ groups: [...] }` → its groups. `conditions` is opaque JSON in
  storage, so existing rows keep working without a rewrite.
- **Empty handling (judgment call, approved):** the parser drops conditions with
  no `fieldId` and drops groups left empty; if no groups remain → `[]` → "no
  conditions → always run" (identical to today's empty behavior). A rule with no
  conditions stores `null`.

## 2. Pure helpers - `server/pipeline-automation-helpers.ts` (TDD)

Add (keeping the existing `parseConditions`/`evaluateConditions` for per-group AND):

```ts
/** Parse stored conditions into AND-groups. Accepts legacy flat array (→ one group)
 * or { groups: [...] }. Drops empty conditions/groups. Malformed → []. */
export function parseConditionGroups(raw: string | null): RuleCondition[][] {
  if (!raw) return [];
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const rawGroups: any[] = Array.isArray(parsed) ? [parsed]
    : (parsed && Array.isArray(parsed.groups)) ? parsed.groups : [];
  const groups: RuleCondition[][] = [];
  for (const g of rawGroups) {
    if (!Array.isArray(g)) continue;
    const conds = g.filter((c) => c && typeof c.fieldId === "number" && typeof c.op === "string") as RuleCondition[];
    if (conds.length) groups.push(conds);
  }
  return groups;
}

/** ANY-of-groups: true if no groups, else some group passes (all its conditions AND). */
export function evaluateConditionGroups(groups: RuleCondition[][], values: Map<number, string>): boolean {
  if (groups.length === 0) return true;
  return groups.some((g) => evaluateConditions(g, values));
}
```

(`parseConditions` stays - it normalizes a single flat array; `parseConditionGroups`
reuses the same per-entry filter logic. `evaluateConditions` stays as the AND
evaluator, reused per group.)

## 3. Engine - `server/pipeline-automation.ts`

In `runStageEnterAutomations` AND `runTimeTriggers`, the condition gate currently:
```ts
const conds = parseConditions(rule.conditions);
if (conds.length) { /* load values */ if (!evaluateConditions(conds, valsMap)) continue; }
```
becomes:
```ts
const groups = parseConditionGroups(rule.conditions);
if (groups.length) { /* load values (unchanged) */ if (!evaluateConditionGroups(groups, valsMap)) continue; }
```
Nothing else changes (value-loading, dedup, fire-recording all unchanged).

## 4. Routes - `server/routes.ts`

- **`validateConditions(pipelineId, conditions)`** accepts both shapes: a flat
  array (validate each condition's `fieldId` ∈ pipeline) OR `{ groups: [...] }`
  (validate each condition in each group). Empty/absent → ok.
- **GET enrichment**: each rule's `conditions` is enriched to the grouped, labelled
  shape `{ groups: RuleConditionWithLabel[][] }` - each condition gets `fieldLabel`
  from `srcFields` (with `Field #N (dihapus)` fallback). A legacy flat array
  enriches as one group. (Storage createRule/updateRule already `JSON.stringify`
  whatever `conditions` value is passed - no storage change.)

## 5. Frontend

### `client/hooks/usePipelines.ts`
`RuleWithMaps.conditions` changes from `RuleConditionWithLabel[]` to
`{ groups: RuleConditionWithLabel[][] } | undefined` (matching the GET shape).

### `client/components/pipelines/ConditionsBuilder.tsx`
- `value`/`onChange` type changes from `DraftCondition[]` to `DraftCondition[][]`
  (groups). `DraftCondition` itself is unchanged.
- Renders a list of **groups**; each group is a `<fieldset>` (with a small
  `<legend>` like "Grup #i - semua harus terpenuhi") containing its condition rows
  + "+ Tambah kondisi"; between groups a visible **"ATAU"** divider; a
  "+ Tambah grup (ATAU)" button; remove-condition and remove-group buttons
  (`type="button"`, `aria-label`).
- A group emptied of its last condition is removed (or remove-group disabled at the
  last remaining condition - keep simple: removing the last condition removes the
  group). Empty builder = zero groups = no conditions.

### `client/components/pipelines/ruleFormState.ts`
- `RuleDraft.conditions` changes from `DraftCondition[]` to `DraftCondition[][]`.
- `emptyDraft()` → `conditions: []` (no groups).
- `ruleToDraft`: map `r.conditions.groups` → `DraftCondition[][]`; a legacy flat
  `r.conditions` (array) → `[mapped]` (one group); absent → `[]`.
- `draftToPayload`: build `groups` by filtering each group's conditions
  (`fieldId !== ""`, drop value for empty/not_empty ops) and dropping empty groups;
  emit `conditions: groups.length ? { groups } : null`.

### `client/components/pipelines/PipelineRulesDialog.tsx` (read-side)
- Detail panel "Syarat" block: render groups - conditions joined by **"DAN"**
  within a group, groups separated by **"ATAU"**. (Reuse the existing per-condition
  render: `fieldLabel op value`.)
- Collapsed-row badge: the "· N syarat" becomes "· N grup syarat" when >1 group,
  else "· N syarat" (total conditions). Minor.

## 6. Edge cases

- **Legacy rules** (flat-array conditions): parser/validator/`ruleToDraft` all treat
  them as one AND group → identical behavior; editing then saving rewrites them to
  the `{ groups }` shape transparently.
- **Empty group** → dropped by parser + `draftToPayload` (never persisted/evaluated).
- **All groups empty / no conditions** → `[]` → rule always runs (unchanged).
- Conditions remain rule-level (one set gates all actions) - unaffected by P4d-1.

## 7. Files

| File | Change |
|---|---|
| `shared/schema.ts` | + `RuleConditionGroup` type |
| `server/pipeline-automation-helpers.ts` (+ test) | + `parseConditionGroups`, `evaluateConditionGroups` (reuse `evaluateConditions`) |
| `server/pipeline-automation.ts` | swap parse/eval calls in both runners |
| `server/routes.ts` | `validateConditions` accepts groups; GET conditions enrichment → grouped+labelled |
| `client/hooks/usePipelines.ts` | `RuleWithMaps.conditions` → `{ groups: RuleConditionWithLabel[][] }` |
| `client/components/pipelines/ruleFormState.ts` | `RuleDraft.conditions` → `DraftCondition[][]`; draft↔payload over groups |
| `client/components/pipelines/ConditionsBuilder.tsx` | grouped builder (groups, AND within, OR between, add/remove) |
| `client/components/pipelines/PipelineRulesDialog.tsx` | read-side renders groups (DAN/ATAU) |

No schema/DB migration (conditions is opaque JSON; legacy shape auto-handled).

## 8. Testing

Pure helpers (`parseConditionGroups`/`evaluateConditionGroups`) get `node:test`
coverage (legacy flat → one group; `{groups}` parsed; empty group dropped; null →
[]; ANY-of-groups true when some group passes, false when none; no-groups → true).
Client has no unit runner → `npm run typecheck` + `npm run build` + manual:

- Build a rule `(A∧B) ∨ C` → fires when A&B true OR when C true; not when none.
- A legacy AND-only rule still fires correctly (one implicit group).
- Edit a legacy rule → conditions hydrate as one group; add a second group; save →
  GET shows two groups; re-edit round-trips.
- Empty group dropped on save; rule with zero groups = no conditions (always runs).
- Read-side detail renders DAN within / ATAU between.

## Out of scope (later)

- Per-group connector choice (top stays OR, group stays AND).
- Per-action conditions (conditions stay rule-level).
- Fully-nested arbitrary trees.
- New operators (the existing eq/neq/contains/gt/lt/empty/not_empty set is unchanged).

## Consistency with memory

- [[project-pipelines-engine]] - P4d-3; update the P4d-remaining line on merge.
- [[feedback-coding-standards]] - DRY (reuse `evaluateConditions`), pure helpers
  (SoC/TDD), semantic `<fieldset>`/aria-labels.
- [[reference-api-response-envelope]] - routes keep `sendSuccess`/`sendError`.
- No migration → [[reference-startup-add-column]] not engaged.
