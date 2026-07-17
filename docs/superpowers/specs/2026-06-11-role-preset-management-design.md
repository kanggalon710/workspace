# Spec — Role Preset Management

> Date: 2026-06-11 · Mitra-scoped · Build on `dev`. Follows the two `/roles` bug fixes
> (Quick Presets matrix + tenant user creation) already merged on `dev`.

## Goal

Turn the 5 hardcoded role presets into **DB-managed, website-editable** presets, with a
`global` vs `tenant` scope, so System-Admin JABNET manages shared/global presets and each tenant
admin manages their own — without breaking tenant isolation. The role-create form keeps applying a
preset to the permission matrix exactly as today (now bug-free), sourcing presets from the DB.

## Decisions (confirmed with user)

1. **Built-ins → locked global presets.** Seed the 5 built-ins (admin/operator/marketing/billing/
   viewer) into the table on startup as `scope=global, mitra_id=1, is_system=1`. DB is the single
   source of truth. `PERMISSION_PRESETS` + `buildPermissionMatrixFromPreset()` stay in code only as
   the **seed source**.
2. **Active = the tenant-visibility switch.** A tenant admin can apply any `is_active` global preset;
   inactive globals are hidden. No separate "shareable" flag.
3. **Management UI lives inside `/roles`** as a `Role | Preset` segmented toggle (Preset tab is
   admin-only). No new route.
4. **Default preset pre-applies** to the matrix on the new-role form (editable after). ≤1 default per
   scope; tenant default wins over global default.
5. **Extract a shared `<PermissionMatrixEditor>`** used by both the role dialog and the preset dialog.
6. **Server is authoritative** for all scope/ownership/visibility — never trust the frontend.

## 1. Schema — new table `role_presets`

Created via `CREATE TABLE IF NOT EXISTS` in the startup block in `server/storage.ts` (same pattern as
`pipeline_metrics`). Columns:

| col | type | notes |
|---|---|---|
| `id` | INT PK AI | |
| `mitra_id` | INT NOT NULL DEFAULT 1 | owner tenant; global presets owned by JABNET (1) |
| `scope` | VARCHAR(8) NOT NULL DEFAULT 'tenant' | `global` \| `tenant` |
| `name` | VARCHAR(255) NOT NULL | |
| `description` | VARCHAR(255) | |
| `icon` | VARCHAR(48) | |
| `color` | VARCHAR(16) NOT NULL DEFAULT 'primary' | |
| `permissions` | TEXT NOT NULL | JSON `Record<key, "none"\|"read"\|"write">` (same shape as `roles.permissions`) |
| `is_system` | INT NOT NULL DEFAULT 0 | 1 = seeded built-in (not deletable; editable only by System-Admin JABNET) |
| `is_active` | INT NOT NULL DEFAULT 1 | inactive = hidden from the apply list |
| `is_default` | INT NOT NULL DEFAULT 0 | pre-applied on new-role form; ≤1 per scope (per mitra for tenant scope) |
| `created_by` | INT | |
| `updated_by` | INT | |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT | |

Index: `idx_role_presets_scope_mitra (scope, mitra_id, is_active)`. Drizzle table def `rolePresets`
added to `shared/schema.ts`.

**Seed (idempotent, startup):** for each of the 5 `PERMISSION_PRESETS`, insert a row
`scope=global, mitra_id=1, is_system=1, is_active=1, permissions=JSON(buildPermissionMatrixFromPreset(key))`
only if no global preset with that `name` exists yet. `admin` seeded with `is_default=1` (the global
default). Icon/color: pick sensible defaults per preset (e.g. admin→shield/primary, viewer→eye/neutral).

## 2. Visibility & access (server-enforced)

Add helpers in storage (tenant-aware) + gate in routes:

- **Apply list** — `getApplicablePresets(mitraId)`: rows where
  `(scope='global' AND is_active=1) OR (scope='tenant' AND mitra_id=mitraId AND is_active=1)`,
  ordered (global first, then tenant; default first within each). Used by the role form.
- **Manage list** — `getManageablePresets(req)`:
  - System-Admin JABNET → `scope='global'` ∪ `scope='tenant' AND mitra_id=1` (JABNET's own).
  - Tenant admin → `scope='tenant' AND mitra_id=activeMitraId` only. (Globals are visible in the
    apply list but NOT in their manage list — read-only to them.)
- **Mutation authorization** (`assertCanManagePreset(req, preset, {scopeForCreate?})`):
  - Create: `scope='global'` requires `isSystemAdmin(req)`; `scope='tenant'` writes `mitra_id=activeMitraId`.
  - Update/Delete: load the row; if `scope='global'` or `mitra_id!==activeMitraId` → require
    `isSystemAdmin(req)`; a tenant admin may only touch their own `scope='tenant'` rows.
  - `is_system=1`: **never deletable**; editable only by `isSystemAdmin(req)`.
  - 403 with a clear Indonesian message otherwise. Defense-in-depth: re-check ownership on every
    update/delete by re-reading the row server-side (don't trust the id alone).

## 3. Default-preset resolution

- Setting a default (`POST /api/role-presets/:id/default`) clears `is_default` on all other presets
  in the **same scope** (and same `mitra_id` for tenant scope) in one transaction, then sets it.
- New-role form resolution order: tenant default (`scope=tenant, mitra_id=M, is_default=1`) → else
  global default (`scope=global, is_default=1`) → else none. The resolved preset's matrix is
  pre-applied to the form (editable).

## 4. API (all `sendSuccess`/`sendError`)

| Method | Route | Gate | Behavior |
|---|---|---|---|
| GET | `/api/role-presets` | `requirePermission(req,res,"roles")` | apply set for active mitra |
| GET | `/api/role-presets?manage=1` | admin (see §2) | manageable set incl. inactive |
| POST | `/api/role-presets` | admin; global→`isSystemAdmin` | create; validate name, matrix keys ⊂ ALL_PERMISSION_KEYS, scope ∈ {global,tenant} |
| PUT | `/api/role-presets/:id` | `assertCanManagePreset` | update; is_system editable only by System-Admin |
| DELETE | `/api/role-presets/:id` | `assertCanManagePreset` | delete; never if is_system |
| POST | `/api/role-presets/:id/default` | `assertCanManagePreset` | set default (clears siblings in scope) |

Permission matrix validation reuses the same cleanse loop as `POST /api/roles` (`ALL_PERMISSION_KEYS`,
values ∈ none/read/write). Mounted near the existing `/api/roles` handlers in `server/routes.ts`.

## 5. Storage methods (`DatabaseStorage`)

`createRolePreset`, `updateRolePreset`, `deleteRolePreset`, `getRolePresetById`,
`getApplicablePresets(mitraId)`, `getManageablePresets({mitraId,isSystemAdmin})`,
`setDefaultRolePreset(id, scope, mitraId)` (transactional clear+set), `seedRolePresetsIfNeeded()`
(startup, idempotent by `(scope='global', name)`). MySQL pattern: insert then re-select (no
`.returning()`); JSON.stringify the matrix.

## 6. Client (`client/pages/RolesPage.tsx` + new components)

- **`<PermissionMatrixEditor>`** (new, `client/components/roles/PermissionMatrixEditor.tsx`): the
  permission grid extracted from `RoleFormDialog` — props `value: Record<string,PermissionLevel>`,
  `onChange`, `disabled?`, group bulk-set, preset apply-buttons optional. Used by BOTH dialogs.
- **`/roles` page**: a `Role | Preset` segmented control (semantic, admin-only) switching between the
  existing roles list and a new **presets list**. Preset cards show icon/color/name/scope badge
  (Global/Tenant)/active toggle/default star + edit/delete (delete hidden for `is_system`).
- **`<RolePresetDialog>`** (new): `<form>` with name/description, icon+color picker (reuse the metrics
  dialog pattern), scope select (scope=global option only for System-Admin JABNET), Active/Default
  toggles, and `<PermissionMatrixEditor>`.
- **Role-create form**: the existing preset buttons are replaced by a preset picker fed by
  `GET /api/role-presets`; selecting one loads `preset.permissions` into the matrix. The resolved
  default preset is pre-applied on open. `buildPermissionMatrixFromPreset` is no longer called from
  the form (it's now only the seed source) — applying = load the stored matrix JSON.
- Hooks: `useRolePresets()` (apply), `useManageRolePresets()` + CRUD mutations.

## 7. Semantic HTML / responsive / standards

- Dialogs: `<form>` + `<fieldset>`/`<legend>` per permission group, `<label>` for every control, real
  `<button>`s. Segmented toggle = `<nav>`/`role="tablist"` with `<button>`s.
- Matrix scrolls horizontally on mobile (`overflow-x-auto`), dialog `max-h-[90vh]` flex-col per the
  project dialog convention.
- DRY: one matrix editor, one matrix-validation loop (shared between role + preset create), one
  preset card component.

## 8. Tenant isolation (explicit)

Tenant Diar (or any non-JABNET) must never: see another tenant's presets, manage global presets,
create a global preset, or set a global default. Every list/create/update/delete filters by
`scope`+`mitra_id` and re-checks ownership server-side. A tenant admin forging `scope=global` or a
foreign `mitra_id`/`id` in the request body gets 403; the server ignores client-supplied `mitra_id`
for tenant presets (always uses `activeMitraId`).

## 9. Testing

- **Pure/unit:** a small tested helper for default-resolution order (tenant→global→none) and for the
  matrix-cleanse (keys ⊂ ALL_PERMISSION_KEYS, values valid) if extracted to `shared/`.
- **Manual on dev:**
  1. System-Admin JABNET: see 5 seeded global presets in Preset tab; create/edit/delete a global
     preset; set a default; toggle active → inactive disappears from tenant apply list.
  2. Tenant admin (Diar): Preset tab shows only Diar's tenant presets (no global management); create a
     tenant preset; it appears in Diar's role-create picker alongside active globals.
  3. Tenant admin cannot edit/delete a global or another tenant's preset (UI hidden + API 403 on
     forge).
  4. New-role form pre-applies the resolved default; applying any preset fills the matrix; save →
     reload → permissions correct (the original bug stays fixed).
- `npx tsc --noEmit` 0 errors; `npm run build` succeeds.

## 10. Out of scope

Preset versioning/history, bulk re-apply of a preset to existing roles, import/export of presets,
per-permission preset diffing. (Defer.)
