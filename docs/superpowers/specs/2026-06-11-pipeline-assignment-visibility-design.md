# Spec — Cross-Tenant Assignment Visibility (JABNET)

> Date: 2026-06-11 · Sub-project **A** of the "Assignment Visibility + Tenant Audit + Cleanup" epic.
> Build on `dev`. Sequencing decided: **A → B (tenant audit), defer C/D**. This spec covers **A only**.

## Goal

Let a **JABNET sysadmin** optionally see and assign users from *other* mitras in pipeline
assignment pickers, while keeping the **default clean (JABNET-only)** and **non-JABNET tenants fully
isolated**. Cross-tenant assignment is **record-only** — the assigned user gains **no access** to the
JABNET card.

## Platform model (confirmed with user)

- **JABNET (mitra 1) is the platform owner.** Its **admins and system admins** get special
  cross-tenant reach. In code this is exactly the existing `isSystemAdmin(req)` helper
  (`server/routes.ts:398`): true for the JABNET System-Admin role *or* the legacy JABNET admin
  (`role === "admin" && !roleId && activeMitraId === 1`). We reuse it; we do **not** invent a new gate.
- **Every other mitra is completely isolated** — their users *and* admins only ever touch their own
  tenant's data. This holds even under URL/request tampering (enforced server-side).

## Decisions (confirmed)

1. **Gate = `isSystemAdmin(req)`** (JABNET owner privilege). Only these callers may request
   cross-tenant; the toggle UI only renders for them.
2. **Default = JABNET-only for everyone**, including sysadmins. This *tightens* today's behavior
   (currently sysadmins get all tenants' users by default).
3. **Assign semantics = record-only, no access grant.** A cross-tenant assignee is saved and shown,
   but gains zero access to the JABNET card; complete isolation for non-JABNET users still holds.
4. **One reusable `<AssigneePicker>`** (single + multi modes) used by all five picker contexts.
5. **Visibility ≠ access.** Even with a user visible/selected, every write still passes the existing
   permission / capability / ownership checks. The only relaxation is item 7 below.

## The single chokepoint (why this is small)

Every picker flows through one hook → one endpoint → one storage method:

- Hook: `useAssignableUsers()` — `client/hooks/usePipelines.ts:84`
- Endpoint: `GET /api/pipelines/assignable-users` — `server/routes.ts:4771`
- Storage: `getAssignableUsers(activeMitraId, isSystemAdmin)` — `server/storage.ts:6547`

Five UI consumers:
1. `CardDetailModal.tsx` — primary assignee Combobox + secondary-assignee Combobox/chips.
2. `BulkActionBar.tsx` (`BulkOpForm`) — single picker with an `__unassign__` option.
3. `FieldValueInput.tsx` — `UserSelect` (single) + `UserMultiSelect` (multi) custom field types.
4. `RuleActionEditor.tsx` — automation "assign" action (receives `staffUsers` from `PipelineRulesDialog`).

## 1. Server — endpoint

`GET /api/pipelines/assignable-users?scope=cross`

- Parse `scope`. `crossRequested = (scope === "cross")`.
- `allowCross = crossRequested && isSystemAdmin(req)`. (Non-sysadmin asking for cross → silently
  ignored, returns JABNET-only list. No 403 — fail safe, not loud.)
- Call `storage.getAssignableUsers(req.authUser!.activeMitraId, allowCross)`.
- Keep the existing `requirePermission(req, res, "pipelines")` gate.

## 2. Server — storage

Change signature to `getAssignableUsers(activeMitraId: number|null, allowCrossTenant: boolean)`
returning `Array<{ id; name; username; role; mitraId; mitraName }>`.

- **Default (allowCrossTenant=false):** users whose `user_mitras.mitra_id === activeMitraId`
  (existing `getUserIdsInMitra` path). Each row labeled with the active mitra's name.
- **Cross (allowCrossTenant=true):** all users, each labeled with their **primary mitra** (lowest
  `user_mitras.id` for that user, or first membership). Batch-join `user_mitras` → `mitras` once
  (Map<userId, {mitraId, mitraName}>), **no N+1**. A user in multiple mitras shows their primary
  label; JABNET-only users show "JABNET".
- Note: today's branch keys off `isSystemAdmin`; the new param is the explicit cross-tenant intent
  (already gated in the route), decoupling "is sysadmin" from "wants cross-tenant view".

## 3. Server — relax assignee validation for sysadmin cross-tenant (record-only)

Three write paths currently (or should) verify the assignee is a pipeline member; that rejects a
cross-tenant user. Relax **only** when `isSystemAdmin(req)`:

- **Secondary assignees** — `POST /api/pipelines/cards/:cardId/assignees` (`routes.ts:5345`): the
  `canUserAccessPipeline(userId, pipelineId)` check (`:5353`) is **skipped when `isSystemAdmin(req)`**.
  Still verify the user **exists and is active** (`storage.getUser(userId)`).
- **Primary assignee** — `PATCH /api/pipelines/cards/:cardId` (`routes.ts:4929`): audit whether it
  validates assignee membership. If it does, apply the same sysadmin relaxation; if it doesn't,
  add the **exists + active** check (so we never store a dangling/invalid id) and allow cross-tenant
  for sysadmin.
- **Multi-assignee custom field** — values written via the card-values path. Validate each id
  exists + active; allow cross-tenant ids only for sysadmin (non-sysadmin restricted to active-mitra
  members, matching the picker they can see).

**No access is granted** anywhere — we do **not** add `pipeline_access` rows or alter
`canUserAccessPipeline`'s *read* behavior. The cross-tenant user still cannot view the card.

## 4. Client — reusable `<AssigneePicker>`

New `client/components/pipelines/AssigneePicker.tsx`:

- Props: `mode: "single" | "multi"`, `value`, `onChange`, optional `includeUnassign`
  (for bulk), `size`, `placeholder`, `disabled`.
- Internally consumes `useAssignableUsers(crossTenant)` and renders the shared `Combobox`
  (single) or a multi-select (chips + Combobox) — reusing existing primitives, not reinventing.
- Renders each option as `name (mitraName)` **only when the cross-tenant view is active**; in
  JABNET-only mode the tenant suffix is omitted (all JABNET, no noise).
- **"User Source" segmented toggle** (`JABNET Only` ⟷ `Show Cross-Tenant`) rendered **only when**
  `isSystemAdmin && activeMitraId === JABNET_MITRA_ID (1)`. State persisted per-user in
  `localStorage` (key e.g. `pipeline_assignee_cross_tenant`), default `JABNET Only`.
- Single source of truth for the toggle + label logic; all five contexts delegate to it.

Client auth: `<AssigneePicker>` reads `isSystemAdmin` + `activeMitraId` from `AuthContext`. If
`isSystemAdmin` is not currently exposed client-side, expose it on the auth user object (it is
already computed server-side at login — `routes.ts:680`).

`useAssignableUsers(crossTenant?: boolean)` (`usePipelines.ts:84`): append `?scope=cross` when
`crossTenant`, include `crossTenant` in the query key so the two lists cache separately.

## 5. Refactor the five consumers

Replace the inline Combobox/user-list logic in `CardDetailModal`, `BulkActionBar`/`BulkOpForm`,
`FieldValueInput` (`UserSelect` + `UserMultiSelect`), and `RuleActionEditor` with `<AssigneePicker>`.
`PipelineRulesDialog` stops threading `staffUsers` to `RuleActionEditor` for the assign action — the
picker fetches its own list. Keep each call site's existing value/onChange contract intact.

## 6. Semantic HTML / a11y (scoped to the new component)

- The toggle is a real `<fieldset>` + `<legend>` with two `<label>`+`<input type="radio">` (or an
  accessible segmented control), keyboard-navigable.
- Picker triggers are `<button>`; options are focusable list items (the existing `Combobox`/`Command`
  primitives already provide this). No `div`-as-button.

## 7. Out of scope (→ later sub-projects / future)

- Broad pipeline cleanup / DRY / responsive audit (sub-project **C**).
- Performance (picker pagination/search-as-you-type for very large user counts) — sub-project **D**.
  This spec loads the full list (user counts are small today); paging is a D concern.
- Granting cross-tenant users any *read* access to JABNET cards (explicitly rejected).
- Cross-tenant visibility for non-assignment features (reports, dashboards, etc.).

## 8. Testing

- **Pure/unit:** primary-mitra label resolution (user in multiple mitras → primary; JABNET-only →
  "JABNET") as a small tested helper if logic is non-trivial.
- **Manual on dev:**
  1. Non-sysadmin JABNET user: no toggle; picker shows only JABNET users. Forcing `?scope=cross` via
     devtools still returns JABNET-only.
  2. Sysadmin, JABNET active: toggle visible, default `JABNET Only`. Flip to cross-tenant → other
     tenants' users appear with `(Partner X)` labels.
  3. Assign a cross-tenant user (primary + secondary + multi field) → saved + name shows on card.
  4. Log in as that cross-tenant user under their own tenant → the JABNET card is **not** visible
     anywhere (lists, search, "assigned to me").
  5. Sysadmin with a **non-JABNET** mitra active: no toggle (gate is JABNET-only).
- `npx tsc --noEmit` 0 errors; `npm run build` succeeds.

## 9. Acceptance criteria (maps to request items 1–3)

1. ✅ JABNET sysadmin can choose JABNET-only or cross-tenant users in every assignment picker.
2. ✅ Default shows only JABNET users (for everyone, incl. sysadmins).
3. ✅ Cross-tenant visibility never bypasses permission/capability/ownership; only the
   sysadmin-initiated assignee-membership check is relaxed (record-only, no read access).
4. ✅ Non-JABNET tenants remain fully isolated; cross-tenant assignees gain no card access.
