# Spec - Workspace ↔ Chatwoot Integration (Batch 1: Foundation)

> **Date**: 2026-06-13 · **Status**:  REVISED - see banner below.
> **Scope**: Batch 1 of the multi-tenant Chatwoot integration - the isolation foundation.

---

##  REVISION 2026-06-13 (post-discovery) - READ FIRST

During implementation we discovered a **pre-existing, already-multi-tenant Chatwoot integration** (shipped in the first commit, "v4.2.5"). The greenfield assumption in the original sections below is **wrong**. What already exists, per-mitra:

- `chatwoot_config` table **with `mitra_id`** (`enabled, baseUrl, accountId, apiAccessToken, webhookSecret, autoCreateOnKeyword, autoNotifyOnResolve, defaultCategoryId`), scoped via `getMitraId()` - so tenant isolation is already enforced.
- `storage.getChatwootConfig()` / `updateChatwootConfig()`, `listChatwootKeywordRules()` + CRUD, `chatwoot_ticket_links`.
- Routes `GET/PUT /api/integrations/chatwoot/config` (token + webhook secret masked `••••last4`), `POST /api/integrations/chatwoot/test`, keyword-rules CRUD, and a **working HMAC webhook receiver** `POST /api/integrations/chatwoot/webhook`.
- A full Chatwoot settings UI section in `client/pages/IntegrationPage.tsx`.
- `server/chatwoot.ts`: `testChatwootConnection`, `verifyWebhookSignature`, `handleConversationCreated`, `handleMessageCreated`, `notifyChatwootCheckpoint`, `notifyChatwootTicketResolved`, `sendChatwootMessage`, `setConversationCustomAttributes`.

**Therefore the original plan's core decision (store config in `mitra_integrations`, build a parallel `server/chatwoot-routes.ts`, new settings page) is rejected.** The duplicate work was reverted in commit `b137e6e`. We build on the existing `chatwoot_config` integration instead.

**Kept from the original work:** `shared/chatwootLinks.ts` (deep-link builders, no prior equivalent) and the two permission keys `chatwoot` / `chatwoot_settings` added to `ALL_PERMISSIONS`.

### Revised remaining Foundation scope (small)
1. **Wire the dedicated permissions** into the existing endpoints: change the chatwoot config/test/keyword-rules gates from the generic `settings_manage` to `chatwoot_settings` (read for GET/test, write for PUT/keyword CRUD). Webhook stays unauthenticated (HMAC).
2. **Add `GET /api/integrations/chatwoot/status`** gated by `chatwoot` (read) → `{ enabled, configured, baseUrl, accountId }`, never returns the token - feeds the button.
3. **`OpenInChatwootButton`** (uses `shared/chatwootLinks` + a `useChatwootStatus` hook) on Customer detail + the IntegrationPage Chatwoot section header.

### Deferred to Batch 2 (genuinely new - separate brainstorm/spec)
Contact sync, Agent sync, conversation embedding (`/communications`), customer-detail "Communication" history section. (The webhook receiver, originally listed for Batch 2, **already exists**.)

> The sections below are the **original (pre-discovery)** design, retained for history. Where they describe `mitra_integrations` storage, a new `chatwoot-routes.ts`, or a new settings page, they are **superseded** by this revision.

---

## Context

JABNET Workspace is multi-tenant (`mitra_id` + `tenantContext` AsyncLocalStorage). The ISP runs a self-hosted Chatwoot at `https://omni.jabnet.id`. Goal: each tenant operates its own Chatwoot account from inside Workspace, with **strict tenant isolation** as the top priority - tenant A must never see/modify tenant B's inboxes, conversations, contacts, agents, or settings.

This batch delivers the **foundation**: tenant↔account mapping, a settings page, permissions, a backend proxy, connection test, and an "Open in Chatwoot" deep link. No data sync and no inbound webhooks yet - those land in Batch 2 once isolation is proven.

## Decisions (locked during brainstorming)

1. **Auth model - per-account token.** Each mitra stores its own Chatwoot **account-scoped** API access token (from an admin/agent or Agent Bot inside that account). Because the token can only reach one account, **isolation is enforced by Chatwoot itself**, not by our filtering. One leaked token exposes only that one tenant.
2. **Foundation-first.** Two separate spec→plan→implement cycles. This is cycle 1.
3. **1 mitra = 1 Chatwoot account.** Config stored in the existing `mitra_integrations` table (per-tenant key/value, secret masking, seed-defaults, settings UI pattern already proven for MPWA/GenieACS). **No new table.**
4. **Permissions collapse to the 3-level model.** The request's 5 flat keys map to two `none/read/write` keys (see §4), consistent with the rest of the system.

## Consistency with Memory

- [[feedback-credentials-in-db]] - token stored plaintext in DB is acceptable (cPanel Remote-MySQL whitelist). We do **not** add AES-at-rest. Security comes from: never exposing the token to the browser (backend proxy + masking on read).
- [[reference-tenant-isolation-gotchas]] - use `getMitraSetting`/`setMitraSetting` (auto-scoped to active mitra), **never** the global `getSetting`. All Chatwoot calls run under the active mitra's token.
- [[reference-per-mitra-roles]] - new permissions seed into each mitra's locked Admin role via the startup permission migration.
- [[reference-api-response-envelope]] - all `/api/chatwoot/*` staff routes use `sendSuccess({success,data})` / `sendError`.
- [[reference-startup-add-column]] - no schema DDL needed (reusing `mitra_integrations`); permission keys auto-migrate via existing `upgradePermissions…` path.
- [[feedback-coding-standards]] - semantic HTML5, DRY, reusable components, pure logic in testable modules.

---

## 1. Config storage (`mitra_integrations`)

Per-mitra keys (all via `getMitraSetting`/`setMitraSetting`, `fallbackToGlobal: false` so a new mitra sees blanks, not JABNET's values):

| Key | Secret | Notes |
|---|---|---|
| `chatwoot_enabled` | no | `"true"`/`"false"` (default `"false"`) |
| `chatwoot_base_url` | no | default `https://omni.jabnet.id` |
| `chatwoot_account_id` | no | numeric string |
| `chatwoot_api_token` | **yes** | masked `••••••••` on read; only written when a non-mask value is submitted |

Added to `seedMitraIntegrationDefaults(mitraId)` with empty values (token `""`, `chatwoot_enabled "false"`, `chatwoot_base_url "https://omni.jabnet.id"`). Sync toggles are **not** added here - they belong to Batch 2 so the settings UI ships no dead switches.

## 2. Pure, testable logic (`shared/`)

- `shared/chatwootConfig.ts`
  - `type ChatwootConfig = { enabled: boolean; baseUrl: string; accountId: number | null; hasToken: boolean }`
  - `resolveChatwootConfig(map: Record<string,string|null>): ChatwootConfig` - normalize raw setting strings.
  - `isConfigured(c)` - `enabled && baseUrl && accountId && hasToken`.
  - `MASK = "••••••••"`; `isMaskedToken(v)` - so PUT skips re-writing the masked placeholder.
- `shared/chatwootLinks.ts`
  - `chatwootAccountUrl(baseUrl, accountId)` → `{base}/app/accounts/{id}/dashboard`
  - `chatwootContactsUrl(baseUrl, accountId)` → `{base}/app/accounts/{id}/contacts`
  - `chatwootContactUrl(baseUrl, accountId, contactId)` → `…/contacts/{contactId}` (used by Batch 2; included now, tested)
  - Trailing-slash-safe join; returns `null` if baseUrl/accountId missing.

Both get `node:test` suites (per the testable-modules standard).

## 3. Backend client + proxy

### `server/chatwoot.ts` (mirrors `genieacs.ts`)
- `getChatwootConfigForMitra(): Promise<{ baseUrl, accountId, token } | null>` - reads the 4 keys via `getMitraSetting`; returns `null` if not enabled or incomplete.
- `chatwootFetch(cfg, method, path, body?, timeoutMs=12000)` - `fetch` with header `api_access_token: <token>`, URL `{baseUrl}/api/v1/accounts/{accountId}{path}`, `AbortController` timeout; maps AbortError/ECONNREFUSED/ENOTFOUND to friendly Indonesian errors (same shape as `genieFetch`).
- `testConnection(cfg)` - `GET /api/v1/accounts/{id}` (or `/profile`) → `{ ok, accountName?, error? }`. Used by the test endpoint.

### `server/chatwoot-routes.ts` (sub-router, mounted in `server/index.ts`)
All routes: `requireAuth` → tenant-scoped (active mitra) → permission gate → `sendSuccess`/`sendError`.

| Route | Permission | Behavior |
|---|---|---|
| `GET /api/chatwoot/settings` | `chatwoot_settings` read | returns config with token **masked** |
| `PUT /api/chatwoot/settings` | `chatwoot_settings` write | validates, persists via `setMitraSetting` (token `isSecret`, skip write if masked), writes `audit_logs` (`action:"UPDATE", entityType:"chatwoot_settings"`) |
| `POST /api/chatwoot/test-connection` | `chatwoot_settings` read | server-side `testConnection`; **in-memory rate-limit** (e.g. 10/min per mitra); audit `entityType:"chatwoot_test"` |
| `GET /api/chatwoot/status` | `chatwoot` read | `{ enabled, configured, accountId, baseUrl, accountName? }` for badges + "Open in Chatwoot" - **never returns the token** |

Mounting follows the existing 3-router pattern in `server/index.ts`.

## 4. Permissions

Add to `ALL_PERMISSIONS` in `shared/schema.ts`:
- `chatwoot` - *read*: view Chatwoot data (conversations/contacts/agents - Batch 2 consumes); *write*: manage/sync actions (Batch 2).
- `chatwoot_settings` - *read*: view connection status; *write*: configure account mapping, token, enable/disable.

Wiring:
- Auto-migration grants both to admin roles on startup (existing `upgradePermissions…` path); System-Admin/Admin forced `write`.
- Add to role presets (`shared/rolePresets.ts` / `shared/permissionPresets.ts`) and Quick Presets so custom + preset roles can grant them.
- Sidebar/route guards use `chatwoot_settings` for the settings page; `chatwoot` (read) for the future communications page and the customer-detail button.

Mapping rationale (5→2): `view`→`chatwoot:read`; `manage`+`sync`→`chatwoot:write`; `settings`+`admin`→`chatwoot_settings:write`. Same capability surface, consistent with the platform's 3-level model.

## 5. Frontend

- `client/lib/chatwoot.ts` - typed API wrappers (`getSettings`, `saveSettings`, `testConnection`, `getStatus`).
- `client/hooks/useChatwoot.ts` - `useChatwootSettings()`, `useChatwootStatus()` (TanStack Query; status cached, settings lazy on page open).
- `client/pages/ChatwootSettingsPage.tsx` at route `/integrations/chatwoot`, reached from a **Chatwoot card** on `/integrations` (consistent with MPWA/GenieACS cards), guarded by `chatwoot_settings`.
- Reusable components (`client/components/chatwoot/`):
  - `ChatwootSettingsForm` - semantic `<form>`, FormField/FormRow, enable switch, base URL, account ID, token (write-only; shows masked when set), Test Connection button with inline result.
  - `ChatwootStatusBadge` - `<StatusBadge>` driven by `/status` (Aktif / Belum dikonfigurasi / Nonaktif / Error).
  - `OpenInChatwootButton` - builds URL via `shared/chatwootLinks`, `window.open` new tab; hidden when not configured/enabled or lacking `chatwoot` read.
- **Customer Detail**: drop `OpenInChatwootButton` (opens the mitra's account contacts page) behind enabled+permission. The full "Communication" section (conversation history, last interaction, assigned agent) is **Batch 2**.
- States: `<SkeletonCard>` while loading settings; `<EmptyState>` when not configured; error state on test/fetch failure. No blank pages.
- Mobile-first: single-column form, full-bleed pattern, responsive up to desktop. Follows design-system tokens (no hardcoded hex).

## 6. Security

- Backend proxy only; token never sent to the browser (`/settings` masks, `/status` omits it).
- `PUT` skips persisting when the submitted token equals the mask (avoids overwriting with `••••`).
- In-memory rate limit on `test-connection` (per mitra) to prevent hammering Chatwoot.
- Defense-in-depth: even a tampered `account_id` cannot cross accounts because the token is account-scoped - Chatwoot rejects mismatches.
- Every config change + connection test recorded in `audit_logs` with mitra + user.

## 7. Audit (reuses `audit_logs`)

No new table. Log: settings update (`UPDATE`/`chatwoot_settings`), connection test (`chatwoot_test`), enable/disable (captured in the settings update `details` JSON: which fields changed, never the token value).

## 8. Testing & verification

- **Unit**: `shared/chatwootConfig.test.ts`, `shared/chatwootLinks.test.ts` (mask handling, URL joins, configured/enabled logic).
- **Manual (local)**: save settings → reload shows masked token → Test Connection (against a real or stub Chatwoot) → status badge → Open in Chatwoot opens correct account URL → second mitra sees blank config (isolation) → non-permitted role cannot open settings.
- `npm run typecheck` 0 errors · `npx tsx --test` green · `npm run build` succeeds.

## 9. File inventory

| File | New/Edit | Purpose |
|---|---|---|
| `shared/chatwootConfig.ts` (+ test) | new | pure config resolution + mask helpers |
| `shared/chatwootLinks.ts` (+ test) | new | pure deep-link builders |
| `shared/schema.ts` | edit | `ALL_PERMISSIONS` += `chatwoot`, `chatwoot_settings` |
| `shared/rolePresets.ts` / `permissionPresets.ts` | edit | presets include new keys |
| `server/chatwoot.ts` | new | HTTP client + testConnection |
| `server/chatwoot-routes.ts` | new | `/api/chatwoot` sub-router |
| `server/index.ts` | edit | mount sub-router |
| `server/storage.ts` | edit | `seedMitraIntegrationDefaults` += chatwoot keys |
| `client/lib/chatwoot.ts` | new | API wrappers |
| `client/hooks/useChatwoot.ts` | new | query hooks |
| `client/pages/ChatwootSettingsPage.tsx` | new | settings page |
| `client/components/chatwoot/*` | new | ChatwootSettingsForm, ChatwootStatusBadge, OpenInChatwootButton |
| `client/App.tsx` | edit | lazy route `/integrations/chatwoot` |
| `client/pages/IntegrationPage.tsx` | edit | Chatwoot card linking to the page |
| Customer detail page | edit | `OpenInChatwootButton` |

## 10. Out of scope (Batch 2+)

- Contact / Agent / Conversation sync (engines, modes, mapping tables)
- Inbound webhook receiver (tenant-aware, idempotent)
- Conversation embedding (`/communications`), customer-detail Communication section
- SSO (architecture already token-per-tenant friendly; no redesign needed later)

## 11. Open risks

- **Chatwoot test endpoint shape** - confirm `GET /api/v1/accounts/{id}` returns account info with an account-scoped token (vs needing `/profile`); adjust `testConnection` path during implementation.
- **Account-scoped token capabilities** - an Agent (non-admin) token may lack some read scopes needed in Batch 2; foundation only needs account-read, which any agent token has.
- **`/integrations/chatwoot` vs sidebar entry** - foundation reaches the page via the `/integrations` card; a dedicated sidebar item can be added in Batch 2 alongside the communications page.
