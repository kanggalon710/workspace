# Spec - Import `/collections` → `/pipelines` (JABNET snapshot)

> Date: 2026-06-08 · Mitra: JABNET (mitra_id 1) · Mirrors the leads→pipeline import pattern.

## Goal

One-off, idempotent (`--reset`) snapshot import of JABNET's collections (billing/penagihan)
data into the generic pipelines engine - so `/pipelines` shows a **"Penagihan (Collections)"**
board with the same stages, cards, custom-field values, multi-assignee, comments (incl. photos),
and audit activity as `/collections`.

Source `collections` data is **not modified** - this is a read-only copy into pipeline tables.

## Decisions (confirmed)

1. **Stages** - replicate the existing `collection_stages` rows (label, color, position) exactly.
   Fallback to 6 hardcoded defaults (`new/contacted/promised/issue/paid/written_off`) only if the
   table is empty for mitra 1.
2. **Scope** - import ALL collections, including closed (`paid` / `written_off` / closed) - full history snapshot.
3. **Assignee** - set `pipeline_cards.assignee_id` from `collections.assigned_to` (single), AND populate
   a custom **Assignee (multiple)** field from `collection_assignees` rows.
4. **Photos** - decode base64 `collection_activities.photo_data` → write to filesystem via
   `saveBase64Photo(slug, "collections", …)` → store relative `photo_path` on the comment.

## Components

### 1. `server/uploads.ts` - additive
Add `"collections"` to the `FEATURES` whitelist. Photos land at
`uploads/jabnet/collections/YYYY/MM/<activityId>-<8hex>.jpg`. No other change.

### 2. `tools/collectionsToPipeline.ts` - pure, testable module
Mirrors `tools/leadsToPipeline.ts`. DB-shape interfaces (snake_case, only fields read):
`CollectionRow`, `CustomerLite`, `CollectionStageRow`, `CollectionActivityRow`.

Exports:
- `COLLECTION_PIPELINE_STAGES(stageRows: CollectionStageRow[]): {key,label,color,position}[]`
  - map collection_stages ordered by position; fallback to `DEFAULT_COLLECTION_STAGES` if empty.
- `DEFAULT_COLLECTION_STAGES` - the 6 defaults with sensible colors.
- `COLLECTION_PIPELINE_FIELDS: FieldDef[]` - see table below. `FieldDef` extends the leads one with
  `type: ... | "user"` and optional `config?: { multiple?: boolean }`.
- `collectionToCard(col, customer, stageIdByKey, assigneeId): CardDraft`
  - title = `customer.name` (fallback billing `customer_id`, fallback `"Pelanggan #<id>"`);
    stage from `col.stage` (fallback first stage); priority `col.priority || "medium"`;
    createdAt = `col.created_at`; stageEnteredAt = `col.assigned_at ?? col.updated_at ?? col.created_at`.
- `resolveAssignee(...)` - **imported from `./leadsToPipeline.js`** (DRY).
- `resolveMultiAssignees(rows: {user_id:number}[], validUserIds: Set<number>): number[]`
  - dedup + keep only tenant-valid ids.
- `collectionToFieldValues(col, customer): {fieldKey,value}[]`
  - omit null/empty, stringify numbers, coordinate from customer lat/lng (both finite).
- `classifyCollectionActivity(type): "comment" | "activity"`
  - comment: `note/call/whatsapp/visit`; everything else → activity
    (`stage_change/issue_set/promise_made/auto_opened/auto_closed/payment_detected/…`).
- `collectionActivityToComment(act)` / `collectionActivityToActivity(act)` - mirror leads
  (`[Label] content` body; audit detail passthrough).

**Custom fields (`pipeline_fields`):**

| key | label | type | show_on_card |
|---|---|---|---|
| customer_id | ID Pelanggan | text | ✓ |
| phone | Telepon | phone | ✓ |
| package | Paket | text | ✓ |
| opened_amount | Tagihan (Rp) | number | ✓ |
| opened_due_date | Jatuh Tempo | text | ✓ |
| promise_date | Janji Bayar | text | ✓ |
| issue_type | Jenis Masalah | dropdown (8 issue types) | ✗ |
| opened_billing_status | Status Billing | text | ✗ |
| opened_isolir_date | Tgl Isolir | text | ✗ |
| district | Kecamatan | text | ✗ |
| village | Desa/Kelurahan | text | ✗ |
| address | Alamat | textarea | ✗ |
| notes | Catatan | textarea | ✗ |
| close_reason | Alasan Tutup | text | ✗ |
| assignees | Tim Penagih | user (config `{multiple:true}`) | ✓ |
| coordinate | Koordinat | coordinate | ✗ |
| source_collection_id | Sumber Collection ID | number | ✗ |

`issue_type` options: `no_contact, no_answer, promise_broken, financial_difficulty, moved_out,
service_complaint, billing_dispute, lainnya`.

Multi-assignee value stored in `pipeline_card_values.value` as a JSON array string, e.g. `"[3,5]"`
(matches slice-B multi-assignee validation).

### 3. `tools/import-collections-to-pipeline.ts` - runner
Mirrors `tools/import-leads-to-pipeline.ts`.
- Constants: `MITRA_ID=1`, `PIPELINE_NAME="Penagihan (Collections)"`,
  `SENTINEL="[collections-import]"`, color `#F59E0B`, icon `banknote`.
- Args: `--reset` (delete prior sentinel-matched pipeline + children, then re-import),
  `--default-assignee <userId>`, `--help`.
- Guards: require `DB_USER` + `DB_NAME`; validate `--default-assignee` is int > 0.
- Resolve mitra slug (id 1) from `mitras` table for photo paths (fallback `"jabnet"`).
- Build `validUserIds` from `user_mitras` where mitra_id=1.
- Read: `collection_stages` (mitra 1), `collections` JOIN `customers` (name/phone/package/address/
  district/village/lat/lng/customer_id), per-collection `collection_activities` + `collection_assignees`.
- Write order: pipeline → stages → fields (assignees field carries `config`) → per collection:
  card → card_values (incl. multi-assignee JSON + coordinate) → comments (base64 photo →
  `saveBase64Photo` → photo_path) → activity rows.
- Final tally log: cards, field-values, comments, photos written, base64-failed, activity rows,
  coordinates, assignees matched/default/unassigned.

### 4. `tools/collectionsToPipeline.test.ts` - `node:test`
Covers pure helpers: stage mapping + empty fallback, field-values omits null/empty + coordinate
emission, `classifyCollectionActivity` buckets, `resolveMultiAssignees` dedup/validity,
`collectionToCard` title + stage fallback.

## Running (prod, with photos)

Same recipe as leads (deploy branch strips `tools/*.ts`; tsx esbuild binary missing; remote MySQL denied):
1. LOCAL bundle: `npx esbuild tools/import-collections-to-pipeline.ts --bundle --platform=node
   --format=esm --target=node22 --external:mysql2 --outfile=/tmp/import-collections.mjs`
2. `scp` the `.mjs` into `~/repositories/fiber-jabnet/`
3. On box: `source ~/nodevenv/repositories/fiber-jabnet/22/bin/activate && cd ~/repositories/fiber-jabnet`
   then run with `DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=jabnet_crm_user DB_PASSWORD=… DB_NAME=jabnet_fiber
   JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet node import-collections.mjs`
4. Clean up the `.mjs`.

`esbuild` bundles `shared/schema.ts` + `server/uploads.ts` inline; only `mysql2` stays external
(resolved from the app's `node_modules`). `JABNET_PRIVATE_ROOT` is required so `getUploadRoot()`
resolves to the private uploads dir (not `cwd/uploads`).

## Out of scope
- Two-way sync / live mirror (snapshot only; re-run with `--reset`).
- Migrating `/collections` UI or retiring it.
- Importing other mitras (JABNET / mitra 1 only).
- Backfilling `collection_activities.photo_data` → filesystem in the source table (import writes to
  pipeline copy only; source base64 untouched).
