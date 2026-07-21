# Spec - Field-level Permissions (Phase 3b-i)

> Date: 2026-06-08 · Mitra-scoped · First sub-feature of Phase 3b (Advanced Permissions).

## Goal

Per (custom field × role) access control: **hidden / view / edit**. Lets an admin hide or
read-only-lock specific fields for specific roles, on top of the existing pipeline capability RBAC.
Composes with Phase 4 field-visibility rules. Field-level permissions are *overrides*; with no override
a field inherits the pipeline-level capability.

## Decisions (confirmed)

1. **Storage:** `fieldPerms { [roleId]: "hidden"|"view"|"edit" }` inside `pipeline_fields.config` (no new
   table; sits beside `visibleWhen`/`requiredWhen`/`multiple`).
2. **Enforcement (server):** strip `hidden` field values from card/board responses for the requester's
   role, send a `fieldAccess` map so the client can disable view-only inputs, and reject `PUT /values`
   writes to non-`edit` fields.
3. **Default:** no override → inherit the pipeline capability (`cards` capability → `edit`, otherwise
   `view`). Pipeline-admins (System-Admin / tenant Admin) bypass field permissions entirely (always edit).

## 1. Pure module - `shared/fieldPermissions.ts` (no DB, unit-tested)

```ts
export type FieldAccessLevel = "hidden" | "view" | "edit";
export function parseFieldPerms(config: string | null): Record<number, FieldAccessLevel>;
// reads config.fieldPerms; coerces keys to number; drops malformed/unknown levels.
export function resolveFieldAccess(
  field: { config: string | null },
  roleId: number | null,
  ctx: { isAdmin: boolean; baseEditable: boolean },
): FieldAccessLevel;
// isAdmin → "edit"; else fieldPerms[roleId] if present; else baseEditable ? "edit" : "view".
export function isFieldHiddenForRole(field, roleId, ctx): boolean;  // resolveFieldAccess === "hidden"
export function canEditField(field, roleId, ctx): boolean;          // resolveFieldAccess === "edit"
```
`baseEditable` = the requester has the pipeline `cards` capability (can mutate card values). `roleId` =
the requester's `effectiveRoleId` (per-mitra role). The module is pure (operates on the `config` string).

## 2. Server enforcement

A helper (in routes) `fieldAccessMap(req, fields)` → `Map<number, FieldAccessLevel>`: computes
`resolveFieldAccess(f, req.authUser.effectiveRoleId, { isAdmin: isPipelineAdmin(req), baseEditable: <user has "cards" cap on the pipeline> })` for each field. Used by:

- **Card detail GET (`/api/pipelines/cards/:cardId`)** and **board cards GET (`/api/pipelines/:id/cards`):**
  remove `values[fieldId]` for any field whose access is `hidden`; include a `fieldAccess` object
  (`{ [fieldId]: "view"|"edit" }`, hidden fields omitted) in the response so the client renders correctly.
- **`PUT /api/pipelines/cards/:cardId/values`:** for each submitted value, if the field's access for the
  requester is not `edit`, reject the row (return 403 with the field label, or skip - choose 403 to be
  explicit). Pipeline-admins bypass.
- **Export (`/cards/export`):** drop columns for fields that are `hidden` for the requester.

Resolution uses the requester's role; existing pipeline/mitra gating (`requirePipelineCapability`) stays.

## 3. Client

- **`CardDetailModal` (FieldCustomSection):** combine with Phase 4 - render a field only when
  `isFieldVisible(f, ctx)` **and** its `fieldAccess` (from the response) is not `hidden`; set the input
  `disabled` when access is `view`. Required-asterisk + save-gating logic unchanged (a `view`/hidden field
  can't be the cause of a blocked save since the user can't edit it). `save()` submits only editable +
  visible fields.
- **`BoardCard`:** hide chips for fields hidden to the current user (the board cards response already
  omits hidden values; ensure the chip render tolerates missing values - it already does via the
  `raw == null` guard, so no change may be needed; verify).

## 4. Editor - `ManageFieldsDialog`

Per field, a collapsible section **"Akses per Role"**: a grid of role → a select (`Default` / `Hidden` /
`View` / `Edit`). `Default` stores nothing (inherit). Saved into `config.fieldPerms` (only non-default
entries). Needs the mitra's roles (fetch via the existing roles endpoint). The section is shown/edited by
users with the `fields` capability (already the gate for the dialog).

## 5. Testing

`shared/fieldPermissions.test.ts`: `resolveFieldAccess` (admin → edit regardless of override; explicit
hidden/view/edit override; default inherit → edit when `baseEditable` else view; null roleId →
default), `parseFieldPerms` (valid map; malformed JSON → {}; unknown level dropped). Server/client wiring
via typecheck + build.

## Out of scope
- Action-level permissions (3b-ii) and conditional/row-level permissions (3b-iii).
- Who can create/delete/reorder fields (that stays the `fields` capability).
- Field perms affecting automation that sets field values (rules run as the system, not a role).
