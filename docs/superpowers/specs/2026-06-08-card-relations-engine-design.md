# Spec — Card Relations Engine (Pipelines Phase 1)

> Date: 2026-06-08 · Mitra-scoped · First phase of the pipelines-unification roadmap (Data Relationship Engine).

## Goal

Let a pipeline card hold typed relations to other entities (customer, lead, collection, ODP, and
other cards), shown in the card detail. Generalizes the existing special-case `source_customer_id`
into a reusable relations engine. Card → entity direction only in this phase.

## Decisions (confirmed)

1. **Entity types (Phase 1):** `customer`, `lead`, `collection`, `odp`, `card`. (ticket/user/invoice
   deferred — the engine is generic, adding a type later is a catalog entry.)
2. **Creation:** manual add/remove in the card detail, PLUS read-time surfacing of `card.sourceCustomerId`
   as an implicit (non-deletable) customer relation.
3. **Direction:** card → entity only. Reverse views (related cards on a customer/ticket page) are a later phase.
4. **Semantics:** a relation is `entityType + entityId` with an optional free-text `label`.

## Data model

### New table `card_relations` (idempotent `CREATE TABLE IF NOT EXISTS` at startup)
```ts
export const cardRelations = mysqlTable("card_relations", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  entityType: varchar("entity_type", { length: 16 }).notNull(), // customer|lead|collection|odp|card
  entityId: int("entity_id").notNull(),
  label: varchar("label", { length: 255 }),
  createdBy: int("created_by"),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_card_relations_mitra_card").on(t.mitraId, t.cardId),
  uniqCardEntity: uniqueIndex("uniq_card_relation").on(t.cardId, t.entityType, t.entityId),
}));
```
`source_customer_id` on `pipeline_cards` is untouched (still used for billing-intake dedup).

## Pure module — `shared/cardRelations.ts` (no DB, unit-tested)

- `RELATION_ENTITY_TYPES`: ordered catalog, each `{ type, label }` for the 5 types.
- `isValidEntityType(t): boolean`.
- `relationHref(type, entityId, ctx?: { pipelineId?: number }): string` — builds the client route:
  - `customer` → `/customers`, `lead` → `/leads`, `collection` → `/collections`, `odp` → `/odps`
    (list pages; per-id deep-linking is a later enhancement).
  - `card` → `/pipelines/${ctx.pipelineId}?card=${entityId}` (needs the related card's pipelineId,
    supplied by the resolver).
- `dedupeRelations(list)` helper (by type+id).

## Backend

### Storage (anti-N+1, batched per type — follows the `inArray` + Map convention)
- `listCardRelations(cardId): Promise<CardRelation[]>` — explicit rows for the card.
- `resolveRelationLabels(relations): Promise<EnrichedRelation[]>` — group by `entityType`, one batched
  `inArray` query per type against customers/leads/collections/odps/pipelineCards, returning each
  relation enriched with `entityLabel` + `entitySubtitle` (+ `pipelineId` for `card` type). Unknown/
  deleted entities get a "(dihapus)" label.
- `addCardRelation(cardId, { entityType, entityId, label })` — validate `entityType`, validate the
  entity exists **in the same mitra** (per-type existence check), insert; ignore duplicates (unique index).
- `deleteCardRelation(relationId)` — mitra-scoped delete.
- `searchRelatableEntities(entityType, q): Promise<{ id, label, subtitle, pipelineId? }[]>` — mitra-scoped
  search (by name/title/customerId) capped at ~20 rows, for the add-relation picker.

### Implicit source-customer relation (read-time)
The relations API response unions explicit relations with an implicit `customer` relation derived from
`card.sourceCustomerId` (when set and not already an explicit customer relation). The implicit one is
flagged `implicit: true` (no `id`) so the UI renders it without a delete button.

### Routes (under the staff router; mitra-scoped; envelope `sendSuccess`/`sendError`)
| Method | Path | Guard |
|---|---|---|
| GET | `/api/pipelines/cards/:cardId/relations` | `requirePipelineView` (via card's pipeline) |
| POST | `/api/pipelines/cards/:cardId/relations` `{entityType, entityId, label?}` | `requirePipelineEdit` |
| DELETE | `/api/pipelines/cards/:cardId/relations/:relationId` | `requirePipelineEdit` |
| GET | `/api/pipelines/relations/search?type=&q=` | `requirePermission "pipelines"` |

Each card-scoped route resolves the card → its `pipelineId` for the permission check (mirrors the
existing `/api/pipelines/cards/:cardId/move` pattern).

## Frontend — `CardDetailModal`

A new **"Relasi"** section:
- Lists enriched relations grouped by type: each row = entity label + subtitle + a link (`relationHref`)
  opening the entity's page + a remove button (hidden for `implicit` rows).
- **"+ Tambah relasi"** control: choose type (`RELATION_ENTITY_TYPES`) → search entity via the picker
  endpoint (debounced, `Combobox`) → optional label → save. Gated by `writable`.
- Uses a `useCardRelations(cardId)` query hook + add/delete mutations (TanStack Query), invalidating on change.

## Multi-tenant & testing

- Every query is `getMitraId()`-scoped; `addCardRelation` rejects an `entityId` not in the caller's mitra.
- Tests: `shared/cardRelations.test.ts` — catalog/`isValidEntityType`/`relationHref`/dedupe (pure).
  Resolver + routes verified via typecheck + build (no DB in CI).

## Out of scope (Phase 1)
- Reverse views (related cards listed on customer/ticket/ODP pages).
- ticket / user / invoice relation types (add to the catalog in a later phase).
- Automation `link_relation` action (deferred to the trigger-expansion phase).
- Per-entity deep-link routes (`/customers/:id`); Phase 1 links to the list page.
