# Spec — Chatwoot Assign & Resolve from Workspace — Batch 2e (optional)

> **Date**: 2026-06-13 · **Status**: Approved design, pre-plan
> **Parent**: Optional follow-up to 2a (Communications read) + 2c (agent list) + 2d (reply). Lets staff change a conversation's status and assignee from inside Workspace.

## Goal

From the conversation thread (in `/communications` and the customer "Komunikasi" section): change conversation **status** (Open / Pending / Resolved) and **assign/unassign** an agent — without leaving Workspace. Tenant-isolated.

## Decisions (locked)

1. Statuses: **open / pending / resolved** (skip "snoozed" — needs a time picker; deferred).
2. Assign uses the account's agents (reuse 2c `listAgents` + `AgentSelector`); unassign supported.
3. **Permission**: `chatwoot` **write**. Read-only users keep the read view; controls hidden without write.
4. Reflect current assignee in the selector → add `assigneeId` to the conversation summary DTO.
5. Refresh by invalidating the conversation list queries after a change.

## Consistency with Memory
- [[project-chatwoot-integration]] — extends 2a/2c/2d; reuse `chatwootRequest` (account-scoped → isolation), `mapConversation`, `AgentSelector`, `useChatwootAgents`. GREP first.
- [[reference-api-response-envelope]] — `sendSuccess`/`sendError`.
- `req.params` values are `string|string[]` → wrap `String(...)`.

## 1. Pure mapper change (`shared/chatwootMappers.ts` + test)
- Add `assigneeId: number | null` to `ConversationSummary`; in `mapConversation`, read `raw?.meta?.assignee?.id` → number|null.
- Update `shared/chatwootMappers.test.ts` (the existing `mapConversation` case asserts assignee; add `assigneeId`).

## 2. Backend (`server/chatwoot.ts`)
- `setConversationStatus(conversationId, status: "open"|"pending"|"resolved")` → `chatwootRequest('/conversations/{id}/toggle_status', { method: "POST", body: { status } })`.
- `assignConversation(conversationId, assigneeId: number | null)` → `chatwootRequest('/conversations/{id}/assignments', { method: "POST", body: { assignee_id: assigneeId ?? 0 } })` (0/null unassigns).

## 3. Routes (`server/routes.ts`, gated `chatwoot` write)
| Route | Behavior |
|---|---|
| `POST /api/integrations/chatwoot/conversations/:id/status` | body `{ status }` (validate ∈ open/pending/resolved); `setConversationStatus`; audit `chatwoot_conv_status` |
| `POST /api/integrations/chatwoot/conversations/:id/assign` | body `{ assigneeId: number\|null }`; `assignConversation`; audit `chatwoot_conv_assign` |

Both: `requireAuth` → `hasWritePermission(req,"chatwoot")`; Chatwoot disabled → 400; account-scoped token ⇒ cross-mitra conversation unreachable. `String(req.params.id)`.

## 4. Frontend
- `client/lib/chatwoot.ts`: `setConversationStatus(id, status)`, `assignConversation(id, assigneeId|null)`.
- `client/hooks/useChatwoot.ts`: `useSetConversationStatus()` / `useAssignConversation()` — mutations; `onSuccess` invalidate `["chatwoot-conversations"]` + `["chatwoot-customer-conversations"]` (both lists carry the summary).
- `client/components/chatwoot/ConversationThread.tsx`: accept optional `conversation?: ConversationSummary`. When present **and** `chatwoot` write + Chatwoot configured, render header controls:
  - **Status**: three small buttons (Open/Pending/Resolved), current highlighted via `conversation.status`; click → `setStatus`.
  - **Assign**: `AgentSelector` (agents from `useChatwootAgents`), value = `String(conversation.assigneeId)`; change → `assign(id, agentId|null)`.
  - Keep the existing "Buka di Chatwoot" deep-link.
- `client/pages/CommunicationsPage.tsx`: pass `conversation={conversations.find(c => c.id === activeConv)}` to the thread.
- `client/pages/CustomersPage.tsx` (CustomerCommunication): pass `conversation={data.conversations.find(c => c.id === active)}`.

## 5. Security / isolation / testing
Account-scoped token; `chatwoot` write gate (server + UI-hidden); audited; no token to client. Unit: updated `mapConversation` test (assigneeId). Manual smoke: change status (badge updates after refetch + reflects in Chatwoot); assign/unassign agent (reflects in Chatwoot + selector); read-only role sees no controls; disabled Chatwoot hides controls.
- `npm run typecheck` 0 · tests green · `npm run build` ok (verified by me).

## 6. File inventory
| File | New/Edit | Purpose |
|---|---|---|
| `shared/chatwootMappers.ts` (+ test) | edit | `assigneeId` on summary |
| `server/chatwoot.ts` | edit | setConversationStatus, assignConversation |
| `server/routes.ts` | edit | status + assign endpoints (gated write, audited) |
| `client/lib/chatwoot.ts` | edit | wrappers |
| `client/hooks/useChatwoot.ts` | edit | mutations |
| `client/components/chatwoot/ConversationThread.tsx` | edit | header status + assign controls |
| `client/pages/CommunicationsPage.tsx` | edit | pass `conversation` prop |
| `client/pages/CustomersPage.tsx` | edit | pass `conversation` prop |

## 7. Out of scope
- Snoozed status (needs time), labels on conversation, priority, bulk status/assign, optimistic updates.

## 8. Open risks
- **Chatwoot `toggle_status` body** — some versions toggle (ignore `status`), others honor `{status}`. Verify; if toggle-only, may need the status-specific param or `custom` endpoint — isolate in `setConversationStatus`.
- **`assignments` body** — `{assignee_id}` (0/null to unassign) is standard; verify unassign behavior.
- **assigneeId presence** in `meta.assignee` — may be absent for unassigned; mapper returns null (selector shows empty).
