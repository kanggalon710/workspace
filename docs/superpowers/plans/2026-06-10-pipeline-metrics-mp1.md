# MP1 — Universal Pipeline Metrics (core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> **Subagents: work DIRECTLY in this repo on branch `dev`. NO worktrees, NO branch switches. Verify `git branch --show-current` is `dev`.**

**Goal:** Per-pipeline configurable metrics (count / stage-count / field-aggregation with WHERE-rules + icon/color/format) shown as a board strip between the description and the filters, with a CRUD config UI.

**Architecture:** Pure aggregate+format module; a server engine that filters the permission-scoped card set by stage-scope + reused `evaluateConditionGroups` then aggregates; compute + CRUD endpoints; a board `MetricsStrip` (StatTiles) + `MetricsConfigDialog`. Reuses ConditionsBuilder, StatTile, card-filter plumbing.

**Tech Stack:** TS ESM, Drizzle/mysql2, React + TanStack Query + StatTile/ConditionsBuilder. Pure tests via `npx tsx --test`. `.js` imports.

---

## File Structure
- **Create** `shared/pipelineMetrics.ts` (+test) — registries, `aggregate`, `formatMetricValue`.
- **Modify** `shared/schema.ts` + `server/storage.ts` — `pipeline_metrics` table + migration + CRUD + `getCardValuesForPipeline`.
- **Create** `server/pipeline-metrics-engine.ts` — `computeAllPipelineMetrics`.
- **Modify** `server/routes.ts` — compute + CRUD endpoints.
- **Create** `client/components/pipelines/metricIcons.ts`, `MetricsStrip.tsx`, `MetricsConfigDialog.tsx`; **Modify** `client/hooks/usePipelines.ts`, `client/pages/PipelineBoardPage.tsx`.

---

## Task 1: Pure `shared/pipelineMetrics.ts`

**Files:** Create `shared/pipelineMetrics.ts`, `shared/pipelineMetrics.test.ts`.

- [ ] **Step 1: Test** — create `shared/pipelineMetrics.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, formatMetricValue, METRIC_SOURCES, METRIC_AGGREGATIONS, METRIC_TYPES } from "./pipelineMetrics.js";

test("registries", () => {
  assert.deepEqual(METRIC_SOURCES.map((s) => s.source), ["card_count", "stage_count", "field_agg"]);
  assert.deepEqual(METRIC_AGGREGATIONS.map((a) => a.aggregation), ["count", "sum", "avg", "min", "max", "distinct"]);
  assert.deepEqual(METRIC_TYPES.map((t) => t.type), ["number", "currency", "percentage"]);
});

test("aggregate", () => {
  assert.equal(aggregate(["10", "20", "x", null], "sum"), 30);     // non-numeric/null skipped
  assert.equal(aggregate(["10", "20", "30"], "avg"), 20);
  assert.equal(aggregate(["10", "5", "30"], "min"), 5);
  assert.equal(aggregate(["10", "5", "30"], "max"), 30);
  assert.equal(aggregate([], "sum"), 0);
  assert.equal(aggregate([], "avg"), 0);
  assert.equal(aggregate(["a", "b", "", null, "c"], "count"), 3);  // non-empty count
  assert.equal(aggregate(["a", "a", "b", ""], "distinct"), 2);     // distinct non-empty
});

test("formatMetricValue", () => {
  assert.equal(formatMetricValue(120000000, { type: "currency" }), "Rp 120.000.000");
  assert.equal(formatMetricValue(35, { type: "number" }), "35");
  assert.equal(formatMetricValue(90, { type: "percentage" }), "90%");
  assert.equal(formatMetricValue(1234.5, { type: "number", decimals: 1 }), "1.234,5");
  assert.equal(formatMetricValue(5, { type: "number", prefix: "≈ ", suffix: " kartu" }), "≈ 5 kartu");
});
```

- [ ] **Step 2: Run → fail** — `npx tsx --test shared/pipelineMetrics.test.ts`.

- [ ] **Step 3: Write `shared/pipelineMetrics.ts`**
```ts
/** Pure pipeline-metrics helpers — no I/O. */

export type MetricSource = "card_count" | "stage_count" | "field_agg";
export type MetricAggregation = "count" | "sum" | "avg" | "min" | "max" | "distinct";
export type MetricType = "number" | "currency" | "percentage";

export const METRIC_SOURCES: { source: MetricSource; label: string }[] = [
  { source: "card_count", label: "Jumlah Kartu" },
  { source: "stage_count", label: "Jumlah Kartu per Stage" },
  { source: "field_agg", label: "Agregasi Field" },
];
export const METRIC_AGGREGATIONS: { aggregation: MetricAggregation; label: string }[] = [
  { aggregation: "count", label: "Count" },
  { aggregation: "sum", label: "Sum" },
  { aggregation: "avg", label: "Average" },
  { aggregation: "min", label: "Min" },
  { aggregation: "max", label: "Max" },
  { aggregation: "distinct", label: "Distinct Count" },
];
export const METRIC_TYPES: { type: MetricType; label: string }[] = [
  { type: "number", label: "Angka" },
  { type: "currency", label: "Rupiah" },
  { type: "percentage", label: "Persen" },
];
export const METRIC_ICONS = ["Database", "Users", "Wallet", "Phone", "BarChart3", "AlertCircle", "CheckCircle2", "XCircle", "Calendar", "TrendingUp", "Clock", "Star"];
export const METRIC_COLORS = ["primary", "success", "warning", "danger", "info", "violet", "neutral"];

function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Aggregate raw values. Numeric aggs skip non-numeric; count = non-empty count; distinct = distinct non-empty. */
export function aggregate(values: (string | number | null | undefined)[], agg: MetricAggregation): number {
  if (agg === "count") return values.filter((v) => v != null && v !== "").length;
  if (agg === "distinct") return new Set(values.filter((v) => v != null && v !== "").map(String)).size;
  const nums = values.map(toNum).filter((n): n is number => n != null);
  if (nums.length === 0) return 0;
  switch (agg) {
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
    default: return 0;
  }
}

/** Format a numeric value for display. */
export function formatMetricValue(value: number, opts: { type: MetricType; prefix?: string | null; suffix?: string | null; decimals?: number | null }): string {
  const decimals = opts.decimals ?? (opts.type === "currency" ? 0 : value % 1 === 0 ? 0 : 2);
  const num = value.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  let out = num;
  if (opts.type === "currency") out = "Rp " + num;
  else if (opts.type === "percentage") out = num + "%";
  if (opts.prefix) out = opts.prefix + out;
  if (opts.suffix) out = out + opts.suffix;
  return out;
}
```

- [ ] **Step 4: Run → pass** — `npx tsx --test shared/pipelineMetrics.test.ts` (3 tests). `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**
```bash
git add shared/pipelineMetrics.ts shared/pipelineMetrics.test.ts
git commit -m "feat(metrics): pure pipeline-metrics aggregate + format + registries"
```

---

## Task 2: Schema + migration

**Files:** `shared/schema.ts`, `server/storage.ts`.

- [ ] **Step 1:** In `shared/schema.ts`, add (near the other pipeline tables):
```ts
export const pipelineMetrics = mysqlTable("pipeline_metrics", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  icon: varchar("icon", { length: 48 }),
  color: varchar("color", { length: 16 }).notNull().default("primary"),
  type: varchar("type", { length: 16 }).notNull().default("number"),
  source: varchar("source", { length: 16 }).notNull().default("card_count"),
  aggregation: varchar("aggregation", { length: 16 }).notNull().default("count"),
  fieldId: int("field_id"),
  stageIds: text("stage_ids"),
  conditions: text("conditions"),
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
- [ ] **Step 2:** In `server/storage.ts` startup migrations (after another pipeline `CREATE TABLE IF NOT EXISTS` block), add:
```ts
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_metrics (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          description VARCHAR(255),
          icon VARCHAR(48),
          color VARCHAR(16) NOT NULL DEFAULT 'primary',
          type VARCHAR(16) NOT NULL DEFAULT 'number',
          source VARCHAR(16) NOT NULL DEFAULT 'card_count',
          aggregation VARCHAR(16) NOT NULL DEFAULT 'count',
          field_id INT,
          stage_ids TEXT,
          conditions TEXT,
          prefix VARCHAR(16),
          suffix VARCHAR(16),
          decimals INT,
          position INT NOT NULL DEFAULT 0,
          visible INT NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          KEY idx_pipeline_metrics_mitra_pipeline (mitra_id, pipeline_id, position)
        )
      `);
    } catch (e: any) { console.warn(`[migration] pipeline_metrics setup failed: ${e.message}`); }
```
- [ ] **Step 3:** `npx tsc --noEmit` → 0.
- [ ] **Step 4: Commit**
```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(metrics): pipeline_metrics table + migration"
```

---

## Task 3: Storage — metric def CRUD + batch card values

**Files:** `server/storage.ts`.

- [ ] **Step 1:** Add `pipelineMetrics`, `type PipelineMetric` to the existing `../shared/schema.js` import (merge). Add methods to the class:
```ts
  async listMetricDefs(pipelineId: number): Promise<PipelineMetric[]> {
    const mid = getMitraId();
    return await this.db.select().from(pipelineMetrics)
      .where(and(eq(pipelineMetrics.pipelineId, pipelineId), eq(pipelineMetrics.mitraId, mid)))
      .orderBy(pipelineMetrics.position) as PipelineMetric[];
  }

  async createMetricDef(pipelineId: number, data: any): Promise<PipelineMetric> {
    const mid = getMitraId(); const now = new Date().toISOString();
    const result = await this.db.insert(pipelineMetrics).values({
      mitraId: mid, pipelineId, name: data.name, description: data.description ?? null,
      icon: data.icon ?? null, color: data.color ?? "primary", type: data.type ?? "number",
      source: data.source ?? "card_count", aggregation: data.aggregation ?? "count",
      fieldId: data.fieldId ?? null, stageIds: data.stageIds ? JSON.stringify(data.stageIds) : null,
      conditions: data.conditions ? JSON.stringify(data.conditions) : null,
      prefix: data.prefix ?? null, suffix: data.suffix ?? null, decimals: data.decimals ?? null,
      position: data.position ?? 0, visible: data.visible === false ? 0 : 1, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineMetrics).where(and(eq(pipelineMetrics.id, insertId), eq(pipelineMetrics.mitraId, mid)));
    return row!;
  }

  async updateMetricDef(metricId: number, data: any): Promise<void> {
    const mid = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    for (const k of ["name", "description", "icon", "color", "type", "source", "aggregation", "fieldId", "prefix", "suffix", "decimals", "position"]) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.stageIds !== undefined) patch.stageIds = data.stageIds ? JSON.stringify(data.stageIds) : null;
    if (data.conditions !== undefined) patch.conditions = data.conditions ? JSON.stringify(data.conditions) : null;
    if (data.visible !== undefined) patch.visible = data.visible ? 1 : 0;
    await this.db.update(pipelineMetrics).set(patch).where(and(eq(pipelineMetrics.id, metricId), eq(pipelineMetrics.mitraId, mid)));
  }

  async deleteMetricDef(metricId: number): Promise<void> {
    const mid = getMitraId();
    await this.db.delete(pipelineMetrics).where(and(eq(pipelineMetrics.id, metricId), eq(pipelineMetrics.mitraId, mid)));
  }

  async getMetricDef(metricId: number): Promise<PipelineMetric | undefined> {
    const mid = getMitraId();
    const [row] = await this.db.select().from(pipelineMetrics).where(and(eq(pipelineMetrics.id, metricId), eq(pipelineMetrics.mitraId, mid)));
    return row as PipelineMetric | undefined;
  }

  /** All card values for a pipeline, grouped by card id. Mitra-scoped. Anti-N+1 for metrics. */
  async getCardValuesForPipeline(pipelineId: number): Promise<Map<number, Record<number, string>>> {
    const mid = getMitraId();
    const rows: any = (await this.db.execute(sql`
      SELECT v.card_id AS cardId, v.field_id AS fieldId, v.value AS value
      FROM pipeline_card_values v JOIN pipeline_cards c ON c.id = v.card_id
      WHERE c.pipeline_id = ${pipelineId} AND v.mitra_id = ${mid}
    `))[0];
    const map = new Map<number, Record<number, string>>();
    for (const r of (rows as any[])) {
      const cid = Number(r.cardId);
      if (!map.has(cid)) map.set(cid, {});
      map.get(cid)![Number(r.fieldId)] = String(r.value ?? "");
    }
    return map;
  }
```
- [ ] **Step 2:** `npx tsc --noEmit` → 0.
- [ ] **Step 3: Commit**
```bash
git add server/storage.ts
git commit -m "feat(metrics): storage metric-def CRUD + getCardValuesForPipeline"
```

---

## Task 4: Server engine `server/pipeline-metrics-engine.ts`

**Files:** Create `server/pipeline-metrics-engine.ts`.

- [ ] **Step 1: Write**
```ts
/** Compute a pipeline's metrics over the permission-filtered card set. */
import type { Request } from "express";
import { storage } from "./storage.js";
import { parseConditionGroups, evaluateConditionGroups } from "./pipeline-automation-helpers.js";
import { aggregate, formatMetricValue, type MetricAggregation, type MetricType } from "../shared/pipelineMetrics.js";
import { resolveCardFilter, cardPassesFilter } from "../shared/cardRowFilter.js";

export interface MetricResult { id: number; name: string; description: string | null; icon: string | null; color: string; type: string; value: number; formatted: string; }

export async function computeAllPipelineMetrics(req: Request, pipelineId: number, rowFilter: import("../shared/fieldRules.js").FieldRuleCondition[][] | null): Promise<MetricResult[]> {
  const defs = (await storage.listMetricDefs(pipelineId)).filter((d) => d.visible === 1);
  if (defs.length === 0) return [];
  const cards = await storage.listCards(pipelineId);
  const valuesByCard = await storage.getCardValuesForPipeline(pipelineId);
  // Permission row-level filter — only cards the requester may see.
  const visibleCards = cards.filter((c) => {
    const vals = valuesByCard.get(c.id) ?? {};
    return cardPassesFilter(rowFilter, { values: vals, stageId: (c as any).stageId });
  });

  const out: MetricResult[] = [];
  for (const def of defs) {
    try {
      const stageIds: number[] = def.stageIds ? JSON.parse(def.stageIds) : [];
      const groups = parseConditionGroups(def.conditions);
      const matching = visibleCards.filter((c) => {
        if (stageIds.length && !stageIds.includes((c as any).stageId)) return false;
        if (groups.length) {
          const rec = valuesByCard.get(c.id) ?? {};
          const vals = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
          if (!evaluateConditionGroups(groups, vals)) return false;
        }
        return true;
      });
      let value = 0;
      if (def.source === "field_agg" && def.fieldId != null) {
        const vals = matching.map((c) => (valuesByCard.get(c.id) ?? {})[def.fieldId as number] ?? null);
        value = aggregate(vals, def.aggregation as MetricAggregation);
      } else {
        value = matching.length; // card_count / stage_count
      }
      out.push({
        id: def.id, name: def.name, description: def.description, icon: def.icon, color: def.color, type: def.type,
        value, formatted: formatMetricValue(value, { type: def.type as MetricType, prefix: def.prefix, suffix: def.suffix, decimals: def.decimals }),
      });
    } catch {
      out.push({ id: def.id, name: def.name, description: def.description, icon: def.icon, color: def.color, type: def.type, value: 0, formatted: formatMetricValue(0, { type: def.type as MetricType }) });
    }
  }
  return out;
}
```
NOTE: `cardPassesFilter`/`resolveCardFilter` from `../shared/cardRowFilter.js` (already used in routes.ts). If `resolveCardFilter` isn't needed (the caller passes the resolved filter), drop that import. Confirm `cardPassesFilter(filter, {values, stageId})` signature against routes.ts usage.

- [ ] **Step 2:** `npx tsc --noEmit` → 0. (Remove the unused `resolveCardFilter` import if tsc flags it — `noUnusedLocals` isn't on, but keep imports clean.)
- [ ] **Step 3: Commit**
```bash
git add server/pipeline-metrics-engine.ts
git commit -m "feat(metrics): computeAllPipelineMetrics engine (stage scope + conditions + aggregate)"
```

---

## Task 5: Endpoints

**Files:** `server/routes.ts`.

- [ ] **Step 1: Imports** — add:
```ts
import { computeAllPipelineMetrics } from "./pipeline-metrics-engine.js";
import { METRIC_SOURCES, METRIC_AGGREGATIONS, METRIC_TYPES } from "../shared/pipelineMetrics.js";
```
- [ ] **Step 2: Endpoints** — place near the `/api/pipelines/:id/collection-metrics` GET. Add:
```ts
  router.get("/api/pipelines/:id/metrics", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requirePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineView(req, res, pid))) return;
    const rowFilter = await getCardFilterForRequest(req, pid);
    return sendSuccess(res, await computeAllPipelineMetrics(req, pid, rowFilter));
  });

  router.get("/api/pipelines/:id/metric-defs", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requirePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineView(req, res, pid))) return;
    return sendSuccess(res, await storage.listMetricDefs(pid));
  });

  router.post("/api/pipelines/:id/metric-defs", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineCapability(req, res, pid, "manage"))) return;
    const err = await validateMetricDef(pid, req.body);
    if (err) return sendError(res, err, 400);
    return sendSuccess(res, await storage.createMetricDef(pid, req.body));
  });

  router.patch("/api/pipelines/:id/metric-defs/:metricId", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineCapability(req, res, pid, "manage"))) return;
    const existing = await storage.getMetricDef(Number(req.params.metricId));
    if (!existing || existing.pipelineId !== pid) return sendError(res, "Metric tidak ditemukan", 404);
    const err = await validateMetricDef(pid, { ...existing, ...req.body, stageIds: req.body.stageIds, conditions: req.body.conditions });
    if (err) return sendError(res, err, 400);
    await storage.updateMetricDef(Number(req.params.metricId), req.body);
    return sendSuccess(res, { ok: true });
  });

  router.delete("/api/pipelines/:id/metric-defs/:metricId", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineCapability(req, res, pid, "manage"))) return;
    const existing = await storage.getMetricDef(Number(req.params.metricId));
    if (!existing || existing.pipelineId !== pid) return sendError(res, "Metric tidak ditemukan", 404);
    await storage.deleteMetricDef(Number(req.params.metricId));
    return sendSuccess(res, { ok: true });
  });
```
- [ ] **Step 3: Validator** — add a helper near `validateConditions`:
```ts
async function validateMetricDef(pipelineId: number, b: any): Promise<string | null> {
  if (!b || typeof b.name !== "string" || !b.name.trim()) return "Nama metric wajib diisi";
  if (!METRIC_SOURCES.some((s) => s.source === b.source)) return "Source metric tidak valid";
  if (!METRIC_AGGREGATIONS.some((a) => a.aggregation === b.aggregation)) return "Agregasi tidak valid";
  if (!METRIC_TYPES.some((t) => t.type === b.type)) return "Tipe metric tidak valid";
  const fields = await storage.listFields(pipelineId);
  const fieldIds = new Set(fields.map((f) => f.id));
  if (b.source === "field_agg" && (typeof b.fieldId !== "number" || !fieldIds.has(b.fieldId))) return "Field agregasi tidak valid";
  if (b.stageIds != null) {
    if (!Array.isArray(b.stageIds)) return "stageIds harus array";
    const stageIds = new Set((await storage.listStages(pipelineId)).map((s) => s.id));
    for (const sid of b.stageIds) if (!stageIds.has(Number(sid))) return "Stage yang dirujuk tidak ada di pipeline ini";
  }
  if (b.conditions != null) {
    const condErr = await validateConditions(pipelineId, b.conditions);
    if (condErr) return condErr;
  }
  return null;
}
```
- [ ] **Step 4:** `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit**
```bash
git add server/routes.ts
git commit -m "feat(metrics): compute + CRUD metric-def endpoints (validated, gated)"
```

---

## Task 6: Client hooks + MetricsStrip + board

**Files:** `client/hooks/usePipelines.ts`, create `client/components/pipelines/metricIcons.ts` + `MetricsStrip.tsx`, modify `client/pages/PipelineBoardPage.tsx`.

- [ ] **Step 1: Icon map** — create `client/components/pipelines/metricIcons.ts`:
```ts
import { Database, Users, Wallet, Phone, BarChart3, AlertCircle, CheckCircle2, XCircle, Calendar, TrendingUp, Clock, Star, type LucideIcon } from "lucide-react";
export const METRIC_ICON_MAP: Record<string, LucideIcon> = {
  Database, Users, Wallet, Phone, BarChart3, AlertCircle, CheckCircle2, XCircle, Calendar, TrendingUp, Clock, Star,
};
```

- [ ] **Step 2: Hooks** — append to `usePipelines.ts`:
```ts
export interface MetricResult { id: number; name: string; description: string | null; icon: string | null; color: string; type: string; value: number; formatted: string; }
export function usePipelineMetrics(pipelineId: number) {
  return useQuery({ queryKey: ["/api/pipelines", pipelineId, "metrics"], queryFn: () => api.get<MetricResult[]>(`/pipelines/${pipelineId}/metrics`) });
}
export function useMetricDefs(pipelineId: number, enabled: boolean) {
  return useQuery({ queryKey: ["/api/pipelines", pipelineId, "metric-defs"], queryFn: () => api.get<any[]>(`/pipelines/${pipelineId}/metric-defs`), enabled });
}
export function useSaveMetricDef(pipelineId: number) {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "metric-defs"] }); qc.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "metrics"] }); };
  return {
    create: useMutation({ mutationFn: (body: any) => api.post(`/pipelines/${pipelineId}/metric-defs`, body), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, body }: { id: number; body: any }) => api.patch(`/pipelines/${pipelineId}/metric-defs/${id}`, body), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: number) => api.delete(`/pipelines/${pipelineId}/metric-defs/${id}`), onSuccess: inv }),
  };
}
```

- [ ] **Step 3: MetricsStrip** — create `client/components/pipelines/MetricsStrip.tsx`:
```tsx
import { Settings2, Plus } from "lucide-react";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { usePipelineMetrics } from "@/hooks/usePipelines";
import { METRIC_ICON_MAP } from "./metricIcons";

export function MetricsStrip({ pipelineId, canManage, onManage }: { pipelineId: number; canManage: boolean; onManage: () => void }) {
  const { data: metrics } = usePipelineMetrics(pipelineId);
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
    <section aria-label="Metrik pipeline" className="px-4 md:px-6 pt-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {list.map((mtr) => (
            <StatTile key={mtr.id} icon={METRIC_ICON_MAP[mtr.icon ?? ""] ?? undefined} label={mtr.name} value={mtr.formatted} description={mtr.description ?? undefined} accent={(mtr.color as any) ?? "primary"} />
          ))}
        </div>
        {canManage && (
          <Button variant="ghost" size="icon-sm" aria-label="Kelola metrik" className="shrink-0 mt-0.5" onClick={onManage}><Settings2 className="size-4" /></Button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Board** — in `client/pages/PipelineBoardPage.tsx`:
  - Import `MetricsStrip` + `MetricsConfigDialog` (Task 7).
  - State: `const [showMetricsCfg, setShowMetricsCfg] = useState(false);`
  - Render `<MetricsStrip pipelineId={pid!} canManage={can("manage")} onManage={() => setShowMetricsCfg(true)} />` immediately BEFORE the `<div className="mt-2"><BoardFilters .../></div>` line (i.e., between the header block and the filters).
  - Mount near the other dialogs: `{showMetricsCfg && pid != null && <MetricsConfigDialog pipelineId={pid} open={showMetricsCfg} onClose={() => setShowMetricsCfg(false)} />}`
  - (`can` + `pid` already exist in the component.)

- [ ] **Step 5:** `npx tsc --noEmit` (MetricsConfigDialog import will fail until Task 7 — acceptable intermediate; OR stub it). To keep this commit green, do Task 7 BEFORE building/committing Task 6, OR temporarily comment the dialog import+mount and add in Task 7. RECOMMENDED: implement Task 7's file first, then this step compiles. Adjust order if needed.

- [ ] **Step 6: Commit** (after Task 7 exists, so the import resolves)
```bash
git add client/hooks/usePipelines.ts client/components/pipelines/metricIcons.ts client/components/pipelines/MetricsStrip.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(metrics): MetricsStrip on board + hooks"
```

---

## Task 7: MetricsConfigDialog

**Files:** Create `client/components/pipelines/MetricsConfigDialog.tsx`.

- [ ] **Step 1: Write** a CRUD dialog. It lists metric defs (`useMetricDefs`) and edits one at a time via a form. Full implementation:
```tsx
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { usePipeline, useMetricDefs, useSaveMetricDef } from "@/hooks/usePipelines";
import { ConditionsBuilder, type DraftCondition } from "./ConditionsBuilder";
import { METRIC_SOURCES, METRIC_AGGREGATIONS, METRIC_TYPES, METRIC_ICONS, METRIC_COLORS } from "@shared/pipelineMetrics";
import { METRIC_ICON_MAP } from "./metricIcons";

type Draft = {
  id?: number; name: string; description: string; icon: string; color: string; type: string;
  source: string; aggregation: string; fieldId: string; stageIds: number[];
  conditions: DraftCondition[][]; prefix: string; suffix: string; decimals: string; visible: boolean;
};
const empty: Draft = { name: "", description: "", icon: "Database", color: "primary", type: "number", source: "card_count", aggregation: "count", fieldId: "", stageIds: [], conditions: [], prefix: "", suffix: "", decimals: "", visible: true };

export function MetricsConfigDialog({ pipelineId, open, onClose }: { pipelineId: number; open: boolean; onClose: () => void }) {
  const { data: pipeline } = usePipeline(pipelineId);
  const { data: defs } = useMetricDefs(pipelineId, open);
  const save = useSaveMetricDef(pipelineId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const fields = pipeline?.fields ?? [];
  const stages = pipeline?.stages ?? [];

  const startEdit = (d: any) => setDraft({
    id: d.id, name: d.name, description: d.description ?? "", icon: d.icon ?? "Database", color: d.color ?? "primary",
    type: d.type, source: d.source, aggregation: d.aggregation, fieldId: d.fieldId != null ? String(d.fieldId) : "",
    stageIds: d.stageIds ? JSON.parse(d.stageIds) : [], conditions: d.conditions?.groups ?? (d.conditions ? JSON.parse(d.conditions).map((g: any[]) => g.map((c) => ({ source: c.source ?? "field", fieldId: typeof c.fieldId === "number" ? c.fieldId : "", attr: c.attr, op: c.op, value: c.value ?? "" }))) : []),
    prefix: d.prefix ?? "", suffix: d.suffix ?? "", decimals: d.decimals != null ? String(d.decimals) : "", visible: d.visible === 1,
  });

  const toPayload = (d: Draft) => ({
    name: d.name, description: d.description || null, icon: d.icon, color: d.color, type: d.type, source: d.source,
    aggregation: d.aggregation, fieldId: d.source === "field_agg" && d.fieldId ? Number(d.fieldId) : null,
    stageIds: d.stageIds, prefix: d.prefix || null, suffix: d.suffix || null,
    decimals: d.decimals.trim() === "" ? null : Number(d.decimals), visible: d.visible,
    conditions: d.conditions.length ? { groups: d.conditions.map((g) => g.filter((c) => c.source === "billing" ? !!c.attr : c.fieldId !== "").map((c) => c.source === "billing" ? { source: "billing", attr: c.attr, op: c.op, value: c.value } : { fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) })).filter((g) => g.length) } : null,
  });

  const onSave = () => {
    if (!draft) return;
    if (!draft.name.trim()) { toast.error("Nama metric wajib diisi"); return; }
    const body = toPayload(draft);
    const opts = { onSuccess: () => { toast.success("Metric disimpan"); setDraft(null); }, onError: (e: any) => toast.error(e?.message || "Gagal menyimpan") };
    if (draft.id) save.update.mutate({ id: draft.id, body }, opts); else save.create.mutate(body, opts);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b shrink-0"><DialogTitle>{draft ? (draft.id ? "Edit Metric" : "Metric Baru") : "Kelola Metrik"}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!draft ? (
            <>
              <Button size="sm" onClick={() => setDraft({ ...empty })}><Plus className="size-3.5 mr-1" /> Metric baru</Button>
              <ul className="space-y-1.5">
                {(defs ?? []).map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                    <span className="text-sm font-medium truncate">{d.name} <span className="text-[10px] text-muted-foreground">· {d.source}{d.visible ? "" : " · hidden"}</span></span>
                    <span className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => startEdit(d)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Hapus" onClick={() => save.remove.mutate(d.id, { onSuccess: () => toast.success("Metric dihapus") })}><Trash2 className="size-4" /></Button>
                    </span>
                  </li>
                ))}
                {(defs ?? []).length === 0 && <li className="text-xs text-muted-foreground">Belum ada metric.</li>}
              </ul>
            </>
          ) : (
            <div className="space-y-3">
              <Input inputSize="sm" placeholder="Nama metric" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <Input inputSize="sm" placeholder="Deskripsi (opsional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Combobox size="sm" options={METRIC_TYPES.map((t) => ({ value: t.type, label: t.label }))} value={draft.type} onChange={(v) => setDraft({ ...draft, type: v || "number" })} clearable={false} />
                <Combobox size="sm" options={METRIC_SOURCES.map((s) => ({ value: s.source, label: s.label }))} value={draft.source} onChange={(v) => setDraft({ ...draft, source: v || "card_count" })} clearable={false} />
              </div>
              {draft.source === "field_agg" && (
                <div className="grid grid-cols-2 gap-2">
                  <Combobox size="sm" options={METRIC_AGGREGATIONS.map((a) => ({ value: a.aggregation, label: a.label }))} value={draft.aggregation} onChange={(v) => setDraft({ ...draft, aggregation: v || "count" })} clearable={false} />
                  <Combobox size="sm" options={fields.map((f) => ({ value: String(f.id), label: f.label }))} value={draft.fieldId} onChange={(v) => setDraft({ ...draft, fieldId: v })} placeholder="Field…" />
                </div>
              )}
              {/* Stage scope */}
              <div>
                <label className="text-[10px] text-muted-foreground">Stage (kosong = semua)</label>
                <div className="flex flex-wrap gap-1.5">
                  {stages.map((s) => {
                    const on = draft.stageIds.includes(s.id);
                    return <button key={s.id} type="button" onClick={() => setDraft({ ...draft, stageIds: on ? draft.stageIds.filter((x) => x !== s.id) : [...draft.stageIds, s.id] })} className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{s.label}</button>;
                  })}
                </div>
              </div>
              {/* WHERE rules */}
              <ConditionsBuilder fields={fields} value={draft.conditions} onChange={(c) => setDraft({ ...draft, conditions: c })} />
              {/* Icon + color */}
              <div className="flex flex-wrap gap-1.5">
                {METRIC_ICONS.map((ic) => { const I = METRIC_ICON_MAP[ic]; return <button key={ic} type="button" aria-label={ic} onClick={() => setDraft({ ...draft, icon: ic })} className={`size-8 rounded-md border flex items-center justify-center ${draft.icon === ic ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>{I && <I className="size-4" />}</button>; })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {METRIC_COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => setDraft({ ...draft, color: c })} className={`text-xs px-2 py-1 rounded-full border ${draft.color === c ? "border-foreground" : "border-border"} ${COLOR_BG[c] ?? "bg-muted"}`}>{c}</button>)}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input inputSize="sm" placeholder="Prefix" value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value })} />
                <Input inputSize="sm" placeholder="Suffix" value={draft.suffix} onChange={(e) => setDraft({ ...draft, suffix: e.target.value })} />
                <Input inputSize="sm" type="number" placeholder="Desimal" value={draft.decimals} onChange={(e) => setDraft({ ...draft, decimals: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={draft.visible} onCheckedChange={(v) => setDraft({ ...draft, visible: v })} /> Tampilkan di board</label>
            </div>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t shrink-0">
          {draft ? (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>Batal</Button>
              <Button onClick={onSave} loading={save.create.isPending || save.update.isPending}>Simpan</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>Tutup</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
NOTE: `usePipeline(pid)` returns `PipelineWithStages` which includes BOTH `stages` AND `fields` (confirmed `client/hooks/usePipelines.ts:7`), so `pipeline?.fields ?? []` and `pipeline?.stages ?? []` are correct — no extra query.

IMPORTANT (Tailwind purge): do NOT use a dynamic `bg-${c}/15` class — Tailwind's JIT won't generate it. Define an explicit map at the top of the file and use it for the swatch background:
```ts
const COLOR_BG: Record<string, string> = {
  primary: "bg-primary/15", success: "bg-success/15", warning: "bg-warning/15",
  danger: "bg-destructive/15", info: "bg-info/15", violet: "bg-violet-500/15", neutral: "bg-muted",
};
```
Then the swatch button className uses `COLOR_BG[c] ?? "bg-muted"` instead of `bg-${...}`.

- [ ] **Step 2:** `npx tsc --noEmit && npm run build` → 0 errors; build OK. Fix the dynamic Tailwind color class with an explicit `COLOR_BG` map if swatches don't render.

- [ ] **Step 3: Commit**
```bash
git add client/components/pipelines/MetricsConfigDialog.tsx
git commit -m "feat(metrics): MetricsConfigDialog (CRUD: icon/color/source/agg/field/stage/conditions/format)"
```

---

## Task 8: Final verification
- [ ] `npx tsc --noEmit && npm run build && npx tsx --test shared/pipelineMetrics.test.ts` → green.
- [ ] `git add -A && git commit -m "chore(metrics): MP1 final verification" || echo "nothing to commit"`

## Manual acceptance (dev)
1. Pipeline board → "Tambah metrik" (manage) → create card_count "Total Kartu", field_agg SUM currency "Outstanding", stage_count "Closing" (stage=WON). Strip shows them between description and filters, formatted, ordered.
2. Add a WHERE condition (custom field = X) → value recomputes.
3. Role with a row-level card filter → metric values only over its visible cards.
4. Hide/delete/reorder → strip updates; other pipelines independent.

## Notes
- Permission: compute uses the requester's row-level card filter (only visible cards counted). Defs CRUD manage-gated. All mitra-scoped.
- WHERE rules in MP1 = field-source conditions + stage scope; billing/assignee sources deferred (MP-later).
- The collection SP5 "Metrik" dialog is untouched.
