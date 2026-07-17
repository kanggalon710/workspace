# Chatwoot Assign & Resolve — Batch 2e Plan

**Goal:** Change conversation status (open/pending/resolved) + assign/unassign agent from the thread.
**Spec:** `docs/superpowers/specs/2026-06-13-chatwoot-assign-resolve-design.md` · **Branch:** `dev` (no push).

## E1 — mapper assigneeId
- [ ] `shared/chatwootMappers.ts`: add `assigneeId: number|null` to `ConversationSummary`; `mapConversation` reads `meta.assignee.id`. Update test (add assigneeId assertion in the mapConversation case). Run mapper test → pass. Commit.

## E2 — backend fns + endpoints
- [ ] `server/chatwoot.ts`: `setConversationStatus(id, status)` (POST toggle_status {status}); `assignConversation(id, assigneeId|null)` (POST assignments {assignee_id: assigneeId ?? 0}).
- [ ] `server/routes.ts` (after reply endpoint): `POST /conversations/:id/status` (validate status ∈ open/pending/resolved) + `POST /conversations/:id/assign`; gated `hasWritePermission(req,"chatwoot")`, audited, disabled→400, `String(req.params.id)`.
- [ ] typecheck 0 → commit.

## E3 — client wrappers + hooks
- [ ] `client/lib/chatwoot.ts`: `setConversationStatus(id,status)`, `assignConversation(id, assigneeId|null)`.
- [ ] `client/hooks/useChatwoot.ts`: `useSetConversationStatus()`, `useAssignConversation()` — invalidate `["chatwoot-conversations"]` + `["chatwoot-customer-conversations"]`.
- [ ] typecheck 0 → commit.

## E4 — thread header controls + prop threading
- [ ] `ConversationThread.tsx`: accept `conversation?: ConversationSummary`; header (gated chatwoot write + configured) shows status buttons (open/pending/resolved, current highlighted) + `AgentSelector` (agents from useChatwootAgents, value String(assigneeId)). Wire mutations w/ toast.
- [ ] `CommunicationsPage.tsx` + `CustomersPage.tsx`: pass `conversation` summary for the active id.
- [ ] typecheck + build → commit.

## E5 — verify
- [ ] typecheck 0 · `npx tsx --test shared/*.test.ts server/*.test.ts` green · build ok. Manual smoke per spec §5.
