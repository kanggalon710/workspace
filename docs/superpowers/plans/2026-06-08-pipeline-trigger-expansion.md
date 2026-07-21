# Pipeline Trigger Expansion (Phase 2) - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add card-event automation triggers - `card_updated`, `assignee_changed`, `field_updated` - that fire on every occurrence, reusing the existing conditions + actions engine.

**Architecture:** A shared pure predicate (`eventRuleMatches`) decides which rules a card event hits. The automation service factors a `runRulesForCard(...)` core out of `runStageEnterAutomations` and adds `dispatchCardEvent(...)`. The card update + field-value routes dispatch events (loop-safe: events come only from user routes). Routes validate the new trigger config; `PipelineRulesDialog` exposes the new triggers.

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React. `.js` import extensions.

---

### Task 1: Shared pure predicate + catalog

**Files:**
- Create: `shared/pipelineEventTriggers.ts`
- Test: `shared/pipelineEventTriggers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/pipelineEventTriggers.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_TRIGGER_TYPES,
  isEventTriggerType,
  eventRuleMatches,
} from "./pipelineEventTriggers.js";

test("catalog has the 3 phase-2 event types", () => {
  assert.deepEqual(EVENT_TRIGGER_TYPES.map((t) => t.type).sort(),
    ["assignee_changed", "card_updated", "field_updated"]);
});

test("isEventTriggerType", () => {
  assert.equal(isEventTriggerType("card_updated"), true);
  assert.equal(isEventTriggerType("field_updated"), true);
  assert.equal(isEventTriggerType("stage_enter"), false);
  assert.equal(isEventTriggerType("time"), false);
});

test("wrong trigger type never matches", () => {
  assert.equal(eventRuleMatches({ triggerType: "card_updated", triggerConfig: null }, "field_updated"), false);
});

test("card_updated / assignee_changed always match their event", () => {
  assert.equal(eventRuleMatches({ triggerType: "card_updated", triggerConfig: null }, "card_updated"), true);
  assert.equal(eventRuleMatches({ triggerType: "assignee_changed", triggerConfig: null }, "assignee_changed"), true);
});

test("field_updated without fieldId matches any field change", () => {
  assert.equal(eventRuleMatches({ triggerType: "field_updated", triggerConfig: null }, "field_updated", { changedFieldIds: [7] }), true);
  assert.equal(eventRuleMatches({ triggerType: "field_updated", triggerConfig: '{}' }, "field_updated", { changedFieldIds: [7] }), true);
});

test("field_updated with fieldId matches only when that field changed", () => {
  const rule = { triggerType: "field_updated", triggerConfig: '{"fieldId":5}' };
  assert.equal(eventRuleMatches(rule, "field_updated", { changedFieldIds: [5, 9] }), true);
  assert.equal(eventRuleMatches(rule, "field_updated", { changedFieldIds: [9] }), false);
  assert.equal(eventRuleMatches(rule, "field_updated", { changedFieldIds: [] }), false);
  assert.equal(eventRuleMatches(rule, "field_updated", {}), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/pipelineEventTriggers.test.ts`
Expected: FAIL - module missing.

- [ ] **Step 3: Write the module**

Create `shared/pipelineEventTriggers.ts`:

```ts
/** Pure catalog + predicate for card-event automation triggers. No DB, no I/O. */

export type EventTriggerType = "card_updated" | "assignee_changed" | "field_updated";

export interface EventTriggerDef { type: EventTriggerType; label: string }

export const EVENT_TRIGGER_TYPES: EventTriggerDef[] = [
  { type: "card_updated", label: "Saat kartu diperbarui" },
  { type: "assignee_changed", label: "Saat assignee berubah" },
  { type: "field_updated", label: "Saat field berubah" },
];

const VALID = new Set(EVENT_TRIGGER_TYPES.map((t) => t.type));

export function isEventTriggerType(t: string): t is EventTriggerType {
  return VALID.has(t as EventTriggerType);
}

/** Does a rule fire for this card event?
 *  - type mismatch → false
 *  - field_updated: no configured fieldId → any field; else only when changedFieldIds includes it
 *  - card_updated / assignee_changed → always (the route decides when to dispatch) */
export function eventRuleMatches(
  rule: { triggerType: string; triggerConfig: string | null },
  eventType: string,
  ctx?: { changedFieldIds?: number[] },
): boolean {
  if (rule.triggerType !== eventType) return false;
  if (eventType === "field_updated") {
    let fieldId: number | null = null;
    if (rule.triggerConfig) {
      try { const c = JSON.parse(rule.triggerConfig); if (c && c.fieldId != null) fieldId = Number(c.fieldId); } catch { /* ignore */ }
    }
    if (fieldId == null) return true;
    return (ctx?.changedFieldIds ?? []).includes(fieldId);
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/pipelineEventTriggers.test.ts`
Expected: PASS - all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/pipelineEventTriggers.ts shared/pipelineEventTriggers.test.ts
git commit -m "feat(pipelines): pure event-trigger catalog + eventRuleMatches predicate"
```

---

### Task 2: Schema - extend RuleTriggerType

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Extend the union**

In `shared/schema.ts`, change:
```ts
export type RuleTriggerType = "stage_enter" | "time" | "billing_sync";
```
to:
```ts
export type RuleTriggerType = "stage_enter" | "time" | "billing_sync" | "card_updated" | "assignee_changed" | "field_updated";
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(pipelines): RuleTriggerType gains card-event types"
```

---

### Task 3: Engine - runRulesForCard + dispatchCardEvent

**Files:**
- Modify: `server/pipeline-automation.ts`

- [ ] **Step 1: Refactor `runStageEnterAutomations` and add `dispatchCardEvent`**

In `server/pipeline-automation.ts`, replace the existing `runStageEnterAutomations` function (the whole `export async function runStageEnterAutomations(...) { ... }` block) with:

```ts
/** Evaluate a set of rules against a card: conditions → actions.
 *  dedup=true keeps once-per-card behavior (stage_enter); dedup=false fires every time (events). */
async function runRulesForCard(
  rules: PipelineRule[],
  card: PipelineCard,
  actorId: number,
  opts: { dedup: boolean },
): Promise<void> {
  let vals: Map<number, string> | null = null;
  for (const rule of rules) {
    if (opts.dedup && await storage.hasRuleFired(rule.id, card.id)) continue;
    const groups = parseConditionGroups(rule.conditions);
    if (groups.length) {
      if (!vals) {
        const rec = await storage.getCardValues(card.id);
        vals = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
      }
      if (!evaluateConditionGroups(groups, vals)) continue;
    }
    const acted = await applyRuleActions(rule, card, actorId);
    if (opts.dedup && acted) await storage.recordRuleFire(rule.id, card.id);
  }
}

/**
 * Run "card entered stage" automations for a card. Best-effort: never throws to the caller.
 * Loop-safe: all mutations call storage directly and do NOT re-invoke this service.
 */
export async function runStageEnterAutomations(card: PipelineCard, actorId: number): Promise<void> {
  try {
    const rules = matchStageEnterRules(await storage.listRules(card.pipelineId), card.stageId);
    await runRulesForCard(rules, card, actorId, { dedup: true });
  } catch (e: any) {
    console.warn(`[automation] runStageEnterAutomations failed for card ${card?.id}: ${e?.message}`);
  }
}

/**
 * Dispatch a card event (card_updated | assignee_changed | field_updated) to matching rules.
 * Fires every occurrence (no dedup). Best-effort: never throws.
 * Loop-safe: only called from user-facing routes, never from automation's own mutations.
 */
export async function dispatchCardEvent(
  eventType: string,
  card: PipelineCard,
  actorId: number,
  ctx?: { changedFieldIds?: number[] },
): Promise<void> {
  try {
    const all = await storage.listRules(card.pipelineId);
    const matched = all.filter((r) => r.enabled === 1 && eventRuleMatches(r, eventType, ctx));
    await runRulesForCard(matched, card, actorId, { dedup: false });
  } catch (e: any) {
    console.warn(`[automation] dispatchCardEvent(${eventType}) failed for card ${card?.id}: ${e?.message}`);
  }
}
```

- [ ] **Step 2: Add the import**

At the top of `server/pipeline-automation.ts`, add (match the file's relative import style for shared modules):
```ts
import { eventRuleMatches } from "../shared/pipelineEventTriggers.js";
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(pipelines): runRulesForCard core + dispatchCardEvent (event triggers)"
```

---

### Task 4: Route hooks - dispatch card events

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Import `dispatchCardEvent`**

In `server/routes.ts`, the existing import is `import { runStageEnterAutomations } from "./pipeline-automation.js";`. Change it to also import the new function:
```ts
import { runStageEnterAutomations, dispatchCardEvent } from "./pipeline-automation.js";
```

- [ ] **Step 2: Dispatch from the card-update route**

In `server/routes.ts`, the `PATCH /api/pipelines/cards/:cardId` handler currently is:
```ts
    try {
      const card = await storage.updateCard(Number(req.params.cardId), req.body ?? {}, req.authUser!.id);
      await notifyPipelineCardWatchers(card.id, req.authUser!.id, "Kartu diperbarui", `Kartu "${card.title}" diperbarui`);
      sendSuccess(res, card);
    } catch (e: any) {
```
Replace those lines with (note `cardForGuard` is the pre-update card, already fetched above in the same handler):
```ts
    try {
      const card = await storage.updateCard(Number(req.params.cardId), req.body ?? {}, req.authUser!.id);
      await notifyPipelineCardWatchers(card.id, req.authUser!.id, "Kartu diperbarui", `Kartu "${card.title}" diperbarui`);
      await dispatchCardEvent("card_updated", card, req.authUser!.id);
      if (cardForGuard.assigneeId !== card.assigneeId) {
        await dispatchCardEvent("assignee_changed", card, req.authUser!.id);
      }
      sendSuccess(res, card);
    } catch (e: any) {
```

- [ ] **Step 3: Dispatch from the field-values route**

In `server/routes.ts`, the `PUT /api/pipelines/cards/:cardId/values` handler currently ends:
```ts
    await storage.setCardValues(cardId, values.map((v: any) => ({ fieldId: Number(v.fieldId), value: String(v.value ?? "") })));
    sendSuccess(res, { ok: true });
  });
```
Replace with:
```ts
    await storage.setCardValues(cardId, values.map((v: any) => ({ fieldId: Number(v.fieldId), value: String(v.value ?? "") })));
    const changedFieldIds = values.map((v: any) => Number(v.fieldId)).filter((n: number) => Number.isInteger(n));
    await dispatchCardEvent("field_updated", card, req.authUser!.id, { changedFieldIds });
    sendSuccess(res, { ok: true });
  });
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): dispatch card_updated/assignee_changed/field_updated events"
```

---

### Task 5: Routes - validation + triggerConfig persistence

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Validate the new trigger types**

In `server/routes.ts`, inside `validateTriggerConfig`, add a branch BEFORE the `if (triggerType !== "time") return "triggerType tidak dikenal";` line (i.e. next to the `billing_sync` branch):

```ts
  if (triggerType === "card_updated" || triggerType === "assignee_changed") {
    return null; // no config required
  }
  if (triggerType === "field_updated") {
    const c = triggerConfig;
    if (c && c.fieldId != null) {
      const fields = await storage.listFields(pipelineId);
      if (!fields.some((f) => f.id === Number(c.fieldId))) return "field_updated: fieldId bukan field pipeline ini";
    }
    return null;
  }
```

- [ ] **Step 2: Persist triggerConfig for field_updated on create**

In `server/routes.ts`, the rule CREATE handler builds `storage.createRule(pid, { ... triggerConfig: (b.triggerType === "time" || b.triggerType === "billing_sync") ? (b.triggerConfig ?? null) : null, ... })`. Change that ternary to include `field_updated`:
```ts
      triggerConfig: (b.triggerType === "time" || b.triggerType === "billing_sync" || b.triggerType === "field_updated") ? (b.triggerConfig ?? null) : null,
```
(The UPDATE handler already keeps `triggerConfig` for any non-`stage_enter` trigger - `b.triggerType === "stage_enter" ? null : b.triggerConfig` - so no change there.)

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): validate card-event triggers + persist field_updated config"
```

---

### Task 6: Frontend - new trigger options in PipelineRulesDialog

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`
- Modify: `client/components/pipelines/ruleFormState.ts`

**Context:** READ both files first. The dialog already supports `stage_enter`, `time`, `billing_sync` trigger types with a trigger-type selector, conditional sub-forms, and shared conditions + actions editors. `ruleFormState.ts` has `RuleDraft`, `emptyDraft`, `ruleToDraft`, `draftToPayload`. Add the 3 event triggers, reusing the existing conditions + actions editors (which already render for `stage_enter`). Only `field_updated` needs an extra control: an optional field picker.

The payload sent to the rule create/update mutation for an event trigger:
```ts
{
  name,
  triggerType: "card_updated" | "assignee_changed" | "field_updated",
  conditions,                 // reuse existing conditions builder
  actions,                    // reuse existing actions editor (>=1 action required, same as stage_enter)
  triggerConfig: triggerType === "field_updated" ? { fieldId: <number|null> } : undefined,
}
```

- [ ] **Step 1: Add the three options to the trigger-type selector**

In `PipelineRulesDialog.tsx`, import the catalog and add its entries to the trigger-type select options (alongside the existing stage_enter/time/billing_sync options):
```tsx
import { EVENT_TRIGGER_TYPES } from "@shared/pipelineEventTriggers";
// ...in the options array for the trigger-type selector, append:
//   ...EVENT_TRIGGER_TYPES.map((t) => ({ value: t.type, label: t.label }))
```

- [ ] **Step 2: Field picker for field_updated**

Add form state for the optional field id (in `ruleFormState.ts` `RuleDraft` add `fieldUpdatedFieldId: string` defaulted to `""`, hydrate in `ruleToDraft` from `r.triggerConfig?.fieldId`, and in `draftToPayload` for `field_updated` set `triggerConfig: { fieldId: d.fieldUpdatedFieldId ? Number(d.fieldUpdatedFieldId) : null }`). In `PipelineRulesDialog.tsx`, when `triggerType === "field_updated"`, render a field `<select>`/`Combobox` over the pipeline `fields` with an "Semua field" (empty) option, bound to that state. Mirror the existing stage/field pickers' markup.

- [ ] **Step 3: Gate the conditional sub-forms correctly**

Ensure the `stage_enter`-specific stage picker only shows for `stage_enter`, the `time` sub-form only for `time`, the `billing_sync` sub-form only for `billing_sync`, and the conditions + actions editors render for the event triggers (they should, since the existing gate likely already shows them for non-`billing_sync`; confirm and adjust so `card_updated`/`assignee_changed`/`field_updated` show conditions + actions). The `triggerSummary` helper should produce a sensible string for the new types (e.g. the `EVENT_TRIGGER_TYPES` label).

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx client/components/pipelines/ruleFormState.ts
git commit -m "feat(pipelines): card-event trigger options in PipelineRulesDialog"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests** - Run: `npx tsx --test shared/pipelineEventTriggers.test.ts` → all PASS.
- [ ] **Step 2: Typecheck** - Run: `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** - Run: `npm run build` → success.
- [ ] **Step 4: Wiring** - Run: `grep -rln "dispatchCardEvent\|eventRuleMatches\|field_updated" server/ shared/ client/ | sort` → expect engine, routes, shared module + test, dialog.

---

## Self-Review

- **Spec coverage:** 3 event triggers → Task 1 catalog + Task 2 union. Fire-every-occurrence + dedup core → Task 3 (`runRulesForCard` `{dedup:false}` for events, `{dedup:true}` for stage_enter). Dispatch hooks (update → card_updated/assignee_changed; values → field_updated with changedFieldIds) → Task 4. field_updated optional field filter → Task 1 predicate + Task 5 validation + Task 6 picker. Create-handler triggerConfig fix → Task 5 Step 2. Frontend → Task 6. Tests → Task 1 + Task 7. Loop-safety → events dispatched only from routes (Task 4). All covered.
- **Placeholders:** Tasks 1-5 + 7 are complete code. Task 6 integrates into the existing large dialog with concrete payload + state guidance and instructs reading the file - appropriate for that component.
- **Type consistency:** `EVENT_TRIGGER_TYPES`/`isEventTriggerType`/`eventRuleMatches` (Task 1) used in Task 3 (`dispatchCardEvent` filter) and Task 6 (options). `RuleTriggerType` extended (Task 2) before routes/dialog use the new values. `runRulesForCard(rules, card, actorId, {dedup})` defined and called consistently in Task 3. `dispatchCardEvent(eventType, card, actorId, ctx?)` signature identical in Task 3 (def) and Task 4 (calls). `ctx.changedFieldIds` shape matches between Task 1 predicate, Task 3 dispatch, and Task 4 route.

## Deploy note
No schema/table changes (only a TS union widening + behavior). Purely additive; existing rules and triggers are unaffected. Event triggers fire only once a tenant creates a rule with one of the new trigger types.
