# Spec - Cross-Pipeline Linked-Card Actions (SP3a of Advanced Pipeline Automation)

> Date: 2026-06-09 · Mitra-scoped · Third sub-project (3a). SP1 (attachments) + SP2 (card identity) merged.
> Delivers the Finance Collections↔Delegation flow. Build on `dev`. Continuous field/comment/attachment
> sync is deferred to SP3b.

## Goal

Make automation able to (1) spawn a card in another pipeline **linked** to the source via SP2 lineage,
and (2) act on a linked card in another pipeline (move it to a stage). Together these run the full Finance
flow without continuous sync.

## Decisions (confirmed)

1. **No new tables.** Lineage lives on `pipeline_cards` (SP2). Link config rides in the existing
   `pipeline_rule_actions` columns + `action_config` JSON. `action_type` stays `varchar(16)` - new type
   `move_linked` (11 chars) fits.
2. **Extend `create_card`, opt-in.** Lineage only when `action_config` carries `{relationType, reuseExisting}`.
   No config → today's behavior (independent card) unchanged - backward compatible.
3. **No re-dispatch (loop-safe).** Cross-pipeline mutations call storage directly and never re-trigger the
   target pipeline's automation. Matches the engine's existing invariant; no infinite loops by construction.

## The Finance flow this enables

- **Collections** rule, trigger `stage_enter` "Follow Up 1" → action `create_card`: target =
  Delegation/"Delegasi Isolir", `action_config {relationType:"mirror", reuseExisting:true}`, optional
  field maps + copyAssignee. → spawns the Delegation card linked to the Collections card's master.
- **Delegation** rule, trigger `stage_enter` "WON" → action `move_linked`: target =
  Collections/"LUNAS". → finds the master's sibling in Collections and moves it to LUNAS.

## 1. Pure module - `shared/linkedCardActions.ts` (no I/O, unit-tested)

Reuses `isValidRelationType` from `shared/cardIdentity.ts`.
```ts
import { isValidRelationType, type CardRelationType } from "./cardIdentity.js";

export interface SpawnLineageConfig { relationType: CardRelationType; reuseExisting: boolean }

/** Parse create_card's action_config for opt-in lineage. null = no lineage (legacy behavior). */
export function parseSpawnLineageConfig(raw: string | null | undefined): SpawnLineageConfig | null {
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object" || !isValidRelationType(o.relationType)) return null;
  return { relationType: o.relationType, reuseExisting: o.reuseExisting === true };
}

/** master id for a spawned card: the source's master (or the source's own id if it had none). */
export function masterForSpawn(sourceMasterId: number | null | undefined, sourceId: number): number {
  return sourceMasterId && sourceMasterId > 0 ? sourceMasterId : sourceId;
}
```

`move_linked` needs no `action_config` (it uses the action's `targetPipelineId` + `targetStageId`
columns), so no parser for it.

## 2. Storage - sibling finder

```ts
// The most-recent card in `pipelineId` sharing `masterId`, excluding `excludeCardId`. Mitra-scoped.
getSiblingCardInPipeline(masterId: number, pipelineId: number, excludeCardId?: number)
  : Promise<PipelineCard | undefined>;
```
Select from `pipeline_cards` where `mitra_id = current AND master_card_id = masterId AND pipeline_id =
pipelineId AND id != excludeCardId`, order by `id desc`, limit 1.

## 3. Automation - `server/pipeline-automation.ts`

### 3a. Extend `create_card` (applyAction, ~line 40)
After building `assigneeId` and before/around `storage.createCard`:
- `const lineage = parseSpawnLineageConfig(action.actionConfig);`
- If `lineage`:
  - `const masterId = masterForSpawn(card.masterCardId, card.id);`
  - If `lineage.reuseExisting`: `const existing = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId!);` - if found, treat it as the spawned card (apply field maps to it, skip creation), `return true`.
  - Else create with lineage: pass `masterCardId: masterId, originCardId: card.id, relationType: lineage.relationType` into `storage.createCard`.
- If no `lineage`: unchanged (create independent card - current behavior).
The field-map block (copy mapped source values to the new/reused card) runs in all branches.

### 3b. New action `move_linked` (add a branch in applyAction)
```ts
if (action.actionType === "move_linked") {
  if (!action.targetPipelineId || !action.targetStageId) { /* warn, return false */ }
  const masterId = masterForSpawn(card.masterCardId, card.id); // same resolver as create_card
  const sibling = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId, card.id);
  if (!sibling) { /* warn "no linked card in target pipeline", return false */ }
  const stages = await storage.listStages(action.targetPipelineId);
  if (!stages.some((s) => s.id === action.targetStageId)) { /* warn, return false */ }
  if (sibling.stageId === action.targetStageId) return false; // no-op
  await storage.moveCard(sibling.id, action.targetStageId, undefined, actorId); // storage-direct, no dispatch
  return true;
}
```
`storage.moveCard` only updates the DB row; the engine does NOT re-run automation on it → loop-safe.

## 4. Action-type registry + validation

- `shared/schema.ts`: extend `PipelineRuleActionType` union to include `"move_linked"`.
- Wherever the rule editor / `draftToPayload` / action validation enumerates action types (client
  `ruleFormState.ts` + any server-side `validateActions`), add `move_linked` as a valid type that requires
  `targetPipelineId` + `targetStageId` (like `create_card` requires a target).

## 5. Frontend - `RuleActionEditor.tsx` (+ `ruleFormState.ts`)

- Add `move_linked` to the action-type Combobox: label "Pindahkan kartu tertaut (pipeline lain)". When
  selected, show the existing target-pipeline + target-stage pickers (reuse the `create_card` controls);
  hide title/field-map/assignee (not relevant).
- On the `create_card` editor, add two controls bound to `action_config`:
  - **Relasi** (relationType) Combobox: Mirror / Duplikat / Tertaut / Turunan (from `CARD_RELATION_TYPES`).
    Empty = no link (legacy independent card).
  - **"Gunakan kartu tertaut yang sudah ada"** (reuseExisting) Switch - only meaningful when a relation is set.
- `ruleFormState.ts`: serialize/deserialize `{relationType, reuseExisting}` into the action's
  `action_config` for `create_card`; treat `move_linked` like `create_card` for target pipeline/stage.

## 6. Testing

- `shared/linkedCardActions.test.ts`: `parseSpawnLineageConfig` (valid mirror+reuse; missing/invalid
  relationType → null; bad JSON → null; reuseExisting defaults false), `masterForSpawn` (root → own id;
  spawned → source master).
- `getSiblingCardInPipeline`, the two action branches, registry, and UI: typecheck + build + manual
  (the end-to-end Finance flow on dev).

## 7. Manual acceptance (the Finance flow, on dev)

1. Collections pipeline: rule `stage_enter` "Follow Up 1" → `create_card` to Delegation/"Delegasi Isolir",
   relation Mirror, reuse on. Delegation pipeline: rule `stage_enter` "WON" → `move_linked` to
   Collections/"LUNAS".
2. Move a Collections card to "Follow Up 1" → a linked Delegation card appears at "Delegasi Isolir"
   (master = the Collections card; visible in SP2's "Kartu Terkait" panel on both).
3. Move the Delegation card to "WON" → the Collections card auto-moves to "LUNAS". No loop, no duplicate.
4. Re-enter "Follow Up 1" → no second Delegation card (reuseExisting).

## Out of scope (→ SP3b / SP4)

- **SP3b:** continuous sync of field values / assignee / comments / attachments between linked cards;
  bidirectional sync; per-link direction/policy.
- **SP4:** re-trigger / recurrence (monthly re-isolir): deciding reuse-vs-recreate across billing cycles.
- Bounded-depth cascade (re-dispatching automation on automation-driven moves) - explicitly rejected for
  SP3a; revisit only if a real need appears.
- `set_field_on_linked` action - not needed for the Finance flow; add later if required.
