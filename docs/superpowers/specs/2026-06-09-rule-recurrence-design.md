# Spec - Rule Re-trigger / Recurrence (SP4 of Advanced Pipeline Automation)

> Date: 2026-06-09 · Mitra-scoped · Fourth sub-project. SP1/SP2/SP3a merged. Build on `dev`.
> Makes the once-per-card dedup configurable so the Finance flow can re-run when a customer re-isolirs.

## Goal

Let a `stage_enter` rule re-fire for the same card instead of only once-ever, via a per-rule recurrence
mode, plus a manual "re-run automation" action. Default stays `once` (today's behavior) - backward
compatible.

## Decisions (confirmed)

1. **Three modes** on the rule: `once` (default) | `on_reenter` | `always`. Plus a **manual retrigger**
   endpoint/button. True calendar/period-keyed recurrence is **out of scope** (mapped to the billing_sync
   new-card-per-cycle path).
2. **Reuse-vs-fresh on re-fire** is NOT part of SP4 - it's already SP3a's `create_card` `reuseExisting`
   flag (reuse → updates the existing linked card; off → spawns a fresh one).
3. **`on_reenter` clears its fire when the card leaves the trigger stage** (clear-on-leave), so re-entry
   re-fires. `always` never dedups. `once` never clears.

## 1. Schema

`pipeline_rules` gains `recurrence varchar(16) NOT NULL DEFAULT 'once'`. Migration via the guarded
`ADD COLUMN` array (info_schema COUNT check). Existing rules → `'once'` (unchanged behavior).
`shared/schema.ts`: add the column to `pipelineRules` + `export type RuleRecurrence = "once" | "on_reenter" | "always";`

## 2. Pure module - `shared/ruleRecurrence.ts` (no I/O, unit-tested)

```ts
export type RuleRecurrence = "once" | "on_reenter" | "always";
export const RECURRENCE_MODES: { mode: RuleRecurrence; label: string; hint: string }[] = [
  { mode: "once",       label: "Sekali",                hint: "Fire sekali seumur kartu (default)." },
  { mode: "on_reenter", label: "Saat masuk ulang stage", hint: "Fire lagi tiap kartu masuk ulang ke stage pemicu." },
  { mode: "always",     label: "Setiap kali",           hint: "Fire tiap kali kartu masuk stage pemicu." },
];
const VALID = new Set(RECURRENCE_MODES.map((m) => m.mode));
export function parseRecurrence(raw: string | null | undefined): RuleRecurrence {
  return typeof raw === "string" && VALID.has(raw as RuleRecurrence) ? (raw as RuleRecurrence) : "once";
}
/** Should the engine check hasRuleFired (and skip when already fired) before firing? */
export function dedupBeforeFire(mode: RuleRecurrence): boolean { return mode !== "always"; }
/** Should the engine record a fire after a successful run? */
export function recordAfterFire(mode: RuleRecurrence): boolean { return mode !== "always"; }
```

## 3. Engine - `server/pipeline-automation.ts` (`runRulesForCard` ~183)

The blanket `opts.dedup` flag distinguishes stage_enter (dedup-capable) from events (always-fire). Keep
that, but when `opts.dedup` is true, branch on the rule's recurrence:
```ts
const mode = parseRecurrence((rule as any).recurrence);
if (opts.dedup && dedupBeforeFire(mode) && await storage.hasRuleFired(rule.id, card.id)) continue;
// ... conditions + applyRuleActions ...
if (opts.dedup && recordAfterFire(mode) && acted) await storage.recordRuleFire(rule.id, card.id);
```
`always` → no skip, no record (fires every dispatch). `once`/`on_reenter` → check + record. Event triggers
(`opts.dedup=false`) are unchanged.

## 4. Clear-on-leave - move endpoint (`server/routes.ts` ~4836) + storage

New storage method:
```ts
// Delete fire records for on_reenter stage_enter rules in `pipelineId` whose trigger stage == fromStageId,
// for this card - so the rule can fire again on re-entry. Mitra-scoped. Returns count cleared.
clearReentryFires(cardId: number, fromStageId: number, pipelineId: number): Promise<number>;
```
Implementation: find rules where `mitra_id=current AND pipeline_id=pipelineId AND trigger_type='stage_enter'
AND trigger_stage_id=fromStageId AND recurrence='on_reenter'`; delete their `pipeline_rule_fires` rows for
`source_card_id=cardId`.

In the move endpoint, gate BOTH the clear and the re-dispatch on a real stage change:
```ts
if (cardForGuard.stageId !== card.stageId) {
  await storage.clearReentryFires(card.id, cardForGuard.stageId, card.pipelineId); // FROM-stage on_reenter fires
  await runStageEnterAutomations(card, req.authUser!.id);                          // TO-stage enter rules
}
```
(No-op moves clear nothing. Clearing the FROM-stage's on_reenter fires + running the TO-stage's enter
rules act on independent stages, so order doesn't matter for correctness.)

## 5. Manual retrigger - endpoint + storage + UI

- Storage: `clearStageFires(cardId, stageId, pipelineId)` - delete fire rows for stage_enter rules in the
  pipeline whose `trigger_stage_id = stageId`, for this card (any recurrence). Returns count.
- Endpoint `POST /api/pipelines/cards/:cardId/retrigger`: `requireWritePermission("pipelines")` +
  `requirePipelineCapability(cards)` + `requireCardAccess`. Loads the card, `clearStageFires(card.id,
  card.stageId, card.pipelineId)`, then `runStageEnterAutomations(card, actor)`. Returns `{retriggered:true}`.
- UI: `CardDetailModal` gets a "Jalankan ulang otomasi" button (only when `writable` + `cards` cap),
  hook `useRetriggerCard(cardId)` (invalidates the card + its related/attachments queries). A toast on
  success/failure.

## 6. Rule plumbing - create/update/validate + form/editor

- `storage.createRule` / `updateRule`: accept + persist `recurrence` (default `'once'` on create).
- `server/routes.ts` rule POST/PATCH: pass `recurrence` through; clamp to a valid mode via `parseRecurrence`
  server-side (defensive). `validateTriggerConfig` unaffected (recurrence is rule-level, not trigger config).
- `client/components/pipelines/ruleFormState.ts`: `RuleDraft` gains `recurrence: RuleRecurrence`;
  `emptyDraft` → `"once"`; `ruleToDraft` reads `r.recurrence`; `draftToPayload` sends it.
- `client/components/pipelines/PipelineRulesDialog.tsx`: a **"Pengulangan"** Combobox (the 3 modes with
  hints) shown ONLY when `triggerType === "stage_enter"`. For other triggers it's hidden and the payload
  sends `"once"` (irrelevant there).

## 7. Testing

- `shared/ruleRecurrence.test.ts`: `parseRecurrence` (valid 3 / garbage / null → once), `dedupBeforeFire`
  + `recordAfterFire` (always → false; once/on_reenter → true).
- Engine branch, clear-on-leave, retrigger endpoint, plumbing, UI: typecheck + build + manual.

## 8. Manual acceptance (on dev)

1. Collections rule "Follow Up 1" → mirror to Delegation, recurrence = **Saat masuk ulang stage**.
2. Move a card to Follow Up 1 → Delegation card spawned. Move it OUT (e.g. to New), then back to Follow
   Up 1 → the rule fires **again** (with `reuseExisting` it updates the same Delegation card; without, a
   fresh one).
3. Set recurrence = **Sekali** on another rule → re-entry does NOT re-fire (current behavior).
4. On a card, click **"Jalankan ulang otomasi"** → the current stage's rules re-evaluate immediately.

## Out of scope (→ later)

- Calendar/period-keyed recurrence (same card re-fires monthly without a stage move) - covered by the
  billing_sync new-card path; revisit only if a non-billing recurrence need appears.
- Recurrence for non-`stage_enter` triggers (events already fire every time; time triggers have their own
  cadence).
- SP3b continuous sync; SP5 multi-assignee.
