# Spec — Custom Field Drag-Reorder (Slice G)

> Date: 2026-06-07 · Status: **Approved (pending user spec review)** · Target: dev branch
> Part of the Pipelines Engine program — see [[project-pipelines-engine]]. Pure frontend wiring — no backend,
> schema, or migration.

## Context

Custom fields render in a fixed order (by `position`) in the board card chips and the card-detail modal, but
there is no way to reorder them — the `ManageFieldsDialog` field rows show a `GripVertical` handle that is
**visual-only** (`ManageFieldsDialog.tsx:142` "reorder DnD is a future enhancement"). The user wants to drag a
field to a new position (e.g. Tagihan-Status-Paket → Paket-Tagihan-Status).

Everything needed is already in place:
- Backend `POST /api/pipelines/:id/fields/reorder` + `storage.reorderFields` + the `reorderFields` mutation
  (`usePipelines.ts:152`).
- Pure, unit-tested order helpers `reorderByDrag(ids, fromId, toId)` and `moveByOffset(ids, id, dir)` in
  `client/components/pipelines/stageReorder.ts` (generic over `number[]`; covered by `stageReorder.test.ts`).
- The shipped stage-reorder UX (grip drag on desktop + ▲▼ arrows) to mirror.

So this slice is UI wiring + making the existing `reorderFields` mutation optimistic.

## Goals / Non-goals

**Goals**
1. Reorder a pipeline's custom fields by **dragging** a row (grip handle) and via **▲/▼ arrow buttons**
   (mobile + keyboard accessible), persisting to the existing reorder endpoint.
2. Optimistic update so the list reorders instantly (no refetch flicker), consistent with stage reorder.

**Non-goals (deferred)**
- Reordering anything other than custom fields (stages already have it).
- New pure helpers (reuse the tested `stageReorder.ts` ones) or backend changes.
- Drag-reordering fields directly on the board (reorder lives in the Kelola Field dialog).

## Coding standards
Per [[feedback-coding-standards]]: semantic HTML5 (`<button type="button">` for arrows with `aria-label`;
the draggable row keeps its grip affordance), DRY (reuse `reorderByDrag`/`moveByOffset` + mirror the
`reorderStages` optimistic mutation), SoC (decision logic stays in the pure helpers; the dialog only wires
events). Reuse existing design-system components + Lucide icons.

## Design

### 1. `reorderFields` mutation — add optimistic update (`client/hooks/usePipelines.ts`)

Currently `reorderFields` is `{ mutationFn, onSuccess: invalidate }`. Upgrade it to mirror `reorderStages`:
`onMutate(orderedIds)` cancels + snapshots the `useFields` query (`[KEY, "fields", pipelineId]`), writes the
reordered field list into that cache (reindex by the new id order), returns the snapshot; `onError` restores
it; `onSettled` invalidates. This makes the dialog reorder instantly and keeps the board's
`pipeline.fields` consistent on the subsequent refetch.

### 2. `ManageFieldsDialog` — draggable rows + arrows

In the existing-fields list (`ManageFieldsDialog.tsx`), each field row (`f`) gains:
- `draggable`, `onDragStart={() => setDragId(f.id)}`, `onDragOver={(e) => e.preventDefault()}`,
  `onDrop={() => { if (dragId != null && dragId !== f.id) m.reorderFields.mutate(reorderByDrag(ids, dragId, f.id)); setDragId(null); }}`,
  and `onDragEnd={() => setDragId(null)}`. The existing `GripVertical` stays as the drag affordance
  (add `cursor-grab`).
- Two small `<button type="button">` arrows (`ChevronUp` / `ChevronDown`) with `aria-label` "Naikkan
  posisi" / "Turunkan posisi", each disabled at the boundary, calling
  `m.reorderFields.mutate(moveByOffset(ids, f.id, -1 | 1))`.
- `const ids = (fields ?? []).map((x) => x.id);` (server returns fields position-sorted).
- New local state `const [dragId, setDragId] = useState<number | null>(null);` and an `onDragEnd` reset on the
  list container as a safety net.

No change to the create-field form, delete, or show-on-card toggle.

### 3. Permission
Reorder uses the existing `reorderFields` endpoint (already `requireWritePermission("pipelines")` +
`requirePipelineEdit`); the dialog is reached only from the board's write path. No new gating.

## Files

| File | Change |
|---|---|
| `client/hooks/usePipelines.ts` | `reorderFields` mutation gains optimistic `onMutate`/`onError`/`onSettled` on the fields query key. |
| `client/components/pipelines/ManageFieldsDialog.tsx` | Field rows: `draggable` + grip handle + ▲▼ arrows → `reorderFields.mutate(reorderByDrag/moveByOffset(...))`; `dragId` state; import `reorderByDrag`/`moveByOffset` + `ChevronUp`/`ChevronDown`. |

## Testing
- **Pure:** `reorderByDrag`/`moveByOffset` already covered by `stageReorder.test.ts` — re-run to confirm
  (`npx tsx --test client/components/pipelines/stageReorder.test.ts`). No new pure tests.
- **Gates:** `npm run typecheck` = 0; `npm run build` green.
- **Manual (dev):** open Kelola Field on a pipeline with ≥3 fields → drag a field to a new spot → order
  updates instantly and persists across reopen; ▲/▼ move a field and are disabled at the ends; the new order
  shows in the board card chips (showOnCard fields) and the card modal's Field Kustom section.

## Multi-tenant / RBAC
Unchanged — reorder uses the existing mitra-scoped, write-permission-gated endpoint.

## Risks
1. **Optimistic cache shape** — the `onMutate` must reindex the cached `PipelineField[]` by the new id order
   (and may set `position` to the new index for display consistency); rollback on error covers failures.
2. **Drag in a scrollable dialog** — HTML5 DnD inside the dialog's scroll area can be fiddly; the ▲▼ arrows
   are the always-reliable fallback (and the mobile/a11y path), mirroring stage reorder.

## Acceptance criteria
- Custom fields can be reordered by drag (grip) and by ▲/▼ arrows; the new order persists and reflects on
  board chips + the card modal.
- Reorder is optimistic (no flicker) and rolls back on error.
- No backend/schema/migration; typecheck 0, build green, existing reorder helper tests pass; isolation
  unchanged.
