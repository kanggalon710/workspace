# SP1 - Collection Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Subagents: work DIRECTLY in this repo on branch `dev`. NO git worktrees, NO branch switches. Verify `git branch --show-current` is `dev` before committing.**

**Goal:** Make the pipeline automation engine able to read live billing-derived values (`days_overdue`, `outstanding_amount`, `invoice_due_date`, `last_payment_date`, `billing_status`) for any collection card (via `pipeline_cards.source_customer_id`) and use them in rule conditions through a new `"billing"` condition source.

**Architecture:** A pure metrics module computes a `CollectionSnapshot` from a customer row. A storage accessor resolves the snapshot per card. The existing condition evaluator gains an optional snapshot parameter and a `billing` branch; the parsers/validator/UI gain `source: "billing"` + `attr`. No new triggers - billing conditions ride the existing stage_enter/event (`runRulesForCard`) and time-trigger evaluation paths. The billing_sync periodic card-scan is SP3.

**Tech Stack:** TypeScript ESM (server + shared), Drizzle/mysql2, React 18 + Tailwind. Pure-module tests via `npx tsx --test`. Local imports use `.js` extensions.

---

## File Structure

- **Create** `shared/collectionMetrics.ts` - pure metrics: `COLLECTION_ATTRS`, `computeDaysOverdue`, `buildCollectionSnapshot`, `attrValue`, `compareAttr`, `isPaidStatus`, types.
- **Create** `shared/collectionMetrics.test.ts` - unit tests.
- **Modify** `shared/schema.ts` - extend `RuleCondition` with `source`/`attr`, make `fieldId` optional.
- **Modify** `server/pipeline-automation-helpers.ts` - billing-aware parse + evaluate; add `conditionsUseBilling`.
- **Modify** `server/storage.ts` - `getCardCollectionSnapshot(cardId)`.
- **Modify** `server/pipeline-automation.ts` - fetch + pass snapshot at the two eval sites.
- **Modify** `server/routes.ts` - `validateConditions` accepts billing rows.
- **Modify** `client/components/pipelines/ConditionsBuilder.tsx` + `client/components/pipelines/ruleFormState.ts` - Billing source + attr dropdown + (de)serialise.

---

## Task 1: Pure module `shared/collectionMetrics.ts`

**Files:**
- Create: `shared/collectionMetrics.ts`
- Test: `shared/collectionMetrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/collectionMetrics.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_ATTRS, isPaidStatus, computeDaysOverdue, buildCollectionSnapshot, attrValue, compareAttr,
} from "./collectionMetrics.js";

const DAY = 86400000;
const NOW = Date.parse("2026-01-31T00:00:00Z");

test("COLLECTION_ATTRS has the 5 customer-derived keys", () => {
  assert.deepEqual(COLLECTION_ATTRS.map((a) => a.key),
    ["days_overdue", "outstanding_amount", "invoice_due_date", "last_payment_date", "billing_status"]);
});

test("isPaidStatus: lunas/paid (case-insensitive, trimmed) only", () => {
  assert.equal(isPaidStatus("lunas"), true);
  assert.equal(isPaidStatus(" PAID "), true);
  assert.equal(isPaidStatus("overdue"), false);
  assert.equal(isPaidStatus(null), false);
});

test("computeDaysOverdue: none/future → 0, past → floor days", () => {
  assert.equal(computeDaysOverdue(null, NOW), 0);
  assert.equal(computeDaysOverdue("not-a-date", NOW), 0);
  assert.equal(computeDaysOverdue("2026-02-10", NOW), 0);                 // future
  assert.equal(computeDaysOverdue("2026-01-21T00:00:00Z", NOW), 10);      // 10 days past
});

test("buildCollectionSnapshot: paid → outstanding 0; unpaid → billingPrice; null price → 0", () => {
  const paid = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 150000, billingStatus: "lunas", lastPaymentDate: "2026-01-22" }, NOW);
  assert.equal(paid.outstandingAmount, 0);
  assert.equal(paid.daysOverdue, 10);
  const unpaid = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 150000, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(unpaid.outstandingAmount, 150000);
  const noPrice = buildCollectionSnapshot({ dueDate: null, billingPrice: null, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(noPrice.outstandingAmount, 0);
  assert.equal(noPrice.invoiceDueDate, null);
});

test("attrValue maps snapshot fields", () => {
  const s = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 150000, billingStatus: "overdue", lastPaymentDate: "2026-01-01" }, NOW);
  assert.equal(attrValue(s, "days_overdue"), 10);
  assert.equal(attrValue(s, "outstanding_amount"), 150000);
  assert.equal(attrValue(s, "billing_status"), "overdue");
});

test("compareAttr: numeric attrs compare numerically", () => {
  const s = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 150000, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(compareAttr(s, "days_overdue", "gt", "7"), true);
  assert.equal(compareAttr(s, "days_overdue", "gt", "30"), false);
  assert.equal(compareAttr(s, "days_overdue", "lt", "30"), true);
  assert.equal(compareAttr(s, "days_overdue", "eq", "10"), true);
  assert.equal(compareAttr(s, "outstanding_amount", "gt", "0"), true);
});

test("compareAttr: text attrs compare as strings; empty/not_empty + missing", () => {
  const s = buildCollectionSnapshot({ dueDate: null, billingPrice: 0, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(compareAttr(s, "billing_status", "eq", "OVERDUE"), true);
  assert.equal(compareAttr(s, "billing_status", "contains", "due"), true);
  assert.equal(compareAttr(s, "last_payment_date", "empty", undefined), true);
  assert.equal(compareAttr(s, "billing_status", "not_empty", undefined), true);
  assert.equal(compareAttr(s, "invoice_due_date", "gt", "2026-01-01"), false); // null → false
});

test("compareAttr: unknown attr or unknown op → false", () => {
  const s = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 1, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(compareAttr(s, "nope" as any, "eq", "x"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/collectionMetrics.test.ts`
Expected: FAIL - module/functions not found.

- [ ] **Step 3: Write the module**

Create `shared/collectionMetrics.ts`:
```ts
/** Pure collection metrics - no I/O. Derives billing values used by the pipeline automation engine. */
import type { RuleConditionOp } from "./schema.js";

export type CollectionAttrKey =
  | "days_overdue" | "outstanding_amount" | "invoice_due_date"
  | "last_payment_date" | "billing_status";

export interface CollectionAttrMeta {
  key: CollectionAttrKey;
  label: string;
  valueType: "number" | "currency" | "date" | "text";
}

export const COLLECTION_ATTRS: CollectionAttrMeta[] = [
  { key: "days_overdue", label: "Hari Overdue", valueType: "number" },
  { key: "outstanding_amount", label: "Tagihan Outstanding", valueType: "currency" },
  { key: "invoice_due_date", label: "Jatuh Tempo", valueType: "date" },
  { key: "last_payment_date", label: "Pembayaran Terakhir", valueType: "date" },
  { key: "billing_status", label: "Status Billing", valueType: "text" },
];

/** Minimal customer billing shape (subset of the customers row). */
export interface BillingCustomer {
  dueDate?: string | null;
  billingPrice?: number | null;
  billingStatus?: string | null;
  lastPaymentDate?: string | null;
}

export interface CollectionSnapshot {
  daysOverdue: number;
  outstandingAmount: number;
  invoiceDueDate: string | null;
  lastPaymentDate: string | null;
  billingStatus: string | null;
}

export function isPaidStatus(status: string | null | undefined): boolean {
  const v = (status ?? "").trim().toLowerCase();
  return v === "lunas" || v === "paid";
}

/** floor((now - due)/day); 0 when no/invalid due date or not yet due. */
export function computeDaysOverdue(dueDate: string | null | undefined, nowMs: number): number {
  if (!dueDate) return 0;
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return 0;
  const days = Math.floor((nowMs - due) / 86400000);
  return days > 0 ? days : 0;
}

export function buildCollectionSnapshot(c: BillingCustomer, nowMs: number): CollectionSnapshot {
  const paid = isPaidStatus(c.billingStatus);
  return {
    daysOverdue: computeDaysOverdue(c.dueDate ?? null, nowMs),
    outstandingAmount: paid ? 0 : (c.billingPrice ?? 0),
    invoiceDueDate: c.dueDate ?? null,
    lastPaymentDate: c.lastPaymentDate ?? null,
    billingStatus: c.billingStatus ?? null,
  };
}

export function attrValue(snap: CollectionSnapshot, key: CollectionAttrKey): number | string | null {
  switch (key) {
    case "days_overdue": return snap.daysOverdue;
    case "outstanding_amount": return snap.outstandingAmount;
    case "invoice_due_date": return snap.invoiceDueDate;
    case "last_payment_date": return snap.lastPaymentDate;
    case "billing_status": return snap.billingStatus;
    default: return null;
  }
}

/** Compare a snapshot attr against a rule value using an existing RuleConditionOp.
 *  Numeric attrs compare numerically; date/text compare as strings (ISO dates sort chronologically). */
export function compareAttr(
  snap: CollectionSnapshot,
  key: CollectionAttrKey,
  op: RuleConditionOp,
  value: string | undefined,
): boolean {
  const meta = COLLECTION_ATTRS.find((a) => a.key === key);
  if (!meta) return false;
  const v = attrValue(snap, key);
  const target = (value ?? "").trim();
  if (op === "empty") return v == null || v === "";
  if (op === "not_empty") return !(v == null || v === "");
  if (v == null) return false;

  if (meta.valueType === "number" || meta.valueType === "currency") {
    const a = Number(v); const b = Number(target);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    switch (op) {
      case "eq": return a === b;
      case "neq": return a !== b;
      case "gt": return a > b;
      case "lt": return a < b;
      case "contains": return String(a).includes(target);
      default: return false;
    }
  }
  // date / text
  const sv = String(v);
  switch (op) {
    case "eq": return sv.toLowerCase() === target.toLowerCase();
    case "neq": return sv.toLowerCase() !== target.toLowerCase();
    case "contains": return sv.toLowerCase().includes(target.toLowerCase());
    case "gt": return sv > target;
    case "lt": return sv < target;
    default: return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/collectionMetrics.test.ts`
Expected: PASS (8 tests). Also `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/collectionMetrics.ts shared/collectionMetrics.test.ts
git commit -m "feat(collection): pure collectionMetrics (days_overdue, snapshot, compareAttr)"
```

---

## Task 2: Extend `RuleCondition` in `shared/schema.ts`

**Files:**
- Modify: `shared/schema.ts` (the `RuleCondition` type, ~line 757)

- [ ] **Step 1: Update the type**

Find (~line 757):
```ts
export type RuleCondition = { fieldId: number; op: RuleConditionOp; value?: string };
```
Replace with:
```ts
// `source` defaults to "field" (legacy rows have no source). "billing" rows use `attr` (a
// CollectionAttrKey) instead of `fieldId`; "stage" rows (other consumers) carry the stage id in `fieldId`.
export type RuleCondition = {
  source?: "field" | "stage" | "billing";
  fieldId?: number;
  attr?: string;
  op: RuleConditionOp;
  value?: string;
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: it may surface errors at `c.fieldId` usages in `server/pipeline-automation-helpers.ts` (fixed in Task 3). If the ONLY errors are there, that's expected - proceed. If errors appear elsewhere, note them; they are likely also `fieldId` reads to guard. Do not fix server eval here (Task 3 owns it).

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(collection): RuleCondition gains source + attr (billing conditions)"
```

---

## Task 3: Billing-aware parse + evaluate in `server/pipeline-automation-helpers.ts`

**Files:**
- Modify: `server/pipeline-automation-helpers.ts`

- [ ] **Step 1: Add the import**

At the top (after the existing `import type { ... } from "../shared/schema.js";`), add:
```ts
import { compareAttr, type CollectionSnapshot, type CollectionAttrKey } from "../shared/collectionMetrics.js";
```

- [ ] **Step 2: Update `evaluateConditions` (line ~51) to take a snapshot + handle billing**

Replace the whole function with:
```ts
export function evaluateConditions(
  conditions: RuleCondition[] | null,
  values: Map<number, string>,
  snapshot?: CollectionSnapshot | null,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => {
    if (c.source === "billing") {
      return snapshot ? compareAttr(snapshot, c.attr as CollectionAttrKey, c.op, c.value) : false;
    }
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
  });
}
```

- [ ] **Step 3: Update `evaluateConditionGroups` (line ~215) to pass the snapshot**

Replace with:
```ts
export function evaluateConditionGroups(
  groups: RuleCondition[][],
  values: Map<number, string>,
  snapshot?: CollectionSnapshot | null,
): boolean {
  if (groups.length === 0) return true;
  return groups.some((g) => evaluateConditions(g, values, snapshot));
}
```

- [ ] **Step 4: Relax the filters in `parseConditions` (~line 112) and `parseConditionGroups` (~line 199)**

In BOTH functions, replace the filter predicate
```ts
(c) => c && typeof c.fieldId === "number" && typeof c.op === "string"
```
with
```ts
(c) => c && typeof c.op === "string" && (typeof c.fieldId === "number" || (c.source === "billing" && typeof c.attr === "string"))
```

- [ ] **Step 5: Add a `conditionsUseBilling` helper (end of file)**

```ts
/** True if any condition group references a billing attr - gate the snapshot lookup. */
export function conditionsUseBilling(groups: RuleCondition[][]): boolean {
  return groups.some((g) => g.some((c) => c.source === "billing"));
}
```

- [ ] **Step 6: Write a focused test**

Create `server/pipeline-automation-helpers.collection.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConditionGroups, evaluateConditionGroups, conditionsUseBilling } from "./pipeline-automation-helpers.js";
import { buildCollectionSnapshot } from "../shared/collectionMetrics.js";

const NOW = Date.parse("2026-01-31T00:00:00Z");
const overdue40 = buildCollectionSnapshot({ dueDate: "2025-12-22", billingPrice: 100000, billingStatus: "overdue", lastPaymentDate: null }, NOW);

test("parseConditionGroups keeps billing rows", () => {
  const raw = JSON.stringify({ groups: [[{ source: "billing", attr: "days_overdue", op: "gt", value: "30" }]] });
  const groups = parseConditionGroups(raw);
  assert.equal(groups.length, 1);
  assert.equal(groups[0][0].attr, "days_overdue");
  assert.equal(conditionsUseBilling(groups), true);
});

test("evaluateConditionGroups: billing days_overdue > 30 passes with snapshot, fails without", () => {
  const groups = parseConditionGroups(JSON.stringify({ groups: [[{ source: "billing", attr: "days_overdue", op: "gt", value: "30" }]] }));
  assert.equal(evaluateConditionGroups(groups, new Map(), overdue40), true);
  assert.equal(evaluateConditionGroups(groups, new Map(), null), false); // no linked customer → no fire
});

test("field conditions still work (back-compat, no source)", () => {
  const groups = parseConditionGroups(JSON.stringify({ groups: [[{ fieldId: 5, op: "eq", value: "yes" }]] }));
  assert.equal(conditionsUseBilling(groups), false);
  assert.equal(evaluateConditionGroups(groups, new Map([[5, "yes"]])), true);
  assert.equal(evaluateConditionGroups(groups, new Map([[5, "no"]])), false);
});
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx tsx --test server/pipeline-automation-helpers.collection.test.ts`
Expected: PASS (3 tests).
Run: `npx tsc --noEmit` → 0 errors (the Task 2 fieldId errors here are now resolved).

- [ ] **Step 8: Commit**

```bash
git add server/pipeline-automation-helpers.ts server/pipeline-automation-helpers.collection.test.ts
git commit -m "feat(collection): billing-aware condition parse + evaluate (snapshot)"
```

---

## Task 4: Storage `getCardCollectionSnapshot`

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Add the import**

Near the other `../shared/*.js` imports at the top of `server/storage.ts`, add:
```ts
import { buildCollectionSnapshot, type CollectionSnapshot } from "../shared/collectionMetrics.js";
```
(`customers`, `and`, `eq`, and `getMitraId()` are already imported/used throughout this file - confirm with a quick grep before adding; do NOT duplicate.)

- [ ] **Step 2: Add the method to the `DatabaseStorage` class**

Place it near the other pipeline-card methods (anywhere inside the class):
```ts
  /** Live billing snapshot for a card via its linked customer (source_customer_id). null when unlinked. */
  async getCardCollectionSnapshot(cardId: number): Promise<CollectionSnapshot | null> {
    const card = await this.getCard(cardId);
    const custId = (card as any)?.sourceCustomerId;
    if (!card || !custId) return null;
    const rows = await this.db.select().from(customers)
      .where(and(eq(customers.id, custId), eq(customers.mitraId, getMitraId())));
    const c: any = (rows as any[])[0];
    if (!c) return null;
    return buildCollectionSnapshot(
      { dueDate: c.dueDate, billingPrice: c.billingPrice, billingStatus: c.billingStatus, lastPaymentDate: c.lastPaymentDate },
      Date.now(),
    );
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(collection): storage.getCardCollectionSnapshot (customer-derived snapshot)"
```

---

## Task 5: Wire the snapshot into the two eval sites in `server/pipeline-automation.ts`

**Files:**
- Modify: `server/pipeline-automation.ts`

- [ ] **Step 1: Import `conditionsUseBilling`**

Add `conditionsUseBilling` to the existing import from `./pipeline-automation-helpers.js` (the import block at the top that already lists `parseConditionGroups, evaluateConditionGroups`).

- [ ] **Step 2: `runRulesForCard` (~line 231) - fetch + pass snapshot**

Replace the conditions block:
```ts
    const groups = parseConditionGroups(rule.conditions);
    if (groups.length) {
      // Re-read per rule so a prior rule's set_field is visible to a later rule's condition
      // (preserves the original stage-enter behavior).
      const rec = await storage.getCardValues(card.id);
      const vals = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
      if (!evaluateConditionGroups(groups, vals)) continue;
    }
```
with:
```ts
    const groups = parseConditionGroups(rule.conditions);
    if (groups.length) {
      // Re-read per rule so a prior rule's set_field is visible to a later rule's condition
      // (preserves the original stage-enter behavior).
      const rec = await storage.getCardValues(card.id);
      const vals = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
      const snapshot = conditionsUseBilling(groups) ? await storage.getCardCollectionSnapshot(card.id) : null;
      if (!evaluateConditionGroups(groups, vals, snapshot)) continue;
    }
```

- [ ] **Step 3: Time-trigger path (~line 318) - fetch + pass snapshot**

Replace:
```ts
              if (groups.length && !evaluateConditionGroups(groups, values)) continue;
```
with:
```ts
              const snapshot = (groups.length && conditionsUseBilling(groups)) ? await storage.getCardCollectionSnapshot(card.id) : null;
              if (groups.length && !evaluateConditionGroups(groups, values, snapshot)) continue;
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(collection): pass collection snapshot to condition eval (stage_enter + time)"
```

---

## Task 6: `validateConditions` accepts billing rows - `server/routes.ts`

**Files:**
- Modify: `server/routes.ts` (`validateConditions`, ~line 4368)

- [ ] **Step 1: Add the import**

With the other `../shared/*.js` imports in `server/routes.ts`, add:
```ts
import { COLLECTION_ATTRS } from "../shared/collectionMetrics.js";
```

- [ ] **Step 2: Update `validateConditions`**

Replace the function body’s loop with billing-aware validation:
```ts
async function validateConditions(pipelineId: number, conditions: any): Promise<string | null> {
  if (conditions == null) return null;
  const groups: any[] | null = Array.isArray(conditions) ? [conditions]
    : (conditions && Array.isArray(conditions.groups)) ? conditions.groups
    : null;
  if (groups == null) return "conditions harus array atau {groups:[...]}";
  const ops = new Set(["eq", "neq", "contains", "gt", "lt", "empty", "not_empty"]);
  const attrKeys = new Set(COLLECTION_ATTRS.map((a) => a.key));
  const ids = new Set((await storage.listFields(pipelineId)).map((f) => f.id));
  for (const g of groups) {
    if (!Array.isArray(g)) return "Setiap grup syarat harus array";
    for (const c of g) {
      if (!c || typeof c.op !== "string" || !ops.has(c.op)) return "Operator kondisi tidak valid";
      if (c.source === "billing") {
        if (typeof c.attr !== "string" || !attrKeys.has(c.attr)) return "Atribut billing tidak valid";
        if (c.op !== "empty" && c.op !== "not_empty" && (c.value == null || String(c.value).trim() === "")) {
          return "Nilai syarat billing wajib diisi";
        }
      } else {
        if (typeof c.fieldId !== "number" || !ids.has(c.fieldId)) return "Kondisi merujuk field yang tidak ada di pipeline ini";
      }
    }
  }
  return null;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(collection): validateConditions accepts billing-source conditions"
```

---

## Task 7: UI - Billing source in `ConditionsBuilder` + `ruleFormState`

**Files:**
- Modify: `client/components/pipelines/ConditionsBuilder.tsx`
- Modify: `client/components/pipelines/ruleFormState.ts`

- [ ] **Step 1: Extend `DraftCondition` + import attrs (ConditionsBuilder.tsx)**

At the top, add:
```ts
import { COLLECTION_ATTRS } from "@shared/collectionMetrics";
```
Change the `DraftCondition` type to:
```ts
export type DraftCondition = { source?: "field" | "stage" | "billing"; fieldId: number | ""; attr?: string; op: RuleConditionOp; value: string };
```

- [ ] **Step 2: Always offer a source selector with Field + Billing (+ Stage when stages provided)**

In `ConditionsBuilder`, the source selector currently renders only when `hasStages`. Replace the `{hasStages && (<div className="w-24 shrink-0"><Combobox options={[field,stage]} .../></div>)}` block so the selector always renders and includes Billing:
```tsx
                  {/* Source selector - Field / Billing always; Stage only when stages provided */}
                  <div className="w-24 shrink-0">
                    <Combobox
                      options={[
                        { value: "field", label: "Field" },
                        ...(hasStages ? [{ value: "stage", label: "Stage" }] : []),
                        { value: "billing", label: "Billing" },
                      ]}
                      value={row.source ?? "field"}
                      onChange={(v) => {
                        const src = (v || "field") as "field" | "stage" | "billing";
                        if (src === "stage") setRow(gi, ri, { source: "stage", fieldId: "", attr: undefined, op: "eq", value: "" });
                        else if (src === "billing") setRow(gi, ri, { source: "billing", fieldId: "", attr: COLLECTION_ATTRS[0].key, op: "gt", value: "" });
                        else setRow(gi, ri, { source: "field", fieldId: "", attr: undefined, op: "eq", value: "" });
                      }}
                      clearable={false}
                    />
                  </div>
```
(Remove the old `{hasStages && (...)}` wrapper so the selector is unconditional.)

- [ ] **Step 3: Render the attr dropdown for billing rows**

Where the field dropdown renders for non-stage rows, gate it and add a billing branch. The current field block is:
```tsx
                  {!isStageRow && (
                    <div className="flex-1 min-w-[8rem]">
                      <Combobox options={fields.map((f) => ({ value: String(f.id), label: f.label }))} ... />
                    </div>
                  )}
```
Add `const isBillingRow = row.source === "billing";` near `isStageRow`, change the field block guard to `{!isStageRow && !isBillingRow && (...)}`, and add immediately after it:
```tsx
                  {isBillingRow && (
                    <div className="flex-1 min-w-[8rem]">
                      <Combobox
                        options={COLLECTION_ATTRS.map((a) => ({ value: a.key, label: a.label }))}
                        value={row.attr ?? ""}
                        onChange={(v) => setRow(gi, ri, { attr: v || undefined })}
                        placeholder="Atribut…" clearable={false}
                      />
                    </div>
                  )}
```
The operator `<Combobox>` and the value `<Input>` blocks already render for non-stage rows - they apply to billing rows too (billing is not a stage row), so leave them. (`opsForRow` should be the full `OPS` for billing - since `isStageRow` is false for billing, `opsForRow = OPS` already.)

- [ ] **Step 4: (De)serialise source/attr in `ruleFormState.ts`**

There are exactly **three** spots to change.

(a) **Read-back - two identical blocks** at ~line 158 and ~line 247 (both inside `ruleToDraft`). Each is:
```ts
    d.conditions = (r.conditions?.groups ?? []).map((g) =>
      g.map((c) => ({ fieldId: c.fieldId, op: c.op, value: c.value ?? "" })),
    );
```
Replace BOTH occurrences with:
```ts
    d.conditions = (r.conditions?.groups ?? []).map((g) =>
      g.map((c) => ({ source: ((c as any).source as DraftCondition["source"]) ?? "field", fieldId: typeof c.fieldId === "number" ? c.fieldId : "", attr: (c as any).attr, op: c.op, value: c.value ?? "" })),
    );
```

(b) **Serialise** - `draftToPayload`'s `conditionGroups` (~line 299), currently:
```ts
  const conditionGroups = d.conditions
    .map((g) =>
      g
        .filter((c) => c.fieldId !== "")
        .map((c) => ({ fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) })),
    )
    .filter((g) => g.length > 0);
```
Replace with (keeps billing rows - which have `fieldId === ""` - and emits source/attr):
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
`DraftCondition` is already imported at the top of `ruleFormState.ts`.

- [ ] **Step 5: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add client/components/pipelines/ConditionsBuilder.tsx client/components/pipelines/ruleFormState.ts
git commit -m "feat(collection): Billing condition source + attr picker in rule builder"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run everything**

Run:
```
npx tsc --noEmit
npm run build
npx tsx --test shared/collectionMetrics.test.ts
npx tsx --test server/pipeline-automation-helpers.collection.test.ts
```
Expected: 0 type errors; build OK; 8 + 3 tests pass.

- [ ] **Step 2: Commit (if any stray fixes were needed)**

```bash
git add -A && git commit -m "chore(collection): SP1 final verification" || echo "nothing to commit"
```

---

## Manual acceptance (on dev, pipeline 7 / JABNET)

> SP1 wires billing conditions into the **stage_enter/event** and **time-trigger** paths (the billing_sync periodic card-scan is SP3). Demonstrate via a time-triggered rule, which the worker evaluates per card.

1. Pipeline 7 → Otomasi → new rule: trigger **Waktu (time)**, anchor `card_created`, repeat every 1 day; condition **Billing → Hari Overdue (`days_overdue`) > 30**; action e.g. notify / move stage.
2. On the worker tick, the rule fires only for cards whose linked customer (`source_customer_id`) is >30 days overdue; cards without a linked customer don't fire (snapshot null).
3. Add a second condition **Billing → Tagihan Outstanding (`outstanding_amount`) > 0** - paid customers (outstanding 0) are excluded.
4. A `stage_enter` rule with a `days_overdue > 7` billing condition fires only for overdue cards when a card enters the trigger stage.

## Notes for the implementer
- Tenant isolation: `getCardCollectionSnapshot` scopes the customer lookup to `getMitraId()` - a card can never read another mitra's customer.
- Back-compat: legacy conditions (`{fieldId, op, value}`, no `source`) parse + evaluate exactly as before; `conditionsUseBilling` returns false so no extra customer lookup happens for non-collection rules.
