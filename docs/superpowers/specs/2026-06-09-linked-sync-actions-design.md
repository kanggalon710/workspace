# Spec — Linked-Card Sync Actions (SP3b of Advanced Pipeline Automation)

> Date: 2026-06-09 · Mitra-scoped · Final sub-project of the epic. SP1/SP2/SP3a/SP4/SP5 merged.
> Build on `dev`. Continuous "keep linked cards in step" for fields + assignee, composed from the
> existing event triggers — NOT a separate sync engine.

## Goal

Two new automation actions — `set_field_linked` and `assign_linked` — that push a change on a card to its
master-linked sibling in another pipeline. Combined with the existing `field_updated` / `assignee_changed`
event triggers, this lets an admin configure continuous field/assignee sync as ordinary rules. Stage sync
already exists (`move_linked`, SP3a). Loop-safe by the engine's existing invariant (propagation is
storage-direct, never re-dispatches).

## Decisions (confirmed)

1. **Scope:** field-value sync (`set_field_linked`) + primary-assignee sync (`assign_linked`). Comments/
   attachments live-sync + a dedicated sync-policy table are **out of scope** (rules express the policy).
2. **Direction:** the pipeline that holds the rule is the source. Bidirectional = a rule on each side —
   still loop-safe (storage-direct writes never re-trigger events).
3. **`assign_linked` copies the source card's primary assignee** to the sibling (true sync), not a fixed user.
4. **Widen `action_type` to `varchar(32)`** (both `pipeline_rules` + `pipeline_rule_actions`) so action
   names stop fighting the 16-char limit. Guarded MODIFY, widening only, no data loss.

## 1. Schema — widen action_type

`shared/schema.ts`: change both `actionType: varchar("action_type", { length: 16 })` (pipeline_rules ~667
and pipeline_rule_actions ~716) to `{ length: 32 }`. Extend the `PipelineRuleActionType` union with
`"set_field_linked" | "assign_linked"`.

Migration (`server/storage.ts`): a guarded MODIFY — read `information_schema.columns.CHARACTER_MAXIMUM_LENGTH`
for each `action_type` column; if `< 32`, `ALTER TABLE <t> MODIFY action_type VARCHAR(32) ...` (preserve
NOT NULL / default for pipeline_rules). Idempotent (re-runs are no-ops). Place near the existing
column-additions block; widening varchar never loses data.

## 2. Automation — two action branches (`server/pipeline-automation.ts`)

Both reuse `getSiblingCardInPipeline` (SP3a) + `masterForSpawn` (the same master resolver). Add after the
`move_linked` branch:

### `set_field_linked`
```ts
if (action.actionType === "set_field_linked") {
  if (!action.targetPipelineId) { /* warn, return false */ }
  const masterId = masterForSpawn(card.masterCardId, card.id);
  const sibling = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId, card.id);
  if (!sibling) { /* warn "no linked card", return false */ }
  const maps = await storage.getActionFieldMaps(action.id);
  if (!maps.length) return false;
  const srcVals = await storage.getCardValues(card.id);
  const targetFieldIds = new Set((await storage.listFields(action.targetPipelineId)).map((f) => f.id));
  const writes = pickMappedValues(maps.filter((m) => targetFieldIds.has(m.targetFieldId)), srcVals);
  if (!writes.length) return false;
  await storage.setCardValues(sibling.id, writes);   // storage-direct → no field_updated dispatch → loop-safe
  return true;
}
```

### `assign_linked`
```ts
if (action.actionType === "assign_linked") {
  if (!action.targetPipelineId) { /* warn, return false */ }
  const masterId = masterForSpawn(card.masterCardId, card.id);
  const sibling = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId, card.id);
  if (!sibling) { /* warn, return false */ }
  const newAssignee = card.assigneeId ?? null;
  if (newAssignee != null && !(await storage.canUserAccessPipeline(newAssignee, action.targetPipelineId))) {
    /* warn "assignee lacks access", return false */
  }
  if (sibling.assigneeId === newAssignee) return false; // no-op
  await storage.updateCard(sibling.id, { assigneeId: newAssignee }, actorId); // storage-direct → no re-dispatch
  return true;
}
```

`storage.setCardValues` / `storage.updateCard` only touch the DB (no automation dispatch), so the sibling's
own `field_updated` / `assignee_changed` rules are NOT triggered → no loop, even bidirectional.

## 3. Server validation (`server/routes.ts` `validateActions` ~4443)

Add a branch: `set_field_linked` + `assign_linked` require `targetPipelineId` + caller has access to the
target pipeline (`getPipelineCapabilities(...).size > 0`); for `set_field_linked` also validate the field
maps against the target pipeline (`validateRuleFieldMaps`, as `create_card` does).

## 4. Frontend — `RuleActionEditor.tsx` (+ `ruleFormState.ts`)

- Add to the action-type Combobox: "Set field di kartu tertaut" (`set_field_linked`) + "Sinkron assignee ke
  kartu tertaut" (`assign_linked`).
- `set_field_linked` editor: target-pipeline picker + the **field-map UI** (reuse the create_card maps block;
  here it maps THIS pipeline's fields → the target sibling's fields).
- `assign_linked` editor: target-pipeline picker only (assignee copied from the source card automatically) +
  a one-line hint.
- `ruleFormState.ts`: hydrate/serialize both like `move_linked` (target pipeline) — `set_field_linked` also
  carries `fieldMaps` like `create_card`.

## 5. Testing

- No new pure module (logic reuses `masterForSpawn` + `pickMappedValues`, already tested). If a small pure
  helper emerges (e.g. config validation), unit-test it; otherwise the two branches + validation + UI are
  covered by typecheck + build + the manual flow.
- Manual: see §6.

## 6. Manual acceptance (on dev)

1. Collections pipeline → rule: trigger `field_updated` → action `set_field_linked` (target Delegation,
   map "Catatan" → Delegation's "Catatan"). Edit that field on a Collections card that has a linked
   Delegation card → the Delegation card's field updates. No loop.
2. Collections rule: trigger `assignee_changed` → action `assign_linked` (target Delegation). Reassign the
   Collections card → the linked Delegation card's primary assignee follows (if that user can access
   Delegation).
3. Add the mirror rules on BOTH pipelines (bidirectional) → editing either side propagates once, no loop,
   no runaway.
4. Edit a field with NO linked sibling → action no-ops silently (warn in log).

## Out of scope (epic complete after this)

- Comments / attachments live-sync between linked cards.
- A dedicated `pipeline_sync_policy` table / standalone propagation engine (rules are the policy).
- Syncing secondary assignees (SP5) — only the primary is synced by `assign_linked`.
- Conflict resolution / last-writer-wins beyond the natural "the change that fired wins" (each event pushes
  the firing card's value; no merge logic).
