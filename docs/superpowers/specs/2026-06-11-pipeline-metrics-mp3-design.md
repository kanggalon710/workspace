# Spec - MP3: Pipeline Formula Metrics

> Date: 2026-06-11 · Mitra-scoped · Sub-project 3 of the Pipeline Metrics epic. Build on `dev`.
> Depends on MP1 + MP2 (both merged to `dev`). Design decided collaboratively.

## Goal

Let a metric combine several inline aggregations arithmetically - `(a/b)*100`, `a*b-c`, ratios like
paid/total - via a new `formula` source. Satisfies epic criterion: formula builder + ratio.

## Decisions (confirmed)
1. **Inline terms**, not references to other saved metrics. A formula metric is self-contained.
2. **Reuse existing display types** (number/currency/percentage). A ratio is just `a/b` shown as
   percentage. No new "ratio" display type.
3. **Full expression** with a **safe pure parser** (shunting-yard, never `eval()`): `+ - * /`,
   parentheses, standard precedence. Divide-by-zero → 0.
4. Each term carries its **own** stage scope + WHERE conditions (so `paid/total` works).
5. **Out of scope (defer):** per-term time windows, cross-metric references, a dedicated `x : y`
   ratio display type.

## 1. Schema - add 2 columns to `pipeline_metrics`
Via the guarded `loyaltyColumnAdditions` array (info_schema COUNT check → `ALTER TABLE ADD COLUMN`):
- `terms TEXT` - JSON array of inline terms (null for non-formula metrics).
- `formula VARCHAR(255)` - the expression string (null for non-formula metrics).

Add matching Drizzle columns to `pipelineMetrics`: `terms: text("terms")`, `formula: varchar("formula", { length: 255 })`.

**New source value:** `"formula"` joins the existing `METRIC_SOURCES` in `shared/pipelineMetrics.ts`
(`card_count` / `stage_count` / `field_agg` / **`formula`**). Label "Formula".

**Term shape** (stored in `terms` JSON):
```ts
type FormulaTerm = {
  key: string;            // "a".."h", unique within the metric
  source: "card_count" | "field_agg";  // stage_count ≡ card_count + stage scope
  aggregation: MetricAggregation;       // count/sum/avg/min/max/distinct
  fieldId: number | null;               // required when source==="field_agg"
  stageIds: number[];                   // [] = all stages
  conditions: { groups: ... } | null;   // same shape as a metric's WHERE (reused)
};
```

## 2. Pure module - `shared/metricFormula.ts` (tested)
```ts
export const FORMULA_TERM_KEYS = ["a","b","c","d","e","f","g","h"];   // max 8 terms
/** Validate an expression against the set of defined term keys. */
export function parseFormula(expr: string, allowedKeys: string[]): { ok: true } | { ok: false; error: string };
/** Evaluate with standard precedence + parens. Divide-by-zero → 0. Throws on parse error
 * (caller - the engine - catches and renders a zero tile). Unknown identifier → throws. */
export function evaluateFormula(expr: string, values: Record<string, number>): number;
```
Implementation: a tokenizer (numbers incl. decimals, identifiers `[a-z]`, operators `+ - * /`,
parens) → shunting-yard to RPN → RPN evaluation. `* /` bind tighter than `+ -`; left-associative;
balanced parens required. `parseFormula` reuses the tokenizer/parser to report validity without
evaluating. Reject: unknown identifier (not in allowedKeys), unbalanced parens, empty expression,
trailing/leading operator, consecutive operators.

Tests (`shared/metricFormula.test.ts`):
- precedence: `a+b*c` with {a:1,b:2,c:3} → 7; `(a+b)*c` → 9.
- divide: `a/b` {a:1,b:0} → 0 (divide-by-zero); `a/b` {a:10,b:4} → 2.5.
- `(a/b)*100` {a:3,b:4} → 75.
- subtraction/assoc: `a-b-c` {a:10,b:3,c:2} → 5.
- parseFormula ok: `(a/b)*100` with ["a","b"] → ok.
- parseFormula rejects: unknown id `a+z` with ["a"]; unbalanced `(a+b`; empty ``; trailing `a+`;
  double-op `a++b`.

## 3. Engine - `server/pipeline-metrics-engine.ts`
In the per-metric loop, the existing pipeline already produces `timed` (cards after row-permission
filter + metric stage scope + metric WHERE + **MP2 time window**). Add a branch BEFORE the current
`field_agg`/else value computation:

```ts
if (def.source === "formula") {
  const terms = def.terms ? JSON.parse(def.terms) : [];
  const values: Record<string, number> = {};
  for (const t of terms) {
    // Filter the already-time-scoped `timed` cards by THIS term's stage scope + WHERE.
    const tStages: number[] = Array.isArray(t.stageIds) ? t.stageIds : [];
    const tGroups = parseConditionGroups(t.conditions ? JSON.stringify(t.conditions) : null);
    const tCards = timed.filter((c) => {
      if (tStages.length && !tStages.includes((c as any).stageId)) return false;
      if (tGroups.length) {
        const rec = valuesByCard.get(c.id) ?? {};
        const vals = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
        if (!evaluateConditionGroups(tGroups, vals)) return false;
      }
      return true;
    });
    if (t.source === "field_agg" && t.fieldId != null) {
      values[t.key] = aggregate(tCards.map((c) => (valuesByCard.get(c.id) ?? {})[t.fieldId] ?? null), t.aggregation);
    } else {
      values[t.key] = tCards.length;
    }
  }
  value = evaluateFormula(def.formula ?? "", values);   // throws on bad expr → caught → zero tile
} else if (def.source === "field_agg" && def.fieldId != null) {
  ... existing ...
} else {
  value = timed.length;
}
```
`parseConditionGroups` already accepts a JSON string (same as metric-level conditions), so the term's
`conditions` object is re-stringified before passing. The metric-level `stageIds`/WHERE/time window
still apply first (a formula metric MAY also have its own metric-level scope, though typically empty).

## 4. Validation - `validateMetricDef` (`server/routes.ts`)
`"formula"` must be accepted by the existing `METRIC_SOURCES.some(...)` check (it's added to that
registry, so it passes automatically). Then add, when `b.source === "formula"`:
- `b.terms` is a non-empty array; ≤ 8 terms; each `key` ∈ FORMULA_TERM_KEYS and unique.
- per term: if `source === "field_agg"` then `fieldId` ∈ pipeline fields; `aggregation` ∈
  METRIC_AGGREGATIONS; `stageIds` (if present) ⊂ pipeline stages; `conditions` (if present) valid via
  the existing `validateConditions(pipelineId, ...)`.
- `parseFormula(b.formula ?? "", termKeys).ok` - else 400 with the parser's error.

(`field_agg`-specific `fieldId` validation at the metric level is skipped for `formula` - a formula
metric has no top-level `fieldId`; its inputs are the terms.)

## 5. Storage - `server/storage.ts`
`createMetricDef`/`updateMetricDef` persist `terms` (JSON.stringify when array, else null) and
`formula` (string or null). `terms` follows the same `JSON.stringify` treatment as `stageIds`.

## 6. Client
- `shared/pipelineMetrics.ts`: add `{ source: "formula", label: "Formula" }` to `METRIC_SOURCES`
  and extend the `MetricSource` union.
- `MetricsConfigDialog`:
  - `Draft` gains `terms: TermDraft[]` and `formula: string`. `TermDraft = { key; source;
    aggregation; fieldId: string; stageIds: number[]; conditions: DraftCondition[][] }`.
  - When `source === "formula"`: hide the existing single field/agg row; render a **terms editor** -
    a list of term rows, each with: a read-only key badge (a,b,c…), a source select (Jumlah Kartu /
    Agregasi Field), an aggregation select + field select (when field_agg), stage chips, and a
    `ConditionsBuilder` (all reusing the existing controls). "Tambah term" appends the next key (cap
    8); a remove button per term. Below the list, a **formula text Input** with a live badge: green
    "valid" / red error from `parseFormula(formula, termKeys)`.
  - `startEdit` deserializes `terms` (JSON string → TermDraft[], conditions via the same robust
    `{groups}`-vs-legacy logic already used for the metric's conditions) and `formula`.
  - `toPayload` serializes `terms` (each term's conditions → `{groups}` like the metric WHERE; drop
    incomplete terms) and `formula`. For non-formula sources, send `terms: null, formula: null`.
- The board strip + MP2 time controls are unchanged. A formula metric's tile renders via the normal
  `formatMetricValue` path (its `type` = number/currency/percentage).

## 7. Testing
`shared/metricFormula.test.ts` (pure). Engine/endpoint/UI: typecheck + build + manual on dev.

## 8. Manual acceptance (dev)
1. Create a formula metric "Success Rate": term a = Jumlah Kartu (stage = Lunas), term b = Jumlah
   Kartu (all stages), formula `(a/b)*100`, type = Persen → shows the paid percentage.
2. Create "Avg Ticket × Count": a = SUM(amount), b = COUNT, formula `a/b`, type = Rupiah → average.
3. Divide-by-zero: a/b with b=0 → tile shows 0 (no crash).
4. Invalid formula in the dialog (`a+`) → red badge, save blocked (400 if forced).
5. A formula metric with metric-level time basis (MP2, e.g. created/7d) → terms compute over the
   last-7-day cards.
6. Edit a saved formula metric → terms + expression round-trip into the dialog.

## 9. Out of scope (→ MP4 / future)
Per-term time windows, references to other saved metrics, a dedicated `x : y` ratio display type,
non-card data sources (MP4).
