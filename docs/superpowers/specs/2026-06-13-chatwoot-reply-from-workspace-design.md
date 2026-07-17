# Spec — Chatwoot Reply from Workspace — Batch 2d (optional)

> **Date**: 2026-06-13 · **Status**: Approved design, pre-plan
> **Parent**: Optional follow-up to Batch 2a (Communications read). Turns the read-only thread into interactive.

## Goal

Let staff reply to a Chatwoot conversation from inside Workspace — a message composer in the conversation thread (used by both `/communications` and the customer "Komunikasi" section). Supports a normal reply (outgoing → customer) and an internal private note. Tenant-isolated.

## Decisions (locked)

1. Reuse the existing `sendChatwootMessage(conversationId, content, "outgoing"|"incoming", isPrivate)` in `server/chatwoot.ts`.
2. **Private-note toggle included** (outgoing reply vs internal note) — cheap, useful for CS.
3. **Permission**: `chatwoot` **write** (manage). Read-only users keep the read view; composer hidden without write.
4. **Refresh by invalidation** — after send, invalidate the thread's messages query (polling also catches up). No optimistic insert this cut.

## Consistency with Memory

- [[project-chatwoot-integration]] — extends batch 2a; reuse `sendChatwootMessage` + `chatwootRequest` (account-scoped → isolation). GREP first.
- [[reference-api-response-envelope]] — `sendSuccess`/`sendError`.
- [[feedback-coding-standards]] — semantic HTML (`<form>` composer), reuse existing `ConversationThread`.
- `req.params` values are `string|string[]` → wrap `String(...)`.

## 1. Backend (`server/routes.ts`, gated `chatwoot` write)

`POST /api/integrations/chatwoot/conversations/:id/messages`
- `requireAuth` → `hasWritePermission(req, "chatwoot")`.
- Body `{ content: string; private?: boolean }`. Trim content; reject empty (400).
- `const { sendChatwootMessage } = await import("./chatwoot.js")` → `sendChatwootMessage(String(req.params.id), content, "outgoing", !!body.private)`.
- Audit `entityType:"chatwoot_reply", entityId:<conversationId numeric or null>, details:{ private }` (no message content stored, to avoid logging PII at volume — only the fact + private flag).
- Chatwoot disabled → 400 ("Chatwoot belum dikonfigurasi"). Other errors → 500 with message.
- Account-scoped token ⇒ a conversation in another mitra's account is unreachable (Chatwoot 404 → surfaced as error). No extra cross-tenant check needed beyond the token.

## 2. Frontend

- `client/lib/chatwoot.ts`: `sendMessage(conversationId, content, isPrivate)` → `api.post`.
- `client/hooks/useChatwoot.ts`: `useSendChatwootMessage(conversationId)` — mutation; `onSuccess` invalidate `["chatwoot-messages", conversationId]`.
- `client/components/chatwoot/ConversationThread.tsx`: add a composer footer **inside** the component (so both consumers get it):
  - Gated: render only when `useChatwootStatus()` enabled+configured **and** `useAuth().canWrite("chatwoot")`.
  - `<form>` with a `<textarea>` (Enter submits / Shift+Enter newline), a "Catatan internal" checkbox (private note), and a "Kirim" button (loading state, disabled when empty/pending).
  - On submit: send → clear textarea → toast on error. Private notes render with the existing private styling once refetched.
  - Keep the thread scroll area above the composer (composer pinned at bottom of the thread panel).

## 3. Security / isolation / testing
- Account-scoped token; `chatwoot` write gate (server-enforced + UI-hidden); audit (fact only, no content). No token to client.
- No new pure module (wiring). Verify: `npm run typecheck` 0 · existing tests still green · `npm run build` ok (verified by me). Manual smoke: send reply → appears in thread + Chatwoot; private note styled + internal in Chatwoot; read-only role sees no composer; disabled Chatwoot → composer hidden.

## 4. File inventory
| File | New/Edit | Purpose |
|---|---|---|
| `server/routes.ts` | edit | POST conversation message (gated write, audited) |
| `client/lib/chatwoot.ts` | edit | `sendMessage` wrapper |
| `client/hooks/useChatwoot.ts` | edit | `useSendChatwootMessage` mutation |
| `client/components/chatwoot/ConversationThread.tsx` | edit | composer footer (gated) |

## 5. Out of scope (later)
- Optimistic message insert; attachments/file upload from Workspace; assign/resolve/status change; canned responses; typing indicators.

## 6. Open risks
- **`sendChatwootMessage` response/HTTP behavior** — verify a send succeeds against live Chatwoot; the existing function throws on non-2xx (surfaced as 500/toast).
- **Textarea Enter-to-send** — ensure Shift+Enter inserts newline; mobile keyboards vary (provide the visible "Kirim" button as the reliable path).
- **Polling vs immediate echo** — after invalidation the sent message appears on next fetch (≤ poll interval); acceptable for this cut.
