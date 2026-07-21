# Bulk Card Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select many cards on `/pipelines` and apply one mass op (assign / move / set_field / add_tag / remove_tag / delete) via a single permission- and tenant-safe endpoint with per-card partial-success reporting.

**Architecture:** A pure validation/tag module + one `POST /api/pipelines/:id/cards/bulk` endpoint that loops server-side reusing the existing per-card guards + storage methods (partial-success, audit, optional automation) + client selection UI (reuse the UsersPage pattern) with a mobile-first action bar + per-op dialogs.

**Tech Stack:** TypeScript, Drizzle (MySQL), Express 5, React 18 + TanStack Query 5, `node:test`.

**Conventions / reuse:**
- Tenant via `getMitraId()`; envelope `sendSuccess`/`sendError`.
- Server helpers (BOOLEAN forms, safe in a loop - they don't send responses): `getPipelineCapabilities(req,pid): Set<cap>`, `fieldAccessForRequest(req,pid,fields): Map<fieldId,level>`, `getCardFilterForRequest(req,pid): filter|null`, `cardPassesFilter(filter,ctx): boolean` (from `@shared/cardRowFilter`), `isPipelineAdmin(req)`, `validateFieldValue` (`server/pipeline-field-helpers` / wherever imported in routes), `runStageEnterAutomations`/`dispatchCardEvent`.
- Storage: `getCard`, `updateCard(id,{assigneeId?|tags?},actor)` (logs `reassigned`/`edited`), `moveCard(id,stageId,undefined,actor)` (logs `moved`), `setCardValues(id,[{fieldId,value}])` (does NOT log), `deleteCard(id)`, `getCardValues(id)`, `getAllCardValuesForPipeline(pid)`, `listStages`, `listFields`.
- Client: cards query key `["pipelines","cards",pipelineId]`; `UsersPage` bulk pattern (`selectedIds:Set`, action bar on `size>0`); `StageColumn` renders `cards.map(...)` with `writable`/`onCardClick`.

---

### Task 1: Pure module `shared/bulkCardOps.ts`

**Files:** Create `shared/bulkCardOps.ts`; Test `shared/bulkCardOps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { BULK_OPS, BULK_MAX_CARDS, validateBulkRequest, applyTagChange, parseTags } from "./bulkCardOps.js";

test("BULK_OPS + cap", () => {
  assert.deepEqual(BULK_OPS, ["assign", "move", "set_field", "add_tag", "remove_tag", "delete"]);
  assert.equal(BULK_MAX_CARDS, 200);
});

test("validateBulkRequest: cardIds rules", () => {
  assert.equal(validateBulkRequest("delete", [1, 2], undefined).ok, true);
  assert.equal(validateBulkRequest("delete", [], undefined).ok, false);       // empty
  assert.equal(validateBulkRequest("delete", "x", undefined).ok, false);      // not array
  assert.equal(validateBulkRequest("delete", [1, -2], undefined).ok, false);  // non-positive
  assert.equal(validateBulkRequest("delete", Array.from({length: 201}, (_, i) => i + 1), undefined).ok, false); // over cap
  assert.equal(validateBulkRequest("bogus", [1], undefined).ok, false);       // unknown op
});

test("validateBulkRequest: per-op payload", () => {
  assert.equal(validateBulkRequest("assign", [1], { assigneeId: 5 }).ok, true);
  assert.equal(validateBulkRequest("assign", [1], { assigneeId: null }).ok, true);
  assert.equal(validateBulkRequest("assign", [1], {}).ok, false);
  assert.equal(validateBulkRequest("move", [1], { stageId: 9 }).ok, true);
  assert.equal(validateBulkRequest("move", [1], { stageId: 0 }).ok, false);
  assert.equal(validateBulkRequest("set_field", [1], { fieldId: 3, value: "x" }).ok, true);
  assert.equal(validateBulkRequest("set_field", [1], { fieldId: 3 }).ok, false);   // value missing
  assert.equal(validateBulkRequest("add_tag", [1], { tag: "VIP" }).ok, true);
  assert.equal(validateBulkRequest("add_tag", [1], { tag: "" }).ok, false);
});

test("parseTags + applyTagChange", () => {
  assert.deepEqual(parseTags(null), []);
  assert.deepEqual(parseTags('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseTags("garbage"), []);
  assert.deepEqual(applyTagChange(["a"], "add_tag", "b"), ["a", "b"]);
  assert.deepEqual(applyTagChange(["a", "b"], "add_tag", "a"), ["a", "b"]); // dedupe
  assert.deepEqual(applyTagChange(["a", "b"], "remove_tag", "a"), ["b"]);
  assert.deepEqual(applyTagChange(["a"], "remove_tag", "z"), ["a"]);        // absent no-op
});
```

- [ ] **Step 2: Run - expect FAIL**

Run: `npx tsx --test shared/bulkCardOps.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `shared/bulkCardOps.ts`:

```ts
/** Pure helpers for bulk card actions - no I/O, unit-testable. */
export type BulkOp = "assign" | "move" | "set_field" | "add_tag" | "remove_tag" | "delete";
export const BULK_OPS: BulkOp[] = ["assign", "move", "set_field", "add_tag", "remove_tag", "delete"];
export const BULK_MAX_CARDS = 200;

export type BulkValidation = { ok: true } | { ok: false; error: string };

const isPosInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

export function validateBulkRequest(op: string, cardIds: unknown, payload: any): BulkValidation {
  if (!BULK_OPS.includes(op as BulkOp)) return { ok: false, error: "Aksi tidak dikenal" };
  if (!Array.isArray(cardIds) || cardIds.length === 0) return { ok: false, error: "Pilih minimal satu kartu" };
  if (cardIds.length > BULK_MAX_CARDS) return { ok: false, error: `Maks ${BULK_MAX_CARDS} kartu per aksi` };
  if (!cardIds.every(isPosInt)) return { ok: false, error: "ID kartu tidak valid" };
  switch (op) {
    case "assign":
      if (!payload || !("assigneeId" in payload)) return { ok: false, error: "assigneeId wajib" };
      if (payload.assigneeId !== null && !isPosInt(payload.assigneeId)) return { ok: false, error: "assigneeId tidak valid" };
      return { ok: true };
    case "move":
      return isPosInt(payload?.stageId) ? { ok: true } : { ok: false, error: "stageId wajib" };
    case "set_field":
      if (!isPosInt(payload?.fieldId)) return { ok: false, error: "fieldId wajib" };
      if (typeof payload?.value !== "string") return { ok: false, error: "value wajib (string)" };
      return { ok: true };
    case "add_tag":
    case "remove_tag": {
      const t = typeof payload?.tag === "string" ? payload.tag.trim() : "";
      if (!t || t.length > 64) return { ok: false, error: "tag wajib (≤64 char)" };
      return { ok: true };
    }
    case "delete":
      return { ok: true };
    default:
      return { ok: false, error: "Aksi tidak dikenal" };
  }
}

/** Parse pipeline_cards.tags (JSON array text) into a string[]; [] on null/garbage. */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}

export function applyTagChange(existing: string[], op: "add_tag" | "remove_tag", tag: string): string[] {
  const t = tag.trim();
  if (op === "add_tag") return existing.includes(t) ? existing : [...existing, t];
  return existing.filter((x) => x !== t);
}
```

- [ ] **Step 4: Run - expect 4/4 PASS**

Run: `npx tsx --test shared/bulkCardOps.test.ts`

- [ ] **Step 5: Commit**

```bash
git add shared/bulkCardOps.ts shared/bulkCardOps.test.ts
git commit -m "feat(bulk): pure validation + tag helpers"
```

---

### Task 2: Public activity-log helper on storage

**Files:** Modify `server/storage.ts` (add a thin public wrapper near the private `logCardActivity` ~1915)

The private `logCardActivity` can't be called from the route; `setCardValues` doesn't log. Add a public passthrough so bulk `set_field` records audit.

- [ ] **Step 1: Add the method**

```ts
/** Public audit hook for callers that mutate via low-level methods (e.g. bulk set_field). */
async recordCardActivity(cardId: number, actorId: number, type: string, detail?: unknown): Promise<void> {
  await this.logCardActivity(cardId, actorId, type, detail);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(bulk): public recordCardActivity wrapper for audit"
```

---

### Task 3: Bulk endpoint `POST /api/pipelines/:id/cards/bulk`

**Files:** Modify `server/routes.ts` (add near the cards routes ~4870; import the pure module)

Read first: `getPipelineCapabilities` (4274), `fieldAccessForRequest` (4292), `getCardFilterForRequest` (4301), `cardPassesFilter` import, `validateFieldValue` import, the cards-list row-filter usage (~4674).

- [ ] **Step 1: Add imports**

```ts
import { validateBulkRequest, applyTagChange, parseTags, type BulkOp } from "../shared/bulkCardOps.js";
```
(`cardPassesFilter`, `validateFieldValue`, `getCardFilterForRequest`, `getPipelineCapabilities`, `fieldAccessForRequest`, `dispatchCardEvent`, `runStageEnterAutomations` are already imported/defined in routes.ts.)

- [ ] **Step 2: Add the route**

```ts
router.post("/api/pipelines/:id/cards/bulk", async (req, res) => {
  if (!requireWritePermission(req, res, "pipelines")) return;
  const pid = Number(req.params.id);
  if (!(await requirePipelineView(req, res, pid))) return;
  const { op, cardIds, payload, runAutomation, overwrite } = req.body ?? {};
  const v = validateBulkRequest(op, cardIds, payload);
  if (!v.ok) return sendError(res, v.error, 400);

  // Capability for the op (same as each op's single-card endpoint): assign→"assign", rest→"cards".
  const caps = await getPipelineCapabilities(req, pid);
  const neededCap = op === "assign" ? "assign" : "cards";
  if (!caps.has(neededCap as any) && !isPipelineAdmin(req)) {
    return sendError(res, `Akses ditolak: butuh kapabilitas '${neededCap}'`, 403);
  }

  // set_field: one field for all cards - validate field + edit-access + value once up front.
  let field: any = null;
  let fieldOpts: string[] | undefined;
  let fieldMultiple = false;
  if (op === "set_field") {
    const fields = await storage.listFields(pid);
    field = fields.find((f) => f.id === Number(payload.fieldId));
    if (!field) return sendError(res, "Field tidak ditemukan", 400);
    const access = await fieldAccessForRequest(req, pid, fields);
    if (access.get(field.id) !== "edit" && !isPipelineAdmin(req)) {
      return sendError(res, "Tidak boleh mengedit field ini", 403);
    }
    fieldOpts = field.options ? JSON.parse(field.options) : undefined;
    fieldMultiple = field.config ? !!JSON.parse(field.config)?.multiple : false;
    const vv = validateFieldValue(field.type, String(payload.value ?? ""), fieldOpts, { multiple: fieldMultiple });
    if (!vv.ok) return sendError(res, vv.error, 400);
  }

  // Row-level filter resolved once; fetch all values once if filtering is active.
  const rowFilter = await getCardFilterForRequest(req, pid);
  const allValues = rowFilter ? await storage.getAllCardValuesForPipeline(pid) : null;

  const actor = req.authUser!.id;
  const failed: { cardId: number; reason: string }[] = [];
  let succeeded = 0;

  for (const id of cardIds as number[]) {
    try {
      const card = await storage.getCard(id);
      if (!card || card.pipelineId !== pid) { failed.push({ cardId: id, reason: "tidak ditemukan" }); continue; }
      if (rowFilter) {
        const vals = new Map<number, string>(Object.entries(allValues!.get(id) ?? {}).map(([k, val]) => [Number(k), String(val)]));
        if (!cardPassesFilter(rowFilter, { values: vals, stageId: card.stageId })) {
          failed.push({ cardId: id, reason: "tidak ditemukan" }); continue;
        }
      }

      let updated = card;
      if (op === "assign") {
        updated = await storage.updateCard(id, { assigneeId: payload.assigneeId ?? null }, actor);
      } else if (op === "move") {
        if (card.stageId === Number(payload.stageId)) { succeeded++; continue; } // no-op
        const stages = await storage.listStages(pid);
        if (!stages.some((s) => s.id === Number(payload.stageId))) { failed.push({ cardId: id, reason: "stage tidak valid" }); continue; }
        updated = await storage.moveCard(id, Number(payload.stageId), undefined, actor);
      } else if (op === "set_field") {
        if (overwrite === false) {
          const cur = await storage.getCardValues(id);
          if (cur[field.id] != null && String(cur[field.id]).trim() !== "") { failed.push({ cardId: id, reason: "sudah terisi" }); continue; }
        }
        await storage.setCardValues(id, [{ fieldId: field.id, value: String(payload.value ?? "") }]);
        await storage.recordCardActivity(id, actor, "edited", { fieldId: field.id });
      } else if (op === "add_tag" || op === "remove_tag") {
        const tags = applyTagChange(parseTags(card.tags), op as "add_tag" | "remove_tag", String(payload.tag));
        updated = await storage.updateCard(id, { tags }, actor);
      } else if (op === "delete") {
        await storage.deleteCard(id);
        succeeded++; continue;
      }

      if (runAutomation) {
        if (op === "move") await runStageEnterAutomations(updated, actor);
        else if (op === "assign") await dispatchCardEvent("assignee_changed", updated, actor);
        else if (op === "set_field") await dispatchCardEvent("field_updated", updated, actor, { changedFieldIds: [field.id] });
      }
      succeeded++;
    } catch (e: any) {
      failed.push({ cardId: id, reason: e?.message || "gagal" });
    }
  }

  sendSuccess(res, { processed: (cardIds as number[]).length, succeeded, failed });
});
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(bulk): POST /api/pipelines/:id/cards/bulk (per-card guards + partial success)"
```

---

### Task 4: Client hook `useBulkCardAction`

**Files:** Modify `client/hooks/usePipelines.ts`

- [ ] **Step 1: Add the hook**

```ts
export interface BulkResult { processed: number; succeeded: number; failed: { cardId: number; reason: string }[] }

export function useBulkCardAction(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { op: string; cardIds: number[]; payload?: any; runAutomation?: boolean; overwrite?: boolean }) =>
      api.post<BulkResult>(`/pipelines/${pipelineId}/cards/bulk`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipelines", "cards", pipelineId] }),
  });
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(bulk): useBulkCardAction hook"
```

---

### Task 5: Selection state + card/stage checkboxes

**Files:** Modify `client/pages/PipelineBoardPage.tsx` (selection state + select-mode + prune-on-filter + pass props); `client/components/pipelines/StageColumn.tsx` (checkbox per card + stage-header checkbox)

Read first: `PipelineBoardPage` `visible`/per-stage list (~80-96) + where `StageColumn` is rendered (~184); `StageColumn` props (~15-45) + the `cards.map` render (~243).

- [ ] **Step 1: Selection state in `PipelineBoardPage`**

Add:
```ts
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleCard = (id: number) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleMany = (ids: number[], on: boolean) => setSelectedIds((p) => { const n = new Set(p); ids.forEach((i) => on ? n.add(i) : n.delete(i)); return n; });
```
Prune selection to still-visible cards whenever the filtered set changes (avoid acting on hidden cards):
```ts
  useEffect(() => {
    const vis = new Set(visible.map((c) => c.id));
    setSelectedIds((p) => { const n = new Set([...p].filter((id) => vis.has(id))); return n.size === p.size ? p : n; });
  }, [visible]);
```
Add a "Pilih" toggle button in the board header that flips `selectMode` (and clears selection when leaving). Pass to each `StageColumn`: `selectMode`, `selectedIds`, `onToggleCard={toggleCard}`, `onToggleStage={(ids, on) => toggleMany(ids, on)}`.

- [ ] **Step 2: Checkboxes in `StageColumn`**

Extend props with `selectMode?: boolean; selectedIds?: Set<number>; onToggleCard?: (id: number) => void; onToggleStage?: (ids: number[], on: boolean) => void;`.
- Stage header: when `selectMode`, render a `Checkbox` whose checked = all of this stage's `cards` are selected; onChange → `onToggleStage(cards.map(c=>c.id), checked)`.
- In the `cards.map`, when `selectMode`, render a `Checkbox` overlay (top-left of the card) checked=`selectedIds?.has(c.id)`; and make the card's click call `onToggleCard(c.id)` instead of `onCardClick(c.id)` while in select mode:
```tsx
onCardClick={() => selectMode ? onToggleCard?.(c.id) : onCardClick(c.id)}
```
Use the shadcn `Checkbox` from `@/components/ui/checkbox`. Mobile-first: checkbox tap target ≥24px.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 4: Commit**

```bash
git add client/pages/PipelineBoardPage.tsx client/components/pipelines/StageColumn.tsx
git commit -m "feat(bulk): card/stage selection + select mode on the board"
```

---

### Task 6: Bulk action bar + op dialogs + result

**Files:** Create `client/components/pipelines/BulkActionBar.tsx`; Modify `client/pages/PipelineBoardPage.tsx` (render it)

- [ ] **Step 1: Create `BulkActionBar.tsx`**

A bar shown when `selectedIds.size > 0`. Props: `pipelineId, selectedIds, caps, stages, fields, users, onClear`. Reuses `useBulkCardAction`. Mobile-first: a `BottomSheet` for the op forms on small screens / inline popover on desktop; the bar itself is `sticky bottom-0` on mobile, floating on desktop.

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, UserCog, ArrowRightLeft, Pencil, Tag, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { BULK_MAX_CARDS } from "@shared/bulkCardOps";
import { useBulkCardAction, type BulkResult } from "@/hooks/usePipelines";

export function BulkActionBar({ pipelineId, selectedIds, caps, stages, fields, users, onClear }: {
  pipelineId: number; selectedIds: Set<number>;
  caps: string[]; stages: { id: number; label: string }[];
  fields: { id: number; label: string; type: string; config?: string | null; options?: string | null }[];
  users: { id: number; name?: string | null; username?: string }[];
  onClear: () => void;
}): JSX.Element | null {
  const bulk = useBulkCardAction(pipelineId);
  const [runAutomation, setRunAutomation] = useState(false);
  const [sheet, setSheet] = useState<null | "assign" | "move" | "set_field" | "tag" | "delete">(null);
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return null;
  const can = (c: string) => caps.length === 0 || caps.includes(c);
  const overCap = ids.length > BULK_MAX_CARDS;

  const run = (op: string, payload: any, overwrite?: boolean) =>
    bulk.mutate({ op, cardIds: ids, payload, runAutomation, overwrite }, {
      onSuccess: (r: BulkResult) => {
        toast[r.failed.length ? "warning" : "success"](
          `${r.succeeded} sukses${r.failed.length ? ` · ${r.failed.length} gagal: ${r.failed.slice(0,3).map(f=>f.reason).join(", ")}` : ""}`,
        );
        setSheet(null); onClear();
      },
      onError: (e: any) => toast.error(e?.message || "Bulk action gagal"),
    });

  return (
    <div className="fixed md:sticky bottom-0 inset-x-0 z-20 bg-sky-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap shadow-lg">
      <span className="text-sm font-semibold flex items-center gap-1.5"><Check className="size-4" />{ids.length} kartu dipilih{overCap && <em className="ml-2 text-amber-200">- maks {BULK_MAX_CARDS}</em>}</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        <label className="flex items-center gap-1 text-xs"><Switch checked={runAutomation} onCheckedChange={setRunAutomation} /><Zap className="size-3.5" /> Otomasi</label>
        {can("assign") && <Button size="sm" variant="secondary" className="h-8" disabled={overCap || bulk.isPending} onClick={() => setSheet("assign")}><UserCog className="size-3.5 mr-1" />Assign</Button>}
        {can("cards") && <Button size="sm" variant="secondary" className="h-8" disabled={overCap || bulk.isPending} onClick={() => setSheet("move")}><ArrowRightLeft className="size-3.5 mr-1" />Pindah</Button>}
        {can("cards") && <Button size="sm" variant="secondary" className="h-8" disabled={overCap || bulk.isPending} onClick={() => setSheet("set_field")}><Pencil className="size-3.5 mr-1" />Field</Button>}
        {can("cards") && <Button size="sm" variant="secondary" className="h-8" disabled={overCap || bulk.isPending} onClick={() => setSheet("tag")}><Tag className="size-3.5 mr-1" />Tag</Button>}
        {can("cards") && <Button size="sm" variant="secondary" className="h-8" disabled={overCap || bulk.isPending} onClick={() => setSheet("delete")}><Trash2 className="size-3.5 mr-1" />Hapus</Button>}
        <Button size="sm" variant="ghost" className="h-8 text-white hover:bg-white/15" onClick={onClear}><X className="size-3.5 mr-1" />Batal</Button>
      </div>
      {/* Op forms: render a small inline popover/sheet per `sheet` value. Each collects payload then calls run(). */}
      {sheet && <BulkOpForm sheet={sheet} stages={stages} fields={fields} users={users} pending={bulk.isPending} onCancel={() => setSheet(null)} onRun={run} />}
    </div>
  );
}
```

Add a `BulkOpForm` sub-component (same file) rendering, per `sheet`:
- `assign`: user `Combobox` (+ "Kosongkan/unassign" option = `assigneeId: null`) → `onRun("assign", { assigneeId })`.
- `move`: stage `Combobox` → `onRun("move", { stageId })`.
- `set_field`: field `Combobox` (edit-accessible - pass already-filtered `fields`) + a value input (text for now; reuse `FieldValueInput` if trivial) + "timpa nilai terisi" `Switch` (default on) → `onRun("set_field", { fieldId, value }, overwrite)`.
- `tag`: an `Input` for the tag + Add/Remove buttons → `onRun("add_tag"|"remove_tag", { tag })`.
- `delete`: confirm text + a destructive confirm button → `onRun("delete", undefined)`.
Render it as a `BottomSheet` on mobile (reuse the existing `BottomSheet` component) / a small absolute popover on desktop.

- [ ] **Step 2: Render it in `PipelineBoardPage`**

Below the board, when `selectMode`:
```tsx
{selectMode && (
  <BulkActionBar
    pipelineId={pid!}
    selectedIds={selectedIds}
    caps={caps}                 // the pipeline caps already loaded for this board
    stages={selfStages}         // the board's stages
    fields={fields}             // the board's fields
    users={assigneeOptions}     // already built for the assignee filter
    onClear={() => { setSelectedIds(new Set()); }}
  />
)}
```
(Use whatever the board already has for caps/stages/fields/users - adjust names to the actual locals; if `caps` isn't present on the board, derive from the pipeline query like the modal does.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/BulkActionBar.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(bulk): bulk action bar + per-op forms + result toast"
```

---

### Task 7: Final verification

**Files:** none

- [ ] **Step 1: Pure tests**

Run: `npx tsx --test shared/bulkCardOps.test.ts` → 4/4 PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Wiring grep**

```bash
grep -rn "cards/bulk\|useBulkCardAction\|BulkActionBar\|validateBulkRequest\|recordCardActivity" server/ client/ shared/ | grep -v node_modules | grep -v "\.test\."
```
Expected: endpoint + hook + bar + pure module + audit wrapper all present.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "chore(bulk): final verification fixes" || echo "nothing to commit"
```

---

## Manual acceptance (on dev)

1. Board → "Pilih" → tick cards across stages; stage-header checkbox selects a whole stage; count updates; change a filter → hidden cards drop out of selection.
2. **Assign** a batch to Staff A; another batch to Staff B → audit per card; board reflects.
3. **Pindah** 10 cards → a stage (Otomasi off) → moved, no rules; toggle Otomasi on → rules fire.
4. **Field** on 6 (overwrite off) → already-filled cards report "sudah terisi"; rest updated.
5. A user lacking access to 2 selected cards → result "X sukses · 2 gagal: tidak ditemukan/akses ditolak".
6. **Hapus** selected (with `cards` cap) → removed.
7. Select >200 → action buttons disabled + "maks 200" shown.
8. Mobile: action bar is a bottom bar; op forms open as a bottom sheet.
