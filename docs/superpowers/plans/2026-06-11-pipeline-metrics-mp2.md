# Pipeline Metric Time Filters (MP2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each pipeline metric an optional time window (today / 7d / 30d / this-month / custom …) driven by a chosen date field, plus a dynamic time-context selector on the board strip that re-scopes the time-aware metrics on the fly.

**Architecture:** A pure module `shared/metricTimeWindow.ts` resolves presets to `[fromMs, toMs]` windows and tests whether a date string falls inside. Four new nullable columns on `pipeline_metrics` (added via the guarded `loyaltyColumnAdditions` migration array) persist each metric's time basis. The engine (`computeAllPipelineMetrics`) gains an optional `ctx` param: when a metric has `timeField != none`, the engine filters its cards by that metric's date (resolved from `created`/`updated`/`field:<id>`), using either the strip-context override window or the metric's own preset window. Default `timeField = "none"` preserves all MP1 behavior exactly.

**Tech Stack:** TypeScript, Drizzle ORM (MySQL), Express, React + TanStack Query, `node:test` for pure-module tests.

---

## Decisions (locked from spec `docs/superpowers/specs/2026-06-11-pipeline-metrics-mp2-design.md`)

1. Strip context overrides **only** time-aware metrics (`timeField != "none"`). Timeless metrics stay all-time.
2. New metrics default `timeField = "none"` → existing MP1 metrics behave exactly as before.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `shared/metricTimeWindow.ts` | Pure: `TimePreset`, `TIME_PRESETS`, `resolveTimeWindow`, `dateInWindow` | Create |
| `shared/metricTimeWindow.test.ts` | Pure tests for the above | Create |
| `shared/schema.ts:808-830` | `pipelineMetrics` table + 4 new columns in Drizzle defs | Modify |
| `server/storage.ts:703-716` | `loyaltyColumnAdditions` - 4 `ALTER TABLE ADD COLUMN` entries | Modify |
| `server/storage.ts:12400-12426` | `createMetricDef`/`updateMetricDef` persist 4 new fields | Modify |
| `server/pipeline-metrics-engine.ts` | `computeAllPipelineMetrics` gains `ctx?` + per-metric time filtering | Modify |
| `server/routes.ts:4401-4419` | `validateMetricDef` validates `timeField`/`timePreset` | Modify |
| `server/routes.ts:5471-5477` | `GET /metrics` parses `ctx`/`from`/`to` query | Modify |
| `client/hooks/usePipelines.ts:462-463` | `usePipelineMetrics(pid, ctx?)` appends query string | Modify |
| `client/components/pipelines/MetricsStrip.tsx` | Time-context dropdown at strip header | Modify |
| `client/components/pipelines/MetricsConfigDialog.tsx` | Per-metric time-basis + preset + custom-range controls | Modify |

---

## Task 1: Pure module `shared/metricTimeWindow.ts` + tests

**Files:**
- Create: `shared/metricTimeWindow.ts`
- Test: `shared/metricTimeWindow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/metricTimeWindow.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIME_PRESETS, resolveTimeWindow, dateInWindow } from "./metricTimeWindow.js";

const DAY = 86_400_000;
// Fixed reference instant: 2026-06-11T08:30:00 local. Tests that care about
// calendar boundaries assert via dateInWindow rather than hardcoding TZ offsets.
const NOW = new Date(2026, 5, 11, 8, 30, 0).getTime();

test("TIME_PRESETS exposes the expected ordered keys", () => {
  assert.deepEqual(
    TIME_PRESETS.map((p) => p.preset),
    ["all", "today", "yesterday", "7d", "30d", "this_month", "last_month", "this_year", "custom"],
  );
});

test("all / unknown / missing → null (no filtering)", () => {
  assert.equal(resolveTimeWindow("all", NOW), null);
  assert.equal(resolveTimeWindow("bogus", NOW), null);
  assert.equal(resolveTimeWindow("", NOW), null);
});

test("7d window is [now-7d, now]", () => {
  const w = resolveTimeWindow("7d", NOW)!;
  assert.equal(w.toMs, NOW);
  assert.equal(w.fromMs, NOW - 7 * DAY);
});

test("30d window is [now-30d, now]", () => {
  const w = resolveTimeWindow("30d", NOW)!;
  assert.equal(w.fromMs, NOW - 30 * DAY);
  assert.equal(w.toMs, NOW);
});

test("today window contains now and excludes yesterday's instant", () => {
  const w = resolveTimeWindow("today", NOW)!;
  assert.ok(w.fromMs <= NOW && NOW <= w.toMs);
  assert.ok(w.fromMs > NOW - DAY); // start is later than 24h ago (it's local midnight today)
});

test("yesterday window precedes today and excludes now", () => {
  const y = resolveTimeWindow("yesterday", NOW)!;
  const t = resolveTimeWindow("today", NOW)!;
  assert.ok(y.toMs < NOW);
  assert.ok(y.toMs <= t.fromMs); // yesterday ends at/just before today starts
});

test("this_month starts on the 1st at local midnight and includes now", () => {
  const w = resolveTimeWindow("this_month", NOW)!;
  assert.ok(w.fromMs <= NOW && NOW <= w.toMs);
  const start = new Date(w.fromMs);
  assert.equal(start.getDate(), 1);
  assert.equal(start.getMonth(), 5); // June (0-indexed)
});

test("last_month is the full previous calendar month", () => {
  const w = resolveTimeWindow("last_month", NOW)!;
  const start = new Date(w.fromMs);
  const end = new Date(w.toMs);
  assert.equal(start.getMonth(), 4); // May
  assert.equal(start.getDate(), 1);
  assert.equal(end.getMonth(), 4); // ends within May
});

test("this_year starts Jan 1 and includes now", () => {
  const w = resolveTimeWindow("this_year", NOW)!;
  assert.ok(w.fromMs <= NOW && NOW <= w.toMs);
  const start = new Date(w.fromMs);
  assert.equal(start.getMonth(), 0);
  assert.equal(start.getDate(), 1);
  assert.equal(start.getFullYear(), 2026);
});

test("custom uses startOf(from)..endOf(to)", () => {
  const w = resolveTimeWindow("custom", NOW, "2026-06-01", "2026-06-10")!;
  assert.ok(dateInWindow("2026-06-01", w)); // inclusive start
  assert.ok(dateInWindow("2026-06-10", w)); // inclusive end (end-of-day)
  assert.ok(dateInWindow("2026-06-10T23:59:00", w));
  assert.ok(!dateInWindow("2026-06-11", w));
  assert.ok(!dateInWindow("2026-05-31", w));
});

test("custom with missing from/to → null (defensive all-time)", () => {
  assert.equal(resolveTimeWindow("custom", NOW, null, "2026-06-10"), null);
  assert.equal(resolveTimeWindow("custom", NOW, "2026-06-01", null), null);
  assert.equal(resolveTimeWindow("custom", NOW), null);
});

test("dateInWindow: boundaries inclusive, invalid/empty date → false", () => {
  const w = resolveTimeWindow("7d", NOW)!;
  assert.ok(dateInWindow(new Date(NOW).toISOString(), w));
  assert.ok(dateInWindow(new Date(w.fromMs).toISOString(), w)); // inclusive low
  assert.ok(dateInWindow(new Date(w.toMs).toISOString(), w));   // inclusive high
  assert.ok(!dateInWindow(new Date(w.fromMs - 1).toISOString(), w));
  assert.ok(!dateInWindow("not-a-date", w));
  assert.ok(!dateInWindow("", w));
  assert.ok(!dateInWindow(null, w));
  assert.ok(!dateInWindow(undefined, w));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test shared/metricTimeWindow.test.ts`
Expected: FAIL - `Cannot find module './metricTimeWindow.js'`.

- [ ] **Step 3: Write the implementation**

Create `shared/metricTimeWindow.ts`:

```ts
/** Pure time-window helpers for pipeline metrics - no I/O. nowMs is injected for testability. */

export type TimePreset =
 | "all" | "today" | "yesterday" | "7d" | "30d"
 | "this_month" | "last_month" | "this_year" | "custom";

export const TIME_PRESETS: { preset: TimePreset; label: string }[] = [
  { preset: "all", label: "Semua waktu" },
  { preset: "today", label: "Hari ini" },
  { preset: "yesterday", label: "Kemarin" },
  { preset: "7d", label: "7 Hari" },
  { preset: "30d", label: "30 Hari" },
  { preset: "this_month", label: "Bulan Ini" },
  { preset: "last_month", label: "Bulan Lalu" },
  { preset: "this_year", label: "Tahun Ini" },
  { preset: "custom", label: "Kustom" },
];

export interface TimeWindow { fromMs: number; toMs: number; }

const DAY = 86_400_000;

/** Local-day start (00:00:00.000) for the day containing `ms`. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}
/** Local-day end (23:59:59.999) for the day containing `ms`. */
function endOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * Resolve a preset to a window, or null = all-time (no filtering).
 * Relative presets (7d/30d) are TZ-independent offsets ending at nowMs.
 * Day/month/year presets snap to the runtime's LOCAL calendar boundaries.
 * `custom` needs both from & to (YYYY-MM-DD); a missing bound → null (defensive).
 */
export function resolveTimeWindow(
  preset: string,
  nowMs: number,
  customFrom?: string | null,
  customTo?: string | null,
): TimeWindow | null {
  const now = new Date(nowMs);
  switch (preset) {
    case "today":
      return { fromMs: startOfDay(nowMs), toMs: endOfDay(nowMs) };
    case "yesterday": {
      const y = nowMs - DAY;
      return { fromMs: startOfDay(y), toMs: endOfDay(y) };
    }
    case "7d":
      return { fromMs: nowMs - 7 * DAY, toMs: nowMs };
    case "30d":
      return { fromMs: nowMs - 30 * DAY, toMs: nowMs };
    case "this_month":
      return { fromMs: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime(), toMs: nowMs };
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime() - 1; // last ms of prev month
      return { fromMs: start, toMs: end };
    }
    case "this_year":
      return { fromMs: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime(), toMs: nowMs };
    case "custom": {
      if (!customFrom || !customTo) return null;
      const f = Date.parse(customFrom);
      const t = Date.parse(customTo);
      if (!Number.isFinite(f) || !Number.isFinite(t)) return null;
      return { fromMs: startOfDay(f), toMs: endOfDay(t) };
    }
    default:
      return null; // "all", "", unknown → all-time
  }
}

/** Is an ISO/date string inside [fromMs, toMs] inclusive? Unparseable/empty → false. */
export function dateInWindow(dateStr: string | null | undefined, win: TimeWindow): boolean {
  if (!dateStr) return false;
  const ms = Date.parse(dateStr);
  if (!Number.isFinite(ms)) return false;
  return ms >= win.fromMs && ms <= win.toMs;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test shared/metricTimeWindow.test.ts`
Expected: PASS - all tests green.

- [ ] **Step 5: Commit**

```bash
git add shared/metricTimeWindow.ts shared/metricTimeWindow.test.ts
git commit -m "$(cat <<'EOF'
feat(metrics): pure metricTimeWindow (presets + resolve + dateInWindow)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Schema columns + migration

**Files:**
- Modify: `shared/schema.ts:808-830` (pipelineMetrics table)
- Modify: `server/storage.ts:703-716` (loyaltyColumnAdditions array)

- [ ] **Step 1: Add the 4 columns to the Drizzle table**

In `shared/schema.ts`, inside `pipelineMetrics`, add the new columns right after the `decimals` line (line 824) and before `position`:

```ts
  decimals: int("decimals"),
  timeField: varchar("time_field", { length: 24 }),   // null/"none" = timeless; "created"|"updated"|"field:<id>"
  timePreset: varchar("time_preset", { length: 16 }), // null = "all"
  timeFrom: text("time_from"),                          // custom range start (YYYY-MM-DD)
  timeTo: text("time_to"),                              // custom range end (YYYY-MM-DD)
  position: int("position").notNull().default(0),
```

(`PipelineMetric` type is inferred - no separate type change needed.)

- [ ] **Step 2: Add the migration entries**

In `server/storage.ts`, append to the `loyaltyColumnAdditions` array (after the `collection_cycle` entry at line 715):

```ts
      { table: "pipeline_cards", column: "collection_cycle", ddl: "INT" },
      { table: "pipeline_metrics", column: "time_field",  ddl: "VARCHAR(24) NULL" },
      { table: "pipeline_metrics", column: "time_preset", ddl: "VARCHAR(16) NULL" },
      { table: "pipeline_metrics", column: "time_from",   ddl: "TEXT NULL" },
      { table: "pipeline_metrics", column: "time_to",     ddl: "TEXT NULL" },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "$(cat <<'EOF'
feat(metrics): pipeline_metrics time columns + guarded migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Storage persists the new fields

**Files:**
- Modify: `server/storage.ts:12400-12426` (`createMetricDef`, `updateMetricDef`)

- [ ] **Step 1: Persist in `createMetricDef`**

In `createMetricDef`, add the four fields to the `.values({...})` object (after the `decimals` line ~12408):

```ts
      prefix: data.prefix ?? null, suffix: data.suffix ?? null, decimals: data.decimals ?? null,
      timeField: data.timeField ?? null, timePreset: data.timePreset ?? null,
      timeFrom: data.timeFrom ?? null, timeTo: data.timeTo ?? null,
      position: data.position ?? 0, visible: data.visible === false ? 0 : 1, createdAt: now,
```

- [ ] **Step 2: Persist in `updateMetricDef`**

In `updateMetricDef`, add the four keys to the copy loop (line ~12419):

```ts
    for (const k of ["name", "description", "icon", "color", "type", "source", "aggregation", "fieldId", "prefix", "suffix", "decimals", "position", "timeField", "timePreset", "timeFrom", "timeTo"]) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(metrics): persist timeField/timePreset/timeFrom/timeTo in metric CRUD

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Engine applies the time window

**Files:**
- Modify: `server/pipeline-metrics-engine.ts`

- [ ] **Step 1: Import the time helpers + extend the signature**

At the top of `server/pipeline-metrics-engine.ts`, add to the imports:

```ts
import { resolveTimeWindow, dateInWindow } from "../shared/metricTimeWindow.js";
```

Change the `computeAllPipelineMetrics` signature to accept an optional context (after the `rowFilter` param):

```ts
export async function computeAllPipelineMetrics(
  req: Request,
  pipelineId: number,
  rowFilter: import("../shared/fieldRules.js").FieldRuleCondition[][] | null,
  ctx?: { preset: string; from?: string | null; to?: string | null } | null,
): Promise<MetricResult[]> {
```

- [ ] **Step 2: Capture `now` once, per-metric resolve the effective window and filter**

Right after `const valuesByCard = await storage.getCardValuesForPipeline(pipelineId);` (line ~27), add:

```ts
  const nowMs = Date.now();
```

Inside the `for (const def of defs)` loop, in the `try` block, AFTER `stageIds`/`groups`/`matching` are computed (after line ~54, before `let value = 0;`), insert the time filter:

```ts
      // MP2 time window: only metrics with a timeField are time-aware.
      const timeField = (def as any).timeField as string | null;
      let timed = matching;
      if (timeField && timeField !== "none") {
        // Strip-context override wins when present and not "all"; else the metric's own preset.
        const win =
          ctx && ctx.preset && ctx.preset !== "all"
            ? resolveTimeWindow(ctx.preset, nowMs, ctx.from, ctx.to)
            : resolveTimeWindow((def as any).timePreset ?? "all", nowMs, (def as any).timeFrom, (def as any).timeTo);
        if (win) {
          timed = matching.filter((c) => {
            let dateStr: string | null | undefined;
            if (timeField === "created") dateStr = (c as any).createdAt;
            else if (timeField === "updated") dateStr = (c as any).updatedAt ?? (c as any).createdAt;
            else if (timeField.startsWith("field:")) {
              const fid = Number(timeField.slice(6));
              dateStr = (valuesByCard.get(c.id) ?? {})[fid];
            }
            return dateInWindow(dateStr, win);
          });
        }
      }
```

- [ ] **Step 3: Use `timed` instead of `matching` for the value computation**

Change the aggregation block (lines ~57-64) to read from `timed`:

```ts
      let value = 0;
      if (def.source === "field_agg" && def.fieldId != null) {
        const vals = timed.map(
          (c) => (valuesByCard.get(c.id) ?? {})[def.fieldId as number] ?? null,
        );
        value = aggregate(vals, def.aggregation as MetricAggregation);
      } else {
        value = timed.length; // card_count / stage_count
      }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-metrics-engine.ts
git commit -m "$(cat <<'EOF'
feat(metrics): engine applies per-metric time window + strip ctx override

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Endpoint parses time context + validation

**Files:**
- Modify: `server/routes.ts:5471-5477` (`GET /metrics`)
- Modify: `server/routes.ts:4401-4419` (`validateMetricDef`)

- [ ] **Step 1: Import TIME_PRESETS in routes**

Find the existing pipelineMetrics import in `server/routes.ts` (the line importing `METRIC_SOURCES, METRIC_AGGREGATIONS, METRIC_TYPES` from `pipelineMetrics`). Add a `metricTimeWindow` import nearby:

```ts
import { TIME_PRESETS } from "../shared/metricTimeWindow.js";
```

Verify location:

Run: `grep -n "METRIC_SOURCES\|metricTimeWindow" server/routes.ts | head`
Expected: shows the existing METRIC_SOURCES import and the new metricTimeWindow import.

- [ ] **Step 2: Parse the query params in `GET /metrics`**

Replace the body of `router.get("/api/pipelines/:id/metrics", ...)` (lines ~5471-5477) with:

```ts
  router.get("/api/pipelines/:id/metrics", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requirePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineView(req, res, pid))) return;
    const rowFilter = await getCardFilterForRequest(req, pid);
    const presetRaw = typeof req.query.ctx === "string" ? req.query.ctx : "";
    const ctx =
      presetRaw && presetRaw !== "all"
        ? { preset: presetRaw, from: typeof req.query.from === "string" ? req.query.from : null, to: typeof req.query.to === "string" ? req.query.to : null }
        : null;
    return sendSuccess(res, await computeAllPipelineMetrics(req, pid, rowFilter, ctx));
  });
```

- [ ] **Step 3: Validate timeField/timePreset in `validateMetricDef`**

In `validateMetricDef`, insert before the final `return null;` (after the conditions block, line ~4417):

```ts
  if (b.timeField != null && b.timeField !== "none") {
    if (typeof b.timeField !== "string") return "timeField tidak valid";
    if (b.timeField === "created" || b.timeField === "updated") {
      // ok
    } else if (b.timeField.startsWith("field:")) {
      const fid = Number(b.timeField.slice(6));
      const dateFieldIds = new Set(fields.filter((f) => f.type === "date").map((f) => f.id));
      if (!dateFieldIds.has(fid)) return "Field tanggal untuk basis waktu tidak valid";
    } else {
      return "timeField tidak valid";
    }
  }
  if (b.timePreset != null && b.timePreset !== "") {
    if (!TIME_PRESETS.some((p) => p.preset === b.timePreset)) return "Preset waktu tidak valid";
  }
```

> Note: `fields` is already loaded earlier in `validateMetricDef` (`const fields = await storage.listFields(pipelineId);` at line ~4406) - reuse it; do not re-fetch.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "$(cat <<'EOF'
feat(metrics): /metrics ctx query params + validate timeField/timePreset

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Client hook accepts time context

**Files:**
- Modify: `client/hooks/usePipelines.ts:462-463` (`usePipelineMetrics`)

- [ ] **Step 1: Extend `usePipelineMetrics` to take an optional ctx**

Replace lines 462-463 (`export interface MetricResult ...` stays; replace the `usePipelineMetrics` function) with:

```ts
export interface MetricTimeCtx { preset: string; from?: string | null; to?: string | null; }
export function usePipelineMetrics(pipelineId: number, ctx?: MetricTimeCtx | null) {
  const qs = (() => {
    if (!ctx || !ctx.preset || ctx.preset === "all") return "";
    const p = new URLSearchParams({ ctx: ctx.preset });
    if (ctx.preset === "custom") { if (ctx.from) p.set("from", ctx.from); if (ctx.to) p.set("to", ctx.to); }
    return `?${p.toString()}`;
  })();
  return useQuery({
    queryKey: ["/api/pipelines", pipelineId, "metrics", ctx?.preset ?? "all", ctx?.from ?? "", ctx?.to ?? ""],
    queryFn: () => api.get<MetricResult[]>(`/pipelines/${pipelineId}/metrics${qs}`),
  });
}
```

> The existing `useSaveMetricDef`'s `inv()` invalidates `["/api/pipelines", pipelineId, "metrics"]` - that prefix still matches all ctx variants, so saving a def refetches every context. No change needed there.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "$(cat <<'EOF'
feat(metrics): usePipelineMetrics accepts optional time ctx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Strip time-context dropdown

**Files:**
- Modify: `client/components/pipelines/MetricsStrip.tsx`

- [ ] **Step 1: Add a local ctx state + a TIME_PRESETS dropdown**

Replace the entire contents of `client/components/pipelines/MetricsStrip.tsx` with:

```tsx
import { useState } from "react";
import { Settings2, Plus } from "lucide-react";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { usePipelineMetrics, type MetricTimeCtx } from "@/hooks/usePipelines";
import { TIME_PRESETS } from "@shared/metricTimeWindow";
import { METRIC_ICON_MAP } from "./metricIcons";

export function MetricsStrip({ pipelineId, canManage, onManage }: { pipelineId: number; canManage: boolean; onManage: () => void }) {
  const [preset, setPreset] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ctx: MetricTimeCtx | null = preset === "all" ? null : { preset, from, to };
  const { data: metrics } = usePipelineMetrics(pipelineId, ctx);
  const list = metrics ?? [];

  if (list.length === 0) {
    if (!canManage) return null;
    return (
      <div className="px-4 md:px-6 pt-2">
        <Button variant="outline" size="sm" onClick={onManage}><Plus className="size-3.5 mr-1" /> Tambah metrik</Button>
      </div>
    );
  }

  return (
    <section aria-label="Metrik pipeline" className="px-4 md:px-6 pt-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Combobox
          size="sm"
          className="w-36"
          options={TIME_PRESETS.map((p) => ({ value: p.preset, label: p.label }))}
          value={preset}
          onChange={(v) => setPreset(v || "all")}
          clearable={false}
        />
        {preset === "custom" && (
          <>
            <Input inputSize="sm" type="date" aria-label="Dari tanggal" className="w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input inputSize="sm" type="date" aria-label="Sampai tanggal" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        {canManage && (
          <Button variant="ghost" size="icon-sm" aria-label="Kelola metrik" className="ml-auto" onClick={onManage}><Settings2 className="size-4" /></Button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {list.map((mtr) => (
          <StatTile key={mtr.id} icon={METRIC_ICON_MAP[mtr.icon ?? ""] ?? undefined} label={mtr.name} value={mtr.formatted} description={mtr.description ?? undefined} accent={(mtr.color as any) ?? "primary"} />
        ))}
      </div>
    </section>
  );
}
```

> Verify `Combobox` accepts a `className` prop before relying on it:
>
> Run: `grep -n "className" client/components/ui/combobox.tsx | head`
> Expected: the component spreads/accepts `className` (it does - BoardFilters wraps it in width divs, but the trigger forwards className). If it does NOT accept `className`, wrap the `<Combobox>` in a `<div className="w-36">` instead, matching the BoardFilters pattern at `client/components/pipelines/BoardFilters.tsx`.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/MetricsStrip.tsx
git commit -m "$(cat <<'EOF'
feat(metrics): strip time-context dropdown (preset + custom range)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Config dialog time-basis controls

**Files:**
- Modify: `client/components/pipelines/MetricsConfigDialog.tsx`

- [ ] **Step 1: Add the 4 fields to the `Draft` type + `empty`**

In `MetricsConfigDialog.tsx`, extend the `Draft` type (after `decimals: string;`):

```ts
type Draft = {
  id?: number; name: string; description: string; icon: string; color: string; type: string;
  source: string; aggregation: string; fieldId: string; stageIds: number[];
  conditions: DraftCondition[][]; prefix: string; suffix: string; decimals: string; visible: boolean;
  timeField: string; timePreset: string; timeFrom: string; timeTo: string;
};
```

Extend `empty`:

```ts
const empty: Draft = { name: "", description: "", icon: "Database", color: "primary", type: "number", source: "card_count", aggregation: "count", fieldId: "", stageIds: [], conditions: [], prefix: "", suffix: "", decimals: "", visible: true, timeField: "none", timePreset: "all", timeFrom: "", timeTo: "" };
```

- [ ] **Step 2: Read them in `startEdit`**

In `startEdit`, add to the returned draft object (after `decimals: ...,`):

```ts
    timeField: d.timeField ?? "none", timePreset: d.timePreset ?? "all", timeFrom: d.timeFrom ?? "", timeTo: d.timeTo ?? "",
```

- [ ] **Step 3: Send them in `toPayload`**

In `toPayload`, add to the returned object (after `decimals: ...,`):

```ts
    timeField: d.timeField && d.timeField !== "none" ? d.timeField : null,
    timePreset: d.timeField && d.timeField !== "none" && d.timePreset && d.timePreset !== "all" ? d.timePreset : null,
    timeFrom: d.timeField !== "none" && d.timePreset === "custom" && d.timeFrom ? d.timeFrom : null,
    timeTo: d.timeField !== "none" && d.timePreset === "custom" && d.timeTo ? d.timeTo : null,
```

- [ ] **Step 4: Import TIME_PRESETS**

Add to the imports at the top:

```ts
import { TIME_PRESETS } from "@shared/metricTimeWindow";
```

- [ ] **Step 5: Render the time-basis controls in the editor**

In the editor JSX (the `<div className="space-y-3">` branch when `draft` is set), insert a "Basis waktu" block right before the `<label>…Tampilkan di board</label>` line (after the prefix/suffix/decimals grid):

```tsx
              {/* Time basis (MP2) */}
              <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
                <label className="text-[10px] text-muted-foreground">Basis waktu (opsional)</label>
                <div className="grid grid-cols-2 gap-2">
                  <Combobox
                    size="sm"
                    options={[
                      { value: "none", label: "Tidak ada (semua waktu)" },
                      { value: "created", label: "Tanggal dibuat" },
                      { value: "updated", label: "Tanggal update" },
                      ...fields.filter((f) => f.type === "date").map((f) => ({ value: `field:${f.id}`, label: `Field: ${f.label}` })),
                    ]}
                    value={draft.timeField}
                    onChange={(v) => setDraft({ ...draft, timeField: v || "none" })}
                    clearable={false}
                  />
                  {draft.timeField !== "none" && (
                    <Combobox
                      size="sm"
                      options={TIME_PRESETS.map((p) => ({ value: p.preset, label: p.label }))}
                      value={draft.timePreset}
                      onChange={(v) => setDraft({ ...draft, timePreset: v || "all" })}
                      clearable={false}
                    />
                  )}
                </div>
                {draft.timeField !== "none" && draft.timePreset === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input inputSize="sm" type="date" aria-label="Dari" value={draft.timeFrom} onChange={(e) => setDraft({ ...draft, timeFrom: e.target.value })} />
                    <Input inputSize="sm" type="date" aria-label="Sampai" value={draft.timeTo} onChange={(e) => setDraft({ ...draft, timeTo: e.target.value })} />
                  </div>
                )}
              </div>
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/components/pipelines/MetricsConfigDialog.tsx
git commit -m "$(cat <<'EOF'
feat(metrics): config dialog time-basis + preset + custom-range controls

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Full verification + final commit

**Files:** none (verification only)

- [ ] **Step 1: Run the pure test suite**

Run: `npx tsx --test shared/metricTimeWindow.test.ts`
Expected: PASS - all green.

- [ ] **Step 2: Typecheck + build the whole project**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 type errors; Vite + esbuild build succeed.

- [ ] **Step 3: Manual acceptance on dev (start `npm run dev`, login JABNET admin, open `/pipelines/<id>`)**

Walk through the spec's acceptance scenarios:
1. Create metric "Kartu Baru" (card_count, Basis waktu = "Tanggal dibuat", preset = "7 Hari") → shows last-7-day count. Create "Total Kartu" (Basis waktu = "Tidak ada") → shows all-time count.
2. Strip context = "30 Hari" → "Kartu Baru" recomputes to 30d; "Total Kartu" unchanged.
3. Strip context = "Kustom" + a date range → time-aware metrics use the range. Context = "Semua waktu" → each metric falls back to its own preset.
4. A metric with a date custom field as Basis waktu filters by that field's date.
5. Edit a saved time-aware metric → the dialog shows the persisted timeField/preset/range (no crash).

Expected: all behave as described.

- [ ] **Step 4: Update the epic memory**

Edit `/home/ygao-t580/.claude/projects/-home-ygao-t580-Works-Jabnet-Website-ftth-tools/memory/project-pipeline-metrics-epic.md` - move MP2 from "remaining" to done with a one-line summary (`shared/metricTimeWindow.ts` + 4 cols + engine ctx + strip dropdown). Leave MP3/MP4 as remaining.

- [ ] **Step 5: Final summary to user**

Per [[feedback-post-update-handoff]]: report what changed, where, and the deploy steps (push dev → it's staging; new columns need a Node restart so the startup migration runs). Note MP2 is on `dev`, not yet promoted to `main`.

---

## Self-Review Notes

- **Spec coverage:** §1 schema → Task 2; §2 pure module → Task 1; §3 engine → Task 4; §4 endpoint → Task 5; §5 storage → Task 3; §6 client (hook/strip/dialog) → Tasks 6/7/8; §7 validation → Task 5 Step 3; §8 testing → Tasks 1 & 9; §9 manual acceptance → Task 9 Step 3. All covered.
- **Default preserves MP1:** `timeField` defaults null → engine skips time filtering → identical to MP1. Confirmed in Task 4 Step 2 guard (`if (timeField && timeField !== "none")`).
- **Type consistency:** `MetricTimeCtx { preset; from?; to? }` defined in Task 6 and consumed in Task 7; engine `ctx { preset; from?; to? }` matches the endpoint's constructed object in Task 5. `timeField`/`timePreset`/`timeFrom`/`timeTo` names identical across schema, storage, engine, validation, hook payload, and dialog.
- **Combobox className risk** flagged in Task 7 Step 1 with a verify-and-fallback instruction.
