# Spec — Pipelines Dynamic Custom Fields (Phase 2)

> **Date:** 2026-06-04
> **Status:** Approved design, ready for implementation plan.
> **Program:** "Customizable Multi-Tenant Pipeline / Kanban" — Phase 2 of 6.
> **Builds on:** Phase 1 generic pipelines engine (`docs/superpowers/specs/2026-06-04-generic-pipelines-engine-design.md`).

## Goal

Let each mitra define **custom fields per pipeline** (text, number, dropdown, etc.) and set
their values on cards. Values are edited in the card detail drawer; admins can opt specific
fields to show as compact chips on the board card face. Fully tenant-isolated, gated by the
existing `pipelines` permission. No change to Phase 1 tables.

## Key Decisions (from brainstorming)

- **EAV storage** — `pipeline_fields` (definitions) + `pipeline_card_values` (one row per
  card×field). Rejected: JSON blob on `pipeline_cards` (no per-field query, painful field
  rename/delete, blocks P3 field-level RBAC); rejected: wide columns (not viable for dynamic).
- **11 field types:** `text`, `textarea`, `number`, `currency`, `date`, `dropdown`,
  `multiselect`, `checkbox`, `user`, `phone`, `url`.
- **Value display:** edited in the drawer; per-field `show_on_card` toggle renders an opt-in
  chip on the board card face. (Not all fields on card — admin chooses.)
- **Soft-required:** a `required` flag shows a "wajib diisi" warning in the drawer + an
  indicator on the card, but NEVER blocks card create or drawer save. Not server-enforced.
- **Value encoding:** every value stored as TEXT, interpreted by the field's `type`
  (multiselect = JSON array string, user = userId string, checkbox = "0"/"1", date = ISO,
  number/currency = numeric string).
- **DB changes** land on `jabnet_fiber_dev` first via the startup `CREATE TABLE IF NOT EXISTS`
  block (codebase convention — NOT `db:push`), verified on `workspace-dev.jabnet.id`, then
  prod only on explicit user OK. Tables are additive — no ALTER on existing tables.
- Build the field-management + value-editor UI **properly with the design system** (Dialog,
  FormField, Combobox, switches) — explicitly avoid adding more barebone UI.

## Data Model (`shared/schema.ts`)

Both tables carry `mitra_id`, resolved via `tenantContext`/`getMitraId()`.

```ts
pipeline_fields
  id           int autoincrement pk
  mitraId      int notNull default 1            // "mitra_id"
  pipelineId   int notNull                      // "pipeline_id" → pipelines.id
  key          varchar(64) notNull              // stable slug, unique per pipeline (survives label rename)
  label        varchar(255) notNull
  type         varchar(16) notNull              // text|textarea|number|currency|date|dropdown|multiselect|checkbox|user|phone|url
  options      text                             // JSON array of strings (dropdown/multiselect only), else null
  required     int notNull default 0            // 0/1 (soft — UI warning only)
  showOnCard   int notNull default 0            // "show_on_card" 0/1
  position     int notNull default 0
  createdAt    text notNull
  updatedAt    text
  // index (mitra_id, pipeline_id, position); unique (pipeline_id, key)

pipeline_card_values
  id           int autoincrement pk
  mitraId      int notNull default 1
  cardId       int notNull                      // "card_id" → pipeline_cards.id
  fieldId      int notNull                      // "field_id" → pipeline_fields.id
  value        text                             // stringified per field type (see encoding)
  createdAt    text notNull
  updatedAt    text
  // unique (card_id, field_id); index (mitra_id, card_id)
```

Types: `PipelineField`, `PipelineCardValue` (`$inferSelect`); `PipelineFieldType` union of the
11 strings.

**Migration:** add `CREATE TABLE IF NOT EXISTS` for both tables to the startup migration block
in `server/storage.ts` (next to the Phase 1 pipeline tables). Additive; idempotent.

## Backend (`server/storage.ts`, `server/routes.ts`, new `server/pipeline-field-helpers.ts`)

### Pure helpers (`server/pipeline-field-helpers.ts` + test) — TDD
- `validateFieldValue(type, value, options?)` → `{ ok: true } | { ok: false, error }`. number/currency
  numeric; date ISO-parseable; dropdown value ∈ options; multiselect all ∈ options; checkbox in
  {"0","1"}; user numeric; phone/url/text/textarea non-strict (length cap). Empty value always ok
  (soft-required).
- `encodeFieldValue(type, raw)` / `decodeFieldValue(type, stored)` — JSON for multiselect, identity
  for scalars; tolerate malformed stored JSON (return [] / null).
- `formatChipValue(type, stored, options?)` → short display string for card chips.

### Storage methods (tenant-scoped)
- Fields: `listFields(pipelineId)`, `createField(pipelineId, {...})` (slug `key` from label, unique
  per pipeline), `updateField(id, {...})`, `deleteField(id)` (also delete its `pipeline_card_values`
  rows), `reorderFields(pipelineId, orderedIds)`.
- Values: `getCardValues(cardId)` → `{ [fieldId]: value }`; `setCardValues(cardId, [{fieldId, value}])`
  → upsert each (delete row when value is empty/null); `getShowOnCardValuesForPipeline(pipelineId)` →
  `Map<cardId, {fieldId: value}>` limited to `show_on_card` fields (for board chips).

### Endpoints (under `authMiddleware`; `requirePermission`/`requireWritePermission("pipelines")`; `sendSuccess` envelope)
- `GET  /api/pipelines/:id/fields`
- `POST /api/pipelines/:id/fields`               body `{label,type,options?,required?,showOnCard?}`
- `PATCH /api/pipelines/:id/fields/:fieldId`
- `DELETE /api/pipelines/:id/fields/:fieldId`
- `POST /api/pipelines/:id/fields/reorder`        body `{orderedIds}`
- `PUT  /api/pipelines/cards/:cardId/values`       body `{values:[{fieldId,value}]}` — validates each via
  `validateFieldValue`, 400 with the first error on type-mismatch; upserts; appends one card-activity entry.
- Extend `GET /api/pipelines/:id` → response gains `fields: PipelineField[]` (alongside `stages`).
- Extend `GET /api/pipelines/:id/cards` → each card gains `values: {fieldId: value}` for **show_on_card
  fields only**.
- Extend `GET /api/pipelines/cards/:cardId` → response gains `fields` (all defs) + `values` (all values).

All new `/api/pipelines/...` paths already covered by the `PATH_TO_FEATURE` `pipelines` entry and
run inside the request tenant context. Register new field routes mindful of Phase 1 ordering
(literal segments before `/:id`); `:id/fields` and `cards/:cardId/values` are non-ambiguous.

## Frontend (`client/`)

- **`usePipelines.ts`** extended: `useFields(pipelineId)`; mutations `createField`, `updateField`,
  `deleteField`, `reorderFields`, `setCardValues`. `useCard`/`usePipeline` types extended with
  `fields`/`values`.
- **`ManageFieldsDialog`** (`client/components/pipelines/ManageFieldsDialog.tsx`) — opened from the
  board (write-gated). Proper design-system Dialog: list of fields (label, type badge, drag-reorder),
  add/edit form with `FormField` + `Combobox` (type) + an options editor (chip input) shown only for
  dropdown/multiselect + `required` and `show_on_card` switches + delete (confirm). No raw/barebone
  markup.
- **`FieldValueInput`** (`client/components/pipelines/FieldValueInput.tsx`) — one component switching
  on `type` to the correct editor: text/phone/url → Input; textarea → Textarea; number/currency →
  numeric Input (currency shows "Rp" affix); date → date Input; dropdown → Combobox; multiselect →
  multi Combobox/checkest; checkbox → Switch; user → user Combobox (reuse mitra user list). Shows a
  "wajib diisi" hint when `required` and empty.
- **Card drawer** (`CardDetailDrawer.tsx`): add a "Field Kustom" section rendering `FieldValueInput`
  per field (ordered by `position`); collects values and saves via `setCardValues` (on explicit
  "Simpan" for the section, or debounced per field). Read-only users see values, no editors.
- **Board card face** (`PipelineBoardPage.tsx`): for `show_on_card` fields, render small chips using
  `formatChipValue`; a subtle indicator when a required field is empty.

## Testing
- Unit (`server/pipeline-field-helpers.test.ts`): validate/encode/decode/format across all 11 types
  incl. malformed JSON, out-of-options, empty (soft-required) cases. `npx tsx --test`.
- Manual on dev (`jabnet_fiber_dev`): define one field of each type on a pipeline; set values via the
  drawer; verify chips for `show_on_card`; verify soft-required warning never blocks; delete a field →
  its values vanish; reorder; isolation (other mitra can't see/guess fields or values); feature gate
  disables it. `npm run typecheck` 0 errors; `npm run build` succeeds.

## Out of Scope (P2)
Filtering/sorting cards **by** custom-field values (later); field-level RBAC who-can-see/edit (P3);
formula/computed fields; file-upload field type (rides the filesystem-photo plan); cross-pipeline
field reuse/templates.

## Consistency with Memory
- [[project-pipelines-engine]] — P2 of the 6-phase program; EAV is the planned P1→P2 extension.
- [[reference-api-response-envelope]] — ALL new endpoints respond via `sendSuccess({success,data})`,
  not raw `res.json` (the Phase-1 runtime bug). Reviews must check response shape.
- [[reference-tenant-isolation-gotchas]] — every field/value query filters `mitra_id` via `getMitraId()`.
- New tables created via startup `CREATE TABLE IF NOT EXISTS` (codebase convention), not `db:push`.
