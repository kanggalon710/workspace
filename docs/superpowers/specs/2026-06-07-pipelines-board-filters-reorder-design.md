# Pipelines Board - Filters Polish & Stage Reorder Design

> Improves the board page (`/pipelines/:id`): a cleaner, more prominent card-search +
> time-filter toolbar with a new assignee filter, and drag-and-drop stage reordering
> (grip handle on desktop, ◀ ▶ arrows on mobile). Mostly frontend; the reorder backend
> (`reorderStages` storage method + `POST /api/pipelines/:id/stages/reorder`) already exists.

**Base branch:** `feat/pipelines-board-filters-reorder` off `dev` (includes the identity & management work).
**Status:** Approved design, ready for spec review.

---

## Verified preconditions

- `pipeline_stages` has a `position int NOT NULL DEFAULT 0` column; index `(mitra_id, pipeline_id, position)`.
- `storage.reorderStages(pipelineId, orderedIds)` exists (`server/storage.ts:1878`).
- `POST /api/pipelines/:id/stages/reorder` exists (`server/routes.ts:4493`), body `{ orderedIds: number[] }`, guarded by write-perm + pipeline-edit, returns `sendSuccess({ ok: true })`.
- `pipeline_cards.assigneeId int` exists; the board already builds `usersById` from `/api/users` and renders `assigneeName` per card.
- The board fetches **all** cards (`usePipelineCards`) and filters `visible` client-side by search + date range. Assignee filter follows the same client-side pattern.
- **Missing:** a client `reorderStages` mutation; the stage-reorder UI; the search/assignee toolbar redesign. **No backend changes needed.**

---

## Part A - BoardFilters redesign (`BoardFilters.tsx`)

Keep all controls visible (the "inline toolbar, reorganized" choice) but restructure into a clean, responsive block:

1. **Prominent search** - a single wider `<Input inputSize="sm" leftIcon={<Search/>} ... />` that takes the leading space (`flex-1` / full-width on mobile). When `search` is non-empty, show a clear button as `rightIcon` (an `X` button, `type="button"`, `aria-label="Hapus pencarian"`) that calls `onSearch("")`. Keep `aria-label="Cari kartu"`.
2. **Controls row (wraps)** - date-field combobox (Dibuat / Update terakhir), range combobox (Semua / 7 hari / 30 hari / Custom), and a **new Assignee combobox** (clearable; empty = semua assignee). On desktop these flow after the search; on mobile they wrap to their own row.
3. **Custom date inputs** - unchanged behavior: the two `type="date"` inputs appear (their own line) only when `range` is the custom object.
4. **Active-filter affordance** - when any of {search non-empty, range ≠ "all", assignee set} is active, show a small muted line: `{visibleCount} kartu` + a **Reset** text button (`type="button"`) that clears search → "", range → "all", assignee → null. `visibleCount` is passed in from the page (it already computes `visible`).

### Assignee filter (client-side)
- New props on `BoardFilters`: `assigneeId: number | null`, `onAssignee: (id: number | null) => void`, and `assigneeOptions: ComboboxOption[]` (built by the page from its users list: `{ value: String(u.id), label: u.name || u.username || ` + "`User #${u.id}`" + ` }`, sorted by label). Combobox `value={assigneeId == null ? "" : String(assigneeId)}`, `onChange={(v) => onAssignee(v ? Number(v) : null)}`, `clearable`.
- Plus props `visibleCount: number` and `onReset: () => void` for the active-filter affordance. `BoardFilters` derives `anyActive = search !== "" || preset !== "all" || assigneeId != null` from props it already receives and only renders the `{visibleCount} kartu` + Reset line when `anyActive`. The page owns the actual reset logic in `onReset` (it holds the setters).

### Page wiring (`PipelineBoardPage.tsx`, Part A bits)
- Add `const [assigneeId, setAssigneeId] = useState<number | null>(null);`.
- Extend the `visible` filter to also require `assigneeId == null || c.assigneeId === assigneeId`.
- Build `assigneeOptions` from the existing `users` query (memoized).
- Pass `assigneeId`, `onAssignee={setAssigneeId}`, `assigneeOptions`, `visibleCount={visible.length}`, and an `onReset` that resets search/range/assignee, to `BoardFilters`.

---

## Part B - Stage reorder (`StageColumn.tsx` + `PipelineBoardPage.tsx` + `usePipelines.ts`)

### Client mutation (`usePipelines.ts`)
Add to `usePipelineMutations`:
```ts
reorderStages: useMutation({
  mutationFn: (orderedIds: number[]) => api.post(`/pipelines/${pipelineId}/stages/reorder`, { orderedIds }),
  onSuccess: invalidate,
}),
```

### Pure helpers + TDD (`stageReorder.ts` + `stageReorder.test.ts`)
A React-free, alias-free module (tsx-runnable test):
```ts
/** Move `fromId` so it sits at the current index of `toId` (insert-before semantics). No-op if equal/missing. */
export function reorderByDrag(ids: number[], fromId: number, toId: number): number[]
/** Shift `id` by `dir` (-1 left / +1 right), clamped to the ends. No-op at the boundary. */
export function moveByOffset(ids: number[], id: number, dir: -1 | 1): number[]
```
Both return a NEW array and never mutate input. Unit-test: drag first→last, last→first, adjacent, same id (no-op), missing id (unchanged); offset at both boundaries (unchanged), middle moves.

### StageColumn - handle + arrows + drag target
- **Desktop grip**: a `GripVertical` button/span in the header, `hidden md:flex`, `draggable`, `aria-label="Geser stage"`, `cursor-grab`. `onDragStart` → `onStageDragStart(stage.id)` (and set a benign `dataTransfer` payload so Firefox initiates the drag). Placed left of the color dot; it does NOT trigger the pencil edit.
- **Mobile arrows**: two buttons `flex md:hidden`, `aria-label`s "Geser stage ke kiri/kanan", rendering ◀ and ▶. Disabled when the stage is first (◀) or last (▶). Click → `onMoveStage(stage.id, -1 | 1)`. The page supplies `isFirst`/`isLast` (or the column derives from an `index`/`total` prop).
- **Drop target**: the column's existing `onDragOver`/`onDrop` now branch on a new `stageDragId` prop:
  - `onDrop`: `if (stageDragId != null) onStageDrop(stage.id); else onDropStage(stage.id);`
  - `onDragOver`: keep `preventDefault()` (needed for both card and stage drops).
- **Visual cue**: when `stageDragId === stage.id`, dim the column (`opacity-50`); the standard drop-target ring can be added via a hovered state (optional, keep light - at minimum the dragged column dims).
- New StageColumn props: `index: number`, `total: number` (for first/last + arrow disabling), `stageDragId: number | null`, `onStageDragStart: (id: number) => void`, `onStageDrop: (targetId: number) => void`, `onMoveStage: (id: number, dir: -1 | 1) => void`.

### Page wiring (`PipelineBoardPage.tsx`, Part B bits)
- Add `const [stageDragId, setStageDragId] = useState<number | null>(null);`.
- `onStageDragStart={setStageDragId}`.
- `onStageDrop={(targetId) => applyReorder(reorderByDrag(stageIds, stageDragId!, targetId))}` then `setStageDragId(null)`. Guard `stageDragId != null`.
- `onMoveStage={(id, dir) => applyReorder(moveByOffset(stageIds, id, dir))}`.
- `stageIds = stages.map(s => s.id)`.
- `applyReorder(orderedIds)`:
  1. **Optimistic**: `queryClient.setQueryData(["/api/pipelines", pid], (prev) => prev && { ...prev, stages: orderById(prev.stages, orderedIds) })` so columns snap immediately. (Confirm the exact pipeline query key used by `usePipeline` and reuse it.)
  2. `await m.reorderStages.mutateAsync(orderedIds)` (which invalidates on success → reconcile). On error: `toast.error("Gagal mengubah urutan stage")` and invalidate to roll back to server truth.
  - `orderById(stages, ids)` = map ids → stage objects (ignoring ids no longer present), appending any stage missing from `ids` at the end (defensive).
- Also clear `stageDragId` on a global `dragend` (or in `onStageDrop`) so an aborted drag doesn't leave card-drops mis-routed.

---

## Files

| File | Change |
|---|---|
| `client/components/pipelines/BoardFilters.tsx` | Search prominence (icon+clear), assignee combobox, active-filter count+reset, responsive rows |
| `client/components/pipelines/stageReorder.ts` (+ `.test.ts`) | **new** pure `reorderByDrag` + `moveByOffset` (TDD) |
| `client/components/pipelines/StageColumn.tsx` | Grip handle (desktop) + ◀ ▶ arrows (mobile) + drag-target branching + dim cue + new props |
| `client/pages/PipelineBoardPage.tsx` | assignee state + visible filter + assigneeOptions; `stageDragId` + reorder/arrow handlers + optimistic `applyReorder`; wire new props |
| `client/hooks/usePipelines.ts` | `reorderStages` mutation |

**Backend: no changes** (reorder route + storage already exist).

---

## Edge cases

- **Card vs stage drag**: a column's single `onDrop` branches on `stageDragId`; card drag (`dragId`) is unaffected when no stage drag is in progress. Always `setStageDragId(null)` after a stage drop / on dragend so a later card drop isn't mis-routed.
- **Drop onto self / same position** → `reorderByDrag` returns an equal order; `applyReorder` may still POST - guard: skip the mutation if the new order equals the current order.
- **Arrows at boundary** → `moveByOffset` is a no-op; buttons are also `disabled` at first/last.
- **Mobile (touch)**: HTML5 DnD doesn't fire on touch - arrows are the reorder path there; grip is `md:` only.
- **Optimistic rollback**: on mutation error, invalidate to restore server order + toast.
- **Assignee filter**: cards with `assigneeId == null` are hidden only when a specific assignee is selected; "Semua" (null) shows all. (No explicit "Belum di-assign" option in v1.)
- **Reset**: clears search/range/assignee in one click; only shown when a filter is active.

## Out of scope (later)

- Server-side assignee filter via the existing `?assignee=` param (client-side is enough at current card volumes).
- An explicit "Belum di-assign" assignee option.
- Drag-reorder on touch devices (arrows cover mobile).
- Saved filter presets / URL-encoded filter state.
- Reordering pipelines themselves (this is about stages within a pipeline).

## Consistency with memory

- [[project-pipelines-engine]] - board polish continues before the P5 leads migration; update note on merge.
- [[feedback-coding-standards]] - pure `reorderByDrag`/`moveByOffset` (SoC/TDD), semantic HTML + aria-labels on icon-only buttons (grip, arrows, clear, reset), `type="button"`, semantic tokens, DRY (reuse `Combobox`, existing `usersById`).
- [[reference-api-response-envelope]] - reorder mutation goes through `api.post` (envelope-aware); no raw fetch.
- [[reference-tenant-isolation-gotchas]] - reorder endpoint is already mitra-scoped server-side; no client change affects isolation.
