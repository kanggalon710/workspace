# Spec - Automation Rule Detail Panel (expandable, display-only)

> **Date:** 2026-06-05
> **Status:** Approved design, ready for implementation plan.
> **Program:** "Customizable Multi-Tenant Pipeline / Kanban" - UI refinement of Phase 4a + 4a-ext.
> **Builds on:** P4a (cross-pipeline card-creation automation) + P4a-ext (assignee guard + field mapping).

## Goal

In the **Otomasi Pipeline** dialog, each rule currently renders as a single compact line that only hints at its config (a `salin assignee` badge, the title template, and a bare `· +N field` count). The actual field-value mappings and full target details are not visible.

Add a **click-to-expand (accordion) detail panel** per rule that reveals, for the clicked rule:
1. Trigger stage (full name)
2. Target pipeline + stage (real stage name)
3. Title template (or "menyalin judul kartu sumber")
4. Salin assignee (Ya/Tidak, with the access-guard caveat)
5. Field mappings - each as `{source field} ({type}) → {target field} ({type})`, or "Tidak ada field yang dipindahkan"

This is **display-only** - no change to automation behavior, no new DB objects.

> A general UI/UX polish pass remains deferred until all functional features land; this is functional-first.

## Key Decisions (from brainstorming)

- **Interaction = inline accordion (Approach A).** Clicking a rule's description toggles a detail panel below it. Multiple rules may be expanded at once. The enable **Switch** and **Delete** button stop event propagation so they never also toggle expand.
- **Labels resolved server-side (Approach 1).** `GET /api/pipelines/:id/rules` is extended so each rule carries every display string the panel needs. The client just renders - no extra round-trips, and it fixes the existing `Stage #N` gap (the dialog could only resolve the in-form target pipeline's stage labels).
- **Deleted source/target field or stage** resolves to a `"… (dihapus)"` fallback string server-side, so the panel never shows a bare numeric ID.
- **Trigger-stage name stays client-resolved** - the rule list already resolves it correctly from `self.stages` (the current/source pipeline is always loaded); no need to duplicate it server-side.

## Backend (`server/routes.ts` - `GET /api/pipelines/:id/rules`, ~line 4594)

Replace the current inline enrichment:
```ts
const withMaps = await Promise.all(rules.map(async (r) => ({ ...r, fieldMaps: await storage.getRuleFieldMaps(r.id) })));
```
with batched enrichment (no N+1 beyond the distinct target-pipeline set):

1. `rules = await storage.listRules(pid)`.
2. One-time lookups:
   - `allPipes = await storage.listPipelines(true)` → `Map<id, name>` (include archived so a target name still resolves).
   - `srcFields = await storage.listFields(pid)` → `Map<id, {label, type}>`.
3. Distinct target pipelines: `const targetIds = [...new Set(rules.map(r => r.targetPipelineId))]`. For each (via `Promise.all`), load `listStages(id)` + `listFields(id)` → build `stagesByPipe: Map<pipeId, Map<stageId, label>>` and `fieldsByPipe: Map<pipeId, Map<fieldId, {label,type}>>`.
4. For each rule, fetch `getRuleFieldMaps(r.id)` and shape:

```ts
{
  ...r,
  targetPipelineName: allPipes.get(r.targetPipelineId) ?? `Pipeline #${r.targetPipelineId}`,
  targetStageName: stagesByPipe.get(r.targetPipelineId)?.get(r.targetStageId) ?? `Stage #${r.targetStageId} (dihapus)`,
  fieldMaps: maps.map((m) => {
    const sf = srcFields.get(m.sourceFieldId);
    const tf = fieldsByPipe.get(r.targetPipelineId)?.get(m.targetFieldId);
    return {
      id: m.id, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId,
      sourceFieldLabel: sf?.label ?? `Field #${m.sourceFieldId} (dihapus)`,
      sourceFieldType: sf?.type ?? null,
      targetFieldLabel: tf?.label ?? `Field #${m.targetFieldId} (dihapus)`,
      targetFieldType: tf?.type ?? null,
    };
  }),
}
```

Still `sendSuccess(res, withMaps)`. Permission/edit gates unchanged (`requirePermission("pipelines")` + `requirePipelineEdit`).

**Optional pure helper (if it keeps the handler readable):** a module-level `shapeRuleFieldMaps(maps, srcFields, tgtFields)` that does the per-map label/type resolution, unit-testable in isolation. Otherwise inline is fine.

## Frontend

### `client/hooks/usePipelines.ts`
Extend `RuleWithMaps` so the new fields are typed:
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
(Fields optional so older cached payloads / mutation return shapes don't break typing.)

### `client/components/pipelines/PipelineRulesDialog.tsx`
- Add `const [expandedId, setExpandedId] = useState<number | null>(null);` (toggle: clicking the open one closes it; this keeps it simple - a Set is unnecessary for the expected rule counts, but either is acceptable).
- The rule **description block** (currently lines ~169-194) becomes a clickable toggle (`role=button` / `<button>` wrapper) that flips `expandedId`, with a `ChevronDown` that rotates when expanded.
- The **Switch** (`onCheckedChange`) and **Delete** `Button` must call `e.stopPropagation()` (and the Switch container `onClick` stop) so they never trigger expand.
- When `expandedId === r.id`, render a detail panel below the summary row (subtle bordered/`bg-muted/20` panel, `text-xs`) with the 5 items:
  1. **Trigger:** "Saat kartu masuk stage **{stageName(r.triggerStageId)}**" (client-resolved from `selfStages`).
  2. **Target:** "Buat kartu di **{r.targetPipelineName}** / **{r.targetStageName}**".
  3. **Judul kartu baru:** `r.titleTemplate` (mono chip) or italic "menyalin judul kartu sumber".
  4. **Salin assignee:** `r.copyAssignee === 1` → "Ya" + caveat line "hanya jika penerima punya akses ke pipeline target"; else "Tidak".
  5. **Pemetaan field:** if `r.fieldMaps?.length`, list each as `{sourceFieldLabel} ({sourceFieldType}) → {targetFieldLabel} ({targetFieldType})` (type shown as a small chip); else "Tidak ada field yang dipindahkan".
- Keep the existing compact summary badges as-is (collapsed state unchanged). Design-system components only; functional-first.

## Testing & Verification
- **Unit (optional):** if the `shapeRuleFieldMaps` helper is extracted, a small `node:test` covering: known fields → labels+types; missing source/target field → "(dihapus)" fallback + null type; empty maps → `[]`.
- **Build/type:** `npm run typecheck` → 0 errors; `npm run build` → OK.
- **Manual on dev** (`jabnet_fiber_dev`; no migration - plain restart):
  - Expand a rule with maps → mappings show correct labels + types; target stage shows real name (not `Stage #N`).
  - Toggle the enable Switch and click Delete → neither expands/collapses the panel; enable still persists; maps preserved (regression check on the P4a-ext invariant).
  - A rule whose target stage or a mapped field was deleted → "(dihapus)" fallback rendered, no crash.
  - Rule with no maps → "Tidak ada field yang dipindahkan".
  - Collapsed list looks unchanged from today.

## Out of Scope
- Editing a rule's field maps in place (still delete + recreate - the known P4a-ext limitation, deferred with the UI/UX polish pass).
- Any change to automation runtime behavior, schema, or new endpoints.
- The broader pipeline-dialog UI/UX polish pass.

## Consistency with Memory
- [[project-pipelines-engine]] - P4a/4a-ext UI refinement.
- [[reference-api-response-envelope]] - `GET /rules` keeps `sendSuccess`.
- [[reference-tenant-isolation-gotchas]] - all storage reads (`listRules`, `listStages`, `listFields`, `getRuleFieldMaps`, `listPipelines`) are already `getMitraId()`-scoped; enrichment adds no cross-mitra reads.
