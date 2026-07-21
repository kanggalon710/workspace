# Spec - Granular Pipeline RBAC: Role Capability Matrix (Slice H1)

> Date: 2026-06-08 · Status: **Approved (pending user spec review)** · Target: dev branch + `jabnet_fiber_dev`
> Part of the Pipelines Engine program - see [[project-pipelines-engine]]. **Slice H1** of the granular-RBAC
> feature. H2 (per-user grants) is a separate follow-up spec that layers on this.

## Context

Today a pipeline's `pipeline_access` grant has a single `level` (`view` | `edit`); `edit` is monolithic -
it permits stages, fields, automation, cards, rename/archive, access config, AND delete. Resolution
(`getPipelineLevel` → `resolvePipelineLevel`, `server/routes.ts:4228`, `server/pipeline-access-helpers.ts:4`):
System-Admin/creator → `edit`; an **open** pipeline (`restricted=0`) derives the level from the global
`pipelines` permission (`write`→edit, `read`→view); a **restricted** pipeline uses the per-role
`pipeline_access` grant. Mutations require `edit` via `requirePipelineEdit`; reads require `view`.

The user wants to split that monolithic `edit` into **per-capability** control assignable **per role** (H1)
and later per user (H2): who can create/edit/delete pipelines, stages, automation, cards, and fields.

Decision (brainstorm): a **capability matrix** (not tiers), **per role** in H1.

## Goals / Non-goals

**Goals (H1)**
1. A fixed capability set enforced per pipeline per role; restricted pipelines grant a chosen subset.
2. Every pipeline mutation route gated by its specific capability (not a blanket `edit`).
3. Access dialog becomes a role × capability grid.
4. Full **back-compat**: open pipelines + existing `view`/`edit` grants behave exactly as today.

**Non-goals**
- **Per-user grants** - slice H2 (new `pipeline_user_access` table + resolver merge + user UI).
- Capability control over **creating** a pipeline (that stays global `pipelines:write` - not per-pipeline).
- Stage/field-level (sub-pipeline) ACLs; changing the global `pipelines` permission semantics.

## Coding standards
Per [[feedback-coding-standards]]: capability keys/labels + the resolver in a **pure, shared/testable** module
(client + server + tests agree); semantic HTML5 grid (`<table>`/`<fieldset>` + `<input type="checkbox">` with
labels); DRY (one resolver; `requirePipelineCapability` wraps it for all routes); SoC. Startup migration uses
info_schema guard + plain `ALTER` ([[reference-startup-add-column]]).

## Design

### 1. Capabilities + data model

**Capability keys** (fixed), defined in a pure module `shared/pipelineCapabilities.ts` with Indonesian labels:
`view`, `cards`, `stages`, `fields`, `automation`, `manage`, `delete`.
- `cards` = create/update/move/delete cards + comments + set field values + followers.
- `stages` = stage create/update/delete/reorder. `fields` = field create/update/delete/reorder.
- `automation` = rules list/create/update/delete. `manage` = rename/archive pipeline + GET/PUT access config.
- `delete` = delete pipeline. **Any** non-empty capability set implies `view`.

**Storage:** add `capabilities TEXT` (JSON array of capability keys) to `pipeline_access` (info_schema-guarded
`ALTER`). Keep the existing `level` column for back-compat: when a row's `capabilities` is null, derive it from
`level` (`edit` → all seven, `view` → `["view"]`). New grants write `capabilities`.

**Pure resolver** (`server/pipeline-access-helpers.ts`, beside the existing one):
```ts
export type PipelineCapability = "view"|"cards"|"stages"|"fields"|"automation"|"manage"|"delete";
export function resolvePipelineCapabilities(args: {
  isAdmin: boolean; isCreator: boolean; restricted: boolean;
  keyLevel: "none"|"read"|"write";
  grantCapabilities: PipelineCapability[]; // role's granted caps (already derived from level if legacy)
}): Set<PipelineCapability>;
```
- admin || creator → all capabilities.
- `!restricted` → `write` → all; `read` → `{view}`; else ∅. (Preserves today's open-pipeline behavior.)
- `restricted` → the grant's capability set; if non-empty, add `view`.

A pure `capabilitiesFromLevel(level)` (legacy bridge) + `deriveLevel(caps)` (caps → `view|edit` for legacy
readers / the board's coarse `writable`) live in the shared module.

### 2. Resolver + route re-gating (`server/routes.ts`)

- `getPipelineCapabilities(req, pipelineId): Promise<Set<PipelineCapability>>` - loads the pipeline, computes
  `isCreator`, `restricted`, `keyLevel` (`permLevels["pipelines"]`), the role's `grantCapabilities`
  (`storage.getGrantCapabilitiesForRole(pipelineId, effectiveRoleId)`), and returns
  `resolvePipelineCapabilities(...)`.
- `requirePipelineCapability(req, res, pipelineId, cap): Promise<boolean>` → 403
  `"Akses ditolak: butuh izin '<label>' pada pipeline ini"` when `cap` absent. `requirePipelineView` →
  has `view` (i.e. set non-empty / contains view).
- Re-gate (keep `requireWritePermission("pipelines")` as the outer gate; replace `requirePipelineEdit` with the
  capability):

 | Route(s) | Capability |
 |---|---|
 | PATCH pipeline, POST archive, GET+PUT `/access` | `manage` |
 | DELETE pipeline | `delete` |
 | stages POST/PATCH/DELETE/reorder | `stages` |
 | fields POST/PATCH/DELETE/reorder | `fields` |
 | rules GET/POST/PATCH/DELETE | `automation` |
 | cards POST/PATCH/move/DELETE, comments POST/DELETE, followers, values PUT | `cards` |
 | all GET (pipeline detail, stages, cards, card detail, comments, followers, fields, photo) | `view` |
 | POST `/api/pipelines` (create) | unchanged - global `pipelines:write` only |

- The list endpoint (`GET /api/pipelines`) keeps returning a `level: "view"|"edit"` per pipeline (derived via
  `deriveLevel`) so the board's existing coarse `writable` keeps working, **plus** a `capabilities: string[]`
  for finer UI gating. `getPipelineLevel`/`requirePipelineEdit` are removed once all call-sites move to
  capabilities (or kept only if a residual "any edit" site remains - none expected).

### 3. Access dialog + API/client

- `GET /api/pipelines/:id/access` → `{ restricted, grants: [{ roleId, capabilities: PipelineCapability[] }] }`.
- `PUT /api/pipelines/:id/access` body `{ restricted, grants: [{ roleId, capabilities }] }`;
  `storage.setPipelineAccess` writes `restricted` + replaces role rows storing `capabilities` JSON and a
  derived `level` (`deriveLevel(caps)`) for legacy reads. Gated by `manage`.
- `PipelineAccessDialog`: keep the restricted toggle; when restricted, render a **role × capability grid** -
  one row per role, a checkbox/toggle-chip per capability (Lihat / Kelola Kartu / Kelola Stage / Kelola Field /
  Kelola Otomasi / Kelola Pipeline / Hapus). Checking any capability auto-checks + locks `Lihat`.
  `usePipelineAccess`/`setAccess` types move to the capabilities shape.
- **Board UI gating:** `PipelineBoardPage` gates the Field / Akses / Otomasi / Settings(+delete) buttons by
  the pipeline's `capabilities` (`fields`/`manage`/`automation`/`manage`/`delete`), falling back to the
  derived `level` (`writable`) when capabilities are absent. Server stays the source of truth.

## Files

| File | Change |
|---|---|
| `shared/pipelineCapabilities.ts` (+ `.test.ts`) | **New.** Capability keys/labels, `ALL_PIPELINE_CAPABILITIES`, `capabilitiesFromLevel`, `deriveLevel`. |
| `server/pipeline-access-helpers.ts` (+ test) | `resolvePipelineCapabilities` (pure). |
| `shared/schema.ts` | `pipeline_access.capabilities TEXT`. |
| `server/storage.ts` | startup `ALTER`; `getPipelineAccess`/`setPipelineAccess` capabilities; `getGrantCapabilitiesForRole`. |
| `server/routes.ts` | `getPipelineCapabilities`, `requirePipelineCapability`, re-gate routes, access GET/PUT shape, list `level`+`capabilities`. |
| `client/hooks/usePipelines.ts` | `PipelineAccessData` + list/detail capability types. |
| `client/components/pipelines/PipelineAccessDialog.tsx` | role × capability grid. |
| `client/pages/PipelineBoardPage.tsx` | capability-gated toolbar buttons (fallback to `writable`). |

## Testing
- **Pure (`npx tsx --test`):** `resolvePipelineCapabilities` - admin/creator→all; open `write`→all / `read`→
  `{view}` / `none`→∅; restricted with explicit caps → that set + `view`; restricted empty → ∅;
  `capabilitiesFromLevel("edit")`→all, `("view")`→`["view"]`. `deriveLevel` maps caps → coarse legacy level:
  any edit-class cap (cards/stages/fields/automation/manage/delete) → `"edit"`; else `view` present → `"view"`;
  else `"none"`. Tests: `deriveLevel(all)`→`edit`, `(["cards"])`→`edit`, `(["view"])`→`view`, `([])`→`none`.
- **Gates:** `npm run typecheck` = 0; `npm run build` green.
- **Manual (dev):** restrict a pipeline, grant role X only `cards` → as that role: edit cards OK; 403 on
  stages/fields/automation/delete; those toolbar buttons hidden; creator + System-Admin still do everything;
  an existing `edit` grant (legacy row) still does everything; an open pipeline unchanged.

## Multi-tenant / RBAC
Grants stay mitra-scoped (`pipeline_access.mitra_id`); System-Admin + creator bypass unchanged; global
`pipelines:write` remains the outer gate for all mutations; create-pipeline unchanged.

## Risks
1. **Re-gating ~25 routes** - 1:1 capability mapping table above; the manual matrix check verifies each.
2. **Back-compat** - legacy `level` rows derive caps; open pipelines + global perm unchanged (pure-tested);
   `deriveLevel` keeps the board's coarse `writable` working.
3. **`requirePipelineEdit` removal** - every call-site moves to a specific capability; grep to confirm none
   left (or keep the helper unused-safe). 
4. **Dialog data migration** - old grants render as their derived capability set; saving rewrites them with
   explicit `capabilities`.

## Acceptance criteria
- Restricted pipelines grant capabilities per role via a matrix; each pipeline mutation enforces its specific
  capability server-side; toolbar buttons reflect capabilities.
- Open pipelines and existing view/edit grants behave exactly as before (back-compat).
- Creator + System-Admin retain full access; create-pipeline still global-gated.
- `capabilities` column added (no destructive migration); typecheck 0, build green, pure resolver tested;
  mitra isolation unchanged. (Per-user grants deferred to H2.)
