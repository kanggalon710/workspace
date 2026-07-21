# Spec - Collections → Pipeline Cutover (Phase 7, reversible)

> Date: 2026-06-09 · Mitra-scoped · First sub-project of Phase 7 (migrate live modules onto the engine).

## Goal

Move collections (penagihan) onto the generic pipeline engine via a **reversible** per-mitra toggle.
In pipeline-mode the legacy collection auto-open/reconcile in the billing worker is skipped (the engine's
`billing_sync` rule handles auto-open on the designated Collection pipeline) and `/collections` redirects
to that pipeline's board. The old collections table + UI stay intact (dormant) so a flip back to legacy
fully restores prior behavior. Default is `legacy` - no behavior change until an admin flips it.

## Decisions (confirmed)

1. **Mechanism:** `app_settings` toggle (`collections_engine_mode` + `collections_pipeline_id`), flippable
   in `/integrations` - no restart, admin-reversible.
2. **Pipeline-mode worker:** skip `runCollectionThresholds` + `reconcileCollectionState` entirely; the
   `billing_sync` intake (`runBillingIntakeRules`) handles auto-open on the designated pipeline.
3. **Seeding:** run the existing snapshot importer once at cutover (preserves open collections + history);
   `billing_sync` handles new ones going forward.

## 1. Pure helper - `shared/collectionsMode.ts` (unit-tested)

```ts
export type CollectionsEngineMode = "legacy" | "pipeline";
export function parseCollectionsMode(raw: string | null | undefined): CollectionsEngineMode {
  return raw === "pipeline" ? "pipeline" : "legacy"; // default + any garbage → legacy
}
export function legacyCollectionsActive(mode: CollectionsEngineMode): boolean {
  return mode === "legacy";
}
```

## 2. Settings + storage

Two per-mitra `app_settings` keys: `collections_engine_mode` (string), `collections_pipeline_id` (string
int). Read via the existing per-mitra setting accessor (`getMitraSetting`), written via the settings
storage. No schema change (`app_settings` exists). Default mode (absent key) → `legacy`.

## 3. Worker gate - `server/billing-sync-worker.ts`

In `_runOnceInner` (runs inside `withMitra(m.id, ...)`), BEFORE the `runCollectionThresholds` +
`reconcileCollectionState` block, read the mitra's `collections_engine_mode`. If `pipeline`:
- skip both legacy calls (log `[BillingSyncWorker] collections pipeline-mode: legacy auto-open/reconcile dilewati`);
- continue to `runBillingIntakeRules` as today (it auto-opens cards on any pipeline that has a `billing_sync` rule - the designated Collection pipeline).
If `legacy` (default): unchanged behavior.

## 4. Routes

- `GET /api/collections/engine-mode` → `{ mode, pipelineId }` (any staff with `collections` read).
- `PUT /api/collections/engine-mode` `{ mode, pipelineId }` (admin / `mitra_admin` write) - validates
  `mode ∈ {legacy, pipeline}` and, when `pipeline`, that `pipelineId` is a pipeline in this mitra; persists
  both settings. Reversible by PUT `{ mode: "legacy" }`.

## 5. Frontend

- **`/integrations`** - a section **"Migrasi Collections ke Pipeline"**: a mode select (Legacy / Pipeline),
  a Collection-pipeline picker (list pipelines), a short note (prerequisite: the pipeline needs a
  `billing_sync` rule; rollback by switching back to Legacy), and a save button → `PUT engine-mode`.
- **`/collections` page** - on mount, fetch `engine-mode`; when `pipeline` + a `pipelineId` is set, render
  a banner ("Penagihan kini dikelola di pipeline") + auto-navigate to `/pipelines/<id>`, with a
  "Lihat data lama (read-only)" link that dismisses the redirect for this visit so the legacy board stays
  reachable for verification/rollback. In `legacy` mode the page is unchanged.

## 6. Cutover runbook (docs only - run manually when ready; not part of the code change)

1. In `/pipelines`, ensure a Collection pipeline exists with a **`billing_sync` rule** (filter + entry
   stage + field mapping).
2. Run the existing snapshot importer once (`tools/import-collections-to-pipeline.ts`, bundle→scp→node per
   the established recipe) to seed open collections + history as cards.
3. In `/integrations`, set mode → `pipeline` + pick the pipeline. **Rollback:** set mode → `legacy`.

## 7. Testing

`shared/collectionsMode.test.ts`: `parseCollectionsMode` (legacy default / "pipeline" / null / garbage),
`legacyCollectionsActive`. Worker gate + endpoints + UI via typecheck + build.

## Out of scope
- Leads cutover (the next Phase 7 sub-project).
- Deleting the legacy collections table/UI (stays dormant; removal is a later decision once stable).
- Auto-configuring the `billing_sync` rule (admin configures it in /pipelines).
- Migrating historical closed collections (the snapshot importer covers open + history at cutover).
