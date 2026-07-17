# Dynamic Field Rules (Phase 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-field conditional **visibility** and **required** rules (conditions over other fields' values + the card's stage), configured in the UI and enforced on save.

**Architecture:** A shared pure module evaluates rules (field + stage sources, reusing the operator semantics). Rules live in `pipeline_fields.config` JSON (`visibleWhen`/`requiredWhen`). The card form computes visible/required reactively; the values route enforces conditional-required on save. The field editor reuses `ConditionsBuilder`, extended additively with a stage source.

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React. `.js` import extensions. No DB migration (config column exists).

---

### Task 1: Shared pure module — evaluator + visible/required helpers

**Files:**
- Create: `shared/fieldRules.ts`
- Test: `shared/fieldRules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/fieldRules.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFieldConditionGroups,
  parseFieldRules,
  isFieldVisible,
  isFieldRequired,
  type FieldRuleCondition,
} from "./fieldRules.js";

const vals = (o: Record<number, string>) => new Map<number, string>(Object.entries(o).map(([k, v]) => [Number(k), v]));

test("field-source eq/neq/contains/empty", () => {
  const g: FieldRuleCondition[][] = [[{ source: "field", fieldId: 1, op: "eq", value: "corporate" }]];
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "Corporate" }), stageId: 5 }), true);
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "retail" }), stageId: 5 }), false);
});

test("stage-source compares stageId", () => {
  const g: FieldRuleCondition[][] = [[{ source: "stage", op: "eq", value: "7" }]];
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({}), stageId: 7 }), true);
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({}), stageId: 8 }), false);
});

test("AND within group, OR across groups", () => {
  const g: FieldRuleCondition[][] = [
    [{ source: "field", fieldId: 1, op: "eq", value: "a" }, { source: "stage", op: "eq", value: "2" }],
    [{ source: "field", fieldId: 1, op: "eq", value: "z" }],
  ];
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "a" }), stageId: 2 }), true);  // group 1 AND
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "a" }), stageId: 9 }), false); // group1 fails stage
  assert.equal(evaluateFieldConditionGroups(g, { values: vals({ 1: "z" }), stageId: 9 }), true);  // group 2 OR
});

test("empty groups → true", () => {
  assert.equal(evaluateFieldConditionGroups([], { values: vals({}), stageId: 1 }), true);
});

test("parseFieldRules safe-parses config", () => {
  assert.deepEqual(parseFieldRules(null), { visibleWhen: [], requiredWhen: [] });
  assert.deepEqual(parseFieldRules("not json"), { visibleWhen: [], requiredWhen: [] });
  const cfg = JSON.stringify({ multiple: true, visibleWhen: [[{ source: "field", fieldId: 1, op: "eq", value: "x" }]] });
  assert.equal(parseFieldRules(cfg).visibleWhen.length, 1);
  assert.equal(parseFieldRules(cfg).requiredWhen.length, 0);
});

test("isFieldVisible: no rule → true; with rule → evaluated", () => {
  const ctx = { values: vals({ 1: "yes" }), stageId: 1 };
  assert.equal(isFieldVisible({ config: null }, ctx), true);
  assert.equal(isFieldVisible({ config: JSON.stringify({ visibleWhen: [[{ source: "field", fieldId: 1, op: "eq", value: "yes" }]] }) }, ctx), true);
  assert.equal(isFieldVisible({ config: JSON.stringify({ visibleWhen: [[{ source: "field", fieldId: 1, op: "eq", value: "no" }]] }) }, ctx), false);
});

test("isFieldRequired: hidden → false; requiredWhen evaluated; else static flag", () => {
  const ctx = { values: vals({ 1: "x" }), stageId: 3 };
  // hidden by visibleWhen → not required even if statically required
  assert.equal(isFieldRequired({ config: JSON.stringify({ visibleWhen: [[{ source: "field", fieldId: 1, op: "eq", value: "no" }]] }), required: 1 }, ctx), false);
  // requiredWhen true
  assert.equal(isFieldRequired({ config: JSON.stringify({ requiredWhen: [[{ source: "stage", op: "eq", value: "3" }]] }), required: 0 }, ctx), true);
  // requiredWhen false
  assert.equal(isFieldRequired({ config: JSON.stringify({ requiredWhen: [[{ source: "stage", op: "eq", value: "9" }]] }), required: 0 }, ctx), false);
  // no requiredWhen → static flag
  assert.equal(isFieldRequired({ config: null, required: 1 }, ctx), true);
  assert.equal(isFieldRequired({ config: null, required: 0 }, ctx), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/fieldRules.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the module**

Create `shared/fieldRules.ts`:

```ts
/** Pure evaluator + helpers for per-field visibility / required rules. No DB, no I/O.
 *  Conditions read other custom field values and the card's current stage. */

export type FieldRuleOp = "eq" | "neq" | "contains" | "gt" | "lt" | "empty" | "not_empty";
export interface FieldRuleCondition { source?: "field" | "stage"; fieldId?: number; op: FieldRuleOp; value?: string }
export interface FieldRuleCtx { values: Map<number, string>; stageId: number }

function operandFor(c: FieldRuleCondition, ctx: FieldRuleCtx): string {
  if (c.source === "stage") return String(ctx.stageId);
  return (c.fieldId != null ? ctx.values.get(c.fieldId) : "") ?? "";
}

function evalCondition(c: FieldRuleCondition, ctx: FieldRuleCtx): boolean {
  const stored = operandFor(c, ctx).trim();
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
}

/** AND within a group, OR across groups. Empty groups → true. */
export function evaluateFieldConditionGroups(groups: FieldRuleCondition[][], ctx: FieldRuleCtx): boolean {
  if (!groups || groups.length === 0) return true;
  return groups.some((g) => g.length > 0 && g.every((c) => evalCondition(c, ctx)));
}

function sanitizeGroups(raw: any): FieldRuleCondition[][] {
  if (!Array.isArray(raw)) return [];
  const out: FieldRuleCondition[][] = [];
  for (const g of raw) {
    if (!Array.isArray(g)) continue;
    const grp = g.filter((c: any) => c && typeof c.op === "string") as FieldRuleCondition[];
    if (grp.length) out.push(grp);
  }
  return out;
}

export function parseFieldRules(config: string | null): { visibleWhen: FieldRuleCondition[][]; requiredWhen: FieldRuleCondition[][] } {
  if (!config) return { visibleWhen: [], requiredWhen: [] };
  try {
    const c = JSON.parse(config);
    return { visibleWhen: sanitizeGroups(c?.visibleWhen), requiredWhen: sanitizeGroups(c?.requiredWhen) };
  } catch { return { visibleWhen: [], requiredWhen: [] }; }
}

export function isFieldVisible(field: { config: string | null }, ctx: FieldRuleCtx): boolean {
  const { visibleWhen } = parseFieldRules(field.config);
  if (visibleWhen.length === 0) return true;
  return evaluateFieldConditionGroups(visibleWhen, ctx);
}

/** True when the field should be treated as required right now. Hidden fields are never required. */
export function isFieldRequired(field: { config: string | null; required: number }, ctx: FieldRuleCtx): boolean {
  if (!isFieldVisible(field, ctx)) return false;
  const { requiredWhen } = parseFieldRules(field.config);
  if (requiredWhen.length > 0) return evaluateFieldConditionGroups(requiredWhen, ctx);
  return field.required === 1;
}

/** True only for fields that OPT IN via a requiredWhen rule (used for save-blocking enforcement;
 *  static-required fields stay soft/non-blocking). */
export function hasRequiredWhen(field: { config: string | null }): boolean {
  return parseFieldRules(field.config).requiredWhen.length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/fieldRules.test.ts`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/fieldRules.ts shared/fieldRules.test.ts
git commit -m "feat(pipelines): pure field-rules evaluator (visibility/required, field+stage)"
```

---

### Task 2: Storage — updateField accepts config

**Files:**
- Modify: `server/storage.ts` (`updateField`)

- [ ] **Step 1: Add config to updateField**

In `server/storage.ts`, `updateField` is currently:
```ts
  async updateField(id: number, data: { label?: string; options?: string[] | null; required?: boolean; showOnCard?: boolean; }): Promise<PipelineField> {
```
Change the signature to include `config`:
```ts
  async updateField(id: number, data: { label?: string; options?: string[] | null; required?: boolean; showOnCard?: boolean; config?: string | null; }): Promise<PipelineField> {
```
Then in its `patch` object building (the block that does `if (data.label !== undefined) patch.label = ...` etc.), add:
```ts
    if (data.config !== undefined) patch.config = data.config;
```
(Match the existing patch-building style in that method — read it first.)

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): updateField persists config (for field rules)"
```

---

### Task 3: Routes — validate + persist field rules on create/update

**Files:**
- Modify: `server/routes.ts` (field POST + PATCH handlers; add a `validateFieldRules` helper)

- [ ] **Step 1: Add a validation helper**

In `server/routes.ts`, add near `validateConditions` (or the other pipeline helpers) an import + helper. Add the import at top:
```ts
import { parseFieldRules } from "../shared/fieldRules.js";
```
Add the helper:
```ts
const FIELD_RULE_OPS = new Set(["eq", "neq", "contains", "gt", "lt", "empty", "not_empty"]);

/** Validate visibleWhen/requiredWhen condition groups inside a field's config JSON.
 *  fieldId conditions must reference a field of this pipeline and not the field being edited;
 *  stage conditions must reference a stage of this pipeline. Returns an error string or null. */
async function validateFieldRules(pipelineId: number, selfFieldId: number | null, config: string | null): Promise<string | null> {
  const { visibleWhen, requiredWhen } = parseFieldRules(config);
  if (visibleWhen.length === 0 && requiredWhen.length === 0) return null;
  const fields = await storage.listFields(pipelineId);
  const fieldIds = new Set(fields.map((f) => f.id));
  const stages = await storage.listStages(pipelineId);
  const stageIds = new Set(stages.map((s) => s.id));
  for (const groups of [visibleWhen, requiredWhen]) {
    for (const g of groups) {
      for (const c of g) {
        if (!FIELD_RULE_OPS.has(String(c.op))) return `Operator kondisi tidak valid: ${c.op}`;
        if (c.source === "stage") {
          if (c.op === "eq" || c.op === "neq") {
            if (!stageIds.has(Number(c.value))) return "Kondisi stage menunjuk stage yang tidak ada di pipeline ini";
          }
        } else {
          const fid = Number(c.fieldId);
          if (!fieldIds.has(fid)) return "Kondisi field menunjuk field yang tidak ada di pipeline ini";
          if (selfFieldId != null && fid === selfFieldId) return "Field tidak boleh memakai dirinya sendiri sebagai kondisi";
        }
      }
    }
  }
  return null;
}
```

- [ ] **Step 2: Wire into the field CREATE route**

In `server/routes.ts`, the `POST /api/pipelines/:id/fields` handler (around line 4786) builds the field from the body and calls `storage.createField`. Read it; it already reads a `config` (for `{multiple}` user fields) or you pass body fields through. Ensure the handler:
1. Reads `config` from the body (the client now sends `config` JSON that may include `visibleWhen`/`requiredWhen` plus any existing keys like `multiple`).
2. Validates: `const rerr = await validateFieldRules(Number(req.params.id), null, config); if (rerr) return sendError(res, rerr, 400);`
3. Passes `config` to `storage.createField(pipelineId, { ..., config })`.

Concretely, add after the existing body parsing and before the `createField` call:
```ts
    const configErr = await validateFieldRules(Number(req.params.id), null, config ?? null);
    if (configErr) return sendError(res, configErr, 400);
```
(where `config` is the JSON string the handler already assembles/receives; if the handler currently only builds `config` for `type==="user"`, change it to accept a client-provided `config` string and merge — see the client task. The simplest contract: the client sends the final `config` JSON string; the server validates + stores it as-is.)

- [ ] **Step 3: Wire into the field PATCH route**

In the `PATCH /api/pipelines/:id/fields/:fieldId` handler (around line 4800), read `config` from the body, validate with the field id, and pass to `updateField`:
```ts
    const { config } = req.body ?? {};
    if (config !== undefined) {
      const configErr = await validateFieldRules(Number(req.params.id), Number(req.params.fieldId), config);
      if (configErr) return sendError(res, configErr, 400);
    }
    // ...include `config` in the storage.updateField({...}) call when provided:
    //   config: config !== undefined ? config : undefined,
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): validate + persist field visibility/required rules"
```

---

### Task 4: Server enforcement — block save on missing conditional-required

**Files:**
- Modify: `server/routes.ts` (`PUT /api/pipelines/cards/:cardId/values`)

- [ ] **Step 1: Add the import**

At the top of `server/routes.ts`, extend the fieldRules import:
```ts
import { parseFieldRules, isFieldVisible, isFieldRequired, hasRequiredWhen } from "../shared/fieldRules.js";
```

- [ ] **Step 2: Enforce before setCardValues**

In the `PUT /api/pipelines/cards/:cardId/values` handler, after the per-field value validation loop and BEFORE `await storage.setCardValues(...)`, insert:
```ts
    // Conditional-required enforcement: only fields that opt in via a requiredWhen rule block save.
    const existing = await storage.getCardValues(cardId);
    const effective = new Map<number, string>(Object.entries(existing).map(([k, v]) => [Number(k), String(v)]));
    for (const v of values) effective.set(Number(v.fieldId), String(v.value ?? ""));
    const ctx = { values: effective, stageId: card.stageId };
    for (const f of fields) {
      if (!hasRequiredWhen(f)) continue;                 // static-required stays soft (legacy)
      if (!isFieldRequired(f, ctx)) continue;            // also false when hidden
      if ((effective.get(f.id) ?? "").trim() === "") return sendError(res, `${f.label}: wajib diisi`, 400);
    }
```
(`fields` is the pipeline's fields list already fetched in this handler as `byId`/`fields`; `card` is already fetched with `stageId`. Confirm both variable names by reading the handler; if `fields` isn't in scope, it's `await storage.listFields(card.pipelineId)` — reuse the one already fetched for value validation.)

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): enforce conditional-required fields on card save"
```

---

### Task 5: Client — reactive visibility/required in the card form

**Files:**
- Modify: `client/components/pipelines/CardDetailModal.tsx` (`FieldCustomSection`)

- [ ] **Step 1: Compute visible/required + gate save**

In `CardDetailModal.tsx`, the `FieldCustomSection` component has `draft` (Record<fieldId,string>) and `card` (with `fields`, `values`, `stageId`). Update it:

Add the import at the top of the file:
```tsx
import { isFieldVisible, isFieldRequired, hasRequiredWhen } from "@shared/fieldRules";
```

Inside `FieldCustomSection`, build the evaluation context from `draft` + `card.stageId`, then derive visible fields + a missing-required check:
```tsx
  const ctx = { values: new Map<number, string>(fields.map((f) => [f.id, draft[f.id] ?? ""])), stageId: card.stageId };
  const visibleFields = fields.filter((f) => isFieldVisible(f, ctx));
  const missingRequired = visibleFields.filter((f) => hasRequiredWhen(f) && isFieldRequired(f, ctx) && (draft[f.id] ?? "").trim() === "");
```
Render only `visibleFields` (replace `fields.map(...)` with `visibleFields.map(...)`). For each, show a required asterisk when `isFieldRequired(f, ctx)`:
```tsx
        {visibleFields.map((f: PipelineField) => {
          const v = draft[f.id] ?? "";
          const req = isFieldRequired(f, ctx);
          return (
            <div key={f.id} className="...existing...">
              <label className="...">{f.label}{req && <span className="text-destructive ml-0.5">*</span>}</label>
              <FieldValueInput field={f} value={v} disabled={!writable} onChange={(nv) => setDraft((d) => ({ ...d, [f.id]: nv }))} />
            </div>
          );
        })}
```
(Match the existing per-field markup; only add the asterisk + the visibleFields filter.)

Gate the Save button + show a message:
```tsx
      {missingRequired.length > 0 && (
        <p className="text-xs text-destructive mt-1">Wajib diisi: {missingRequired.map((f) => f.label).join(", ")}</p>
      )}
      {writable && <Button size="sm" className="mt-2" onClick={save} loading={m.setCardValues.isPending} disabled={missingRequired.length > 0}>Simpan Field</Button>}
```
And in `save()`, only submit visible fields' values (hidden fields keep their stored values untouched):
```tsx
    const values = visibleFields.map((f: PipelineField) => ({ fieldId: f.id, value: draft[f.id] ?? "" }));
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(pipelines): reactive field visibility + required gating in card form"
```

---

### Task 6: Field-rule editor — ConditionsBuilder stage source + ManageFieldsDialog sections

**Files:**
- Modify: `client/components/pipelines/ConditionsBuilder.tsx` (additive stage source)
- Modify: `client/components/pipelines/ManageFieldsDialog.tsx` (rule sections + config wiring)

**Context:** READ both files first. `ConditionsBuilder` currently renders `DraftCondition = { fieldId: number|""; op; value }[][]` (field-only) and is ALSO used by `PipelineRulesDialog` for automation conditions — so the stage source must be **additive and opt-in** (automation usage unchanged).

- [ ] **Step 1: Extend ConditionsBuilder with an opt-in stage source**

In `ConditionsBuilder.tsx`:
- Extend the row type: `export type DraftCondition = { source?: "field" | "stage"; fieldId: number | ""; op: RuleConditionOp; value: string };`
- Add an optional prop `stages?: { id: number; label: string }[]`. When `stages` is provided, render a small **source** `<select>` per row (options: "Field", "Stage"). When the row's `source === "stage"`, render a **stage** `<select>` (the `stages`) bound to `value` (store the stage id as a string) instead of the field dropdown + free-text value; the op set for stage rows is limited to `eq`/`neq`.
- When `stages` is NOT provided (automation usage), behave exactly as today (field-only, `source` treated as "field").
- Keep `value`/`onChange` shape the same (`DraftCondition[][]`).

- [ ] **Step 2: Add rule sections to ManageFieldsDialog**

In `ManageFieldsDialog.tsx` (the create/edit field form):
- Add two optional collapsible sections **"Aturan Tampil (Visibility)"** and **"Aturan Wajib"**, each an instance of `<ConditionsBuilder fields={otherFields} stages={stages} value={...} onChange={...} />` where `otherFields` excludes the field being edited and `stages` is the pipeline's stages (already available to the dialog, or fetch via the pipeline detail).
- Maintain two state values (`visibleWhen`, `requiredWhen`) as `DraftCondition[][]`, hydrated from the field's existing `config` (`parseFieldRules`) when editing.
- On save (create or update), merge them into the field `config` JSON alongside any existing keys (e.g. `multiple` for user fields): build `config = JSON.stringify({ ...existingConfigObj, visibleWhen, requiredWhen })` (omit empty arrays to keep config tidy) and send it in the create/update request body as `config`.

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/ConditionsBuilder.tsx client/components/pipelines/ManageFieldsDialog.tsx
git commit -m "feat(pipelines): field visibility/required rule editor (stage source)"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests** — Run: `npx tsx --test shared/fieldRules.test.ts` → all PASS.
- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** — Run: `npm run build` → success.
- [ ] **Step 4: Wiring** — Run: `grep -rln "fieldRules\|visibleWhen\|requiredWhen\|isFieldVisible" server/ shared/ client/ | sort` → expect shared module + test, routes, card modal, manage-fields dialog.

---

## Self-Review

- **Spec coverage:** condition model (field + stage) + evaluator → Task 1. Storage in `config` → Tasks 2–3 (config persisted on create+update). Validation (fieldId ∈ pipeline & ≠ self, stage valid, op valid) → Task 3 `validateFieldRules`. Server enforcement (only `requiredWhen` blocks; hidden skipped; static stays soft) → Task 4 (`hasRequiredWhen` guard + `isFieldRequired`). Client reactive visible/required + save gate + don't-clear-hidden → Task 5. Editor with stage source → Task 6. Testing → Task 1 + Task 7. All covered.
- **Placeholders:** Tasks 1–5 + 7 are complete code. Tasks 3 and 6 flag real integration points (the field CREATE handler's current `config` assembly; ConditionsBuilder's additive stage extension) with concrete contracts and instruct reading the file — appropriate for those existing components.
- **Type consistency:** `FieldRuleCondition`/`evaluateFieldConditionGroups`/`parseFieldRules`/`isFieldVisible`/`isFieldRequired`/`hasRequiredWhen` defined in Task 1 and consumed in Tasks 3 (validate), 4 (enforce), 5 (client). `updateField` gains `config` (Task 2) and is called with it (Task 3). The card form's `ctx = { values, stageId }` shape matches `FieldRuleCtx`. `DraftCondition` extended consistently (Task 6) and serialized to `FieldRuleCondition` (same field names: source/fieldId/op/value).

## Deploy note
No schema/table change (`pipeline_fields.config` already exists). Purely additive: fields without `visibleWhen`/`requiredWhen` behave exactly as today; static `required` stays soft/non-blocking.
