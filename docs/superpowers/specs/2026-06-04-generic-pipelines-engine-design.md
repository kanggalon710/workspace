# Spec — Generic Pipelines Engine (Phase 1)

> **Date:** 2026-06-04
> **Status:** Approved design, ready for implementation plan.
> **Program:** "Customizable Multi-Tenant Pipeline / Kanban" — Phase 1 of 6 (see Roadmap).

## Goal

Give each mitra the ability to **create their own Kanban pipelines** — define stages,
add cards, drag cards between stages — fully tenant-isolated and permission-gated. This is
a **new, standalone module** (`/pipelines`) that lives **alongside** the existing hardcoded
`/leads` and `/collections` pipelines and shares **no tables** with them.

Phase 1 is the foundation: pipelines → stages → cards, with comments, an activity log, and
followers. Custom fields, resource-level RBAC, and the automation engine are explicitly
**later phases** and out of scope here.

## Program Roadmap (context — only P1 is specced here)

1. **P1 — Generic `/pipelines` engine (this spec).** Separate from leads/collections.
2. **P2 — Dynamic custom fields** per pipeline.
3. **P3 — Resource-level RBAC** (pipeline / stage / field / action granularity).
4. **P4 — No-code automation engine** (WHEN/IF/THEN, cross-pipeline).
5. **P5 — Migrate `/leads`** onto the engine.
6. **P6 — Migrate `/collections`** onto the engine — **highest risk, last.** Must preserve
   billing auto-open/close + reconciliation against a now-user-editable stage model. Gets
   its own dedicated spec + heavy verification when reached.

Each phase is its own spec → plan → implementation cycle. We do **not** design P2–P6 until
P1 ships and is proven.

## Key Decisions (from brainstorming)

- **Parallel build.** No shared tables with leads/collections. Collections keeps its billing
  wiring (auto-open on isolir, auto-close on payment, reconciliation) untouched. Zero billing
  risk in Phase 1.
- **Approach A — dedicated relational tables** (rejected: generalizing `collection_stages`,
  which would couple billing; rejected: JSON-document/EAV cards, which kill server-side
  filtering and make field-level RBAC painful later).
- **Card MVP = all four:** core fields, comments thread, activity log, followers/watchers.
- **`tags` as a JSON column** (no separate tag table yet — YAGNI until tags need management UI).
- **No SLA / WIP-limit fields** — meaningless without automation (P4). Deferred.
- **Attachments deferred** — they ride the separate base64→filesystem photo-storage plan, not
  new base64 columns here.
- **Access gate:** one new permission key `pipelines` (none/read/write) + a `pipelines` entry
  in `mitras.features`. Full field/stage-level RBAC is P3.
- **DB changes land on `jabnet_fiber_dev` first**, verified on `workspace-dev.jabnet.id`, then
  promoted to prod `jabnet_fiber`. Nothing touches prod schema until tested on dev.

## Data Model (`shared/schema.ts`)

All tables carry `mitra_id` and are resolved through `tenantContext` — same isolation
guarantee as the rest of the platform. Pattern mirrors `collection_stages`.

```ts
// pipelines — one row per user-defined board
pipelines
  id            int autoincrement pk
  mitraId       int notNull default 1
  name          varchar(255) notNull
  description   text
  color         varchar(16) notNull default "#0EA5E9"
  icon          varchar(64)                 // lucide icon name, nullable
  position      int notNull default 0       // ordering on the list page
  isArchived    int notNull default 0       // 0/1 soft archive
  createdBy     int notNull
  updatedBy     int
  createdAt     text notNull
  updatedAt     text

// pipeline_stages — columns of a board (mirrors collection_stages)
pipeline_stages
  id            int autoincrement pk
  mitraId       int notNull default 1
  pipelineId    int notNull                 // → pipelines.id
  label         varchar(255) notNull
  color         varchar(16) notNull default "#6B7280"
  position      int notNull default 0       // drag-drop order
  createdAt     text notNull
  updatedAt     text

// pipeline_cards — items on a board
pipeline_cards
  id            int autoincrement pk
  mitraId       int notNull default 1
  pipelineId    int notNull                 // → pipelines.id
  stageId       int notNull                 // → pipeline_stages.id
  title         varchar(255) notNull
  description   text
  assigneeId    int                         // → users.id, nullable
  priority      varchar(16) notNull default "medium"  // low|medium|high|urgent
  dueDate       text                        // ISO date, nullable
  tags          text                        // JSON array of strings, nullable
  position      int notNull default 0       // order within stage
  createdBy     int notNull
  updatedBy     int
  createdAt     text notNull
  updatedAt     text

// pipeline_card_comments
pipeline_card_comments
  id            int autoincrement pk
  mitraId       int notNull default 1
  cardId        int notNull                 // → pipeline_cards.id
  authorId      int notNull
  body          text notNull
  createdAt     text notNull

// pipeline_card_activity — auto-written audit of card lifecycle
pipeline_card_activity
  id            int autoincrement pk
  mitraId       int notNull default 1
  cardId        int notNull
  actorId       int notNull
  type          varchar(32) notNull         // created|moved|reassigned|edited|commented|follower_added|follower_removed
  detail        text                        // JSON {field, old, new} or {fromStage, toStage}
  createdAt     text notNull

// pipeline_card_followers
pipeline_card_followers
  id            int autoincrement pk
  mitraId       int notNull default 1
  cardId        int notNull
  userId        int notNull
  createdAt     text notNull
  // unique (cardId, userId)
```

**Indexes:**
- `idx_pipelines_mitra` on `(mitra_id, position)`
- `idx_pipeline_stages_mitra_pipeline` on `(mitra_id, pipeline_id, position)`
- `idx_pipeline_cards_mitra_pipeline_stage` on `(mitra_id, pipeline_id, stage_id, position)`
- `idx_pipeline_card_comments_card` on `(card_id)`
- `idx_pipeline_card_activity_card` on `(card_id)`
- `idx_pipeline_card_followers_card_user` unique on `(card_id, user_id)`

**Migration:** new tables via Drizzle `db:push` against `jabnet_fiber_dev` first. Tables are
additive (no ALTER on existing tables), so zero risk to existing data.

## Permissions & Feature Gate (`shared/schema.ts`)

- Add to `ALL_PERMISSIONS`: `{ key: "pipelines", label: "Pipelines (Kanban)", group: "Tools" }`.
- Add to `ALL_FEATURES`: `{ key: "pipelines", label: "Pipelines (Kanban)" }`.
- Add to `FEATURE_PERMISSIONS`: `pipelines: ["pipelines"]`.
- Auto-migration (`upgradePermissionsV412`-style) auto-grants the new key per existing rules
  on startup — no manual role edits.

**Enforcement:**
- View pipelines/board/cards → `hasPermission(req, "pipelines")` (read).
- Create/edit/archive pipeline, create/edit/reorder stages, create/edit/move/delete cards,
  comment, manage followers → `hasWritePermission(req, "pipelines")`.
- All reads/writes run under `tenantContext`; every query filters `mitra_id`. Cross-mitra
  access is impossible by construction (no `?mitra=` override in this module — JABNET-root
  cross-tenant viewing is out of scope for P1).

## Backend (`server/routes.ts` + `server/storage.ts`)

Storage methods (new section in `storage.ts`, mitra-scoped via `getMitraId()`):

```
Pipelines:  listPipelines(includeArchived) · getPipeline(id) · createPipeline(data)
            updatePipeline(id, data) · archivePipeline(id) · reorderPipelines(orderedIds)
Stages:     listStages(pipelineId) · createStage(data) · updateStage(id, data)
            deleteStage(id) · reorderStages(pipelineId, orderedIds)
Cards:      listCards(pipelineId) · getCard(id) · createCard(data) · updateCard(id, data)
            moveCard(id, toStageId, toPosition) · deleteCard(id)
Comments:   listComments(cardId) · addComment(cardId, body) · deleteComment(id)
Activity:   listActivity(cardId) · (internal) logActivity(cardId, type, detail)
Followers:  listFollowers(cardId) · addFollower(cardId, userId) · removeFollower(cardId, userId)
```

- **MySQL Drizzle gotchas honored** (per CLAUDE.md): no `.returning()` — insert then re-select
  by `insertId`; deletes use `affectedRows`; raw queries via `.execute()`.
- **Activity logging** is written inside the same storage methods that mutate cards
  (create/move/reassign/edit/comment/follower changes) so the timeline can't drift.
- **Stage delete guard:** refuse to delete a stage that still holds cards (force the user to
  move/delete cards first) — returns a 409 with a clear message.
- **Notifications:** on card create/move/reassign/comment, notify the assignee + all followers
  (except the actor) via the existing notification system. Reuse the notification helper used
  by announcements/bell.

REST endpoints (all under `authMiddleware`, mounted in main router):

```
GET    /api/pipelines                         list (default excludes archived; ?archived=1)
POST   /api/pipelines                          create
GET    /api/pipelines/:id                      one pipeline + its stages
PATCH  /api/pipelines/:id                      edit
POST   /api/pipelines/:id/archive              soft archive
POST   /api/pipelines/reorder                  body { orderedIds }

GET    /api/pipelines/:id/stages               list stages
POST   /api/pipelines/:id/stages               create stage
PATCH  /api/pipelines/:id/stages/:stageId      edit stage
DELETE /api/pipelines/:id/stages/:stageId      delete (guarded)
POST   /api/pipelines/:id/stages/reorder       body { orderedIds }

GET    /api/pipelines/:id/cards                list cards (optional ?q= title search, ?assignee=)
POST   /api/pipelines/:id/cards                create card
GET    /api/pipelines/cards/:cardId            card detail (+comments, activity, followers)
PATCH  /api/pipelines/cards/:cardId            edit core fields
POST   /api/pipelines/cards/:cardId/move       body { toStageId, toPosition }
DELETE /api/pipelines/cards/:cardId            delete

GET    /api/pipelines/cards/:cardId/comments   list
POST   /api/pipelines/cards/:cardId/comments   add
DELETE /api/pipelines/cards/comments/:id       delete (author or write)

GET    /api/pipelines/cards/:cardId/followers  list
POST   /api/pipelines/cards/:cardId/followers  add { userId }
DELETE /api/pipelines/cards/:cardId/followers/:userId  remove
```

## Frontend (`client/`)

- **Nav:** add "Pipelines" entry (group "Tools"), permission-filtered by `pipelines` key +
  feature flag. Add to Sidebar, BottomNav (mobile), and Command Palette.
- **`/pipelines` — list page** (`PipelinesPage.tsx`): `<PageHeader>` + grid of pipeline cards
  (name, color, icon, card count). Create/Edit/Archive dialogs. Uses design-system components
  only (`Card`, `Button`, `StatTile`, `EmptyState`, skeletons) — no hardcoded hex.
- **`/pipelines/:id` — board page** (`PipelineBoardPage.tsx`): Kanban columns = stages,
  draggable cards. **Reuse the drag-drop approach from `LeadPipelinePage`** for consistency.
  Inline stage management (add/rename/recolor/reorder) gated by `canWrite("pipelines")`.
  Per-column "add card". Board controls: text search by title + assignee filter.
- **Card detail drawer** (matches `UserDetailDrawer` pattern): editable core fields, comments
  thread, activity timeline, followers add/remove.
- **Data hooks** (`client/hooks/`): `usePipelines`, `usePipeline(id)`, `usePipelineCards(id)`,
  `useCard(cardId)` + mutations, via TanStack Query. Query keys namespaced `pipelines/*`.
  Optimistic update on card move for snappy drag-drop (rollback on error).
- **Mobile UX** per CLAUDE.md conventions (full-bleed negative margins, sticky header
  `pt-16 md:pt-6`, horizontal-scroll columns on small screens).

## Testing

- **Unit (server):** a pure helper module for the non-trivial logic — e.g.
  `reorderPositions(orderedIds)` / `computeMovedCardPositions(...)` and the stage-delete guard
  predicate — in `server/pipeline-helpers.ts` + `pipeline-helpers.test.ts`
  (`npx tsx --test`). Cover: reorder produces contiguous positions; move recomputes source +
  destination ordering; delete-stage-with-cards rejected; tenant filter present.
- **Manual (dev, `workspace-dev.jabnet.id` / `jabnet_fiber_dev`):**
  - As a mitra admin: create a pipeline, add 3 stages, add cards, drag between stages, reorder
    — verify persistence + activity log entries.
  - Comments + followers: add a comment, add a follower → assignee/follower gets a notification.
  - Archive a pipeline → drops off the default list, visible under `?archived=1`.
  - Permission: a `read`-only user sees the board but cannot mutate; a `none` user sees no nav.
  - **Isolation:** log in as a different mitra → sees none of the first mitra's pipelines;
    hitting another mitra's pipeline/card id by guessing → 404/403, never data.
  - Feature gate: disable `pipelines` for a mitra → nav + endpoints denied for that mitra.
- `npm run typecheck` → 0 errors. `npm run build` → succeeds.

## Rollout

1. Apply schema to **`jabnet_fiber_dev`** (Drizzle `db:push`) — additive only, no existing
   tables altered.
2. Deploy branch to `workspace-dev.jabnet.id`, run the manual checklist above.
3. Only after dev sign-off: promote to prod `jabnet_fiber` per the standard cPanel deploy
   (push `main` → GHA build → Update from Remote → Restart). **No prod schema change until the
   user explicitly OKs**, per platform rule.

## Out of Scope (Phase 1)

Custom fields (P2); resource-level RBAC for pipeline/stage/field/action (P3); automation rules
WHEN/IF/THEN + cross-pipeline (P4); migrating leads/collections (P5/P6); card attachments
(rides the filesystem-photo plan); cross-*pipeline* card moves; bulk / multi-select; SLA / WIP
limits; pipeline clone; import/export; reporting dashboard; webhooks; JABNET-root cross-mitra
viewing of another mitra's pipelines.

## Consistency with Memory

- `project-multitenant-mitra` / `reference-tenant-isolation-gotchas` — every table `mitra_id`,
  resolved via `tenantContext`; no global queries. Use `getUserIdsInMitra` if listing
  assignable users.
- `reference-collection-stages-roles` — `pipeline_stages` deliberately mirrors
  `collection_stages` (label/color/position) but **without** the `role` automation field;
  stage-driven automation is P4, not P1.
- `reference-per-mitra-roles` — the new `pipelines` permission key flows through the existing
  per-mitra role + feature-gating machinery (`FEATURE_PERMISSIONS`, `server/feature-gate.ts`).
