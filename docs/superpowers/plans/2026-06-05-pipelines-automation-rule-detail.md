# Automation Rule Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a click-to-expand (accordion) detail panel to each rule in the Otomasi Pipeline dialog, showing trigger/target with real names, title behavior, assignee behavior, and the full field-value mappings (`source (type) → target (type)`).

**Architecture:** Display-only. The `GET /api/pipelines/:id/rules` endpoint is extended to carry every human-readable string the panel needs (target pipeline name, target stage name, and per-map source/target labels+types) via batched server-side lookups — resolved through a pure, unit-tested helper. The dialog gains an `expandedId` accordion state and renders a detail panel below the clicked rule. No schema changes, no new endpoints, no runtime-behavior change.

**Tech Stack:** Express 5 + Drizzle (MySQL) backend; React 18 + TanStack Query + shadcn/ui frontend; `node:test` via `npx tsx --test` for the pure helper.

---

## File Structure

- `server/pipeline-automation-helpers.ts` — **modify**: add pure `shapeRuleFieldMaps()` (label/type resolution for a rule's maps). Home of existing tested pure helpers.
- `server/pipeline-automation-helpers.test.ts` — **modify**: add `node:test` cases for `shapeRuleFieldMaps`.
- `server/routes.ts` — **modify** (`GET /api/pipelines/:id/rules`, ~line 4594–4600): batched enrichment using the helper + target pipeline/stage name resolution.
- `client/hooks/usePipelines.ts` — **modify** (line 8): extend `RuleWithMaps` + add `RuleFieldMap` type.
- `client/components/pipelines/PipelineRulesDialog.tsx` — **modify**: `expandedId` accordion state, clickable summary, detail panel, stop-propagation on Switch/Delete.

---

## Task 1: Pure helper `shapeRuleFieldMaps` (TDD)

**Files:**
- Modify: `server/pipeline-automation-helpers.ts`
- Test: `server/pipeline-automation-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/pipeline-automation-helpers.test.ts` (keep existing imports; add `shapeRuleFieldMaps` to the existing import from `./pipeline-automation-helpers.js`):

```ts
test("shapeRuleFieldMaps: resolves labels and types from both maps", () => {
  const src = new Map([[1, { label: "Harga", type: "number" }]]);
  const tgt = new Map([[9, { label: "Harga Deal", type: "number" }]]);
  const out = shapeRuleFieldMaps([{ id: 5, sourceFieldId: 1, targetFieldId: 9 }], src, tgt);
  assert.deepEqual(out, [{
    id: 5, sourceFieldId: 1, targetFieldId: 9,
    sourceFieldLabel: "Harga", sourceFieldType: "number",
    targetFieldLabel: "Harga Deal", targetFieldType: "number",
  }]);
});

test("shapeRuleFieldMaps: missing source/target field → (dihapus) fallback + null type", () => {
  const out = shapeRuleFieldMaps(
    [{ id: 7, sourceFieldId: 2, targetFieldId: 3 }],
    new Map(), new Map(),
  );
  assert.equal(out[0].sourceFieldLabel, "Field #2 (dihapus)");
  assert.equal(out[0].sourceFieldType, null);
  assert.equal(out[0].targetFieldLabel, "Field #3 (dihapus)");
  assert.equal(out[0].targetFieldType, null);
});

test("shapeRuleFieldMaps: empty maps → []", () => {
  assert.deepEqual(shapeRuleFieldMaps([], new Map(), new Map()), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: FAIL — `shapeRuleFieldMaps is not exported` / `not a function`.

- [ ] **Step 3: Write the implementation**

Append to `server/pipeline-automation-helpers.ts`:

```ts
export function shapeRuleFieldMaps(
  maps: { id: number; sourceFieldId: number; targetFieldId: number }[],
  srcFields: Map<number, { label: string; type: string }>,
  tgtFields: Map<number, { label: string; type: string }>,
): {
  id: number; sourceFieldId: number; targetFieldId: number;
  sourceFieldLabel: string; sourceFieldType: string | null;
  targetFieldLabel: string; targetFieldType: string | null;
}[] {
  return maps.map((m) => {
    const sf = srcFields.get(m.sourceFieldId);
    const tf = tgtFields.get(m.targetFieldId);
    return {
      id: m.id, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId,
      sourceFieldLabel: sf?.label ?? `Field #${m.sourceFieldId} (dihapus)`,
      sourceFieldType: sf?.type ?? null,
      targetFieldLabel: tf?.label ?? `Field #${m.targetFieldId} (dihapus)`,
      targetFieldType: tf?.type ?? null,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: PASS — all tests (8 existing + 3 new = 11) green.

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation-helpers.ts server/pipeline-automation-helpers.test.ts
git commit -m "feat(pipelines): shapeRuleFieldMaps helper for rule detail labels"
```

---

## Task 2: Enrich `GET /api/pipelines/:id/rules`

**Files:**
- Modify: `server/routes.ts` (the handler at ~line 4594–4600)

- [ ] **Step 1: Add the helper import**

At the top of `server/routes.ts`, find the existing import from `./pipeline-automation-helpers.js` (used by P4a-ext, e.g. `pickMappedValues`) and add `shapeRuleFieldMaps` to it. If no such import line exists, add:

```ts
import { shapeRuleFieldMaps } from "./pipeline-automation-helpers.js";
```

- [ ] **Step 2: Replace the enrichment block**

Replace the body of the handler (currently):

```ts
    const rules = await storage.listRules(Number(req.params.id));
    const withMaps = await Promise.all(rules.map(async (r) => ({ ...r, fieldMaps: await storage.getRuleFieldMaps(r.id) })));
    sendSuccess(res, withMaps);
```

with:

```ts
    const pid = Number(req.params.id);
    const rules = await storage.listRules(pid);

    // One-time lookups (source side + pipeline names)
    const allPipes = await storage.listPipelines(true);
    const pipeName = new Map(allPipes.map((p) => [p.id, p.name]));
    const srcFieldList = await storage.listFields(pid);
    const srcFields = new Map(srcFieldList.map((f) => [f.id, { label: f.label, type: f.type }]));

    // Batched per distinct target pipeline: stages + fields
    const targetIds = [...new Set(rules.map((r) => r.targetPipelineId))];
    const stagesByPipe = new Map<number, Map<number, string>>();
    const fieldsByPipe = new Map<number, Map<number, { label: string; type: string }>>();
    await Promise.all(targetIds.map(async (tid) => {
      const [stages, fields] = await Promise.all([storage.listStages(tid), storage.listFields(tid)]);
      stagesByPipe.set(tid, new Map(stages.map((s) => [s.id, s.label])));
      fieldsByPipe.set(tid, new Map(fields.map((f) => [f.id, { label: f.label, type: f.type }])));
    }));

    const withMaps = await Promise.all(rules.map(async (r) => {
      const rawMaps = await storage.getRuleFieldMaps(r.id);
      const tgtFields = fieldsByPipe.get(r.targetPipelineId) ?? new Map();
      return {
        ...r,
        targetPipelineName: pipeName.get(r.targetPipelineId) ?? `Pipeline #${r.targetPipelineId}`,
        targetStageName: stagesByPipe.get(r.targetPipelineId)?.get(r.targetStageId) ?? `Stage #${r.targetStageId} (dihapus)`,
        fieldMaps: shapeRuleFieldMaps(
          rawMaps.map((m) => ({ id: m.id, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId })),
          srcFields,
          tgtFields,
        ),
      };
    }));
    sendSuccess(res, withMaps);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): enrich rules list with target+field labels for detail panel"
```

---

## Task 3: Extend `RuleWithMaps` type

**Files:**
- Modify: `client/hooks/usePipelines.ts` (line 8)

- [ ] **Step 1: Replace the type**

Replace line 8:

```ts
export type RuleWithMaps = PipelineRule & { fieldMaps?: { id: number; sourceFieldId: number; targetFieldId: number }[] };
```

with:

```ts
export type RuleFieldMap = {
  id: number; sourceFieldId: number; targetFieldId: number;
  sourceFieldLabel?: string; sourceFieldType?: string | null;
  targetFieldLabel?: string; targetFieldType?: string | null;
};
export type RuleWithMaps = PipelineRule & {
  fieldMaps?: RuleFieldMap[];
  targetPipelineName?: string;
  targetStageName?: string;
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): RuleWithMaps carries detail labels"
```

---

## Task 4: Inline expand detail panel in the dialog

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

- [ ] **Step 1: Add the chevron icon + expand state**

In the lucide import line (currently `import { Trash2, Plus, Zap } from "lucide-react";`), add `ChevronDown`:

```ts
import { Trash2, Plus, Zap, ChevronDown } from "lucide-react";
```

Below the other `useState` declarations (after the `maps` state, ~line 31), add:

```ts
  const [expandedId, setExpandedId] = useState<number | null>(null);
```

- [ ] **Step 2: Add a field-type chip helper**

Just above the `return (` (after `ruleList` is defined, ~line 122), add a small render helper:

```ts
  const typeChip = (t?: string | null) =>
    t ? <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono align-middle">{t}</span> : null;
```

- [ ] **Step 3: Make the summary clickable and add the detail panel**

Replace the entire rule-row block (currently lines ~163–211, the `ruleList.map((r) => ( ... ))` body — the `<div key={r.id} ...>` element) with:

```tsx
                  {ruleList.map((r) => {
                    const expanded = expandedId === r.id;
                    return (
                    <div
                      key={r.id}
                      className="group rounded-lg border border-border/60 bg-card shadow-elev-sm transition-shadow hover:shadow-elev-md"
                    >
                      <div className="flex items-start gap-3 px-3 py-2.5">
                        {/* Rule description — click to expand */}
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                          className="flex flex-1 min-w-0 items-start gap-2 text-left"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                          <span className="flex-1 min-w-0 text-sm leading-snug">
                            <span className="text-muted-foreground text-xs">Saat masuk </span>
                            <span className="font-semibold">{stageName(r.triggerStageId)}</span>
                            <span className="text-muted-foreground text-xs"> → buat kartu di </span>
                            <span className="font-semibold">{r.targetPipelineName ?? pipeName(r.targetPipelineId)}</span>
                            <span className="text-muted-foreground text-xs"> / </span>
                            <span className="font-medium text-xs">{r.targetStageName ?? targetStageName(r.targetPipelineId, r.targetStageId)}</span>
                            {r.copyAssignee === 1 && (
                              <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-info/10 text-info align-middle">
                                salin assignee
                              </span>
                            )}
                            {r.titleTemplate && (
                              <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground align-middle font-mono">
                                {r.titleTemplate}
                              </span>
                            )}
                            {r.fieldMaps && r.fieldMaps.length > 0 && (
                              <span className="text-[10px] text-muted-foreground ml-1">· +{r.fieldMaps.length} field</span>
                            )}
                            {r.enabled !== 1 && (
                              <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/60 align-middle">
                                nonaktif
                              </span>
                            )}
                          </span>
                        </button>

                        {/* Enable toggle + delete — must not trigger expand */}
                        <div
                          className="flex items-center gap-1.5 shrink-0 mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Switch
                            checked={r.enabled === 1}
                            onCheckedChange={(c) => toggleEnabled(r.id, c)}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Detail panel */}
                      {expanded && (
                        <div className="border-t border-border/60 bg-muted/20 px-3 py-3 text-xs space-y-2.5">
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Trigger</div>
                            <div>Saat kartu masuk stage <span className="font-medium">{stageName(r.triggerStageId)}</span></div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Target</div>
                            <div>
                              Buat kartu di <span className="font-medium">{r.targetPipelineName ?? pipeName(r.targetPipelineId)}</span>
                              {" / "}
                              <span className="font-medium">{r.targetStageName ?? targetStageName(r.targetPipelineId, r.targetStageId)}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Judul kartu baru</div>
                            {r.titleTemplate
                              ? <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{r.titleTemplate}</span>
                              : <span className="italic text-muted-foreground">Menyalin judul kartu sumber</span>}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Salin assignee</div>
                            {r.copyAssignee === 1
                              ? <div>Ya <span className="text-muted-foreground">— hanya jika penerima punya akses ke pipeline target</span></div>
                              : <div>Tidak</div>}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Pemetaan field</div>
                            {r.fieldMaps && r.fieldMaps.length > 0 ? (
                              <div className="space-y-1">
                                {r.fieldMaps.map((m) => (
                                  <div key={m.id} className="flex items-center gap-1.5">
                                    <span className="font-medium">{m.sourceFieldLabel}</span>{typeChip(m.sourceFieldType)}
                                    <span className="text-muted-foreground">→</span>
                                    <span className="font-medium">{m.targetFieldLabel}</span>{typeChip(m.targetFieldType)}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="italic text-muted-foreground">Tidak ada field yang dipindahkan</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0 errors; build OK (vite + esbuild → dist/index.mjs).

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): expandable rule detail panel in automation dialog"
```

---

## Manual Verification (dev — `jabnet_fiber_dev`, plain restart; no migration)

After deploy to dev + restart Node app, in `/pipelines` → a pipeline with automation rules → open the Otomasi dialog:

- [ ] Click a rule with field mappings → panel expands; each mapping shows real `source (type) → target (type)` labels; target stage shows its real name (not `Stage #N`).
- [ ] Click the chevron/summary again → collapses. Expanding a second rule works independently.
- [ ] Toggle the enable Switch → state persists, panel does NOT expand/collapse from the toggle; re-open dialog → the rule's field maps are unchanged (P4a-ext invariant holds).
- [ ] Click Delete → confirm prompt fires, deletes; click did NOT also expand the panel.
- [ ] A rule whose target stage or a mapped field was deleted → "(dihapus)" fallback shown, no crash.
- [ ] A rule with no maps → "Tidak ada field yang dipindahkan".
- [ ] Collapsed list visually unchanged from before (aside from the new chevron).

---

## Self-Review Notes

- **Spec coverage:** §Backend → Task 1+2; §Frontend hook type → Task 3; §Frontend dialog (5 detail items, accordion, stop-propagation) → Task 4; §Testing → Task 1 unit + Task 4 build + manual checklist. All covered.
- **Type consistency:** `shapeRuleFieldMaps` output shape matches `RuleFieldMap` (Task 3) and the endpoint's `fieldMaps` (Task 2). `targetPipelineName`/`targetStageName` added in both Task 2 (server) and Task 3 (client type). Existing client helpers `stageName`, `pipeName`, `targetStageName` reused as fallbacks (`??`) so nothing breaks if a field is absent.
- **No new DB objects** — deploy is pull + restart only.
