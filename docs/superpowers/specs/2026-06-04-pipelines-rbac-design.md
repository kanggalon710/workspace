# Spec — Pipelines Resource-Level RBAC (Phase 3)

> **Date:** 2026-06-04
> **Status:** Approved design, ready for implementation plan.
> **Program:** "Customizable Multi-Tenant Pipeline / Kanban" — Phase 3 of 6.
> **Builds on:** Phase 1 (engine) + Phase 2 (custom fields).

## Goal

Let admins control **which roles can access each pipeline, and at what level (view/edit)**.
Default behaviour is unchanged (opt-in): a pipeline is open to anyone with the `pipelines`
permission until its owner toggles "Batasi akses" and grants specific roles. Pipeline-level
only — stage-level and field-level access are out of scope for P3.

## Key Decisions (from brainstorming)

- **Granularity: pipeline-level, role-based.** Not stage/field/per-user (deferred / out of scope).
- **Opt-in restriction.** Per-pipeline `restricted` flag; OFF (default) = current behaviour
  (the mitra `pipelines` permLevel governs); ON = only explicitly-granted roles get access.
- **Approach A** — `restricted` flag on `pipelines` + a `pipeline_access` join table
  `(pipeline, role) → view|edit`. Rejected: encoding grants in the role `permissions` JSON
  (pollutes/!scales); per-user ACL (more overhead, user chose role-based).
- **Levels:** `view` (read board+cards) and `edit` (mutate). `none` = no row / no access.
- **Module entry still gated by the `pipelines` key** (≥ read) for nav + list; the per-pipeline
  resolver is the finer check inside the module.
- Build the access UI **with the design system** (not barebone).
- DB changes target `jabnet_fiber_dev` first; new table + new column via startup
  `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (codebase
  convention, NOT `db:push`).

## Data Model (`shared/schema.ts`)

```ts
// new column on the existing pipelines table
pipelines.restricted   int NOT NULL DEFAULT 0     // "restricted" 0/1

// new join table
pipeline_access
  id          int autoincrement pk
  mitraId     int notNull default 1                // "mitra_id"
  pipelineId  int notNull                          // "pipeline_id" → pipelines.id
  roleId      int notNull                          // "role_id" → roles.id
  level       varchar(8) notNull                   // "view" | "edit"
  createdAt   text notNull
  updatedAt   text
  // unique (pipeline_id, role_id); index (mitra_id, pipeline_id)
```

Types: `PipelineAccess` (`$inferSelect`); `PipelineAccessLevel = "view" | "edit"`.

**Migration (startup, in `server/storage.ts`):**
- `ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS restricted INT NOT NULL DEFAULT 0`.
- `CREATE TABLE IF NOT EXISTS pipeline_access (...)` with the unique + index.
Both additive/idempotent. (MySQL 8 on cPanel supports `ADD COLUMN IF NOT EXISTS`; matches
existing startup ALTERs in storage.ts.)

## Access Resolution

### Pure helper (`server/pipeline-access-helpers.ts` + test)
```ts
type Level = "none" | "view" | "edit";
resolvePipelineLevel(args: {
  isAdmin: boolean;          // isSystemAdmin OR mitra-admin (mitra 1 legacy admin)
  restricted: boolean;       // pipeline.restricted === 1
  keyLevel: "none"|"read"|"write";  // the user's `pipelines` permLevel
  grantLevel: Level;         // grant for the user's effective role on this pipeline ("none" if absent)
}): Level
  // isAdmin                          → "edit"
  // !restricted                      → write→"edit", read→"view", none→"none"
  // restricted                       → grantLevel ("edit"|"view") else "none"
```

### Backend resolver (`server/routes.ts` or a small module)
`getPipelineLevel(req, pipelineId): Promise<Level>`:
1. If `isJabnetRoot(req)` or the legacy mitra-1 admin → `"edit"`.
2. Load the pipeline (mitra-scoped); if missing → `"none"`.
3. `grantLevel`: if `pipeline.restricted`, look up `pipeline_access` for `(pipelineId, req.authUser.effectiveRoleId)`; else `"none"`.
4. `return resolvePipelineLevel({ isAdmin, restricted, keyLevel: req.authUser.permLevels["pipelines"], grantLevel })`.

A request-scoped memo avoids re-loading the same pipeline within one request.

### `req.authUser.effectiveRoleId` (integration point)
`getUserEffectivePermissionsAtMitra(userId, mitraId)` currently returns
`{perms, canSeeAllData, roleName, isSystem}`. Extend it to also return `roleId` (the resolved
per-mitra role id — from `user_mitras.role_id`, falling back to the global `users.role_id`).
`authMiddleware` sets `req.authUser.effectiveRoleId = eff.roleId`. This is the per-mitra role,
distinct from the existing global `req.authUser.roleId`.

## Enforcement (`server/routes.ts`)

Replace the blanket per-route `requirePermission/requireWritePermission("pipelines")` checks in
the pipeline block with the finer resolver (the module-entry key check stays):
- `GET /api/pipelines` → after `listPipelines`, filter to those where `getPipelineLevel ≥ view`,
  and attach the caller's `level` to each returned pipeline.
- `GET /api/pipelines/:id`, `/:id/stages`, `/:id/cards`, `/:id/fields`, `GET .../cards/:cardId`
  → require `≥ view` on the owning pipeline (resolve pipeline via the card/field for card-scoped
  routes). 403 otherwise. Attach the caller's `level` to the pipeline-detail response.
- All mutations (pipeline update/archive/reorder; stage CRUD/reorder; card CRUD/move; field
  CRUD/reorder; `PUT .../values`) → require `edit` on the owning pipeline. 403 otherwise.
- Keep `requireWritePermission("pipelines")` as the coarse gate before the fine check (defence
  in depth + clear "feature is read-only for your role" message).

New endpoints (gated: `edit` on the pipeline OR admin):
- `GET  /api/pipelines/:id/access` → `{ restricted: boolean, grants: [{roleId, level}] }`.
- `PUT  /api/pipelines/:id/access` → body `{ restricted: boolean, grants: [{roleId, level}] }`
  — sets `restricted` + replaces all grants for the pipeline (delete-then-insert in a txn-ish
  loop; validate `level ∈ {view,edit}` and roleId belongs to the mitra). Responds `sendSuccess`.

All responses use `sendSuccess` (envelope). All storage tenant-scoped via `getMitraId()`.

## Storage (`server/storage.ts`)
- `getPipelineAccess(pipelineId)` → `{ restricted, grants: [{roleId, level}] }`.
- `setPipelineAccess(pipelineId, restricted, grants)` → update `pipelines.restricted`; replace
  `pipeline_access` rows for the pipeline (delete existing, insert new), mitra-scoped.
- `getGrantLevelForRole(pipelineId, roleId)` → `"view"|"edit"|"none"` (single-row lookup).
- Extend `getUserEffectivePermissionsAtMitra` return with `roleId`.

## Frontend (`client/`)
- **`usePipelineAccess(pipelineId)`** + `setAccess` mutation (`PUT .../access`).
- **`PipelineAccessDialog`** (`client/components/pipelines/PipelineAccessDialog.tsx`) — opened
  from the board/list when the caller has `edit`: a "Batasi akses" `Switch` + the mitra's roles
  (from `GET /roles`) each with a none/view/edit selector (segmented control or `Combobox`).
  Saves via `setAccess`. Design-system components.
- **List page** — server already filters; add a small "Terbatas" `StatusBadge` on
  `restricted` pipelines. An "Akses" affordance per pipeline (or inside the board).
- **Board** — derive `writable` from the pipeline's resolved `level` (`edit`), not the global
  `canWrite("pipelines")`; `view`-only users see a read-only board (existing read-only paths).
  Show the "Akses" button only when `level === "edit"`.
- Hooks read the caller's `level` off the pipeline detail/list responses.

## Testing
- Unit (`server/pipeline-access-helpers.test.ts`): `resolvePipelineLevel` full matrix — admin
  bypass; unrestricted maps key (write/read/none); restricted uses grant (edit/view); restricted
  + no grant → none. `npx tsx --test`.
- Manual on dev (`jabnet_fiber_dev`; restart to ALTER + create table): create a pipeline,
  "Batasi akses" ON, grant role X = view, role Y = edit; log in as X (read-only board, no edit,
  appears in list), as Y (full), as Z with neither grant (pipeline absent from list, 403 on
  direct id), as admin (full always); a non-restricted pipeline still follows the `pipelines`
  key; cross-mitra isolation; `GET /api/pipelines` filters correctly. `npm run typecheck` 0;
  `npm run build` OK.

## Out of Scope (P3)
Stage-level access (who can view/move into-out-of a stage); field-level visibility/edit; per-user
(non-role) ACLs; per-action grants beyond view/edit; pipeline ownership transfer.

## Consistency with Memory
- [[project-pipelines-engine]] — P3 of the 6-phase program.
- [[reference-api-response-envelope]] — all new endpoints use `sendSuccess`; reviews check shape.
- [[reference-tenant-isolation-gotchas]] — every access query filters `mitra_id` via `getMitraId()`;
  grants are role-scoped and the effective role is resolved per-mitra (not the global role).
- [[reference-per-mitra-roles]] — `pipeline_access.role_id` references per-mitra roles; admin/
  System-Admin bypass mirrors the existing permission gates.
- New table/column via startup `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT
  EXISTS` (codebase convention), not `db:push`.
