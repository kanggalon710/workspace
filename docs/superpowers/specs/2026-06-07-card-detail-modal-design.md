# Spec — Card Detail Modal Redesign (Slice E)

> Date: 2026-06-07 · Status: **Approved (pending user spec review)** · Target: dev branch
> Part of the Pipelines Engine program — see [[project-pipelines-engine]]. **Slice E** of the Pipeline/Kanban
> Enhancement PRD (PRD item **#2**). Pure client UI redesign — no backend/schema/migration.

## Context

The pipeline card detail today is a right-edge **sidebar drawer** (`CardDetailDrawer.tsx`: a
`fixed inset-0 flex justify-end` overlay with a `max-w-md` panel), opened from the board via a numeric
`selectedCard` state in `PipelineBoardPage`. PRD #2 asks to replace it with a centered, larger, **resizable**
modal (HubSpot/Jira/Monday-style), openable in a new tab, with a clear header + organized body; mobile stays
full-screen.

Per the brainstorm decisions: **single-column stacked** layout; "resize" = a **Normal ↔ Lebar width toggle**
(persisted); open-in-new-tab via a **`?card=<id>` query param** on the existing board route (no new route).

The board route is `/pipelines/:id` (`PipelineBoardPage` via `useRoute`); cards are addressed by numeric id.
The shadcn `Dialog` primitive (`@/components/ui/dialog`) is already used by `ManageFieldsDialog` etc.

## Goals / Non-goals

**Goals**
1. Centered modal on desktop, full-screen on mobile, replacing the sidebar drawer (drop-in: same
   `cardId`/`pipelineId`/`onClose`/`writable` contract + URL sync).
2. Width toggle (Normal ↔ Lebar), persisted in `localStorage`.
3. Open-in-new-tab via `/pipelines/:id?card=<cardId>`; board opens the modal from that param and clears it on
   close.
4. Single-column layout: header (name + Pipeline·Stage·Prioritas), quick-edit metadata (stage / assignee /
   priority), read-only created-by/date + tags, description, custom fields, comments (+photos), activity,
   delete.
5. Everything from slices A–D keeps working inside (custom fields via the unchanged `FieldCustomSection`).

**Non-goals (deferred)**
- Two-column/internal-sidebar layout (user chose single-column); draggable free resize.
- New attachment upload mechanism (photos still arrive via comments and render inline).
- Editing tags (display-only chips); new card fields or storage.
- A standalone card page/route separate from the board.

## Coding standards
Per [[feedback-coding-standards]]: semantic HTML5 (`Dialog` provides dialog semantics; `<label htmlFor>` for
selects; `<button type="button">`/`<a>` for header actions), DRY (reuse `Dialog`/`Combobox`/existing
mutations/hooks; pure `parseCardParam`), component/SoC (modal container vs `FieldCustomSection`), pure testable
helper for URL parsing. Reuse design-system primitives.

## Design

### 1. Container + responsiveness + width + open-in-tab

- Rename `client/components/pipelines/CardDetailDrawer.tsx` → **`CardDetailModal.tsx`** (export
  `CardDetailModal`; move its `FieldCustomSection` along, unchanged). Rewrite the container using `Dialog` +
  `DialogContent`:
  - Desktop centered; width via `wide` state → `max-w-3xl` (Lebar) vs `max-w-lg` (Normal). Mobile:
    `w-[calc(100vw-2rem)] max-h-[90vh]` with the body scrolling (header pinned). Project's standard dialog
    sizing classes.
  - `wide` initialised from `localStorage["pipeline_card_modal_wide"]`; the toggle writes it back.
- **URL sync (`PipelineBoardPage`):** on mount/location change, read `?card=` (pure
  `parseCardParam(search): number | null`) → set `selectedCard`; opening a card sets the param via
  `navigate("/pipelines/:id?card=N")`; `onClose` navigates back to `/pipelines/:id` (param cleared). Header
  **"Buka di tab baru"** = `<a href="/pipelines/<id>?card=<cardId>" target="_blank" rel="noreferrer">`.
- **Unknown/forbidden card id in URL:** `useCard` 404 → modal shows a small "Kartu tidak ditemukan" state with
  a close button (no crash).

### 2. Layout + content (single-column)

Top → bottom inside `DialogContent` (data from `useCard`; edits via existing mutations
`usePipelineMutations(pipelineId)`):
- **Header:** inline-editable **name** (blur → `updateCard {title}`) + subtitle `Pipeline · Stage · Prioritas`;
  actions: width toggle, open-in-new-tab, close.
- **Metadata row** (quick-edit; write-gated by `writable`):
  - **Stage** — `Combobox` of `pipeline.stages` → `moveCard({cardId, toStageId})`.
  - **Assignee** — `Combobox` from `useAssignableUsers` → `updateCard {assigneeId}` (null to clear).
  - **Prioritas** — `Combobox` (low/medium/high/urgent) → `updateCard {priority}`.
  - **Dibuat oleh** (resolve `createdBy` → name via assignable users) + **Tanggal dibuat** (`createdAt`,
    `toLocaleString("id-ID")`) — read-only.
  - **Tags** — read-only chips when present.
- **Deskripsi / Notes** — existing description `Textarea` (blur → `updateCard {description}`).
- **Field Kustom** — the unchanged `FieldCustomSection` (Phone actions + Coordinate picker/info intact).
- **Komentar** — existing thread (photos render inline as today) + add-comment box.
- **Aktivitas / Timeline** — existing activity list.
- **Hapus Kartu** — bottom, `writable`-gated → `deleteCard` then close.

`PipelineBoardPage` passes the modal what the selects need: `pipeline.stages`, `assigneeOptions`/`usersById`
(already built on the page).

## Files

| File | Change |
|---|---|
| `client/components/pipelines/CardDetailModal.tsx` | **New (renamed from `CardDetailDrawer.tsx`).** Dialog-based modal, single-column layout, header actions, quick-edit selects; keeps `FieldCustomSection`. |
| `client/components/pipelines/CardDetailDrawer.tsx` | **Deleted** (replaced). |
| `client/lib/cardParam.ts` | **New.** Pure `parseCardParam(search: string): number | null`. |
| `client/lib/cardParam.test.ts` | **New.** Tests. |
| `client/pages/PipelineBoardPage.tsx` | Use `CardDetailModal`; `?card=` URL sync (open/close); pass `stages`+user options. |

## Testing
- **Pure (`npx tsx --test client/lib/cardParam.test.ts`):** `parseCardParam("?card=42")===42`; `"?card=abc"`,
  `"?foo=1"`, `""` → null; `"?card=0"`/negative → null.
- **Gates:** `npm run typecheck` = 0; `npm run build` green.
- **Manual (dev):** open a card → centered modal (desktop), full-screen (mobile); edit name/description; change
  stage/assignee/priority → persists + reflects on board; width toggle persists across reopen; "buka di tab
  baru" opens `/pipelines/:id?card=N` and lands with modal open; close clears `?card=`; refresh on that URL
  reopens it; slices A–D (search/filter/sort unaffected; assignee field; phone buttons; coordinate
  picker+info) all work inside the modal; a bogus `?card=999999` shows "tidak ditemukan".

## Multi-tenant / RBAC
Unchanged. Same card endpoints/guards; quick-edit selects use existing mutations (already write-permission
gated). The URL only carries a card id (server still authorizes every fetch/mutation).

## Risks
1. **Long content scroll** — modal body scrolls; header pinned; `max-h-[90vh]` (desktop) / full-screen (mobile).
2. **`?card=` history** — controlled param: set on open, cleared on close; refresh/deep-link reopens; avoid
   pushing duplicate history entries (use replace on close).
3. **Component rename** — one import site (`PipelineBoardPage`); delete the old file.
4. **Forbidden/unknown card id** — graceful "tidak ditemukan" + close (no crash).

## Acceptance criteria
- Card detail is a centered modal (desktop) / full-screen (mobile), replacing the drawer.
- Width toggle (Normal ↔ Lebar) works and persists.
- Card opens in a new tab via `/pipelines/:id?card=<id>`; closing clears the param.
- Single-column layout with header + quick-edit stage/assignee/priority + read-only created-by/date/tags +
  description + custom fields + comments + activity + delete; slices A–D intact inside.
- No backend/schema/migration; typecheck 0, build green, `parseCardParam` tested; isolation unchanged.
