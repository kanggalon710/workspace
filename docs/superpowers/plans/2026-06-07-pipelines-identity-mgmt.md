# Pipelines Identity & Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Combobox "select-both" bug, give pipelines an identity (Lucide icon + description in a responsive header), and add pipeline management (edit, archive, permanent cascade-delete).

**Architecture:** Mostly frontend (icon system, settings dialog, header + list redesign) on top of existing `updatePipeline`/`archivePipeline`; one new backend cascade `deletePipeline` + `DELETE` route; a 1-line Combobox fix. Pure `resolvePipelineIcon` (TDD).

**Tech Stack:** Node/Express + Drizzle MySQL; React 18 + TS + Vite; lucide-react; tests via `node:test` (`npx tsx --test`).

**Base branch:** `feat/pipelines-identity-mgmt` (off `dev`, includes board-UX). Spec: `docs/superpowers/specs/2026-06-07-pipelines-identity-mgmt-design.md`.

**Verification:** `npm run typecheck` (0) · `npx tsx --test client/components/pipelines/pipelineIcon.test.ts` (pass) · `npm run build`.

---

### Task 1: Combobox select-both fix (+ stable row keys)

**Files:** Modify `client/components/ui/combobox.tsx`, `client/components/pipelines/RuleActionEditor.tsx`, `client/components/pipelines/ConditionsBuilder.tsx`

- [ ] **Step 1: Fix the cmdk item value (the real bug)**

In `client/components/ui/combobox.tsx`, the `CommandItem` (~line 142-144) currently:
```tsx
                    value={`${option.label} ${option.description || ""}`}
```
Change to append the unique option value so duplicate-labeled options are distinct to cmdk:
```tsx
                    value={`${option.label} ${option.description || ""} ${option.value}`}
```
(Leave `key={option.value}` and `isSelected = option.value === value` as-is - they're correct.)

- [ ] **Step 2: Stable keys for field-map + condition rows (defensive)**

In `client/components/pipelines/RuleActionEditor.tsx`, the field-map rows render with `key={i}` (index). Change that map's row key to a composite stable-ish key:
```tsx
            <div key={`map-${i}-${row.sourceFieldId}-${row.targetFieldId}`} className="flex items-center gap-1">
```
In `client/components/pipelines/ConditionsBuilder.tsx`, the inner condition-row map uses `key={ri}`. Change to:
```tsx
              <div key={`cond-${gi}-${ri}-${row.fieldId}`} className="flex items-center gap-1">
```
(Find the exact lines by reading the files; only the inner row keys change.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors, build green.

- [ ] **Step 4: Commit**

```bash
git add client/components/ui/combobox.tsx client/components/pipelines/RuleActionEditor.tsx client/components/pipelines/ConditionsBuilder.tsx
git commit -m "fix(ui): Combobox unique cmdk value (duplicate-label select-both) + stable rule row keys (pipelines-mgmt)"
```

---

### Task 2: Backend - cascade delete + isArchived patch + client mutations

**Files:** Modify `server/storage.ts`, `server/routes.ts`, `client/hooks/usePipelines.ts`

- [ ] **Step 1: `storage.deletePipeline` (mitra-scoped cascade)**

Confirm the pipeline child-table symbols are imported in `server/storage.ts` (grep the import: `pipelineCards`, `pipelineCardComments`, `pipelineCardActivity`, `pipelineCardValues`, `pipelineCardFollowers`, `pipelineRules`, `pipelineRuleActions`, `pipelineRuleFires`, `pipelineRuleFieldMaps`, `pipelineFields`, `pipelineAccess`, `pipelineStages`, `pipelines`; `inArray`, `and`, `eq`). Add any missing to the existing schema import. Then add after `archivePipeline` (~line 1786):
```ts
  async deletePipeline(id: number): Promise<void> {
    const mitraId = getMitraId();
    const cardRows = await this.db.select({ id: pipelineCards.id }).from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.pipelineId, id)));
    const cardIds = cardRows.map((c) => c.id);
    if (cardIds.length) {
      await this.db.delete(pipelineCardComments).where(and(eq(pipelineCardComments.mitraId, mitraId), inArray(pipelineCardComments.cardId, cardIds)));
      await this.db.delete(pipelineCardActivity).where(and(eq(pipelineCardActivity.mitraId, mitraId), inArray(pipelineCardActivity.cardId, cardIds)));
      await this.db.delete(pipelineCardValues).where(and(eq(pipelineCardValues.mitraId, mitraId), inArray(pipelineCardValues.cardId, cardIds)));
      await this.db.delete(pipelineCardFollowers).where(and(eq(pipelineCardFollowers.mitraId, mitraId), inArray(pipelineCardFollowers.cardId, cardIds)));
    }
    await this.db.delete(pipelineCards).where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.pipelineId, id)));

    const ruleRows = await this.db.select({ id: pipelineRules.id }).from(pipelineRules)
      .where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, id)));
    const ruleIds = ruleRows.map((r) => r.id);
    if (ruleIds.length) {
      await this.db.delete(pipelineRuleFieldMaps).where(and(eq(pipelineRuleFieldMaps.mitraId, mitraId), inArray(pipelineRuleFieldMaps.ruleId, ruleIds)));
      await this.db.delete(pipelineRuleFires).where(and(eq(pipelineRuleFires.mitraId, mitraId), inArray(pipelineRuleFires.ruleId, ruleIds)));
      await this.db.delete(pipelineRuleActions).where(and(eq(pipelineRuleActions.mitraId, mitraId), inArray(pipelineRuleActions.ruleId, ruleIds)));
    }
    await this.db.delete(pipelineRules).where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, id)));
    await this.db.delete(pipelineFields).where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, id)));
    await this.db.delete(pipelineAccess).where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, id)));
    await this.db.delete(pipelineStages).where(and(eq(pipelineStages.mitraId, mitraId), eq(pipelineStages.pipelineId, id)));
    await this.db.delete(pipelines).where(and(eq(pipelines.mitraId, mitraId), eq(pipelines.id, id)));
  }
```
Verify each child table's foreign-key column name matches (`cardId` on card-children; `ruleId` on rule-children; `pipelineId` on pipeline-children) by reading their table defs in `shared/schema.ts`; adjust if any differs.

- [ ] **Step 2: `updatePipeline` accepts `isArchived` (for restore)**

In `storage.updatePipeline`'s `data` type add `isArchived?: number;` and in the patch builder add:
```ts
    if (data.isArchived !== undefined) patch.isArchived = data.isArchived;
```

- [ ] **Step 3: Routes - `DELETE` + PATCH `isArchived`**

In `server/routes.ts`, the PATCH `/api/pipelines/:id` destructures `{ name, description, color, icon }` - add `isArchived`:
```ts
    const { name, description, color, icon, isArchived } = req.body ?? {};
    ... await storage.updatePipeline(Number(req.params.id), { name, description, color, icon, isArchived }, req.authUser!.id);
```
Add a DELETE route near the archive route (~line 4436). For the creator-or-admin guard, FIRST grep how the codebase detects a System-Admin in routes (e.g. `req.authUser!.role`, an `isSuperAdmin`/effective-role helper) and use that pattern:
```ts
  router.delete("/api/pipelines/:id", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    const pid = Number(req.params.id);
    const pipe = (await storage.listPipelines(true)).find((p) => p.id === pid);
    if (!pipe) return sendError(res, "Pipeline tidak ditemukan", 404);
    const isAdmin = <the codebase's System-Admin check for req.authUser>;
    if (pipe.createdBy !== req.authUser!.id && !isAdmin) {
      return sendError(res, "Hanya pembuat atau admin yang bisa menghapus pipeline permanen", 403);
    }
    await storage.deletePipeline(pid);
    sendSuccess(res, { ok: true });
  });
```
(`listPipelines(true)` includes archived - confirm the method name/arg from `storage`; if different, use the existing "get one pipeline" accessor. `requirePipelineEdit` already 403s non-editors.)

- [ ] **Step 4: Client mutations (`usePipelines.ts`)**

In `usePipelineMutations`, add (mirroring the existing `delete`/`updatePipeline` mutations):
```ts
    deletePipeline: useMutation({ mutationFn: (id: number) => api.delete(`/pipelines/${id}`), onSuccess: invalidate }),
```
The existing `updatePipeline` mutation already spreads the body (`({ id, ...b }) => api.patch(...)`), so passing `{ id, isArchived: 0 }` works for restore - no change needed there.

- [ ] **Step 5: Typecheck + build + commit**

Run: `npm run typecheck && npm run build` → 0 errors, green.
```bash
git add server/storage.ts server/routes.ts client/hooks/usePipelines.ts
git commit -m "feat(pipelines): cascade deletePipeline + DELETE route (creator/admin) + updatePipeline isArchived + client mutation (pipelines-mgmt)"
```

---

### Task 3: Icon system - `pipelineIcon.tsx` (+ TDD resolver)

**Files:** Create `client/components/pipelines/pipelineIcon.tsx`, `client/components/pipelines/pipelineIcon.test.ts`

- [ ] **Step 1: Write the failing resolver test**

Create `client/components/pipelines/pipelineIcon.test.ts` (resolver is pure + the icon-name map is plain data; the test imports only the map keys + resolver, which import lucide - to keep it tsx-runnable, the test checks the NAME→presence mapping, not React rendering):
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PIPELINE_ICON_NAMES, resolvePipelineIcon, DEFAULT_PIPELINE_ICON } from "./pipelineIcon.js";

test("resolvePipelineIcon: known name returns its icon; unknown/null returns default", () => {
  assert.ok(PIPELINE_ICON_NAMES.includes("layers"));
  assert.ok(PIPELINE_ICON_NAMES.includes("target"));
  assert.equal(resolvePipelineIcon("layers"), resolvePipelineIcon("layers")); // stable
  assert.equal(resolvePipelineIcon("definitely-not-an-icon"), DEFAULT_PIPELINE_ICON);
  assert.equal(resolvePipelineIcon(null), DEFAULT_PIPELINE_ICON);
  assert.equal(resolvePipelineIcon(""), DEFAULT_PIPELINE_ICON);
});
```

- [ ] **Step 2: Run test → FAIL** (`npx tsx --test client/components/pipelines/pipelineIcon.test.ts`).

- [ ] **Step 3: Implement `pipelineIcon.tsx`**
```tsx
import {
  Layers, Users, Target, Megaphone, Wrench, Ticket, Headphones, ClipboardList,
  TrendingUp, DollarSign, Phone, MapPin, Briefcase, Rocket, Flag, Inbox,
  Package, Bell, Calendar, Star, Zap, Building2, ShoppingCart, FileText,
  CheckCircle, AlertCircle, Folder, Handshake, type LucideIcon,
} from "lucide-react";

export const PIPELINE_ICON_MAP: Record<string, LucideIcon> = {
  layers: Layers, users: Users, target: Target, megaphone: Megaphone, wrench: Wrench,
  ticket: Ticket, headphones: Headphones, "clipboard-list": ClipboardList, "trending-up": TrendingUp,
  "dollar-sign": DollarSign, phone: Phone, "map-pin": MapPin, briefcase: Briefcase, rocket: Rocket,
  flag: Flag, inbox: Inbox, package: Package, bell: Bell, calendar: Calendar, star: Star,
  zap: Zap, "building-2": Building2, "shopping-cart": ShoppingCart, "file-text": FileText,
  "check-circle": CheckCircle, "alert-circle": AlertCircle, folder: Folder, handshake: Handshake,
};
export const PIPELINE_ICON_NAMES = Object.keys(PIPELINE_ICON_MAP);
export const DEFAULT_PIPELINE_ICON: LucideIcon = Layers;

/** Resolve a stored icon name to a Lucide component; falls back to Layers. */
export function resolvePipelineIcon(name: string | null | undefined): LucideIcon {
  if (!name) return DEFAULT_PIPELINE_ICON;
  return PIPELINE_ICON_MAP[name] ?? DEFAULT_PIPELINE_ICON;
}

/** Grid picker of the curated icons. Stores/returns the icon NAME string. */
export function IconPicker({ value, onChange, color }: { value: string; onChange: (name: string) => void; color?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PIPELINE_ICON_NAMES.map((name) => {
        const Icon = PIPELINE_ICON_MAP[name];
        const active = value === name;
        return (
          <button key={name} type="button" aria-label={`Icon ${name}`} onClick={() => onChange(name)}
            className={`flex items-center justify-center size-8 rounded-md border ${active ? "ring-2 ring-primary border-primary" : "border-border/60 hover:bg-accent"}`}>
            <Icon className="size-4" style={active && color ? { color } : undefined} />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test → PASS** + `npm run typecheck`. Then commit:
```bash
git add client/components/pipelines/pipelineIcon.tsx client/components/pipelines/pipelineIcon.test.ts
git commit -m "feat(pipelines): Lucide icon map + resolvePipelineIcon + IconPicker (pipelines-mgmt)"
```

---

### Task 4: `PipelineSettingsDialog.tsx`

**Files:** Create `client/components/pipelines/PipelineSettingsDialog.tsx`

- [ ] **Step 1: Build the dialog**

Read an existing dialog (e.g. `ManageFieldsDialog.tsx`) for the `Dialog`/`DialogContent`/`DialogHeader` shell + the stage-editor color swatch pattern in `StageColumn.tsx`. Create a dialog: props `{ pipeline: Pipeline; open: boolean; onClose: () => void; onDeleted?: () => void }`. Local state seeded from `pipeline` (name, description, icon, color). Sections:
- **Name** `<Input>`, **Description** `<textarea>` (or `<Input>`), **Icon** `<IconPicker value={icon} onChange={setIcon} color={color} />`, **Color** (swatch palette `["#0EA5E9","#6B7280","#3B82F6","#8B5CF6","#F59E0B","#22C55E","#EF4444"]` + `<input type="color">`).
- **Simpan** → `usePipelineMutations().updatePipeline.mutateAsync({ id: pipeline.id, name, description, icon, color })` + toast + onClose.
- **Danger zone**: **Arsipkan** → `archivePipeline.mutateAsync(pipeline.id)` + toast + onClose + `onDeleted?.()`; **Hapus permanen** → a confirm `<Input>` (placeholder = pipeline name) gating a destructive Button (`disabled={confirmText !== pipeline.name}`) → `deletePipeline.mutateAsync(pipeline.id)` + toast + onClose + `onDeleted?.()`.
- All buttons `type="button"`; icon-only buttons get `aria-label`; use semantic tokens.
`onDeleted` lets the board page navigate away after archive/delete.

- [ ] **Step 2: Typecheck + build → 0 errors, green. Commit:**
```bash
git add client/components/pipelines/PipelineSettingsDialog.tsx
git commit -m "feat(pipelines): PipelineSettingsDialog - edit/archive/permanent-delete (pipelines-mgmt)"
```

---

### Task 5: Board header redesign - `PipelineBoardPage.tsx`

**Files:** Modify `client/pages/PipelineBoardPage.tsx`

- [ ] **Step 1: Imports + state + nav**

Add: `import { useLocation } from "wouter";`, `import { resolvePipelineIcon } from "@/components/pipelines/pipelineIcon";`, `import { PipelineSettingsDialog } from "@/components/pipelines/PipelineSettingsDialog";`, and a small kebab icon (`MoreVertical` from lucide). Add `const [, navigate] = useLocation();` and `const [showSettings, setShowSettings] = useState(false);`.

- [ ] **Step 2: Replace the header block**

Replace the current header `<div className="sticky ...">...<h1 ...>{pipeline?.name}</h1> <BoardFilters .../> {writable buttons}</div>` with a two-row responsive header:
```tsx
      <div className="sticky top-0 z-10 bg-background pt-16 md:pt-6 px-4 md:px-6 pb-2 border-b border-border/40">
        <div className="flex items-start gap-2.5">
          {(() => { const Icon = resolvePipelineIcon(pipeline?.icon); return (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: (pipeline?.color ?? "#0EA5E9") + "1A" }}>
              <Icon className="size-5" style={{ color: pipeline?.color ?? "#0EA5E9" }} />
            </span>
          ); })()}
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold leading-tight truncate">{pipeline?.name ?? "Memuat…"}</h1>
            {pipeline?.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{pipeline.description}</p>}
          </div>
          {writable && (
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowFields(true)}>Field</Button>
              <Button variant="outline" size="sm" onClick={() => setShowAccess(true)}>Akses</Button>
              <Button variant="outline" size="sm" onClick={() => setShowRules(true)}>Otomasi</Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Pengaturan pipeline" onClick={() => setShowSettings(true)}><MoreVertical className="size-4" /></Button>
            </div>
          )}
        </div>
        <div className="mt-2"><BoardFilters search={search} onSearch={setSearch} dateField={dateField} onDateField={setDateField} range={range} onRange={setRange} /></div>
      </div>
```
(The 3 dialog buttons stay; the kebab opens settings. On mobile the action buttons wrap; the filters are their own row.)

- [ ] **Step 3: Render the settings dialog + navigate on delete/archive**

Near the other dialogs at the bottom, add:
```tsx
      {showSettings && pipeline && (
        <PipelineSettingsDialog pipeline={pipeline} open={showSettings} onClose={() => setShowSettings(false)}
          onDeleted={() => { setShowSettings(false); navigate("/pipelines"); }} />
      )}
```
(`pipeline` is `PipelineWithStages` - `PipelineSettingsDialog` only needs the base `Pipeline` fields, which are present.)

- [ ] **Step 4: Typecheck + build → 0 errors, green. Commit:**
```bash
git add client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): board header redesign - icon + responsive title + description + settings menu (pipelines-mgmt)"
```

---

### Task 6: List page - full create + per-card menu + icon + archived view

**Files:** Modify `client/pages/PipelinesPage.tsx`

- [ ] **Step 1: Full create dialog**

Read the current `PipelinesPage.tsx`. Extend the create dialog state to `{ name, description, icon, color }` (defaults: icon `"layers"`, color `"#0EA5E9"`), add a description `<textarea>`, an `<IconPicker>`, and a color picker (swatch + `<input type=color>`, same palette as the settings dialog). `onCreate` → `createPipeline.mutateAsync({ name, description, icon, color })`.

- [ ] **Step 2: Card icon + per-card menu**

For each pipeline card: render `resolvePipelineIcon(p.icon)` (tinted by `p.color`) next to the name. Add a kebab (`MoreVertical`, `type="button"`, stopPropagation so it doesn't navigate) → opens `PipelineSettingsDialog` for that pipeline (`const [settingsFor, setSettingsFor] = useState<Pipeline | null>(null)`). Render one `<PipelineSettingsDialog pipeline={settingsFor} ...>` when `settingsFor`.

- [ ] **Step 3: Archived view**

The list uses `usePipelines(includeArchived)` - add a state `const [showArchived, setShowArchived] = useState(false)` and call `usePipelines(showArchived)`; a toggle button "Arsip" flips it. For archived pipelines (`p.isArchived === 1`), show a **Pulihkan** action (→ `updatePipeline.mutateAsync({ id: p.id, isArchived: 0 })`) instead of the normal open-on-click (or in the kebab). Confirm the `usePipelines` hook signature accepts the flag (it does: `usePipelines(includeArchived = false)`).

- [ ] **Step 4: Typecheck + build → 0 errors, green. Commit:**
```bash
git add client/pages/PipelinesPage.tsx
git commit -m "feat(pipelines): list page - full create (desc/icon/color) + per-card edit/archive/delete + archived view (pipelines-mgmt)"
```

- [ ] **Step 5: Manual checklist (relay; run on dev)**
- Combobox: in a rule's create_card target dropdown with two same-named pipelines, selecting one no longer marks both.
- Header: title readable on mobile, not oversized desktop; icon + description show; kebab → settings.
- Settings: edit name/description/icon/color persists; archive hides + navigates away; permanent delete (type-name) removes pipeline + all its cards/stages/rules and redirects.
- List: create with icon/description/color; per-card kebab edit/archive/delete; archived toggle shows archived + Pulihkan restores.
- Permanent delete by a non-creator non-admin → 403.

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 combobox+keys → T1; §2 backend (deletePipeline cascade, DELETE route+guard, isArchived) → T2; §3 icon system → T3; §4 settings dialog → T4; §5 header → T5; §6 list page → T6; §8 edge cases (navigate-away on delete/archive, type-name confirm, default icon, mitra-scoped cascade) → T2/T4/T5.
- **Type consistency:** `resolvePipelineIcon`/`IconPicker`/`PIPELINE_ICON_NAMES`/`DEFAULT_PIPELINE_ICON` (T3) used in T4/T5/T6; `deletePipeline` mutation (T2) used in T4; `updatePipeline({isArchived})` (T2) used in T6; `PipelineSettingsDialog` props (T4) match T5/T6 usage; `onDeleted` navigate wired in T5.
- **Backend correctness:** cascade deletes children before parents, all mitra-scoped (`getMitraId()`), `inArray` for card/rule children; route guarded by write-perm + pipeline-edit + creator-or-admin.
- **No placeholders** except the one explicit "use the codebase's System-Admin check" instruction in T2-Step3 (the implementer resolves the exact helper) - flagged, not a silent gap.
- **Standards:** pure `resolvePipelineIcon` (SoC/TDD), `IconPicker`/`PipelineSettingsDialog` components, semantic `<h1>`/`<p>` header + aria-labels + `type="button"`, semantic tokens (hex only in the swatch palette + icon tint, mirroring stored colors).
