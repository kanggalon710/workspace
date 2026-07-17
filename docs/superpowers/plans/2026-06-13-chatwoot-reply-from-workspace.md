# Chatwoot Reply from Workspace — Batch 2d Plan

**Goal:** Reply to a Chatwoot conversation from the thread composer (outgoing or private note), reusing `sendChatwootMessage`.
**Spec:** `docs/superpowers/specs/2026-06-13-chatwoot-reply-from-workspace-design.md` · **Branch:** `dev` (no push).

## Task R1 — Backend endpoint
- [ ] `server/routes.ts`: add `POST /api/integrations/chatwoot/conversations/:id/messages` after the agent endpoints. Gated `hasWritePermission(req,"chatwoot")`. Body `{content, private}`; trim + reject empty (400). `sendChatwootMessage(String(id), content, "outgoing", !!private)`. Audit `chatwoot_reply` (fact + private flag only). Disabled → 400.
- [ ] typecheck 0 → commit.

## Task R2 — Client wrapper + hook
- [ ] `client/lib/chatwoot.ts`: `sendMessage: (conversationId, content, isPrivate) => api.post<{ok:boolean}>(`/integrations/chatwoot/conversations/${conversationId}/messages`, {content, private: isPrivate})`.
- [ ] `client/hooks/useChatwoot.ts`: `useSendChatwootMessage(conversationId)` mutation; onSuccess invalidate `["chatwoot-messages", conversationId]`.
- [ ] typecheck 0 → commit.

## Task R3 — Composer in ConversationThread
- [ ] `client/components/chatwoot/ConversationThread.tsx`: add composer footer (textarea + "Catatan internal" checkbox + "Kirim"); gated by `useChatwootStatus` enabled+configured AND `useAuth().canWrite("chatwoot")`. Enter submits, Shift+Enter newline; clear on success; toast on error; disable empty/pending.
- [ ] typecheck + build → commit.

## Task R4 — Verify
- [ ] `npm run typecheck` 0 · `npx tsx --test shared/*.test.ts server/*.test.ts` green · `npm run build` ok. Manual smoke per spec §3.
