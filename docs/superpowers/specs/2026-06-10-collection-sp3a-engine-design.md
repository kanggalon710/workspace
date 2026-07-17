# Spec — SP3a: Collection Engine (config executor)

> Date: 2026-06-10 · Mitra-scoped · Sub-project 3a of the "Collection Parameters in Pipeline Engine" epic.
> Build on `dev`. Hybrid architecture. Depends on SP1 + SP2 (merged).
> Target: pipeline 7 "Penagihan (Collections)" for JABNET — built generically for all tenants.

## Goal

A per-tenant billing-sync phase that drives the collection card lifecycle from the SP2 config + SP1
snapshots: enter overdue customers into collection, age cards through stages by overdue, auto-write-off,
and close on payment. Also completes SP1's deferred `collection_status`/`writeoff_status` variables.

After SP3a, configuring a pipeline as a collection pipeline (SP2) makes it run automatically on each billing
sync — no per-rule wiring required for the common case.

## Decisions (confirmed in brainstorming)

1. **Dedicated engine, config-owned.** A new `runCollectionEngine()` phase runs for pipelines where
   `collection_config.enabled = 1`. For those pipelines the engine OWNS the card lifecycle (entry/aging/
   write-off/payment). The existing `runBillingIntakeRules` (Phase 4) stays for non-collection pipelines.
   A collection pipeline uses the config instead of a separate `billing_sync` intake rule (avoids double
   card creation).
2. **Entry modes implemented:** `create`, `create_if_not_exists`, `move`. (`reopen` → SP4 with cycles.)
3. **Engine moves fire stage-enter automations** (so the user's notify/linked/move rules still run). Loop-safe:
   the engine runs once per sync and mutates via storage directly; it dispatches stage-enter automations the
   same way the move endpoint does — it is not itself re-triggered.
4. **Per-card priority: pay > write-off > aging.**

## 1. Complete SP1 variables — `shared/collectionMetrics.ts` + storage

- Extend `COLLECTION_ATTRS` with two text attrs: `collection_status`, `writeoff_status`.
- `CollectionSnapshot` gains `collectionStatus: string | null` and `writeoffStatus: string | null`.
- A new pure helper `resolveCollectionStatus(cardStageId, cfg): { collectionStatus, writeoffStatus }`:
  - config disabled/absent → `{ collectionStatus: "none", writeoffStatus: "0" }`.
  - `cardStageId === cfg.writeoffStageId` → `{ "writeoff", "1" }`.
  - `cardStageId === cfg.paidStageId` → `{ "paid", "0" }`.
  - otherwise (any other stage of an enabled collection pipeline) → `{ "in_collection", "0" }`.
- `attrValue`/`compareAttr` already handle text attrs — they cover the two new keys once present on the
  snapshot.
- `getCardCollectionSnapshot(cardId)` (storage) additionally loads the card's pipeline `collection_config`
  and folds `resolveCollectionStatus(card.stageId, cfg)` into the returned snapshot. When the card has a
  customer but the pipeline has no/disabled config, status fields are `"none"`/`"0"` (still a valid snapshot).
  NOTE: this means a card with NO `sourceCustomerId` still returns `null` (unchanged); the status additions
  only enrich snapshots that already exist.

## 2. Pure decision module — `shared/collectionEngine.ts` (no I/O, unit-tested)

```ts
import { type CollectionSnapshot, isPaidStatus } from "./collectionMetrics.js";
import { type StageMapRow, stageForOverdue } from "./collectionConfig.js";

export interface EngineConfig {        // the subset of collection_config the engine needs
  enabled: boolean;
  entryThresholdDays: number;
  entryMode: string;                   // create | create_if_not_exists | move (reopen ignored here → SP4)
  entryStageId: number | null;
  paidStageId: number | null;
  writeoffThresholdDays: number | null;
  writeoffAction: string;              // move_stage | custom_rule
  writeoffStageId: number | null;
  writeoffRuleId: number | null;
}

export type EntryDecision = { create: boolean; moveExistingToEntry: boolean };
export function decideEntry(snapshot: CollectionSnapshot, cfg: EngineConfig, hasActiveCard: boolean): EntryDecision;
//  not enabled OR daysOverdue < threshold OR paid OR entryStageId == null → { false, false }
//  create               → { create: true, moveExistingToEntry: false }
//  create_if_not_exists → hasActiveCard ? { false, false } : { create: true, false }
//  move                 → hasActiveCard ? { false, moveExistingToEntry: true } : { create: true, false }

export type LifecycleAction = "pay" | "writeoff" | "age" | "none";
export interface LifecycleDecision { action: LifecycleAction; targetStageId: number | null; }
export function decideCardLifecycle(snapshot: CollectionSnapshot, cfg: EngineConfig, stageMap: StageMapRow[], cardStageId: number): LifecycleDecision;
//  priority pay > writeoff > age:
//  pay:      isPaidStatus(billingStatus) && paidStageId!=null && cardStageId!=paidStageId → { "pay", paidStageId }
//  writeoff: writeoffThresholdDays!=null && daysOverdue>=writeoffThresholdDays && cardStageId!=writeoffStageId:
//              action move_stage  → { "writeoff", writeoffStageId }   (writeoffStageId may be null → engine no-ops the move)
//              action custom_rule → { "writeoff", null }              (engine runs writeoffRuleId)
//  age:      const s = stageForOverdue(stageMap, daysOverdue); s!=null && s!=cardStageId → { "age", s }
//  else      { "none", null }
```
Tests (`shared/collectionEngine.test.ts`): `decideEntry` (disabled/below-threshold/paid → no-op; each of the
3 modes with/without an active card); `decideCardLifecycle` (pay wins over writeoff+age; writeoff move_stage
vs custom_rule; age via stageForOverdue; already-at-target → none; no-config write-off threshold → skips).

## 3. Storage — `server/storage.ts`

```ts
// ALL cards of a pipeline that carry a source_customer_id (one query; the engine derives the active vs
// terminal sets in memory using the config's paid/writeoff stage ids). Mitra-scoped.
getCardsWithCustomer(pipelineId: number): Promise<PipelineCard[]>;
```
Reuses existing: `getCollectionConfig` (SP2), `getCustomers`, `createCard`, `moveCard`, `getRuleById`/
`listRules`, `setCardValues`. All mitra-scoped. (If no `getRuleById` exists, the engine filters `listRules(P)`
by id — confirmed at plan time.)

## 4. Engine — `server/collection-engine.ts` → `runCollectionEngine()`

Runs in the current tenant context (like `runBillingIntakeRules`). Returns
`{ entered: number; aged: number; writtenOff: number; paidClosed: number }`.

```
for each pipeline P with collection_config.enabled = 1:
  cfg, stageMap = getCollectionConfig(P)
  if !cfg?.enabled: continue
  customers = getCustomers()                          // current tenant
  snapByCustomer = Map(customerId → buildCollectionSnapshot(customer, now))   // SP1 pure, no per-card DB
  allCards = getCardsWithCustomer(P)                  // every P card with a source_customer_id
  // "active" = not terminal (not at paid/writeoff stage) — used by the entry pass's hasActiveCard test
  activeByCustomer = Map(sourceCustomerId → card  for cards whose stageId ∉ {paidStageId, writeoffStageId})

  // (a) Lifecycle pass — over ALL cards-with-customer (includes paid/writeoff so a just-paid card can be re-evaluated)
  for card in allCards:
     snap = snapByCustomer.get(card.sourceCustomerId); if !snap: continue
     d = decideCardLifecycle(snap, cfg, stageMap, card.stageId)
     switch d.action:
        "pay"/"age":   moveCard(card, d.targetStageId); dispatch stage-enter automations; count
        "writeoff":    if move_stage && writeoffStageId: moveCard(...) + automations
                       else if custom_rule && writeoffRuleId: applyRuleActions(rule, card, systemUserId)
                          // rule fetched by id from listRules(P); applyRuleActions is the existing engine helper
                       count writtenOff
        "none":        nothing

  // (b) Entry pass — overdue customers without an active card
  for customer where snapshot.daysOverdue >= cfg.entryThresholdDays && !isPaid && !activeByCustomer.has(id):
     e = decideEntry(snap, cfg, /*hasActiveCard*/ false)
     if e.create: createCard(P, { stageId: entryStageId, title, sourceCustomerId }) ; dispatch stage-enter automations; entered++
     // move-mode with no active card already falls back to create inside decideEntry
```
Notes:
- The **lifecycle pass iterates ALL of P's cards-with-customer** (`getCardsWithCustomer`) so a card sitting at
  a Follow-Up stage whose customer just paid can be moved to the paid stage. The entry pass's `hasActiveCard`
  test uses the in-memory `activeByCustomer` set (cards not at paid/writeoff). One query, both sets derived.
- **Loop safety:** mutations are storage-direct; after each move/create the engine calls the SAME
  `runStageEnterAutomations(updatedCard, systemUserId)` the move endpoint uses. The engine is a once-per-sync
  pass and is never re-entered by those automations.
- **System actor** = userId 1 (audit-only `createdBy`/`updatedBy`), matching `runBillingIntakeRules`.
- A per-card try/catch so one bad card doesn't abort the pipeline's pass (partial success, logged).

## 5. Wire into `server/billing-sync-worker.ts`

After Phase 4 (`runBillingIntakeRules`), add **Phase 4b**:
```ts
try {
  const eng = await runCollectionEngine();
  (stats.transitions as any).collection_entered = eng.entered;
  (stats.transitions as any).collection_aged = eng.aged;
  (stats.transitions as any).collection_writeoff = eng.writtenOff;
  (stats.transitions as any).collection_paid = eng.paidClosed;
} catch (e: any) { console.error(`[BillingSyncWorker] collection-engine error:`, e.message); }
```

## 6. Testing
- `shared/collectionEngine.test.ts` + `collectionMetrics` status additions (`resolveCollectionStatus`) — `npx tsx --test`.
- Storage `getActiveCollectionCards`, engine glue, worker wiring: typecheck + build + manual on dev.

## 7. Manual acceptance (on dev, pipeline 7 / JABNET)
Pre: SP2 config set (entry 7d/create_if_not_exists/entry+paid stage; write-off 180d→Write Off; mapping 1–7→FU1 … 61–90→Isolir, 181–∞→Write Off).
1. A customer 10 days overdue, no card → after a billing "Sync Now", a collection card is created at the entry
   stage, then aged to the FU1/FU2 stage matching 10 days.
2. Customer ages to 20 days → next sync moves the card to the 15–30 stage (FU3). Stage-enter rules on that
   stage fire (e.g. notify).
3. Customer reaches 185 days → card moves to Write Off (or the custom rule runs).
4. Customer pays (billingStatus lunas) → next sync moves the card to the paid stage. Pay beats write-off/aging.
5. A rule with a `collection_status = in_collection` billing condition now evaluates (status resolved).
6. Non-collection pipeline (config disabled) → engine skips it; legacy intake unaffected.

## 8. Out of scope (→ later)
SP3b: custom collection triggers (`days_overdue > N → action`) firing via billing_sync rules on existing
cards (the flexible layer). SP4: `reopen` mode + `collection_cycle` (re-overdue after paid). SP5: dashboard.
