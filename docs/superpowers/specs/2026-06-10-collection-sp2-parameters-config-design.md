# Spec - SP2: Collection Parameters Config + Stage Mapping

> Date: 2026-06-10 · Mitra-scoped · Second sub-project of the "Collection Parameters in Pipeline Engine"
> epic. Build on `dev`. Hybrid architecture. Depends on SP1 (merged).
> Target: pipeline 7 "Penagihan (Collections)" for JABNET - built generically for all tenants.

## Goal

Store and edit, per pipeline, the collection parameters that the SP3 engine will execute: the overdue
threshold for entering collection, the entry mode, the auto-write-off threshold + action, the entry/paid/
write-off stage references, and a configurable overdue-range → stage mapping table. **SP2 is config + UI
only - no automation runs yet** (that is SP3).

## Decisions (confirmed in brainstorming)

1. **Two dedicated tables** (not a JSON blob): `collection_config` (scalar knobs, 1 row/pipeline) +
   `collection_stage_map` (the range→stage rows). Clean to query/validate; the range table is natural.
2. **Stage roles by reference**, not a `role` column: `collection_config` stores `entryStageId`,
   `paidStageId`, `writeoffStageId` pointing at existing pipeline stages. `pipeline_stages` stays generic.
   `collection_status`/`writeoff_status` (deferred from SP1) are derived from these in SP3.
3. **Write-off action** is `move_stage` (→ `writeoffStageId`) or `custom_rule` (run a chosen rule). The
   request's "update status" is implicit (status derives from stage); "approval workflow" is expressed via a
   `custom_rule` that creates a card in an approval pipeline (already possible via SP3a linked actions).
4. **Separate `CollectionParametersDialog`** (consistent with ManageFields/Access/Rules dialogs), opened from
   the pipeline board settings menu. Not folded into `PipelineSettingsDialog`.
5. **Entry threshold and stage mapping are separate concepts**: the threshold gates *entry* into collection;
   the map positions a card by *aging*. SP3 reconciles them.

## 1. Schema - `shared/schema.ts` + startup migrations

```ts
export const collectionConfig = mysqlTable("collection_config", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  enabled: int("enabled").notNull().default(0),
  entryThresholdDays: int("entry_threshold_days").notNull().default(7),
  entryMode: varchar("entry_mode", { length: 24 }).notNull().default("create_if_not_exists"),
  entryStageId: int("entry_stage_id"),
  paidStageId: int("paid_stage_id"),
  writeoffThresholdDays: int("writeoff_threshold_days"),       // null = no auto write-off
  writeoffAction: varchar("writeoff_action", { length: 16 }).notNull().default("move_stage"),
  writeoffStageId: int("writeoff_stage_id"),
  writeoffRuleId: int("writeoff_rule_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({ uniqPipeline: uniqueIndex("uniq_collection_config_pipeline").on(t.pipelineId) }));

export const collectionStageMap = mysqlTable("collection_stage_map", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  minOverdueDays: int("min_overdue_days").notNull(),
  maxOverdueDays: int("max_overdue_days"),                     // null = open-ended (">= min")
  stageId: int("stage_id").notNull(),
  position: int("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => ({ byPipeline: index("idx_collection_stage_map_pipeline").on(t.mitraId, t.pipelineId, t.position) }));

export type CollectionConfig = typeof collectionConfig.$inferSelect;
export type CollectionStageMapRow = typeof collectionStageMap.$inferSelect;
```
Migrations: add `CREATE TABLE IF NOT EXISTS` for both in `seedAdminIfNeeded()` (the startup migration block), mirroring the other pipeline tables. No backfill - absence of a row = collection mode off.

## 2. Pure module - `shared/collectionConfig.ts` (no I/O, unit-tested)

```ts
export type CollectionEntryMode = "create" | "move" | "create_if_not_exists" | "reopen";
export type WriteoffAction = "move_stage" | "custom_rule";
export const ENTRY_MODES: { mode: CollectionEntryMode; label: string; hint: string }[];   // Indonesian labels
export const WRITEOFF_ACTIONS: { action: WriteoffAction; label: string }[];

export interface StageMapRow { minOverdueDays: number; maxOverdueDays: number | null; stageId: number; position: number; }

/** Validate the map: each row min>=0, max null or >=min; rows must not overlap once sorted by min.
 * Returns null if ok, else an Indonesian error string. */
export function validateStageMap(rows: StageMapRow[]): string | null;

/** Pure resolver used by SP3: the stageId whose [min,max] (max null = open-ended) contains daysOverdue.
 * Picks the row with the highest matching min (most specific). null if none match. */
export function stageForOverdue(rows: StageMapRow[], daysOverdue: number): number | null;

export interface CollectionConfigInput {
  enabled: boolean;
  entryThresholdDays: number;
  entryMode: string;
  entryStageId: number | null;
  paidStageId: number | null;
  writeoffThresholdDays: number | null;
  writeoffAction: string;
  writeoffStageId: number | null;
  writeoffRuleId: number | null;
}
/** Enum + numeric sanity: thresholds non-negative ints; writeoffThreshold (if set) >= entryThreshold;
 * entryMode ∈ ENTRY_MODES; writeoffAction ∈ WRITEOFF_ACTIONS; if writeoffAction=move_stage and a write-off
 * threshold is set, writeoffStageId required. Returns null or an error string. (Stage-id existence is
 * checked at the route against the pipeline's stages - not here, since this module has no DB.) */
export function validateCollectionConfig(cfg: CollectionConfigInput): string | null;
```

Tests (`shared/collectionConfig.test.ts`): `validateStageMap` (ok sorted non-overlapping; overlap → error;
max<min → error; open-ended last row ok), `stageForOverdue` (in-range pick; most-specific on overlap-free
ranges; open-ended match; none → null), `validateCollectionConfig` (good; bad enum; negative threshold;
writeoff<entry; move_stage without writeoffStageId when threshold set → error).

## 3. Storage - `server/storage.ts`

```ts
getCollectionConfig(pipelineId: number): Promise<{ config: CollectionConfig | null; stageMap: CollectionStageMapRow[] }>;
upsertCollectionConfig(pipelineId: number, cfg: CollectionConfigInput, mapRows: StageMapRow[]): Promise<void>;
```
- `getCollectionConfig`: select config row (by pipeline + `getMitraId()`), select map rows ordered by
  position. Config null when no row.
- `upsertCollectionConfig`: in a transaction - upsert the config row (insert or update by pipelineId),
  then `DELETE` existing map rows for the pipeline and insert the new ones (replace-all). Mitra-scoped.

## 4. API - `server/routes.ts`

- `GET /api/pipelines/:id/collection-config` - `requireWritePermission("pipelines")` + `requirePipelineCapability(manage)`; returns `sendSuccess(res, { config, stageMap })`. Config null → client shows defaults (disabled).
- `PUT /api/pipelines/:id/collection-config` - same gates. Body `{ config: CollectionConfigInput, stageMap: StageMapRow[] }`.
  1. `validateCollectionConfig(config)` → 400 on error.
  2. `validateStageMap(stageMap)` → 400 on error.
  3. Stage-id existence: every referenced stage id (`entryStageId`, `paidStageId`, `writeoffStageId`, each
     map row's `stageId`) must belong to this pipeline (via `storage.listStages(pid)`); else 400.
  4. If `writeoffAction === "custom_rule"` and `writeoffRuleId` set, the rule must belong to this pipeline.
  5. `storage.upsertCollectionConfig(...)` → `sendSuccess(res, { ok: true })`.

## 5. Client - hook + dialog

- `client/hooks/usePipelines.ts`: `useCollectionConfig(pipelineId)` (GET) + `useSaveCollectionConfig(pipelineId)` (PUT, invalidates the config query).
- `client/components/pipelines/CollectionParametersDialog.tsx` (new, mobile-first):
  - Opened from the board settings menu (add an entry next to "Otomasi"/"Field"/"Akses"). Only show the menu
    entry when the user has `manage` capability.
  - **Enable** switch ("Pipeline ini adalah pipeline Penagihan").
  - When enabled: **Masuk Collection** `[N] Hari Overdue` (number) + entry-mode radio (4 modes w/ hints) +
    entry-stage & paid-stage `Combobox`es (pipeline stages). **Auto Write-Off** `[N] Hari Overdue` (number,
    blank = off) + action radio (Pindah ke stage → stage `Combobox` | Jalankan rule → rule `Combobox`).
  - **Stage Mapping** table: rows `[min] - [max] Hari → [stage Combobox]`, "+ Tambah baris", remove, reorder
    (up/down). Last row may leave max blank (open-ended ">"). Inline validation message on overlap/invalid.
  - Save button → `useSaveCollectionConfig`; on success toast "Parameter collection disimpan". Reuse the
    `dialog-size-toggle` pattern for width if helpful.
- Mobile-first: form stacks vertically; the mapping table becomes stacked rows on small screens
  (`flex-col sm:flex-row` per row), comfortable tap targets.

## 6. Testing

- `shared/collectionConfig.test.ts` - the pure module (run `npx tsx --test`).
- Storage upsert/get, endpoints (validation 400s, stage-ownership), dialog: typecheck + build + manual on dev.

## 7. Manual acceptance (on dev, pipeline 7 / JABNET)

1. Pipeline 7 → settings menu → **Collection Parameters** dialog opens.
2. Enable; set "Masuk Collection Setelah 7 Hari", mode = Create-if-not-exists, entry stage = Follow Up 1,
   paid stage = LUNAS; "Auto Write-Off Setelah 180 Hari" → Pindah ke stage Write Off.
3. Build the mapping table: 1-7 → Follow Up 1, 8-14 → Follow Up 2, 15-30 → Follow Up 3, 31-60 → Visit,
   61-90 → Isolir, >180 → Write Off. Save → persists; reopen shows the same values.
4. Overlapping ranges (e.g. 1-7 and 5-10) → inline error, save blocked.
5. Referencing a stage from another pipeline (impossible via UI, but) → API returns 400.
6. A non-`manage` role doesn't see the menu entry; the PUT endpoint 403s for them.

## 8. Out of scope (→ later sub-projects)
SP3: executing the config (entry/move/reopen per mode, aging→stage moves via `stageForOverdue`, auto
write-off, resolving `collection_status`/`writeoff_status`, the new triggers). SP4: `collection_cycle`.
SP5: dashboard metrics.
