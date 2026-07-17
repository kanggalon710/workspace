# Custom Field Drag-Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users reorder a pipeline's custom fields by dragging a row (grip) or using ▲/▼ arrows, persisting via the existing reorder endpoint, with an optimistic update.

**Architecture:** Reuse the tested pure helpers `reorderByDrag`/`moveByOffset` (`stageReorder.ts`) and the existing `reorderFields` mutation + backend endpoint; make the mutation optimistic on the fields query, and wire drag + arrow events in `ManageFieldsDialog`. No backend/schema/migration.

**Tech Stack:** React 18, TanStack Query, HTML5 drag-and-drop, Lucide icons. Spec: `docs/superpowers/specs/2026-06-07-field-reorder-design.md`. Mirrors the shipped stage-reorder UX.

**Coding standards:** semantic HTML5 (`<button type="button">` arrows with `aria-label`), DRY (reuse helpers + mirror `reorderStages`), SoC (logic in pure helpers; dialog wires events).

**Key facts (verified):** `reorderByDrag(ids, fromId, toId)` / `moveByOffset(ids, id, dir:-1|1)` exist in `client/components/pipelines/stageReorder.ts` (tested in `stageReorder.test.ts`). Backend `POST /api/pipelines/:id/fields/reorder` + `storage.reorderFields` exist. `useFields` query key is `[KEY, "fields", pipelineId]` (`KEY="pipelines"`). `usePipelines.ts` already imports `PipelineField` from `@shared/schema`. `ManageFieldsDialog` renders the existing-fields list as `(fields ?? []).map((f) => (<div key={f.id} ...> ... <GripVertical/> ... </div>))`.

---

## Task 1: Make `reorderFields` optimistic (`client/hooks/usePipelines.ts`)

**Files:**
- Modify: `client/hooks/usePipelines.ts`

- [ ] **Step 1: Replace the `reorderFields` mutation**

Find the current one-liner (line ~152):

```ts
    reorderFields: useMutation({ mutationFn: (orderedIds: number[]) => api.post(`/pipelines/${pipelineId}/fields/reorder`, { orderedIds }), onSuccess: invalidate }),
```

Replace it with an optimistic version mirroring `reorderStages` (which is defined just above in the same `return {...}`):

```ts
    reorderFields: useMutation({
      mutationFn: (orderedIds: number[]) =>
        api.post(`/pipelines/${pipelineId}/fields/reorder`, { orderedIds }),
      // Optimistic: reorder the cached fields list immediately so the dialog snaps.
      onMutate: async (orderedIds: number[]) => {
        const key = [KEY, "fields", pipelineId];
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<PipelineField[]>(key);
        if (prev) {
          const byId = new Map(prev.map((f) => [f.id, f]));
          const reordered = [
            ...orderedIds.map((id) => byId.get(id)).filter((f): f is PipelineField => !!f),
            ...prev.filter((f) => !orderedIds.includes(f.id)),
          ].map((f, i) => ({ ...f, position: i }));
          qc.setQueryData<PipelineField[]>(key, reordered);
        }
        return { prev };
      },
      onError: (_e, _vars, ctx: any) => {
        if (ctx?.prev) qc.setQueryData([KEY, "fields", pipelineId], ctx.prev);
      },
      onSettled: invalidate,
    }),
```

(`KEY`, `qc`, `invalidate`, and the `PipelineField` type are all already in scope in this file — confirm `PipelineField` is in the `@shared/schema` import at the top; it is.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): optimistic reorderFields mutation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Drag + arrow reordering in `ManageFieldsDialog`

**Files:**
- Modify: `client/components/pipelines/ManageFieldsDialog.tsx`

- [ ] **Step 1: Imports + state + ids**

(a) Add the helper + icon imports. The file already imports from lucide and components — add:

```ts
import { reorderByDrag, moveByOffset } from "@/components/pipelines/stageReorder";
```

and add `ChevronUp, ChevronDown` to the existing `lucide-react` import (which currently imports `Trash2, Plus, GripVertical, Settings2`):

```ts
import { Trash2, Plus, GripVertical, Settings2, ChevronUp, ChevronDown } from "lucide-react";
```

(b) Add drag state next to the other `useState` calls (after `const [assigneeMultiple, setAssigneeMultiple] = useState(false);`):

```ts
  const [dragId, setDragId] = useState<number | null>(null);
```

(c) Just before the `return (`, add the id list:

```ts
  const fieldIds = (fields ?? []).map((x) => x.id);
```

- [ ] **Step 2: Make each field row draggable + add arrows**

Change the existing-fields map to expose the index, and make the row draggable. Find:

```tsx
                  {(fields ?? []).map((f) => (
                    <div
                      key={f.id}
                      className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 shadow-elev-sm transition-shadow hover:shadow-elev-md"
                    >
                      {/* Drag handle (visual only — reorder DnD is a future enhancement) */}
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
```

Replace it with (adds `idx`, drag handlers on the row, a grab cursor on the grip, and ▲/▼ arrow buttons):

```tsx
                  {(fields ?? []).map((f, idx) => (
                    <div
                      key={f.id}
                      draggable
                      onDragStart={() => setDragId(f.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragId != null && dragId !== f.id) m.reorderFields.mutate(reorderByDrag(fieldIds, dragId, f.id));
                        setDragId(null);
                      }}
                      onDragEnd={() => setDragId(null)}
                      className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 shadow-elev-sm transition-shadow hover:shadow-elev-md"
                    >
                      {/* Drag handle */}
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />

                      {/* Reorder arrows (mobile + keyboard accessible) */}
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          aria-label="Naikkan posisi"
                          disabled={idx === 0}
                          onClick={() => m.reorderFields.mutate(moveByOffset(fieldIds, f.id, -1))}
                          className="text-muted-foreground/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="Turunkan posisi"
                          disabled={idx === fieldIds.length - 1}
                          onClick={() => m.reorderFields.mutate(moveByOffset(fieldIds, f.id, 1))}
                          className="text-muted-foreground/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
```

(Leave the rest of the row — type badge, label/meta, show-on-card toggle, delete button — unchanged.)

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/ManageFieldsDialog.tsx
git commit -m "feat(pipelines): drag + arrow reordering of custom fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Reorder-helper tests (already cover the logic)**

Run: `npx tsx --test client/components/pipelines/stageReorder.test.ts`
Expected: PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual checklist (record results)**

On a dev pipeline with ≥3 custom fields (e.g. the "Leads (Marketing)" pipeline):
- Open **Field** (Kelola Field). Drag a field row by the grip onto another row → the order changes instantly and persists after closing + reopening the dialog. ✅
- ▲ / ▼ arrows move a field up/down; ▲ is disabled on the first row, ▼ on the last. ✅
- The new order is reflected in the board card chips (showOnCard fields) and the card modal's Field Kustom section after the queries settle. ✅
- On error (simulate offline) the list rolls back to the prior order. ✅

- [ ] **Step 5: Final commit (only if the manual pass required a fixup; otherwise skip)**

```bash
git add -A
git commit -m "chore(pipelines): field reorder verification fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (author)

- **Spec coverage:** optimistic mutation → Task 1; drag + arrows wiring → Task 2; verification → Task 3. Reuses tested `reorderByDrag`/`moveByOffset` (no new pure code) and the existing backend endpoint. No backend/schema/migration.
- **Type consistency:** `reorderByDrag(fieldIds, dragId, f.id)` and `moveByOffset(fieldIds, f.id, -1|1)` match the helper signatures; mutation cache typed `PipelineField[]` on `[KEY,"fields",pipelineId]`.
- **No placeholders.**
