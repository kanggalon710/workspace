# Pipelines Identity & Management Design

> Follow-up to the board-UX work. Fixes the Combobox "select-both" bug, gives a
> pipeline an identity (icon + description shown in a redesigned, responsive
> header), and adds pipeline management (edit name/description/icon/color, archive,
> and permanent cascade-delete) - which is what lets users clean up duplicate-named
> pipelines. Mostly frontend; one new backend cascade-delete endpoint.

**Base branch:** `feat/pipelines-identity-mgmt` off `dev` (includes the board-UX work).
**Status:** Approved design, ready for spec review.

---

## Verified preconditions

- `pipelines` table already has `description text`, `color varchar(16) default "#0EA5E9"`, `icon varchar(64)`, `isArchived int default 0`.
- `PATCH /api/pipelines/:id` already forwards `{name, description, color, icon}` and `storage.updatePipeline` applies all four (partial patch). **Edit needs no backend change.**
- `archivePipeline` mutation + `POST /api/pipelines/:id/archive` exist.
- **Missing backend:** a permanent (hard) delete - new this spec.

---

## 1. Bug fix - Combobox "select-both"

**Root cause:** `client/components/ui/combobox.tsx:144` sets the cmdk `CommandItem` `value` to `` `${option.label} ${option.description || ""}` `` - the LABEL, not the unique id. cmdk identifies/selects items by that string, so two options with the same label (e.g. two pipelines both named "Sales" - the duplicate problem) collapse to one cmdk item: selecting one marks both selected/active.

**Fix:** append the unique option value so each cmdk item is distinct while label-substring search still works:
```tsx
value={`${option.label} ${option.description || ""} ${option.value}`}
```
The `isSelected = option.value === value` check and `key={option.value}` are already correct. This 1-line fix corrects every Combobox app-wide.

**Minor defensive (judgment call, approved):** give field-map rows (`RuleActionEditor`) and condition rows (`ConditionsBuilder`) stable composite keys instead of bare array index, to avoid stale controlled state on delete/reorder. Low severity; included for tidiness.

## 2. Backend - permanent cascade delete

### `storage.deletePipeline(id)` (mitra-scoped cascade)
Delete in FK-safe order, all scoped by `getMitraId()`:
1. Card-scoped children for the pipeline's cards: `pipeline_card_comments`, `pipeline_card_activity`, `pipeline_card_values`, `pipeline_card_followers` (where `cardId IN (cards of this pipeline)`).
2. `pipeline_cards` (by pipelineId).
3. Rule-scoped children for the pipeline's rules: `pipeline_rule_field_maps`, `pipeline_rule_fires`, `pipeline_rule_actions` (by ruleId in this pipeline), then `pipeline_rules` (by pipelineId).
4. `pipeline_fields`, `pipeline_access`, `pipeline_stages` (by pipelineId).
5. `pipelines` (the row).
Implement with `inArray` for the card/rule child deletes (gather ids first), mirroring the existing batched-delete patterns. Returns void.

### `DELETE /api/pipelines/:id`
- Guard: `requireWritePermission("pipelines")` + `requirePipelineEdit(id)` +  **creator-or-System-Admin** only (anti-grief; mirror the rule-creator/admin pattern used elsewhere). Returns `sendSuccess(res, { ok: true })`.
- Client mutation `deletePipeline: (id) => api.delete(`/pipelines/${id}`)` added to `usePipelineMutations`.

### Restore (unarchive)
`updatePipeline({ id, isArchived: 0 })` - but `updatePipeline` doesn't currently accept `isArchived`.  Add `isArchived` to the PATCH-accepted fields + `storage.updatePipeline` data type (1 line each) so the list "Pulihkan" works. (Archive stays via the existing `/archive` endpoint.)

## 3. Icon system - `client/components/pipelines/pipelineIcon.tsx`

- A curated `PIPELINE_ICONS: Record<string, LucideIcon>` (~28 entries: layers, users, target, megaphone, wrench, ticket, headphones, clipboard-list, trending-up, dollar-sign, phone, map-pin, briefcase, rocket, flag, inbox, package, bell, calendar, star, zap, building-2, handshake/users-round, shopping-cart, file-text, check-circle, alert-circle, folder). Keys are the stored `icon` strings.
- `resolvePipelineIcon(name: string | null): LucideIcon` → the mapped icon or `Layers` fallback. (Pure - unit-testable.)
- `<IconPicker value onChange />` - a grid of the curated icons (button per icon, `type="button"`, `aria-label`, selected ring). Used by create + settings dialogs.

## 4. `PipelineSettingsDialog.tsx` (new)

Edit form for one pipeline: **name** `<Input>`, **description** `<textarea>`/`<Input>`, **icon** (`<IconPicker>`), **color** (swatch palette + `<input type=color>`, reusing the stage-editor pattern) → `updatePipeline({ id, name, description, icon, color })`.
Plus a danger zone:
- **Arsip** → `archivePipeline(id)` (+ toast, close, navigate away from board if open).
- **Hapus permanen** →  type-the-pipeline-name-to-confirm `<Input>` gating the delete button → `deletePipeline(id)`.
Opened from the board header menu and the list-page card menu.

## 5. Board header redesign - `PipelineBoardPage.tsx`

Replace the single `font-bold text-lg` h1 + crowded toolbar with a clean header block:
- **Identity row**: pipeline icon (`resolvePipelineIcon`, tinted by `pipeline.color`) + `<h1 className="text-base sm:text-lg font-bold truncate">{name}</h1>` (responsive - readable on mobile, not oversized on desktop) + a **settings kebab menu** (writable): Edit · Arsip · Hapus → opens `PipelineSettingsDialog`. The existing Kelola Field / Akses / Otomasi buttons move into this area (or stay as buttons that wrap).
- **Description**: `{pipeline.description && <p className="text-xs text-muted-foreground line-clamp-2">{pipeline.description}</p>}` below the title.
- **Filters** (`BoardFilters`) drop to their own row on mobile (`flex-wrap`), fixing the cramped/tiny-title layout. Keep the sticky behavior.

## 6. List page - `PipelinesPage.tsx`

- **Create dialog** gains description (textarea) + icon (`IconPicker`) + color → `createPipeline({ name, description, icon, color })`.
- Each pipeline card shows its **icon** (resolved + color-tinted) next to the name; description already shown.
- A per-card **kebab menu** (writable): Edit · Arsip · Hapus → `PipelineSettingsDialog` (reused; or Edit opens it, Arsip/Hapus inline with confirm).
-  **Archived view**: archived pipelines hidden by default; an "Arsip" toggle/section lists them with a **Pulihkan** action (`updatePipeline({ id, isArchived: 0 })`). (The list query already filters; confirm `usePipelines` supports an archived flag - the hook has `usePipelines(includeArchived)`.)

## 7. Files

| File | Change |
|---|---|
| `client/components/ui/combobox.tsx` | 1-line: unique cmdk item value (bug fix) |
| `client/components/pipelines/RuleActionEditor.tsx` / `ConditionsBuilder.tsx` | stable row keys (minor) |
| `server/storage.ts` | `deletePipeline(id)` cascade; `updatePipeline` accepts `isArchived` |
| `server/routes.ts` | `DELETE /api/pipelines/:id` (guarded); PATCH forwards `isArchived` |
| `client/hooks/usePipelines.ts` | `deletePipeline` mutation; `updatePipeline` passes `isArchived` |
| `client/components/pipelines/pipelineIcon.tsx` (+ test) | curated icon map + `resolvePipelineIcon` + `IconPicker` |
| `client/components/pipelines/PipelineSettingsDialog.tsx` | **new** edit/archive/delete dialog |
| `client/pages/PipelineBoardPage.tsx` | header redesign (icon + responsive title + description + settings menu) |
| `client/pages/PipelinesPage.tsx` | full create + per-card menu + icon + archived view |

## 8. Edge cases

- **Hard-delete the open pipeline** → after delete, navigate back to `/pipelines` (board would 404 otherwise).
- **Archive the open pipeline** → same (navigate away).
- **Permanent delete confirm** → button disabled until the typed name exactly matches.
- **No icon set** (legacy/default) → `resolvePipelineIcon(null)` → `Layers`.
- **Combobox fix** must not break existing single-name pickers (it only appends to the search string; substring search still matches the label).
- **Cascade delete** is mitra-scoped throughout - no cross-tenant deletion.

## 9. Testing

`resolvePipelineIcon` pure unit test (known name → its icon; unknown/null → Layers). `deletePipeline` manual (create pipeline w/ stages+cards+values+rules, hard-delete, verify ALL child rows gone + other pipelines/mitras untouched). UI typecheck + build + manual:
- Combobox: a pipeline-target dropdown with two same-named pipelines no longer double-selects.
- Header: title readable on mobile + not oversized desktop; icon + description render; kebab → Edit/Arsip/Hapus.
- Edit pipeline (name/desc/icon/color) persists; archive hides it + "Pulihkan" restores; permanent delete (type-name) removes it and redirects.
- Create with icon/description/color.

## Out of scope (later)

- Image/file logo upload (Lucide icon only).
- Drag-reorder pipelines / per-pipeline position UI.
- Bulk archive/delete.
- Icon search/filter in the picker (curated grid is small enough).

## Consistency with memory

- [[project-pipelines-engine]] - board polish before the P5 leads migration; update note on merge.
- [[feedback-coding-standards]] - pure `resolvePipelineIcon` (SoC/TDD), `IconPicker`/`PipelineSettingsDialog` components, semantic `<h1>`/`<p>` header + aria-labels, no hardcoded hex beyond swatch palette.
- [[reference-tenant-isolation-gotchas]] - `deletePipeline` scopes every delete by `getMitraId()`.
- [[reference-api-response-envelope]] - DELETE route uses `sendSuccess`/`sendError`.
