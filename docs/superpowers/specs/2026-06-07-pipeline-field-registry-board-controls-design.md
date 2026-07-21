# Spec - Pipeline Field-Type Registry + Board Search/Filter/Sort (Slice A)

> Date: 2026-06-07 · Status: **Approved (pending user spec review)** · Target: dev branch + `jabnet_fiber_dev`
> Part of the Pipelines Engine program - see [[project-pipelines-engine]]. This is **Slice A** of the
> "Pipeline/Kanban Enhancement" PRD (covers PRD items **#3, #7, #8**, and wires #8's `searchable`/`filterable`/`sortable`).

## Context

The pipelines/Kanban engine has 11 custom field types declared as a bare union + array in
`shared/schema.ts:691-695`, with Indonesian labels duplicated client-side in
`ManageFieldsDialog.tsx:13-25` (`TYPE_LABELS`). There is **no per-type metadata** - every type behaves
identically with respect to how many can exist per pipeline and whether it can be searched/filtered/sorted.

Three gaps from the enhancement PRD are addressed together because they share one foundation (a richer
field-type registry):

- **#3 - Phone-in-picker bug.** The field-type picker (`ManageFieldsDialog.tsx:244`) uses the shared
  `Combobox` (`combobox.tsx`), which routes every option through cmdk's fuzzy filter
  (`combobox.tsx:146`, searchable string = `` `${label} ${description} ${value}` ``). Users report the
  "Telepon" (phone) type only appears after typing the search keyword. The `phone` type **already exists**
  - this is a picker rendering/filter quirk, not a missing type.
- **#7 - Singleton field types.** Some types must be limited to one field per pipeline (e.g. Coordinate,
  arriving in Slice D). No mechanism exists today.
- **#8 - Field-type registry.** Add per-type properties (`allowMultiple`, `singleton`, `searchable`,
  `filterable`, `sortable`) and **wire all of them** (per user decision): singleton enforcement now, and
  board search/filter/sort over custom-field values now.

This slice is the **foundation** that later slices (Assignee #1, Coordinate #5/#6) build on. It introduces
no new field types itself.

## Goals / Non-goals

**Goals**
1. A single source of truth for field-type metadata (registry), imported by client and server (DRY).
2. Fix #3 so every field type - including Telepon - always shows in the create-field picker without search.
3. Enforce singleton field types (#7) on both client (disabled in picker) and server (400 backstop).
4. Wire board **search** (across `searchable` field values), **filter** (single `filterable` field+value),
   and **sort** (single `sortable` field, view-only) - extending the existing client-side board pipeline.

**Non-goals (explicitly deferred)**
- New field types (Assignee, Coordinate) - Slices B/D.
- Per-field overrides of searchable/filterable/sortable (registry is type-level for now).
- Persisted per-user board sort/filter preferences (view-only, in-memory).
- Stacked multi-field filtering (one filter field at a time this slice).
- Server-side search/pagination of cards (board loads all cards; filtering stays client-side).

## Coding standards (apply throughout)

Per project standards ([[feedback-coding-standards]]): **semantic HTML5** (use `<fieldset>`/`<legend>`,
`<label htmlFor>`, `<button type>`, `<select>`/`<output>` where appropriate - not `<div>` soup);
**DRY** (one registry, no duplicated label maps); **component separation / SoC** (UI components thin;
all decision logic in pure modules); **pure testable modules** (registry + helpers in `shared/`, covered by
`node:test`). Reuse existing design-system primitives (`Combobox`, `Button`, `Input`, `StatusBadge`, etc.)
rather than hand-rolling.

## Design

### 1. Registry module - `shared/pipelineFieldTypes.ts` (new, pure)

Single source of truth. Imported by client (picker, board controls) and server (validation, singleton guard).
Removes `TYPE_LABELS` from `ManageFieldsDialog.tsx`.

```ts
import type { PipelineFieldType, PipelineField } from "./schema.js";

export interface FieldTypeMeta {
  type: PipelineFieldType;
  label: string;                 // Indonesian label, e.g. "Telepon"
  description: string;           // one-line picker helper text
  group: "basic" | "choice" | "people" | "special";
  hasOptions: boolean;           // dropdown/multiselect require an options[] list
  singleton: boolean;            // max 1 field of this type per pipeline (#7)
  searchable: boolean;           // value participates in board search
  filterable: boolean;           // can be selected as a board filter
  sortable: boolean;             // can be selected as a board sort key
}

export const PIPELINE_FIELD_TYPE_REGISTRY: Record<PipelineFieldType, FieldTypeMeta>;

// allowMultiple is the inverse of singleton (PRD redundancy collapsed to one stored flag):
export const allowMultiple = (t: PipelineFieldType): boolean => !PIPELINE_FIELD_TYPE_REGISTRY[t].singleton;

// Pure helpers (all unit-tested):
export function getFieldTypeMeta(t: string): FieldTypeMeta | undefined;
export function canAddType(existingFields: Pick<PipelineField, "type">[], t: PipelineFieldType): boolean;
export function searchableFieldIds(fields: PipelineField[]): number[];
export function filterableFields(fields: PipelineField[]): PipelineField[];
export function sortableFields(fields: PipelineField[]): PipelineField[];
export function compareCardsByField(
  a: Record<number, string> | undefined,
  b: Record<number, string> | undefined,
  field: PipelineField,
  dir: "asc" | "desc",
): number;   // type-aware: number/currency numeric, date chronological, text/dropdown localeCompare
```

`canAddType` returns `false` when `t` is singleton **and** a field of that type already exists.

**Default metadata** for the existing 11 types (all `singleton:false` today; Coordinate in Slice D is the
first singleton):

| type | label | group | hasOptions | searchable | filterable | sortable |
|---|---|---|:--:|:--:|:--:|:--:|
| text | Teks | basic | - | ✓ | - | ✓ |
| textarea | Teks Panjang | basic | - | ✓ | - | - |
| number | Angka | basic | - | ✓ | - | ✓ |
| currency | Mata Uang (Rp) | basic | - | ✓ | - | ✓ |
| date | Tanggal | basic | - | - | ✓ | ✓ |
| dropdown | Dropdown | choice | ✓ | ✓ | ✓ | ✓ |
| multiselect | Multi-pilih | choice | ✓ | ✓ | ✓ | - |
| checkbox | Checkbox | choice | - | - | ✓ | ✓ |
| user | User | people | - | ✓ | ✓ | - |
| phone | Telepon | special | - | ✓ | - | - |
| url | URL | special | - | ✓ | - | - |

(Date's `filterable` is already realized by the existing date-range control in `BoardFilters`; no new date
filter UI is added.)

### 2. Type picker redesign - `FieldTypePicker` (new client component) + `ManageFieldsDialog`

Replace the `Combobox` at `ManageFieldsDialog.tsx:244-256` with a purpose-built, **always-visible**
grouped list (no search input → #3 is structurally impossible):

- Semantic markup: a `<fieldset>` with a `<legend>` ("Tipe field"); each group is a labelled subsection;
  each option is a `<button type="button">` with `aria-pressed` for the selected state, showing the type's
  Lucide icon + `label` + `description` from the registry.
- A type where `canAddType(existingFields, type) === false` (singleton already present) renders as a
  **disabled** `<button disabled>` with a muted hint "Sudah ada - hanya boleh 1 per pipeline".
- Only used in **create** mode (type is immutable after creation; PATCH never changes `type`). Edit mode
  keeps the existing label/options/required/showOnCard form.
- `hasOptions` from the registry drives whether the options editor shows (replaces any hard-coded
  `type === "dropdown" || type === "multiselect"` checks - DRY).

### 3. Singleton enforcement (#7)

- **Client:** picker disables singleton types already present (via `canAddType`).
- **Server backstop:** `storage.createField` / the `POST /api/pipelines/:id/fields` handler
  (`routes.ts:4654`) rejects a second singleton-type field →
  `sendError(res, "Tipe <label> hanya boleh 1 per pipeline", 400)`. Uses the shared `canAddType` against
  the pipeline's existing fields (mitra-scoped). Never trust the client alone.

### 4. Board search / filter / sort

**Backend - one tweak.** `GET /api/pipelines/:id/cards` (`routes.ts:4503-4511`) currently attaches only
`getShowOnCardValues`. Add `storage.getBoardCardValues(pipelineId)` returning values for the **union** of
board-relevant fields = `showOnCard ∪ searchable ∪ filterable ∪ sortable` (computed from the registry).
Same mitra-scoped, batched (`inArray`) shape as `getShowOnCardValues`; the route maps
`{ ...card, values }` exactly as before, so the client `PipelineCardWithValues` type is unchanged.
*Payload note:* bounded to the union set; trivial at current scale (≈122 cards). If a pipeline ever holds
thousands of cards this is the first thing to revisit (server-side filtering) - flagged, not solved now.

**Frontend - extend the existing client-side pipeline** (all in-memory over already-loaded cards, matching
the existing assignee filter; instant, non-persistent):

1. **Search** (`PipelineBoardPage.tsx:60-69`): the search term matches `c.title` **or** any
   `searchableFieldIds(fields)` value in `c.values` (case-insensitive substring).
2. **Filter:** one compact control in `BoardFilters` - a `Combobox` to pick a `filterable` field, then a
   type-aware value control:
   - dropdown / multiselect → `Combobox` of that field's `options` (multiselect matches if the value is in
     the stored JSON array);
   - checkbox → Ya / Tidak;
   - user → assignee-style user `Combobox`.
   Single active filter field at a time. Date keeps its existing range control.
3. **Sort:** one "Urutkan" control - a `Combobox` of `sortableFields(fields)` + an ▲/▼ toggle
   `<button type="button">`. Applies `compareCardsByField` to cards **within each stage** for display only;
   drag-to-reorder still persists `position`; clearing sort restores manual order.
4. **Reset** clears search + filter + sort + date range + assignee.

The filter/sort decision logic lives in the shared pure helpers; `BoardFilters`/`PipelineBoardPage` stay
presentational + wiring (SoC).

## Files

| File | Change |
|---|---|
| `shared/pipelineFieldTypes.ts` | **New.** Registry + pure helpers. |
| `shared/pipelineFieldTypes.test.ts` | **New.** node:test for helpers + registry exhaustiveness. |
| `client/components/pipelines/FieldTypePicker.tsx` | **New.** Grouped, always-visible, semantic picker. |
| `client/components/pipelines/ManageFieldsDialog.tsx` | Use `FieldTypePicker` + registry; drop local `TYPE_LABELS`; `hasOptions`-driven options editor. |
| `client/components/pipelines/BoardFilters.tsx` | Add filter (field+value) and sort (field+dir) controls; extend reset. |
| `client/pages/PipelineBoardPage.tsx` | Extend `visible` (search across field values + filter); apply sort per stage. |
| `server/storage.ts` | `getBoardCardValues(pipelineId)`; singleton guard in `createField`. |
| `server/routes.ts` | Board cards route uses `getBoardCardValues`; createField 400 on singleton dup. |
| `server/pipeline-field-helpers.ts` | Source type checks from the registry where applicable (DRY). |

## Testing

- **Pure (`npx tsx --test shared/pipelineFieldTypes.test.ts`):**
  - registry has an entry for **every** `PipelineFieldType` (exhaustiveness guard - protects future
    Assignee/Coordinate additions);
  - `canAddType`: singleton blocks a second field; non-singleton always allowed; unknown type safe;
  - `searchableFieldIds`/`filterableFields`/`sortableFields` select the right fields;
  - `compareCardsByField`: numeric vs date vs text ordering, asc/desc, empty values sort last.
- **Gates:** `npm run typecheck` = 0; `npm run build` green.
- **Manual (dev "Leads (Marketing)" pipeline, has phone/dropdown/number/date fields):** create-field picker
  shows all types incl. Telepon with no search; singleton hint (simulated by temporarily flagging a type);
  board search hits a phone value; filter by a dropdown value; sort by a number/date field; reset clears all.

## Multi-tenant / RBAC (AC #12)

No isolation change. `getBoardCardValues` is mitra-scoped exactly like `getShowOnCardValues`; all field and
card routes keep `requirePermission`/`requireWritePermission` + `requirePipelineView`/`requirePipelineEdit`.
Search/filter/sort operate only on cards the caller already received.

## Risks

1. **Board values payload** grows with the union field set - bounded and trivial now; revisit with
   server-side filtering only if a pipeline reaches thousands of cards.
2. **#3 root cause** is reproduced-then-eliminated (picker no longer fuzzy-filters) rather than patched in
   `Combobox`; the shared `Combobox` is unchanged for its other (legitimately searchable) uses.
3. **Registry drift** - mitigated by the exhaustiveness test so a new field type can't silently lack flags.

## Acceptance criteria (this slice)

- PRD **#3**: every field type, including Telepon, always visible in the create-field picker without search.
- PRD **#7**: singleton types blocked from being added twice (client disabled + server 400).
- PRD **#8**: registry exists as the single source of truth with all five properties; `singleton`
  enforced; `searchable`/`filterable`/`sortable` wired into board search/filter/sort.
- All existing pipelines/fields keep working (no migration; metadata is code-side only).
- typecheck 0, build green, pure-helper tests pass, multi-tenant isolation unchanged.
