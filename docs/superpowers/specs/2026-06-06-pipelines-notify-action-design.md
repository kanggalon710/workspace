# Pipelines Notify Action — Bell + Webhook (P4b-2) Design

> The last missing automation action type. Adds a `notify` action to the P4d-1
> multi-action framework: one rule action can send an **in-app bell** notification
> and/or an **outbound webhook** (n8n-ready). Slots into the existing `actions[]`
> list — no new trigger/condition concepts. **No DB migration** (`action_type` is
> `varchar(16)`, fits "notify"; `action_config` is opaque JSON).

**Base branch:** `feat/pipelines-notify-action` off `dev` (includes P4a–P4c, edit-mode, P4d-1, P4d-3).
**Status:** Approved design, ready for spec review.

---

## Goal

A new action type `notify` whose config picks channels (`bell`, `webhook`, or both):
- **bell** → an in-app notification (`storage.createNotification`) to the card's
  assignee, a specific user, or the rule's creator.
- **webhook** → an outbound `POST` of a fixed structured JSON payload to a
  per-action URL (point it at an n8n webhook node).

It composes with the multi-action list: a rule can `set_field` + `notify`, two
`notify` actions to different targets, etc.

## Decisions (from brainstorming)

- One `notify` action with a **channel multiselect** (not two action types).
- Bell target: **assignee | specific user | rule creator** (no role-resolution).
  One target per notify action.
- Webhook: **per-action URL** (not a named registry); **fixed structured** JSON
  payload (n8n parses it).

---

## 1. Config (`action_config` for `notify`)

```ts
export type NotifyConfig = {
  channels: ("bell" | "webhook")[];          // at least one
  bellTarget?: "assignee" | "user" | "creator";
  bellUserId?: number;                        // required when bellTarget === "user"
  bellTitle?: string;                         // template; {title} → card title; default "Otomasi: {title}"
  bellMessage?: string;                       // template; {title} substitution
  webhookUrl?: string;                        // required when channels includes "webhook"
};
```
- `shared/schema.ts`: add `"notify"` to `PipelineRuleActionType`; add the `NotifyConfig` type.
- Stored in `pipeline_rule_actions.action_config` (JSON) — no schema/DB change.

## 2. Engine — `server/pipeline-automation.ts`

### `applyAction` gains the rule (judgment call, approved)
Change `applyAction(action, card, actorId)` → **`applyAction(action, rule, card, actorId)`**.
The only caller is `applyRuleActions` (which has `rule`), so threading is trivial.
Needed for bell target `creator` (`rule.createdBy`) and `ruleName` in the webhook
payload. The existing branches simply ignore the new param.

### `notify` branch
```ts
if (action.actionType === "notify") {
  const cfg = parseActionConfig("notify", action.actionConfig) as NotifyConfig | null;
  if (!cfg) { warn; return false; }
  let acted = false;
  if (cfg.channels.includes("bell")) {
    const userId = cfg.bellTarget === "user" ? cfg.bellUserId
      : cfg.bellTarget === "creator" ? rule.createdBy
      : card.assigneeId;                       // "assignee" (default)
    if (userId != null) {
      await storage.createNotification({
        userId, type: "automation",
        title: buildTargetTitle(cfg.bellTitle || "Otomasi: {title}", card.title),
        message: cfg.bellMessage ? buildTargetTitle(cfg.bellMessage, card.title) : undefined,
        link: "/pipelines", entityType: "pipeline_card", entityId: card.id, fromUserId: actorId,
      });
      acted = true;
    } else { console.warn(`[automation] notify action ${action.id}: bell target has no recipient — skipped bell`); }
  }
  if (cfg.channels.includes("webhook") && cfg.webhookUrl) {
    const ok = await postPipelineWebhook(cfg.webhookUrl, buildWebhookPayload(rule, card));
    if (ok) acted = true;
  }
  return acted;
}
```
- `buildTargetTitle` (existing helper) reused for `{title}` substitution + 255-cap.
- **bell `type`**: `"automation"` — NotificationBell renders unknown types with a
  default icon (acceptable; an icon mapping is out of scope).
- **bell mitra**: `createNotification` uses `getMitraIdOrNull() ?? 1`; the engine
  runs inside the tenant context (stage-enter request, or `withMitra` for time
  triggers), so the notif lands in the correct mitra.
- `link: "/pipelines"` (best-effort; deep-linking to a specific card is a later nicety).
- `acted = true` if any channel succeeded → the fire is recorded (once-dedup
  prevents re-notifying; for time `every`, it re-notifies per interval as designed).

### Webhook helper
A small `postPipelineWebhook(url, payload): Promise<boolean>` (in
`server/pipeline-automation.ts` or a tiny `server/pipeline-webhook.ts`):
```ts
// best-effort: ~5s timeout via AbortController; POST JSON; never throws.
// returns true on a network success (any HTTP response), false on error/timeout.
```
- **SSRF (judgment call, approved):** admin-configured URL on a trusted internal
  ops tool; minimal guard = the URL must parse as `http:`/`https:`. No private-IP
  blocking (the platform legitimately calls internal hosts). Documented as accepted.
- No retry (best-effort, like other outbound calls). Failures `console.warn`.

`buildWebhookPayload(rule, card)` (needs card field values → `storage.getCardValues`):
```json
{
  "event": "pipeline.automation",
  "ruleId": <id>, "ruleName": <name|null>,
  "card": { "id", "title", "pipelineId", "stageId", "assigneeId" },
  "values": { "<fieldId>": "<value>" },
  "firedAt": "<ISO>"
}
```
(`firedAt` stamped with `new Date().toISOString()` inside the helper.)

## 3. Validation — `server/routes.ts`

`validateActionConfig(pipelineId, "notify", cfg)`:
- `cfg.channels` is a non-empty array ⊆ {`bell`, `webhook`}.
- If `bell` ∈ channels: `bellTarget` ∈ {assignee, user, creator}; if `"user"` →
  `bellUserId` is a number.
- If `webhook` ∈ channels: `webhookUrl` is a string parsing as an `http(s)` URL.
- `validateActions` already dispatches non-create_card types to `validateActionConfig`
  — add `"notify"` to its allowed set.

## 4. Pure helpers — `server/pipeline-automation-helpers.ts` (TDD)

- `parseActionConfig("notify", raw)`: shape-guard a `NotifyConfig` — `channels`
  non-empty array of valid values; per-channel field presence; malformed → null.
  (Extends the existing `parseActionConfig` switch.)
- `shapeRuleActions`: add a `notify` case producing a human label, e.g.
  `notifyLabel` = `"bell→assignee, webhook"` (derived from channels + target) for the
  GET enrichment / read-side. (Pure; reuses the existing per-action shaping.)

## 5. Frontend

### `RuleActionEditor.tsx` — notify block
A `{value.actionType === "notify" && (...)}` block:
- **Channels**: two checkboxes/toggles (Bell internal / Webhook).
- When bell: a target `<Combobox>` (Assignee kartu / User tertentu / Pembuat rule);
  when "user" → a user `<Combobox>` (`staffUsers`); a title `<Input>` and message
  `<Input>` (both optional, `{title}` hint).
- When webhook: a URL `<Input type="url">`.
- All buttons `type="button"`; inputs use `<FormField>` (semantic).

### `ruleFormState.ts`
- `ActionDraft` gains notify fields: `notifyBell: boolean`, `notifyWebhook: boolean`,
  `bellTarget: "assignee"|"user"|"creator"`, `bellUserId: string`, `bellTitle: string`,
  `bellMessage: string`, `webhookUrl: string` (string-typed for form inputs; defaults
  in `emptyAction`).
- `draftToPayload` (notify branch): require ≥1 channel; build `channels` from the two
  booleans; emit `actionConfig: NotifyConfig`. Validate webhook url present when
  webhook checked, bellUserId present when target=user.
- `ruleToDraft`: hydrate notify fields from `a.actionConfig` (NotifyConfig).

### `PipelineRulesDialog.tsx` (read-side)
The per-action read-side (collapsed summary + detail) shows the notify label
(channels + bell target + webhook host) via the `shapeRuleActions` enrichment.

## 6. Files

| File | Change |
|---|---|
| `shared/schema.ts` | `"notify"` in `PipelineRuleActionType`; + `NotifyConfig` type |
| `server/pipeline-automation-helpers.ts` (+ test) | `parseActionConfig` notify case; `shapeRuleActions` notify label |
| `server/pipeline-automation.ts` | `applyAction(action, rule, card, actorId)` + notify branch; `postPipelineWebhook` + `buildWebhookPayload` |
| `server/routes.ts` | `validateActionConfig` notify case; `validateActions` allows notify |
| `client/components/pipelines/ruleFormState.ts` | `ActionDraft` notify fields; draft↔payload |
| `client/components/pipelines/RuleActionEditor.tsx` | notify editor block |
| `client/components/pipelines/PipelineRulesDialog.tsx` | read-side notify label |
| `client/hooks/usePipelines.ts` | `RuleActionView` already `actionConfig: any` — confirm notify fits (likely no change) |

No DB migration.

## 7. Edge cases

- **No recipient** (target=assignee but card unassigned) → bell skipped, webhook may
  still fire; `acted` reflects what actually sent.
- **Webhook down / timeout** → logged, doesn't block other actions (per-action
  try/catch in `applyRuleActions`); `acted=false` for that channel.
- **Loop-safety:** notify performs NO card mutation and never calls the automation
  service — inherently loop-safe.
- **Dedup:** once-dedup records the fire after a successful notify (no repeat on
  re-entry); time `every` re-notifies per interval (intended).
- **Multi-action:** notify composes with other actions; ordering by `position`.

## 8. Testing

Pure helpers TDD (`parseActionConfig("notify", …)` valid/malformed; `shapeRuleActions`
notify label). Typecheck + build + manual:
- bell→assignee fires to the assignee; →user to that user; →creator to the rule maker.
- webhook hits an n8n/requestbin URL with the structured payload.
- both channels in one notify; a notify alongside set_field in one rule (multi-action).
- target=assignee on an unassigned card → no bell, no crash; webhook still fires.
- dedup once: no double-notify on re-entry; time `every` re-notifies after interval.
- invalid config rejected at save (no channel / webhook checked but no URL / user target but no user).

## Out of scope (later)

- Named/reusable webhook registry (per-action URL only).
- Webhook retries / delivery log / HMAC signing.
- Role-target bell (resolve role→users) — deferred.
- Templated webhook payload / templated message beyond `{title}` (e.g. field
  placeholders) — fixed structured payload + `{title}` only.
- NotificationBell icon for the `automation` type.

## Consistency with memory

- [[project-pipelines-engine]] — P4b-2; update the deferred line on merge.
- [[feedback-coding-standards]] — pure helpers (SoC/TDD), reuse `buildTargetTitle`
  (DRY), semantic form inputs + button types.
- [[reference-api-response-envelope]] — routes keep `sendSuccess`/`sendError`.
- [[reference-tenant-isolation-gotchas]] — bell notif mitra via the active tenant
  context; webhook is mitra-agnostic outbound.
- No migration → [[reference-startup-add-column]] not engaged.
