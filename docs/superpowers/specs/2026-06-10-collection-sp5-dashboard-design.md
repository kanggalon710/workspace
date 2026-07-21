# Spec - SP5: Collection Dashboard Metrics

> Date: 2026-06-10 · Mitra-scoped · Sub-project 5 of the collection epic. Build on `dev`.
> Depends on SP1-SP4 (merged). Design decided autonomously (user delegated continuous build).

## Goal

Expose collection metrics computed from the pipeline's collection cards + their customers' live billing,
and show them in a read-only metrics view. Lets Pipeline Collections eventually replace the legacy
`/collections` dashboard. Satisfies epic criterion #8.

## Decisions (autonomous)

1. **Pure aggregation** in `shared/collectionDashboard.ts` (no I/O, tested). A server gatherer feeds it cards
   + per-customer snapshots + config; an endpoint serves the result; a dialog renders it.
2. **Fixed aging bands** (standard, tenant-comparable): `0` (current), `1-7`, `8-30`, `31-60`, `61-90`, `90+`,
   over **active** cards (not at paid/writeoff stage) by `daysOverdue`. (Independent of the stage-mapping
   ranges, which are for routing, not reporting.)
3. **Metrics view** = a read-only `CollectionMetricsDialog` opened from the board ("Metrik" button), view-gated.

## 1. Pure module - `shared/collectionDashboard.ts` (tested)

```ts
export interface MetricsCard { stageId: number; sourceCustomerId: number | null; }
export interface MetricsSnapshot { daysOverdue: number; outstandingAmount: number; billingStatus: string | null; }
export interface AgingBucket { label: string; count: number; }
export interface CollectionMetrics {
  totalCards: number;
  activeCount: number;     // not at paid/writeoff stage
  paidCount: number;       // at paidStageId
  writeoffCount: number;   // at writeoffStageId
  totalOutstanding: number;// sum of outstandingAmount over ACTIVE cards
  successRate: number | null; // paid / (paid + writeoff); null when no terminal cards
  aging: AgingBucket[];    // fixed bands over active cards
  byStage: { stageId: number; label: string; count: number }[]; // all cards per stage
}

export function computeCollectionMetrics(input: {
  cards: MetricsCard[];
  snapshotByCustomer: Map<number, MetricsSnapshot>;
  paidStageId: number | null;
  writeoffStageId: number | null;
  stages: { id: number; label: string }[];
}): CollectionMetrics;
```
Bands: `daysOverdue===0 → "0"`, `1-7`, `8-30`, `31-60`, `61-90`, `>90 → "90+"`. A card with no snapshot
(customer missing) counts in totals/byStage but contributes 0 outstanding and is excluded from aging.

Tests: empty → zeros + successRate null; mixed cards (active/paid/writeoff) → correct counts, outstanding
sum over active only, successRate = paid/(paid+writeoff), aging band placement (boundary 7/8, 30/31, 90/91),
byStage labels.

## 2. Server gatherer - `server/collection-metrics.ts`
```ts
export async function getCollectionMetrics(pipelineId: number): Promise<CollectionMetrics>;
```
- `getCardsWithCustomer(pid)` → cards; `getCustomers()` → `buildCollectionSnapshot` per customer (map by id,
  taking `{daysOverdue, outstandingAmount, billingStatus}`); `getCollectionConfig(pid)` → paid/writeoff stage
  ids; `listStages(pid)` → labels. Call `computeCollectionMetrics`. Runs in current-tenant context.
- If the pipeline has no enabled config, still returns metrics (paid/writeoff null → all active; useful, no crash).

## 3. Endpoint - `server/routes.ts`
`GET /api/pipelines/:id/collection-metrics` - `requirePermission("pipelines")` + `requirePipelineView`
(read-level; metrics are observability). Returns `sendSuccess(res, metrics)`.

## 4. Client - hook + dialog
- `useCollectionMetrics(pipelineId)` (GET).
- `client/components/pipelines/CollectionMetricsDialog.tsx` (mobile-first, read-only):
  - StatTiles: Total Kartu, Aktif, Lunas, Write-Off, Outstanding (Rp), Success Rate (%). `accent`:
    active=info, lunas=success, writeoff=danger, outstanding=warning.
  - **Aging** section: horizontal bars (simple divs scaled to max bucket) per band with counts.
  - **Per-stage** section: list of stage → count.
  - Loading skeleton; EmptyState when totalCards = 0.
- Board: a "Metrik" button (view-gated: `can("view")` - or always, since the board itself requires view) +
  the dialog mount, mirroring the existing Field/Akses/Otomasi/Collection buttons.

## 5. Testing
`shared/collectionDashboard.test.ts` (the pure aggregation). Gatherer/endpoint/dialog: typecheck + build + manual.

## 6. Manual acceptance (dev, pipeline 7)
1. With collection cards present, open "Metrik" → tiles show total/active/paid/writeoff/outstanding/success rate.
2. Aging bars reflect the active cards' overdue distribution; per-stage list matches the board columns.
3. Pay/age some cards via Sync Now → reopen Metrik → numbers update.

## 7. Out of scope
SP3b (custom triggers). Time-series/history snapshots of metrics (kpi_snapshots-style) - current state only.
Replacing the legacy `/collections` dashboard wholesale.
