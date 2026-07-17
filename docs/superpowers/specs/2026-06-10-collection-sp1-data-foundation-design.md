# Spec — SP1: Collection Data Foundation (days_overdue & billing variables)

> Date: 2026-06-10 · Mitra-scoped · First sub-project of the "Collection Parameters in Pipeline Engine"
> epic. Build on `dev`. Hybrid architecture (config-driven engine + variables in the generic rule builder).
> Target context: pipeline 7 "Penagihan (Collections)" for JABNET — but built generically for all tenants.

## Goal

Let the pipeline automation engine read **live billing-derived values** for any collection card and use them
in rule conditions. This is the foundation the rest of the epic (SP2 config + stage mapping, SP3 engine
pass + triggers, SP4 cycles, SP5 dashboard) builds on.

After SP1, an admin can author a rule such as: *trigger = billing_sync, condition = `days_overdue` > 30 →
(any existing action)* — without any code. No new triggers or config UI yet (those are SP2/SP3).

## Scope

**In scope — customer-derived attributes** (resolved from `pipeline_cards.source_customer_id` → `customers`):
- `days_overdue` (number)
- `outstanding_amount` (currency)
- `invoice_due_date` (date)
- `last_payment_date` (date)
- `billing_status` (text)

**Deferred to SP2** (stage-derived, need the stage-role/mapping model that SP2 introduces):
- `collection_status`, `writeoff_status` — registered as known attr keys now, but evaluating them is SP2.

**Explicitly out of scope (later SPs):** stage-mapping range table, thresholds/entry-mode/write-off config,
the dedicated collection engine pass, new triggers (`days_overdue_reached`, `payment_received`, …),
`collection_cycle`, dashboard metrics, and materialising `days_overdue` as a visible field on the card face.

## Decisions (confirmed)

1. **Live virtual variables**, not stored card fields. The snapshot is computed on demand at rule-evaluation
   time (accurate, never stale). Showing the value on the card face is a later concern.
2. **Reuse the existing condition model.** The `ConditionsBuilder` already discriminates `source: "field" |
   "stage"`; add a third `source: "billing"`. No new rule-evaluation entry points.
3. **Customer is the source of truth.** `outstanding_amount = billingPrice`, except when the customer is paid
   (`billing_status` ∈ {`lunas`,`paid`} case-insensitive) → `0`.

## 1. Pure module — `shared/collectionMetrics.ts` (no I/O, unit-tested)

```ts
export type CollectionAttrKey =
  | "days_overdue" | "outstanding_amount" | "invoice_due_date"
  | "last_payment_date" | "billing_status";

export interface CollectionAttrMeta { key: CollectionAttrKey; label: string; valueType: "number" | "currency" | "date" | "text"; }
export const COLLECTION_ATTRS: CollectionAttrMeta[];   // the 5 above, Indonesian labels

/** Minimal customer billing shape this module needs (subset of the customers row). */
export interface BillingCustomer {
  dueDate?: string | null;          // due_date
  billingPrice?: number | null;     // billing_price
  billingStatus?: string | null;    // billing_status
  lastPaymentDate?: string | null;  // last_payment_date
}

export interface CollectionSnapshot {
  daysOverdue: number;
  outstandingAmount: number;
  invoiceDueDate: string | null;
  lastPaymentDate: string | null;
  billingStatus: string | null;
}

export function isPaidStatus(status: string | null | undefined): boolean;     // lunas | paid (case-insensitive, trimmed)
export function computeDaysOverdue(dueDate: string | null | undefined, nowMs: number): number; // floor((now-due)/day), 0 if none/invalid/not-yet-due
export function buildCollectionSnapshot(c: BillingCustomer, nowMs: number): CollectionSnapshot; // outstanding = paid ? 0 : (billingPrice ?? 0)

/** Resolve a snapshot attr to a comparable primitive. number/currency → number; date/text → string. */
export function attrValue(snap: CollectionSnapshot, key: CollectionAttrKey): number | string | null;

/** Compare an attr against a rule value with an existing RuleConditionOp. number attrs compare numerically;
 *  date/text compare as strings (date strings are ISO YYYY-MM-DD so lexical = chronological). empty/not_empty
 *  check null/"" . Mirrors the semantics of the existing field-condition evaluator. */
export function compareAttr(snap: CollectionSnapshot, key: CollectionAttrKey, op: RuleConditionOp, value: string | undefined): boolean;
```
`RuleConditionOp` is imported from `./schema.js` (existing: `eq|neq|contains|gt|lt|empty|not_empty`).

Tests (`shared/collectionMetrics.test.ts`): `computeDaysOverdue` (no due → 0; future due → 0; 10 days past → 10;
invalid → 0), `isPaidStatus` (lunas/PAID/" Lunas " true; "overdue"/null false), `buildCollectionSnapshot`
(paid → outstanding 0; unpaid → billingPrice; null price → 0), `compareAttr` (days_overdue gt/lt/eq numeric;
billing_status eq/contains string; empty/not_empty; date lexical gt).

## 2. Condition model extension — `shared/schema.ts`

Extend the condition type so a row can target a billing attr instead of a field:
```ts
export type RuleCondition = {
  source?: "field" | "stage" | "billing";   // default "field" (back-compat — existing rows have no source)
  fieldId?: number;                          // for source "field" (was required; now optional)
  attr?: CollectionAttrKey;                  // for source "billing"
  op: RuleConditionOp;
  value?: string;
};
```
Back-compat: rule conditions today persist as `{ fieldId, op, value }` with no `source` (the rules dialog
renders `ConditionsBuilder` without `stages`, so only field conditions exist on rules). Rows with no `source`
→ treated as `"field"`. SP1 adds the optional `source` + `attr`; the `"stage"` value already exists in the
shared `ConditionsBuilder` for other consumers and is left untouched here.

## 3. Engine — evaluator + snapshot wiring

### 3a. Evaluator (`server/pipeline-automation-helpers.ts`, where `evaluateConditionGroups` lives)
Add an optional snapshot parameter and resolve `billing` conditions through `compareAttr`:
```ts
export function evaluateConditionGroups(
  groups: RuleConditionGroup[],
  vals: Map<number, string>,
  snapshot?: CollectionSnapshot | null,
): boolean;
// per condition: source "billing" → (snapshot ? compareAttr(snapshot, c.attr, c.op, c.value) : false)
//                source "stage"/"field" (default) → existing field/stage logic, unchanged
```
A `billing` condition with no snapshot (card has no linked customer) evaluates **false** (rule simply doesn't fire).

### 3b. Snapshot provision (`server/pipeline-automation.ts`)
At the two rule-eval sites that build the field-value map before calling `evaluateConditionGroups`
(`runRulesForCard` ~line 231 and the time-trigger path ~line 304), also fetch the card's snapshot once:
```ts
const snapshot = await storage.getCardCollectionSnapshot(card.id);
... evaluateConditionGroups(groups, vals, snapshot) ...
```
Fetch only when at least one group has a `billing` condition (cheap guard to avoid a customer lookup on
every non-collection rule).

### 3c. Storage — `getCardCollectionSnapshot(cardId)`
```ts
async getCardCollectionSnapshot(cardId: number): Promise<CollectionSnapshot | null> {
  const card = await this.getCard(cardId);              // mitra-scoped
  if (!card?.sourceCustomerId) return null;
  const [cust] = await this.db.select().from(customers)
    .where(and(eq(customers.id, card.sourceCustomerId), eq(customers.mitraId, getMitraId())));
  if (!cust) return null;
  return buildCollectionSnapshot(cust, Date.now());
}
```
(`Date.now()` is fine in server runtime.) Mitra isolation: customer must be in the current mitra.

## 4. Server-side condition validation

Wherever rule conditions are validated/parsed on save (the rules POST/PATCH validator), accept `source:
"billing"` rows: require a valid `attr` ∈ `COLLECTION_ATTRS` keys and a valid `op`; `value` required unless
`op` ∈ {`empty`,`not_empty`}. Reject unknown attrs. Field/stage rows validated as today.

## 5. UI — `ConditionsBuilder.tsx` + `ruleFormState.ts`

- `ConditionsBuilder` gains a **"Billing"** source. The source selector must show even when no `stages` prop is
  passed (the rules dialog passes none) — so a `billing` option is always available; `stage` only when `stages`
  is provided (unchanged). In the rules dialog the row therefore offers **Field / Billing**.
- A `billing` row renders: source select + an **attr dropdown** (`COLLECTION_ATTRS` labels) + operator select +
  value input. Reuse the existing `OPS` operator list (harmless extras like `contains` on a number are fine).
- `DraftCondition` gains `source: "field" | "stage" | "billing"` and `attr?: CollectionAttrKey`.
- `ruleFormState.ts`: `draftToPayload` currently serialises `{ fieldId, op, value }` (drops source). Update it to
  emit `{ source, fieldId, attr, op, value }` (omit irrelevant keys per source); `ruleToDraft` reads `source`/
  `attr` back (defaulting `source` to `"field"`). Field-only rows still round-trip unchanged.

## 6. Testing

- `shared/collectionMetrics.test.ts` (above) — the pure core, run with `npx tsx --test`.
- Evaluator: extend the existing helper test (if any) or a focused test that `evaluateConditionGroups` returns
  true/false for a `billing` `days_overdue > 30` condition given a snapshot, and false when snapshot is null.
- Engine wiring, storage, validation, UI: typecheck + build + manual on dev (author a rule with a
  `days_overdue > N` condition on pipeline 7, run a billing sync, confirm it fires only for overdue cards).

## 7. Manual acceptance (on dev, pipeline 7 / JABNET)

1. Pipeline 7 → Otomasi → new rule: trigger `billing_sync`, condition **Billing → Hari Overdue (days_overdue)
   > 30**, action e.g. move to a stage / notify.
2. Trigger a billing sync. The rule fires only for collection cards whose linked customer is >30 days overdue;
   cards with no `sourceCustomerId` don't fire.
3. Add a second condition `outstanding_amount > 0` and confirm paid customers (outstanding 0) are excluded.

## 8. Out of scope (recap → next sub-projects)
SP2 config + stage-mapping table (+ `collection_status`/`writeoff_status`), SP3 dedicated engine pass + new
triggers, SP4 `collection_cycle`, SP5 dashboard, and on-card display of `days_overdue`.
