# Spec — Conditional / Row-level Permissions (Phase 3b-iii)

> Date: 2026-06-08 · Mitra-scoped · Final sub-feature of Phase 3b (Advanced Permissions).

## Goal

Per (restricted pipeline × role): a **card filter** — a condition over card field values + stage. A card
that matches is visible and actionable to that role; a card that doesn't match is invisible and every
action on it is rejected. Implements row-level access (e.g. "Finance sees a card only if Department =
Finance"). Admins/creators bypass; open pipelines and roles with no filter see everything (unchanged).

## Decisions (confirmed)

1. **Scope:** single access axis — match ⇒ visible + actionable; no-match ⇒ invisible + blocked.
2. **Applies to:** restricted pipelines only; the filter is stored on the per-role grant
   (`pipeline_access.cardFilter`).
3. **Condition sources:** field + stage (reuse the Phase 4 `evaluateFieldConditionGroups`). Assignee-based
   ("only my cards") and open-pipeline filters are out of scope.

## 1. Pure module — `shared/cardRowFilter.ts` (no DB, unit-tested)

Reuses `evaluateFieldConditionGroups` + `FieldRuleCondition`/`FieldRuleCtx` from `shared/fieldRules.ts`.
```ts
import { evaluateFieldConditionGroups, type FieldRuleCondition, type FieldRuleCtx } from "./fieldRules.js";

export function resolveCardFilter(args: {
  isAdmin: boolean; isCreator: boolean; restricted: boolean;
  grantFilter: FieldRuleCondition[][] | null;
}): FieldRuleCondition[][] | null;
// null (no filtering — see all) when isAdmin || isCreator || !restricted || !grantFilter?.length; else grantFilter.

export function cardPassesFilter(filter: FieldRuleCondition[][] | null, ctx: FieldRuleCtx): boolean;
// filter == null → true; else evaluateFieldConditionGroups(filter, ctx).
```

## 2. Schema + storage

- `pipeline_access.cardFilter TEXT` — JSON `FieldRuleCondition[][]` per grant. Idempotent `ADD COLUMN`
  via the `p4cColAdds` array.
- `getCardFilterForRole(pipelineId, roleId): Promise<FieldRuleCondition[][] | null>` — read + parse the
  grant row's `cardFilter` (mitra-scoped); null if absent/empty/malformed.
- `setPipelineAccess` persists `cardFilter` per grant (extend the grant input shape with an optional
  `cardFilter`); `getPipelineAccess` returns it per grant.
- `getAllCardValuesForPipeline(pipelineId): Promise<Map<number, Record<number, string>>>` — **all** field
  values (not just `showOnCard`) keyed by cardId, for board filtering (batched, anti-N+1).

## 3. Server enforcement (`server/routes.ts`) — centralized

- `getCardFilterForRequest(req, pipelineId): Promise<FieldRuleCondition[][] | null>` →
  `resolveCardFilter({ isAdmin: isPipelineAdmin(req), isCreator: pipeline.createdBy === req.authUser.id, restricted: pipeline.restricted === 1, grantFilter: req.authUser.effectiveRoleId ? await getCardFilterForRole(pid, effectiveRoleId) : null })`.
- `requireCardAccess(req, res, card): Promise<boolean>` — `const filter = await getCardFilterForRequest(req, card.pipelineId); if (!filter) return true; const values = await storage.getCardValues(card.id); if (cardPassesFilter(filter, { values: <map>, stageId: card.stageId })) return true; sendError(res, "Kartu tidak ditemukan", 404); return false;` (404 hides existence for both reads and writes).

**Apply at every card path** (the enumerated checklist — central guard avoids gaps):
- **List** `GET /api/pipelines/:id/cards`: load full values via `getAllCardValuesForPipeline`, drop cards
  failing `cardPassesFilter` (filter resolved once for the request).
- **Detail** `GET /api/pipelines/cards/:cardId`: `requireCardAccess` after the card fetch.
- **Single-card mutations + sub-resources** — add `requireCardAccess` after the card is fetched in:
  `PATCH /cards/:cardId`, `POST /cards/:cardId/move`, `DELETE /cards/:cardId`,
  `PUT /cards/:cardId/values`, comments `GET/POST` `/cards/:cardId/comments` + `DELETE /cards/comments/:id`
  (resolve its card), followers `GET/POST/DELETE /cards/:cardId/followers...`,
  relations `GET/POST/DELETE /cards/:cardId/relations...`.
- **Export** `GET /api/pipelines/:id/cards/export`: filter the card set before building rows.
- **relations/search** `GET /api/pipelines/relations/search` (when `type === "card"`): drop result cards
  the requester can't access (cap is ~20 → per-result value fetch acceptable).
- **Create** `POST /:id/cards`: no card exists yet → not gated by the filter (creating a card the role
  then can't see is acceptable / an admin concern); leave on the `cards` capability.

Admin/creator and non-restricted pipelines short-circuit to `null` (no overhead). Automation (system) is
unaffected.

## 4. Frontend — `PipelineAccessDialog`

In the restricted-pipeline per-role grant editor, add an optional **"Filter Kartu"** section per role: a
`ConditionsBuilder` (with the Stage source, like the field-rules editor) bound to the grant's `cardFilter`.
Empty = that role sees all cards in the pipeline. Hydrate from the loaded access grants; send in the
`setPipelineAccess` payload.

## 5. Testing

`shared/cardRowFilter.test.ts`: `resolveCardFilter` (admin → null; creator → null; non-restricted → null;
restricted but no grant filter → null; restricted + filter → the filter), `cardPassesFilter` (null → true;
field match/no-match; stage match/no-match; AND/OR via the reused evaluator). Server/client wiring via
typecheck + build. Manual: a non-matching role gets 404 on detail + the card absent from the board.

## Out of scope
- View-vs-edit split (single axis only).
- Assignee-based ("only my cards") filters; open-pipeline filters.
- Migrating /leads + /collections (Phase 7).
