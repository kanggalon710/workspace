# Spec — Card Identity / Lineage (SP2 of Advanced Pipeline Automation)

> Date: 2026-06-09 · Mitra-scoped · Second sub-project of the epic. SP1 (attachments) merged.
> Foundation for SP3 (cross-pipeline mirror/sync) + SP4 (re-trigger). Build on `dev`. DB changes allowed.

## Goal

Give every pipeline card lineage anchors so one business entity can exist as multiple cards across
pipelines and be found as a group. SP2 only **establishes + surfaces** lineage. The *sync* between linked
cards (field/stage/assignee mirroring) and per-link sync policies are SP3.

## Decision (confirmed)

**Master = root card id (self-referential).** The first card of an entity is its own master
(`master_card_id = id`). A card spawned from another inherits the origin's master. "All cards of this
entity" = `WHERE master_card_id = X`. No new master table.

## 1. Schema — 3 columns on `pipeline_cards`

`shared/schema.ts` `pipelineCards`, add:
- `masterCardId: int("master_card_id")` — root card id; equals `id` for a root card. Nullable in the DDL
  only so backfill/insert can set it in a second step; logically always populated after creation.
- `originCardId: int("origin_card_id")` — the immediate card this one was spawned from; `null` for roots.
- `relationType: varchar("relation_type", { length: 16 })` — how this card relates to its origin; `null`
  for roots. Values from `shared/cardIdentity.ts` (below).

No index needed beyond the implicit ones for SP2's query volume; a `(mitra_id, master_card_id)` index is
added so "related cards" lookups stay cheap.

## 2. Pure module — `shared/cardIdentity.ts` (no I/O, unit-tested)

```ts
export type CardRelationType = "mirror" | "duplicate" | "linked" | "child";

export const CARD_RELATION_TYPES: { type: CardRelationType; label: string }[] = [
  { type: "mirror",    label: "Mirror" },
  { type: "duplicate", label: "Duplikat" },
  { type: "linked",    label: "Tertaut" },
  { type: "child",     label: "Turunan" },
];

const VALID = new Set(CARD_RELATION_TYPES.map((t) => t.type));
export function isValidRelationType(v: unknown): v is CardRelationType {
  return typeof v === "string" && VALID.has(v as CardRelationType);
}
export function relationTypeLabel(v: string | null | undefined): string {
  return CARD_RELATION_TYPES.find((t) => t.type === v)?.label ?? "";
}
/** master for a new card: inherit the origin's master, else (root) the card's own id. */
export function resolveMasterCardId(originMasterId: number | null | undefined, ownId: number): number {
  return originMasterId && originMasterId > 0 ? originMasterId : ownId;
}
```

`relation_type` is intentionally NOT `manual`/`root` — roots store `null`. `manual` relations (the
existing `card_relations` entity cross-ref) are a separate concern and stay untouched.

## 3. Migration + backfill (`server/storage.ts`)

Add to the existing column-additions array pattern (the `loyaltyColumnAdditions` block ~line 690, which
guards each `ADD COLUMN` with an `information_schema.columns` COUNT check + per-column try/catch):
- `pipeline_cards.master_card_id INT NULL`
- `pipeline_cards.origin_card_id INT NULL`
- `pipeline_cards.relation_type VARCHAR(16) NULL`

Then a **one-time idempotent backfill** right after those adds:
```sql
UPDATE pipeline_cards SET master_card_id = id WHERE master_card_id IS NULL;
```
Idempotent (the `WHERE` guard means re-runs touch nothing). Also add the index:
`CREATE INDEX idx_pipeline_cards_master ON pipeline_cards (mitra_id, master_card_id)` guarded by the
existing idempotent-index helper (reads `information_schema.statistics` first).

## 4. `createCard` changes (`server/storage.ts:1944`)

Extend the `data` param with optional `originCardId?: number | null; relationType?: string | null;
masterCardId?: number | null;`. After the insert + getting `insertId`:
- If `data.masterCardId` provided → use it (a spawned card passes the origin's master).
- Else → `UPDATE pipeline_cards SET master_card_id = ? WHERE id = ? AND mitra_id = ?` with `insertId`
  (root card points at itself).
- Persist `origin_card_id` + `relation_type` from `data` (null for normal/manual creation).

The existing `create_card` automation action (`server/pipeline-automation.ts:51`) keeps working unchanged
(it passes no lineage → the new card becomes its own root). SP3 will pass `masterCardId`/`originCardId`/
`relationType` to actually link mirrored cards; SP2 just makes the plumbing exist.

## 5. Storage read — related cards

```ts
// Sibling cards sharing this card's master (across pipelines), with pipeline + stage labels.
// Excludes the card itself. Mitra-scoped.
getRelatedCards(cardId: number): Promise<Array<{
  id: number; pipelineId: number; pipelineName: string; stageId: number; stageLabel: string;
  title: string; relationType: string | null; originCardId: number | null;
}>>
```
Implementation: load the card (mitra-scoped) → `masterId = card.masterCardId ?? card.id` → select cards
where `master_card_id = masterId AND id != cardId`, join `pipelines.name` + `pipeline_stages.label`.

## 6. Endpoint (`server/routes.ts`)

`GET /api/pipelines/cards/:cardId/related` — `requirePermission("pipelines")` + load card +
`requirePipelineView(card.pipelineId)` + `requireCardAccess(card)` → `getRelatedCards(cardId)`. Each
returned sibling is a card the requester may or may not have row-level access to in *its* pipeline; for
SP2 the list shows title/pipeline/stage only (metadata), and clicking through goes to that pipeline where
the normal access guards apply. (No cross-pipeline data leak: only title + pipeline/stage labels are
returned, all within the same mitra.)

## 7. Frontend — `CardDetailModal`

A **"Kartu Terkait"** panel (near the existing `CardRelations` entity panel): lists sibling cards as rows
— relation-type badge (`relationTypeLabel`), pipeline name, stage label, title — each linking to
`/pipelines/<pipelineId>?card=<id>`. Empty state when the card has no siblings (the common case until SP3
starts creating linked cards). Hook `useRelatedCards(cardId)` in `usePipelines.ts`.

## 8. Testing

- `shared/cardIdentity.test.ts`: `isValidRelationType` (valid/invalid/non-string), `relationTypeLabel`
  (known/unknown/null), `resolveMasterCardId` (root → ownId; spawned → origin master; 0/null origin → ownId).
- Migration/backfill + createCard + endpoint + UI: typecheck + build + manual (create a card → confirm
  `master_card_id = id`; existing cards backfilled; related panel empty until SP3).

## Out of scope (→ later sub-projects)

- **SP3:** cross-pipeline automation actions (mirror/link/duplicate) that actually populate
  `origin_card_id`/`relation_type`/`master_card_id` on spawned cards, + per-link sync policies
  (field/stage/assignee mirroring).
- **SP4:** re-trigger / recurrence using lineage to decide reuse-vs-recreate.
- Merging/splitting masters, re-parenting cards, deleting a master's root while children exist (SP3+ will
  define cascade rules; SP2 roots are never auto-deleted).
- Touching `card_relations` (manual entity cross-ref) — unrelated concern.
