# LP2 - Lead-Attribute Rule Builder - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead-trigger rules dapat memakai kondisi atribut lead (OR-of-AND) - `source`, `category`, `district`, `village`, `priority`, `distanceMeters`, `odpId`(exists) - dievaluasi terhadap lead saat intake, sebelum dedup/create.

**Architecture:** Extend pola `source:"billing"` yang sudah ada dengan `source:"lead"`. Pure module `shared/leadConditions.ts` (catalog + evaluator), dipakai `runLeadIntake` (LP1) untuk skip rule yang gagal kondisi. `applyConditionOp` diekstrak & dipakai bersama evaluator card existing (DRY). UI: `ConditionsBuilder` mode-lead.

**Tech Stack:** TypeScript, Express 5, Drizzle (MySQL), React 18 + shadcn/ui, `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-14-leads-pipeline-lp2-conditions-design.md`. Sibling imports pakai ekstensi `.js` (moduleResolution Bundler).

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `shared/leadConditions.ts` (create) | Pure: `applyConditionOp`, `LEAD_CONDITION_ATTRS`, `leadConditionRaw`, `compareLeadAttr`, `evaluateLeadConditionGroups`, `leadConditionAttrValid`, `opValidForAttr`. |
| `shared/leadConditions.test.ts` (create) | Tests. |
| `shared/schema.ts` (modify) | `RuleCondition.source` += `"lead"`. |
| `server/pipeline-automation-helpers.ts` (modify) | `parseConditionGroups` terima `source:"lead"`; `evaluateConditions` pakai `applyConditionOp` (DRY refactor, perilaku sama). |
| `server/lead-intake.ts` (modify) | Evaluasi kondisi lead sebelum dedup. |
| `server/routes.ts` (modify) | `validateConditions` terima `source:"lead"`. |
| `client/components/pipelines/ConditionsBuilder.tsx` (modify) | `"lead"` di DraftCondition.source + prop mode-lead. |
| `client/components/pipelines/ruleFormState.ts` (modify) | `buildConditionGroups` lead-aware + lead branch sertakan conditions (payload + hydrate). |
| `client/components/pipelines/PipelineRulesDialog.tsx` (modify) | Render ConditionsBuilder mode-lead untuk trigger lead + tampilkan ringkasan kondisi. |

---

## Task 1: Pure module `shared/leadConditions.ts`

**Files:**
- Create: `shared/leadConditions.ts`
- Test: `shared/leadConditions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/leadConditions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyConditionOp, compareLeadAttr, evaluateLeadConditionGroups,
  LEAD_CONDITION_ATTRS, leadConditionAttrValid, opValidForAttr,
} from "./leadConditions.js";

test("applyConditionOp: string ops are case-insensitive + trimmed", () => {
  assert.equal(applyConditionOp(" Cilawu ", "eq", "cilawu"), true);
  assert.equal(applyConditionOp("Cilawu", "neq", "Garut"), true);
  assert.equal(applyConditionOp("Jl Mawar", "contains", "mawar"), true);
  assert.equal(applyConditionOp("", "empty", ""), true);
  assert.equal(applyConditionOp("x", "not_empty", ""), true);
});

test("applyConditionOp: gt/lt numeric, non-numeric → false", () => {
  assert.equal(applyConditionOp("150", "lt", "200"), true);
  assert.equal(applyConditionOp("250", "lt", "200"), false);
  assert.equal(applyConditionOp("250", "gt", "200"), true);
  assert.equal(applyConditionOp("abc", "gt", "200"), false);
});

test("compareLeadAttr: source canonicalized; odpId exists; distance numeric", () => {
  const lead = { id: 1, mitraId: 1, source: "meta_ads", odpId: 9, distanceMeters: 150, district: "Cilawu" };
  assert.equal(compareLeadAttr(lead, "source", "eq", "meta_leads"), true);   // meta_ads→meta_leads
  assert.equal(compareLeadAttr(lead, "odpId", "not_empty", ""), true);
  assert.equal(compareLeadAttr({ ...lead, odpId: null }, "odpId", "empty", ""), true);
  assert.equal(compareLeadAttr(lead, "distanceMeters", "lt", "200"), true);
  assert.equal(compareLeadAttr(lead, "district", "eq", "cilawu"), true);
});

test("evaluateLeadConditionGroups: OR-of-AND, empty groups = true", () => {
  const lead = { id: 1, mitraId: 1, source: "meta_ads", odpId: 9, distanceMeters: 150 };
  assert.equal(evaluateLeadConditionGroups([], lead), true);
  // (source=meta_leads AND odpId not_empty) → pass
  assert.equal(evaluateLeadConditionGroups([[
    { source: "lead", attr: "source", op: "eq", value: "meta_leads" },
    { source: "lead", attr: "odpId", op: "not_empty" },
  ]], lead), true);
  // (distance > 200) fails alone; OR (source=meta_leads) passes
  assert.equal(evaluateLeadConditionGroups([
    [{ source: "lead", attr: "distanceMeters", op: "gt", value: "200" }],
    [{ source: "lead", attr: "source", op: "eq", value: "meta_leads" }],
  ], lead), true);
  assert.equal(evaluateLeadConditionGroups([
    [{ source: "lead", attr: "distanceMeters", op: "gt", value: "200" }],
  ], lead), false);
});

test("catalog validators", () => {
  assert.equal(leadConditionAttrValid("source"), true);
  assert.equal(leadConditionAttrValid("nope"), false);
  assert.equal(opValidForAttr("distanceMeters", "gt"), true);
  assert.equal(opValidForAttr("distanceMeters", "contains"), false);
  assert.equal(opValidForAttr("odpId", "not_empty"), true);
  assert.ok(LEAD_CONDITION_ATTRS.length >= 7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/leadConditions.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write the implementation**

```ts
// shared/leadConditions.ts
/** Pure: kondisi atribut lead untuk rule lead-trigger. No DB, no I/O.
 *  Extend pola source:"billing" → source:"lead", dievaluasi terhadap objek lead saat intake. */
import type { RuleConditionOp, RuleCondition } from "./schema.js";
import { canonicalLeadSource } from "./leadSources.js";
import type { IntakeLead } from "./leadIntake.js";

/** Operator generik untuk kondisi (di-EKSTRAK dari evaluateConditions; dipakai bersama evaluator card). */
export function applyConditionOp(stored: string, op: RuleConditionOp, target: string): boolean {
  const s = String(stored ?? "").trim();
  const t = String(target ?? "").trim();
  switch (op) {
    case "eq": return s.toLowerCase() === t.toLowerCase();
    case "neq": return s.toLowerCase() !== t.toLowerCase();
    case "contains": return s.toLowerCase().includes(t.toLowerCase());
    case "gt": { const a = Number(s), b = Number(t); return !Number.isNaN(a) && !Number.isNaN(b) && a > b; }
    case "lt": { const a = Number(s), b = Number(t); return !Number.isNaN(a) && !Number.isNaN(b) && a < b; }
    case "empty": return s === "";
    case "not_empty": return s !== "";
    default: return false;
  }
}

export interface LeadConditionAttr { key: string; label: string; ops: RuleConditionOp[] }

const EQ = ["eq", "neq"] as RuleConditionOp[];
const TEXT = ["eq", "neq", "contains"] as RuleConditionOp[];
const NUM = ["gt", "lt"] as RuleConditionOp[];
const EXISTS = ["empty", "not_empty"] as RuleConditionOp[];

export const LEAD_CONDITION_ATTRS: LeadConditionAttr[] = [
  { key: "source", label: "Sumber", ops: EQ },
  { key: "category", label: "Kategori", ops: EQ },
  { key: "district", label: "Kecamatan", ops: TEXT },
  { key: "village", label: "Desa/Kelurahan", ops: TEXT },
  { key: "priority", label: "Prioritas", ops: EQ },
  { key: "distanceMeters", label: "Jarak ke ODP (m)", ops: NUM },
  { key: "odpId", label: "Nearest ODP", ops: EXISTS },
];

export function leadConditionAttrValid(attr: string): boolean {
  return LEAD_CONDITION_ATTRS.some((a) => a.key === attr);
}
export function opValidForAttr(attr: string, op: RuleConditionOp): boolean {
  const a = LEAD_CONDITION_ATTRS.find((x) => x.key === attr);
  return !!a && a.ops.includes(op);
}

/** Nilai attr lead sebagai string untuk dibandingkan. source→kanonik; odpId→id atau "" (utk empty/not_empty). */
export function leadConditionRaw(lead: IntakeLead, attr: string): string {
  if (attr === "source") return canonicalLeadSource(lead.source);
  if (attr === "odpId") return lead.odpId != null ? String(lead.odpId) : "";
  const v = (lead as any)[attr];
  return v == null ? "" : String(v);
}

export function compareLeadAttr(lead: IntakeLead, attr: string, op: RuleConditionOp, value?: string): boolean {
  return applyConditionOp(leadConditionRaw(lead, attr), op, value ?? "");
}

/** OR-of-AND terhadap lead. Group kosong/none → true. Hanya menilai kondisi source:"lead"
 *  (kondisi non-lead di rule lead dianggap true - UI me-restrict ke lead, ini guard defensif). */
export function evaluateLeadConditionGroups(groups: RuleCondition[][], lead: IntakeLead): boolean {
  if (!groups || groups.length === 0) return true;
  return groups.some((g) => g.every((c) => {
    if (c.source !== "lead") return true;
    return compareLeadAttr(lead, String(c.attr), c.op, c.value);
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/leadConditions.test.ts`
Expected: PASS (5 tests). Also `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/leadConditions.ts shared/leadConditions.test.ts
git commit -m "feat(leads): pure lead-attribute condition module (LP2 task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Schema - add `"lead"` to condition source

**Files:**
- Modify: `shared/schema.ts` (`RuleCondition` ~line 811)

- [ ] **Step 1: Edit the union**

Find:
```ts
export type RuleCondition = {
  source?: "field" | "stage" | "billing";
  fieldId?: number;
  attr?: string;
  op: RuleConditionOp;
  value?: string;
};
```
Change the source line to:
```ts
  source?: "field" | "stage" | "billing" | "lead";
```
(Update the preceding comment to mention `"lead"` rows use `attr` like billing.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors (additive union member).

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(leads): allow source:lead in RuleCondition (LP2 task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Server helpers - accept lead conditions + DRY op refactor

**Files:**
- Modify: `server/pipeline-automation-helpers.ts` (`parseConditionGroups` ~line 207; `evaluateConditions` ~line 52)

- [ ] **Step 1: Extend `parseConditionGroups` filter to keep lead rows**

Find (inside `parseConditionGroups`):
```ts
    const conds = g.filter((c) => c && typeof c.op === "string" && (typeof c.fieldId === "number" || (c.source === "billing" && typeof c.attr === "string"))) as RuleCondition[];
```
Replace with (add the lead clause):
```ts
    const conds = g.filter((c) => c && typeof c.op === "string" && (typeof c.fieldId === "number" || ((c.source === "billing" || c.source === "lead") && typeof c.attr === "string"))) as RuleCondition[];
```

- [ ] **Step 2: Refactor `evaluateConditions` field branch to use `applyConditionOp` (DRY, behavior-preserving)**

Add import at top of the file (with other imports):
```ts
import { applyConditionOp } from "../shared/leadConditions.js";
```
Find the field-branch switch in `evaluateConditions`:
```ts
    const stored = (values.get(c.fieldId as number) ?? "").trim();
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
```
Replace with:
```ts
    const stored = values.get(c.fieldId as number) ?? "";
    return applyConditionOp(stored, c.op, c.value ?? "");
```
(`applyConditionOp` trims internally, so behavior is identical.)

> NOTE: do NOT add a `c.source === "lead"` branch to `evaluateConditions` here - the card automation engine never evaluates lead conditions (lead conditions are evaluated by the lead intake path in Task 4). If a lead condition somehow reaches this card evaluator, it has no `fieldId`; `values.get(undefined)` → `""`, and only `empty` would match - harmless and unreachable in practice.

- [ ] **Step 3: Run existing helper tests + typecheck**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts server/pipeline-automation-helpers.collection.test.ts`
Expected: all PASS (behavior preserved).
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/pipeline-automation-helpers.ts
git commit -m "refactor(leads): parseConditionGroups keeps lead rows + DRY applyConditionOp (LP2 task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Intake - evaluate lead conditions before dedup

**Files:**
- Modify: `server/lead-intake.ts`

- [ ] **Step 1: Add imports**

At the top of `server/lead-intake.ts`, add:
```ts
import { parseConditionGroups } from "./pipeline-automation-helpers.js";
import { evaluateLeadConditionGroups } from "../shared/leadConditions.js";
```

- [ ] **Step 2: Insert condition gate after source filter, before pipeline/dedup work**

In `runLeadIntake`, find the source-filter line:
```ts
      if (!leadRuleMatchesSource(cfg.sources, lead.source)) continue;
```
Immediately AFTER it, add:
```ts
      const condGroups = parseConditionGroups((rule as any).conditions);
      if (condGroups.length && !evaluateLeadConditionGroups(condGroups, lead)) continue;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/lead-intake.ts
git commit -m "feat(leads): gate lead intake on lead-attribute conditions (LP2 task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Server validation - accept `source:"lead"` conditions

**Files:**
- Modify: `server/routes.ts` (`validateConditions` ~line 4644)

- [ ] **Step 1: Add lead import (header of routes.ts)**

The file already imports `LEAD_ATTRS`/`parseLeadTriggerConfig` from `../shared/leadIntake.js`. Add a lead-conditions import:
```ts
import { leadConditionAttrValid, opValidForAttr } from "../shared/leadConditions.js";
```

- [ ] **Step 2: Add a lead branch in `validateConditions`**

Find the per-condition loop body in `validateConditions`:
```ts
      if (!c || typeof c.op !== "string" || !ops.has(c.op)) return "Operator kondisi tidak valid";
      if (c.source === "billing") {
        if (typeof c.attr !== "string" || !attrKeys.has(c.attr)) return "Atribut billing tidak valid";
        if (c.op !== "empty" && c.op !== "not_empty" && (c.value == null || String(c.value).trim() === "")) {
          return "Nilai syarat billing wajib diisi";
        }
      } else {
        if (typeof c.fieldId !== "number" || !ids.has(c.fieldId)) return "Kondisi merujuk field yang tidak ada di pipeline ini";
      }
```
Insert a `c.source === "lead"` branch BEFORE the final `else`:
```ts
      if (!c || typeof c.op !== "string" || !ops.has(c.op)) return "Operator kondisi tidak valid";
      if (c.source === "billing") {
        if (typeof c.attr !== "string" || !attrKeys.has(c.attr)) return "Atribut billing tidak valid";
        if (c.op !== "empty" && c.op !== "not_empty" && (c.value == null || String(c.value).trim() === "")) {
          return "Nilai syarat billing wajib diisi";
        }
      } else if (c.source === "lead") {
        if (typeof c.attr !== "string" || !leadConditionAttrValid(c.attr)) return "Atribut lead tidak valid";
        if (!opValidForAttr(c.attr, c.op)) return `Operator '${c.op}' tak cocok untuk atribut lead '${c.attr}'`;
        if (c.op !== "empty" && c.op !== "not_empty" && (c.value == null || String(c.value).trim() === "")) {
          return "Nilai syarat lead wajib diisi";
        }
      } else {
        if (typeof c.fieldId !== "number" || !ids.has(c.fieldId)) return "Kondisi merujuk field yang tidak ada di pipeline ini";
      }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(leads): validate source:lead conditions (LP2 task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: ConditionsBuilder - lead mode

**Files:**
- Modify: `client/components/pipelines/ConditionsBuilder.tsx`

- [ ] **Step 1: Extend `DraftCondition.source` + import lead catalog**

At top, add import:
```ts
import { LEAD_CONDITION_ATTRS } from "@shared/leadConditions";
```
Change:
```ts
export type DraftCondition = { source?: "field" | "stage" | "billing"; fieldId: number | ""; attr?: string; op: RuleConditionOp; value: string };
```
to:
```ts
export type DraftCondition = { source?: "field" | "stage" | "billing" | "lead"; fieldId: number | ""; attr?: string; op: RuleConditionOp; value: string };
```

- [ ] **Step 2: Add `leadMode` prop + lead-only rendering**

Add `leadMode` to the component props:
```ts
export function ConditionsBuilder({
  fields,
  stages,
  value,
  onChange,
  leadMode,
}: {
  fields: PipelineField[];
  stages?: { id: number; label: string }[];
  value: DraftCondition[][];
  onChange: (next: DraftCondition[][]) => void;
  /** When true: source locked to "lead"; rows pick a lead attribute (no field/stage/billing). */
  leadMode?: boolean;
}) {
```
Make new rows default to a lead row when `leadMode`. Find the three places that create a fresh row:
- `addRow`: `{ source: hasStages ? "field" : undefined, fieldId: "", op: "eq", value: "" }`
- `addGroup`: same literal
Replace the fresh-row literal in BOTH `addRow` and `addGroup` with a helper. Add near the top of the component body:
```ts
  const freshRow = (): DraftCondition => leadMode
    ? { source: "lead", fieldId: "", attr: LEAD_CONDITION_ATTRS[0].key, op: LEAD_CONDITION_ATTRS[0].ops[0], value: "" }
    : { source: hasStages ? "field" : undefined, fieldId: "", op: "eq", value: "" };
```
and use `freshRow()` in `addRow` (`setGroup(gi, [...value[gi], freshRow()])`) and `addGroup` (`onChange([...value, [freshRow()]])`).

- [ ] **Step 3: Render lead rows (attr dropdown + filtered ops, no source selector)**

Inside the row `.map`, BEFORE the existing source-selector `<div className="w-24 ...">`, branch on `leadMode`. The cleanest: when `leadMode`, render an attribute dropdown instead of the source selector + field/billing dropdowns, and filter ops by the chosen attr. Add this near the row computations:
```ts
              const leadAttr = leadMode ? LEAD_CONDITION_ATTRS.find((a) => a.key === row.attr) : undefined;
              const opsForRow = leadMode
                ? (leadAttr ? leadAttr.ops.map((op) => OPS.find((o) => o.value === op)!) : OPS)
                : (isStageRow ? STAGE_OPS : OPS);
```
Then wrap the existing source-selector + field/billing blocks so they only render when `!leadMode`, and add a lead-attr dropdown when `leadMode`:
```tsx
                  {leadMode ? (
                    <div className="flex-1 min-w-[6rem] sm:min-w-[8rem]">
                      <Combobox
                        options={LEAD_CONDITION_ATTRS.map((a) => ({ value: a.key, label: a.label }))}
                        value={row.attr ?? ""}
                        onChange={(v) => {
                          const a = LEAD_CONDITION_ATTRS.find((x) => x.key === v);
                          setRow(gi, ri, { source: "lead", fieldId: "", attr: v || undefined, op: a ? a.ops[0] : "eq", value: "" });
                        }}
                        placeholder="Atribut lead…" clearable={false}
                      />
                    </div>
                  ) : (
                    <>
                      {/* existing source selector div */}
                      {/* existing field dropdown (!isStageRow && !isBillingRow) */}
                      {/* existing billing attr dropdown (isBillingRow) */}
                    </>
                  )}
```
Keep the existing op `<Combobox>` (it already uses `opsForRow`) and the value `<Input>` (gated by `NEEDS_VALUE(row.op)` - for `odpId` empty/not_empty the value input hides automatically). The stage-value branch stays under `!leadMode` (lead rows never use stage).

> Implementation note: do this by literally moving the current source-selector `<div className="w-24 ...">`, the field dropdown block, and the billing dropdown block inside the `!leadMode` `<>...</>` branch, and adding the lead-attr `<Combobox>` as the `leadMode` branch. The op Combobox + value Input remain shared below the branch. Verify `opsForRow` is computed once (replace the old `const opsForRow = isStageRow ? STAGE_OPS : OPS;`).

- [ ] **Step 4: Build + typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errors, build success.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/ConditionsBuilder.tsx
git commit -m "feat(leads): ConditionsBuilder lead mode (LP2 task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: ruleFormState - lead-aware condition serialization

**Files:**
- Modify: `client/components/pipelines/ruleFormState.ts`

- [ ] **Step 1: Extract a lead-aware `buildConditionGroups` helper**

Find the existing inline serialization (~line 308):
```ts
  const conditionGroups = d.conditions
    .map((g) =>
      g
        .filter((c) => (c.source === "billing" ? !!c.attr : c.fieldId !== ""))
        .map((c) => c.source === "billing"
          ? { source: "billing", attr: c.attr, op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) }
          : { fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) }),
    )
    .filter((g) => g.length > 0);
```
Replace the inline block with a call to a new module-scope helper, and ADD the helper near the top of the file (after imports):
```ts
function buildConditionGroups(conditions: DraftCondition[][]) {
  return conditions
    .map((g) =>
      g
        .filter((c) => (c.source === "billing" || c.source === "lead") ? !!c.attr : c.fieldId !== "")
        .map((c) => (c.source === "billing" || c.source === "lead")
          ? { source: c.source, attr: c.attr, op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) }
          : { fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) }),
    )
    .filter((g) => g.length > 0);
}
```
And at line ~308:
```ts
  const conditionGroups = buildConditionGroups(d.conditions);
```

- [ ] **Step 2: Lead branch in `draftToPayload` must include conditions**

Find the lead branch in `draftToPayload` (LP1, the `else if (String(d.triggerType).startsWith("lead_"))` block) that currently returns:
```ts
    return { ok: true, payload: { triggerType: d.triggerType, triggerConfig } };
```
Change it to build + include conditions:
```ts
    const leadConditionGroups = buildConditionGroups(d.conditions);
    return { ok: true, payload: { triggerType: d.triggerType, triggerConfig, conditions: leadConditionGroups.length ? { groups: leadConditionGroups } : null } };
```

- [ ] **Step 3: Lead branch in `ruleToDraft` must hydrate conditions**

Find the lead branch in `ruleToDraft` (LP1, `if (String(r.triggerType ?? "").startsWith("lead_")) { ... return d; }`). Before its `return d;`, add the same conditions hydration the other branches use:
```ts
    d.conditions = (r.conditions?.groups ?? []).map((g: any[]) =>
      g.map((c: any) => ({ source: (c.source as DraftCondition["source"]) ?? "field", fieldId: typeof c.fieldId === "number" ? c.fieldId : "", attr: c.attr, op: c.op, value: c.value ?? "" })));
```
(Place it right before `return d;` inside the lead branch.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/ruleFormState.ts
git commit -m "feat(leads): serialize+hydrate lead conditions in rule form state (LP2 task 7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: PipelineRulesDialog - render lead conditions builder + summary

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

- [ ] **Step 1: Render a lead ConditionsBuilder for lead triggers**

LP1 hid the conditions section for lead triggers. The existing builder is rendered inside a block gated `triggerType !== "billing_sync" && !triggerType.startsWith("lead_")` (around the `<ConditionsBuilder fields={sourceFields} value={conditions} onChange={setConditions} />` usage, ~line 968). ADD a sibling block that renders the lead-mode builder for lead triggers. Place it inside the lead sub-form (the `{triggerType.startsWith("lead_") && ( ... )}` block from LP1), after the dedup controls:
```tsx
        <div className="pt-1">
          <ConditionsBuilder leadMode fields={[]} value={conditions} onChange={setConditions} />
        </div>
```
(`fields={[]}` because lead mode ignores card fields; `conditions`/`setConditions` state already exists in the dialog.)

- [ ] **Step 2: Reset conditions on trigger-type change away from a compatible type (avoid stale field rows)**

When the user switches trigger type to a lead type, any pre-existing field/stage/billing condition rows would be invalid for lead mode. In the `setTriggerType` handler (the trigger Combobox onChange), when the new value `startsWith("lead_")`, clear conditions that aren't lead rows. Minimal-safe: reset conditions to `[]` when switching INTO a lead trigger from a non-lead trigger, and when switching OUT of lead to non-lead. Locate the trigger Combobox `onChange` and add:
```ts
                  onChange={(v) => {
                    const next = (v || "stage_enter") as RuleDraft["triggerType"];
                    const wasLead = triggerType.startsWith("lead_");
                    const isLead = next.startsWith("lead_");
                    if (wasLead !== isLead) setConditions([]);
                    setTriggerType(next);
                  }}
```
(Adapt to the actual existing onChange - preserve any logic it already has; just add the conditions reset when crossing the lead boundary.)

- [ ] **Step 3: Show lead conditions in the rule summary/detail**

The rule list detail hides the conditions block for lead (LP1 changed the guard at ~line 404 to `r.triggerType !== "billing_sync" && !String(r.triggerType ?? "").startsWith("lead_")`). For lead rules we DO want to show conditions now. Change that guard so lead rules show conditions: the condition-count chip (~line 353) and the conditions detail (~line 404) should render when the rule HAS conditions, regardless of lead. Simplest: change both guards from `... && !String(r.triggerType ?? "").startsWith("lead_")` to just check conditions presence (drop the lead exclusion for the CONDITIONS block only - keep actions hidden for lead). Concretely, for the conditions chip + conditions detail blocks, use `(r.conditions?.groups?.length ?? 0) > 0` as the guard and remove the `!startsWith("lead_")` part for those two blocks. Leave the ACTIONS detail block still excluding lead.

- [ ] **Step 4: Build + typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errors, build success.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(leads): lead conditions builder + summary in rules dialog (LP2 task 8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Final verification + memory

- [ ] **Step 1: Run lead + helper tests**

Run: `npx tsx --test shared/leadConditions.test.ts shared/leadSources.test.ts shared/leadIntake.test.ts server/pipeline-automation-helpers.test.ts server/pipeline-automation-helpers.collection.test.ts`
Expected: all PASS.

- [ ] **Step 2: Full typecheck + build**

Run: `npx tsc --noEmit` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Full test suite (regression)**

Run: `npx tsx --test shared/*.test.ts server/*.test.ts client/**/*.test.ts`
Expected: all PASS (≥ prior count).

- [ ] **Step 4: Smoke (optional, local DB)**

Buat rule `lead_created`, source=Coverage Check, tambah kondisi lead: `distanceMeters lt 200` + `odpId not_empty`. Kirim 2 lead (satu jarak 150 dgn ODP, satu 500 tanpa ODP) → hanya yang lolos kondisi yang bikin kartu.

- [ ] **Step 5: Update memory**

Update `memory/project-leads-pipeline-integration.md`: LP2 DONE on dev (belum push) - `source:"lead"` conditions, LEAD_CONDITION_ATTRS, applyConditionOp extracted (DRY), ConditionsBuilder leadMode; campaign→LP2b, reverse→LP4 next. Add commit range.

---

## Self-Review (penulis plan - sudah dijalankan)

**Spec coverage:** §source:"lead"→T2; §LEAD_CONDITION_ATTRS+evaluator+applyConditionOp→T1; §intake gate→T4; §parseConditionGroups keep lead + DRY refactor→T3; §validateConditions lead→T5; §ConditionsBuilder lead-mode→T6; §ruleFormState serialize/hydrate→T7; §dialog render+summary→T8; §tenant/perf/audit unchanged (no new query, eval in-memory)→by construction; §testing→T1/T9. All covered.

**Placeholder scan:** no TBD/TODO; all steps have concrete code. T6/T8 reference "existing block" but give exact anchors + the literal code to move/add.

**Type consistency:** `applyConditionOp(stored,op,target)`, `compareLeadAttr(lead,attr,op,value?)`, `evaluateLeadConditionGroups(groups,lead)`, `leadConditionAttrValid`, `opValidForAttr`, `LEAD_CONDITION_ATTRS` consistent across T1/T3/T5. `DraftCondition.source` union `+"lead"` consistent T2/T6/T7. `buildConditionGroups` defined+used T7. `parseConditionGroups` (server helper) imported into lead-intake T4. RuleCondition source `"lead"` flows schema(T2)→parse(T3)→validate(T5)→evaluate(T1/T4)→UI(T6/T7/T8).
