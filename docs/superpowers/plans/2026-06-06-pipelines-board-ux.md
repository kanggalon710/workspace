# Pipelines Board UX Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the `/pipelines` Kanban to `/leads`-grade UX: per-stage colored accents + a stage color/label editor, date-range filters (created/updated × all/7d/30d/custom), and enriched cards (age, last-update tone, stalled, priority, assignee).

**Architecture:** Frontend-only. A pure React-free `boardCardMeta.ts` holds the date/tone/stalled/range logic (unit-tested). The 123-line `PipelineBoardPage` is decomposed into `BoardFilters` + `StageColumn` (renders `BoardCard`). Stage recolor uses the existing `updateStage` mutation (backend already supports `color`). No backend/schema changes.

**Tech Stack:** React 18 + TS + Vite; TanStack Query; shadcn `Card`/`Button`/`Input`; tests via `node:test` (`npx tsx --test`).

**Base branch:** `feat/pipelines-board-ux` (off `dev`). Spec: `docs/superpowers/specs/2026-06-06-pipelines-board-ux-design.md`.

**Shared types (from existing code):** `PipelineCardWithValues = PipelineCard & { values?: Record<number,string> }` (in `usePipelines.ts`); `PipelineField`, `PipelineStage` (from `@shared/schema`).

**Verification:** `npm run typecheck` (0) · `npx tsx --test client/components/pipelines/boardCardMeta.test.ts` (pass) · `npm run build`.

---

### Task 1: Pure `boardCardMeta.ts` + tests (TDD)

**Files:** Create `client/components/pipelines/boardCardMeta.ts` + `client/components/pipelines/boardCardMeta.test.ts`

- [ ] **Step 1: Write failing tests**

Create `client/components/pipelines/boardCardMeta.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardAgeLabel, lastUpdateTone, isStalled, inDateRange, STALLED_DAYS } from "./boardCardMeta.js";

const now = new Date("2026-06-20T00:00:00.000Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

test("cardAgeLabel: today vs N days", () => {
  assert.equal(cardAgeLabel(daysAgo(0), now), "Hari ini");
  assert.equal(cardAgeLabel(daysAgo(3), now), "3h lalu");
  assert.equal(cardAgeLabel(null as any, now), "—");
});

test("lastUpdateTone: 1/7/14 day boundaries (uses updatedAt else createdAt)", () => {
  assert.equal(lastUpdateTone(daysAgo(0), daysAgo(20), now), "fresh");   // ≤1
  assert.equal(lastUpdateTone(daysAgo(1), daysAgo(20), now), "fresh");
  assert.equal(lastUpdateTone(daysAgo(5), daysAgo(20), now), "recent");  // ≤7
  assert.equal(lastUpdateTone(daysAgo(10), daysAgo(20), now), "warn");   // ≤14
  assert.equal(lastUpdateTone(daysAgo(30), daysAgo(40), now), "old");    // >14
  assert.equal(lastUpdateTone(null, daysAgo(0), now), "fresh");          // falls back to createdAt
});

test("isStalled: > STALLED_DAYS since last touch", () => {
  assert.equal(STALLED_DAYS, 14);
  assert.equal(isStalled(daysAgo(10), daysAgo(40), now), false);
  assert.equal(isStalled(daysAgo(20), daysAgo(40), now), true);
  assert.equal(isStalled(null, daysAgo(20), now), true);   // createdAt 20d, no update
  assert.equal(isStalled(null, null as any, now), false);  // unknown → not stalled
});

test("inDateRange: all / 7d / 30d / custom / null", () => {
  assert.equal(inDateRange(daysAgo(100), "all", now), true);
  assert.equal(inDateRange(daysAgo(3), "7d", now), true);
  assert.equal(inDateRange(daysAgo(10), "7d", now), false);
  assert.equal(inDateRange(daysAgo(20), "30d", now), true);
  assert.equal(inDateRange(daysAgo(40), "30d", now), false);
  assert.equal(inDateRange(daysAgo(5), { from: "2026-06-10", to: "2026-06-20" }, now), true);   // 2026-06-15
  assert.equal(inDateRange(daysAgo(15), { from: "2026-06-10", to: "2026-06-20" }, now), false);  // 2026-06-05
  assert.equal(inDateRange(daysAgo(5), { from: "", to: "" }, now), true);                         // both blank → unbounded
  assert.equal(inDateRange(null, "7d", now), false);                                              // null + not "all"
  assert.equal(inDateRange(null, "all", now), true);
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `npx tsx --test client/components/pipelines/boardCardMeta.test.ts`
Expected: FAIL — module not found / exports missing.

- [ ] **Step 3: Implement**

Create `client/components/pipelines/boardCardMeta.ts`:
```ts
// Pure board-card meta helpers — no React. Mirrors /leads recency thresholds.
export const STALLED_DAYS = 14;
export type UpdateTone = "fresh" | "recent" | "warn" | "old";
export type DateRange = "all" | "7d" | "30d" | { from: string; to: string };

const DAY = 86400000;
function daysBetween(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY);
}

export function cardAgeLabel(createdAt: string | null, now: Date): string {
  if (!createdAt) return "—";
  const d = daysBetween(createdAt, now);
  if (d == null) return "—";
  return d <= 0 ? "Hari ini" : `${d}h lalu`;
}

export function lastUpdateTone(updatedAt: string | null, createdAt: string | null, now: Date): UpdateTone {
  const ref = updatedAt || createdAt;
  const d = ref ? daysBetween(ref, now) : null;
  if (d == null) return "old";
  if (d <= 1) return "fresh";
  if (d <= 7) return "recent";
  if (d <= 14) return "warn";
  return "old";
}

export function isStalled(updatedAt: string | null, createdAt: string | null, now: Date): boolean {
  const ref = updatedAt || createdAt;
  if (!ref) return false;
  const d = daysBetween(ref, now);
  return d != null && d > STALLED_DAYS;
}

export function inDateRange(dateStr: string | null, range: DateRange, now: Date): boolean {
  if (range === "all") return true;
  if (!dateStr) return false;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return false;
  if (range === "7d") return t >= now.getTime() - 7 * DAY;
  if (range === "30d") return t >= now.getTime() - 30 * DAY;
  // custom { from, to } — inclusive, date-only; blank bound = unbounded
  const fromOk = !range.from || t >= Date.parse(range.from + "T00:00:00");
  const toOk = !range.to || t <= Date.parse(range.to + "T23:59:59");
  return fromOk && toOk;
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx tsx --test client/components/pipelines/boardCardMeta.test.ts` → all pass.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/boardCardMeta.ts client/components/pipelines/boardCardMeta.test.ts
git commit -m "feat(pipelines): pure boardCardMeta helpers (age/tone/stalled/range) + tests (board-ux)"
```

---

### Task 2: `BoardCard.tsx`

**Files:** Create `client/components/pipelines/BoardCard.tsx`

- [ ] **Step 1: Implement the enriched card**

```tsx
import { Card } from "@/components/ui/card";
import type { PipelineCardWithValues } from "@/hooks/usePipelines";
import type { PipelineField } from "@shared/schema";
import { cardAgeLabel, lastUpdateTone, isStalled, type UpdateTone } from "./boardCardMeta";

const TONE_DOT: Record<UpdateTone, string> = {
  fresh: "bg-success",
  recent: "bg-muted-foreground/40",
  warn: "bg-warning",
  old: "bg-destructive",
};
const PRIORITY_CLS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

function fieldText(f: PipelineField, raw: string): string {
  return f.type === "checkbox" ? (raw === "1" ? "Ya" : "Tidak")
    : f.type === "currency" ? "Rp " + Number(raw).toLocaleString("id-ID")
    : f.type === "multiselect" ? (() => { try { return (JSON.parse(raw) as string[]).join(", "); } catch { return String(raw); } })()
    : String(raw);
}
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

export function BoardCard({
  card, fields, usersById, writable, dragging, now, onDragStart, onClick,
}: {
  card: PipelineCardWithValues;
  fields: PipelineField[];
  usersById: Map<number, { name?: string | null; username?: string | null }>;
  writable: boolean;
  dragging: boolean;
  now: Date;
  onDragStart: () => void;
  onClick: () => void;
}) {
  const stalled = isStalled(card.updatedAt ?? null, card.createdAt, now);
  const tone = lastUpdateTone(card.updatedAt ?? null, card.createdAt, now);
  const assignee = card.assigneeId != null ? usersById.get(card.assigneeId) : undefined;
  const assigneeName = assignee ? (assignee.name || assignee.username || `User #${card.assigneeId}`) : null;
  return (
    <Card
      draggable={writable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`p-3 cursor-pointer border-l-2 ${stalled ? "border-l-destructive" : "border-l-transparent"} ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 size-2 rounded-full shrink-0 ${TONE_DOT[tone]}`} title="Update terakhir" />
        <div className="text-sm font-medium flex-1 min-w-0">{card.title}</div>
      </div>
      <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${PRIORITY_CLS[card.priority] ?? PRIORITY_CLS.medium}`}>{card.priority}</span>
        <span className="text-[10px] text-muted-foreground">{cardAgeLabel(card.createdAt, now)}</span>
        {stalled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Stalled</span>}
      </div>
      {fields.filter((f) => f.showOnCard).map((f) => {
        const raw = card.values?.[f.id];
        if (raw == null || raw === "") return null;
        return <span key={f.id} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground mr-1 mt-1">{f.label}: {fieldText(f, raw)}</span>;
      })}
      <div className="mt-1.5 flex items-center gap-1.5">
        {assigneeName ? (
          <>
            <span className="size-4 rounded-full bg-primary/15 text-primary text-[8px] font-bold flex items-center justify-center shrink-0">{initials(assigneeName)}</span>
            <span className="text-[10px] text-muted-foreground truncate">{assigneeName}</span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/60 italic">Belum ditugaskan</span>
        )}
      </div>
    </Card>
  );
}
```
NOTE: confirm `PipelineCard` has `updatedAt: string | null`, `createdAt: string`, `priority: string`, `assigneeId: number | null` (it does — see schema `pipeline_cards`). Confirm semantic tokens `bg-success`/`bg-warning`/`bg-info`/`bg-destructive`/`bg-primary` exist in the design system (they do — used across the app).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: BoardCard compiles (unused until Task 3/5 — that's fine). Report.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/BoardCard.tsx
git commit -m "feat(pipelines): BoardCard — age/tone/stalled/priority/assignee (board-ux)"
```

---

### Task 3: `AddInline` extraction + `StageColumn.tsx`

**Files:** Create `client/components/pipelines/AddInline.tsx`, `client/components/pipelines/StageColumn.tsx`

- [ ] **Step 1: Extract `AddInline` to its own file**

Create `client/components/pipelines/AddInline.tsx` (moved verbatim from `PipelineBoardPage.tsx`):
```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddInline({ placeholder, buttonLabel, onAdd }: { placeholder: string; buttonLabel: string; onAdd: (v: string) => Promise<void> }) {
  const [v, setV] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => setOpen(true)}>{buttonLabel}</Button>;
  return (
    <Input inputSize="sm" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
      onBlur={() => { if (!v.trim()) setOpen(false); }}
      onKeyDown={async (e) => {
        if (e.key === "Enter" && v.trim()) { await onAdd(v.trim()); setV(""); setOpen(false); }
        if (e.key === "Escape") { setV(""); setOpen(false); }
      }} />
  );
}
```

- [ ] **Step 2: Implement `StageColumn.tsx`**

Create `client/components/pipelines/StageColumn.tsx`:
```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2 } from "lucide-react";
import type { PipelineStage, PipelineField } from "@shared/schema";
import type { PipelineCardWithValues } from "@/hooks/usePipelines";
import { BoardCard } from "./BoardCard";
import { AddInline } from "./AddInline";
import { isStalled } from "./boardCardMeta";

const SWATCHES = ["#6B7280", "#3B82F6", "#8B5CF6", "#F59E0B", "#22C55E", "#EF4444"];

export function StageColumn({
  stage, cards, fields, usersById, writable, dragId, now,
  onDragStartCard, onDropStage, onCardClick, onAddCard, onUpdateStage, onDeleteStage,
}: {
  stage: PipelineStage;
  cards: PipelineCardWithValues[];
  fields: PipelineField[];
  usersById: Map<number, { name?: string | null; username?: string | null }>;
  writable: boolean;
  dragId: number | null;
  now: Date;
  onDragStartCard: (cardId: number) => void;
  onDropStage: (stageId: number) => void;
  onCardClick: (cardId: number) => void;
  onAddCard: (stageId: number, title: string) => Promise<void>;
  onUpdateStage: (stageId: number, patch: { label: string; color: string }) => Promise<void>;
  onDeleteStage: (stageId: number) => Promise<void>;
}) {
  const color = stage.color ?? "#6B7280";
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(stage.label);
  const [draftColor, setDraftColor] = useState(color);
  const stalledCount = cards.filter((c) => isStalled(c.updatedAt ?? null, c.createdAt, now)).length;

  return (
    <div className="w-72 shrink-0 flex flex-col rounded-lg border-t-[3px] bg-muted/10" style={{ borderTopColor: color }}
         onDragOver={(e) => e.preventDefault()} onDrop={() => onDropStage(stage.id)}>
      <div className="flex items-center gap-2 px-2 py-2" style={{ backgroundColor: color + "14" }}>
        <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-semibold text-sm truncate flex-1">{stage.label}</span>
        <span className="text-xs text-muted-foreground">{cards.length}</span>
        {stalledCount > 0 && <span className="text-[10px] text-destructive" title="Stalled">⚠ {stalledCount}</span>}
        {writable && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit stage" className="opacity-60 hover:opacity-100" onClick={() => { setLabel(stage.label); setDraftColor(color); setEditing((v) => !v); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {editing && writable && (
        <div className="px-2 py-2 border-b border-border/40 space-y-2 bg-card">
          <Input inputSize="sm" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nama stage" aria-label="Nama stage" />
          <div className="flex items-center gap-1.5 flex-wrap">
            {SWATCHES.map((s) => (
              <button key={s} type="button" aria-label={`Warna ${s}`} onClick={() => setDraftColor(s)}
                className={`size-5 rounded-full border ${draftColor.toLowerCase() === s.toLowerCase() ? "ring-2 ring-offset-1 ring-foreground/40" : ""}`} style={{ backgroundColor: s }} />
            ))}
            <input type="color" aria-label="Warna kustom" value={draftColor} onChange={(e) => setDraftColor(e.target.value)} className="size-6 rounded cursor-pointer" />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={async () => { await onUpdateStage(stage.id, { label: label.trim() || stage.label, color: draftColor }); setEditing(false); }}>Simpan</Button>
            <Button type="button" size="sm" variant="ghost" className="text-destructive" aria-label="Hapus stage"
              onClick={async () => { if (confirm(`Hapus stage "${stage.label}"?`)) { await onDeleteStage(stage.id); } }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 p-2">
        {cards.map((c) => (
          <BoardCard key={c.id} card={c} fields={fields} usersById={usersById} writable={writable}
            dragging={dragId === c.id} now={now}
            onDragStart={() => onDragStartCard(c.id)} onClick={() => onCardClick(c.id)} />
        ))}
        {writable && <AddInline placeholder="Judul kartu" buttonLabel="+ Kartu" onAdd={(title) => onAddCard(stage.id, title)} />}
      </div>
    </div>
  );
}
```
NOTE: `lucide-react` `Pencil`/`Trash2` are used elsewhere. Confirm `PipelineStage` has `color: string | null` + `label: string` (it does).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: compiles (StageColumn/AddInline unused until Task 5). Report.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/AddInline.tsx client/components/pipelines/StageColumn.tsx
git commit -m "feat(pipelines): StageColumn (colored accent + edit popover) + extract AddInline (board-ux)"
```

---

### Task 4: `BoardFilters.tsx`

**Files:** Create `client/components/pipelines/BoardFilters.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import type { DateRange } from "./boardCardMeta";

export type DateField = "created" | "updated";

export function BoardFilters({
  search, onSearch, dateField, onDateField, range, onRange,
}: {
  search: string; onSearch: (v: string) => void;
  dateField: DateField; onDateField: (v: DateField) => void;
  range: DateRange; onRange: (r: DateRange) => void;
}) {
  const preset = typeof range === "string" ? range : "custom";
  const custom = typeof range === "object" ? range : { from: "", to: "" };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input inputSize="sm" placeholder="Cari kartu…" value={search} onChange={(e) => onSearch(e.target.value)} className="w-40 md:w-48" />
      <Combobox
        options={[{ value: "created", label: "Dibuat" }, { value: "updated", label: "Update terakhir" }]}
        value={dateField} onChange={(v) => onDateField((v as DateField) || "created")} clearable={false}
      />
      <Combobox
        options={[
          { value: "all", label: "Semua waktu" },
          { value: "7d", label: "7 hari" },
          { value: "30d", label: "30 hari" },
          { value: "custom", label: "Custom…" },
        ]}
        value={preset}
        onChange={(v) => onRange(v === "custom" ? { from: "", to: "" } : ((v as DateRange) || "all"))}
        clearable={false}
      />
      {preset === "custom" && (
        <div className="flex items-center gap-1">
          <Input inputSize="sm" type="date" value={custom.from} aria-label="Dari tanggal"
            onChange={(e) => onRange({ from: e.target.value, to: custom.to })} className="w-36" />
          <span className="text-muted-foreground text-xs">–</span>
          <Input inputSize="sm" type="date" value={custom.to} aria-label="Sampai tanggal"
            onChange={(e) => onRange({ from: custom.from, to: e.target.value })} className="w-36" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build** → 0 errors, green. Commit:
```bash
git add client/components/pipelines/BoardFilters.tsx
git commit -m "feat(pipelines): BoardFilters — search + date-field toggle + range (board-ux)"
```

---

### Task 5: Wire it all into `PipelineBoardPage.tsx`

**Files:** Modify `client/pages/PipelineBoardPage.tsx`

- [ ] **Step 1: Rewrite the page as composition**

Replace the file's contents with (drops the inline column/card/AddInline; keeps drag state + dialogs):
```tsx
import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePipeline, usePipelineCards, usePipelineMutations } from "@/hooks/usePipelines";
import { CardDetailDrawer } from "@/components/pipelines/CardDetailDrawer";
import { ManageFieldsDialog } from "@/components/pipelines/ManageFieldsDialog";
import { PipelineAccessDialog } from "@/components/pipelines/PipelineAccessDialog";
import { PipelineRulesDialog } from "@/components/pipelines/PipelineRulesDialog";
import { BoardFilters, type DateField } from "@/components/pipelines/BoardFilters";
import { StageColumn } from "@/components/pipelines/StageColumn";
import { AddInline } from "@/components/pipelines/AddInline";
import { inDateRange, type DateRange } from "@/components/pipelines/boardCardMeta";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PipelineBoardPage() {
  const [, params] = useRoute("/pipelines/:id");
  const pid = params ? Number(params.id) : null;
  const { data: pipeline } = usePipeline(pid);
  const writable = pipeline?.level === "edit";
  const { data: cards } = usePipelineCards(pid);
  const m = usePipelineMutations(pid ?? undefined);
  const { data: users } = useQuery({ queryKey: ["/api/users"], queryFn: () => api.get<any[]>("/users") });
  const usersById = new Map((users ?? []).map((u: any) => [u.id, u]));

  const [dragId, setDragId] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dateField, setDateField] = useState<DateField>("created");
  const [range, setRange] = useState<DateRange>("all");
  const [showFields, setShowFields] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const now = new Date();
  const stages = pipeline?.stages ?? [];
  const visible = (cards ?? []).filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) &&
    inDateRange(dateField === "created" ? c.createdAt : (c.updatedAt ?? null), range, now),
  );

  const onDrop = async (stageId: number) => {
    if (dragId == null) return;
    const id = dragId; setDragId(null);
    try { await m.moveCard.mutateAsync({ cardId: id, toStageId: stageId, toPosition: undefined }); }
    catch { toast.error("Gagal memindahkan kartu"); }
  };

  return (
    <div className="flex flex-col h-full -m-4 md:-m-6 -mt-16 md:-mt-6 pb-20 md:pb-0">
      <div className="sticky top-0 z-10 bg-background pt-16 md:pt-6 px-4 md:px-6 pb-2 flex items-center gap-2 flex-wrap">
        <h1 className="font-bold text-lg flex-1 truncate min-w-0">{pipeline?.name ?? "Memuat…"}</h1>
        <BoardFilters search={search} onSearch={setSearch} dateField={dateField} onDateField={setDateField} range={range} onRange={setRange} />
        {writable && <Button variant="outline" size="sm" onClick={() => setShowFields(true)}>Kelola Field</Button>}
        {writable && <Button variant="outline" size="sm" onClick={() => setShowAccess(true)}>Akses</Button>}
        {writable && <Button variant="outline" size="sm" onClick={() => setShowRules(true)}>Otomasi</Button>}
      </div>
      <div className="flex-1 overflow-x-auto px-4 md:px-6">
        <div className="flex gap-3 min-h-full pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id} stage={stage}
              cards={visible.filter((c) => c.stageId === stage.id)}
              fields={pipeline?.fields ?? []} usersById={usersById} writable={!!writable}
              dragId={dragId} now={now}
              onDragStartCard={setDragId} onDropStage={onDrop} onCardClick={setSelectedCard}
              onAddCard={async (stageId, title) => { await m.createCard.mutateAsync({ stageId, title }); }}
              onUpdateStage={async (stageId, patch) => { await m.updateStage.mutateAsync({ stageId, ...patch }); toast.success("Stage diperbarui"); }}
              onDeleteStage={async (stageId) => { await m.deleteStage.mutateAsync(stageId); toast.success("Stage dihapus"); }}
            />
          ))}
          {writable && (
            <div className="w-72 shrink-0 pt-2">
              <AddInline placeholder="Nama stage" buttonLabel="+ Stage"
                onAdd={async (label) => { await m.createStage.mutateAsync({ label }); toast.success("Stage ditambah"); }} />
            </div>
          )}
        </div>
      </div>
      {selectedCard != null && pid != null && (
        <CardDetailDrawer cardId={selectedCard} pipelineId={pid} onClose={() => setSelectedCard(null)} writable={writable} />
      )}
      {showFields && pid != null && <ManageFieldsDialog pipelineId={pid} open={showFields} onClose={() => setShowFields(false)} />}
      {showAccess && pid != null && <PipelineAccessDialog pipelineId={pid} open={showAccess} onClose={() => setShowAccess(false)} />}
      {showRules && pid != null && <PipelineRulesDialog pipelineId={pid} open={showRules} onClose={() => setShowRules(false)} />}
    </div>
  );
}
```
NOTE: confirm `usePipelineMutations` exposes `updateStage`/`deleteStage`/`createStage`/`createCard`/`moveCard` (it does — `usePipelines.ts:107-109` + createCard/moveCard). Confirm `api` import path `@/lib/api` + `usePipelineCards` returns cards with `createdAt`/`updatedAt`. The old inline `AddInline` function at the bottom of the file is REMOVED (now imported).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: **0 errors**, build OK.

- [ ] **Step 3: Commit**

```bash
git add client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): board page composes filters + stage columns + enriched cards (board-ux)"
```

- [ ] **Step 4: Manual checklist (relay; run on dev)**

- Stage header shows colored accent (top border + tinted header); pencil → rename + recolor (swatch + custom color) → column updates; delete stage works (with confirm).
- Filters: "Dibuat × 7/30 hari" and "Update terakhir × 7/30 hari" hide out-of-range cards; "Custom" shows two date inputs and filters inclusively; "Semua waktu" shows all. Text search still works (combines with date filter).
- Cards show: priority badge, age ("Hari ini"/"Nh lalu"), last-update tone dot, "Stalled" + red left-border on an old card, assignee avatar+name (or "Belum ditugaskan").
- Empty (filtered-out) stage still accepts drops + "+ Kartu". Drag-drop moves cards. Card click opens detail. Field chips (showOnCard) still render.
- "+ Stage" adds a grey stage (then recolorable).

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 helpers → T1; §2 filters → T4 + page wiring T5; §3 stage column + editor → T3; §4 card → T2; §5 page composition → T5; §6 files all created; §7 edge cases (no-color grey fallback, blank custom bound, empty column still drop-target, unparseable → safe) covered in T1 helpers + T3/T5; §8 testing → T1 unit + T5 manual.
- **Type consistency:** `DateRange`/`DateField`/`UpdateTone` defined in T1/T4 and consumed in T2/T3/T5; `boardCardMeta` signatures (`cardAgeLabel`/`lastUpdateTone`/`isStalled`/`inDateRange`) identical across tasks; `StageColumn`/`BoardCard`/`BoardFilters` prop contracts match the page's usage in T5.
- **No backend:** verified — `updateStage`/`createStage` routes forward `color`; `/users` exists; only client files touched.
- **Standards:** pure `boardCardMeta` (SoC/TDD), 3 focused components + AddInline extraction (decomposition/DRY), semantic tokens (no hardcoded hex except the stage-swatch palette which mirrors stored colors), `<input type="color"/date">` + aria-labels + `type="button"` on all board buttons.
- **No placeholders.**
