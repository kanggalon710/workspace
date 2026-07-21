# Card Detail Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the right-sidebar card drawer with a centered, single-column, width-toggleable modal (full-screen on mobile) that opens in a new tab via `/pipelines/:id?card=<id>`.

**Architecture:** A new `CardDetailModal` (shadcn `Dialog`) replaces `CardDetailDrawer`, reusing all existing card hooks/mutations and the unchanged `FieldCustomSection` (so slices A-D keep working inside). `PipelineBoardPage` drives the modal from `selectedCard` state and syncs the URL (`?card=`) for share/new-tab/refresh, reading the param once on mount. No backend/schema/migration.

**Tech Stack:** TypeScript, React 18, wouter, TanStack Query, shadcn Dialog, `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-07-card-detail-modal-design.md`.

**Coding standards:** semantic HTML5 (`Dialog` semantics, `<label>`, `<button type="button">`, `<a>`), DRY (reuse Dialog/Combobox/existing mutations + a pure `parseCardParam`), SoC (modal container vs `FieldCustomSection`), pure tested helper. Client imports `@shared/...`/`@/...`; tests `./....js`.

**Key facts (verified):** `DialogContent` already renders a built-in top-right close `` (don't add another). `ManageFieldsDialog` overrides the default `grid p-6` with `... flex flex-col p-0` on `DialogContent` - mirror that. wouter `useLocation` returns the path WITHOUT the query, so the modal is driven by state and the URL is synced separately. Card fields available on `CardDetail`: `title, description, stageId, assigneeId, priority, tags, createdBy, createdAt` + `comments/activity/fields/values`. Mutations: `updateCard`, `moveCard`, `addComment`, `deleteCard`, `setCardValues`.

---

## Task 1: `parseCardParam` pure helper (TDD)

**Files:**
- Create: `client/lib/cardParam.ts`
- Test: `client/lib/cardParam.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/lib/cardParam.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCardParam } from "./cardParam.js";

test("parseCardParam extracts a positive integer card id, else null", () => {
  assert.equal(parseCardParam("?card=42"), 42);
  assert.equal(parseCardParam("?foo=1&card=7"), 7);
  assert.equal(parseCardParam("?card=abc"), null);
  assert.equal(parseCardParam("?card=0"), null);
  assert.equal(parseCardParam("?card=-3"), null);
  assert.equal(parseCardParam("?other=1"), null);
  assert.equal(parseCardParam(""), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test client/lib/cardParam.test.ts`
Expected: FAIL - `Cannot find module './cardParam.js'`.

- [ ] **Step 3: Implement `client/lib/cardParam.ts`**

```ts
/** Read a positive-integer `card` id from a URL query string (e.g. "?card=42"). Null if absent/invalid. */
export function parseCardParam(search: string): number | null {
  try {
    const raw = new URLSearchParams(search).get("card");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test client/lib/cardParam.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/lib/cardParam.ts client/lib/cardParam.test.ts
git commit -m "feat(pipelines): pure parseCardParam helper for card deep-link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `CardDetailModal` component (new; keeps `FieldCustomSection`)

**Files:**
- Create: `client/components/pipelines/CardDetailModal.tsx`

(Do NOT delete `CardDetailDrawer.tsx` yet - Task 3 switches the import and deletes it, keeping each task's build green.)

- [ ] **Step 1: Create `CardDetailModal.tsx`**

Create `client/components/pipelines/CardDetailModal.tsx` with EXACTLY this content (the `FieldCustomSection` at the bottom is copied verbatim from the current `CardDetailDrawer.tsx`):

```tsx
import { useState } from "react";
import { useCard, usePipeline, usePipelineMutations, useAssignableUsers, type CardDetail } from "@/hooks/usePipelines";
import type { PipelineField } from "@shared/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { Maximize2, Minimize2, ExternalLink } from "lucide-react";
import { FieldValueInput } from "@/components/pipelines/FieldValueInput";
import { parseCoordinate } from "@shared/pipelineFieldTypes";
import { CoordinateInfo } from "@/components/pipelines/CoordinateInfo";
import { toast } from "sonner";

const PRIORITIES = [
  { value: "low", label: "Rendah" },
  { value: "medium", label: "Sedang" },
  { value: "high", label: "Tinggi" },
  { value: "urgent", label: "Urgent" },
];
const WIDE_KEY = "pipeline_card_modal_wide";

export function CardDetailModal({ cardId, pipelineId, onClose, writable, newTabHref }: {
  cardId: number; pipelineId: number; onClose: () => void; writable: boolean; newTabHref: string;
}) {
  const { data: card, isLoading } = useCard(cardId);
  const { data: pipeline } = usePipeline(pipelineId);
  const { data: users } = useAssignableUsers();
  const m = usePipelineMutations(pipelineId);
  const [comment, setComment] = useState("");
  const [wide, setWide] = useState(() => { try { return localStorage.getItem(WIDE_KEY) === "1"; } catch { return false; } });

  const toggleWide = () =>
    setWide((w) => { const nv = !w; try { localStorage.setItem(WIDE_KEY, nv ? "1" : "0"); } catch { /* ignore */ } return nv; });

  const stages = pipeline?.stages ?? [];
  const stageName = stages.find((s) => s.id === card?.stageId)?.label ?? "";
  const userOpts = (users ?? []).map((u) => ({ value: String(u.id), label: u.name || u.username || `#${u.id}` }));
  const nameOf = (id: number | null | undefined) => {
    if (id == null) return "-";
    const u = (users ?? []).find((x) => x.id === id);
    return u?.name || u?.username || `#${id}`;
  };
  const priorityLabel = PRIORITIES.find((p) => p.value === card?.priority)?.label ?? card?.priority ?? "";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${wide ? "max-w-3xl" : "max-w-lg"} w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0`}>
        {isLoading ? (
          <div className="p-6"><div className="h-40 animate-pulse rounded bg-muted" /></div>
        ) : !card ? (
          <div className="p-6 text-sm text-muted-foreground">Kartu tidak ditemukan.</div>
        ) : (
          <>
            {/* Header (pinned). pr-12 leaves room for DialogContent's built-in close button. */}
            <div className="shrink-0 border-b px-5 py-4 pr-12">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    defaultValue={card.title}
                    disabled={!writable}
                    className="border-0 px-0 text-base font-semibold shadow-none focus-visible:ring-0"
                    onBlur={(e) => { if (writable && e.target.value !== card.title) m.updateCard.mutateAsync({ cardId, title: e.target.value }); }}
                  />
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {pipeline?.name ?? "Pipeline"} · {stageName} · {priorityLabel}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={wide ? "Perkecil modal" : "Perlebar modal"} onClick={toggleWide}>
                    {wide ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </Button>
                  <a href={newTabHref} target="_blank" rel="noreferrer" aria-label="Buka di tab baru"
                     className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
                    <ExternalLink className="size-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Body (scrolls) */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Quick-edit metadata */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Stage</label>
                  <Combobox size="sm" clearable={false}
                    options={stages.map((s) => ({ value: String(s.id), label: s.label }))}
                    value={String(card.stageId)}
                    onChange={(v) => { if (writable && v && Number(v) !== card.stageId) m.moveCard.mutateAsync({ cardId, toStageId: Number(v) }); }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Prioritas</label>
                  <Combobox size="sm" clearable={false} options={PRIORITIES}
                    value={card.priority}
                    onChange={(v) => { if (writable && v && v !== card.priority) m.updateCard.mutateAsync({ cardId, priority: v }); }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Assignee</label>
                  <Combobox size="sm" options={userOpts}
                    value={card.assigneeId == null ? "" : String(card.assigneeId)}
                    placeholder="Belum ada"
                    searchPlaceholder="Cari user…"
                    onChange={(v) => { if (writable) m.updateCard.mutateAsync({ cardId, assigneeId: v ? Number(v) : null }); }}
                  />
                </div>
                <div className="self-end text-[10px] text-muted-foreground">
                  <div>Dibuat: {nameOf(card.createdBy)}</div>
                  <div>{new Date(card.createdAt).toLocaleString("id-ID")}</div>
                </div>
              </div>

              {card.tags && (
                <div className="flex flex-wrap gap-1">
                  {card.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                    <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t}</span>
                  ))}
                </div>
              )}

              <Textarea
                defaultValue={card.description ?? ""}
                placeholder="Deskripsi / catatan"
                disabled={!writable}
                onBlur={(e) => { if (writable && e.target.value !== (card.description ?? "")) m.updateCard.mutateAsync({ cardId, description: e.target.value }); }}
              />

              {card.fields.length > 0 && <FieldCustomSection card={card} pipelineId={pipelineId} writable={writable} />}

              <section>
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Komentar & Lampiran</h4>
                <div className="space-y-2">
                  {card.comments.map((c) => (
                    <div key={c.id} className="rounded bg-muted/50 p-2 text-sm">
                      {c.body}
                      {c.photoPath && (
                        <a href={`/api/pipelines/cards/comments/${c.id}/photo`} target="_blank" rel="noreferrer" className="mt-1 block">
                          <img
                            src={`/api/pipelines/cards/comments/${c.id}/photo`}
                            alt="Foto"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            className="max-h-40 rounded border border-border/50"
                          />
                        </a>
                      )}
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString("id-ID")}</div>
                    </div>
                  ))}
                  {card.comments.length === 0 && <p className="text-xs text-muted-foreground">Belum ada komentar.</p>}
                </div>
                {writable && (
                  <div className="mt-2 flex gap-1">
                    <Input inputSize="sm" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tulis komentar…" />
                    <Button size="sm" onClick={async () => { if (comment.trim()) { await m.addComment.mutateAsync({ cardId, body: comment.trim() }); setComment(""); } }}>Kirim</Button>
                  </div>
                )}
              </section>

              <section>
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Aktivitas</h4>
                <ul className="space-y-1">
                  {card.activity.map((a) => (
                    <li key={a.id} className="text-[10px] text-muted-foreground">
                      <span className="font-medium">{a.type}</span> · {new Date(a.createdAt).toLocaleString("id-ID")}
                    </li>
                  ))}
                  {card.activity.length === 0 && <li className="text-[10px] text-muted-foreground">Belum ada aktivitas.</li>}
                </ul>
              </section>

              {writable && (
                <Button variant="destructive" size="sm" onClick={async () => { await m.deleteCard.mutateAsync(cardId); onClose(); }}>Hapus Kartu</Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldCustomSection({ card, pipelineId, writable }: { card: CardDetail; pipelineId: number; writable: boolean }) {
  const m = usePipelineMutations(pipelineId);
  const [draft, setDraft] = useState<Record<number, string>>(() => ({ ...card.values }));
  const fields = [...card.fields].sort((a: PipelineField, b: PipelineField) => a.position - b.position);
  if (fields.length === 0) return null;
  const save = async () => {
    const values = fields.map((f: PipelineField) => ({ fieldId: f.id, value: draft[f.id] ?? "" }));
    try { await m.setCardValues.mutateAsync({ cardId: card.id, values }); toast.success("Field disimpan"); }
    catch (e: any) { toast.error(e?.message || "Gagal menyimpan field"); }
  };
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Field Kustom</h4>
      <div className="space-y-3">
        {fields.map((f: PipelineField) => {
          const v = draft[f.id] ?? "";
          const emptyRequired = f.required === 1 && (v === "" || v === "[]");
          return (
            <div key={f.id}>
              <div className="mb-1 flex items-center gap-1">
                <span className="text-xs font-medium">{f.label}</span>
                {emptyRequired && <span className="text-[10px] text-amber-600">wajib diisi</span>}
              </div>
              <FieldValueInput field={f} value={v} disabled={!writable} onChange={(nv) => setDraft((d) => ({ ...d, [f.id]: nv }))} />
              {f.type === "coordinate" && (() => {
                const c = parseCoordinate(v);
                return c ? <CoordinateInfo lat={c.lat} lng={c.lng} /> : null;
              })()}
            </div>
          );
        })}
      </div>
      {writable && <Button size="sm" className="mt-2" onClick={save} loading={m.setCardValues.isPending}>Simpan Field</Button>}
    </section>
  );
}
```

(`usePipeline` + `useAssignableUsers` are exported from `@/hooks/usePipelines`; react-query dedups with the board's instances. `Combobox` supports `size`/`clearable`/`searchPlaceholder`. `moveCard`/`updateCard` mutations accept these payloads. The `DialogContent` className mirrors `ManageFieldsDialog` so `flex flex-col p-0` wins over the primitive's default `grid p-6`.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds (the new component is not yet referenced - that's fine).

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(pipelines): CardDetailModal (centered dialog, single-column, quick-edit, width toggle)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire the modal + `?card=` URL sync into `PipelineBoardPage`; delete the drawer

**Files:**
- Modify: `client/pages/PipelineBoardPage.tsx`
- Delete: `client/components/pipelines/CardDetailDrawer.tsx`

- [ ] **Step 1: Swap imports**

In `client/pages/PipelineBoardPage.tsx`, replace the `CardDetailDrawer` import with `CardDetailModal`, and add `useEffect` + `parseCardParam`. Find:

```tsx
import { CardDetailDrawer } from "@/components/pipelines/CardDetailDrawer";
```

Replace with:

```tsx
import { CardDetailModal } from "@/components/pipelines/CardDetailModal";
import { parseCardParam } from "@/lib/cardParam";
```

Ensure `useEffect` is imported from `react` (the file already imports `useState`/`useMemo` - add `useEffect` to that import if not present).

- [ ] **Step 2: Add open/close handlers + deep-link-on-mount**

The page has `const [, navigate] = useLocation();` and `const [selectedCard, setSelectedCard] = useState<number | null>(null);`. Add, right after the `selectedCard` state declaration:

```tsx
  // Open from a deep link (?card=) once on mount; the modal is otherwise driven by selectedCard.
  useEffect(() => {
    const c = parseCardParam(window.location.search);
    if (c) setSelectedCard(c);
  }, []);

  const openCard = (cardId: number) => { setSelectedCard(cardId); navigate(`/pipelines/${pid}?card=${cardId}`); };
  const closeCard = () => { setSelectedCard(null); navigate(`/pipelines/${pid}`, { replace: true }); };
```

(Driving the modal from state avoids wouter's query-stripping; `navigate` keeps the URL bar shareable / new-tab-able / refresh-stable.)

- [ ] **Step 3: Use `openCard` for card clicks**

Find the `onCardClick` prop passed to `StageColumn` (currently `onCardClick={setSelectedCard}`) and change it to:

```tsx
              onCardClick={openCard}
```

- [ ] **Step 4: Replace the drawer mount with the modal**

Find:

```tsx
      {selectedCard != null && pid != null && (
        <CardDetailDrawer
          cardId={selectedCard}
          pipelineId={pid}
          onClose={() => setSelectedCard(null)}
          writable={writable}
        />
      )}
```

Replace with:

```tsx
      {selectedCard != null && pid != null && (
        <CardDetailModal
          cardId={selectedCard}
          pipelineId={pid}
          onClose={closeCard}
          writable={writable}
          newTabHref={`/pipelines/${pid}?card=${selectedCard}`}
        />
      )}
```

- [ ] **Step 5: Delete the old drawer**

```bash
git rm client/components/pipelines/CardDetailDrawer.tsx
```

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors (no remaining references to `CardDetailDrawer`).
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): board uses CardDetailModal + ?card= deep link; remove drawer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests**

Run: `npx tsx --test client/lib/cardParam.test.ts shared/pipelineFieldTypes.test.ts server/pipeline-field-helpers.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual checklist (record results)**

On the dev "Leads (Marketing)" pipeline:
- Click a card → a centered modal opens (desktop); on a narrow viewport it fills the screen.  (#2)
- Edit the name + description (blur saves); change Stage, Assignee, Prioritas via the selects → changes persist and the board reflects them.
- Width toggle (⤢/⤡) switches Normal ↔ Lebar and the choice survives reopening.
- "Buka di tab baru" opens `/pipelines/:id?card=N` in a new tab and lands with the modal open; refreshing that URL reopens it.
- Close → URL returns to `/pipelines/:id` (no `?card=`).
- Custom fields work inside (phone Call/WhatsApp buttons; coordinate map picker + wilayah/ODP info).  (A-D intact)
- A bogus `/pipelines/:id?card=999999` shows "Kartu tidak ditemukan".

- [ ] **Step 5: Final commit (only if the manual pass required a fixup; otherwise skip)**

```bash
git add -A
git commit -m "chore(pipelines): card modal verification fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (author)

- **Spec coverage:** container/modal + responsiveness + width toggle + open-in-tab → Tasks 2/3; single-column layout w/ header + quick-edit stage/assignee/priority + read-only created-by/date/tags + description + fields + comments + activity + delete → Task 2; deep-link + clear-on-close → Task 3; `parseCardParam` tested → Task 1. No backend/schema/migration. Slices A-D intact (FieldCustomSection unchanged).
- **Type consistency:** `CardDetailModal` props `{cardId,pipelineId,onClose,writable,newTabHref}`; `parseCardParam(search)`; mutations `moveCard({cardId,toStageId})` / `updateCard({cardId,...})` match `usePipelineMutations`. `CardDetail` exposes `stageId/assigneeId/priority/tags/createdBy/createdAt`.
- **Build-green ordering:** Task 2 adds the modal unused (compiles); Task 3 switches the import and deletes the drawer in the same task.
- **No placeholders.**
