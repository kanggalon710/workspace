# Spec - Card CSV Import/Export (Phase 6)

> Date: 2026-06-08 · Mitra-scoped · Pipelines-unification roadmap Phase 6.

## Goal

Export a pipeline's cards to CSV and import a CSV as new cards (with flexible column→target mapping and
per-row error tolerance). This delivers the leads/collections "Import/Export" capability generically.
The other parity features (tags, source, contact actions) already exist via the pipeline field types
(`card.tags`, dropdown fields, `PhoneActions`), so they are out of scope here.

## Decisions (confirmed)

1. **Scope:** export **and** import.
2. **Import mapping:** flexible - the user maps each CSV header to a target (Title / Stage / Assignee /
   Priority / a custom field / ignore). Not a fixed header format.
3. **Errors:** skip invalid rows + return a report (created N, skipped M with reasons). Not all-or-nothing.

## 1. Pure module - `shared/cardCsv.ts` (no DB, unit-tested)

```ts
export interface ExportColumn { key: string; label: string }
export function buildExportColumns(fields: { id: number; label: string }[]): ExportColumn[];
// base: title/stage/assignee/priority/created (keys: "title","stage","assignee","priority","created")
// + one per field: { key: `f_${id}`, label: field.label }

export function formatCardForExport(
  card: { title: string; priority: string; createdAt: string; values?: Record<number, string> },
  fields: { id: number; type: string; options?: string | null }[],
  stageLabel: string,
  assigneeName: string,
): Record<string, string>;
// flat row keyed by the ExportColumn keys; formats each field value (multi-user → names joined,
// coordinate → "lat,lng", currency/number → as stored, etc.).

export interface MappedImportRow { title?: string; stage?: string; assignee?: string; priority?: string; values: Record<number, string> }
export interface ImportCtx {
  stageByLabel: Map<string, number>;     // lowercased label → stageId
  userByName: Map<string, number>;       // lowercased name/username → userId
  fieldsById: Map<number, { id: number; type: string; options?: string | null }>;
  firstStageId: number;
}
export interface CardDraft { stageId: number; title: string; assigneeId: number | null; priority: string; values: { fieldId: number; value: string }[] }
export function resolveImportRow(
  row: MappedImportRow, ctx: ImportCtx,
  validateValue: (fieldType: string, value: string, options?: string[]) => string | null, // null = ok
): { ok: true; draft: CardDraft } | { ok: false; error: string };
```
`resolveImportRow` rules: `title` required (else error); `stage` resolved by lowercased label →
`firstStageId` fallback; `assignee` resolved by lowercased name/username, else `null` (skip, not an
error); `priority` ∈ {low,medium,high,urgent} else `"medium"`; each non-empty field value run through the
injected `validateValue` (first failure → row error with the field label). The injected validator keeps
the module pure/testable; the server passes a wrapper over `validateFieldValue`.

## 2. Export - `GET /api/pipelines/:id/cards/export`

Gated `requirePipelineCapability(..., "view")`. Loads the pipeline's cards, fields, stages, and the
assignable users; resolves each card's stage label + assignee name; builds rows via `formatCardForExport`
and columns via `buildExportColumns`; serializes with the existing `toCSV(data, columns)` helper; streams
`text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="<pipeline-name>-cards.csv"`.
Exports all (non-archived) cards in the pipeline.

## 3. Import - `POST /api/pipelines/:id/cards/import`

Gated `requirePipelineCapability(..., "cards")`. Body `{ rows: MappedImportRow[] }` - the client has
already mapped CSV headers to targets. The handler builds `ImportCtx` (stageByLabel from `listStages`,
userByName from the assignable users, fieldsById from `listFields`, firstStageId), then for each row:
`resolveImportRow(row, ctx, validate)` where `validate` wraps `validateFieldValue` (per field type +
options + multi-user). On `ok` → `createCard({ stageId, title, assigneeId, priority }, userId)` then
`setCardValues(cardId, draft.values)`; on error → collect `{ index, reason }`. Returns
`{ created: number, skipped: number, errors: { index: number; reason: string }[] }`. A row cap (e.g.
2000) guards abuse. Each created card is mitra/pipeline-scoped via the existing storage methods.

## 4. Frontend

- **Export button** (pipeline board header and/or the pipeline card menu on `PipelinesPage`): `fetch`es
  the export endpoint with the auth header, reads the blob, and triggers a download (an `<a download>` /
  `window.open` can't send the `Authorization` header - same reason the photo endpoints are fetched).
- **Import dialog** (`CardImportDialog.tsx`): upload `.csv` → parse to `string[][]` (reuse the
  `ExportImportPage` parser, extracted/copied) → a **mapping UI**: for each CSV header a `<select>` of
  targets (Judul [required, exactly one] / Stage / Assignee / Prioritas / a custom field / "Abaikan") →
  build `MappedImportRow[]` → `POST` → show a **report** (created / skipped / per-row reasons). Block
  submit until exactly one column maps to Title.
- Hooks in `usePipelines.ts`: `useImportCards(pipelineId)` mutation; export via a small fetch helper.

## 5. Testing

`shared/cardCsv.test.ts`: `buildExportColumns` (base + per-field keys), `formatCardForExport` (multi-user
join, coordinate `lat,lng`), `resolveImportRow` (missing title → error; stage label→id + fallback to
first; assignee resolved + skipped-when-unknown; priority default; a field value failing the stub
validator → row error; full happy path → draft with values). Server endpoints verified via typecheck +
build.

## Out of scope
- Import that UPDATES existing cards (create-only).
- Importing photos/attachments (text values only).
- Export honoring the board's active filters (exports all cards; filtered export can come later).
- Scheduled/automatic export.
