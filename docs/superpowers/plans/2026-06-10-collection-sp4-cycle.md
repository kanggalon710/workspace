# SP4 - Collection Cycle + Reopen Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> **Subagents: work DIRECTLY in this repo on branch `dev`. NO worktrees, NO branch switches. Verify `git branch --show-current` is `dev`.**

**Goal:** Label collection cards with a `collection_cycle` number and implement the `reopen` entry mode (reactivate the last terminal card instead of creating a new one).

**Architecture:** Additive `collection_cycle` column on pipeline_cards; pure `decideEntry` gains a `reopen` branch + `reopenExisting` result + `nextCycleNumber`; the engine sets/bumps the cycle and reactivates terminal cards. Re-overdue already produces separate cards (SP3a) - this numbers them.

**Tech Stack:** Drizzle/mysql2, the SP3a engine, React. Pure tests via `npx tsx --test`. `.js` imports.

---

## Task 1: Schema + migration

**Files:** `shared/schema.ts`, `server/storage.ts`.

- [ ] **Step 1:** In `shared/schema.ts` `pipelineCards` table, add after `relationType: varchar("relation_type", { length: 16 }),`:
```ts
  collectionCycle: int("collection_cycle"),
```
- [ ] **Step 2:** In `server/storage.ts`, find the `loyaltyColumnAdditions` array (search `const loyaltyColumnAdditions`). Add an entry to it:
```ts
      { table: "pipeline_cards", column: "collection_cycle", ddl: "INT" },
```
(The existing loop runs an info_schema COUNT check then `ALTER TABLE ... ADD COLUMN ... <ddl>` - idempotent.)
- [ ] **Step 3:** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 4:** Commit:
```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(collection): add collection_cycle column to pipeline_cards"
```

---

## Task 2: Pure - reopen + nextCycleNumber

**Files:** `shared/collectionEngine.ts`, `shared/collectionEngine.test.ts`.

- [ ] **Step 1: Update the test** - replace the TWO existing `decideEntry` tests (`"decideEntry: below threshold / paid / disabled -> no-op"` and `"decideEntry: modes (10 days overdue)"`) with these (note every expected object now includes `reopenExisting`), and add a reopen test + nextCycleNumber test:
```ts
test("decideEntry: below threshold / paid / disabled -> no-op", () => {
  assert.deepEqual(decideEntry(snap({ due: "2026-01-28" }), cfg, false), { create: false, moveExistingToEntry: false, reopenExisting: false });
  assert.deepEqual(decideEntry(snap({ status: "lunas" }), cfg, false), { create: false, moveExistingToEntry: false, reopenExisting: false });
  assert.deepEqual(decideEntry(snap({}), { ...cfg, enabled: false }, false), { create: false, moveExistingToEntry: false, reopenExisting: false });
});

test("decideEntry: modes (10 days overdue)", () => {
  const s = snap({ due: "2026-01-21" });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "create_if_not_exists" }, false), { create: true, moveExistingToEntry: false, reopenExisting: false });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "create_if_not_exists" }, true), { create: false, moveExistingToEntry: false, reopenExisting: false });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "create" }, true), { create: false, moveExistingToEntry: false, reopenExisting: false });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "create" }, false), { create: true, moveExistingToEntry: false, reopenExisting: false });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "move" }, true), { create: false, moveExistingToEntry: true, reopenExisting: false });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "move" }, false), { create: true, moveExistingToEntry: false, reopenExisting: false });
});

test("decideEntry: reopen mode", () => {
  const s = snap({ due: "2026-01-21" });
  // active card → no-op
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "reopen" }, true, true), { create: false, moveExistingToEntry: false, reopenExisting: false });
  // no active, terminal exists → reopen
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "reopen" }, false, true), { create: false, moveExistingToEntry: false, reopenExisting: true });
  // no active, no terminal → fallback create
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "reopen" }, false, false), { create: true, moveExistingToEntry: false, reopenExisting: false });
});

test("nextCycleNumber", () => {
  assert.equal(nextCycleNumber(0), 1);
  assert.equal(nextCycleNumber(2), 3);
});
```
Add `nextCycleNumber` to the import line from `./collectionEngine.js`.

- [ ] **Step 2: Run → fail** - `npx tsx --test shared/collectionEngine.test.ts` → FAIL (reopenExisting key + nextCycleNumber missing).

- [ ] **Step 3: Edit `shared/collectionEngine.ts`** - replace the `EntryDecision` type + `decideEntry` with:
```ts
export type EntryDecision = { create: boolean; moveExistingToEntry: boolean; reopenExisting: boolean };

/** Whether/how to bring an overdue customer into collection. `hasReopenableCard` = a terminal
 * (paid/writeoff) card exists for this customer (used only by reopen mode). */
export function decideEntry(snap: CollectionSnapshot, cfg: EngineConfig, hasActiveCard: boolean, hasReopenableCard = false): EntryDecision {
  const none = { create: false, moveExistingToEntry: false, reopenExisting: false };
  if (!cfg.enabled || cfg.entryStageId == null) return none;
  if (isPaidStatus(snap.billingStatus)) return none;
  if (snap.daysOverdue < cfg.entryThresholdDays) return none;
  switch (cfg.entryMode) {
    // SP3a guards "create" against an active dup (engine polls). Per-cycle re-creation is via separate
    // terminal cards. Equivalent to create_if_not_exists until cycles diverge them.
    case "create": return hasActiveCard ? none : { create: true, moveExistingToEntry: false, reopenExisting: false };
    case "move": return hasActiveCard ? { create: false, moveExistingToEntry: true, reopenExisting: false } : { create: true, moveExistingToEntry: false, reopenExisting: false };
    case "reopen":
      if (hasActiveCard) return none;
      return hasReopenableCard
        ? { create: false, moveExistingToEntry: false, reopenExisting: true }
        : { create: true, moveExistingToEntry: false, reopenExisting: false };
    case "create_if_not_exists":
    default: return hasActiveCard ? none : { create: true, moveExistingToEntry: false, reopenExisting: false };
  }
}

/** Cycle number for a new/reopened entry = prior card count + 1 (min 1). */
export function nextCycleNumber(priorCardCount: number): number {
  return (priorCardCount > 0 ? priorCardCount : 0) + 1;
}
```
(Leave `decideCardLifecycle` unchanged.)

- [ ] **Step 4: Run → pass** - `npx tsx --test shared/collectionEngine.test.ts` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**
```bash
git add shared/collectionEngine.ts shared/collectionEngine.test.ts
git commit -m "feat(collection): reopen entry mode + nextCycleNumber (decideEntry)"
```

---

## Task 3: Storage - createCard cycle + setCardCycle

**Files:** `server/storage.ts`.

- [ ] **Step 1:** In `createCard`'s `data` param type (the long inline type), add `collectionCycle?: number | null;` (e.g. after `relationType?: string | null;`).
- [ ] **Step 2:** In `createCard`'s `.insert(pipelineCards).values({ ... })` object, add after `relationType: data.relationType ?? null,`:
```ts
      collectionCycle: data.collectionCycle ?? null,
```
- [ ] **Step 3:** Add a method to the class:
```ts
  /** Set/replace a card's collection cycle number. Mitra-scoped. */
  async setCardCycle(cardId: number, cycle: number): Promise<void> {
    const mid = getMitraId();
    await this.db.update(pipelineCards).set({ collectionCycle: cycle })
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mid)));
  }
```
- [ ] **Step 4:** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 5: Commit**
```bash
git add server/storage.ts
git commit -m "feat(collection): createCard accepts collectionCycle + setCardCycle"
```

---

## Task 4: Engine - cycle on entry + reopen branch

**Files:** `server/collection-engine.ts`.

- [ ] **Step 1:** Add `nextCycleNumber` to the import from `../shared/collectionEngine.js`.
- [ ] **Step 2:** Replace the entry pass (the `// (b) Entry pass` block). The current block computes `decideEntry(snap, cfg, activeByCustomer.has(c.id))` and handles create/move. Replace its body with:
```ts
      // (b) Entry pass - overdue customers per entry mode
      if (cfg.entryStageId != null) {
        for (const c of customers as any[]) {
          const snap = snapByCustomer.get(c.id);
          if (!snap) continue;
          const custCards = allCards.filter((card) => (card as any).sourceCustomerId === c.id);
          const terminalCards = custCards.filter((card) => {
            const sid = (card as any).stageId as number;
            return sid === cfg.paidStageId || sid === cfg.writeoffStageId;
          });
          const e = decideEntry(snap, cfg, activeByCustomer.has(c.id), terminalCards.length > 0);
          if (!e.create && !e.moveExistingToEntry && !e.reopenExisting) continue;
          try {
            if (e.create) {
              const created = await storage.createCard(pid, {
                stageId: cfg.entryStageId,
                title: c.name || c.customerId || `Pelanggan #${c.id}`,
                sourceCustomerId: c.id,
                collectionCycle: nextCycleNumber(custCards.length),
              } as any, SYSTEM_USER_ID);
              await runStageEnterAutomations(created as any, SYSTEM_USER_ID);
              activeByCustomer.set(c.id, created as any);
              result.entered++;
            } else if (e.reopenExisting) {
              const card = [...terminalCards].sort((a, b) => b.id - a.id)[0];
              if (card && (card as any).stageId !== cfg.entryStageId) {
                await storage.moveCard(card.id, cfg.entryStageId, undefined, SYSTEM_USER_ID);
                await storage.setCardCycle(card.id, (((card as any).collectionCycle as number | null) ?? custCards.length) + 1);
                await runStageEnterAutomations({ ...(card as any), stageId: cfg.entryStageId }, SYSTEM_USER_ID);
                activeByCustomer.set(c.id, card);
                result.entered++;
              }
            } else if (e.moveExistingToEntry) {
              const existing = activeByCustomer.get(c.id);
              if (existing && existing.stageId !== cfg.entryStageId) {
                await storage.moveCard(existing.id, cfg.entryStageId, undefined, SYSTEM_USER_ID);
                await runStageEnterAutomations({ ...(existing as any), stageId: cfg.entryStageId }, SYSTEM_USER_ID);
                result.entered++;
              }
            }
          } catch (e2: any) {
            console.warn(`[collection-engine] entry for customer ${c.id} failed: ${e2?.message}`);
          }
        }
      }
```
- [ ] **Step 3:** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 4: Commit**
```bash
git add server/collection-engine.ts
git commit -m "feat(collection): engine sets cycle on entry + reopen reactivates terminal card"
```

---

## Task 5: UI - show cycle in card detail

**Files:** `client/hooks/usePipelines.ts` (if `CardDetail` lacks the field), `client/components/pipelines/CardDetailModal.tsx`.

- [ ] **Step 1:** Confirm the card GET returns `collectionCycle`. Grep `client/hooks/usePipelines.ts` for the `CardDetail` type. If it doesn't include `collectionCycle`, add `collectionCycle?: number | null;` to it. (The server card query selects the pipeline_cards row, so the field is present in the response.)
- [ ] **Step 2:** In `CardDetailModal.tsx`, in the metadata grid area (near where "Dibuat:" is shown), add a conditional line:
```tsx
                {card.collectionCycle != null && (
                  <div className="col-span-2 text-[10px] text-muted-foreground">Siklus collection: #{card.collectionCycle}</div>
                )}
```
(Place it inside the metadata grid `<div className="grid grid-cols-2 gap-2">`, after the "Dibuat" cell.)
- [ ] **Step 3:** `npx tsc --noEmit && npm run build` → 0 type errors; build OK.
- [ ] **Step 4: Commit**
```bash
git add client/hooks/usePipelines.ts client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(collection): show collection cycle number in card detail"
```

---

## Task 6: Final verification
- [ ] `npx tsc --noEmit && npm run build && npx tsx --test shared/collectionEngine.test.ts` → 0 errors, build OK, all engine tests pass.
- [ ] `git add -A && git commit -m "chore(collection): SP4 final verification" || echo "nothing to commit"`

## Manual acceptance (dev, pipeline 7)
1. New overdue customer → card with `collection_cycle = 1`; card detail shows "Siklus #1".
2. Customer pays → paid stage; re-overdue → new card `collection_cycle = 2` (create_if_not_exists).
3. entry mode = reopen → re-overdue reactivates the terminal card (cycle bumped) instead of a new card.

## Notes
- Re-overdue producing separate cards already worked (SP3a); SP4 numbers them + adds reopen.
- Tenant: setCardCycle + createCard mitra-scoped; engine in withMitra.
