# Spec — Automation: Assignee-Access Guard + Cross-Pipeline Field Mapping (Phase 4a-ext)

> **Date:** 2026-06-04
> **Status:** Approved design, ready for implementation plan.
> **Program:** "Customizable Multi-Tenant Pipeline / Kanban" — extension of Phase 4a.
> **Builds on:** P1–P3 + P4a (cross-pipeline card-creation automation).

## Goal

Two refinements to the P4a automation:
1. **Assignee-access guard** — when a rule copies the assignee to the auto-created target card, only do so if that user can actually see the target pipeline; otherwise leave it unassigned.
2. **Explicit per-rule field mapping** — let a rule copy custom-field values from the source card to the target card, via user-configured `source field → target field` mappings, with a config-time "create the field in the target" action.

> **Note:** soft-required custom fields stay soft (warning only) — intentionally unchanged. A UI/UX polish pass is deferred until all functional features land.

## Key Decisions (from brainstorming)

- **Assignee guard mirrors P3 semantics:** a new `storage.canUserAccessPipeline(userId, pipelineId)` resolves the user's effective role at the current mitra; System-Admin/legacy-admin → true; unrestricted target → `pipelines` permLevel ≥ read; restricted target → that role has a grant. Copy assignee only when this is true; else unassigned + `console.warn`.
- **Field mapping = child table** `pipeline_rule_field_maps (rule_id, source_field_id, target_field_id)` (chosen over JSON for queryability + per-row uniqueness).
- **Create-if-missing = config time.** No special backend: the rule dialog calls the existing P2 `POST /pipelines/:targetId/fields` to create a target field (source field's name + type), then maps to its id. Every mapping points at a concrete target field.
- **Type safety:** a mapping must connect **same-type** fields — enforced server-side at rule save (400 on mismatch); the dialog only offers same-type target fields. Value strings copy directly at fire time (no conversion).
- **Defensive at fire time:** skip a mapping whose source/target field no longer exists (+warn) — same posture as the deleted-target-stage guard.
- All endpoints `sendSuccess`; all storage tenant-scoped via `getMitraId()`; new table via startup `CREATE TABLE IF NOT EXISTS` (no `ADD COLUMN IF NOT EXISTS`).

## Data Model (`shared/schema.ts`)

```ts
pipeline_rule_field_maps
  id            int autoincrement pk
  mitraId       int notNull default 1            // "mitra_id"
  ruleId        int notNull                      // "rule_id" → pipeline_rules.id
  sourceFieldId int notNull                      // "source_field_id" → pipeline_fields.id (source pipeline)
  targetFieldId int notNull                      // "target_field_id" → pipeline_fields.id (target pipeline)
  createdAt     text notNull
  // unique (rule_id, source_field_id); index (mitra_id, rule_id)
```
Type: `PipelineRuleFieldMap` (`$inferSelect`). Startup `CREATE TABLE IF NOT EXISTS`.

## Pure helper (extend `server/pipeline-automation-helpers.ts` + test)
```ts
// maps: [{sourceFieldId, targetFieldId}]; sourceValues: Record<fieldId, value>
// → the writes to apply on the target card, skipping empty source values.
pickMappedValues(maps, sourceValues): { fieldId: number; value: string }[]
```
TDD: returns target writes only for source fields with a non-empty value; empty/missing source values skipped.

## Backend

### Feature 1 — assignee guard
- `storage.canUserAccessPipeline(userId: number, pipelineId: number): Promise<boolean>`:
  - `mitraId = getMitraId()`; `eff = await getUserEffectivePermissionsAtMitra(userId, mitraId)`; `pipe = getPipeline(pipelineId)` (false if missing).
  - admin: `(eff.roleName === "System-Admin" || eff.roleName === "admin (legacy)") && eff.isSystem` → true.
  - unrestricted (`pipe.restricted !== 1`): return `(eff.perms["pipelines"] ?? "none") !== "none"`.
  - restricted: `eff.roleId ? (await getGrantLevelForRole(pipelineId, eff.roleId)) !== "none" : false`.
- In `runStageEnterAutomations`, replace the assignee line with:
  ```ts
  const assigneeId = (rule.copyAssignee && card.assigneeId && await storage.canUserAccessPipeline(card.assigneeId, rule.targetPipelineId))
    ? card.assigneeId : null;
  ```
  (When dropped, `console.warn` that the assignee was cleared for lack of target access.)

### Feature 3C — field mapping storage + service
- Storage: `getRuleFieldMaps(ruleId)`, `setRuleFieldMaps(ruleId, maps: {sourceFieldId,targetFieldId}[])` (replace-all: delete then insert, mitra-scoped). `deleteRule` also clears `pipeline_rule_field_maps`.
- `createRule`/`updateRule` accept `fieldMaps` and call `setRuleFieldMaps`.
- Service (after creating the target card, before recordRuleFire): 
  ```ts
  const maps = await storage.getRuleFieldMaps(rule.id);
  if (maps.length) {
    const srcVals = await storage.getCardValues(card.id);
    // defensive: keep only maps whose target field still exists in the target pipeline
    const targetFieldIds = new Set((await storage.listFields(rule.targetPipelineId)).map(f => f.id));
    const valid = maps.filter(m => targetFieldIds.has(m.targetFieldId));
    const writes = pickMappedValues(valid, srcVals);
    if (writes.length) await storage.setCardValues(newCard.id, writes);
  }
  ```
  (Wrapped in the service's existing best-effort try/catch — a mapping failure never breaks the card action.)

### Endpoints (rule CRUD already gated by `requirePipelineEdit` on the source pipeline)
- `POST`/`PATCH /api/pipelines/:id/rules[/:ruleId]` gain a `fieldMaps: [{sourceFieldId, targetFieldId}]` field. Validate at save:
  - each `sourceFieldId` belongs to the SOURCE pipeline (`:id`); each `targetFieldId` belongs to the rule's target pipeline;
  - the two fields have the **same `type`** (400 with a clear message otherwise).
- `GET /api/pipelines/:id/rules` response includes each rule's `fieldMaps` (so the dialog can render them).
- Field creation in the target uses the **existing** P2 `POST /pipelines/:targetId/fields` (no new endpoint) — caller must have edit on the target (P3 already enforces; the dialog only creates when the user has access).

## Frontend (`client/components/pipelines/PipelineRulesDialog.tsx`)
- Hooks: rule create/update mutations gain `fieldMaps`. `usePipeline(targetPipelineId)` already returns the target's `fields` (P2). `usePipeline(pipelineId)` returns this pipeline's `fields`. `createField` mutation (P2) reused for "create in target" — note it must target the *target* pipeline, so call it via a `usePipelineMutations(targetPipelineId)` instance (or a direct `api.post('/pipelines/:targetId/fields', ...)`).
- New **"Pemetaan field (opsional)"** section in the add/edit rule form, enabled once a target pipeline is chosen:
  - Rows: **[source field ▾]** (this pipeline's custom fields) → **[target field ▾]** (target pipeline's fields filtered to the **same type** as the chosen source field).
  - **"+ Buat di target"** per row when no same-type target field exists → creates a field in the target (source field's name + type) and selects it.
  - Add-row / remove-row. Collected into `fieldMaps` on submit.
- Rule-list summary: append e.g. `· +N field` when a rule has mappings.
- Existing rules (loaded with `fieldMaps`) render their mappings in edit mode.
- Design-system components; functional-first (UI/UX polish deferred per user).

## Testing
- Unit (`pipeline-automation-helpers.test.ts`): `pickMappedValues` — copies non-empty source values to target field ids; skips empty/missing; empty maps → [].
- Manual on dev (`jabnet_fiber_dev`, restart for the new table):
  - Rule A→B, copy-assignee on, mapping `harga(A:number) → harga(B:number)`; move a card (harga=169999, assignee=X) into trigger → B card has harga=169999; assignee=X if X can see B, else unassigned + warn (restricted B, X no grant).
  - "Buat di target" when B lacks harga → field created in B, value copied.
  - Type-mismatch mapping (e.g. number→text) rejected at save (400).
  - Mapping whose target field later deleted → that value skipped, card still created, move succeeds.
  - Dedup once-per-card unchanged; cross-mitra isolation; deleting the rule clears its field maps.
  - `npm run typecheck` 0; `npm run build` OK; helper tests pass.

## Out of Scope
Mapping built-in fields (priority/due-date/tags); runtime by-name field creation; cross-type value conversion; the deferred UI/UX polish pass.

## Consistency with Memory
- [[project-pipelines-engine]] — P4a extension.
- [[reference-api-response-envelope]] — `sendSuccess` on all endpoints.
- [[reference-startup-add-column]] — new table via `CREATE TABLE IF NOT EXISTS` (no `ADD COLUMN IF NOT EXISTS`).
- [[reference-tenant-isolation-gotchas]] — all map/value queries filter `mitra_id`; assignee guard resolves the assignee's per-mitra effective role; field creation in target is P3-gated.
