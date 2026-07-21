# Import `/leads` → JABNET "Leads" Pipeline (dev snapshot) - Design

> First concrete step of P5 (leads → pipelines engine). Builds a **one-time, snapshot import**
> that creates a new "Leads (Marketing)" pipeline **for mitra JABNET (id 1)** in the existing
> `pipeline_*` engine, seeded from the live `leads`/`lead_activities` data - cards, stages,
> assignee, typed lead columns (as custom fields), activity timeline (as comments + activity),
> coordinates/ODP, and photo evidence. Done on a **dev branch against the dev DB**
> (`jabnet_fiber_dev`). The bespoke `/leads` page and `leads*` tables are the **read-only source**
> and are NOT modified. This lets us evaluate the engine on real lead data before deciding any
> later P5 phase.

**Base branch:** `feat/leads-to-pipeline-import` off `dev`.
**Status:** Approved design, ready for spec review.

---

## Goals / non-goals

- **Goal:** stand up a real "Leads" pipeline in `/pipelines` for JABNET, populated from current leads, with enough fidelity (fields, timeline, photos) to evaluate the engine as a leads replacement.
- **Non-goal (this step):** no ongoing sync, no two-way writes, no retiring `/leads`, no conversion/MikroTik/Meta-CAPI/attribution re-implementation, no production run. Those are later P5 phases.

## Verified preconditions (from code)

- Engine tables: `pipelines`, `pipeline_stages` (label,color,position), `pipeline_fields` (key,label,type,options,required,showOnCard,position; unique `(pipelineId,key)`), `pipeline_card_values` (cardId,fieldId,value; unique `(cardId,fieldId)`), `pipeline_cards` (title,description,assigneeId,priority,dueDate,tags,createdBy,createdAt,stageEnteredAt), `pipeline_card_comments` (cardId,authorId,body,createdAt), `pipeline_card_activity` (cardId,actorId,type,detail,createdAt). All carry `mitra_id`.
- Field types available: `text, textarea, number, currency, date, dropdown, multiselect, checkbox, user, phone, url` (`PIPELINE_FIELD_TYPES`).
- Lead constants in `shared/schema.ts`: `LEAD_STAGES`, `LEAD_STAGE_LABELS`, `LEAD_STAGE_COLORS`, `LEAD_CATEGORIES`, `LEAD_CATEGORY_LABELS`, lead `source` values. Reuse them (DRY).
- `lead_activities` types: `note, call, whatsapp, visit, stage_change, assigned, photo, converted`; photos at `photoPath` (relative to `JABNET_UPLOAD_ROOT`) with legacy `photoData` base64 fallback.
- Uploads helpers (`server/uploads.ts`): `streamPhoto(relativePath, res)`, `saveBase64Photo(slug, feature, idHint, dataUrl)`.
- Existing one-off tool pattern: `tools/legacy-sync-to-jabnet.mjs`, `tools/migrate-*.mjs` (standalone scripts, dotenv from private root, `mysql2`).
- **Engine gap:** card comments/activity have **no attachment column** - added below for photos.

---

## 1. Engine extension - photo on card comments

`pipeline_card_comments` gets a nullable `photo_path varchar(255)`:
- **Schema:** add `photoPath: varchar("photo_path", { length: 255 })` to the table def in `shared/schema.ts`.
- **Startup migration** (`server/storage.ts`, follow [[reference-startup-add-column]]): info_schema COUNT guard, then plain `ALTER TABLE pipeline_card_comments ADD COLUMN photo_path VARCHAR(255)` (DB rejects `ADD COLUMN IF NOT EXISTS`).
- **Serve endpoint:** `GET /api/pipelines/cards/comments/:id/photo` - mirrors the lead route (`server/routes.ts:7849`). Guards: `requirePermission("pipelines")` + the comment's card must be viewable (reuse `requirePipelineView` against the comment's pipelineId) + same mitra; then `streamPhoto(comment.photoPath, res)` (404 if no photo). Storage: `getCardCommentPhotoMeta(id)` returns `{ photoPath, cardId, pipelineId, mitraId }` (mitra-scoped).
- **Create path:** the comment-create storage method accepts an optional `photoPath`. (The import writes it directly; the in-app "add comment with photo" UI is out of scope here - only the import + render + serve are needed now. The existing comment-add UI is unchanged.)
- **Render:** in the card detail drawer's comment list, when a comment has `photoPath`, render a thumbnail `<img src={`/api/pipelines/cards/comments/${c.id}/photo`}>` (lazy) linking to the full image. Comments without a photo render unchanged. **Auth note:** `<img>` can't send a Bearer header, but the app's auth middleware already falls back to the `ftth_session` cookie (set at login; `server/routes.ts:177-181, 635-638`) exactly for this - the existing lead photo `<img>` relies on it - so a `requirePermission("pipelines")`-guarded endpoint authenticates the `<img>` request automatically. No new cookie work.

This is the only engine schema/UI change; everything else is the import script + pure mapping.

## 2. Pure mapping module - `tools/leadsToPipeline.ts` (+ test)

React-free, I/O-free, unit-testable. Imports the lead constants from `shared/schema`. Exports:
- `LEAD_PIPELINE_STAGES(): { key, label, color, position }[]` - derived from `LEAD_STAGES`/labels/colors.
- `LEAD_PIPELINE_FIELDS: { key, label, type, options?, showOnCard, position }[]` - the custom-field definitions: `phone`(phone), `address`(textarea), `category`(dropdown, options=LEAD_CATEGORIES), `source`(dropdown, options=lead sources), `district`(text), `village`(text), `notes`(textarea), `loss_reason`(text), `odp_id`(number), `distance_m`(number), `lat`(number), `lng`(number), `source_lead_id`(number). `showOnCard` true for phone/source/district.
- `leadToCard(lead, stageIdByStageKey): { title, stageId, assigneeId, priority, createdBy, createdAt, stageEnteredAt }` - maps a lead row to card columns (title=name; stage via `LEAD_STAGES`→stageId; assigneeId=assignedTo; priority; stageEnteredAt=updatedAt ?? createdAt).
- `leadToFieldValues(lead): { fieldKey, value }[]` - string-encodes each custom field value (numbers→String, null/empty omitted), incl. `source_lead_id = lead.id`.
- `classifyActivity(type): "comment" | "activity"` - note/call/whatsapp/visit/photo→comment; stage_change/assigned/converted→activity.
- `activityToComment(act): { body, authorId, createdAt, photoPathRef }` - body = `"[<TypeLabel>] " + content` (content passed through; for `photo` type with empty content, body = "[Foto]"); `photoPathRef` = act.photoPath (or null).
- `activityToActivity(act): { type, detail, actorId, createdAt }` - type passed through, detail = original content.

Stage/field **id** resolution (key→DB id) happens in the script after insert; the pure module deals in keys only.

## 3. Import script - `tools/import-leads-to-pipeline.ts`

Run: `npx tsx tools/import-leads-to-pipeline.ts [--reset]`. dotenv from `JABNET_PRIVATE_ROOT` (dev `.env` → `jabnet_fiber_dev`). Thin I/O over the pure module. Steps:
1. **Guard:** hardcode `MITRA_ID = 1` (JABNET). Connect via `mysql2/promise` pool (same as the existing tools).
2. **`--reset`:** find an existing pipeline by a stable marker (name "Leads (Marketing)" + a `description` sentinel, or a dedicated check) for mitra 1; if found, cascade-delete it (delete card children → cards → fields → stages → pipeline, mirroring `storage.deletePipeline` order). Without `--reset`, abort if it already exists (no silent duplicate).
3. **Create pipeline** (mitra 1, icon `target`, color, description sentinel) → `pipelineId`.
4. **Create stages** from `LEAD_PIPELINE_STAGES()` → build `stageIdByKey`.
5. **Create fields** from `LEAD_PIPELINE_FIELDS` → build `fieldIdByKey`.
6. **For each lead** (mitra 1) in a transaction/batch:
   - insert card via `leadToCard(lead, stageIdByKey)` → `cardId`.
   - insert `pipeline_card_values` from `leadToFieldValues(lead)` resolved via `fieldIdByKey` (skip omitted).
   - fetch `lead_activities` for the lead; for each: `classifyActivity` →
     - comment → insert `pipeline_card_comments` (body/authorId/createdAt; `photo_path` = `activityToComment().photoPathRef`). For a legacy base64-only photo (photoData, no photoPath), call `saveBase64Photo("jabnet","pipelines",cardId,dataUrl)` and store the returned path.
     - activity → insert `pipeline_card_activity` (type/detail/actorId/createdAt).
7. **Summary log:** pipelines/stages/fields created; leads→cards; comments; activities; photos linked; skipped (with reasons). Mirrors the existing tools' final summary.

Idempotency for dev iteration is via `--reset` (re-run = clean re-import), matching the chosen "one-time snapshot" with a safe dev re-run.

## 4. Files

| File | Change |
|---|---|
| `shared/schema.ts` | `pipeline_card_comments.photoPath` column |
| `server/storage.ts` | startup `ALTER` for `photo_path` (info_schema guard); `getCardCommentPhotoMeta(id)`; comment-create accepts optional `photoPath` |
| `server/routes.ts` | `GET /api/pipelines/cards/comments/:id/photo` (guarded, streamPhoto) |
| `client/components/pipelines/CardDetailDrawer.tsx` (or the comment list component) | render comment photo thumbnail when `photoPath` present |
| `tools/leadsToPipeline.ts` (+ `.test.ts`) | **new** pure mapping module + unit tests |
| `tools/import-leads-to-pipeline.ts` | **new** dev import script (`--reset`) |

No production changes; no `/leads` changes.

## 5. Edge cases

- **Re-run without `--reset`** → abort with a clear message (no duplicate pipeline).
- **Lead with unknown/odd stage** → if a lead's `stage` isn't in `LEAD_STAGES`, map to the first stage ("new") and log it (shouldn't happen - stage is an enum).
- **Null assignee** → card `assigneeId` null (allowed).
- **Activity with neither photoPath nor photoData** but type photo → comment with body "[Foto] (file hilang)", no `photo_path`.
- **Legacy base64 photo** → materialized to a file via `saveBase64Photo` so the serve endpoint works uniformly.
- **Empty/whitespace field values** → omitted (don't create empty `pipeline_card_values`).
- **Photo serve ACL** → endpoint enforces pipeline-view + same mitra (no cross-tenant; matches engine RBAC).
- **Large activity counts** → batch inserts; the script is dev-run, runtime is not critical.

## 6. Testing

- **Pure module** (`tools/leadsToPipeline.test.ts`, `node:test`/tsx): stage defs (6, correct labels/colors/positions); field defs (keys/types/options); `leadToCard` mapping incl. stage resolution + assignee + stageEnteredAt fallback; `leadToFieldValues` (numbers stringified, nulls omitted, source_lead_id set); `classifyActivity` (each type → correct bucket); `activityToComment` body prefixing + photoPathRef.
- **Engine extension**: typecheck + build; manual - add a comment photo via the import and confirm the serve endpoint streams it + thumbnail renders.
- **Import (manual, dev DB)**: run `--reset`; open `/pipelines` → "Leads (Marketing)": 6 stages right order/colors; cards count == leads count; spot-check a card's fields (phone/source/district/odp/coords), comment timeline (notes/calls), and a photo thumbnail; verify other mitras/pipelines untouched; re-run `--reset` → still one pipeline, same counts.

## Out of scope (later P5 phases)

- Ongoing/two-way sync between `/leads` and the pipeline.
- Retiring the bespoke `/leads` page or `leads*` tables.
- Re-implementing conversion (→customer/MikroTik/Work Order), Meta CAPI, attribution/funnel analytics, PII masking, on the engine.
- Running the import in production (this is dev-only).
- In-app UI to attach photos to pipeline comments (only render + serve + import now).

## Consistency with memory

- [[project-pipelines-engine]] - this is the first P5 step (leads→engine), kept deliberately low-risk (import only, dev-only, `/leads` untouched); update the P5 note on merge.
- [[reference-startup-add-column]] - `photo_path` added via info_schema check + plain `ALTER` (no `IF NOT EXISTS`).
- [[reference-tenant-isolation-gotchas]] - import + serve endpoint scoped to mitra 1 / `getMitraId`; no cross-tenant access.
- [[reference-api-response-envelope]] - the photo serve endpoint streams bytes (not the JSON envelope), like the existing lead/canvassing/bug photo routes.
- [[feedback-coding-standards]] - pure `leadsToPipeline` mapping module (SoC/TDD); script is thin I/O; DRY reuse of `LEAD_*` constants + `streamPhoto`/`saveBase64Photo`.
- [[reference-dev-environment-cpanel]] - runs against `jabnet_fiber_dev`; the user executes on dev (branch + dev DB) before any prod consideration.
