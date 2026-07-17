# Pipeline Formula Metrics (MP3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `formula` metric source that combines several inline aggregations (terms a..h, each with its own stage scope + WHERE) via a safe arithmetic expression like `(a/b)*100`.

**Architecture:** A pure module `shared/metricFormula.ts` tokenizes + parses (shunting-yard, no `eval`) and evaluates expressions with precedence/parens, divide-by-zero→0. Two new nullable columns on `pipeline_metrics` (`terms` JSON, `formula` string) persist the inputs. The engine, when `source === "formula"`, computes each term over the already-time-scoped card set (`timed` from MP2) and evaluates the expression. The config dialog gets a terms editor (reusing existing source/agg/field/stage/ConditionsBuilder controls) + a formula input with a live valid/invalid badge.

**Tech Stack:** TypeScript, Drizzle ORM (MySQL), Express, React + TanStack Query, `node:test`.

---

## Decisions (from spec `docs/superpowers/specs/2026-06-11-pipeline-metrics-mp3-design.md`)
1. Inline terms (self-contained), not references to other metrics.
2. Reuse number/currency/percentage display. Ratio = `a/b` shown as percentage.
3. Full expression + safe pure parser (no `eval`). Divide-by-zero → 0.
4. Each term has its own stageIds + WHERE conditions.
5. Out of scope: per-term time windows, cross-metric refs, `x:y` display type.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `shared/metricFormula.ts` | Pure: `FORMULA_TERM_KEYS`, `parseFormula`, `evaluateFormula` | Create |
| `shared/metricFormula.test.ts` | Pure tests | Create |
| `shared/pipelineMetrics.ts` | Add `"formula"` to `MetricSource` + `METRIC_SOURCES` | Modify |
| `shared/schema.ts` | `pipelineMetrics`: `terms`, `formula` columns | Modify |
| `server/storage.ts` | migration entries + persist `terms`/`formula` in CRUD | Modify |
| `server/pipeline-metrics-engine.ts` | formula branch in the per-metric loop | Modify |
| `server/routes.ts` | `validateMetricDef` formula branch | Modify |
| `client/components/pipelines/MetricsConfigDialog.tsx` | terms editor + formula input + badge; Draft/startEdit/toPayload | Modify |

> No client hook change (formula reuses the metrics/metric-defs endpoints unchanged). No strip change.

---

## Task 1: Pure module `shared/metricFormula.ts` + tests

**Files:**
- Create: `shared/metricFormula.ts`
- Test: `shared/metricFormula.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/metricFormula.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMULA_TERM_KEYS, parseFormula, evaluateFormula } from "./metricFormula.js";

test("FORMULA_TERM_KEYS is a..h", () => {
  assert.deepEqual(FORMULA_TERM_KEYS, ["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("precedence: * binds tighter than +", () => {
  assert.equal(evaluateFormula("a+b*c", { a: 1, b: 2, c: 3 }), 7);
});

test("parentheses override precedence", () => {
  assert.equal(evaluateFormula("(a+b)*c", { a: 1, b: 2, c: 3 }), 9);
});

test("division works and is left-associative", () => {
  assert.equal(evaluateFormula("a/b", { a: 10, b: 4 }), 2.5);
  assert.equal(evaluateFormula("a-b-c", { a: 10, b: 3, c: 2 }), 5);
});

test("divide-by-zero yields 0 (whole result)", () => {
  assert.equal(evaluateFormula("a/b", { a: 1, b: 0 }), 0);
  assert.equal(evaluateFormula("a/b+c", { a: 1, b: 0, c: 5 }), 0);
});

test("(a/b)*100 computes a percentage", () => {
  assert.equal(evaluateFormula("(a/b)*100", { a: 3, b: 4 }), 75);
});

test("numeric literals (incl. decimals) are allowed", () => {
  assert.equal(evaluateFormula("a*1.5", { a: 2 }), 3);
});

test("parseFormula accepts a valid expression over the allowed keys", () => {
  assert.deepEqual(parseFormula("(a/b)*100", ["a", "b"]), { ok: true });
});

test("parseFormula rejects an unknown identifier", () => {
  const r = parseFormula("a+z", ["a"]);
  assert.equal(r.ok, false);
});

test("parseFormula rejects unbalanced parens", () => {
  assert.equal(parseFormula("(a+b", ["a", "b"]).ok, false);
});

test("parseFormula rejects empty / trailing-operator / double-operator", () => {
  assert.equal(parseFormula("", ["a"]).ok, false);
  assert.equal(parseFormula("a+", ["a"]).ok, false);
  assert.equal(parseFormula("a++b", ["a", "b"]).ok, false);
});

test("evaluateFormula throws on a parse error (engine catches it)", () => {
  assert.throws(() => evaluateFormula("a+", { a: 1 }));
  assert.throws(() => evaluateFormula("a+z", { a: 1 }));
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `npx tsx --test shared/metricFormula.test.ts`
Expected: FAIL — `Cannot find module './metricFormula.js'`.

- [ ] **Step 3: Implement `shared/metricFormula.ts`**

```ts
/** Pure, safe formula parser + evaluator for pipeline metrics — NO eval(). Shunting-yard → RPN. */

export const FORMULA_TERM_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lp" }
  | { t: "rp" };

/** Tokenize. Throws on an unrecognized character. */
function tokenize(expr: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") { toks.push({ t: "op", v: ch }); i++; continue; }
    if (ch === "(") { toks.push({ t: "lp" }); i++; continue; }
    if (ch === ")") { toks.push({ t: "rp" }); i++; continue; }
    if (ch >= "0" && ch <= "9" || ch === ".") {
      let j = i + 1;
      while (j < expr.length && ((expr[j] >= "0" && expr[j] <= "9") || expr[j] === ".")) j++;
      const num = Number(expr.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Angka tidak valid: ${expr.slice(i, j)}`);
      toks.push({ t: "num", v: num }); i = j; continue;
    }
    if (ch >= "a" && ch <= "z") { toks.push({ t: "id", v: ch }); i++; continue; }
    throw new Error(`Karakter tidak valid: ${ch}`);
  }
  return toks;
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

/** Convert token stream to RPN. Throws on malformed expressions (unbalanced parens, bad operator placement). */
function toRpn(toks: Tok[], allowedKeys: string[]): Tok[] {
  const out: Tok[] = [];
  const ops: Tok[] = [];
  let prev: Tok | null = null; // for detecting unary/leading/double operators
  for (const tok of toks) {
    if (tok.t === "num") {
      if (prev && (prev.t === "num" || prev.t === "id" || prev.t === "rp")) throw new Error("Operand tanpa operator");
      out.push(tok);
    } else if (tok.t === "id") {
      if (!allowedKeys.includes(tok.v)) throw new Error(`Term tidak dikenal: ${tok.v}`);
      if (prev && (prev.t === "num" || prev.t === "id" || prev.t === "rp")) throw new Error("Operand tanpa operator");
      out.push(tok);
    } else if (tok.t === "op") {
      // No leading operator and no two operators in a row.
      if (prev === null || prev.t === "op" || prev.t === "lp") throw new Error("Operator di posisi salah");
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === "op" && PREC[top.v] >= PREC[tok.v]) out.push(ops.pop()!);
        else break;
      }
      ops.push(tok);
    } else if (tok.t === "lp") {
      if (prev && (prev.t === "num" || prev.t === "id" || prev.t === "rp")) throw new Error("Kurung buka di posisi salah");
      ops.push(tok);
    } else if (tok.t === "rp") {
      if (prev === null || prev.t === "op" || prev.t === "lp") throw new Error("Kurung tutup di posisi salah");
      let found = false;
      while (ops.length) {
        const top = ops.pop()!;
        if (top.t === "lp") { found = true; break; }
        out.push(top);
      }
      if (!found) throw new Error("Kurung tidak seimbang");
    }
    prev = tok;
  }
  if (prev === null) throw new Error("Ekspresi kosong");
  if (prev.t === "op" || prev.t === "lp") throw new Error("Ekspresi berakhir dengan operator");
  while (ops.length) {
    const top = ops.pop()!;
    if (top.t === "lp" || top.t === "rp") throw new Error("Kurung tidak seimbang");
    out.push(top);
  }
  return out;
}

/** Evaluate RPN. Divide-by-zero short-circuits the WHOLE result to 0 via a sentinel throw caught here. */
function evalRpn(rpn: Tok[], values: Record<string, number>): number {
  const st: number[] = [];
  for (const tok of rpn) {
    if (tok.t === "num") st.push(tok.v);
    else if (tok.t === "id") st.push(Number(values[tok.v] ?? 0));
    else if (tok.t === "op") {
      const b = st.pop(); const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("Ekspresi tidak valid");
      let r: number;
      switch (tok.v) {
        case "+": r = a + b; break;
        case "-": r = a - b; break;
        case "*": r = a * b; break;
        case "/": if (b === 0) return 0; r = a / b; break;
        default: throw new Error("Operator tidak dikenal");
      }
      st.push(r);
    }
  }
  if (st.length !== 1) throw new Error("Ekspresi tidak valid");
  return st[0];
}

/** Validate without evaluating. Returns {ok:true} or {ok:false,error}. Empty → invalid. */
export function parseFormula(expr: string, allowedKeys: string[]): { ok: true } | { ok: false; error: string } {
  if (!expr || !expr.trim()) return { ok: false, error: "Ekspresi kosong" };
  try { toRpn(tokenize(expr), allowedKeys); return { ok: true }; }
  catch (e: any) { return { ok: false, error: e?.message || "Ekspresi tidak valid" }; }
}

/** Evaluate. Throws on a parse error (the engine catches and renders a zero tile). Divide-by-zero → 0. */
export function evaluateFormula(expr: string, values: Record<string, number>): number {
  const rpn = toRpn(tokenize(expr), Object.keys(values));
  const out = evalRpn(rpn, values);
  return Number.isFinite(out) ? out : 0;
}
```

> Note on `evaluateFormula` allowed keys: it derives them from `Object.keys(values)`, so any identifier
> in the expression must have a provided value (the engine always supplies every defined term). The
> stricter key check lives in `parseFormula`, which the dialog + server validation use.

- [ ] **Step 4: Run the test, verify it PASSES**

Run: `npx tsx --test shared/metricFormula.test.ts`
Expected: PASS — all green. Debug the implementation (not the tests) until green.

- [ ] **Step 5: Commit**

```bash
git add shared/metricFormula.ts shared/metricFormula.test.ts
git commit -m "$(cat <<'EOF'
feat(metrics): pure metricFormula parser/evaluator (shunting-yard, no eval)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Register the `formula` source + schema columns + migration

**Files:**
- Modify: `shared/pipelineMetrics.ts`
- Modify: `shared/schema.ts` (`pipelineMetrics` table)
- Modify: `server/storage.ts` (`loyaltyColumnAdditions`)

- [ ] **Step 1: Add `formula` to the source registry**

In `shared/pipelineMetrics.ts`, extend the `MetricSource` union and `METRIC_SOURCES`:

```ts
export type MetricSource = "card_count" | "stage_count" | "field_agg" | "formula";
```
```ts
export const METRIC_SOURCES: { source: MetricSource; label: string }[] = [
  { source: "card_count", label: "Jumlah Kartu" },
  { source: "stage_count", label: "Jumlah Kartu per Stage" },
  { source: "field_agg", label: "Agregasi Field" },
  { source: "formula", label: "Formula" },
];
```

- [ ] **Step 2: Add the Drizzle columns**

In `shared/schema.ts`, in the `pipelineMetrics` table, add after the `timeTo: text("time_to"),` line (added in MP2) and before `position`:

```ts
  timeTo: text("time_to"),                              // custom range end (YYYY-MM-DD)
  terms: text("terms"),                                 // formula source: JSON FormulaTerm[]
  formula: varchar("formula", { length: 255 }),         // formula source: expression string
  position: int("position").notNull().default(0),
```

- [ ] **Step 3: Add the migration entries**

In `server/storage.ts`, append to `loyaltyColumnAdditions` (after the four MP2 `time_*` entries):

```ts
      { table: "pipeline_metrics", column: "time_to",     ddl: "TEXT NULL" },
      { table: "pipeline_metrics", column: "terms",       ddl: "TEXT NULL" },
      { table: "pipeline_metrics", column: "formula",     ddl: "VARCHAR(255) NULL" },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/pipelineMetrics.ts shared/schema.ts server/storage.ts
git commit -m "$(cat <<'EOF'
feat(metrics): register formula source + terms/formula columns + migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Storage persists `terms` + `formula`

**Files:**
- Modify: `server/storage.ts` (`createMetricDef`, `updateMetricDef`)

- [ ] **Step 1: Persist in `createMetricDef`**

In the `.values({...})` object, after the four `timeField/timePreset/timeFrom/timeTo` lines (added in MP2), add:

```ts
      timeFrom: data.timeFrom ?? null, timeTo: data.timeTo ?? null,
      terms: data.terms ? JSON.stringify(data.terms) : null,
      formula: data.formula ?? null,
      position: data.position ?? 0, visible: data.visible === false ? 0 : 1, createdAt: now,
```

- [ ] **Step 2: Persist in `updateMetricDef`**

`formula` is a plain scalar — add it to the copy-loop key array. `terms` is JSON — handle it like `stageIds`. In `updateMetricDef`:

```ts
    for (const k of ["name", "description", "icon", "color", "type", "source", "aggregation", "fieldId", "prefix", "suffix", "decimals", "position", "timeField", "timePreset", "timeFrom", "timeTo", "formula"]) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.stageIds !== undefined) patch.stageIds = data.stageIds ? JSON.stringify(data.stageIds) : null;
    if (data.terms !== undefined) patch.terms = data.terms ? JSON.stringify(data.terms) : null;
    if (data.conditions !== undefined) patch.conditions = data.conditions ? JSON.stringify(data.conditions) : null;
```

(Add only the `terms` line; the `stageIds`/`conditions`/loop lines already exist — extend the loop array with `"formula"` and insert the new `terms` line next to the `stageIds` one.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(metrics): persist terms + formula in metric CRUD

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Engine computes formula metrics

**Files:**
- Modify: `server/pipeline-metrics-engine.ts`

- [ ] **Step 1: Import `evaluateFormula`**

Add to the imports at the top:

```ts
import { evaluateFormula } from "../shared/metricFormula.js";
```

- [ ] **Step 2: Add the formula branch**

In the per-metric `try` block, the current value computation reads (after the MP2 time filter that produces `timed`):

```ts
      let value = 0;
      if (def.source === "field_agg" && def.fieldId != null) {
        const vals = timed.map((c) => (valuesByCard.get(c.id) ?? {})[def.fieldId as number] ?? null);
        value = aggregate(vals, def.aggregation as MetricAggregation);
      } else {
        value = timed.length; // card_count / stage_count
      }
```

Replace it with a leading `formula` branch:

```ts
      let value = 0;
      if (def.source === "formula") {
        const terms: any[] = (def as any).terms ? JSON.parse((def as any).terms) : [];
        const values: Record<string, number> = {};
        for (const t of terms) {
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
            values[t.key] = aggregate(
              tCards.map((c) => (valuesByCard.get(c.id) ?? {})[t.fieldId as number] ?? null),
              t.aggregation as MetricAggregation,
            );
          } else {
            values[t.key] = tCards.length;
          }
        }
        value = evaluateFormula((def as any).formula ?? "", values); // throws on bad expr → caught → zero tile
      } else if (def.source === "field_agg" && def.fieldId != null) {
        const vals = timed.map((c) => (valuesByCard.get(c.id) ?? {})[def.fieldId as number] ?? null);
        value = aggregate(vals, def.aggregation as MetricAggregation);
      } else {
        value = timed.length; // card_count / stage_count
      }
```

`parseConditionGroups` and `evaluateConditionGroups` are already imported in this file. The term's
`conditions` is the parsed object (or null) — re-stringify it for `parseConditionGroups`, exactly as
the metric-level conditions are handled.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/pipeline-metrics-engine.ts
git commit -m "$(cat <<'EOF'
feat(metrics): engine computes formula metrics from inline terms

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Validation for formula metrics

**Files:**
- Modify: `server/routes.ts` (`validateMetricDef`)

- [ ] **Step 1: Import the formula helpers**

Near the top of `server/routes.ts`, add (next to the existing `metricTimeWindow` import added in MP2):

```ts
import { FORMULA_TERM_KEYS, parseFormula } from "../shared/metricFormula.js";
```

- [ ] **Step 2: Branch the field-agg requirement + add the formula block**

In `validateMetricDef`, the current code has:

```ts
  const fields = await storage.listFields(pipelineId);
  const fieldIds = new Set(fields.map((f) => f.id));
  if (b.source === "field_agg" && (typeof b.fieldId !== "number" || !fieldIds.has(b.fieldId))) return "Field agregasi tidak valid";
```

After that `if`, add a formula-specific block (it does NOT require a top-level fieldId; its inputs are the terms):

```ts
  if (b.source === "formula") {
    if (!Array.isArray(b.terms) || b.terms.length === 0) return "Formula butuh minimal satu term";
    if (b.terms.length > FORMULA_TERM_KEYS.length) return `Maksimal ${FORMULA_TERM_KEYS.length} term`;
    const stageIdSet = new Set((await storage.listStages(pipelineId)).map((s) => s.id));
    const seen = new Set<string>();
    for (const t of b.terms) {
      if (!FORMULA_TERM_KEYS.includes(t.key)) return "Key term tidak valid";
      if (seen.has(t.key)) return "Key term duplikat";
      seen.add(t.key);
      if (t.source !== "card_count" && t.source !== "field_agg") return "Source term tidak valid";
      if (!METRIC_AGGREGATIONS.some((a) => a.aggregation === t.aggregation)) return "Agregasi term tidak valid";
      if (t.source === "field_agg" && (typeof t.fieldId !== "number" || !fieldIds.has(t.fieldId))) return "Field term tidak valid";
      if (t.stageIds != null) {
        if (!Array.isArray(t.stageIds)) return "stageIds term harus array";
        for (const sid of t.stageIds) if (!stageIdSet.has(Number(sid))) return "Stage term tidak ada di pipeline ini";
      }
      if (t.conditions != null) {
        const condErr = await validateConditions(pipelineId, t.conditions);
        if (condErr) return condErr;
      }
    }
    const fr = parseFormula(typeof b.formula === "string" ? b.formula : "", b.terms.map((t: any) => t.key));
    if (!fr.ok) return `Formula tidak valid: ${fr.error}`;
  }
```

`METRIC_AGGREGATIONS` and `validateConditions` are already imported/defined in this file. Place this
block before the `stageIds` block so the formula's own checks run regardless of top-level stageIds.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "$(cat <<'EOF'
feat(metrics): validate formula metrics (terms + expression)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Config dialog — terms editor + formula input

**Files:**
- Modify: `client/components/pipelines/MetricsConfigDialog.tsx`

> This is the largest task. The existing dialog already imports `Combobox`, `Input`, `ConditionsBuilder` (`type DraftCondition`), `METRIC_SOURCES`, `METRIC_AGGREGATIONS`, and has `fields`/`stages` from `usePipeline`. Read the whole file first.

- [ ] **Step 1: Import the formula helpers + add a TermDraft type**

Add to the imports:

```ts
import { FORMULA_TERM_KEYS, parseFormula } from "@shared/metricFormula";
```

Above the `Draft` type, add:

```ts
type TermDraft = {
  key: string; source: string; aggregation: string; fieldId: string;
  stageIds: number[]; conditions: DraftCondition[][];
};
```

- [ ] **Step 2: Extend `Draft` + `empty`**

Add to the `Draft` type (after the MP2 time fields):

```ts
  timeField: string; timePreset: string; timeFrom: string; timeTo: string;
  terms: TermDraft[]; formula: string;
};
```

Add to `empty` (after the MP2 time defaults):

```ts
const empty: Draft = { name: "", description: "", icon: "Database", color: "primary", type: "number", source: "card_count", aggregation: "count", fieldId: "", stageIds: [], conditions: [], prefix: "", suffix: "", decimals: "", visible: true, timeField: "none", timePreset: "all", timeFrom: "", timeTo: "", terms: [], formula: "" };
```

- [ ] **Step 3: Read them in `startEdit`**

Add to the object passed to `setDraft` (after the MP2 time fields):

```ts
    timeField: d.timeField ?? "none", timePreset: d.timePreset ?? "all", timeFrom: d.timeFrom ?? "", timeTo: d.timeTo ?? "",
    terms: (() => {
      const arr: any[] = d.terms ? JSON.parse(d.terms) : [];
      return arr.map((t) => ({
        key: t.key, source: t.source ?? "card_count", aggregation: t.aggregation ?? "count",
        fieldId: t.fieldId != null ? String(t.fieldId) : "", stageIds: Array.isArray(t.stageIds) ? t.stageIds : [],
        conditions: (() => {
          const p = t.conditions ?? null;
          const gs: any[][] = p && Array.isArray(p.groups) ? p.groups : Array.isArray(p) ? [p] : [];
          return gs.map((g) => g.map((c: any) => ({ source: c.source ?? "field", fieldId: typeof c.fieldId === "number" ? c.fieldId : "", attr: c.attr, op: c.op, value: c.value ?? "" })));
        })(),
      }));
    })(),
    formula: d.formula ?? "",
```

> The term `conditions` is stored as a parsed object (`{groups}`) inside the `terms` JSON — NOT a
> separate JSON string. So unlike the metric-level conditions (which are a JSON string needing
> `JSON.parse`), here `t.conditions` is already an object. The branch above handles `{groups}` vs a
> legacy flat array without a second `JSON.parse`.

- [ ] **Step 4: Serialize them in `toPayload`**

Add a `serializeConds` local at the top of `toPayload` (reuse the metric-level conditions logic) OR inline it. Add to the returned object:

```ts
    terms: d.source === "formula"
      ? d.terms.map((t) => ({
          key: t.key, source: t.source, aggregation: t.aggregation,
          fieldId: t.source === "field_agg" && t.fieldId ? Number(t.fieldId) : null,
          stageIds: t.stageIds,
          conditions: t.conditions.length
            ? { groups: t.conditions.map((g) => g.filter((c) => c.source === "billing" ? !!c.attr : c.fieldId !== "").map((c) => c.source === "billing" ? { source: "billing", attr: c.attr, op: c.op, value: c.value } : { fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) })).filter((g) => g.length) }
            : null,
        })).filter((t) => t.source !== "field_agg" || t.fieldId != null)
      : null,
    formula: d.source === "formula" ? d.formula : null,
```

> The per-term `conditions` serialization mirrors the existing metric-level `conditions` serialization
> in `toPayload` (the `{groups: ...}` map/filter). Keep them identical.

- [ ] **Step 5: Render the terms editor + formula input**

In the editor JSX, the existing block is:

```tsx
              {draft.source === "field_agg" && (
                <div className="grid grid-cols-2 gap-2">
                  ... aggregation + field comboboxes ...
                </div>
              )}
```

Right AFTER that block, add the formula UI (shown only when `source === "formula"`):

```tsx
              {draft.source === "formula" && (
                <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-muted-foreground">Term (a, b, c…)</label>
                    {draft.terms.length < FORMULA_TERM_KEYS.length && (
                      <Button type="button" variant="ghost" size="xs" onClick={() => setDraft({ ...draft, terms: [...draft.terms, { key: FORMULA_TERM_KEYS[draft.terms.length], source: "card_count", aggregation: "count", fieldId: "", stageIds: [], conditions: [] }] })}>+ Term</Button>
                    )}
                  </div>
                  {draft.terms.map((t, ti) => (
                    <div key={t.key} className="space-y-1.5 rounded-md border border-border/50 p-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tight text-xs font-bold w-5 text-center">{t.key}</span>
                        <Combobox size="sm" className="flex-1" options={[{ value: "card_count", label: "Jumlah Kartu" }, { value: "field_agg", label: "Agregasi Field" }]} value={t.source} onChange={(v) => { const terms = [...draft.terms]; terms[ti] = { ...t, source: v || "card_count" }; setDraft({ ...draft, terms }); }} clearable={false} />
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Hapus term" onClick={() => setDraft({ ...draft, terms: draft.terms.filter((_, x) => x !== ti).map((tt, x) => ({ ...tt, key: FORMULA_TERM_KEYS[x] })) })}><Trash2 className="size-4" /></Button>
                      </div>
                      {t.source === "field_agg" && (
                        <div className="grid grid-cols-2 gap-2">
                          <Combobox size="sm" options={METRIC_AGGREGATIONS.map((a) => ({ value: a.aggregation, label: a.label }))} value={t.aggregation} onChange={(v) => { const terms = [...draft.terms]; terms[ti] = { ...t, aggregation: v || "count" }; setDraft({ ...draft, terms }); }} clearable={false} />
                          <Combobox size="sm" options={fields.map((f) => ({ value: String(f.id), label: f.label }))} value={t.fieldId} onChange={(v) => { const terms = [...draft.terms]; terms[ti] = { ...t, fieldId: v }; setDraft({ ...draft, terms }); }} placeholder="Field…" />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {stages.map((s) => {
                          const on = t.stageIds.includes(s.id);
                          return <button key={s.id} type="button" onClick={() => { const terms = [...draft.terms]; terms[ti] = { ...t, stageIds: on ? t.stageIds.filter((x) => x !== s.id) : [...t.stageIds, s.id] }; setDraft({ ...draft, terms }); }} className={`text-2xs px-1.5 py-0.5 rounded-full border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{s.label}</button>;
                        })}
                      </div>
                      <ConditionsBuilder fields={fields} value={t.conditions} onChange={(c) => { const terms = [...draft.terms]; terms[ti] = { ...t, conditions: c }; setDraft({ ...draft, terms }); }} />
                    </div>
                  ))}
                  {draft.terms.length === 0 && <p className="text-2xs text-muted-foreground">Tambah minimal satu term.</p>}
                  <div>
                    <Input inputSize="sm" placeholder="Ekspresi mis. (a/b)*100" value={draft.formula} onChange={(e) => setDraft({ ...draft, formula: e.target.value })} />
                    {draft.formula.trim() !== "" && (() => {
                      const fr = parseFormula(draft.formula, draft.terms.map((t) => t.key));
                      return <p className={`text-2xs mt-1 ${fr.ok ? "text-success" : "text-destructive"}`}>{fr.ok ? "Formula valid" : fr.error}</p>;
                    })()}
                  </div>
                </div>
              )}
```

(`Trash2` is already imported in this file. `Button` `size="xs"` exists per the design system. `fields` and `stages` are already in scope.)

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/components/pipelines/MetricsConfigDialog.tsx
git commit -m "$(cat <<'EOF'
feat(metrics): config dialog terms editor + formula input with live badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Full verification + handoff

**Files:** none (verification only)

- [ ] **Step 1: Run the pure tests**

Run: `npx tsx --test shared/metricFormula.test.ts`
Expected: PASS — all green.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 3: Manual acceptance on dev (`npm run dev`, login JABNET admin, `/pipelines/<id>`, gear → metric config)**

1. New metric "Success Rate": source = Formula; term a = Jumlah Kartu (stage = the paid stage),
   term b = Jumlah Kartu (no stage), formula `(a/b)*100`, type = Persen → shows paid %.
2. "Rata Tagihan": a = Agregasi Field SUM(amount field), b = Jumlah Kartu, formula `a/b`,
   type = Rupiah → average.
3. Divide-by-zero: a term b that resolves to 0 → tile shows 0, no crash.
4. Type an invalid formula (`a+`) → red "Formula …" badge; saving is blocked by the server (400).
5. Give the formula metric a time basis (MP2: Dibuat / 7 Hari) → the terms compute over last-7-day cards.
6. Edit the saved formula metric → terms + expression round-trip into the dialog.

- [ ] **Step 4: Update epic memory**

Edit `/home/ygao-t580/.claude/projects/-home-ygao-t580-Works-Jabnet-Website-ftth-tools/memory/project-pipeline-metrics-epic.md` — move MP3 to done with a one-line summary (`shared/metricFormula.ts` + terms/formula cols + engine branch + dialog terms editor). Leave MP4 remaining.

- [ ] **Step 5: Final handoff to user**

Per [[feedback-post-update-handoff]]: report what changed, where, and the deploy steps (push dev = staging; the 2 new columns need a Node restart for the startup migration). Note MP3 is on `dev`, not promoted to `main`.

---

## Self-Review Notes

- **Spec coverage:** §1 schema/source → Task 2; §2 pure module → Task 1; §3 engine → Task 4; §4 validation → Task 5; §5 storage → Task 3; §6 client → Task 6; §7/§8 testing+acceptance → Tasks 1 & 7. All covered.
- **MP1/MP2 preserved:** the engine change only adds a leading `if (def.source === "formula")` branch; non-formula metrics fall through to the unchanged `field_agg`/else logic. `terms`/`formula` default null.
- **Type consistency:** `TermDraft` (Task 6) ↔ stored term shape (Task 2/3) ↔ engine read (Task 4) ↔ validation (Task 5) all use `{key, source, aggregation, fieldId, stageIds, conditions}`. `FORMULA_TERM_KEYS`/`parseFormula`/`evaluateFormula` names identical across Tasks 1, 4, 5, 6. Term `conditions` is stored as a parsed object inside the terms JSON (not a separate JSON string) — Task 3 stringifies the whole `terms` array once; Task 6 startEdit reads `t.conditions` as an object (no inner JSON.parse); Task 4 re-stringifies per term for `parseConditionGroups`. Consistent.
- **Divide-by-zero:** Task 1 returns 0 for the whole expression; verified by the `a/b+c` test.
- **No placeholders:** every code step has complete code.
