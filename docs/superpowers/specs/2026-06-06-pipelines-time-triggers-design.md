# Pipelines Automation — Time-based Triggers (P4c) Design

> Phase 4c of the pipelines automation program. Adds a new **time-based trigger
> type** to `pipeline_rules`, alongside the existing stage-enter trigger. A
> time-triggered rule runs the **same actions** (create_card / set_field /
> move_stage / assign) and the **same IF conditions** already built in P4a/P4b-1
> — only the *when* is new.

**Base branch:** `feat/pipelines-time-triggers` off `dev` (P4b-1 merged).
**Status:** Approved design, ready for plan.

---

## Goal

A single **configurable** time trigger (not four fixed presets). Three building
blocks compose into every pattern the user asked for:

| Pattern | anchor | offset | repeat | stage scope |
|---|---|---|---|---|
| Diam di stage N hari (SLA) | `stage_entered` | `+N days` | once | (trigger stage) |
| N hari sejak dibuat | `card_created` | `+N days` | once | — |
| H-3 sebelum jatuh tempo | `field_date` | `-3 days` | once | — |
| Reminder berkala di stage | `stage_entered` | `+N` | every N | (trigger stage) |

The action layer (actionType + actionConfig + conditions + field maps) is **reused
unchanged** — a time trigger is just another way to fire those actions.

---

## 1. Data model — extend `pipeline_rules` (no new tables)

New columns (Approach A, consistent with P4b-1):

| Column | Type | Notes |
|---|---|---|
| `trigger_type` | `varchar(16) NOT NULL default 'stage_enter'` | `'stage_enter'` \| `'time'` |
| `trigger_config` | `text` (nullable) | JSON; null for stage_enter |

Relax existing:

| Column | Change | Reason |
|---|---|---|
| `trigger_stage_id` | `INT NOT NULL` → `INT NULL` | stage_enter: required (pemicu). time: optional **scope** (only cards currently in this stage). |

`trigger_config` JSON shape (time only):

```ts
type TimeTriggerConfig = {
  anchor: "stage_entered" | "card_created" | "field_date";
  fieldId?: number;                 // required iff anchor === "field_date"
  offsetN: number;                  // >= 0
  offsetUnit: "hours" | "days";
  direction: "after" | "before";    // "before" only meaningful for field_date
  repeat: "once" | "every";
  repeatEveryN?: number;            // > 0, required iff repeat === "every" (in offsetUnit)
};
```

New shared types (in `shared/schema.ts`, next to `PipelineRuleActionType`):

```ts
export type RuleTriggerType = "stage_enter" | "time";
export type TimeAnchor = "stage_entered" | "card_created" | "field_date";
export type TimeOffsetUnit = "hours" | "days";
export type TimeDirection = "after" | "before";
export type TimeRepeat = "once" | "every";
export type TimeTriggerConfig = {
  anchor: TimeAnchor; fieldId?: number;
  offsetN: number; offsetUnit: TimeOffsetUnit; direction: TimeDirection;
  repeat: TimeRepeat; repeatEveryN?: number;
};
```

**`offsetN` vs `repeatEveryN` (for `every`):** `offsetN` is the **initial** delay
from the anchor before the first fire (may be `0`); `repeatEveryN` is the
**cadence** between subsequent fires. E.g. *offsetN=1 day, every 2 days* = "first
reminder 1 day after stage-enter, then every 2 days after". For `once`,
`repeatEveryN` is ignored.

**Unchanged & reused:** `actionType`, `actionConfig`, `conditions`,
`pipeline_rule_field_maps`. Existing stage-enter rules get `trigger_type =
'stage_enter'` (column default) — zero behavior change.

## 2. `pipeline_cards.stage_entered_at` (new column)

Needed for O(1) "how long has this card been in its current stage". `updatedAt`
is unusable (bumps on any edit).

| Column | Type | Set when |
|---|---|---|
| `stage_entered_at` | `text` (ISO, nullable) | `createCard` = now; `moveCard` = now **only when stageId changes** |

**Backfill (judgment call, approved):** existing rows ← `created_at`. Pre-migration
cards' "time in stage" is therefore measured from creation, not their true last
move. Acceptable approximation; avoids an activity-log scan at migration time.

## 3. Fire & dedup — reuse `pipeline_rule_fires`

The existing `(rule_id, source_card_id)` row + `fired_at` column carry both modes:

- **`once`** — row exists for (rule, card) ⇒ already fired ⇒ skip. *Once-ever per
  card* (judgment call, approved) — consistent with stage-enter; a card
  re-entering a stage does **not** re-fire. (Listed under Out of Scope for a future
  re-entry-aware mode.)
- **`every`** — `fired_at` = last fire time. Re-fire when
  `now − fired_at ≥ repeatEveryN (in offsetUnit)`; on fire, **UPDATE** `fired_at`
  to now (so the table keeps one row per (rule, card), updated in place).
- **Condition fail** — no fire recorded (identical to P4b-1).

Storage gains `recordOrTouchRuleFire(ruleId, cardId)` (insert-or-update `fired_at`)
and `getRuleFire(ruleId, cardId)` (returns row incl. `firedAt` or null), so the
service can read last-fire and upsert. `recordRuleFire` (P4b-1 insert-once) stays
for stage-enter.

## 4. Evaluation engine

### 4a. Pure helper — `isTimeRuleDue` (unit-tested, no DB)

In `server/pipeline-automation-helpers.ts`, sibling of `evaluateConditions`:

```ts
parseTimeTriggerConfig(raw: string | null): TimeTriggerConfig | null
isTimeRuleDue(
  cfg: TimeTriggerConfig,
  card: { createdAt: string; stageEnteredAt: string | null },
  values: Map<number, string>,   // for field_date anchor
  now: Date,
  lastFiredAt: string | null,    // from pipeline_rule_fires
): boolean
```

Logic:
1. Resolve **anchor timestamp**:
   - `stage_entered` → `card.stageEnteredAt ?? card.createdAt`
   - `card_created` → `card.createdAt`
   - `field_date` → parse `values.get(cfg.fieldId)`; unparseable/empty ⇒ **not due** (`false`)
2. **Threshold** = anchor ± (offsetN × unit), sign by `direction` (`before` subtracts).
3. **once**: due iff `now ≥ threshold` **and** `lastFiredAt == null`.
4. **every**: anchor-threshold gate first (`now ≥ threshold`), then due iff
   `lastFiredAt == null` **or** `now − lastFiredAt ≥ repeatEveryN`.
5. Malformed cfg ⇒ `false` (never throws).

### 4b. Shared action dispatcher — refactor P4b-1

Extract the P4b-1 action `switch` (create_card / set_field / move_stage / assign,
incl. its per-action validation + loop-safe storage calls) out of
`runStageEnterAutomations` into:

```ts
applyRuleAction(rule: PipelineRule, card: PipelineCard, actorId: number): Promise<boolean>
// returns `acted` — true if a mutation happened (caller records the fire)
```

`runStageEnterAutomations` is rewritten to: match → dedup (`hasRuleFired`) →
conditions → `applyRuleAction` → `recordRuleFire` if acted. **No behavior change**
for stage-enter; this is a pure extraction so time triggers don't duplicate the
switch.

### 4c. Service — `runTimeTriggers()`

In `server/pipeline-automation.ts`. Tenant-aware (workers run outside tenant
context; storage auto-scopes by `getMitraId()`):

1. **Global** load of enabled `time` rules across all mitras
   (`storage.listAllTimeRules()` — *not* mitra-scoped; returns rows w/ their
   `mitraId`). Group by `mitraId`.
2. For each mitra, `tenantContext.run(mitraId, async () => …)`:
   - For each rule: load candidate cards = cards in `rule.pipelineId`, filtered to
     `trigger_stage_id` when set (the optional scope).
   - Per card: `getRuleFire` → if `once` & already fired, skip; parse conditions →
     load card values (once per card) → `evaluateConditions`; parse trigger config →
     `isTimeRuleDue(cfg, card, values, now, lastFiredAt)`.
   - If due: `applyRuleAction(rule, card, rule.createdBy)` (**actor =
     `rule.createdBy`**, judgment call approved, for audit attribution). If acted →
     `recordOrTouchRuleFire`.
3. Best-effort try/catch per rule and per card → `console.warn`; one bad card never
   blocks the pass. Returns `{ evaluated, fired }` counts.

**Loop-safety unchanged:** `applyRuleAction` mutates via storage directly; it never
calls the HTTP routes, so a time-triggered `move_stage` cannot re-enter the
stage-enter automation path.

## 5. Trigger mechanism (Approach B — cron-hit endpoint)

No in-process interval (Passenger spin-down + prod `WORKERS_ENABLED=false` make
`setInterval` unreliable). Instead:

- `POST /api/pipelines/automation/tick` — **no user auth**; guarded by header
  `X-Automation-Secret` compared (constant-time) to `process.env.PIPELINE_TICK_SECRET`.
  Missing/empty env ⇒ 503 (feature off). Bad/absent header ⇒ 401. Runs one
  `runTimeTriggers()` pass; returns `{ success, data: { evaluated, fired } }` via the
  standard envelope.
- Mounted **outside** the staff-auth router (sibling of the public/portal routers)
  so the bearer-token middleware doesn't reject it.
- cPanel cron (dev first):
  `*/10 * * * * curl -s -X POST -H "X-Automation-Secret: <secret>" https://workspace-dev.jabnet.id/api/pipelines/automation/tick > /dev/null 2>&1`
- Manual test = the same curl. No new worker process.
- `.env.example` gains `PIPELINE_TICK_SECRET=`. Prod/dev secret lives only in the
  cPanel private `.env` ([[feedback-credentials-in-db]] — env/DB plaintext is fine here).

## 6. UI — `client/components/pipelines/PipelineRulesDialog.tsx`

- New **"Pemicu"** selector at the top of the create form: `Saat masuk stage` (default)
  | `Berbasis waktu`.
- `stage_enter` → existing trigger-stage picker (unchanged).
- `time` → fields: **anchor** select; when `field_date`, a field Combobox filtered to
  `type === "date"`; **offset** (N number + unit `jam`/`hari` + arah `sebelum`/`sesudah`);
  **repeat** (`sekali` | `tiap N`); optional **batasan stage** select.
- New types in `client/hooks/usePipelines.ts`: extend `RuleWithMaps` with
  `triggerType`, `triggerConfig` (parsed object), and server-enriched display labels
  (`triggerFieldLabel`, `triggerStageScopeName`).
- Read-side (collapsed summary + detail panel): render the trigger human-readably,
  e.g. *"⏱ 3 hari setelah masuk stage"*, *"⏱ H-3 sebelum [Jatuh Tempo]"*,
  *"⏱ tiap 2 hari selama di [Follow-up]"*. Deleted field/stage → `(dihapus)` fallback
  (same pattern as P4b-1 field maps).

## 7. Server validation — `server/routes.ts`

`validateTriggerConfig(pipelineId, triggerType, triggerStageId, triggerConfig)`
(async, near `validateActionConfig`):

- `stage_enter`: `triggerStageId` required and ∈ pipeline stages.
- `time`:
  - `anchor` ∈ the three values.
  - `offsetN` is a number `≥ 0`; `offsetUnit` ∈ {hours, days}; `direction` ∈ {after, before}.
  - `anchor === "field_date"` ⇒ `fieldId` present, ∈ pipeline fields, **type `date`**.
  - `repeat ∈ {once, every}`; `every` ⇒ `repeatEveryN` number `> 0`.
  - `triggerStageId` (scope) optional; if present must ∈ pipeline stages.

POST/PATCH `/pipelines/:id/rules` dispatch on `triggerType`; GET enriches with the
display labels in §6. PATCH resolves `triggerType` from the existing rule when the
body omits it (mirrors the P4b-1 actionConfig fix).

---

## Files touched

| File | Change |
|---|---|
| `shared/schema.ts` | + `trigger_type`/`trigger_config` cols; relax `trigger_stage_id`; + `stage_entered_at` on `pipeline_cards`; + trigger types |
| `server/storage.ts` | migration (cols + MODIFY + backfill); `stageEnteredAt` in create/move; `listAllTimeRules`, `getRuleFire`, `recordOrTouchRuleFire`; create/update rule carry trigger fields |
| `server/pipeline-automation-helpers.ts` (+ test) | `parseTimeTriggerConfig`, `isTimeRuleDue` |
| `server/pipeline-automation.ts` | extract `applyRuleAction`; add `runTimeTriggers`; rewrite `runStageEnterAutomations` to reuse |
| `server/routes.ts` | `validateTriggerConfig`; POST/PATCH/GET rule trigger handling; mount tick router |
| `server/pipelines-tick-route.ts` (new) | `POST /api/pipelines/automation/tick` (secret-guarded) |
| `server/index.ts` | mount tick router |
| `client/hooks/usePipelines.ts` | `RuleWithMaps` trigger fields |
| `client/components/pipelines/PipelineRulesDialog.tsx` | trigger selector + time fields + read-side render |
| `.env.example` | `PIPELINE_TICK_SECRET=` |

## Migration (startup, in `server/storage.ts`)

Per [[reference-startup-add-column]] — DB rejects `ADD COLUMN IF NOT EXISTS`; use
info_schema COUNT guard + plain `ALTER TABLE ADD COLUMN`, each in its own try/catch:

1. `pipeline_rules.trigger_type VARCHAR(16) NOT NULL DEFAULT 'stage_enter'`
2. `pipeline_rules.trigger_config TEXT NULL`
3. `pipeline_cards.stage_entered_at TEXT NULL`
4. `ALTER TABLE pipeline_rules MODIFY trigger_stage_id INT NULL` (idempotent)
5. Backfill: `UPDATE pipeline_cards SET stage_entered_at = created_at WHERE stage_entered_at IS NULL`

Dev DB (`jabnet_fiber_dev`) first; prod only on explicit OK.

## Testing

- **Unit** (`pipeline-automation-helpers.test.ts`): `parseTimeTriggerConfig` (valid
  per anchor, malformed → null); `isTimeRuleDue` — once before/after threshold;
  field_date before/after & unparseable → false; every with null vs elapsed vs
  not-elapsed lastFiredAt; offset hours vs days; malformed → false.
- **Manual on dev** (post-deploy + cron set): card sits in stage past offset →
  curl tick → action fires once; second tick → no double-fire; `every` rule fires
  again after interval; field_date H-N fires on the right day; condition false →
  skips; stage scope excludes out-of-scope cards; existing stage-enter rules +
  field maps still fire unchanged; bad secret → 401, no secret env → 503.

## Out of scope (fast-follow / later)

- Re-fire on stage re-entry or when a `field_date` value changes (`once` stays
  once-ever per card).
- Timezone handling for `field_date` (assume date-only interpreted at 00:00 server
  local; document it).
- The **notify** action (bell + webhook/n8n) — that is P4b-2, independent of this.
- In-process dev auto-tick interval (chose pure cron; revisit only if dev DX hurts).

## Consistency with memory

- [[project-pipelines-engine]] — this is P4c; update its P4 line to mark P4c built
  on merge.
- [[reference-prod-billing-sync-manual]] — the cron-tick mechanism is *designed
  around* prod's manual/worker-off philosophy; it does not depend on
  `WORKERS_ENABLED`.
- [[reference-startup-add-column]] — migration follows the info_schema + plain
  ALTER pattern.
- [[reference-tenant-isolation-gotchas]] — `runTimeTriggers` loads rules globally
  then runs each mitra's fires inside `tenantContext.run(mitraId, …)` so
  storage's auto-scoping stays correct.
- [[reference-api-response-envelope]] — the tick endpoint uses `sendSuccess`.
