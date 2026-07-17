# Spec — Action-level Permissions (Phase 3b-ii)

> Date: 2026-06-08 · Mitra-scoped · Second sub-feature of Phase 3b (Advanced Permissions).

## Goal

Split fine-grained card actions out of the coarse `cards` capability so a role can be granted, e.g.,
"view + comment" or "view + assign" without full card-edit. Actions: **comment, assign, export, import**.
`cards` remains a superset (grants all of them), so existing grants are unaffected.

## Decisions (confirmed)

1. **Action set:** `comment`, `assign`, `export`, `import`. (close/reopen have no generic-pipeline mapping;
   "upload" = comment photo; followers stay under `cards` — all out of scope.)
2. **Model:** the four are capabilities **implied by `cards`** (superset). They are meaningful for roles
   that do NOT have `cards` (e.g. view + comment). Legacy `edit`/`cards` grants keep every action.

## 1. Capability model — `shared/pipelineCapabilities.ts`

- Extend the union: `PipelineCapability = ... | "comment" | "assign" | "export" | "import"`.
- Add the four to `ALL_PIPELINE_CAPABILITIES` and `PIPELINE_CAPABILITY_LABELS`
  (`comment`→"Komentar", `assign`→"Tugaskan", `export`→"Export", `import`→"Import").
- `export const ACTION_CAPABILITIES = ["comment", "assign", "export", "import"] as const;`
- **Superset rule in `resolvePipelineCapabilities`:** after the capability set is computed, if it contains
  `"cards"`, add all `ACTION_CAPABILITIES`. (admin/creator/write → all already includes them via
  `ALL_PIPELINE_CAPABILITIES`.) This bakes the superset into the resolved set so route gating is a plain
  `set.has(action)`.
- `capabilitiesFromLevel("edit")` returns `[...ALL_PIPELINE_CAPABILITIES]` (now includes the actions) →
  back-compat: a legacy `edit`/`cards` grant can do every action.
- `EDIT_CLASS` is **unchanged** (the actions are NOT edit-class), so a grant holding only an action cap
  (e.g. `["view","comment"]`) still derives to `deriveLevel = "view"`.

## 2. Server enforcement (`server/routes.ts`)

- Export `GET /api/pipelines/:id/cards/export` → `requirePipelineCapability(..., "export")`.
- Import `POST /api/pipelines/:id/cards/import` → `requirePipelineCapability(..., "import")`.
- Comment `POST /api/pipelines/cards/:cardId/comments` and the comment delete route →
  `requirePipelineCapability(..., "comment")`.
- **Assign** — `PATCH /api/pipelines/cards/:cardId`: compute the body's changed keys; if the body changes
  **only** `assigneeId` → require `"assign"`; otherwise require `"cards"` (current behavior). Because
  `cards` expands to include `assign`, a `cards` role passes either branch; an assign-only role can only
  do assignee-only updates.
- All other card routes (create / move / delete / set-values / followers) stay on `cards`. The capability
  resolution + mitra/pipeline gating are otherwise unchanged.

## 3. Frontend

- **`PipelineAccessDialog`** — the role × capability grid iterates `ALL_PIPELINE_CAPABILITIES`, so the four
  new actions appear automatically. Add a one-line hint that the action capabilities apply to roles
  without full "Kelola Kartu".
- **`PipelineBoardPage`** — gate the Export button by `can("export")` and the Import button by
  `can("import")` (previously both used `can("cards")`; since `cards` expands to the actions, full-card
  roles are unaffected).
- **`CardDetailModal`** — accept the resolved capability list (passed from the board, which already has
  `pipeline.capabilities`); hide/disable the comment composer unless `comment`; disable the assignee
  selector unless `assign`. (Server enforces regardless; this is UX.)

## 4. Testing

Extend `shared/pipelineCapabilities.test.ts`: a resolved set containing `cards` also contains
`comment/assign/export/import` (superset); `capabilitiesFromLevel("edit")` includes the actions; a grant
`["view","comment"]` has `comment` but not `export`; `deriveLevel(["comment"])` === `"view"`. Server/client
wiring via typecheck + build.

## Out of scope
- close/reopen, separate upload cap, followers cap.
- Conditional/row-level permissions (3b-iii).
- Migrating /leads + /collections (Phase 7).
