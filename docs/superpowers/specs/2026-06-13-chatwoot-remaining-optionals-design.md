# Spec — Chatwoot Remaining Optionals — Batch 2f

> **Date**: 2026-06-13 · **Status**: Approved (user: "finish all optionals")
> Covers the remaining feasible optional items in one batch. Each sub-feature is independent.

## Excluded (with reason — NOT skipped silently)

- **Provisioning / invite agents** — requires Chatwoot **platform/super-admin API**. The whole integration's isolation is built on **per-account tokens** (a mitra's token sees only its account). A platform token would be a global super-admin credential = the exact cross-tenant risk we designed against. Implementing this needs an auth-architecture change and is out of scope; revisit only if the org decides to manage a platform token centrally.
- **Snoozed status + priority + bulk actions** — low-value speculative polish (snoozed needs a time picker; bulk needs list-selection infra on `/communications`). Deferred; can be added on request.

## A. Auto-routing tickets → mapped agent

When a Workspace ticket is assigned to a user, if the ticket has a linked Chatwoot conversation (`chatwoot_ticket_links`) AND the assigned user has an agent mapping (`chatwoot_agent_links`, batch 2c) → assign that Chatwoot conversation to the mapped agent. **Best-effort** (failure must not break ticket assignment).

- Storage: `getChatwootAgentLinkByUser(userId): Promise<ChatwootAgentLink | undefined>` (tenant-scoped).
- Hook in `POST /api/tickets/:id/assign` (routes.ts ~9759, after team-lead sync, before audit): wrapped in try/catch — `getChatwootLinkByTicket(id)` → if conversationId + `getChatwootAgentLinkByUser(assignedTo)` → `assignConversation(convId, Number(agentId))`. Log + swallow errors.
- No new permission (rides the existing ticket-assign auth). No UI.

## B. Composer polish (`ConversationThread`)

1. **Optimistic insert**: on send, optimistically append the message to the cached thread (temp id) so it shows immediately; reconcile on refetch. Use TanStack `onMutate`/`onError` rollback + `onSettled` invalidate.
2. **Attachment upload**: file input in the composer; send via **multipart** to Chatwoot.
   - `server/chatwoot.ts`: `sendChatwootMessageMultipart(conversationId, content, isPrivate, files: {buffer, filename, contentType}[])` — uses `multipart/form-data` (Chatwoot message API accepts `attachments[]`). Add a multipart-capable request (not the JSON `chatwootRequest`).
   - Endpoint: extend reply to accept files. To keep minimal churn + avoid multer, the client sends base64 data (reuse existing `imageCompress`/JSON 10MB limit) → server decodes to Buffer → multipart to Chatwoot. New endpoint `POST /conversations/:id/messages-attachment` body `{ content?, private?, attachments: [{dataUrl, filename}] }`.
   - Composer: a small attach (paperclip) button → file picker (image/*), preview chip, send with message.

> If attachment plumbing proves fragile against the live Chatwoot multipart contract, ship optimistic-insert (B1) and gate B2 behind a follow-up — but attempt B2.

## C. Scheduled contact-sync worker

Automate Contact Sync (batch 2b) for mitras that opt in.

- Setting (per-mitra, `chatwoot_config` already has columns? No → use `mitra_integrations` key `chatwoot_autosync_contacts` = "true"/"false", default false) gating the worker per tenant.
- `server/chatwoot-contact-sync-worker.ts`: every N min (e.g. 30), for each active mitra with autosync on + Chatwoot configured, sync customers changed since last run (use `customers.lastSyncAt` / `chatwootSyncedAt` heuristic: `chatwootSyncedAt IS NULL OR chatwootSyncedAt < lastSyncAt`), capped per cycle (e.g. 50/mitra) to respect rate limits. Reuse `upsertChatwootContact`.
- Register in `server/index.ts` gated by `WORKERS_ENABLED !== "false"` + a global enable flag, mirroring `billingSyncWorker`. **Note**: prod runs `WORKERS_ENABLED=false` (manual-only) → worker dormant there until enabled; build it ready.
- Tenant context: run each mitra's batch inside `tenantContext.run({mitraId,...})` (like other per-mitra worker loops).

## Consistency with Memory
- [[project-chatwoot-integration]] — extends 2b/2c/2d. Reuse `upsertChatwootContact`, `assignConversation`, `chatwootRequest`. GREP first.
- [[reference-prod-billing-sync-manual]] — prod `WORKERS_ENABLED=false`; the contact-sync worker will be dormant in prod (expected) — manual sync remains primary there.
- [[reference-tenant-isolation-gotchas]] — worker must wrap each mitra in `tenantContext.run`; use per-mitra getters.

## Testing
- A: manual — assign a ticket (with linked conversation) to a user who has an agent mapping → conversation assigned in Chatwoot; no mapping → no-op, ticket assign still works.
- B: manual — send message shows immediately (optimistic); attach an image → appears in Chatwoot conversation.
- C: local — enable autosync for a mitra, run worker tick → unsynced customers get contacts; rate cap respected. Pure-ish selection logic could be unit-tested if extracted.
- All: `npm run typecheck` 0 · existing tests green · `npm run build` ok (verified by me).

## Open risks
- Chatwoot multipart message contract (field names `attachments[]`, `content`, `private`) — verify live; isolate in `sendChatwootMessageMultipart`.
- Worker rate-limits — cap per cycle + sequential; log partials.
- Optimistic insert temp-id collisions — use a negative/temp id, replaced on refetch.
