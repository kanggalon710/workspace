# Pipeline Field-Type Registry + Board Search/Filter/Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-source-of-truth field-type registry for the pipelines engine, fix the create-field type picker so every type is always visible, enforce singleton field types, and wire board search/filter/sort over custom-field values.

**Architecture:** A new pure `shared/` module holds the registry + all decision helpers (imported by client and server, fully unit-tested). The create-field picker becomes an always-visible grouped list (no fuzzy search). The board's existing client-side filter pipeline is extended; one mitra-scoped backend tweak makes board cards carry the field values needed for search/filter/sort.

**Tech Stack:** TypeScript, React 18, TanStack Query, Drizzle ORM (MySQL), `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-07-pipeline-field-registry-board-controls-design.md`.

**Coding standards (apply to every task):** semantic HTML5 (`<fieldset>`/`<legend>`/`<label htmlFor>`/`<button type>`), DRY (one registry - no duplicated label/icon maps), component/SoC separation (UI thin, logic in the pure module), pure testable modules. Reuse design-system primitives (`Combobox`, `Input`, `Button`, `Switch`). See [[feedback-coding-standards]].

**Import-path conventions (this repo):**
- Client/React → alias: `import { ... } from "@shared/pipelineFieldTypes"`.
- Server → relative `.js`: `import { ... } from "../shared/pipelineFieldTypes.js"`.
- Tests (`node:test`) → relative `.js`: `import { ... } from "./pipelineFieldTypes.js"`.

---

## Task 1: Field-type registry + pure helpers (`shared/pipelineFieldTypes.ts`)

**Files:**
- Create: `shared/pipelineFieldTypes.ts`
- Test: `shared/pipelineFieldTypes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/pipelineFieldTypes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PIPELINE_FIELD_TYPE_REGISTRY,
  getFieldTypeMeta,
  allowMultiple,
  canAddType,
  searchableFieldIds,
  filterableFields,
  sortableFields,
  cardMatchesFilter,
  compareCardsByField,
} from "./pipelineFieldTypes.js";
import { PIPELINE_FIELD_TYPES } from "./schema.js";
import type { PipelineField } from "./schema.js";

// Minimal field factory (only the props the helpers read).
function f(over: Partial<PipelineField> & { id: number; type: string }): PipelineField {
  return {
    id: over.id, mitraId: 1, pipelineId: 1, key: `k${over.id}`,
    label: over.label ?? `F${over.id}`, type: over.type, options: over.options ?? null,
    required: 0, showOnCard: 0, position: over.position ?? 0,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null,
  } as PipelineField;
}

test("registry has an entry for every PipelineFieldType, and keys match meta.type", () => {
  for (const t of PIPELINE_FIELD_TYPES) {
    const meta = PIPELINE_FIELD_TYPE_REGISTRY[t];
    assert.ok(meta, `missing registry entry for ${t}`);
    assert.equal(meta.type, t);
    assert.ok(meta.label.length > 0, `empty label for ${t}`);
  }
  // No stray entries beyond the union.
  assert.equal(Object.keys(PIPELINE_FIELD_TYPE_REGISTRY).length, PIPELINE_FIELD_TYPES.length);
});

test("getFieldTypeMeta returns meta for known types, undefined otherwise", () => {
  assert.equal(getFieldTypeMeta("phone")?.label, "Telepon");
  assert.equal(getFieldTypeMeta("nope"), undefined);
});

test("allowMultiple is the inverse of singleton", () => {
  for (const t of PIPELINE_FIELD_TYPES) {
    assert.equal(allowMultiple(t), !PIPELINE_FIELD_TYPE_REGISTRY[t].singleton);
  }
});

test("canAddType: non-singleton always allowed, singleton blocks a second, unknown rejected", () => {
  assert.equal(canAddType([], "nonexistent"), false);
  for (const meta of Object.values(PIPELINE_FIELD_TYPE_REGISTRY)) {
    if (meta.singleton) {
      assert.equal(canAddType([], meta.type), true, `${meta.type} addable when none exist`);
      assert.equal(canAddType([{ type: meta.type }], meta.type), false, `${meta.type} blocked when one exists`);
    } else {
      assert.equal(canAddType([{ type: meta.type }], meta.type), true, `${meta.type} dup allowed`);
    }
  }
});

test("searchable/filterable/sortable selectors pick the right fields", () => {
  const fields = [f({ id: 1, type: "text" }), f({ id: 2, type: "checkbox" }), f({ id: 3, type: "dropdown" })];
  assert.deepEqual(searchableFieldIds(fields), [1, 3]);            // text+dropdown searchable, checkbox not
  assert.deepEqual(filterableFields(fields).map((x) => x.id), [2, 3]); // checkbox+dropdown filterable
  assert.deepEqual(sortableFields(fields).map((x) => x.id), [1, 2, 3]); // text+checkbox+dropdown sortable
});

test("cardMatchesFilter: equality for scalars, membership for multiselect, empty filter passes", () => {
  const drop = f({ id: 3, type: "dropdown" });
  assert.equal(cardMatchesFilter({ 3: "A" }, drop, ""), true);   // empty filter => no constraint
  assert.equal(cardMatchesFilter({ 3: "A" }, drop, "A"), true);
  assert.equal(cardMatchesFilter({ 3: "B" }, drop, "A"), false);
  assert.equal(cardMatchesFilter(undefined, drop, "A"), false);
  const multi = f({ id: 4, type: "multiselect" });
  assert.equal(cardMatchesFilter({ 4: JSON.stringify(["X", "Y"]) }, multi, "Y"), true);
  assert.equal(cardMatchesFilter({ 4: JSON.stringify(["X"]) }, multi, "Y"), false);
  assert.equal(cardMatchesFilter({ 4: "not json" }, multi, "Y"), false);
});

test("compareCardsByField: numeric, date, text; direction; empties last", () => {
  const num = f({ id: 1, type: "number" });
  assert.ok(compareCardsByField({ 1: "2" }, { 1: "10" }, num, "asc") < 0);   // numeric, not lexical
  assert.ok(compareCardsByField({ 1: "2" }, { 1: "10" }, num, "desc") > 0);
  const date = f({ id: 2, type: "date" });
  assert.ok(compareCardsByField({ 2: "2026-01-01" }, { 2: "2026-02-01" }, date, "asc") < 0);
  const text = f({ id: 3, type: "text" });
  assert.ok(compareCardsByField({ 3: "apel" }, { 3: "zebra" }, text, "asc") < 0);
  // empties sort last regardless of direction
  assert.ok(compareCardsByField({ 1: "" }, { 1: "5" }, num, "asc") > 0);
  assert.ok(compareCardsByField({ 1: "" }, { 1: "5" }, num, "desc") > 0);
  assert.equal(compareCardsByField({ 1: "" }, { 1: "" }, num, "asc"), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/pipelineFieldTypes.test.ts`
Expected: FAIL - `Cannot find module './pipelineFieldTypes.js'`.

- [ ] **Step 3: Write the registry module**

Create `shared/pipelineFieldTypes.ts`:

```ts
/** Single source of truth for pipeline custom field-type metadata + pure decision helpers.
 *  No React, no DB - imported by client (picker, board) and server (validation, singleton guard). */
import type { PipelineFieldType, PipelineField } from "./schema.js";

export interface FieldTypeMeta {
  type: PipelineFieldType;
  label: string;        // Indonesian label shown in UI
  description: string;  // one-line helper text in the type picker
  group: "basic" | "choice" | "people" | "special";
  hasOptions: boolean;  // dropdown/multiselect need an options[] list
  singleton: boolean;   // max 1 field of this type per pipeline (#7)
  searchable: boolean;  // value participates in board search
  filterable: boolean;  // can be selected as a board filter
  sortable: boolean;    // can be selected as a board sort key
}

export const PIPELINE_FIELD_TYPE_REGISTRY: Record<PipelineFieldType, FieldTypeMeta> = {
  text:        { type: "text",        label: "Teks",           description: "Teks satu baris",            group: "basic",   hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: true  },
  textarea:    { type: "textarea",    label: "Teks Panjang",   description: "Teks beberapa baris",        group: "basic",   hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: false },
  number:      { type: "number",      label: "Angka",          description: "Nilai numerik",              group: "basic",   hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: true  },
  currency:    { type: "currency",    label: "Mata Uang (Rp)", description: "Nominal rupiah",             group: "basic",   hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: true  },
  date:        { type: "date",        label: "Tanggal",        description: "Tanggal kalender",           group: "basic",   hasOptions: false, singleton: false, searchable: false, filterable: false, sortable: true  },
  dropdown:    { type: "dropdown",    label: "Dropdown",       description: "Pilih satu dari daftar",     group: "choice",  hasOptions: true,  singleton: false, searchable: true,  filterable: true,  sortable: true  },
  multiselect: { type: "multiselect", label: "Multi-pilih",    description: "Pilih beberapa dari daftar", group: "choice",  hasOptions: true,  singleton: false, searchable: true,  filterable: true,  sortable: false },
  checkbox:    { type: "checkbox",    label: "Checkbox",       description: "Ya / Tidak",                 group: "choice",  hasOptions: false, singleton: false, searchable: false, filterable: true,  sortable: true  },
  user:        { type: "user",        label: "User",           description: "Pilih satu pengguna",        group: "people",  hasOptions: false, singleton: false, searchable: true,  filterable: true,  sortable: false },
  phone:       { type: "phone",       label: "Telepon",        description: "Nomor telepon",              group: "special", hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: false },
  url:         { type: "url",         label: "URL",            description: "Tautan web",                 group: "special", hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: false },
};
// NOTE: date.filterable=false on purpose - the board's existing date-range control covers date filtering,
// so date is not offered again in the generic field filter. Slice D's Coordinate will be the first singleton:true.

export function getFieldTypeMeta(type: string): FieldTypeMeta | undefined {
  return (PIPELINE_FIELD_TYPE_REGISTRY as Record<string, FieldTypeMeta>)[type];
}

/** PRD redundancy collapsed: allowMultiple is just the inverse of singleton. */
export function allowMultiple(type: PipelineFieldType): boolean {
  return !PIPELINE_FIELD_TYPE_REGISTRY[type].singleton;
}

/** False when `type` is unknown, or is singleton and a field of that type already exists. */
export function canAddType(existingFields: Pick<PipelineField, "type">[], type: string): boolean {
  const meta = getFieldTypeMeta(type);
  if (!meta) return false;
  if (!meta.singleton) return true;
  return !existingFields.some((field) => field.type === type);
}

export function searchableFieldIds(fields: PipelineField[]): number[] {
  return fields.filter((field) => getFieldTypeMeta(field.type)?.searchable).map((field) => field.id);
}

export function filterableFields(fields: PipelineField[]): PipelineField[] {
  return fields.filter((field) => getFieldTypeMeta(field.type)?.filterable);
}

export function sortableFields(fields: PipelineField[]): PipelineField[] {
  return fields.filter((field) => getFieldTypeMeta(field.type)?.sortable);
}

/** Does a card's stored values satisfy a single field filter? Empty filterValue = no constraint. */
export function cardMatchesFilter(
  values: Record<number, string> | undefined,
  field: PipelineField,
  filterValue: string,
): boolean {
  if (filterValue === "") return true;
  const raw = values?.[field.id] ?? "";
  if (field.type === "multiselect") {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.map(String).includes(filterValue);
    } catch {
      return false;
    }
  }
  return raw === filterValue;
}

/** Type-aware comparator for sorting cards by a field value. Empty values always sort last. */
export function compareCardsByField(
  a: Record<number, string> | undefined,
  b: Record<number, string> | undefined,
  field: PipelineField,
  dir: "asc" | "desc",
): number {
  const av = a?.[field.id] ?? "";
  const bv = b?.[field.id] ?? "";
  if (av === "" && bv === "") return 0;
  if (av === "") return 1;
  if (bv === "") return -1;
  let cmp: number;
  if (field.type === "number" || field.type === "currency") {
    cmp = Number(av) - Number(bv);
  } else if (field.type === "date") {
    cmp = Date.parse(av) - Date.parse(bv);
  } else {
    cmp = av.localeCompare(bv, "id", { numeric: true });
  }
  return dir === "desc" ? -cmp : cmp;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/pipelineFieldTypes.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add shared/pipelineFieldTypes.ts shared/pipelineFieldTypes.test.ts
git commit -m "feat(pipelines): field-type registry + pure board search/filter/sort helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Singleton enforcement - server backstop (#7)

**Files:**
- Modify: `server/routes.ts:4654-4660` (POST create-field handler)

- [ ] **Step 1: Add the singleton guard to the create-field route**

In `server/routes.ts`, add the registry import next to the existing shared import (near line 24, after the `../shared/schema.js` import block):

```ts
import { canAddType, getFieldTypeMeta } from "../shared/pipelineFieldTypes.js";
```

Replace the handler body at `server/routes.ts:4654-4660`:

```ts
  router.post("/api/pipelines/:id/fields", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    const { label, type, options, required, showOnCard } = req.body ?? {};
    if (!label || !type) return sendError(res, "label & type wajib diisi", 400);
    const meta = getFieldTypeMeta(String(type));
    if (!meta) return sendError(res, "Tipe field tidak dikenal", 400);
    const existing = await storage.listFields(Number(req.params.id));
    if (!canAddType(existing, String(type))) {
      return sendError(res, `Tipe ${meta.label} hanya boleh 1 per pipeline`, 400);
    }
    sendSuccess(res, await storage.createField(Number(req.params.id), { label, type, options, required, showOnCard }));
  });
```

(`storage.listFields(pipelineId)` is the existing mitra-scoped field reader used elsewhere in this file; `canAddType` is the helper from Task 1.)

- [ ] **Step 2: Verify the project still typechecks**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Manual sanity (no automated server test infra here)**

Confirm by reading: the handler now returns 400 with `"Tipe <label> hanya boleh 1 per pipeline"` only when `type` is singleton AND already present. With all current types `singleton:false`, behavior is unchanged today; the guard activates when Slice D adds Coordinate (`singleton:true`).

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): reject duplicate singleton field type on create (400)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Board cards carry search/filter/sort values (`getBoardCardValues`)

**Files:**
- Modify: `server/storage.ts` (add `getBoardCardValues` after `getShowOnCardValues` at ~line 2170)
- Modify: `server/routes.ts:4503-4511` (board cards route)

- [ ] **Step 1: Add `getBoardCardValues` to storage**

In `server/storage.ts`, add this method immediately after `getShowOnCardValues` (which ends ~line 2170). It returns values for the union of board-relevant fields (showOnCard ∪ searchable ∪ filterable ∪ sortable), mitra-scoped and batched exactly like its sibling:

```ts
  /** Values for fields the board needs: shown-on-card OR searchable/filterable/sortable.
   *  Same shape as getShowOnCardValues: { [cardId]: { [fieldId]: value } }. */
  async getBoardCardValues(pipelineId: number): Promise<Record<number, Record<number, string>>> {
    const mitraId = getMitraId();
    const fields = await this.db.select().from(pipelineFields)
      .where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId)));
    const fieldIds = fields
      .filter((f) => {
        const meta = getFieldTypeMeta(f.type);
        return f.showOnCard === 1 || (meta && (meta.searchable || meta.filterable || meta.sortable));
      })
      .map((f) => f.id);
    if (fieldIds.length === 0) return {};
    const rows = await this.db.select().from(pipelineCardValues)
      .where(and(eq(pipelineCardValues.mitraId, mitraId), inArray(pipelineCardValues.fieldId, fieldIds)));
    const out: Record<number, Record<number, string>> = {};
    for (const r of rows) { (out[r.cardId] ??= {})[r.fieldId] = r.value ?? ""; }
    return out;
  }
```

Add the registry import near the top of `server/storage.ts` (next to the `../shared/schema.js` import at line 125):

```ts
import { getFieldTypeMeta } from "../shared/pipelineFieldTypes.js";
```

- [ ] **Step 2: Point the board cards route at the new method**

In `server/routes.ts:4509`, change the values source from `getShowOnCardValues` to `getBoardCardValues`:

```ts
  router.get("/api/pipelines/:id/cards", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineView(req, res, Number(req.params.id)))) return;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const assigneeId = req.query.assignee ? Number(req.query.assignee) : undefined;
    const cards = await storage.listCards(Number(req.params.id), { q, assigneeId });
    const valuesByCard = await storage.getBoardCardValues(Number(req.params.id));
    sendSuccess(res, cards.map((c) => ({ ...c, values: valuesByCard[c.id] ?? {} })));
  });
```

(`getShowOnCardValues` stays in storage - it may still be used elsewhere; leave it.)

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds (Vite client + esbuild server bundle).

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts server/routes.ts
git commit -m "feat(pipelines): board cards include searchable/filterable/sortable field values

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Always-visible type picker (#3) + DRY labels (`FieldTypePicker`)

**Files:**
- Create: `client/components/pipelines/FieldTypePicker.tsx`
- Modify: `client/components/pipelines/ManageFieldsDialog.tsx`

- [ ] **Step 1: Create the `FieldTypePicker` component**

Create `client/components/pipelines/FieldTypePicker.tsx` (semantic `<fieldset>`/`<button type="button">`, registry-driven, singleton-aware). It also exports the client-side icon map (the registry stays React-free, so icons live here):

```tsx
import { PIPELINE_FIELD_TYPE_REGISTRY, canAddType, type FieldTypeMeta } from "@shared/pipelineFieldTypes";
import type { PipelineField, PipelineFieldType } from "@shared/schema";
import { cn } from "@/lib/utils";

/** Glyphs per field type (registry is React-free, so icons are defined here and reused by callers). */
export const FIELD_TYPE_ICONS: Record<string, string> = {
  text: "T", textarea: "¶", number: "#", currency: "Rp", date: "",
  dropdown: "▾", multiselect: "", checkbox: "✓", user: "", phone: "", url: "",
};

const GROUP_LABELS: Record<FieldTypeMeta["group"], string> = {
  basic: "Dasar", choice: "Pilihan", people: "Orang", special: "Khusus",
};
const GROUP_ORDER: FieldTypeMeta["group"][] = ["basic", "choice", "people", "special"];

export function FieldTypePicker({
  value,
  onChange,
  existingFields,
}: {
  value: string;
  onChange: (type: PipelineFieldType) => void;
  existingFields: Pick<PipelineField, "type">[];
}) {
  const groups = GROUP_ORDER
    .map((group) => ({
      group,
      metas: Object.values(PIPELINE_FIELD_TYPE_REGISTRY).filter((m) => m.group === group),
    }))
    .filter((g) => g.metas.length > 0);

  return (
    <fieldset className="space-y-3 border-0 p-0 m-0">
      <legend className="sr-only">Tipe field</legend>
      {groups.map(({ group, metas }) => (
        <div key={group}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            {GROUP_LABELS[group]}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {metas.map((meta) => {
              const allowed = canAddType(existingFields, meta.type);
              const selected = value === meta.type;
              return (
                <button
                  key={meta.type}
                  type="button"
                  disabled={!allowed}
                  aria-pressed={selected}
                  onClick={() => onChange(meta.type)}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/60 hover:border-border hover:bg-muted/40",
                    !allowed && "opacity-50 cursor-not-allowed hover:bg-transparent hover:border-border/60",
                  )}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/8 text-[10px] font-bold text-primary">
                    {FIELD_TYPE_ICONS[meta.type] ?? meta.type.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-tight truncate">{meta.label}</span>
                    <span className="block text-[10px] text-muted-foreground leading-tight">
                      {allowed ? meta.description : "Sudah ada - hanya boleh 1 per pipeline"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
```

- [ ] **Step 2: Integrate into `ManageFieldsDialog` and remove the duplicated maps**

Edit `client/components/pipelines/ManageFieldsDialog.tsx`:

(a) Replace the imports block at the top. Remove the `Combobox` import and the `PIPELINE_FIELD_TYPES` import; add the registry + picker:

```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField, FormRow, FormSection } from "@/components/ui/form-field";
import { useFields, usePipelineMutations } from "@/hooks/usePipelines";
import { getFieldTypeMeta } from "@shared/pipelineFieldTypes";
import { FieldTypePicker, FIELD_TYPE_ICONS } from "@/components/pipelines/FieldTypePicker";
import type { PipelineFieldType } from "@shared/schema";
import { Trash2, Plus, GripVertical, Settings2 } from "lucide-react";
import { toast } from "sonner";
```

(b) Delete the local `TYPE_LABELS` (lines 13-25) and `TYPE_ICONS` (lines 27-39) constants entirely.

(c) Change `needsOptions` (line 59) to read from the registry:

```tsx
  const needsOptions = getFieldTypeMeta(type)?.hasOptions ?? false;
```

(d) In the existing-fields list, replace the icon lookup (line 170) and label lookup (line 180):

```tsx
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/8 text-[10px] font-bold text-primary">
                        {FIELD_TYPE_ICONS[f.type] ?? f.type.slice(0, 2).toUpperCase()}
                      </div>
```

```tsx
                          <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                            {getFieldTypeMeta(f.type)?.label ?? f.type}
                          </span>
```

(e) Replace the type picker. Change the `FormRow cols={2}` block (lines 228-257) so the name field is on its own row and the picker is full-width below it:

```tsx
              <FormField label="Nama Field" htmlFor="field-label" required>
                <Input
                  id="field-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="mis. Estimasi Biaya"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      add();
                    }
                  }}
                />
              </FormField>

              <FormField label="Tipe Data" htmlFor="field-type">
                <FieldTypePicker
                  value={type}
                  onChange={(t: PipelineFieldType) => setType(t)}
                  existingFields={fields ?? []}
                />
              </FormField>
```

(Leave the options `FormField`, the toggles block, and the "Tambah Field" button unchanged below this - `needsOptions` already gates the options input.)

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/FieldTypePicker.tsx client/components/pipelines/ManageFieldsDialog.tsx
git commit -m "feat(pipelines): always-visible grouped type picker (fixes phone-in-picker), DRY labels via registry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Board search across field values + filter + sort

**Files:**
- Modify: `client/components/pipelines/BoardFilters.tsx`
- Modify: `client/pages/PipelineBoardPage.tsx`

- [ ] **Step 1: Extend `BoardFilters` with filter + sort controls**

Edit `client/components/pipelines/BoardFilters.tsx`.

(a) Update imports and add the field-value control:

```tsx
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { DateRange } from "./boardCardMeta";
import { filterableFields, sortableFields } from "@shared/pipelineFieldTypes";
import type { PipelineField } from "@shared/schema";
```

(b) Extend the prop list (add to the existing destructured props and type):

```tsx
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
  fields = [],
  filterFieldId = null,
  onFilterField,
  filterValue = "",
  onFilterValue,
  sortFieldId = null,
  onSortField,
  sortDir = "asc",
  onSortDirToggle,
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
  fields?: PipelineField[];
  filterFieldId?: number | null;
  onFilterField?: (id: number | null) => void;
  filterValue?: string;
  onFilterValue?: (v: string) => void;
  sortFieldId?: number | null;
  onSortField?: (id: number | null) => void;
  sortDir?: "asc" | "desc";
  onSortDirToggle?: () => void;
  visibleCount?: number;
  onReset?: () => void;
}) {
  const preset = typeof range === "string" ? range : "custom";
  const custom = typeof range === "object" ? range : { from: "", to: "" };
  const filterable = filterableFields(fields);
  const sortable = sortableFields(fields);
  const filterField = filterFieldId == null ? undefined : fields.find((f) => f.id === filterFieldId);
  const anyActive =
    search !== "" || preset !== "all" || assigneeId != null || filterFieldId != null || sortFieldId != null;
```

(c) Inside the "Row 2 - filters" `<div className="flex items-center gap-2 flex-wrap">`, after the assignee `Combobox` block (line 88-97) and before the `preset === "custom"` block, add the filter + sort controls:

```tsx
        {filterable.length > 0 && onFilterField && (
          <>
            <Combobox
              options={filterable.map((f) => ({ value: String(f.id), label: f.label }))}
              value={filterFieldId == null ? "" : String(filterFieldId)}
              onChange={(v) => { onFilterField(v ? Number(v) : null); onFilterValue?.(""); }}
              placeholder="Filter field…"
              searchPlaceholder="Cari field…"
              size="sm"
            />
            {filterField && onFilterValue && (
              <FieldFilterValue
                field={filterField}
                value={filterValue}
                onChange={onFilterValue}
                userOptions={assigneeOptions}
              />
            )}
          </>
        )}
        {sortable.length > 0 && onSortField && (
          <div className="flex items-center gap-1">
            <Combobox
              options={sortable.map((f) => ({ value: String(f.id), label: f.label }))}
              value={sortFieldId == null ? "" : String(sortFieldId)}
              onChange={(v) => onSortField(v ? Number(v) : null)}
              placeholder="Urutkan…"
              searchPlaceholder="Cari field…"
              size="sm"
            />
            {sortFieldId != null && onSortDirToggle && (
              <button
                type="button"
                onClick={onSortDirToggle}
                aria-label={sortDir === "asc" ? "Urut naik" : "Urut turun"}
                className="flex size-8 items-center justify-center rounded-md border border-input hover:bg-muted/40"
              >
                {sortDir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
              </button>
            )}
          </div>
        )}
```

(d) Add the `FieldFilterValue` sub-component at the bottom of the file (SoC - type-aware value input):

```tsx
function FieldFilterValue({
  field,
  value,
  onChange,
  userOptions,
}: {
  field: PipelineField;
  value: string;
  onChange: (v: string) => void;
  userOptions?: ComboboxOption[];
}) {
  if (field.type === "checkbox") {
    return (
      <Combobox
        size="sm"
        options={[{ value: "1", label: "Ya" }, { value: "0", label: "Tidak" }]}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        placeholder="Nilai"
      />
    );
  }
  if (field.type === "user") {
    return (
      <Combobox
        size="sm"
        options={userOptions ?? []}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        placeholder="Pilih user"
        searchPlaceholder="Cari user…"
      />
    );
  }
  if (field.type === "dropdown" || field.type === "multiselect") {
    let opts: string[] = [];
    try { opts = field.options ? (JSON.parse(field.options) as string[]) : []; } catch { opts = []; }
    return (
      <Combobox
        size="sm"
        options={opts.map((o) => ({ value: o, label: o }))}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        placeholder="Pilih nilai"
        searchPlaceholder="Cari…"
      />
    );
  }
  return (
    <Input
      inputSize="sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Nilai"
      className="w-40"
    />
  );
}
```

- [ ] **Step 2: Wire search/filter/sort state into `PipelineBoardPage`**

Edit `client/pages/PipelineBoardPage.tsx`.

(a) Add imports (near the existing `BoardFilters` import at line 11 and the `inDateRange` import):

```tsx
import { searchableFieldIds, cardMatchesFilter, compareCardsByField } from "@shared/pipelineFieldTypes";
```

(b) Add filter/sort state next to the existing filter state (after line 51, `const [range, setRange] = ...`):

```tsx
  const [filterFieldId, setFilterFieldId] = useState<number | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [sortFieldId, setSortFieldId] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
```

(c) Replace the `visible` computation (lines 60-69) with field-aware search + filter:

```tsx
  const fields = pipeline?.fields ?? [];
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const searchIds = useMemo(() => searchableFieldIds(fields), [fields]);
  const q = search.toLowerCase();
  const filterField = filterFieldId == null ? undefined : fieldById.get(filterFieldId);
  const visible = (cards ?? []).filter((c) => {
    const matchesSearch =
      q === "" ||
      c.title.toLowerCase().includes(q) ||
      searchIds.some((fid) => (c.values?.[fid] ?? "").toLowerCase().includes(q));
    const matchesAssignee = assigneeId == null || c.assigneeId === assigneeId;
    const matchesDate = inDateRange(
      dateField === "created" ? c.createdAt : (c.updatedAt ?? null),
      range,
      now,
    );
    const matchesFilter = !filterField || cardMatchesFilter(c.values, filterField, filterValue);
    return matchesSearch && matchesAssignee && matchesDate && matchesFilter;
  });
```

(Ensure `useMemo` is imported from `react` - it is already used at line 33.)

(d) Add a sort helper for per-stage cards (after the `visible` block):

```tsx
  const sortField = sortFieldId == null ? undefined : fieldById.get(sortFieldId);
  const cardsForStage = (stageId: number) => {
    const list = visible.filter((c) => c.stageId === stageId);
    if (!sortField) return list;
    return [...list].sort((a, b) => compareCardsByField(a.values, b.values, sortField, sortDir));
  };
```

(e) Update the `BoardFilters` usage (line 121) to pass the new props and extend reset:

```tsx
        <div className="mt-2"><BoardFilters search={search} onSearch={setSearch} dateField={dateField} onDateField={setDateField} range={range} onRange={setRange} assigneeId={assigneeId} onAssignee={setAssigneeId} assigneeOptions={assigneeOptions} fields={fields} filterFieldId={filterFieldId} onFilterField={setFilterFieldId} filterValue={filterValue} onFilterValue={setFilterValue} sortFieldId={sortFieldId} onSortField={setSortFieldId} sortDir={sortDir} onSortDirToggle={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} visibleCount={visible.length} onReset={() => { setSearch(""); setRange("all"); setAssigneeId(null); setFilterFieldId(null); setFilterValue(""); setSortFieldId(null); setSortDir("asc"); }} /></div>
```

(f) Update the `StageColumn` `cards` prop (line 129) to use the sorter:

```tsx
              cards={cardsForStage(stage.id)}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/BoardFilters.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): board search over field values + field filter + view-only sort

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the pure helper tests**

Run: `npx tsx --test shared/pipelineFieldTypes.test.ts`
Expected: all tests PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Vite client + esbuild server bundle succeed.

- [ ] **Step 4: Manual checklist (record results)**

Against the dev "Leads (Marketing)" pipeline (has phone/dropdown/number/date fields):
- Open a board → **Field** → "Tambah Field Baru": every type, including **Telepon**, is visible immediately with no search box.  (#3)
- Board search box: typing a phone number / a dropdown value surfaces matching cards (not just title matches).  (#8 searchable)
- "Filter field…" → pick a dropdown field → pick a value → only matching cards remain; switching field resets the value; Reset clears it.  (#8 filterable)
- "Urutkan…" → pick a number/date field → cards in each stage reorder; ▲/▼ flips direction; clearing sort restores manual order; drag-reorder still persists.  (#8 sortable)
- (#7 singleton mechanism ships but has no current singleton type - verified by unit test; first real use is Slice D Coordinate.)

- [ ] **Step 5: Final commit (only if the manual pass required any fixup; otherwise skip)**

```bash
git add -A
git commit -m "chore(pipelines): slice A verification fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (author)

- **Spec coverage:** #3 → Task 4 (always-visible picker). #7 → Task 2 (server) + Task 4 (client disable). #8 registry → Task 1; `singleton` → Tasks 2/4; `searchable`/`filterable`/`sortable` → Tasks 1/3/5. No DB migration (metadata is code-side). Multi-tenant/RBAC unchanged (Task 3 `getBoardCardValues` is mitra-scoped; routes keep existing guards).
- **Type consistency:** helper names/signatures (`canAddType`, `getFieldTypeMeta`, `searchableFieldIds`, `filterableFields`, `sortableFields`, `cardMatchesFilter`, `compareCardsByField`, `FIELD_TYPE_ICONS`) are used identically across tasks. `PipelineCardWithValues.values` (`Record<number,string>`) matches helper signatures.
- **date.filterable=false** is intentional (existing range control); documented in the registry.
- **Known minor:** board search substring-matches a multiselect value's raw JSON string - still finds option text; acceptable per spec.
