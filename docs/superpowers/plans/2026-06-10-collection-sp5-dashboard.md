# SP5 - Collection Dashboard Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> **Subagents: work DIRECTLY in this repo on branch `dev`. NO worktrees, NO branch switches. Verify `git branch --show-current` is `dev`.**

**Goal:** Compute collection metrics from pipeline cards + live billing, serve via a read endpoint, and show them in a read-only metrics dialog.

**Architecture:** Pure `computeCollectionMetrics` + a server gatherer + GET endpoint + a board dialog. Read-only; current-state (no history).

**Tech Stack:** TS ESM, Drizzle, React + StatTile/EmptyState. Pure tests via `npx tsx --test`. `.js` imports.

---

## Task 1: Pure `shared/collectionDashboard.ts`

**Files:** Create `shared/collectionDashboard.ts`, `shared/collectionDashboard.test.ts`.

- [ ] **Step 1: Test** - create `shared/collectionDashboard.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCollectionMetrics } from "./collectionDashboard.js";

const stages = [{ id: 10, label: "Follow Up 1" }, { id: 20, label: "Lunas" }, { id: 30, label: "Write Off" }];
const snap = (daysOverdue: number, outstandingAmount: number, billingStatus = "overdue") => ({ daysOverdue, outstandingAmount, billingStatus });

test("empty → zeros, successRate null", () => {
  const m = computeCollectionMetrics({ cards: [], snapshotByCustomer: new Map(), paidStageId: 20, writeoffStageId: 30, stages });
  assert.equal(m.totalCards, 0);
  assert.equal(m.activeCount, 0);
  assert.equal(m.successRate, null);
  assert.deepEqual(m.aging.map((b) => b.count), [0, 0, 0, 0, 0, 0]);
});

test("counts, outstanding (active only), successRate, aging bands, byStage", () => {
  const cards = [
    { stageId: 10, sourceCustomerId: 1 }, // active, 5 days, 100k
    { stageId: 10, sourceCustomerId: 2 }, // active, 40 days, 200k
    { stageId: 20, sourceCustomerId: 3 }, // paid
    { stageId: 30, sourceCustomerId: 4 }, // writeoff
    { stageId: 10, sourceCustomerId: 5 }, // active, 0 days (current), 50k
  ];
  const snapshotByCustomer = new Map<number, any>([
    [1, snap(5, 100000)], [2, snap(40, 200000)], [3, snap(0, 0, "lunas")], [4, snap(200, 500000)], [5, snap(0, 50000)],
  ]);
  const m = computeCollectionMetrics({ cards, snapshotByCustomer, paidStageId: 20, writeoffStageId: 30, stages });
  assert.equal(m.totalCards, 5);
  assert.equal(m.activeCount, 3);          // stage 10 ×3
  assert.equal(m.paidCount, 1);
  assert.equal(m.writeoffCount, 1);
  assert.equal(m.totalOutstanding, 350000); // 100k + 200k + 50k (active only)
  assert.equal(m.successRate, 0.5);          // 1 paid / (1 paid + 1 writeoff)
  // aging bands over active: [0]=1 (cust5), [1-7]=1 (cust1), [8-30]=0, [31-60]=1 (cust2), [61-90]=0, [90+]=0
  assert.deepEqual(m.aging.map((b) => [b.label, b.count]), [["0", 1], ["1-7", 1], ["8-30", 0], ["31-60", 1], ["61-90", 0], ["90+", 0]]);
  const fu1 = m.byStage.find((s) => s.stageId === 10);
  assert.equal(fu1?.count, 3);
  assert.equal(fu1?.label, "Follow Up 1");
});

test("card with missing snapshot: counted in totals/byStage, excluded from aging + outstanding", () => {
  const m = computeCollectionMetrics({ cards: [{ stageId: 10, sourceCustomerId: 99 }], snapshotByCustomer: new Map(), paidStageId: 20, writeoffStageId: 30, stages });
  assert.equal(m.totalCards, 1);
  assert.equal(m.activeCount, 1);
  assert.equal(m.totalOutstanding, 0);
  assert.deepEqual(m.aging.map((b) => b.count), [0, 0, 0, 0, 0, 0]);
});
```

- [ ] **Step 2: Run → fail** - `npx tsx --test shared/collectionDashboard.test.ts`.

- [ ] **Step 3: Write `shared/collectionDashboard.ts`**
```ts
/** Pure collection dashboard aggregation - no I/O. */

export interface MetricsCard { stageId: number; sourceCustomerId: number | null; }
export interface MetricsSnapshot { daysOverdue: number; outstandingAmount: number; billingStatus: string | null; }
export interface AgingBucket { label: string; count: number; }
export interface CollectionMetrics {
  totalCards: number;
  activeCount: number;
  paidCount: number;
  writeoffCount: number;
  totalOutstanding: number;
  successRate: number | null;
  aging: AgingBucket[];
  byStage: { stageId: number; label: string; count: number }[];
}

const BANDS: { label: string; test: (d: number) => boolean }[] = [
  { label: "0", test: (d) => d === 0 },
  { label: "1-7", test: (d) => d >= 1 && d <= 7 },
  { label: "8-30", test: (d) => d >= 8 && d <= 30 },
  { label: "31-60", test: (d) => d >= 31 && d <= 60 },
  { label: "61-90", test: (d) => d >= 61 && d <= 90 },
  { label: "90+", test: (d) => d > 90 },
];

export function computeCollectionMetrics(input: {
  cards: MetricsCard[];
  snapshotByCustomer: Map<number, MetricsSnapshot>;
  paidStageId: number | null;
  writeoffStageId: number | null;
  stages: { id: number; label: string }[];
}): CollectionMetrics {
  const { cards, snapshotByCustomer, paidStageId, writeoffStageId, stages } = input;
  const labelOf = new Map(stages.map((s) => [s.id, s.label]));
  const aging = BANDS.map((b) => ({ label: b.label, count: 0 }));
  const byStageMap = new Map<number, number>();

  let activeCount = 0, paidCount = 0, writeoffCount = 0, totalOutstanding = 0;
  for (const card of cards) {
    byStageMap.set(card.stageId, (byStageMap.get(card.stageId) ?? 0) + 1);
    const isPaid = paidStageId != null && card.stageId === paidStageId;
    const isWriteoff = writeoffStageId != null && card.stageId === writeoffStageId;
    if (isPaid) paidCount++;
    else if (isWriteoff) writeoffCount++;
    else {
      activeCount++;
      const snap = card.sourceCustomerId != null ? snapshotByCustomer.get(card.sourceCustomerId) : undefined;
      if (snap) {
        totalOutstanding += snap.outstandingAmount;
        const bi = BANDS.findIndex((b) => b.test(snap.daysOverdue));
        if (bi >= 0) aging[bi].count++;
      }
    }
  }
  const terminal = paidCount + writeoffCount;
  const successRate = terminal > 0 ? paidCount / terminal : null;
  const byStage = [...byStageMap.entries()].map(([stageId, count]) => ({ stageId, count, label: labelOf.get(stageId) ?? `Stage #${stageId}` }));
  return { totalCards: cards.length, activeCount, paidCount, writeoffCount, totalOutstanding, successRate, aging, byStage };
}
```

- [ ] **Step 4: Run → pass** - `npx tsx --test shared/collectionDashboard.test.ts` (3 tests). `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**
```bash
git add shared/collectionDashboard.ts shared/collectionDashboard.test.ts
git commit -m "feat(collection): pure dashboard metrics aggregation"
```

---

## Task 2: Server gatherer `server/collection-metrics.ts`

**Files:** Create `server/collection-metrics.ts`.

- [ ] **Step 1: Write**
```ts
/** Gather collection metrics for a pipeline (current tenant) - storage + the pure aggregator. */
import { storage } from "./storage.js";
import { buildCollectionSnapshot } from "../shared/collectionMetrics.js";
import { computeCollectionMetrics, type CollectionMetrics, type MetricsSnapshot } from "../shared/collectionDashboard.js";

export async function getCollectionMetrics(pipelineId: number): Promise<CollectionMetrics> {
  const now = Date.now();
  const [cardsRaw, customers, { config }, stagesRaw] = await Promise.all([
    storage.getCardsWithCustomer(pipelineId),
    storage.getCustomers(),
    storage.getCollectionConfig(pipelineId),
    storage.listStages(pipelineId),
  ]);
  const snapshotByCustomer = new Map<number, MetricsSnapshot>();
  for (const c of customers as any[]) {
    const s = buildCollectionSnapshot({ dueDate: c.dueDate, billingPrice: c.billingPrice, billingStatus: c.billingStatus, lastPaymentDate: c.lastPaymentDate }, now);
    snapshotByCustomer.set(c.id, { daysOverdue: s.daysOverdue, outstandingAmount: s.outstandingAmount, billingStatus: s.billingStatus });
  }
  const cards = (cardsRaw as any[]).map((c) => ({ stageId: c.stageId as number, sourceCustomerId: (c.sourceCustomerId ?? null) as number | null }));
  const stages = (stagesRaw as any[]).map((s) => ({ id: s.id as number, label: s.label as string }));
  return computeCollectionMetrics({ cards, snapshotByCustomer, paidStageId: config?.paidStageId ?? null, writeoffStageId: config?.writeoffStageId ?? null, stages });
}
```

- [ ] **Step 2: Verify** - `npx tsc --noEmit` → 0.

- [ ] **Step 3: Commit**
```bash
git add server/collection-metrics.ts
git commit -m "feat(collection): getCollectionMetrics gatherer"
```

---

## Task 3: Endpoint

**Files:** `server/routes.ts`.

- [ ] **Step 1: Import** - with other `./*.js` imports, add:
```ts
import { getCollectionMetrics } from "./collection-metrics.js";
```
- [ ] **Step 2: Endpoint** - place near the `/api/pipelines/:id/collection-config` GET (search for it). Add:
```ts
  router.get("/api/pipelines/:id/collection-metrics", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requirePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineView(req, res, pid))) return;
    const metrics = await getCollectionMetrics(pid);
    return sendSuccess(res, metrics);
  });
```
(`requirePermission`, `requirePipelineView`, `sendSuccess` all exist + in scope.)
- [ ] **Step 3: Verify** - `npx tsc --noEmit` → 0.
- [ ] **Step 4: Commit**
```bash
git add server/routes.ts
git commit -m "feat(collection): GET /api/pipelines/:id/collection-metrics"
```

---

## Task 4: Client hook + dialog + board button

**Files:** `client/hooks/usePipelines.ts`, create `client/components/pipelines/CollectionMetricsDialog.tsx`, `client/pages/PipelineBoardPage.tsx`.

- [ ] **Step 1: Hook** - append to `client/hooks/usePipelines.ts`:
```ts
export interface CollectionMetricsData {
  totalCards: number; activeCount: number; paidCount: number; writeoffCount: number;
  totalOutstanding: number; successRate: number | null;
  aging: { label: string; count: number }[];
  byStage: { stageId: number; label: string; count: number }[];
}
export function useCollectionMetrics(pipelineId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["/api/pipelines", pipelineId, "collection-metrics"],
    queryFn: () => api.get<CollectionMetricsData>(`/pipelines/${pipelineId}/collection-metrics`),
    enabled,
  });
}
```

- [ ] **Step 2: Dialog** - create `client/components/pipelines/CollectionMetricsDialog.tsx`:
```tsx
import { Database, Users, CheckCircle2, XCircle, Wallet, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { useCollectionMetrics } from "@/hooks/usePipelines";

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

export function CollectionMetricsDialog({ pipelineId, open, onClose }: { pipelineId: number; open: boolean; onClose: () => void }) {
  const { data: m, isLoading } = useCollectionMetrics(pipelineId, open);
  const maxAging = m ? Math.max(1, ...m.aging.map((b) => b.count)) : 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b shrink-0"><DialogTitle>Metrik Collection</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded bg-muted" />
          ) : !m || m.totalCards === 0 ? (
            <EmptyState icon={Database} title="Belum ada data collection" description="Belum ada kartu collection di pipeline ini." />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatTile icon={Database} label="Total Kartu" value={m.totalCards} accent="neutral" />
                <StatTile icon={Users} label="Aktif" value={m.activeCount} accent="info" />
                <StatTile icon={CheckCircle2} label="Lunas" value={m.paidCount} accent="success" />
                <StatTile icon={XCircle} label="Write-Off" value={m.writeoffCount} accent="danger" />
                <StatTile icon={Wallet} label="Outstanding" value={rupiah(m.totalOutstanding)} accent="warning" />
                <StatTile icon={TrendingUp} label="Success Rate" value={m.successRate == null ? "-" : `${Math.round(m.successRate * 100)}%`} accent="primary" />
              </div>

              <section>
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Aging (kartu aktif)</h4>
                <div className="space-y-1.5">
                  {m.aging.map((b) => (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs text-muted-foreground">{b.label}</span>
                      <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-primary/70" style={{ width: `${(b.count / maxAging) * 100}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums">{b.count}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Per Stage</h4>
                <ul className="space-y-1">
                  {m.byStage.map((s) => (
                    <li key={s.stageId} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.label}</span>
                      <span className="font-medium tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```
(Confirm `StatTile` is exported from `@/components/ui/stat-tile` and `EmptyState` from `@/components/ui/empty-state` - both exist; adapt the import names if the exports differ.)

- [ ] **Step 3: Board wiring** (`client/pages/PipelineBoardPage.tsx`):
  - Import: `import { CollectionMetricsDialog } from "@/components/pipelines/CollectionMetricsDialog";`
  - State: after `const [showCollection, setShowCollection] = useState(false);` add `const [showMetrics, setShowMetrics] = useState(false);`
  - Button: after the `{can("manage") && <Button ... setShowCollection(true)>Collection</Button>}` line add:
    ```tsx
    {can("manage") && <Button variant="outline" size="sm" onClick={() => setShowMetrics(true)}>Metrik</Button>}
    ```
  - Mount: after the `{showCollection && pid != null && (<CollectionParametersDialog .../>)}` block add:
    ```tsx
    {showMetrics && pid != null && (
      <CollectionMetricsDialog pipelineId={pid} open={showMetrics} onClose={() => setShowMetrics(false)} />
    )}
    ```

- [ ] **Step 4: Verify** - `npx tsc --noEmit && npm run build` → 0 type errors; build OK.
- [ ] **Step 5: Commit**
```bash
git add client/hooks/usePipelines.ts client/components/pipelines/CollectionMetricsDialog.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(collection): Collection metrics dialog + board button"
```

---

## Task 5: Final verification
- [ ] `npx tsc --noEmit && npm run build && npx tsx --test shared/collectionDashboard.test.ts` → green.
- [ ] `git add -A && git commit -m "chore(collection): SP5 final verification" || echo "nothing to commit"`

## Manual acceptance (dev, pipeline 7)
1. Board → "Metrik" → dialog shows tiles + aging bars + per-stage counts.
2. After Sync Now ages/pays cards → reopen Metrik → numbers update.
3. Empty pipeline → EmptyState.

## Notes
- Read-only, current-state. Tenant: all storage calls mitra-scoped; endpoint read+view gated.
- `getCustomers()` full fetch per call - fine at ~808; cache later if needed.
