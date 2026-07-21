# Pipelines Board - Filters Polish & Stage Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the board page's card-search + time-filter toolbar cleaner/more prominent with a new assignee filter, and add drag-and-drop stage reordering (desktop grip handle + mobile ◀ ▶ arrows).

**Architecture:** Pure-frontend on top of an existing backend reorder endpoint. A new pure helper module (`stageReorder.ts`, TDD) computes new orderings; a `reorderStages` React-Query mutation with optimistic cache update lives in `usePipelines.ts`; `BoardFilters` and `StageColumn` get new **optional** props (so the board keeps compiling between tasks); `PipelineBoardPage` wires it all together last.

**Tech Stack:** React 18 + TS + Vite; TanStack Query 5; wouter; lucide-react; shadcn/ui (`Input`, `Combobox`, `Button`); tests via `node:test` (`npx tsx --test`).

**Base branch:** `feat/pipelines-board-filters-reorder` (off `dev`). Spec: `docs/superpowers/specs/2026-06-07-pipelines-board-filters-reorder-design.md`.

**Verification gates:** `npm run typecheck` (0) · `npx tsx --test client/components/pipelines/stageReorder.test.ts` (pass) · `npm run build` (green).

---

## File Structure

| File | Responsibility |
|---|---|
| `client/components/pipelines/stageReorder.ts` (new) | Pure ordering helpers: `reorderByDrag`, `moveByOffset` |
| `client/components/pipelines/stageReorder.test.ts` (new) | `node:test` unit tests for the helpers |
| `client/hooks/usePipelines.ts` (modify) | `reorderStages` mutation (optimistic cache update + rollback) |
| `client/components/pipelines/BoardFilters.tsx` (modify) | Prominent search (icon+clear), assignee combobox, active-filter count+reset, responsive rows |
| `client/components/pipelines/StageColumn.tsx` (modify) | Desktop grip handle + mobile arrows + card-vs-stage drop branching + dim cue |
| `client/pages/PipelineBoardPage.tsx` (modify) | assignee state + visible filter + options; `stageDragId` + reorder/arrow handlers; wire new props |

**Why optional props on the components:** Tasks 3 and 4 change component signatures that the page (Task 5) consumes. By making every new prop optional with a safe default, the page's existing call sites keep compiling after Tasks 3/4, so `npm run typecheck` stays green at every task. Task 5 supplies the real values.

---

### Task 1: Pure ordering helpers (`stageReorder.ts`) - TDD

**Files:**
- Create: `client/components/pipelines/stageReorder.ts`
- Create: `client/components/pipelines/stageReorder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/components/pipelines/stageReorder.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reorderByDrag, moveByOffset } from "./stageReorder.js";

test("reorderByDrag: moves fromId to the index of toId (insert-before semantics)", () => {
  assert.deepEqual(reorderByDrag([1, 2, 3, 4], 1, 4), [2, 3, 1, 4]); // first -> before last
  assert.deepEqual(reorderByDrag([1, 2, 3, 4], 4, 1), [4, 1, 2, 3]); // last -> before first
  assert.deepEqual(reorderByDrag([1, 2, 3], 1, 2), [1, 2, 3]);       // adjacent fwd: lands where it was
  assert.deepEqual(reorderByDrag([1, 2, 3], 3, 2), [1, 3, 2]);       // adjacent back
  assert.deepEqual(reorderByDrag([1, 2, 3], 2, 2), [1, 2, 3]);       // same id -> no-op
  assert.deepEqual(reorderByDrag([1, 2, 3], 9, 1), [1, 2, 3]);       // missing fromId -> unchanged
  assert.deepEqual(reorderByDrag([1, 2, 3], 1, 9), [1, 2, 3]);       // missing toId -> unchanged
});

test("reorderByDrag: returns a new array, does not mutate input", () => {
  const input = [1, 2, 3];
  const out = reorderByDrag(input, 1, 3);
  assert.deepEqual(input, [1, 2, 3]);
  assert.notEqual(out, input);
});

test("moveByOffset: shifts id by dir, clamped at the ends", () => {
  assert.deepEqual(moveByOffset([1, 2, 3], 2, -1), [2, 1, 3]); // middle left
  assert.deepEqual(moveByOffset([1, 2, 3], 2, 1), [1, 3, 2]);  // middle right
  assert.deepEqual(moveByOffset([1, 2, 3], 1, -1), [1, 2, 3]); // first left -> no-op
  assert.deepEqual(moveByOffset([1, 2, 3], 3, 1), [1, 2, 3]);  // last right -> no-op
  assert.deepEqual(moveByOffset([1, 2, 3], 9, 1), [1, 2, 3]);  // missing id -> unchanged
});

test("moveByOffset: returns a new array, does not mutate input", () => {
  const input = [1, 2, 3];
  const out = moveByOffset(input, 2, 1);
  assert.deepEqual(input, [1, 2, 3]);
  assert.notEqual(out, input);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test client/components/pipelines/stageReorder.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` (file doesn't exist yet).

- [ ] **Step 3: Implement `stageReorder.ts`**

Create `client/components/pipelines/stageReorder.ts`:
```ts
/**
 * Move `fromId` so it sits at the current index of `toId` (insert-before semantics).
 * Returns a NEW array. No-op (returns an equal new array) if fromId === toId, or if
 * either id is absent.
 */
export function reorderByDrag(ids: number[], fromId: number, toId: number): number[] {
  if (fromId === toId) return [...ids];
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from === -1 || to === -1) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  const insertAt = next.indexOf(toId);
  next.splice(insertAt, 0, fromId);
  return next;
}

/**
 * Shift `id` by `dir` (-1 left / +1 right). Clamped: a no-op at the boundary or when
 * `id` is absent. Returns a NEW array.
 */
export function moveByOffset(ids: number[], id: number, dir: -1 | 1): number[] {
  const i = ids.indexOf(id);
  if (i === -1) return [...ids];
  const j = i + dir;
  if (j < 0 || j >= ids.length) return [...ids];
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test client/components/pipelines/stageReorder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → 0 errors.
```bash
git add client/components/pipelines/stageReorder.ts client/components/pipelines/stageReorder.test.ts
git commit -m "feat(pipelines): pure stage-reorder helpers reorderByDrag/moveByOffset + tests (board-reorder)"
```

---

### Task 2: `reorderStages` mutation with optimistic update (`usePipelines.ts`)

**Files:**
- Modify: `client/hooks/usePipelines.ts` (inside `usePipelineMutations`, near the other stage mutations ~line 108-110)

Context: `usePipelineMutations(pipelineId?)` already has `const qc = useQueryClient();` and `const invalidate = () => { qc.invalidateQueries({ queryKey: [KEY] }); };` where `const KEY = "pipelines";`. The single-pipeline query (which carries `.stages`) is keyed `[KEY, "one", pipelineId]` and typed `PipelineWithStages` (already imported in this file). Existing stage mutations use `api.post`/`api.patch`/`api.delete` and `onSuccess: invalidate`.

- [ ] **Step 1: Add the mutation**

Immediately after the `deleteStage` mutation (the line `deleteStage: useMutation({ ... }),`), add:
```ts
    reorderStages: useMutation({
      mutationFn: (orderedIds: number[]) =>
        api.post(`/pipelines/${pipelineId}/stages/reorder`, { orderedIds }),
      // Optimistic: reorder the cached pipeline's stages immediately so columns snap.
      onMutate: async (orderedIds: number[]) => {
        const key = [KEY, "one", pipelineId];
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<PipelineWithStages>(key);
        if (prev?.stages) {
          const byId = new Map(prev.stages.map((s) => [s.id, s]));
          const reordered = [
            ...orderedIds.map((id) => byId.get(id)).filter((s): s is PipelineStage => !!s),
            ...prev.stages.filter((s) => !orderedIds.includes(s.id)),
          ];
          qc.setQueryData<PipelineWithStages>(key, { ...prev, stages: reordered });
        }
        return { prev };
      },
      onError: (_e, _vars, ctx) => {
        if (ctx?.prev) qc.setQueryData([KEY, "one", pipelineId], ctx.prev);
      },
      onSettled: invalidate,
    }),
```

- [ ] **Step 2: Ensure `PipelineStage` type is imported**

The optimistic block annotates `(s): s is PipelineStage`. Confirm `PipelineStage` is imported in this file (grep `PipelineStage` / the `@shared/schema` import). If absent, add it to the existing `import type { ... } from "@shared/schema";` line (or wherever `PipelineWithStages` pulls its types). If `PipelineWithStages` is defined locally as `Pipeline & { stages: PipelineStage[] }`, then `PipelineStage` is already referenced - just make sure it's in scope.

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → 0 errors.
```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): reorderStages mutation with optimistic cache reorder + rollback (board-reorder)"
```

---

### Task 3: BoardFilters redesign - prominent search + assignee + reset (`BoardFilters.tsx`)

**Files:**
- Modify: `client/components/pipelines/BoardFilters.tsx` (full rewrite of the component below)

All new props are **optional** so the existing board call site keeps compiling until Task 5.

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `client/components/pipelines/BoardFilters.tsx` with:
```tsx
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Search, X } from "lucide-react";
import type { DateRange } from "./boardCardMeta";

export type DateField = "created" | "updated";

export function BoardFilters({
  search,
  onSearch,
  dateField,
  onDateField,
  range,
  onRange,
  assigneeId = null,
  onAssignee,
  assigneeOptions,
  visibleCount,
  onReset,
}: {
  search: string;
  onSearch: (v: string) => void;
  dateField: DateField;
  onDateField: (v: DateField) => void;
  range: DateRange;
  onRange: (r: DateRange) => void;
  assigneeId?: number | null;
  onAssignee?: (id: number | null) => void;
  assigneeOptions?: ComboboxOption[];
  visibleCount?: number;
  onReset?: () => void;
}) {
  const preset = typeof range === "string" ? range : "custom";
  const custom = typeof range === "object" ? range : { from: "", to: "" };
  const anyActive = search !== "" || preset !== "all" || assigneeId != null;

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1 - prominent search */}
      <Input
        inputSize="sm"
        placeholder="Cari kartu…"
        aria-label="Cari kartu"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        leftIcon={<Search className="size-3.5" />}
        rightIcon={
          search ? (
            <button
              type="button"
              aria-label="Hapus pencarian"
              onClick={() => onSearch("")}
              className="pointer-events-auto rounded hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : undefined
        }
        className="w-full"
      />

      {/* Row 2 - filters (wrap) */}
      <div className="flex items-center gap-2 flex-wrap">
        <Combobox
          options={[
            { value: "created", label: "Dibuat" },
            { value: "updated", label: "Update terakhir" },
          ]}
          value={dateField}
          onChange={(v) => onDateField((v as DateField) || "created")}
          clearable={false}
          size="sm"
        />
        <Combobox
          options={[
            { value: "all", label: "Semua waktu" },
            { value: "7d", label: "7 hari" },
            { value: "30d", label: "30 hari" },
            { value: "custom", label: "Custom…" },
          ]}
          value={preset}
          onChange={(v) =>
            onRange(v === "custom" ? { from: "", to: "" } : ((v as DateRange) || "all"))
          }
          clearable={false}
          size="sm"
        />
        {assigneeOptions && onAssignee && (
          <Combobox
            options={assigneeOptions}
            value={assigneeId == null ? "" : String(assigneeId)}
            onChange={(v) => onAssignee(v ? Number(v) : null)}
            placeholder="Assignee"
            searchPlaceholder="Cari user…"
            size="sm"
          />
        )}
        {preset === "custom" && (
          <div className="flex items-center gap-1">
            <Input
              inputSize="sm"
              type="date"
              value={custom.from}
              aria-label="Dari tanggal"
              onChange={(e) => onRange({ from: e.target.value, to: custom.to })}
              className="w-36"
            />
            <span className="text-muted-foreground text-xs">-</span>
            <Input
              inputSize="sm"
              type="date"
              value={custom.to}
              aria-label="Sampai tanggal"
              onChange={(e) => onRange({ from: custom.from, to: e.target.value })}
              className="w-36"
            />
          </div>
        )}
      </div>

      {/* Active-filter affordance */}
      {anyActive && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {typeof visibleCount === "number" && <span>{visibleCount} kartu</span>}
          {onReset && (
            <button type="button" onClick={onReset} className="underline hover:text-foreground">
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build + commit**

Run: `npm run typecheck && npm run build` → 0 errors, green. (The board still passes only the original 6 props; the new optional props default safely, so the assignee combobox and reset line simply don't render yet.)
```bash
git add client/components/pipelines/BoardFilters.tsx
git commit -m "feat(pipelines): BoardFilters - prominent search (icon+clear), assignee filter, reset affordance (board-filters)"
```

---

### Task 4: StageColumn - grip handle + mobile arrows + drop branching (`StageColumn.tsx`)

**Files:**
- Modify: `client/components/pipelines/StageColumn.tsx`

All new props optional. Behavior: when a stage drag is in progress (`stageDragId != null` and an `onStageDrop` is supplied) the column's drop reorders stages; otherwise it falls back to the existing card drop (`onDropStage`).

- [ ] **Step 1: Add imports**

In the lucide import (currently `import { Pencil, Trash2 } from "lucide-react";`), add the three icons:
```tsx
import { Pencil, Trash2, GripVertical, ChevronLeft, ChevronRight } from "lucide-react";
```

- [ ] **Step 2: Extend the props type**

In the destructured props add the new optional ones, and add them to the type literal. The new params:
```tsx
  index = 0,
  total = 1,
  stageDragId = null,
  onStageDragStart,
  onStageDrop,
  onMoveStage,
```
And in the props type object, append:
```tsx
  index?: number;
  total?: number;
  stageDragId?: number | null;
  onStageDragStart?: (id: number) => void;
  onStageDrop?: (targetId: number) => void;
  onMoveStage?: (id: number, dir: -1 | 1) => void;
```

- [ ] **Step 3: Branch the drop + add the dim cue on the root**

Replace the root element opening tag:
```tsx
    <div
      className="w-72 shrink-0 flex flex-col rounded-lg border-t-[3px] bg-muted/10"
      style={{ borderTopColor: color }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDropStage(stage.id)}
    >
```
with:
```tsx
    <div
      className={`w-72 shrink-0 flex flex-col rounded-lg border-t-[3px] bg-muted/10 transition-opacity ${
        stageDragId === stage.id ? "opacity-50" : ""
      }`}
      style={{ borderTopColor: color }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() =>
        stageDragId != null && onStageDrop ? onStageDrop(stage.id) : onDropStage(stage.id)
      }
    >
```

- [ ] **Step 4: Add the grip handle + mobile arrows in the header**

The current header is:
```tsx
      <div className="flex items-center gap-2 px-2 py-2" style={{ backgroundColor: color + "14" }}>
        <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-semibold text-sm truncate flex-1">{stage.label}</span>
        <span className="text-xs text-muted-foreground">{cards.length}</span>
        {stalledCount > 0 && (
          <span className="text-[10px] text-destructive" title="Stalled">
             {stalledCount}
          </span>
        )}
        {writable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit stage"
            className="opacity-60 hover:opacity-100"
            onClick={() => {
              setLabel(stage.label);
              setDraftColor(color);
              setEditing((v) => !v);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
```
Replace it with (adds: desktop grip before the color dot; mobile ◀ before the dot and ▶ before the pencil):
```tsx
      <div className="flex items-center gap-1.5 px-2 py-2" style={{ backgroundColor: color + "14" }}>
        {writable && onStageDragStart && (
          <button
            type="button"
            draggable
            aria-label="Geser stage"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(stage.id));
              onStageDragStart(stage.id);
            }}
            className="hidden md:flex items-center cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground shrink-0"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        {writable && onMoveStage && (
          <button
            type="button"
            aria-label="Geser stage ke kiri"
            disabled={index <= 0}
            onClick={() => onMoveStage(stage.id, -1)}
            className="flex md:hidden items-center text-muted-foreground disabled:opacity-30 shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-semibold text-sm truncate flex-1">{stage.label}</span>
        <span className="text-xs text-muted-foreground">{cards.length}</span>
        {stalledCount > 0 && (
          <span className="text-[10px] text-destructive" title="Stalled">
             {stalledCount}
          </span>
        )}
        {writable && onMoveStage && (
          <button
            type="button"
            aria-label="Geser stage ke kanan"
            disabled={index >= total - 1}
            onClick={() => onMoveStage(stage.id, 1)}
            className="flex md:hidden items-center text-muted-foreground disabled:opacity-30 shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {writable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit stage"
            className="opacity-60 hover:opacity-100"
            onClick={() => {
              setLabel(stage.label);
              setDraftColor(color);
              setEditing((v) => !v);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
```

- [ ] **Step 5: Typecheck + build + commit**

Run: `npm run typecheck && npm run build` → 0 errors, green. (The board doesn't pass the new props yet, so grip/arrows don't render and drop still does card-move - no behavior change until Task 5.)
```bash
git add client/components/pipelines/StageColumn.tsx
git commit -m "feat(pipelines): StageColumn - desktop grip handle + mobile arrows + stage-drop branching (board-reorder)"
```

---

### Task 5: Wire the board page (`PipelineBoardPage.tsx`)

**Files:**
- Modify: `client/pages/PipelineBoardPage.tsx`

Current relevant shape (for reference): imports `useState` (react), `useRoute` (wouter), `useQuery` + `api`, `usePipeline/usePipelineCards/usePipelineMutations`, `BoardFilters`, `StageColumn`, `AddInline`, `inDateRange`. It has `const m = usePipelineMutations(pid ?? undefined);`, a `users` query → `usersById`, filter state (`search`, `dateField`, `range`), `const stages = pipeline?.stages ?? [];`, and a `visible` filter. The header renders `<BoardFilters ... />` and maps `stages.map((stage) => <StageColumn ... />)`.

- [ ] **Step 1: Add imports + state**

Add to the imports:
```tsx
import { reorderByDrag, moveByOffset } from "@/components/pipelines/stageReorder";
import { toast } from "sonner";
```
(`toast` is likely already imported - if so, don't duplicate. `useState` is already imported.)

Add new state alongside the existing filter state (`search`/`dateField`/`range`):
```tsx
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [stageDragId, setStageDragId] = useState<number | null>(null);
```

- [ ] **Step 2: assigneeOptions + extend the `visible` filter**

After `usersById` is built, derive the options:
```tsx
  const assigneeOptions = (users ?? [])
    .map((u: any) => ({
      value: String(u.id),
      label: u.name || u.username || `User #${u.id}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
```
Extend the `visible` filter predicate to also gate on assignee. The current filter is:
```tsx
  const visible = (cards ?? []).filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) &&
      inDateRange(
        dateField === "created" ? c.createdAt : (c.updatedAt ?? null),
        range,
        now,
      ),
  );
```
Change it to:
```tsx
  const visible = (cards ?? []).filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) &&
      (assigneeId == null || c.assigneeId === assigneeId) &&
      inDateRange(
        dateField === "created" ? c.createdAt : (c.updatedAt ?? null),
        range,
        now,
      ),
  );
```

- [ ] **Step 3: Reorder handlers**

Add near the existing `onDrop` handler (the card-move one):
```tsx
  const stageIds = stages.map((s) => s.id);

  const applyReorder = (orderedIds: number[]) => {
    const unchanged =
      orderedIds.length === stageIds.length &&
      orderedIds.every((id, i) => id === stageIds[i]);
    if (unchanged) return;
    m.reorderStages.mutate(orderedIds, {
      onError: () => toast.error("Gagal mengubah urutan stage"),
    });
  };

  const onStageDrop = (targetId: number) => {
    if (stageDragId != null) applyReorder(reorderByDrag(stageIds, stageDragId, targetId));
    setStageDragId(null);
  };
```

- [ ] **Step 4: Pass new props to BoardFilters**

Find the `<BoardFilters ... />` usage and add the new props:
```tsx
        <BoardFilters
          search={search}
          onSearch={setSearch}
          dateField={dateField}
          onDateField={setDateField}
          range={range}
          onRange={setRange}
          assigneeId={assigneeId}
          onAssignee={setAssigneeId}
          assigneeOptions={assigneeOptions}
          visibleCount={visible.length}
          onReset={() => {
            setSearch("");
            setRange("all");
            setAssigneeId(null);
          }}
        />
```
(Keep whatever wrapper element currently surrounds `BoardFilters`, e.g. the `<div className="mt-2">`.)

- [ ] **Step 5: Pass new props to StageColumn**

In the `stages.map((stage) => ...)` render, the callback already has `stage`. Change it to `stages.map((stage, i) => (` and add the props to `<StageColumn>`:
```tsx
              key={stage.id}
              index={i}
              total={stages.length}
              stageDragId={stageDragId}
              onStageDragStart={setStageDragId}
              onStageDrop={onStageDrop}
              onMoveStage={(id, dir) => applyReorder(moveByOffset(stageIds, id, dir))}
```
(Add these alongside the existing `stage`, `cards`, `fields`, `usersById`, `writable`, `dragId`, `now`, `onDragStartCard`, `onDropStage`, `onCardClick`, `onAddCard`, `onUpdateStage`, `onDeleteStage` props - do not remove any existing prop.)

- [ ] **Step 6: Clear stageDragId on aborted drag**

So an aborted stage drag doesn't leave later card-drops mis-routed, add an `onDragEnd` to the same element that gets `onStageDragStart` is impractical (it's in StageColumn); instead clear on the board's outer scroll container. Add `onDragEnd={() => setStageDragId(null)}` to the board's card/columns scroll wrapper (the `<div className="flex-1 overflow-x-auto px-4 md:px-6">`). This fires after any drag (card or stage) ends; clearing `stageDragId` is a safe no-op for card drags.

- [ ] **Step 7: Typecheck + build + commit**

Run: `npm run typecheck && npm run build` → 0 errors, green.
```bash
git add client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): board page - assignee filter + reset + stage reorder (drag/arrows) wiring (board-reorder)"
```

- [ ] **Step 8: Manual checklist (relay; run on dev)**
- Search: typing filters cards; the  clear button clears it; search input is prominent with the search icon.
- Date filter: Dibuat/Update + 7h/30h/Custom still work; custom date inputs appear.
- Assignee filter: selecting a user shows only that user's cards; clearing shows all.
- Active-filter line: shows "N kartu" + Reset when any filter active; Reset clears search/range/assignee.
- Stage reorder (desktop): drag the grip handle of "Won" past "Lost" → order swaps and persists after reload; columns snap immediately (optimistic). Dragging a card still moves the card (not the column).
- Stage reorder (mobile / narrow viewport): grip hidden, ◀ ▶ arrows visible; ◀ disabled on first stage, ▶ on last; tapping reorders + persists.
- Reorder error path (optional): if the request fails, order rolls back + a toast shows.

---

## Self-Review notes (addressed)

- **Spec coverage:** Part A search prominence + assignee + reset → T3 (+ T5 state/options/visible filter); Part B `reorderStages` mutation → T2, grip+arrows+drop branch → T4, page wiring/optimism → T2 (optimism encapsulated in the mutation) + T5; pure helpers + TDD → T1.
- **Refinement vs spec:** the spec sketched a page-level `setQueryData`/`orderById`; the plan moves the optimistic update *into* the `reorderStages` mutation (`onMutate`/`onError`/`onSettled`) so the cache key (`[KEY,"one",pid]`) stays encapsulated in `usePipelines.ts`. The page only computes `orderedIds` via the pure helpers and calls `mutate`. Same behavior, cleaner boundaries.
- **Incremental compile:** all new `BoardFilters`/`StageColumn` props are optional with defaults, so typecheck/build stay green at T3 and T4 before the page wires them in T5.
- **Type consistency:** `reorderByDrag`/`moveByOffset` (T1) consumed in T5; `reorderStages` mutation (T2) called in T5; `assigneeOptions: ComboboxOption[]` shape (T3) matches the page's builder (T5); `index`/`total`/`stageDragId`/`onStageDragStart`/`onStageDrop`/`onMoveStage` (T4) match T5's StageColumn usage; `c.assigneeId` is a real card field (`pipeline_cards.assigneeId`).
- **No placeholders:** every code step shows full code. The only "find the exact line" instructions (T2 import check, T5 BoardFilters/StageColumn call sites) are locating existing code to edit, with the surrounding code quoted.
- **Standards:** pure helpers (SoC/TDD); semantic HTML + aria-labels on every icon-only button (grip, ◀, ▶, clear , Reset); `type="button"` throughout; semantic tokens (no hardcoded hex added - stage color tint reuses the existing `color + "14"`); DRY (reuse `Combobox`, existing `usersById`, the existing reorder endpoint).
