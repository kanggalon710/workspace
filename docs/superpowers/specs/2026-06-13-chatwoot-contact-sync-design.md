# Spec - Chatwoot Contact Sync - Batch 2b

> **Date**: 2026-06-13 · **Status**: Approved design, pre-plan
> **Parent**: Batch 2 of the Chatwoot integration. Builds on the existing per-mitra integration (`chatwoot_config`, private `chatwootRequest`, `searchContactByPhone`) + the foundation perms (`chatwoot`/`chatwoot_settings`).
> **Sibling remaining**: Agent Sync (separate spec).

## Goal

Push Workspace customers into Chatwoot as contacts (Workspace → Chatwoot, one-way), **manually** (per-customer + bulk). Idempotent upsert with dedup, storing the Chatwoot contact id back on the customer. Strict tenant isolation.

## Decisions (locked during brainstorming)

1. **Manual trigger** first cut: per-customer "Sync ke Chatwoot" button + bulk action over selected/filtered customers. Scheduled/real-time deferred.
2. **Mapping** stored on the customer row: new columns `chatwoot_contact_id` + `chatwoot_synced_at` (1 mitra = 1 account, 1:1 customer↔contact).
3. **Dedup**: find existing contact by **identifier = customerId**, else by **normalized phone**; update if found, create otherwise.
4. **Labels included**: set Chatwoot contact labels (`POST /contacts/{id}/labels`) in addition to `custom_attributes` - one extra call per upsert.
5. **One-way** (Workspace → Chatwoot). No pulling contact edits back.

## Consistency with Memory

- [[project-chatwoot-integration]] - extends the existing integration; **grep first**. Reuse `chatwootRequest` (account-scoped → isolation) + `searchContactByPhone`.
- [[reference-tenant-isolation-gotchas]] - customer loaded via tenant-scoped `storage.getCustomer`; all Chatwoot calls use the active mitra's token.
- [[reference-startup-add-column]] - add columns via info_schema check + separate try/catch (NOT `ADD COLUMN IF NOT EXISTS`).
- [[reference-api-response-envelope]] - `sendSuccess`/`sendError`.
- [[feedback-coding-standards]] - semantic HTML, DRY, pure payload/label builders in a tested module.
- `req.params.id` is `string|string[]` in this project → wrap `Number(...)`/`String(...)`.

## 1. Schema (`shared/schema.ts` + startup migration)

Add to `customers`:
- `chatwootContactId: text("chatwoot_contact_id")` - Chatwoot contact id (string-safe).
- `chatwootSyncedAt: text("chatwoot_synced_at")` - ISO timestamp of last successful sync.

Startup migration in `server/storage.ts` (info_schema check pattern, per-column try/catch):
```sql
ALTER TABLE customers ADD COLUMN chatwoot_contact_id VARCHAR(64) NULL;
ALTER TABLE customers ADD COLUMN chatwoot_synced_at  VARCHAR(40) NULL;
```

## 2. Pure builders (`shared/chatwootContact.ts` + test)

- `buildChatwootContactPayload(c, opts: { tenant: string }): {...}` - returns the Chatwoot contact body:
  - `name` (c.name), `phone_number` (normalized via injected normalizer / `toWhatsappNumber` → `+62…` E.164-ish; omit if no phone), `email` (omit if empty), `identifier` (c.customerId),
  - `custom_attributes: { jabnet_customer_id: c.customerId, tenant, status: c.status, customer_type: c.customerType }` (omit empty values).
- `buildChatwootContactLabels(c, opts: { tenant: string }): string[]` - sanitized label slugs (lowercase, hyphen), e.g. `[tenant, c.status, c.customerType]` filtered for empties + deduped. Chatwoot labels must be slug-like.

Both pure + unit-tested (empty-field omission, phone normalization, label slugging/dedup).

## 3. Backend (`server/chatwoot.ts`)

- `findChatwootContact(customerId, phone, normalize): Promise<any|null>` - search by `identifier` first (`GET /contacts/search?q=<customerId>`, match `identifier === customerId`), else `searchContactByPhone`.
- `upsertChatwootContact(customer, opts): Promise<{ contactId: number; action: "created"|"updated" }>`:
  1. `findChatwootContact(...)`.
  2. found → `PUT /contacts/{id}` with payload; else → `POST /contacts` with payload (returns `{ payload: { contact: { id } } }` or `{ id }` - handle both).
  3. `POST /contacts/{id}/labels` with `{ labels }` (best-effort; a label failure must NOT fail the whole sync - log + continue).
  4. return `{ contactId, action }`.
- All via `chatwootRequest`. Throws "Chatwoot belum terkonfigurasi" propagate as a clear error to the route.

## 4. Routes (`server/routes.ts`, gated `chatwoot` **write**)

| Route | Behavior |
|---|---|
| `POST /api/integrations/chatwoot/customers/:id/sync` | tenant-scoped `getCustomer` (404 if not in mitra); `upsertChatwootContact`; persist `chatwoot_contact_id` + `chatwoot_synced_at`; audit `entityType:"chatwoot_contact_sync"`; return `{ contactId, action }` |
| `POST /api/integrations/chatwoot/contacts/sync-bulk` | body `{ customerIds: number[] }` (cap ≤ 200); sequential upsert per id (tenant-scoped); rate-aware (small delay/just sequential); return `{ results: [{ customerId, ok, contactId?, action?, error? }], synced, failed }`; one audit summary |

Gate: `hasWritePermission(req, "chatwoot")`. Disabled Chatwoot → `sendError` "Chatwoot belum dikonfigurasi" (400), not 500.

## 5. Frontend

- `client/lib/chatwoot.ts`: `syncCustomerContact(customerId)`, `syncBulkContacts(customerIds)`.
- `client/hooks/useChatwoot.ts`: `useSyncCustomerContact()` (mutation, invalidates customer queries), `useSyncBulkContacts()`.
- **Per-customer**: a `ChatwootSyncButton` (reusable) in the customer detail dialog header area (beside `OpenInChatwootButton`): label "Sync ke Chatwoot" / "Tersinkron ✓" (when `chatwootContactId` present) with a re-sync affordance; loading state; toast on result. Hidden when Chatwoot disabled (`useChatwootStatus`).
- **Bulk**: integrate with `/customers` existing row-selection (if present) → a "Sync ke Chatwoot (N)" action; otherwise a "Sync semua (terfilter)" button with a progress toast. Exact placement matched to the page's existing bulk pattern at implementation.
- Permission-gate the buttons on `chatwoot` write (the server enforces; UI hides when lacking).

## 6. Security / isolation
Account-scoped token; customer tenant-scoped; write-permission gated; bulk capped + sequential; every sync audited; one-way (no inbound contact mutation). No token to client.

## 7. Testing
- Unit: `shared/chatwootContact.test.ts` (payload field omission, phone normalization, label slug/dedup).
- Manual (staging, real Chatwoot): sync one customer → contact created in Chatwoot with identifier+labels+attrs → re-sync updates (no dupe) → `chatwoot_contact_id` stored, button shows "Tersinkron" → bulk sync N customers → results summary → customer of another mitra not reachable (404) → role without `chatwoot` write → 403.
- `npm run typecheck` 0 · `npx tsx --test` green · `npm run build` ok (verified by me, not only subagent reports).

## 8. File inventory
| File | New/Edit | Purpose |
|---|---|---|
| `shared/schema.ts` | edit | customers += chatwootContactId, chatwootSyncedAt |
| `server/storage.ts` | edit | startup ALTER (2 cols, info_schema check); `updateCustomerChatwootLink(id, contactId, syncedAt)` helper |
| `shared/chatwootContact.ts` (+ test) | new | pure payload + labels builders |
| `server/chatwoot.ts` | edit | findChatwootContact, upsertChatwootContact |
| `server/routes.ts` | edit | 2 sync endpoints (gated chatwoot write, audited) |
| `client/lib/chatwoot.ts` | edit | sync wrappers |
| `client/hooks/useChatwoot.ts` | edit | sync mutation hooks |
| `client/components/chatwoot/ChatwootSyncButton.tsx` | new | reusable per-customer sync button |
| `client/pages/CustomersPage.tsx` | edit | per-customer button + bulk action |

## 9. Out of scope (later)
- Scheduled / real-time sync (worker, on-create hooks).
- Pulling Chatwoot contact edits back into Workspace.
- Agent Sync (sibling spec).
- Deleting/merging contacts.

## 10. Open risks
- **Chatwoot `/contacts` create/update response shape** (`payload.contact.id` vs `id`) + labels endpoint body (`{ labels: [] }` replaces all) - verify at implementation; isolate in `upsertChatwootContact`.
- **Phone normalization vs Chatwoot expectation** - Chatwoot wants E.164 `+62…`; ensure the normalizer yields that (extend `toWhatsappNumber` or add a small helper) and dedup search uses the same form.
- **Duplicate contacts** if identifier/phone both differ from an existing manually-created contact - accepted; dedup is best-effort by identifier then phone.
- **Bulk volume / rate limits** - cap 200 + sequential; if Chatwoot rate-limits, surface partial results rather than failing all.
