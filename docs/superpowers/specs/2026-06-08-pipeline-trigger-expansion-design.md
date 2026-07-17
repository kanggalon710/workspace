# Spec — Pipeline Trigger Expansion: card events (Phase 2)

> Date: 2026-06-08 · Mitra-scoped · Extends the pipeline automation engine's dispatch side.

## Goal

Add card-event triggers to the rule engine so tenants can automate on card edits, not just stage
entry / time / billing sync. Phase 2 adds `card_updated`, `assignee_changed`, and `field_updated`.
Conditions and actions are reused unchanged — only the dispatch side is generalized.

## Decisions (confirmed)

1. **Event set (this phase):** `card_updated`, `assignee_changed`, `field_updated` (optional field filter).
   Deferred: `card_created`, `comment_added`, `file_uploaded`, `card_deleted`, `payment_updated`
   (billing reactions already covered by `billing_sync` auto-resolve).
2. **Fire mode:** fire on **every occurrence** (no `hasRuleFired` dedup). `stage_enter` keeps its
   once-per-card behavior.
3. **field_updated granularity:** `triggerConfig.fieldId` optional — empty = any field, set = only that field.
4. **Loop-safety:** events are dispatched only from user-facing routes, never from automation's own
   storage mutations (a `set_field` action does NOT re-trigger `field_updated`). Same invariant that
   already makes `stage_enter` loop-safe.

## Engine (`server/pipeline-automation.ts`)

- Extract a shared `runRulesForCard(rules, card, actorId, opts: { dedup: boolean })` from the existing
  `runStageEnterAutomations`: it evaluates each rule's condition groups against the card's values and
  runs `applyRuleActions`. When `dedup` is true it keeps the current `hasRuleFired`/`recordRuleFire`
  behavior; when false it runs every time.
- `runStageEnterAutomations` becomes a thin caller: `matchStageEnterRules(...)` → `runRulesForCard(..., { dedup: true })`.
- New `dispatchCardEvent(eventType, card, actorId, ctx?: { changedFieldIds?: number[] })`: lists the
  card's pipeline rules with `triggerType === eventType` + enabled, filters via the pure
  `eventRuleMatches`, then `runRulesForCard(matched, card, actorId, { dedup: false })`. Best-effort —
  never throws to the caller (wraps in try/catch + console.warn, like the existing functions).

## Pure module (`shared/pipelineEventTriggers.ts`, unit-tested)

- `EVENT_TRIGGER_TYPES`: catalog `[{ type, label }]` for the 3 event types.
- `isEventTriggerType(t): boolean`.
- `eventRuleMatches(rule: { triggerType: string; triggerConfig: string | null }, eventType: string, ctx?: { changedFieldIds?: number[] }): boolean`:
  - returns false if `rule.triggerType !== eventType`.
  - `field_updated`: parse `triggerConfig` → if no `fieldId`, match (any field); else match when
    `ctx.changedFieldIds` includes that `fieldId`.
  - `card_updated` / `assignee_changed`: always match (the route decides when to dispatch).

## Dispatch hooks (routes)

- `PATCH /api/pipelines/cards/:cardId` (update): after a successful update, `await dispatchCardEvent("card_updated", card, actorId)`. If the assignee actually changed (compare before/after), also
  `dispatchCardEvent("assignee_changed", card, actorId)`.
- `PUT /api/pipelines/cards/:cardId/values` (multi-field set): after `setCardValues`, compute the set of
  changed field ids and `dispatchCardEvent("field_updated", card, actorId, { changedFieldIds })` once
  (the predicate intersects with each rule's configured `fieldId`, so a multi-field save fires each
  matching rule once, not per-field).

## Routes / validation

- `shared/schema.ts`: `RuleTriggerType` gains `"card_updated" | "assignee_changed" | "field_updated"`
  (column is `varchar(16)`; longest, `assignee_changed`, is exactly 16 chars — fits).
- `validateTriggerConfig`: `card_updated`/`assignee_changed` need no config; `field_updated` →
  if `triggerConfig.fieldId` is present it must be a field of this pipeline.
- **Fix (mirrors the billing_sync fix):** the rule CREATE handler currently persists `triggerConfig`
  only for `time`/`billing_sync`. Add `field_updated` so its `{ fieldId }` isn't dropped. The UPDATE
  handler already keeps config for any non-`stage_enter` trigger.

## Frontend (`PipelineRulesDialog`)

- The trigger-type selector gains the 3 event options (labels from `EVENT_TRIGGER_TYPES`).
- `field_updated` shows an optional field picker ("field tertentu / semua field") that sets
  `triggerConfig.fieldId`. `card_updated`/`assignee_changed` show no extra config.
- All three reuse the existing conditions + actions editors unchanged. On save, build the rule payload
  with the chosen `triggerType` (+ `triggerConfig.fieldId` for field_updated); hydrate on edit from
  `rule.triggerConfig`.

## Testing

`shared/pipelineEventTriggers.test.ts` — `eventRuleMatches`: field-specific match (in/not-in
`changedFieldIds`), any-field match (no `fieldId`), wrong-type no-match, `card_updated`/
`assignee_changed` always match. Engine refactor + route hooks verified via typecheck + build.

## Out of scope
- The deferred events listed above.
- A per-rule "once vs every time" toggle (event triggers are always every-occurrence this phase).
- Debounce/throttle of rapid repeated events (acceptable at current scale).
