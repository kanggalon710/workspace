# Spec — Chatwoot Communications (Read) — Batch 2a

> **Date**: 2026-06-13 · **Status**: Approved design, pre-plan
> **Parent**: Batch 2 of the Chatwoot integration. Builds on the existing per-mitra integration (`chatwoot_config`, `chatwootRequest`, webhook/ticket linking) and the foundation work committed 2026-06-13 (`chatwoot`/`chatwoot_settings` permissions, `shared/chatwootLinks.ts`, `OpenInChatwootButton`, `/status`).
> **Siblings (separate specs, later)**: Contact Sync, Agent Sync.

## Goal

Let staff read Chatwoot conversations inside Workspace — both a standalone `/communications` page (inbox list → conversation list → message thread) and a "Komunikasi" section in the customer-detail dialog (the matched contact's conversations + thread). **Read-only** this cut; replying happens via "Buka di Chatwoot". Strict tenant isolation throughout.

## Decisions (locked during brainstorming)

1. **Scope** = customer-detail "Komunikasi" section **and** standalone `/communications` page.
2. **Read-only** first cut. Display threads; a "Buka di Chatwoot" button (existing `OpenInChatwootButton` / deep-link) opens Chatwoot to reply. Reply-from-Workspace deferred (`sendChatwootMessage` already exists, easy to add later).
3. **Freshness via polling** (TanStack Query `refetchInterval`, pause-on-blur per repo convention): ~20s conversation list, ~10s open thread. No websockets.
4. **No new DB tables** — read-through from Chatwoot. Optional short route-cache only if needed.

## Consistency with Memory

- [[reference-tenant-isolation-gotchas]] — all Chatwoot calls go through `chatwootRequest`, which reads the **active mitra's** account-scoped token via `getChatwootConfig()` (already `getMitraId()`-scoped). A mitra physically cannot read another account. Customer-scoped endpoint also loads the customer tenant-scoped.
- [[reference-api-response-envelope]] — all routes use `sendSuccess`/`sendError`.
- [[feedback-coding-standards]] — semantic HTML5 (`main`/`nav`/`section`/`article`), DRY, reusable components, pure logic (payload mappers) in a tested module.
- CLAUDE.md gotcha #15 — `refetchIntervalInBackground: false` is the default; polling auto-pauses on blur.

## 1. Backend

### 1a. Client functions (add to `server/chatwoot.ts`, reuse private `chatwootRequest`)
- `listInboxes(): Promise<RawInbox[]>` → `GET /inboxes`
- `listConversations(params: { inboxId?; status?; page? }): Promise<RawConvPage>` → `GET /conversations?inbox_id=&status=&page=`
- `listConversationMessages(conversationId, before?): Promise<RawMessagePage>` → `GET /conversations/{id}/messages?before=`
- `searchContactByPhone(phone: string): Promise<RawContact | null>` → `GET /contacts/search?q=<normalized>` (pick best phone match)
- `listContactConversations(contactId): Promise<RawConv[]>` → `GET /contacts/{id}/conversations`

These return raw Chatwoot JSON; mapping to DTOs happens in the pure module (1c). `chatwootRequest` already throws "Chatwoot belum terkonfigurasi" when disabled — endpoints translate that to an empty/disabled response.

### 1b. Routes (register near existing chatwoot routes in `server/routes.ts`, gated `chatwoot` read)
| Route | Returns |
|---|---|
| `GET /api/integrations/chatwoot/inboxes` | `Inbox[]` |
| `GET /api/integrations/chatwoot/conversations?inboxId=&status=&page=` | `{ conversations: ConversationSummary[]; meta: { count, currentPage } }` |
| `GET /api/integrations/chatwoot/conversations/:id/messages?before=` | `{ messages: ChatMessage[]; hasMore: boolean }` |
| `GET /api/integrations/chatwoot/customers/:id/conversations` | `{ contactId: number\|null; contactName: string\|null; conversations: ConversationSummary[] }` |

All: `requireAuth` → `hasPermission(req,"chatwoot")` → `sendSuccess`. The customer endpoint loads the customer via tenant-scoped storage (404 if not in mitra) before any Chatwoot call. When Chatwoot is disabled/unconfigured, return a benign empty shape (`configured:false` style) — never a 500.

### 1c. Pure mappers (`shared/chatwootMappers.ts` + test)
- `type ConversationSummary = { id: number; inboxId: number|null; status: string; lastMessage: string|null; lastActivityAt: string|null; assigneeName: string|null; contactName: string|null; unread: number }`
- `type ChatMessage = { id: number; content: string|null; type: "incoming"|"outgoing"|"private"|"activity"; senderName: string|null; createdAt: string|null; attachments: { url: string; type: string }[] }`
- `type Inbox = { id: number; name: string; channelType: string|null }`
- `mapConversation(raw): ConversationSummary`, `mapMessage(raw): ChatMessage`, `mapInbox(raw): Inbox`, `mapConversationsPage(raw): { conversations; meta }`.
- Defensive: tolerate missing fields; `message_type` int→union (`0=incoming,1=outgoing,2=activity,3=template`; `private:true`→`"private"`). Tested with sample payloads.

## 2. Frontend

### 2a. Client layer
- `client/lib/chatwoot.ts` (extend): `listInboxes`, `listConversations`, `getConversationMessages`, `getCustomerConversations`.
- `client/hooks/useChatwoot.ts` (extend): `useChatwootInboxes()`, `useChatwootConversations(params)` (poll 20s), `useChatwootMessages(conversationId)` (poll 10s, enabled when a conversation is open), `useCustomerConversations(customerId)`.

### 2b. Reusable components (`client/components/chatwoot/`)
- `InboxSelector` — list/segmented inboxes + "Semua".
- `ConversationList` + `ConversationListItem` — summary rows (contact, last message, time, status badge, assignee).
- `ConversationThread` — message bubbles (incoming left / outgoing right / private styled), date separators, attachment chips, infinite-older via `before=`; header with `OpenInChatwootButton` (deep-link to the conversation).
- `ConversationStatusBadge` — maps open/resolved/pending/snoozed → `StatusBadge` variants.
- `ChatwootContactCard` — contact name/phone + last interaction (customer section header).

### 2c. `/communications` page (`client/pages/CommunicationsPage.tsx`)
- **Desktop (≥md)**: 3-pane grid — `<nav>` InboxSelector │ `<section>` ConversationList │ `<section>` ConversationThread.
- **Mobile**: single-pane drill-down (inbox → conversations → thread) with back nav; follows the repo's full-bleed mobile pattern.
- Lazy route in `client/App.tsx` (`/communications`) gated `chatwoot` read; sidebar entry under a suitable group (gated). Skeleton/empty/error states.

### 2d. Customer-detail "Komunikasi" section (`client/pages/CustomersPage.tsx`)
In the customer detail dialog, a `<section aria-label="Komunikasi">`: `ChatwootContactCard` (or empty state "Belum ada kontak Chatwoot untuk pelanggan ini"), `ConversationList` (customer-scoped), click → `ConversationThread`. Reuses 2b. Hidden/empty-state when Chatwoot disabled (reuse `useChatwootStatus`).

## 3. Testing & verification
- **Unit**: `shared/chatwootMappers.test.ts` — sample Chatwoot payloads (conversation list, message types incoming/outgoing/private/activity, inbox) → DTOs; missing-field tolerance.
- **Manual (staging, real Chatwoot)**: open `/communications` → inboxes load → pick conversation → thread renders, polling updates; customer detail "Komunikasi" shows matched contact's conversations; customer with no Chatwoot contact → clean empty state; second mitra sees only its own account's data (isolation); role without `chatwoot` → no sidebar entry + 403.
- `npm run typecheck` 0 · `npx tsx --test` green · `npm run build` ok.

## 4. File inventory
| File | New/Edit | Purpose |
|---|---|---|
| `shared/chatwootMappers.ts` (+ test) | new | pure payload→DTO mappers |
| `server/chatwoot.ts` | edit | listInboxes/listConversations/listConversationMessages/searchContactByPhone/listContactConversations |
| `server/routes.ts` | edit | 4 read endpoints (gated `chatwoot`) |
| `client/lib/chatwoot.ts` | edit | API wrappers |
| `client/hooks/useChatwoot.ts` | edit | query hooks (polling) |
| `client/components/chatwoot/*` | new | InboxSelector, ConversationList(+Item), ConversationThread, ConversationStatusBadge, ChatwootContactCard |
| `client/pages/CommunicationsPage.tsx` | new | standalone page |
| `client/App.tsx` | edit | lazy route `/communications` |
| `client/components/layout/Sidebar.tsx` | edit | sidebar entry (gated `chatwoot`) |
| `client/pages/CustomersPage.tsx` | edit | "Komunikasi" section in detail dialog |

## 5. Out of scope (later specs)
- Reply-from-Workspace (send message) — write path; `sendChatwootMessage` exists, add after read proves out.
- Contact Sync, Agent Sync — sibling Batch 2 specs.
- Real-time websockets — polling only.
- Assigning/resolving conversations from Workspace — write.

## 6. Open risks
- **Chatwoot API shapes** — conversation list (`data.payload[]`, `data.meta`), messages (`payload[]`, `before=<message_id>` pagination), `message_type` int encoding, `/contacts/search?q=` ranking. Verify against the live `omni.jabnet.id` during implementation; the pure mappers isolate any shape fixes to one tested module.
- **Contact match precision** — `searchContactByPhone` may return multiple; pick exact normalized `phone_number` match, else treat as no match (avoid showing another customer's chats). Reuse the webhook's normalization approach.
- **Volume/pagination** — large accounts: default page size + "muat lebih" rather than fetching all.
