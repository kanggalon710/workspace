# Spec — Assignee Field Type (Slice B)

> Date: 2026-06-07 · Status: **Approved (pending user spec review)** · Target: dev branch + `jabnet_fiber_dev`
> Part of the Pipelines Engine program — see [[project-pipelines-engine]]. **Slice B** of the Pipeline/Kanban
> Enhancement PRD (PRD item **#1**). Builds on Slice A's field-type registry
> (`docs/superpowers/specs/2026-06-07-pipeline-field-registry-board-controls-design.md`).

## Context

The pipelines engine already has a `user` custom field type (single user), rendered via a `UserSelect`
Combobox in `FieldValueInput.tsx`. PRD #1 asks for a first-class **Assignee** field that:
- draws users from the **active tenant only** (tenant isolation), respecting RBAC;
- supports **Single** (one user) or **Multi** (many users) per field;
- hides users the current user may not see.

Two facts from the code drive this design:

1. **`GET /api/users` is admin-only** (`requireAdmin`, `server/routes.ts:1540`), yet the pipeline board
   (`PipelineBoardPage.tsx:30`), the `user`-field input (`FieldValueInput.tsx:200`), and the rules dialog
   (`PipelineRulesDialog.tsx:57`) all call it. So **non-admin pipeline users cannot load assignee options
   at all today** — the existing assignee filter, `user` field, and assign-action picker are broken for
   them. Slice B fixes this with a tenant-scoped, non-admin endpoint.
2. **Board chips don't resolve user IDs to names** (`BoardCard.fieldText`, `BoardCard.tsx:20` returns the
   raw value) — a `user` field chip shows a numeric ID today. Slice B fixes this via the `usersById` map
   `BoardCard` already holds.

This codebase has no per-user visibility ACL beyond mitra membership; **mitra membership is the visibility
boundary** for #1. Finer per-role user visibility is a future extension point.

## Goals / Non-goals

**Goals**
1. An **Assignee** field type (the existing `user` type, relabeled) with a per-field **Single/Multi** choice.
2. Assignee options come only from active-tenant members (tenant isolation + RBAC), available to non-admin
   users with the `pipelines` permission.
3. Names (not IDs) render on cards, chips, and the detail drawer.
4. Filter the board by assignee for both single and multi (membership).

**Non-goals (deferred)**
- Changing Single↔Multi after a field is created (would orphan assignees) — **immutable** after creation.
- Syncing the Assignee field with the board's primary `card.assigneeId` — they stay independent.
- Notifications when an Assignee-field value changes (the board assignee already notifies; field-level
  assignment notifications are out of scope).
- Finer-than-mitra per-user visibility rules.
- Searching assignees by name (values store IDs) — filter-by-user covers the real need.

## Coding standards
Per [[feedback-coding-standards]]: semantic HTML5 (`<fieldset>`/`<legend>`/`<label htmlFor>`/`<input type=radio>`/
`<button type>`), DRY (one registry; decision logic in the shared pure module), component/SoC (focused input
components), pure testable helpers. Reuse design-system primitives (`Combobox`, `Button`, `Input`).

## Design

### 1. Data model

- **New `config` column on `pipeline_fields`:** `config TEXT` (nullable, JSON). Added at startup via an
  info_schema COUNT guard + plain `ALTER TABLE pipeline_fields ADD COLUMN config TEXT` (the DB rejects
  `ADD COLUMN IF NOT EXISTS` — see [[reference-startup-add-column]]). Holds small per-field settings; for
  Assignee it is `{"multiple": true|false}`. Reusable for later field types (e.g. Coordinate). All existing
  fields → `null`.
- **Assignee = the existing `user` type, enhanced.** The registry relabels `user` → **"Assignee"**. The
  Single/Multi choice is `config.multiple`, set at creation and **immutable** afterward.
- **Card value storage** (in `pipeline_card_values.value`, unchanged table):
  - **Single** → one userId string, e.g. `"42"` — identical to today's `user` field (back-compatible;
    existing single-user fields keep working with `config = null`).
  - **Multi** → JSON array of userId strings, e.g. `'["42","43"]'` — mirrors `multiselect`.
- **Independent of `card.assigneeId`.** The Assignee field is a normal custom field; `card.assigneeId`
  remains the board/automation/filter primary assignee. No syncing.

### 2. Assignable-users endpoint + RBAC (delivers #1)

- **`GET /api/pipelines/assignable-users`** — gated by `requirePermission(req,res,"pipelines")` (read),
  NOT admin. Returns active-tenant members: `storage.getAssignableUsers()` =
  `getAllUsers()` filtered by `getUserIdsInMitra(activeMitraId)` (system-admin sees all), mapped to safe
  fields `{ id, name, username, role, isActive }` (no password/token). A user outside the active mitra
  never appears — the tenant-isolation + RBAC guarantee in #1.
- **Client hook `useAssignableUsers()`** (in `client/hooks/usePipelines.ts`) → `AssignableUser[]`.
- **Switch pipeline consumers off `/api/users`:** `FieldValueInput` (assignee input), `PipelineBoardPage`
  (assignee filter + chip name map), `PipelineRulesDialog` (assign-action picker). Fixes the non-admin
  breakage. Admin-facing pages (UsersPage, etc.) keep using `/api/users`.

### 3. Field input, create UX, display

- **Create UX (`ManageFieldsDialog`):** when the selected type is **Assignee** (`type === "user"`), render a
  semantic `<fieldset><legend>Penugasan</legend>` with two radios: **Tunggal** (`multiple:false`, default)
  and **Banyak** (`multiple:true`). On create, send `config: { multiple }`. Hidden for all other types.
- **Value input (`FieldValueInput`)** branches on `isMultiUser(field)`:
  - **Single** → existing `UserSelect` Combobox, backed by `useAssignableUsers`.
  - **Multi** → new `UserMultiSelect`: selected users shown as removable chips (names) + a `Combobox` to add
    one; stores a JSON array of userId strings (same idiom as the existing `MultiSelect`, user-typed).
- **Display name resolution:** the board chip path (`BoardCard`) and the detail drawer resolve `user`/Assignee
  values to **names** via the `usersById` map `BoardCard` already holds — single → name; multi → joined names
  with a `+N` overflow. `fieldText` stays pure; name resolution is injected by the caller (a resolver
  function or inline in the chip map), not baked into the pure helper.
- **Filter value control:** Slice A's `FieldFilterValue` already renders a user picker for `user` fields —
  unchanged; it now sources options from `useAssignableUsers` and works for single and multi (membership).

### 4. Shared helpers + validation

- **`shared/pipelineFieldTypes.ts`:** relabel `user` → "Assignee"; add pure
  `parseFieldConfig(field): { multiple?: boolean }` (safe JSON parse of `field.config`) and
  `isMultiUser(field): boolean` (`field.type === "user" && parseFieldConfig(field).multiple === true`).
  Extend `cardMatchesFilter` so a multi-assignee matches by **membership** (like `multiselect`) instead of
  equality. `compareCardsByField` is unaffected (assignee is not sortable).
- **Schema/API:** `PipelineField` gains `config: string | null`. `storage.createField` accepts and stores
  `config` (JSON-stringified); the create-field route passes `config` through. (Edit does not change
  `config` — immutable.)
- **Validation (`server/pipeline-field-helpers.ts`):** `validateFieldValue` gains an optional `multiple`
  flag. Multi-assignee validates as a JSON array of digit strings; single stays `/^\d+$/`. The card-values
  route passes the field's `multiple` flag when validating a `user` field.

## Files

| File | Change |
|---|---|
| `shared/schema.ts` | + `config: text("config")` on `pipelineFields`; `PipelineField` picks it up. |
| `server/storage.ts` | startup `ALTER` for `config` (info_schema guard); `getAssignableUsers()`; `createField` stores `config`. |
| `server/routes.ts` | `GET /api/pipelines/assignable-users`; create-field route passes `config`; card-values validation passes `multiple`. |
| `server/pipeline-field-helpers.ts` | `validateFieldValue` optional `multiple` → JSON-array-of-ids validation. |
| `shared/pipelineFieldTypes.ts` | relabel `user`→"Assignee"; `parseFieldConfig`, `isMultiUser`; multi-aware `cardMatchesFilter`. |
| `shared/pipelineFieldTypes.test.ts` | tests for the new helpers + multi-assignee filter. |
| `client/hooks/usePipelines.ts` | `useAssignableUsers()` hook + `AssignableUser` type; `CardDetail`/types pick up `config` via `PipelineField`. |
| `client/components/pipelines/ManageFieldsDialog.tsx` | Single/Multi radio when type is Assignee; send `config`. |
| `client/components/pipelines/FieldValueInput.tsx` | single vs multi user input; `UserMultiSelect`; use `useAssignableUsers`. |
| `client/components/pipelines/BoardCard.tsx` | resolve user/assignee values to names in chips. |
| `client/components/pipelines/CardDetailDrawer.tsx` | resolve assignee names in the field display (if shown). |
| `client/pages/PipelineBoardPage.tsx` | source users from `useAssignableUsers`. |
| `client/components/pipelines/PipelineRulesDialog.tsx` | source users from `useAssignableUsers`. |

## Testing

- **Pure (`npx tsx --test shared/pipelineFieldTypes.test.ts`):** `parseFieldConfig` (valid/missing/garbage
  JSON), `isMultiUser` (single vs multi vs non-user), `cardMatchesFilter` multi-assignee membership (matches
  when id in array; not when absent; empty filter passes), and that single-assignee still matches by equality.
- **Validation:** multi-assignee accepts `'["1","2"]'`, rejects `'["x"]'` and non-array; single still
  `/^\d+$/`.
- **Gates:** `npm run typecheck` = 0; `npm run build` green.
- **Manual (dev "Leads (Marketing)"):** create a Single and a Multi Assignee field; as a NON-admin pipeline
  user, open a card, assign one/several tenant users (confirm only active-mitra users appear); verify names
  (not IDs) render on the card chip + drawer; filter the board by an assignee (single and multi).

## Multi-tenant / RBAC (AC #12)

`getAssignableUsers` is mitra-scoped (mirrors the `/api/users` tenant filter, minus the admin gate and the
mitra-name enrichment). The `config` column carries no cross-tenant data. All field/card routes keep their
existing `requirePermission`/`requireWritePermission` + `requirePipelineView`/`requirePipelineEdit` guards.

## Risks

1. **`config` migration** — info_schema COUNT guard + plain `ALTER` (no `IF NOT EXISTS`); idempotent.
2. **Consumer switch** — 3 components move off `/api/users`; each only needs `{id,name,username,role}`
   (verified). Admin pages keep `/api/users`.
3. **Multi-assignee not name-searchable** (stores IDs) — filter-by-user covers the real need; noted.
4. **Single↔Multi immutability** — documented; the create UX makes the choice once.

## Acceptance criteria

- Assignee is a first-class field type (relabeled `user`) with a Single/Multi choice at creation.
- Single and Multi both work (one userId vs JSON array of userIds); existing single-user fields unaffected.
- Assignee options come only from active-tenant members and are available to non-admin `pipelines` users.
- Names render on cards/chips/drawer; board filter-by-assignee works for single and multi.
- `config` column added (no data migration of existing rows); typecheck 0, build green, pure tests pass,
  multi-tenant isolation unchanged.
