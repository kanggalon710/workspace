# Tenant-Isolation Audit — Pipelines (Sub-project B)

> Date: 2026-06-12 · Sub-project **B** of the "Assignment Visibility + Tenant Audit + Cleanup" epic.
> Method: 6 parallel read-only auditor agents, one per area, each tracing every route → storage method
> → SQL/Drizzle. Verdicts are evidence-backed (file:line). Branch `dev`.

## Headline

**No confirmed cross-tenant data leak or cross-tenant write anywhere in the pipelines surface.**
All 62 pipeline routes and ~95 pipeline-domain storage methods are tenant-isolated by
defense-in-depth:

1. **Storage layer** — every pipeline-domain method opens with `const mitraId = getMitraId();`
   (AsyncLocalStorage, `server/tenant-context.ts`) and filters `WHERE mitra_id = ?` on every
   read/insert/update/delete. By-raw-id getters (`getCard`, `getCardAttachment`, `getMetricDef`,
   `getCommentPhotoMeta`, `getPipeline`, …) all carry `eq(mitraId)`, so a guessed foreign id returns
   `undefined` rather than leaking.
2. **Route layer** — every handler resolves capabilities through `getPipeline(id)` (mitra-scoped),
   so a foreign pipeline id yields an empty capability set → 403/404 before any data is touched.
3. **Context integrity** — the request's `mitraId` is the server-validated `activeMitraId`
   (membership-checked at `routes.ts:236`), never read from URL/body. `getMitraId()` throws if context
   is missing (fail-closed). `isSuperAdmin` in context is true only for JABNET (mitra 1) System-Admins.

Two items the storage agent flagged as SUSPECT were **resolved to PASS** by the route/engine agents:
- `addCardRelation` relies on the route calling `entityExistsInMitra` first — confirmed present
  (`POST /relations` gates the candidate by `entityExistsInMitra`, mitra-scoped → 404 on foreign id).
- `listAllTimeRules` is intentionally tenant-agnostic — confirmed the automation engine re-scopes each
  row via `withMitra(rule.mitraId)` (`server/pipeline-automation.ts:300`) before reading/firing.

## Findings & fixes (all low-severity hardening — none were cross-tenant breaches)

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | `POST /cards/:cardId/move` did not validate `toStageId` belongs to the card's pipeline (the bulk-move path did). A caller could point their own card at an arbitrary/cross-pipeline stage id, corrupting it and firing stage-enter automations against a foreign stage. **Not cross-tenant** (stage table is mitra-scoped) — data-integrity. | Low (integrity) | **FIXED** — `routes.ts` `/move` now checks `listStages(card.pipelineId)`, mirroring the bulk guard. |
| 2 | `PATCH`/`DELETE /pipelines/:id/rules/:ruleId` scoped the rule by `mitra_id` but not `pipelineId`. Cross-tenant was already safe; **within one mitra** a caller with automation rights on pipeline A could mutate/delete a rule belonging to pipeline B by passing A's id in the path. | Low (intra-tenant) | **FIXED** — both now bind `ruleId` to the path pipeline via mitra+pipeline-scoped `listRules(pid)` → 404 on mismatch. PATCH also de-duplicated a redundant `listRules` query. |
| 3 | `POST /cards/:cardId/followers` did not validate the followed `userId` (unlike `POST assignees`). A foreign-mitra user could be inserted as a follower row → stray notification only, **no read access** (follower status is never an authorization grant). | Low (hardening) | **FIXED** — now calls `validateAssignTarget(req, userId, pipelineId)`, identical to assignees. |
| 4 | Automation `notify` bell-target `bellUserId` was only type-checked at config time (no membership check). Contained on the read side (`getNotifications` filters by `activeMitraId`), so a non-member could never read the notification — but arbitrary/foreign user ids could be stored. | Low (hardening) | **FIXED** — `validateActionConfig` now takes `req` and validates `bellUserId` via `validateAssignTarget` (non-sysadmin must have pipeline access; JABNET sysadmin may target cross-tenant). |
| 5 | `GET /pipelines/:id/rules` built its assign/notify label map from global `storage.getAllUsers()` (all mitras). Only ids referenced by this mitra's own scoped rule actions were ever serialized, so no broad leak — but it was the flagged global-helper pattern. | Low (pattern) | **FIXED** — label map now sourced from `getAssignableUsers(activeMitraId, false)` (mitra-scoped). |

All fixes are server-side, reuse existing helpers (`validateAssignTarget`, `listStages`, `listRules`,
`getAssignableUsers`), and change no behavior for legitimate same-tenant requests. `tsc --noEmit` 0
errors; `npm run build` green.

## What was verified PASS (no change needed)

- **Pipeline / stage / field / access CRUD** (18 routes) — sub-resource mutations filter `mitra_id` on
  the stage/field row itself, so a foreign `:stageId`/`:fieldId` matches 0 rows even when the path `:id`
  is the caller's own pipeline.
- **Card lifecycle** — create/import server-assign `mitraId` from `activeMitraId` (never trusted from
  body); `/move` (now hardened), `/values` (field-id validated against the card's pipeline), `/bulk`
  (per-card `pipelineId` re-check).
- **Relations + search** — every candidate gated by `entityExistsInMitra`; all label resolution
  mitra-scoped.
- **Comments / attachments / photos** — the two by-raw-id content streams
  (`attachments/:id/raw`, `comments/:id/photo`) fetch via mitra-scoped storage → 404 on foreign id
  **before** streaming. Leak refuted.
- **Assignees** — sub-project A's `validateAssignTarget` confirmed wired on `POST assignees`.
- **Metrics + collection-config** — `:metricId` PATCH/DELETE double-guarded (parent-pipeline check +
  mitra-scoped storage); metric computation bounded to the pipeline's own cards.
- **Automation engine** — cross-pipeline/linked-sync actions validated at BOTH config time
  (`getPipelineCapabilities` on the target) and execution time (scoped `listStages`/`listFields`/
  `getSiblingCardInPipeline` return empty for foreign pipelines → action skipped). Assign actions gate
  on `canUserAccessPipeline`. Time-trigger worker re-scopes per rule.

## Out of scope (→ deferred sub-projects C/D)

- Broad DRY/responsive/semantic cleanup (C) and performance/picker pagination (D).
- Non-pipeline `getAllUsers()`/`getSetting()` callers (other domains) — the gotchas memo
  (`reference-tenant-isolation-gotchas`) tracks those; not part of the pipelines audit.
