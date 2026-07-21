# Spec - MP1: Universal Pipeline Metrics (core)

> Date: 2026-06-10 · Mitra-scoped · Sub-project 1 of the Pipeline Metrics epic. Build on `dev`.
> Decomposition: MP1 core → MP2 time filters → MP3 formula builder → MP4 future data sources.

## Goal

Per-pipeline, fully configurable metrics shown as a strip between the pipeline description and the
filters, computed from cards via an aggregation engine with reusable WHERE-rules. Generalizes the
collection SP5 dashboard to every pipeline. Number / currency / percentage card types.

## Decisions (confirmed)
1. **MP1 includes the CRUD config UI** (not API-only).
2. **WHERE-rules reuse `ConditionsBuilder` + `RuleConditionGroup[]` + `evaluateConditionGroups`** (field-source
   conditions). **Stage filtering is via the metric's `stageIds` scope**, not conditions. Assignee/billing
   condition sources for metrics are an explicit later add.
3. **Universal strip; collection SP5 dialog stays intact.** The MP1 strip + its config dialog are generic for
   all pipelines; the existing collection "Metrik" dialog is untouched.
4. Time filters (MP2) and formula/ratio types (MP3) are out of MP1.

## 1. Schema - `shared/schema.ts` + migration

```ts
export const pipelineMetrics = mysqlTable("pipeline_metrics", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  icon: varchar("icon", { length: 48 }),                 // curated lucide key (see ICON set)
  color: varchar("color", { length: 16 }).notNull().default("primary"), // StatTile accent token
  type: varchar("type", { length: 16 }).notNull().default("number"),    // number | currency | percentage
  source: varchar("source", { length: 16 }).notNull().default("card_count"), // card_count | stage_count | field_agg
  aggregation: varchar("aggregation", { length: 16 }).notNull().default("count"), // count|sum|avg|min|max|distinct
  fieldId: int("field_id"),                              // for field_agg
  stageIds: text("stage_ids"),                           // JSON int[] scope; null/[] = all stages
  conditions: text("conditions"),                        // JSON RuleConditionGroup[] (WHERE)
  prefix: varchar("prefix", { length: 16 }),
  suffix: varchar("suffix", { length: 16 }),
  decimals: int("decimals"),
  position: int("position").notNull().default(0),
  visible: int("visible").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({ byPipeline: index("idx_pipeline_metrics_mitra_pipeline").on(t.mitraId, t.pipelineId, t.position) }));
export type PipelineMetric = typeof pipelineMetrics.$inferSelect;
```
Migration: `CREATE TABLE IF NOT EXISTS` in the startup block (mirrors the other pipeline tables).

## 2. Pure module - `shared/pipelineMetrics.ts` (tested)

```ts
export type MetricSource = "card_count" | "stage_count" | "field_agg";
export type MetricAggregation = "count" | "sum" | "avg" | "min" | "max" | "distinct";
export type MetricType = "number" | "currency" | "percentage";
export const METRIC_SOURCES: { source: MetricSource; label: string }[];
export const METRIC_AGGREGATIONS: { aggregation: MetricAggregation; label: string }[];
export const METRIC_TYPES: { type: MetricType; label: string }[];
export const METRIC_ICONS: string[];   // curated lucide keys: Database, Users, Wallet, Phone, BarChart3, AlertCircle, CheckCircle2, Calendar, TrendingUp, XCircle, Clock, Star
export const METRIC_COLORS: string[];  // StatTile accents: primary, success, warning, danger, info, violet, neutral

/** Aggregate a value list (raw strings/numbers; non-numeric→skipped for numeric aggs). */
export function aggregate(values: (string | number | null | undefined)[], agg: MetricAggregation): number;
//  count = number of non-empty values; distinct = distinct non-empty; sum/avg/min/max over numeric-parsed values (0 when none)

/** Format for display. currency→"Rp " + id-ID thousands (decimals default 0); percentage→value+"%"; number→id-ID.
 * prefix/suffix wrap the formatted number; decimals overrides default. */
export function formatMetricValue(value: number, opts: { type: MetricType; prefix?: string | null; suffix?: string | null; decimals?: number | null }): string;
```
Tests: `aggregate` (sum/avg/min/max numeric incl. non-numeric skipped; count non-empty; distinct); `formatMetricValue` (currency/percentage/number, prefix/suffix, decimals).

## 3. Server engine - `server/pipeline-metrics-engine.ts`

```ts
export interface MetricResult { id: number; name: string; description: string | null; icon: string | null; color: string; type: string; value: number; formatted: string; }
export async function computeAllPipelineMetrics(req, pipelineId): Promise<MetricResult[]>;
```
- Load metric defs (visible, ordered by position) for the pipeline (mitra-scoped).
- Load the **permission-filtered** card set: all pipeline cards passed through the requester's row-level
  `cardPassesFilter` (via `getCardFilterForRequest`) - so hidden cards never count (#14). Load card values.
- Per metric: `cards` filtered by `stageIds` scope (if set) + `conditions` via `evaluateConditionGroups`
  (field-source; pass the card's value map; no snapshot → billing conditions evaluate false, documented).
  Then by `source`: `card_count`/`stage_count` → matching-card count; `field_agg` → collect each matching
  card's `fieldId` value → `aggregate(..., aggregation)`. `formatMetricValue` for `formatted`.
- A per-metric try/catch → a broken metric yields value 0, never breaks the strip.

## 4. Endpoints (`server/routes.ts`)
- `GET /api/pipelines/:id/metrics` - `requirePermission("pipelines")` + `requirePipelineView`; returns
  `computeAllPipelineMetrics(req, pid)`.
- `GET /api/pipelines/:id/metric-defs` - same gate; returns raw defs (for the config dialog).
- `POST /api/pipelines/:id/metric-defs` - `manage`-gated; validate (enums; `fieldId` belongs to pipeline
  when field_agg; `stageIds` belong to pipeline; `conditions` via the existing `validateConditions`); insert.
- `PATCH /api/pipelines/:id/metric-defs/:metricId` - same validation; update.
- `DELETE /api/pipelines/:id/metric-defs/:metricId` - `manage`-gated; delete.

## 5. Client
- Hooks (`usePipelines.ts`): `usePipelineMetrics(pid)` (compute, for the strip), `useMetricDefs(pid)` +
  `useCreateMetricDef/useUpdateMetricDef/useDeleteMetricDef`.
- `client/components/pipelines/MetricsStrip.tsx` - board strip (between description & `BoardFilters`).
  Renders visible computed metrics as `StatTile`s (icon resolved from a lucide map, `accent` = color,
  value = `formatted`, description). Responsive grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`), mobile-first.
  Hidden entirely if there are no visible metrics AND the user lacks `manage`. When the user has `manage`, a
  small gear/"Kelola metrik" affordance at the strip end (or a "+ Tambah metrik" prompt when empty) opens the
  config dialog. (Does NOT collide with the collection SP5 "Metrik" button.)
- `client/components/pipelines/MetricsConfigDialog.tsx` - list + add/edit/delete; per-metric form:
  name, description, **icon picker** (METRIC_ICONS grid), **color picker** (METRIC_COLORS swatches), type,
  source, aggregation (shown for field_agg), field `Combobox` (field_agg), stage multi-select (scope),
  `ConditionsBuilder` (WHERE), prefix/suffix/decimals, position (reorder), visibility toggle. Mobile-first.
- `PipelineBoardPage.tsx`: render `<MetricsStrip pipelineId={pid} caps={...} />` between the header/description
  block and `<BoardFilters/>`; mount `MetricsConfigDialog` (opened from the strip).

## 6. Tenant / permission
All mitra-scoped. Defs CRUD `manage`-gated. Compute view-gated + row-level card filter applied (a user only
sees metrics computed over cards they may access).

## 7. Testing
`shared/pipelineMetrics.test.ts` (aggregate + formatMetricValue). Engine, endpoints, strip, dialog:
typecheck + build + manual on dev.

## 8. Manual acceptance (dev)
1. Pipeline (e.g. 7) → strip area shows "+ Tambah metrik" (manage) → open config → create: "Total Kartu"
   (card_count, number, icon Database), "Outstanding" (field_agg SUM of an Outstanding currency field, type
   currency), "Closing" (stage_count, stageIds=[WON]). Save.
2. Board shows the 3 metric tiles between description and filters, formatted (Rp…, counts), respecting order
   + visibility.
3. Add a WHERE condition (a custom field = X) → metric recomputes to the filtered count.
4. A role with a row-level card filter sees metric values computed only over its visible cards.
5. Edit/reorder/hide/delete metrics → strip updates. Other pipelines have their own independent metrics.

## 9. Out of scope (→ MP2/MP3/MP4)
Time filters + dynamic time context (MP2). Formula builder + ratio/formula card types (MP3). Non-card data
sources - activities/billing/customers/etc. (MP4). Assignee/billing condition sources for metric WHERE-rules.
