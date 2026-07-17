# Spec — Billing-sourced auto-create for custom pipelines (billing_sync trigger)

> Date: 2026-06-08 · Mitra-scoped · Extends the generic pipeline automation engine.

## Goal

Let any custom `/pipelines` board auto-create cards from billing data the way `/collections`
does for "Baru Isolir" — when a synced customer matches a configurable billing condition, a card
is created in a chosen stage with custom fields populated from customer/billing attributes; when the
customer no longer matches (e.g. paid), the card is auto-moved to a resolve stage.

Generalizes the hardcoded `runCollectionThresholds` / `reconcileCollectionState` logic into a
reusable automation rule.

## Decisions (confirmed)

1. **Architecture** — extend `pipeline_rules` with a new `triggerType = "billing_sync"` (not a
   separate per-pipeline config table).
2. **Trigger** — filter over the **locally-synced `customers` table** (no extra billing API call;
   runs on every sync incl. manual "Sync Now"). Filter dimensions mirror the billing API params.
3. **Lifecycle** — create **and** auto-resolve.
4. **Mapping** — fixed catalog of customer/billing attributes → custom fields.

## Trigger filter (billing API ↔ local customer field)

| Billing API param | Local `customers` field | Example values |
|---|---|---|
| `jenis_pelanggan` / `type_pelanggan` | `customerType` | rumahan / bisnis / vip |
| `status_pelanggan` | `status` | aktif |
| `isolir` / `is_isolir` | `isIsolir` (0/1) | 0 / 1 / any |
| `status_pembayaran` / `status_invoice` | `billingStatus` | belum_lunas / lunas / any |

A customer **matches** when it satisfies every filter key that is set; unset keys (or `"any"`) are
ignored. "Baru Isolir" parity = `{ isIsolir: 1 }` (or `{ billingStatus: "belum_lunas" }`).

## Data model

### `pipeline_cards` — additive columns (idempotent migration via `p4cColAdds`)
- `source_customer_id INT NULL` — links a card to `customers.id` (dedup + resolve lookup).
- `source_rule_id INT NULL` — which billing_sync rule created the card.

### `pipeline_rules`
- `triggerType` gains value `"billing_sync"` (column is `varchar(16)`; the value is 12 chars).
- `triggerConfig` (existing `text` JSON) holds:
  ```json
  {
    "filter": { "customerType": "rumahan|null", "status": "aktif|null",
                "isIsolir": 0 | 1 | null, "billingStatus": "belum_lunas|lunas|null" },
    "resolveStageId": 123,
    "titleSource": "name",
    "fieldMap": [ { "attr": "billingPrice", "targetFieldId": 45 }, { "attr": "coordinate", "targetFieldId": 47 } ]
  }
  ```
- Entry stage = the rule's existing `targetStageId` (with `actionType = "create_card"`). The
  customer→field mapping lives in `triggerConfig.fieldMap` (NOT `pipeline_rule_field_maps`, which is
  card→card) so the rule is self-contained.

## Mapping catalog (customer attribute → field)

`name, customer_id, phone, email, package, billingPrice, billingStatus, dueDate, isolirDate,
address, district, village, customerType, status, installDate, pppoeUsername, ontSerialNumber,
coordinate` (coordinate = `{lat,lng}` from `customers.lat`/`lng`).

Validation: attribute must be type-compatible with the target field — `billingPrice` → `number`/`currency`,
`coordinate` → `coordinate`, `phone` → `phone`/`text`, dates → `text`, everything else → `text`/`textarea`/`dropdown`.

`titleSource` is one of the text-ish attributes (default `name`; fallback `customer_id`, then
`Pelanggan #<id>`).

## Dedup & auto-resolve

- A card is **active** for a (rule, customer) pair when a `pipeline_cards` row exists with
  `source_rule_id = rule.id AND source_customer_id = customer.id AND stage_id != resolveStageId AND is_archived = 0`.
- **Create**: customer matches filter AND no active card → insert card (entry stage, title, mapped
  field values, `source_customer_id`, `source_rule_id`).
- **Resolve**: active card whose customer no longer matches the filter → move to `resolveStageId`
  (records a stage-change activity). Re-match after resolve creates a fresh card next cycle.

## Execution (SoC, testable)

New module `server/pipeline-billing-intake.ts`:
- **Pure helpers** (unit-tested, no DB):
  - `customerMatchesFilter(customer, filter): boolean`
  - `customerToFieldValues(customer, fieldMap): { fieldId, value }[]` (omit null/empty; coordinate
    emitted only when lat+lng finite; numbers stringified)
  - `customerTitle(customer, titleSource): string`
- **Runner** `runBillingIntakeRules(): Promise<{ created: number; resolved: number }>` — invoked from
  `billing-sync-worker` after the main sync (per-mitra, inside `withMitra`). Loads enabled
  `billing_sync` rules, customers, and existing source-linked cards; performs create + resolve via
  `storage`. Uses card insert + stage-move methods already present.

## Routes

- `validateTriggerConfig` handles `billing_sync`: filter keys in the allowed set; `resolveStageId`
  belongs to the pipeline; each `fieldMap.targetFieldId` belongs to the pipeline and is type-compatible;
  `titleSource` in the text catalog.
- Rule create/update accept the `billing_sync` shape. Manual "run now" optional (reuse Sync Now).

## Frontend

`PipelineRulesDialog` gains a **"Saat sync billing"** trigger option:
- 4 filter selects (customerType, status, isIsolir, billingStatus — each with "Abaikan/any").
- Entry stage select (target) + Resolve stage select.
- Title source select.
- Field-map editor: rows of (billing attribute → pipeline field), reusing the existing field-map row
  pattern, but the left side is the fixed attribute catalog instead of source fields.

## Testing

`node:test` for the pure helpers: filter combinations (incl. `any`/unset, isIsolir 0/1, billingStatus),
mapping (coordinate, number stringify, omit empty), title fallback chain. Runner verified via
typecheck + esbuild bundle (no DB in CI).

## Out of scope
- Calling the billing API directly with these filters (we filter synced local data).
- Migrating `/collections` onto this engine (separate roadmap item P6).
- Per-field manual-override protection on auto-populated cards (cards are created once; later edits
  are user-owned — the runner never overwrites an existing active card's fields).
- Time-window/threshold conditions beyond the billing attributes above (e.g. "overdue ≥ N days") —
  can be added later as another filter key; this iteration mirrors the billing API filter set.

## Decomposition (for the plan)
1. Schema (`source_customer_id`/`source_rule_id` + migration) + pure module + tests.
2. Runner wired into billing-sync-worker (create + resolve + dedup).
3. Routes validation + `PipelineRulesDialog` billing_sync UI.
