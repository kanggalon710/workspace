# Spec — Multi-Assignee (SP5 of Advanced Pipeline Automation)

> Date: 2026-06-09 · Mitra-scoped · Fifth sub-project. SP1/SP2/SP3a/SP4 merged. Build on `dev`.
> Adds secondary assignees alongside the existing single primary assignee + existing watchers.

## Goal

A card can have one **primary** assignee (today's `assigneeId`) plus optional **secondary** assignees
(many), with **watchers** unchanged (existing followers). Each pipeline keeps its own card PICs (Agus on
the Collections card, Tomi on the Delegation card, either addable as secondary on the other).

## Decisions (confirmed)

1. **Primary = `pipeline_cards.assigneeId`** (no data migration — a single-assignee card is primary-only,
   fully backward compatible). Automation `assign` action + board assignee filter keep targeting primary.
2. **Secondary = new table `pipeline_card_assignees`** (many per card).
3. **Watchers = existing `pipeline_card_followers`** — unchanged.

## 1. Schema

New table (startup `CREATE TABLE IF NOT EXISTS`, alongside the other `pipeline_card_*` tables):
```sql
CREATE TABLE IF NOT EXISTS pipeline_card_assignees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mitra_id INT NOT NULL DEFAULT 1,
  card_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE KEY uniq_card_assignee (card_id, user_id),
  KEY idx_card_assignees_mitra_card (mitra_id, card_id)
);
```
Drizzle `pipelineCardAssignees` in `shared/schema.ts` (mirror `pipelineCardFollowers`). The unique key
prevents duplicates; a user can be both primary and secondary only by accident — the UI prevents adding
the current primary as secondary (see §5), and notifications dedupe by Set anyway.

## 2. Pure module — `shared/cardAssignees.ts` (no I/O, unit-tested)

```ts
/** Distinct user ids assigned to a card (primary first, then secondary), deduped, nulls dropped. */
export function allAssigneeIds(primaryId: number | null | undefined, secondaryIds: number[]): number[];
/** Board filter: does this card match an assignee filter for `filterId`? (primary OR secondary) */
export function matchesAssigneeFilter(primaryId: number | null | undefined, secondaryIds: number[], filterId: number | null): boolean;
// filterId == null → true (no filter). Else true if filterId === primary or in secondary.
```

## 3. Storage (`server/storage.ts`) — mirror followers

- `listCardAssignees(cardId): Promise<PipelineCardAssignee[]>` (secondary only; mitra-scoped).
- `addCardAssignee(cardId, userId, actorId): Promise<void>` — insert (swallow dup), `logCardActivity(cardId, actorId, "assignee_added", {userId})`.
- `removeCardAssignee(cardId, userId, actorId): Promise<void>` — delete + `logCardActivity(..., "assignee_removed", {userId})`.
- `getSecondaryAssigneesForCards(cardIds: number[]): Promise<Map<number, number[]>>` — batched (anti-N+1)
  via `inArray`, for the board (cardId → secondary userIds[]).

## 4. Endpoints (`server/routes.ts`) — mirror the followers routes (~5000)

| Endpoint | Guard |
|---|---|
| `GET /api/pipelines/cards/:cardId/assignees` | `requirePermission("pipelines")` + `requirePipelineView` + `requireCardAccess` → secondary list |
| `POST /api/pipelines/cards/:cardId/assignees` `{userId}` | `requireWritePermission` + `requirePipelineCapability(cards)` + `requireCardAccess` + `canUserAccessPipeline(userId, card.pipelineId)` → add + notify the added user |
| `DELETE /api/pipelines/cards/:cardId/assignees/:userId` | same write guards → remove |

`canUserAccessPipeline` check mirrors the existing `assign` action guard (don't assign someone who can't
see the pipeline). Adding a secondary assignee fires a bell notification to that user
("Anda ditambahkan ke kartu …").

**Notifications:** extend `notifyPipelineCardWatchers` (routes.ts:4241) to add secondary assignees to the
`targets` Set (so they get card-event notifications like primary + watchers).

## 5. Frontend — `CardDetailModal`

In the card detail (near the existing primary-assignee picker, gated by the `assign` capability — the
modal already has `canAssign`):
- Keep the **primary** assignee picker as-is.
- Add a **"Penanggung jawab tambahan"** section: a multi-add control (Combobox of assignable users,
  excluding the current primary + already-added secondaries) showing chips with a remove (×) each.
  Uses `useCardAssignees`/`useAddCardAssignee`/`useRemoveCardAssignee` hooks (mirror the follower hooks).
- Watchers (followers) UI stays as-is.
- Avatars: primary shown solid; secondary shown smaller/outlined (so the role is visually clear).

Board (`PipelineBoardPage`): the assignee **filter** must match primary OR secondary. The cards list
already carries `assigneeId`; add `secondaryAssigneeIds: number[]` per card to the list response (batched
via `getSecondaryAssigneesForCards`), and change the filter predicate to
`matchesAssigneeFilter(c.assigneeId, c.secondaryAssigneeIds ?? [], assigneeId)`. The card chip may show a
small "+N" when there are secondaries (optional, low priority).

## 6. Automation

The `assign` action keeps setting the **primary** assignee (unchanged). A future "add secondary assignee"
action is **out of scope** for SP5 (add later if a rule needs it).

## 7. Testing

- `shared/cardAssignees.test.ts`: `allAssigneeIds` (dedupe, drop null primary, primary-first order),
  `matchesAssigneeFilter` (null filter → true; primary match; secondary match; no match).
- Storage methods, endpoints, notify extension, UI, board filter: typecheck + build + manual.

## 8. Manual acceptance (on dev)

1. Open a Collections card (primary = Agus). Add **Tomi** as a secondary assignee → Tomi gets a bell
   notification; Tomi appears as a secondary chip.
2. Move/comment on the card → both Agus and Tomi (and any watcher) are notified.
3. Board filter "Assignee = Tomi" → the card shows up (matched via secondary), even though primary is Agus.
4. Remove Tomi → chip gone, no longer notified, no longer matched by the filter.
5. Existing single-assignee cards behave exactly as before (primary-only).

## Out of scope (→ later / SP3b)

- Automation action to set/clear secondary assignees.
- Bulk reassignment, assignee workload analytics.
- SP3b continuous sync (e.g. mirroring assignees across linked cards) — that's the sync engine's job.
- Migrating the collections importer's "Tim Penagih" user-multiple custom field into this model (leave as-is).
