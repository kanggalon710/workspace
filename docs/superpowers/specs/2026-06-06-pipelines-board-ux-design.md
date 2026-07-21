# Pipelines Board UX Parity Design

> Bring the generic `/pipelines` board (`PipelineBoardPage`, ~123 lines, minimal)
> up to `/leads`-grade UX **before** any leads migration. Adds: per-stage colored
> column accents + a stage color/label editor, date-range filters (created/updated
> toggle × all/7d/30d/custom), and richer cards (age, last-update tone, stalled
> flag, priority badge, assignee avatar). **Frontend-only - zero backend/schema
> changes** (stage `color` is already supported end-to-end; assignee names come
> from the existing `/users` endpoint).

**Base branch:** `feat/pipelines-board-ux` off `dev`.
**Status:** Approved design, ready for spec review.

---

## Goal

Make the pipelines Kanban as usable as the leads Kanban: stages are visually
color-coded and recolorable, the board can be filtered by recency, and cards show
the at-a-glance signals operators rely on. This is the prerequisite UX work so a
future leads migration lands on a board that already matches leads' UX.

## Verified preconditions (no backend work)

- `storage.createStage({label, color?})` + `updateStage({label?, color?})` exist;
  the POST/PATCH `/pipelines/:id/stages[/:stageId]` routes already forward `color`
  (`server/routes.ts:4449-4467`). Stage recolor = pure frontend via existing mutations.
- `pipeline_cards` already has `createdAt`, `updatedAt`, `stageEnteredAt`, `priority`
  (low/medium/high/urgent), `assigneeId`. All card signals derive from these.
- Assignee names/avatars: the existing `GET /users` (used by the rules dialog) returns staff.

## Coding standards applied

- **SoC:** the board's date/tone/stalled logic lives in a pure, React-free module
  (`boardCardMeta.ts`) that is unit-tested; the 123-line page is decomposed into
  focused components (`BoardFilters`, `StageColumn`, `BoardCard`).
- **DRY:** one tone/stalled/range helper set drives card rendering AND filtering.
- **Semantic HTML5:** filter controls in a `<form>`-less toolbar use labelled
  controls; stage-edit popover uses `<label>`/`<input>`; icon buttons get aria-labels.

---

## 1. Pure logic - `client/components/pipelines/boardCardMeta.ts` (TDD)

No React. Pure functions over primitives/`Date`:
```ts
export const STALLED_DAYS = 14;
export type UpdateTone = "fresh" | "recent" | "warn" | "old";

export function cardAgeLabel(createdAt: string, now: Date): string;        // "Hari ini" | "Nh lalu"
export function lastUpdateTone(updatedAt: string | null, createdAt: string, now: Date): UpdateTone;
//   days since (updatedAt ?? createdAt): ≤1 fresh, ≤7 recent, ≤14 warn, >14 old (mirrors /leads)
export function isStalled(updatedAt: string | null, createdAt: string, now: Date): boolean;  // > STALLED_DAYS
export type DateRange = "all" | "7d" | "30d" | { from: string; to: string };
export function inDateRange(dateStr: string | null, range: DateRange, now: Date): boolean;
//   "all" → true; "7d"/"30d" → within N days of now; custom → from ≤ date ≤ to (inclusive, date-only)
```
- All tolerate null/empty/unparseable input → safe defaults (`inDateRange` null → `range==="all"`; tone → `old`; stalled → false).
- Thresholds (1/7/14 days, STALLED_DAYS=14) mirror `/leads` (judgment call, approved).

## 2. Filters - `client/components/pipelines/BoardFilters.tsx`

A toolbar (extends the existing search input, doesn't replace it):
- Existing **text search** (card title) - keep.
- **Date field toggle**: `Dibuat` (createdAt) | `Update terakhir` (updatedAt) - a small Combobox/segmented control. (Judgment call, approved: toggle both fields.)
- **Range**: `Semua` (default) · `7 hari` · `30 hari` · `Custom`. Custom reveals two `<input type="date">` (from/to).
- Emits `{ search, dateField: "created"|"updated", range: DateRange }` to the page.
- Filtering is **client-side** on the already-loaded `cards` (the board loads all cards for the pipeline): a card shows if title matches search AND `inDateRange((dateField==="created"?createdAt:updatedAt), range, now)`.

## 3. Stage column - `client/components/pipelines/StageColumn.tsx`

Extracts the per-stage column from the page. Visual upgrade:
- **Colored accent**: a top border bar (~3px) in `stage.color` + a subtly tinted header
  (`stage.color` at low opacity), replacing the tiny dot-only header.
- **Header**: stage label + card count; (judgment call, approved) a small secondary
  count of stalled cards in that stage when > 0 (e.g. " 2").
- Keeps: drag-over/drop, the add-card inline, the "+ Stage" add (unchanged; new stages
  default to grey `#6B7280`, then recolorable via the editor below).
- Renders `<BoardCard>` per card.

### Stage edit popover (recolor/rename/delete)
A **pencil** icon button in the column header (hover-revealed, `type="button"`,
`aria-label="Edit stage"`) opens a small popover (reuse the shadcn `Popover` if
present, else a positioned panel):
- **Label** `<input>` (defaults to current).
- **Color**: a row of preset swatches (the /leads palette: grey #6B7280, blue #3B82F6,
  violet #8B5CF6, amber #F59E0B, green #22C55E, red #EF4444) + a native
  `<input type="color">` for custom. Selecting updates a local draft.
- **Simpan** → `updateStage({ stageId, label, color })`; **Hapus stage** (destructive,
  guarded by a confirm) → `deleteStage(stageId)`.
All via the existing `usePipelineMutations` - no backend change.

## 4. Card - `client/components/pipelines/BoardCard.tsx`

Extracts + enriches the card. Shows (deriving via `boardCardMeta` + a users map):
- **Title** + the opt-in `showOnCard` field chips (existing behavior - keep).
- **Age** badge (`cardAgeLabel`) + a **last-update tone** dot/strip (`lastUpdateTone` →
  green/neutral/amber/red).
- **Stalled**: when `isStalled`, a red left-border + a "Stalled" tag (mirrors /leads).
- **Priority** badge: colored by priority (low/medium/high/urgent) - uses semantic
  tokens (`bg-muted` / `bg-info/15` / `bg-warning/15` / `bg-destructive/15`), no hardcoded hex.
- **Assignee**: small avatar (initials) + name, resolved from a `usersById` Map
  (a `useQuery(["/api/users"], () => api.get("/users"))` on the page, passed down);
  unassigned → a muted "Belum ditugaskan" chip.
- Click → opens the existing card detail (`selectedCard`) - unchanged.

## 5. Page - `client/pages/PipelineBoardPage.tsx`

Becomes thin composition: load pipeline + cards + users; hold `{search, dateField, range}`
filter state; compute `visible` cards (search + `inDateRange`); render `<BoardFilters>` +
the stage columns (`<StageColumn>` each, passing its filtered cards + `usersById` +
the stage-edit handlers). The drag-drop + dialogs (`PipelineRulesDialog`, fields, access,
card detail) stay as-is.

## 6. Files

| File | Change |
|---|---|
| `client/components/pipelines/boardCardMeta.ts` (+ test) | **new** pure helpers (age/tone/stalled/range) + node:test |
| `client/components/pipelines/BoardFilters.tsx` | **new** search + date-field toggle + range (all/7d/30d/custom) |
| `client/components/pipelines/StageColumn.tsx` | **new** colored column + header (count + stalled) + edit popover |
| `client/components/pipelines/BoardCard.tsx` | **new** enriched card (age/tone/stalled/priority/assignee) |
| `client/pages/PipelineBoardPage.tsx` | thin composition: users query, filter state, wire the components |

No backend/schema/migration. (`usePipelines.ts` mutations `updateStage`/`deleteStage`/`createStage` already exist.)

## 7. Edge cases

- **Stage with no color** (legacy/default) → falls back to grey `#6B7280` (board + editor).
- **Custom range with from > to or blank** → treat as no-match-free: if either bound
  blank, that bound is unbounded; if from>to, show nothing (or both blank → all). Keep
  simple: blank bound = unbounded.
- **Filter hides all cards in a stage** → the column still renders (empty), so drag
  targets + "+ add card" remain usable.
- **Unparseable/old timestamps** → helpers degrade safely (no crash).
- Filtering never mutates data; drag-drop still moves cards regardless of filter.

## 8. Testing

`boardCardMeta` gets `node:test` coverage (run via `npx tsx --test`): `cardAgeLabel`
("Hari ini" vs "Nh lalu"); `lastUpdateTone` boundaries (1/7/14 days); `isStalled`
boundary (14 days); `inDateRange` for all/7d/30d/custom × null. The module avoids `@`
aliases so it runs under tsx. UI verified via `npm run typecheck` + `npm run build` +
manual:
- Recolor a stage (swatch + custom) → column accent + dot update; rename + delete work.
- Filter Dibuat × 7/30/custom and Update-terakhir × 7/30/custom → correct cards shown;
  "Semua" shows all; empty columns still drop-target.
- Cards show age, last-update tone, stalled (on an old card), priority badge, assignee
  avatar (+ unassigned chip).
- Drag-drop + card detail + rules/fields/access dialogs still work.

## Out of scope (later)

- Server-side filtering / pagination (client-side over loaded cards is enough at current scale).
- Configurable stalled threshold per pipeline (hardcoded 14d).
- Saved filter presets / per-user defaults.
- List view (the leads list-view variant) - board only for now.
- Card drag reordering within a stage by date-sort (keep manual position).

## Consistency with memory

- [[project-pipelines-engine]] - prerequisite UX work before P5 (leads migration);
  not a migration itself. Update the P5 note on merge (board-UX parity done first).
- [[feedback-coding-standards]] - pure `boardCardMeta` (SoC/TDD), component
  decomposition, semantic controls + aria-labels, semantic color tokens (no hardcoded
  hex except the fixed stage-swatch palette, which mirrors the stored stage colors).
- No backend → [[reference-api-response-envelope]] / [[reference-startup-add-column]]
  not engaged.
