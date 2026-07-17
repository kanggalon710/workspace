# Spec — Pipelines Automation: Cross-Pipeline Card Creation (Phase 4a)

> **Date:** 2026-06-04
> **Status:** Approved design, ready for implementation plan.
> **Program:** "Customizable Multi-Tenant Pipeline / Kanban" — Phase 4a (first slice of the automation engine).
> **Builds on:** P1 (engine) + P2 (custom fields) + P3 (RBAC).

## Goal

When a card **enters a trigger stage**, automatically **create a card in another pipeline** at a
chosen stage — once per source card. No-code rule per (source) pipeline. This is the headline
"cross-pipeline" automation; it is the first slice of a larger automation engine.

## P4 Decomposition (only P4a is specced here)
- **P4a (this):** cross-pipeline card creation on stage-enter; once-per-card; no conditions; no chaining.
- P4b: within-pipeline actions (assign / set-field / move / notify) + simple field conditions.
- P4c: time-based triggers (due/idle) via a worker.
- P4d: rule chaining (+ depth guard) + nested AND/OR + formulas.

## Key Decisions (from brainstorming)
- **Trigger:** "card enters stage X" — fires on both move-into and create-into that stage. No extra
  IF conditions in P4a.
- **Action:** `create_card` — create a card in a target pipeline/stage (same mitra).
- **Once per source card per rule** — a `pipeline_rule_fires` dedup row; re-entering the stage does
  not duplicate. Also a loop-safety backstop.
- **Engine hook = Approach A:** an automation service called from the card **move + create routes**
  after the mutation succeeds. Engine-created cards do NOT re-trigger rules (no chaining in P4a) →
  loop-safe. Rejected: hooking inside storage (recursion/data-layer orchestration); async queue
  (infra overkill for synchronous single-hop).
- Failures in automation are caught + logged, never break the user's card action (same pattern as
  notifications).
- DB changes target `jabnet_fiber_dev` first; new tables via startup `CREATE TABLE IF NOT EXISTS`
  (NOT db:push; and NOT `ADD COLUMN IF NOT EXISTS` — see memory `reference-startup-add-column`).
- All endpoints use `sendSuccess`; all storage tenant-scoped via `getMitraId()`.

## Data Model (`shared/schema.ts`)

```ts
pipeline_rules
  id              int autoincrement pk
  mitraId         int notNull default 1            // "mitra_id"
  pipelineId      int notNull                      // "pipeline_id" — the SOURCE pipeline this rule belongs to
  name            varchar(255)                     // optional label
  triggerStageId  int notNull                      // "trigger_stage_id" — fires when a card ENTERS this stage
  actionType      varchar(16) notNull default 'create_card'  // "action_type" — enum, P4a only create_card
  targetPipelineId int notNull                     // "target_pipeline_id"
  targetStageId   int notNull                      // "target_stage_id"
  titleTemplate   varchar(255)                     // null = copy source title; supports {title}
  copyAssignee    int notNull default 0            // "copy_assignee" 0/1
  enabled         int notNull default 1
  createdBy       int notNull                      // "created_by"
  createdAt       text notNull
  updatedAt       text

pipeline_rule_fires                                // once-per-(rule,card) dedup
  id            int autoincrement pk
  mitraId       int notNull default 1
  ruleId        int notNull                        // "rule_id"
  sourceCardId  int notNull                        // "source_card_id"
  firedAt       text notNull                       // "fired_at"
  // unique (rule_id, source_card_id); index (mitra_id, rule_id)
```

Types: `PipelineRule`, `PipelineRuleFire` (`$inferSelect`); `PipelineRuleActionType = "create_card"`.

**Migration:** both via startup `CREATE TABLE IF NOT EXISTS` in `server/storage.ts` (idempotent,
additive). No ALTER of existing tables.

## Engine (`server/pipeline-automation.ts` + pure helpers + service)

### Pure helpers (`server/pipeline-automation-helpers.ts` + test) — TDD
- `matchStageEnterRules(rules: PipelineRule[], stageId: number): PipelineRule[]` — enabled rules
  whose `triggerStageId === stageId` and `actionType === "create_card"`.
- `buildTargetTitle(template: string | null, sourceTitle: string): string` — if template falsy →
  sourceTitle; else replace `{title}` with sourceTitle (global), trim to 255.

### Storage methods
- Rule CRUD: `listRules(pipelineId)`, `createRule(pipelineId, data)`, `updateRule(id, data)`,
  `deleteRule(id)` (also delete its `pipeline_rule_fires`).
- Dedup: `hasRuleFired(ruleId, sourceCardId): Promise<boolean>`, `recordRuleFire(ruleId, sourceCardId)`.
- Reuse existing `listRules`-style mitra scoping.

### Service `runStageEnterAutomations(card, actorId)` (`server/pipeline-automation.ts`)
1. `rules = matchStageEnterRules(await storage.listRules(card.pipelineId), card.stageId)`.
2. For each rule: if `await storage.hasRuleFired(rule.id, card.id)` → skip.
3. Create the target card: `storage.createCard(rule.targetPipelineId, { stageId: rule.targetStageId,
   title: buildTargetTitle(rule.titleTemplate, card.title), description: "Dibuat otomatis dari kartu #"+card.id,
   assigneeId: rule.copyAssignee ? card.assigneeId : null }, actorId)`.
4. `await storage.recordRuleFire(rule.id, card.id)`.
5. Wrap the whole thing in try/catch → `console.warn` on failure; never throw to the caller.
- **No chaining:** the target card is created via storage directly; the service is NOT re-invoked
  for it. Loop-safe in P4a.

### Wiring (routes)
- `POST /api/pipelines/:id/cards` (create): after `storage.createCard`, call
  `await runStageEnterAutomations(card, req.authUser!.id)` before `sendSuccess`.
- `POST /api/pipelines/cards/:cardId/move` (move): after `storage.moveCard`, if the stage actually
  changed, call `runStageEnterAutomations(movedCard, req.authUser!.id)`.
  (Both already load the resulting card object.)

## Endpoints (gated by `requirePipelineEdit` on the SOURCE pipeline; `sendSuccess`)
- `GET    /api/pipelines/:id/rules`
- `POST   /api/pipelines/:id/rules` — body `{name?, triggerStageId, targetPipelineId, targetStageId,
  titleTemplate?, copyAssignee?, enabled?}`. Validates: `triggerStageId`+`targetStageId`+
  `targetPipelineId` present; the **target pipeline must be in the same mitra AND the caller must
  resolve ≥ view on it** (`getPipelineLevel(req, targetPipelineId) !== "none"`) — can't auto-create
  into a pipeline you can't access.
- `PATCH  /api/pipelines/:id/rules/:ruleId` — edit / enable-disable.
- `DELETE /api/pipelines/:id/rules/:ruleId` — clears its `pipeline_rule_fires` too.

## Frontend (`client/`)
- **`useRules(pipelineId)`** + `createRule`/`updateRule`/`deleteRule` mutations in `usePipelines.ts`.
- **`PipelineRulesDialog`** (`client/components/pipelines/PipelineRulesDialog.tsx`) — opened from the
  board next to "Akses"/"Kelola Field", shown only when `writable`. Lists rules in plain language
  ("Saat kartu masuk **<trigger stage>** → buat kartu di **<target pipeline> / <target stage>**") with
  add/edit form: trigger-stage `Combobox` (this pipeline's stages, from `usePipeline`), target-pipeline
  `Combobox` (from `usePipelines()` — only accessible pipelines), target-stage `Combobox` (loaded for
  the chosen target via `usePipeline(targetId)` or a stages fetch), optional title template `Input`
  (hint: `{title}`), "Salin assignee" `Switch`, "Aktif" `Switch`, delete with confirm. Design-system.
- No board-card changes — automation is invisible until it fires.

## Testing
- Unit (`server/pipeline-automation-helpers.test.ts`): `matchStageEnterRules` (enabled+trigger match,
  ignores disabled / other stages / non-create_card); `buildTargetTitle` (copy when no template, `{title}`
  substitution, 255 cap). `npx tsx --test`.
- Manual on dev (`jabnet_fiber_dev`, restart for new tables): rule on pipeline A (enter "Negotiation" →
  create in B "Survei"); move a card into Negotiation → one card appears in B/Survei; move out+back →
  no duplicate; disable → no fire; create a card directly into Negotiation → fires; delete rule → fires
  cleared; can't target an inaccessible pipeline (validation 403/400); cross-mitra isolation; automation
  failure (e.g. bad target) doesn't break the move. `npm run typecheck` 0; `npm run build` OK.

## Out of Scope (P4a)
Within-pipeline actions (assign/set-field/move/notify); IF conditions; time-based triggers; rule
chaining; nested AND/OR; formulas; field mapping beyond title + assignee; editing which fields copy.

## Consistency with Memory
- [[project-pipelines-engine]] — P4a of the program.
- [[reference-api-response-envelope]] — endpoints use `sendSuccess`.
- [[reference-startup-add-column]] — new tables via `CREATE TABLE IF NOT EXISTS`; no `ADD COLUMN IF NOT EXISTS`.
- [[reference-tenant-isolation-gotchas]] — all rule/fire queries filter `mitra_id`; target pipeline is
  same-mitra; the create-rule endpoint also enforces P3 access on the target pipeline.
