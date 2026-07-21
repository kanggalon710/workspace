# Spec - SP4: Collection Cycle + Reopen Mode

> Date: 2026-06-10 · Mitra-scoped · Sub-project 4 of the collection epic. Build on `dev`.
> Depends on SP1+SP2+SP3a (merged). Design decisions made autonomously (user delegated:
> "Lanjutkan terus sampai bisa buat alurnya").

## Goal

Clean re-overdue handling: label each collection card with a `collection_cycle` number (the Nth time
the customer entered collection in this pipeline), and implement the deferred `reopen` entry mode
(reactivate the last terminal card instead of creating a new one). Satisfies epic criterion #9.

Note: re-overdue already produces separate cards via SP3a's `create_if_not_exists` (a paid/written-off
card is terminal, so a fresh card is created when the customer re-overdues). SP4 adds the cycle *number*
(clean history label) and the `reopen` alternative.

## Decisions (autonomous)

1. **`collection_cycle int` (nullable) on `pipeline_cards`** - set by the engine on entry. NULL for
   non-collection / pre-SP4 cards.
2. **Cycle number = (count of prior cards for that customer in this pipeline) + 1**, computed in-memory
   from the `getCardsWithCustomer` list the engine already loads (no new query for counting).
3. **`reopen` mode**: overdue ≥ threshold, not paid, **no active card**, but a **terminal** (paid/writeoff)
   card exists → reactivate the most-recent terminal card (move to `entryStageId`, bump its
   `collection_cycle`). No active card AND no terminal card → fall back to `create`. An active card → no-op.
4. **Minimal UI**: show "Siklus #N" in the card detail when set.

## 1. Schema - `shared/schema.ts` + migration
- Add to `pipelineCards`: `collectionCycle: int("collection_cycle")` (nullable).
- Migration: add to the guarded `loyaltyColumnAdditions` array (info_schema COUNT check → `ALTER TABLE
  pipeline_cards ADD COLUMN collection_cycle INT`). Mirrors the existing guarded ADD COLUMN pattern (~line 700).

## 2. Pure - `shared/collectionEngine.ts` (extend + test)
```ts
export type EntryDecision = { create: boolean; moveExistingToEntry: boolean; reopenExisting: boolean };

// 4th param added (default false → existing 3-arg callers/tests unaffected).
export function decideEntry(snap, cfg, hasActiveCard, hasReopenableCard = false): EntryDecision;
//  no-op base now returns { create:false, moveExistingToEntry:false, reopenExisting:false }
//  create:               { create:true, ... }                       (still guarded vs active dup)
//  create_if_not_exists: hasActiveCard ? none : { create:true }
//  move:                 hasActiveCard ? { moveExistingToEntry:true } : { create:true }
//  reopen:               hasActiveCard ? none : hasReopenableCard ? { reopenExisting:true } : { create:true }

/** Cycle number for a new/reopened entry = prior card count + 1. */
export function nextCycleNumber(priorCardCount: number): number;  // priorCardCount + 1 (min 1)
```
All existing `decideEntry`/`decideCardLifecycle` tests keep passing (the extra return key + 4th param are
additive). New tests: `reopen` mode (active → none; terminal-exists → reopen; none → create); `nextCycleNumber`.

## 3. Storage - `server/storage.ts`
- `createCard` data param gains `collectionCycle?: number | null`; include it in the INSERT (column
  `collection_cycle`).
- `setCardCycle(cardId, cycle)` - `UPDATE pipeline_cards SET collection_cycle = ? WHERE id = ? AND mitra_id = ?`.
- `getCardsWithCustomer` already returns cards (now including `collectionCycle`).

## 4. Engine - `server/collection-engine.ts`
Entry pass changes:
```
priorCount = allCards.filter(c => c.sourceCustomerId === custId).length
terminalCards = allCards.filter(c => c.sourceCustomerId === custId && (stage ∈ {paid, writeoff}))
e = decideEntry(snap, cfg, activeByCustomer.has(custId), terminalCards.length > 0)
if e.create:
   createCard(pid, { stageId: entryStageId, title, sourceCustomerId, collectionCycle: nextCycleNumber(priorCount) }) + automations; entered++
else if e.reopenExisting:
   card = terminalCards sorted by id desc [0]
   moveCard(card.id, entryStageId); setCardCycle(card.id, (card.collectionCycle ?? priorCount) + 1); runStageEnterAutomations({...card, stageId: entryStageId}); entered++
else if e.moveExistingToEntry: (unchanged SP3a)
```
Lifecycle pass unchanged.

## 5. UI - card detail
`client/components/pipelines/CardDetailModal.tsx`: in the metadata area, when `card.collectionCycle` is set,
show a small line/badge "Siklus collection: #N". Requires the card GET to include `collectionCycle` (it's a
`pipeline_cards` column → already returned by the card query; confirm `CardDetail` type carries it, add if not).

## 6. Testing
Pure (`collectionEngine.test.ts`): reopen branch + nextCycleNumber. Storage/engine/UI: typecheck + build + manual.

## 7. Manual acceptance (dev, pipeline 7)
1. New overdue customer → card created with `collection_cycle = 1`.
2. Customer pays → card to paid stage. Customer re-overdues next period → (create_if_not_exists) a NEW card
   with `collection_cycle = 2`; card detail shows "Siklus #2".
3. Set entry mode = **reopen**; repeat: instead of a new card, the previous terminal card is moved back to the
   entry stage with its cycle bumped.

## 8. Out of scope
SP5 dashboard; SP3b custom triggers. Period-keyed auto-recurrence without a stage move (still the billing
new-card path).
