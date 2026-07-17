# SP3a — Collection Engine (config executor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Subagents: work DIRECTLY in this repo on branch `dev`. NO git worktrees, NO branch switches. Verify `git branch --show-current` is `dev` before committing.**

**Goal:** A per-tenant billing-sync phase `runCollectionEngine()` that drives the collection card lifecycle from the SP2 config + SP1 snapshots — entry (3 modes), aging→stage via `stageForOverdue`, auto write-off, payment-close — and completes SP1's `collection_status`/`writeoff_status`.

**Architecture:** Pure decision functions (`decideEntry`, `decideCardLifecycle`) + a pure status resolver, glued by a worker-side engine that mutates via storage and dispatches stage-enter automations (loop-safe; once per sync). Config-owned: only pipelines with `collection_config.enabled=1` are processed.

**Tech Stack:** TypeScript ESM, Drizzle/mysql2, the existing billing-sync worker + pipeline-automation helpers. Pure tests via `npx tsx --test`. Local imports use `.js`.

---

## File Structure
- **Modify** `shared/collectionMetrics.ts` (+test) — add `collection_status`/`writeoff_status` attrs + snapshot fields + `resolveCollectionStatus`.
- **Create** `shared/collectionEngine.ts` (+test) — `EngineConfig`, `decideEntry`, `decideCardLifecycle`.
- **Modify** `server/storage.ts` — extend `getCardCollectionSnapshot` (status), add `getCardsWithCustomer`, `listEnabledCollectionPipelineIds`.
- **Create** `server/collection-engine.ts` — `runCollectionEngine()`.
- **Modify** `server/billing-sync-worker.ts` — Phase 4b call.

---

## Task 1: Complete SP1 variables in `shared/collectionMetrics.ts`

**Files:** Modify `shared/collectionMetrics.ts`, `shared/collectionMetrics.test.ts`.

- [ ] **Step 1: Extend the test** — append to `shared/collectionMetrics.test.ts`:
```ts
import { resolveCollectionStatus } from "./collectionMetrics.js";

test("COLLECTION_ATTRS includes collection_status + writeoff_status", () => {
  const keys = COLLECTION_ATTRS.map((a) => a.key);
  assert.ok(keys.includes("collection_status"));
  assert.ok(keys.includes("writeoff_status"));
});

test("resolveCollectionStatus: disabled / writeoff / paid / in_collection", () => {
  assert.deepEqual(resolveCollectionStatus(5, { enabled: false, paidStageId: 2, writeoffStageId: 3 }), { collectionStatus: "none", writeoffStatus: "0" });
  assert.deepEqual(resolveCollectionStatus(3, { enabled: true, paidStageId: 2, writeoffStageId: 3 }), { collectionStatus: "writeoff", writeoffStatus: "1" });
  assert.deepEqual(resolveCollectionStatus(2, { enabled: true, paidStageId: 2, writeoffStageId: 3 }), { collectionStatus: "paid", writeoffStatus: "0" });
  assert.deepEqual(resolveCollectionStatus(9, { enabled: true, paidStageId: 2, writeoffStageId: 3 }), { collectionStatus: "in_collection", writeoffStatus: "0" });
});

test("buildCollectionSnapshot defaults status fields", () => {
  const s = buildCollectionSnapshot({ dueDate: null, billingPrice: 0, billingStatus: "overdue", lastPaymentDate: null }, Date.parse("2026-01-31T00:00:00Z"));
  assert.equal(s.collectionStatus, "none");
  assert.equal(s.writeoffStatus, "0");
});
```
(Add `buildCollectionSnapshot` to the existing import line in the test if not already imported.)

- [ ] **Step 2: Run to verify it fails** — `npx tsx --test shared/collectionMetrics.test.ts` → FAIL (resolveCollectionStatus missing, status fields missing).

- [ ] **Step 3: Edit `shared/collectionMetrics.ts`**

(a) Extend the key union:
```ts
export type CollectionAttrKey =
  | "days_overdue" | "outstanding_amount" | "invoice_due_date"
  | "last_payment_date" | "billing_status";
```
→
```ts
export type CollectionAttrKey =
  | "days_overdue" | "outstanding_amount" | "invoice_due_date"
  | "last_payment_date" | "billing_status" | "collection_status" | "writeoff_status";
```

(b) Append two entries to `COLLECTION_ATTRS` (before the closing `];`):
```ts
  { key: "collection_status", label: "Status Collection", valueType: "text" },
  { key: "writeoff_status", label: "Status Write-Off", valueType: "text" },
```

(c) Extend the `CollectionSnapshot` interface — add two fields before the closing `}`:
```ts
  collectionStatus: string | null;
  writeoffStatus: string | null;
```

(d) In `buildCollectionSnapshot`'s returned object, add the two defaults (before the closing `};`):
```ts
    collectionStatus: "none",
    writeoffStatus: "0",
```

(e) Extend `attrValue`'s switch — add before `default:`:
```ts
    case "collection_status": return snap.collectionStatus;
    case "writeoff_status": return snap.writeoffStatus;
```

(f) Add the pure resolver at the end of the file:
```ts
/** Card-stage + config → collection status. Used by getCardCollectionSnapshot (card context). */
export function resolveCollectionStatus(
  cardStageId: number,
  cfg: { enabled: boolean; paidStageId: number | null; writeoffStageId: number | null } | null,
): { collectionStatus: string; writeoffStatus: string } {
  if (!cfg || !cfg.enabled) return { collectionStatus: "none", writeoffStatus: "0" };
  if (cfg.writeoffStageId != null && cardStageId === cfg.writeoffStageId) return { collectionStatus: "writeoff", writeoffStatus: "1" };
  if (cfg.paidStageId != null && cardStageId === cfg.paidStageId) return { collectionStatus: "paid", writeoffStatus: "0" };
  return { collectionStatus: "in_collection", writeoffStatus: "0" };
}
```

- [ ] **Step 4: Run to verify passes** — `npx tsx --test shared/collectionMetrics.test.ts` → PASS (now 11 tests). `npx tsc --noEmit` → 0 errors. (NOTE: `getCardCollectionSnapshot` in storage builds via `buildCollectionSnapshot`, which now returns the two new fields with defaults — still type-correct. Task 2 overrides them with real values.)

- [ ] **Step 5: Commit**
```bash
git add shared/collectionMetrics.ts shared/collectionMetrics.test.ts
git commit -m "feat(collection): collection_status + writeoff_status attrs + resolveCollectionStatus"
```

---

## Task 2: Storage — snapshot status + card/pipeline queries

**Files:** Modify `server/storage.ts`.

- [ ] **Step 1: Extend `getCardCollectionSnapshot`** (currently builds from customer only). Replace the method body's `return buildCollectionSnapshot(...)` tail so it folds in the status. The current method ends:
```ts
    if (!c) return null;
    return buildCollectionSnapshot(
      { dueDate: c.dueDate, billingPrice: c.billingPrice, billingStatus: c.billingStatus, lastPaymentDate: c.lastPaymentDate },
      Date.now(),
    );
  }
```
Replace with:
```ts
    if (!c) return null;
    const snap = buildCollectionSnapshot(
      { dueDate: c.dueDate, billingPrice: c.billingPrice, billingStatus: c.billingStatus, lastPaymentDate: c.lastPaymentDate },
      Date.now(),
    );
    // Fold in card-stage-derived status from the pipeline's collection config (SP3a).
    const { config } = await this.getCollectionConfig((card as any).pipelineId);
    const status = resolveCollectionStatus((card as any).stageId, config ? { enabled: config.enabled === 1, paidStageId: config.paidStageId, writeoffStageId: config.writeoffStageId } : null);
    snap.collectionStatus = status.collectionStatus;
    snap.writeoffStatus = status.writeoffStatus;
    return snap;
  }
```
Add `resolveCollectionStatus` to the existing `from "../shared/collectionMetrics.js"` import (grep it; it already imports `buildCollectionSnapshot`).

- [ ] **Step 2: Add two query methods** to the `DatabaseStorage` class:
```ts
  /** All cards of a pipeline that carry a source_customer_id. Mitra-scoped. */
  async getCardsWithCustomer(pipelineId: number): Promise<PipelineCard[]> {
    const mid = getMitraId();
    const rows = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.pipelineId, pipelineId), eq(pipelineCards.mitraId, mid), isNotNull(pipelineCards.sourceCustomerId)));
    return rows as PipelineCard[];
  }

  /** Pipeline ids (current mitra) that have an ENABLED collection config. */
  async listEnabledCollectionPipelineIds(): Promise<number[]> {
    const mid = getMitraId();
    const rows = await this.db.select().from(collectionConfig)
      .where(and(eq(collectionConfig.mitraId, mid), eq(collectionConfig.enabled, 1)));
    return (rows as any[]).map((r) => r.pipelineId);
  }
```
`pipelineCards`, `collectionConfig`, `and`, `eq`, `getMitraId` are already imported. ADD `isNotNull` to the existing drizzle-orm import (grep `from "drizzle-orm"`; if `isNotNull` isn't there, add it).

- [ ] **Step 3: Verify** — `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**
```bash
git add server/storage.ts
git commit -m "feat(collection): snapshot status resolution + getCardsWithCustomer + listEnabledCollectionPipelineIds"
```

---

## Task 3: Pure engine decisions `shared/collectionEngine.ts`

**Files:** Create `shared/collectionEngine.ts`, `shared/collectionEngine.test.ts`.

- [ ] **Step 1: Write the failing test** — create `shared/collectionEngine.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideEntry, decideCardLifecycle, type EngineConfig } from "./collectionEngine.js";
import { buildCollectionSnapshot } from "./collectionMetrics.js";

const NOW = Date.parse("2026-01-31T00:00:00Z");
const snap = (opts: { due?: string | null; status?: string; price?: number }) =>
  buildCollectionSnapshot({ dueDate: opts.due ?? "2026-01-21", billingPrice: opts.price ?? 100000, billingStatus: opts.status ?? "overdue", lastPaymentDate: null }, NOW);

const cfg: EngineConfig = {
  enabled: true, entryThresholdDays: 7, entryMode: "create_if_not_exists", entryStageId: 10, paidStageId: 20,
  writeoffThresholdDays: 180, writeoffAction: "move_stage", writeoffStageId: 30, writeoffRuleId: null,
};
const stageMap = [
  { minOverdueDays: 1, maxOverdueDays: 7, stageId: 11, position: 0 },
  { minOverdueDays: 8, maxOverdueDays: 30, stageId: 12, position: 1 },
];

test("decideEntry: below threshold / paid / disabled → no-op", () => {
  assert.deepEqual(decideEntry(snap({ due: "2026-01-28" }), cfg, false), { create: false, moveExistingToEntry: false }); // 3 days
  assert.deepEqual(decideEntry(snap({ status: "lunas" }), cfg, false), { create: false, moveExistingToEntry: false });
  assert.deepEqual(decideEntry(snap({}), { ...cfg, enabled: false }, false), { create: false, moveExistingToEntry: false });
});

test("decideEntry: modes (10 days overdue)", () => {
  const s = snap({ due: "2026-01-21" }); // 10 days
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "create_if_not_exists" }, false), { create: true, moveExistingToEntry: false });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "create_if_not_exists" }, true), { create: false, moveExistingToEntry: false });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "create" }, true), { create: true, moveExistingToEntry: false });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "move" }, true), { create: false, moveExistingToEntry: true });
  assert.deepEqual(decideEntry(s, { ...cfg, entryMode: "move" }, false), { create: true, moveExistingToEntry: false }); // fallback create
});

test("decideCardLifecycle: pay > writeoff > age", () => {
  // paid customer at a follow-up stage → pay
  assert.deepEqual(decideCardLifecycle(snap({ status: "lunas" }), cfg, stageMap, 11), { action: "pay", targetStageId: 20 });
  // 200 days overdue, not at writeoff stage → writeoff (move_stage)
  assert.deepEqual(decideCardLifecycle(snap({ due: "2025-07-15" }), cfg, stageMap, 12), { action: "writeoff", targetStageId: 30 });
  // 200 days overdue, custom_rule → writeoff with null target
  assert.deepEqual(decideCardLifecycle(snap({ due: "2025-07-15" }), { ...cfg, writeoffAction: "custom_rule", writeoffRuleId: 5 }, stageMap, 12), { action: "writeoff", targetStageId: null });
  // 10 days overdue → age to stageMap 8-30 stage (12); from stage 11
  assert.deepEqual(decideCardLifecycle(snap({ due: "2026-01-21" }), cfg, stageMap, 11), { action: "age", targetStageId: 12 });
  // already at target age stage → none
  assert.deepEqual(decideCardLifecycle(snap({ due: "2026-01-21" }), cfg, stageMap, 12), { action: "none", targetStageId: null });
  // already at paid stage + paid → none (cardStageId == paidStageId)
  assert.deepEqual(decideCardLifecycle(snap({ status: "lunas" }), cfg, stageMap, 20), { action: "none", targetStageId: null });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx tsx --test shared/collectionEngine.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write `shared/collectionEngine.ts`**
```ts
/** Pure decision functions for the collection engine — no I/O. The worker-side engine applies these. */
import { type CollectionSnapshot, isPaidStatus } from "./collectionMetrics.js";
import { type StageMapRow, stageForOverdue } from "./collectionConfig.js";

export interface EngineConfig {
  enabled: boolean;
  entryThresholdDays: number;
  entryMode: string;                 // create | create_if_not_exists | move (reopen → SP4)
  entryStageId: number | null;
  paidStageId: number | null;
  writeoffThresholdDays: number | null;
  writeoffAction: string;            // move_stage | custom_rule
  writeoffStageId: number | null;
  writeoffRuleId: number | null;
}

export type EntryDecision = { create: boolean; moveExistingToEntry: boolean };

/** Whether/how to bring an overdue customer into collection. */
export function decideEntry(snap: CollectionSnapshot, cfg: EngineConfig, hasActiveCard: boolean): EntryDecision {
  const none = { create: false, moveExistingToEntry: false };
  if (!cfg.enabled || cfg.entryStageId == null) return none;
  if (isPaidStatus(snap.billingStatus)) return none;
  if (snap.daysOverdue < cfg.entryThresholdDays) return none;
  switch (cfg.entryMode) {
    case "create": return { create: true, moveExistingToEntry: false };
    case "move": return hasActiveCard ? { create: false, moveExistingToEntry: true } : { create: true, moveExistingToEntry: false };
    case "create_if_not_exists":
    default: return hasActiveCard ? none : { create: true, moveExistingToEntry: false };
  }
}

export type LifecycleAction = "pay" | "writeoff" | "age" | "none";
export interface LifecycleDecision { action: LifecycleAction; targetStageId: number | null }

/** What to do with an existing card this sync. Priority: pay > writeoff > age. */
export function decideCardLifecycle(snap: CollectionSnapshot, cfg: EngineConfig, stageMap: StageMapRow[], cardStageId: number): LifecycleDecision {
  if (!cfg.enabled) return { action: "none", targetStageId: null };
  // pay
  if (isPaidStatus(snap.billingStatus) && cfg.paidStageId != null && cardStageId !== cfg.paidStageId) {
    return { action: "pay", targetStageId: cfg.paidStageId };
  }
  // writeoff
  if (cfg.writeoffThresholdDays != null && snap.daysOverdue >= cfg.writeoffThresholdDays) {
    if (cfg.writeoffAction === "move_stage") {
      if (cfg.writeoffStageId != null && cardStageId !== cfg.writeoffStageId) return { action: "writeoff", targetStageId: cfg.writeoffStageId };
    } else if (cfg.writeoffAction === "custom_rule") {
      if (cfg.writeoffRuleId != null) return { action: "writeoff", targetStageId: null };
    }
  }
  // age
  const s = stageForOverdue(stageMap, snap.daysOverdue);
  if (s != null && s !== cardStageId) return { action: "age", targetStageId: s };
  return { action: "none", targetStageId: null };
}
```

- [ ] **Step 4: Run to verify passes** — `npx tsx --test shared/collectionEngine.test.ts` → PASS (3 tests). `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**
```bash
git add shared/collectionEngine.ts shared/collectionEngine.test.ts
git commit -m "feat(collection): pure engine decisions (decideEntry, decideCardLifecycle)"
```

---

## Task 4: Engine `server/collection-engine.ts`

**Files:** Create `server/collection-engine.ts`.

- [ ] **Step 1: Write the engine**
```ts
/** Collection engine — runs per billing sync (current tenant). Drives the card lifecycle from
 *  collection_config + SP1 snapshots. Loop-safe: mutates via storage, dispatches stage-enter automations
 *  once; never re-entered. NOT a route — called by the billing-sync worker inside withMitra. */
import { storage } from "./storage.js";
import { applyRuleActions, runStageEnterAutomations } from "./pipeline-automation.js";
import { buildCollectionSnapshot } from "../shared/collectionMetrics.js";
import { decideEntry, decideCardLifecycle, type EngineConfig } from "../shared/collectionEngine.js";
import type { PipelineCard } from "../shared/schema.js";

const SYSTEM_USER_ID = 1; // audit-only actor, matches runBillingIntakeRules

export async function runCollectionEngine(): Promise<{ entered: number; aged: number; writtenOff: number; paidClosed: number }> {
  const result = { entered: 0, aged: 0, writtenOff: 0, paidClosed: 0 };
  const pipelineIds = await storage.listEnabledCollectionPipelineIds();
  if (pipelineIds.length === 0) return result;

  const now = Date.now();
  const customers = await storage.getCustomers();
  const snapByCustomer = new Map<number, ReturnType<typeof buildCollectionSnapshot>>();
  for (const c of customers as any[]) {
    snapByCustomer.set(c.id, buildCollectionSnapshot({ dueDate: c.dueDate, billingPrice: c.billingPrice, billingStatus: c.billingStatus, lastPaymentDate: c.lastPaymentDate }, now));
  }

  for (const pid of pipelineIds) {
    try {
      const { config, stageMap } = await storage.getCollectionConfig(pid);
      if (!config || config.enabled !== 1) continue;
      const cfg: EngineConfig = {
        enabled: true,
        entryThresholdDays: config.entryThresholdDays,
        entryMode: config.entryMode,
        entryStageId: config.entryStageId,
        paidStageId: config.paidStageId,
        writeoffThresholdDays: config.writeoffThresholdDays,
        writeoffAction: config.writeoffAction,
        writeoffStageId: config.writeoffStageId,
        writeoffRuleId: config.writeoffRuleId,
      };
      const rules = cfg.writeoffAction === "custom_rule" && cfg.writeoffRuleId != null ? await storage.listRules(pid) : [];
      const allCards = await storage.getCardsWithCustomer(pid);
      const activeByCustomer = new Map<number, PipelineCard>();
      for (const card of allCards) {
        const sid = (card as any).stageId as number;
        if (sid !== cfg.paidStageId && sid !== cfg.writeoffStageId) {
          const cid = (card as any).sourceCustomerId as number;
          if (cid != null) activeByCustomer.set(cid, card);
        }
      }

      // (a) Lifecycle pass — all cards-with-customer
      for (const card of allCards) {
        const cid = (card as any).sourceCustomerId as number;
        const snap = snapByCustomer.get(cid);
        if (!snap) continue;
        try {
          const d = decideCardLifecycle(snap, cfg, stageMap as any, (card as any).stageId);
          if (d.action === "none") continue;
          if (d.action === "writeoff" && cfg.writeoffAction === "custom_rule") {
            const rule = rules.find((r) => r.id === cfg.writeoffRuleId);
            if (rule) { await applyRuleActions(rule, card, SYSTEM_USER_ID); result.writtenOff++; }
            continue;
          }
          if (d.targetStageId == null) continue;
          await storage.moveCard(card.id, d.targetStageId, undefined, SYSTEM_USER_ID);
          await runStageEnterAutomations({ ...(card as any), stageId: d.targetStageId }, SYSTEM_USER_ID);
          if (d.action === "pay") result.paidClosed++;
          else if (d.action === "writeoff") result.writtenOff++;
          else result.aged++;
        } catch (e: any) {
          console.warn(`[collection-engine] card ${card.id} lifecycle failed: ${e?.message}`);
        }
      }

      // (b) Entry pass — overdue customers without an active card
      if (cfg.entryStageId != null) {
        for (const c of customers as any[]) {
          const snap = snapByCustomer.get(c.id);
          if (!snap) continue;
          const e = decideEntry(snap, cfg, activeByCustomer.has(c.id));
          if (!e.create && !e.moveExistingToEntry) continue;
          try {
            if (e.create) {
              const created = await storage.createCard(pid, {
                stageId: cfg.entryStageId,
                title: c.name || c.customerId || `Pelanggan #${c.id}`,
                sourceCustomerId: c.id,
              } as any, SYSTEM_USER_ID);
              await runStageEnterAutomations(created as any, SYSTEM_USER_ID);
              activeByCustomer.set(c.id, created as any);
              result.entered++;
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
    } catch (e: any) {
      console.warn(`[collection-engine] pipeline ${pid} failed: ${e?.message}`);
    }
  }
  return result;
}
```
NOTE: confirm `storage.createCard(pipelineId, data, actorId)` returns the created card (it does — used by runBillingIntakeRules) and `storage.moveCard(cardId, toStageId, toPosition, actorId)` signature. `runStageEnterAutomations(card, actorId)` + `applyRuleActions(rule, card, actorId)` are exported from `./pipeline-automation.js` (verified).

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit**
```bash
git add server/collection-engine.ts
git commit -m "feat(collection): runCollectionEngine (lifecycle + entry passes, automation dispatch)"
```

---

## Task 5: Wire Phase 4b into `server/billing-sync-worker.ts`

**Files:** Modify `server/billing-sync-worker.ts`.

- [ ] **Step 1: Import**
With the other imports at the top, add:
```ts
import { runCollectionEngine } from "./collection-engine.js";
```

- [ ] **Step 2: Add Phase 4b**
Find the Phase 4 block ending (the `try { const intake = await runBillingIntakeRules(); ... } catch (e: any) { console.error(`[BillingSyncWorker] billing-intake error:`, e.message); }`). Add immediately AFTER that catch:
```ts
      // ── Phase 4b: Collection engine — config-driven lifecycle (entry/aging/writeoff/payment) ──
      try {
        const eng = await runCollectionEngine();
        (stats.transitions as any).collection_entered = eng.entered;
        (stats.transitions as any).collection_aged = eng.aged;
        (stats.transitions as any).collection_writeoff = eng.writtenOff;
        (stats.transitions as any).collection_paid = eng.paidClosed;
        if (eng.entered || eng.aged || eng.writtenOff || eng.paidClosed) {
          console.log(`[BillingSyncWorker] → collection-engine: entered=${eng.entered} aged=${eng.aged} writeoff=${eng.writtenOff} paid=${eng.paidClosed}`);
        }
      } catch (e: any) {
        console.error(`[BillingSyncWorker] collection-engine error:`, e.message);
      }
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit && npm run build` → 0 type errors; build OK.

- [ ] **Step 4: Commit**
```bash
git add server/billing-sync-worker.ts
git commit -m "feat(collection): run collection engine as billing-sync Phase 4b"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run everything**
```
npx tsc --noEmit
npm run build
npx tsx --test shared/collectionMetrics.test.ts
npx tsx --test shared/collectionEngine.test.ts
npx tsx --test shared/collectionConfig.test.ts
```
Expected: 0 type errors; build OK; all tests pass (collectionMetrics 11, collectionEngine 3, collectionConfig 4).

- [ ] **Step 2: Commit (if any stray fixes)**
```bash
git add -A && git commit -m "chore(collection): SP3a final verification" || echo "nothing to commit"
```

---

## Manual acceptance (on dev, pipeline 7 / JABNET)
Pre: SP2 config enabled (entry 7d / create_if_not_exists / entry+paid stages; write-off 180d → Write Off; mapping rows). Billing sync via "Sync Now".
1. Customer 10d overdue, no card → sync → card created at entry stage, then aged to the mapping stage for 10d.
2. Customer ages further → next sync moves card to the higher band; stage-enter rules fire.
3. Customer ≥185d → moves to Write Off (or custom rule runs).
4. Customer pays → next sync moves card to paid stage (pay beats writeoff/aging).
5. A rule with condition `collection_status = in_collection` now evaluates (status resolved on the card snapshot).
6. Pipeline with config disabled → engine skips it.

## Notes
- Loop-safety: engine mutates via storage then calls `runStageEnterAutomations`/`applyRuleActions` once; it is a single pass per sync, never re-entered.
- Entry cards get title + `sourceCustomerId` (no custom field seeding in SP3a — billing rule conditions read the live customer snapshot, not card fields).
- Tenant isolation: engine runs inside the worker's `withMitra` context; all storage calls are mitra-scoped.
