# Spec — Leads→Pipeline Import Compatibility (Slice F)

> Date: 2026-06-07 · Status: **Approved (pending user spec review)** · Target: dev branch + `jabnet_fiber_dev`
> Part of the Pipelines Engine program — see [[project-pipelines-engine]]. **Slice F (final)** of the
> Pipeline/Kanban Enhancement PRD (PRD item **#9**). Touches only the dev import tooling (`tools/`) — no app
> code, no schema, no migration.

## Context

The leads→pipeline snapshot import (`tools/leadsToPipeline.ts` pure module + `tools/import-leads-to-pipeline.ts`
runner — see [[project-pipelines-engine]] P5 step 1, and [[reference-run-oneoff-script-cpanel]] for how it's
executed on dev) predates the new field types. Today it:
- maps **phone → `type:"phone"`** (already correct — no change),
- stores **lat/lng as two separate `number` fields** (`lat` pos 10, `lng` pos 11),
- sets `card.assigneeId = lead.assigned_to` directly (no tenant validation).

PRD #9 asks that an import recognize Phone as Phone (done), Coordinate as Coordinate, and map Assignee to a
tenant user — with a fallback when the user isn't found. Per the brainstorm: fold lat/lng into the new
**Coordinate** field (slice D), and resolve assignees against the JABNET tenant with a **Skip (+ optional
default)** fallback (no user-record creation).

`tools/` is outside `tsconfig` — gated by `npx tsx --test` + a `--help` smoke, not `npm run typecheck`.

## Goals / Non-goals

**Goals**
1. Emit a single `coordinate` field (`{"lat":n,"lng":n}`) instead of separate `lat`/`lng` number fields.
2. Resolve `card.assigneeId` against the active tenant's users; unmatched → `null`, or an optional
   `--default-assignee <userId>`.
3. Keep `phone` as `type:"phone"`; keep `odp_id`/`distance_m` (historical ODP snapshot).
4. Pure, tested mapping helpers; runner prints a clear summary.

**Non-goals (deferred)**
- Creating placeholder user records for unmatched assignees (rejected — mutating `users` during an import).
- Migrating the *already-imported* dev pipeline's existing lat/lng field values in place (the import is
  re-run with `--reset`, which rebuilds the pipeline).
- Any app-side change, schema, or migration; ongoing/live sync from `/leads` (future P5 work).

## Coding standards
Per [[feedback-coding-standards]]: pure testable mapping module; DRY (one `resolveAssignee`; reuse the
existing field-creation loop); minimal runner changes. `tools/` tests via `node:test` + `.js` imports.

## Design

### 1. Pure module — `tools/leadsToPipeline.ts`

- **`FieldDef.type`** union gains `"coordinate"`.
- **`LEAD_PIPELINE_FIELDS`:** remove `lat` (pos 10) and `lng` (pos 11); add
  `{ key: "coordinate", label: "Koordinat", type: "coordinate", showOnCard: false, position: 10 }`; renumber
  `source_lead_id` → position 11. (`odp_id` pos 8, `distance_m` pos 9 unchanged.)
- **`leadToFieldValues(lead)`:** replace the `["lat", lead.lat]` / `["lng", lead.lng]` entries with a single
  `coordinate` entry, emitted **only when both `lead.lat` and `lead.lng` are finite numbers**:
  `{ fieldKey: "coordinate", value: JSON.stringify({ lat: lead.lat, lng: lead.lng }) }`. If either is
  missing/non-finite, omit the coordinate value entirely (consistent with the module's "omit empty" rule).
- **`resolveAssignee(leadAssignedTo: number | null, validUserIds: Set<number>, defaultAssignee: number | null): number | null`**
  — returns `leadAssignedTo` if it is non-null and in `validUserIds`; else `defaultAssignee` if non-null; else
  `null`.
- **`leadToCard(lead, stageIdByKey, assigneeId)`** — gains an explicit `assigneeId` parameter (replacing the
  internal `lead.assigned_to ?? null`), so assignee resolution is centralized in the runner and unit-testable.

### 2. Runner — `tools/import-leads-to-pipeline.ts`

- Parse optional `--default-assignee <userId>` (integer; invalid → error + exit). Document it in `--help`.
- After connecting, load the tenant's valid user ids:
  `SELECT DISTINCT user_id FROM user_mitras WHERE mitra_id = ?` (MITRA_ID = 1) → `Set<number>`.
- Per lead: `const assigneeId = resolveAssignee(lead.assigned_to ?? null, validUserIds, defaultAssignee);`
  then `leadToCard(lead, stageIdByKey, assigneeId)`. Tally `matched` / `defaulted` / `skipped`.
- The existing generic field-creation + value-insert loops already handle the new `coordinate` field (it's
  just another `LEAD_PIPELINE_FIELDS` entry / `leadToFieldValues` row) — no special-casing.
- Summary line adds: `coordinate values written`, and `assignees: <matched> matched, <defaulted> default,
  <skipped> unassigned`.
- `--reset` cleanup is unchanged (already clears the prior pipeline + children).

### 3. Execution (manual dev step, unchanged mechanics)
Re-run on dev with `--reset` (see [[reference-run-oneoff-script-cpanel]]: bundle locally with esbuild →
scp → `node` on the box, since `tools/*.ts` is stripped from the deploy branch and tsx's esbuild binary is
missing there). Optionally pass `--default-assignee <id>`.

## Files

| File | Change |
|---|---|
| `tools/leadsToPipeline.ts` | `FieldDef` +`coordinate`; `LEAD_PIPELINE_FIELDS` lat/lng→coordinate; `leadToFieldValues` coordinate emit; `resolveAssignee`; `leadToCard` takes `assigneeId`. |
| `tools/leadsToPipeline.test.ts` | tests for coordinate fields/values, `resolveAssignee`, `leadToCard(assignee)`. |
| `tools/import-leads-to-pipeline.ts` | `--default-assignee`; load tenant user ids; resolve per lead; summary tallies. |

## Testing
- **Pure (`npx tsx --test tools/leadsToPipeline.test.ts`):**
  - `LEAD_PIPELINE_FIELDS` contains a `coordinate` field (type `"coordinate"`) and **no** `lat`/`lng` fields.
  - `leadToFieldValues`: both lat+lng finite → one `coordinate` value `{"lat":..,"lng":..}` and no `lat`/`lng`
    keys; missing lat or lng → no `coordinate` value.
  - `resolveAssignee`: in-set → id; not-in-set + default → default; not-in-set + no default → null; null
    lead assignee + default → default; null + no default → null.
  - `leadToCard(lead, stages, 7).assigneeId === 7`; `leadToCard(lead, stages, null).assigneeId === null`.
- **Smoke:** `npx tsx tools/import-leads-to-pipeline.ts --help` exits 0 and mentions `--default-assignee`.
- (No `npm run typecheck` coverage — `tools/` is outside tsconfig; the tsx test + smoke are the gates.)
- **Manual (dev, when the user re-runs):** `--reset` rebuild → "Leads (Marketing)" has a **Koordinat** field
  (map + wilayah/ODP info in the card modal) and validated assignees; summary tallies print.

## Multi-tenant / RBAC
The import is JABNET-only (MITRA_ID = 1); assignee validation uses that tenant's `user_mitras` membership, so
no cross-tenant assignee can be written. No app auth surface touched.

## Risks
1. **SQL-direct inserts bypass app validation** — `leadToFieldValues` must emit well-formed coordinate JSON;
   covered by tests.
2. **Re-run required** — the change only affects *new* imports; the existing dev pipeline must be rebuilt with
   `--reset` to gain the Coordinate field (manual dev step).
3. **`leadToCard` signature change** — internal to the tools module; update its callers + tests in the same
   slice.

## Acceptance criteria
- New imports emit one `coordinate` field (`{"lat":n,"lng":n}`), not separate lat/lng; phone stays `phone`.
- Assignees are validated against the JABNET tenant; unmatched → null or `--default-assignee`.
- Pure helpers tested; `--help` smoke passes; no app code/schema/migration; tenant isolation intact.
