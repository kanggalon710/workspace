# Spec — Bulk Card Actions on /pipelines

> Date: 2026-06-09 · Mitra-scoped · New feature after the Advanced Pipeline Automation epic (SP1–SP3b).
> Build on `dev`. Mobile-first. Reuses the `UsersPage` bulk pattern + existing per-card guards.

## Goal

Select many cards on `/pipelines` and apply one mass operation — assign, move stage, set a custom field,
add/remove a tag, or delete — server-side, permission- and tenant-safe, with per-card partial-success
reporting and audit. Speeds up managing the dozens of cards created by billing_sync / automation.

## Decisions (confirmed)

1. **v1 ops:** `assign`, `move`, `set_field`, `add_tag`, `remove_tag`, `delete`. Archive is **out** (cards
   have no archive concept). Bulk *secondary*-assignee is out (v1 sets primary only).
2. **Automation:** **skipped by default**; an opt-in "Jalankan otomasi" toggle dispatches the matching
   event per card.
3. **One server endpoint**, synchronous, **cap 200 cards/op** (no async queue in v1).
4. **Selection is client-side** over the already-loaded card set (the board fetches all of a pipeline's
   cards — no pagination), covering manual / whole-stage / all-filtered.

## 1. Selection — `PipelineBoardPage` + `StageColumn`

Reuse the `UsersPage` pattern: `const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())`.
- Checkbox on each card (in `StageColumn`'s card render); a **bulk-select mode** toggle so checkboxes don't
  clutter normal use (a "Pilih" button in the board header enters selection mode).
- Stage-header checkbox → select/deselect all cards in that stage (the stage's filtered list).
- Board-header checkbox → select/deselect all currently-**visible** (filtered/searched) cards.
- Live count ("12 kartu terpilih") + a **bulk action bar**: sticky/floating on desktop, a `BottomSheet`
  on mobile (mobile-first). Clears on success/escape.
- Selection survives filter changes only for still-visible cards (prune `selectedIds` to visible on
  filter change, to avoid acting on hidden cards the user can't see).

## 2. Pure module — `shared/bulkCardOps.ts` (no I/O, unit-tested)

```ts
export type BulkOp = "assign" | "move" | "set_field" | "add_tag" | "remove_tag" | "delete";
export const BULK_OPS: BulkOp[] = ["assign", "move", "set_field", "add_tag", "remove_tag", "delete"];
export const BULK_MAX_CARDS = 200;

export type BulkValidation = { ok: true } | { ok: false; error: string };

/** Validate cardIds (non-empty, ≤ cap, all positive ints) + per-op payload shape. */
export function validateBulkRequest(op: string, cardIds: unknown, payload: any): BulkValidation;
//  assign      → payload.assigneeId is number|null
//  move        → payload.stageId is a positive int
//  set_field   → payload.fieldId positive int + payload.value is string (type-checked later w/ validateFieldValue)
//  add/remove_tag → payload.tag non-empty string (≤64 chars)
//  delete      → no payload
//  any: cardIds Array of positive ints, length 1..BULK_MAX_CARDS

/** Add/remove a tag in a card's existing tags (stored as JSON array text); returns the new tags array. */
export function applyTagChange(existingTags: string[], op: "add_tag" | "remove_tag", tag: string): string[];
```

`tags` is `pipeline_cards.tags` (text JSON array today). `applyTagChange` dedupes on add, no-ops if absent
on remove — pure + tested.

## 3. Server endpoint — `POST /api/pipelines/:id/cards/bulk`

Body: `{ op: BulkOp, cardIds: number[], payload?: object, runAutomation?: boolean, overwrite?: boolean }`.

Flow (`server/routes.ts`, helper in a focused function to keep the route thin):
1. `requireWritePermission(req,res,"pipelines")` + `requirePipelineView(req,res,pid)`.
2. `validateBulkRequest(op, cardIds, payload)` → 400 on bad shape/over-cap.
3. For `set_field`: resolve field access once via `fieldAccessForRequest(req, pid, fields)`; the target
   field must be `edit` for the role (else the whole op is 403 — it's a single field for all cards).
   Validate `payload.value` with `validateFieldValue(field.type, value, options, {multiple})`.
4. **Per card** (loop, each in try/catch → never aborts the batch):
   - `card = await storage.getCard(id)` — skip+report `"tidak ditemukan"` if null **or** `card.pipelineId !== pid` (tenant/pipeline guard).
   - capability: `assign` → `assign` cap; `move`/`set_field`/`add_tag`/`remove_tag`/`delete` → `cards` cap
     (same as each op's single-card endpoint). Fail → skip+report `"akses ditolak"`.
   - `requireCardAccess`-equivalent (row-level): if the requester's card filter excludes it → skip+report `"tidak ditemukan"` (hide existence).
   - apply via the existing storage method:
     - assign → `storage.updateCard(id, { assigneeId }, actor)`
     - move → if already at stage, count as succeeded no-op; else `storage.moveCard(id, stageId, undefined, actor)`
     - set_field → if `overwrite===false` and the card already has a non-empty value for the field, skip+report `"sudah terisi"`; else `storage.setCardValues(id, [{fieldId, value}])` + `logCardActivity(id, actor, "edited")`
     - add_tag/remove_tag → read card.tags, `applyTagChange`, `storage.updateCard(id, { tags }, actor)`
     - delete → `storage.deleteCard(id)`
   - if `runAutomation`: dispatch the matching event AFTER the mutation — move → `runStageEnterAutomations(updatedCard, actor)`; assign → `dispatchCardEvent("assignee_changed", updatedCard, actor)`; set_field → `dispatchCardEvent("field_updated", updatedCard, actor, { changedFieldIds: [fieldId] })`. (delete/tags → no event.) Wrapped so an automation error on one card doesn't fail that card's op.
   - success → push to `succeeded`.
5. Respond `sendSuccess(res, { processed, succeeded: succeeded.length, failed: [{ cardId, reason }] })`.

All `storage` calls are `getMitraId()`-scoped → no cross-tenant. Automation, when enabled, runs through the
same loop-safe engine (storage-direct mutations already happened; dispatch is the normal event path).

## 4. Client — bulk action bar + op dialogs + result

- `client/components/pipelines/BulkActionBar.tsx`: shows count + buttons (Assign, Pindah Stage, Set Field,
  Tag, Hapus) filtered by capability (`caps`), + a "Jalankan otomasi" switch (default off), + Batal.
- Per-op compact dialog/sheet collects the payload: assign → user Combobox; move → stage Combobox;
  set_field → field Combobox (edit-accessible only) + a `FieldValueInput` + "timpa nilai terisi" switch;
  tag → tag input; delete → confirm.
- Hook `useBulkCardAction(pipelineId)` → `POST .../cards/bulk`; on success invalidate the cards query +
  clear selection + show a result toast/dialog: "18 sukses · 2 gagal" with the per-card reasons.
- Cap UX: if `selectedIds.size > 200`, disable apply + show "Maks 200 kartu per aksi — persempit pilihan".

## 5. Permission & tenant (summary)

- Endpoint gated by `pipelines` write + pipeline view; each card re-checked for capability + row-level +
  (set_field) field-perm. Inaccessible cards are **skipped and reported**, never block the batch — matches
  the "show accessible, skip the rest" requirement.
- Everything mitra-scoped; cardIds outside the pipeline/tenant resolve to "not found".

## 6. Audit

Each op logs a per-card `pipeline_card_activity` entry (storage `moveCard`/`updateCard` already do;
`set_field`/tags add an explicit `logCardActivity`). The actor + timestamp + type are recorded per affected
card — satisfies the audit requirement (old→new value is captured for move/assign by the existing logs).

## 7. Testing

- `shared/bulkCardOps.test.ts`: `validateBulkRequest` (each op's payload valid/invalid; empty cardIds;
  over-cap; non-int ids), `applyTagChange` (add dedupe, remove absent no-op, remove existing).
- Endpoint, client, automation toggle: typecheck + build + manual (the acceptance flow).

## 8. Manual acceptance (on dev)

1. Enter select mode → tick 5 cards across stages → bar shows "5 terpilih". Stage-header checkbox selects a
   whole stage; board-header selects all filtered.
2. **Assign** 5 → Staff A; **assign** another 4 → Staff B → both batches reflect; audit per card.
3. **Move** 10 cards → "Follow Up 1" (automation OFF) → moved, no rules fire. Repeat with toggle ON → rules fire.
4. **Set field** on 6 cards (overwrite off) → cards already filled are reported "sudah terisi", rest updated.
5. A user lacking access to 2 of the selected cards → result shows "X sukses · 2 gagal: akses ditolak".
6. **Delete** selected (with capability) → removed; others without capability skipped+reported.
7. >200 selected → apply disabled with the cap message.

## Out of scope
- Archive cards; async job queue; bulk secondary-assignee; "trigger only a specific rule"; drag-multiple
  (the Move dialog covers multi-move — drag-select is a later nicety).
