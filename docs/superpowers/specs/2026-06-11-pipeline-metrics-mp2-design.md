# Spec — MP2: Pipeline Metric Time Filters

> Date: 2026-06-11 · Mitra-scoped · Sub-project 2 of the Pipeline Metrics epic. Build on `dev`.
> Depends on MP1 (merged). Design decided autonomously (user delegated continuous build).

## Goal

Give each metric a time window (today / 7d / 30d / this-month / custom …) driven by a chosen date, and a
**dynamic time-context selector** on the board strip that re-scopes the time-aware metrics on the fly.
Satisfies epic criteria #8, #10, #11.

## Decisions (confirmed)
1. **Strip context overrides only time-aware metrics** (`timeField != "none"`). Timeless metrics
   (`timeField = "none"`, e.g. "Total Kartu") are unaffected — they stay all-time.
2. **New metrics default `timeField = "none"`** → existing MP1 metrics behave exactly as before.

## 1. Schema — add 4 columns to `pipeline_metrics`
Via the guarded `loyaltyColumnAdditions` array (info_schema COUNT check → `ALTER TABLE ADD COLUMN`):
- `time_field VARCHAR(24)` (null/"none" = timeless; "created" | "updated" | "field:<fieldId>")
- `time_preset VARCHAR(16)` (default null → treated as "all")
- `time_from TEXT`, `time_to TEXT` (for "custom")
Add the matching columns to the `pipelineMetrics` Drizzle table: `timeField`, `timePreset`, `timeFrom`, `timeTo`.

## 2. Pure module — `shared/metricTimeWindow.ts` (tested)
```ts
export type TimePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "this_year" | "custom";
export const TIME_PRESETS: { preset: TimePreset; label: string }[];   // Indonesian labels
export interface TimeWindow { fromMs: number; toMs: number; }
/** null = all-time (no filtering). nowMs injected for testability; boundaries use the runtime's local time. */
export function resolveTimeWindow(preset: string, nowMs: number, customFrom?: string | null, customTo?: string | null): TimeWindow | null;
/** Is an ISO/date string inside the window? Unparseable date → false. */
export function dateInWindow(dateStr: string | null | undefined, win: TimeWindow): boolean;
```
Semantics: `all`/unknown → null. `7d`/`30d` → `[nowMs - N*day, nowMs]` (TZ-independent). `today`/`yesterday` →
that local day's `[00:00, 23:59:59.999]`. `this_month`/`last_month` → that calendar month. `this_year` →
Jan 1..now. `custom` → `[startOf(from), endOf(to)]`; if from/to missing → null (all-time, defensive).
Tests: relative presets exact (`7d` from = now-7d), `all`→null, custom range, `dateInWindow` boundary
(inclusive), invalid date → false, `today` contains now.

## 3. Engine — `server/pipeline-metrics-engine.ts`
- `computeAllPipelineMetrics(req, pipelineId, rowFilter, ctx?)` — new optional `ctx: { preset: string; from?: string; to?: string } | null`.
- Per metric: if `timeField` is null/"none" → no time filtering (timeless). Else resolve **effective window**:
  `ctx && ctx.preset !== "all"` → `resolveTimeWindow(ctx.preset, now, ctx.from, ctx.to)` (strip override);
  else → `resolveTimeWindow(metric.timePreset ?? "all", now, metric.timeFrom, metric.timeTo)`.
  If the window is null → no filtering. Else keep only cards whose **date for this metric** is in the window.
- Card date resolution: `timeField === "created"` → `card.createdAt`; `"updated"` → `card.updatedAt ?? card.createdAt`;
  `"field:<id>"` → that field's value from the card's value map (a date field). Cards missing the date are excluded
  when a window applies.

## 4. Endpoint
`GET /api/pipelines/:id/metrics?ctx=<preset>&from=&to=` — parse the query into `ctx` (omit when absent or
"all") and pass to `computeAllPipelineMetrics`. Same read+view gate.

## 5. Storage
`createMetricDef`/`updateMetricDef` accept + persist `timeField`, `timePreset`, `timeFrom`, `timeTo`
(timeField/timePreset stored as-is; null when "none"/"all").

## 6. Client
- `usePipelineMetrics(pipelineId, ctx?)` — ctx `{ preset, from?, to? }`; query key includes ctx; appends the
  query string. (Keep the no-ctx call working for callers that don't pass it.)
- `MetricsStrip`: a **time-context dropdown** (TIME_PRESETS) at the strip header (left of the gear). Default
  "Semua waktu". On change → refetch with the ctx. A custom range reveals two date inputs.
- `MetricsConfigDialog`: per metric add a **"Basis waktu"** select (Tidak ada / Dibuat / Update / a date field
  from the pipeline's date-type fields) + a **preset** select + custom-range inputs (shown when preset=custom).
  `toPayload` sends timeField/timePreset/timeFrom/timeTo; `startEdit` reads them.

## 7. Validation (`validateMetricDef`)
- `timeField` (if set & not "none"): "created" | "updated" | "field:<id>" where `<id>` is a date-type field of
  this pipeline. Else 400.
- `timePreset` (if set): ∈ TIME_PRESETS. Else 400.

## 8. Testing
`shared/metricTimeWindow.test.ts` (pure). Engine/endpoint/UI: typecheck + build + manual on dev.

## 9. Manual acceptance (dev)
1. Create a metric "Kartu Baru" (card_count, timeField=Dibuat, preset=7d) → shows last-7-day count;
   "Total Kartu" (timeField=none) shows all-time.
2. Strip context = "30 Hari" → "Kartu Baru" recomputes to 30d (override), "Total Kartu" unchanged.
3. Context = Custom + range → metrics use the range. Context = "Semua waktu" → each metric uses its own preset.
4. A metric with a date custom field as timeField filters by that field's date.

## 10. Out of scope (→ MP3/MP4)
Formula builder + ratio/formula card types (MP3). Non-card data sources (MP4).
