# Spec - Chatwoot Agent Sync (Mapping) - Batch 2c

> **Date**: 2026-06-13 · **Status**: Approved design, pre-plan
> **Parent**: Batch 2 of the Chatwoot integration. Builds on the existing per-mitra integration + foundation perms (`chatwoot`/`chatwoot_settings`). Final Batch-2 sub-project.

## Goal

Link Workspace users to existing Chatwoot agents (per mitra) so the "assigned agent" in conversations correlates to a Workspace user. **Mapping/linking only** - no creating Chatwoot user accounts (the per-account token can't; that needs platform API we deliberately avoid). Strict tenant isolation.

## Decisions (locked during brainstorming)

1. **Mapping/linking only** - list the account's agents + map Workspace user ↔ existing Chatwoot agent. No provision/invite.
2. **Per-mitra mapping table** `chatwoot_agent_links` (NOT a `users` column - users can be multi-mitra; agents are per-account).
3. **Email-match suggestions** to ease mapping (suggest the Chatwoot agent whose email matches a user's email).
4. **Permissions**: list/view = `chatwoot` read; set/clear mapping = `chatwoot_settings` write (admin config).

## Consistency with Memory

- [[project-chatwoot-integration]] - extends existing integration; reuse `chatwootRequest` (account-scoped → isolation). GREP first.
- [[reference-tenant-isolation-gotchas]] - agent list scoped by the active mitra's token; mapping writes guarded so the target user ∈ active mitra (use `getUserIdsInMitra` / the existing user-scope guard `requireUserInScope`). Do NOT use global `getAllUsers` without mitra filter.
- [[reference-startup-add-column]] - new table via Drizzle (db:push) or startup `CREATE TABLE IF NOT EXISTS`; per [[reference-per-mitra-roles]] keep `mitra_id` on the table.
- [[reference-api-response-envelope]] - `sendSuccess`/`sendError`.
- [[feedback-coding-standards]] - semantic HTML, DRY, pure mapper/suggest logic in a tested module.
- `req.params` values are `string|string[]` → wrap `Number(...)`.

## 1. Schema (`shared/schema.ts` + startup)

New table `chatwoot_agent_links`:
```ts
export const chatwootAgentLinks = mysqlTable("chatwoot_agent_links", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  userId: int("user_id").notNull(),
  chatwootAgentId: varchar("chatwoot_agent_id", { length: 64 }).notNull(),
  agentName: text("agent_name"),
  agentEmail: text("agent_email"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});
```
Unique index `(mitra_id, user_id)`. Startup `CREATE TABLE IF NOT EXISTS` (mirror how other chatwoot_* tables are ensured at boot) + index creation guarded by information_schema check (per existing index-creation helper).

## 2. Pure module (`shared/chatwootAgent.ts` + test)

- `type ChatwootAgent = { id: number; name: string; email: string | null; role: string | null; available: boolean }`.
- `mapAgent(raw): ChatwootAgent` - Chatwoot `/agents` item → DTO (`availability_status === "online"` → available; tolerate missing).
- `suggestAgentMatchesByEmail(agents: ChatwootAgent[], users: { id: number; email: string | null }[]): { userId: number; agentId: number }[]` - case-insensitive trimmed email match; one suggestion per user (first agent match). Pure + tested (match, no-match, case-insensitivity, empty email skipped).

## 3. Backend

### `server/chatwoot.ts`
- `listAgents(): Promise<any[]>` → `GET /agents` (Chatwoot returns a bare array or `{payload}` - handle both).

### `server/storage.ts`
- `listChatwootAgentLinks(): Promise<ChatwootAgentLink[]>` - tenant-scoped (`mitraId == getMitraId()`).
- `setChatwootAgentLink(userId, agentId, name, email): Promise<void>` - upsert on `(mitraId,userId)`.
- `deleteChatwootAgentLink(userId): Promise<number>` - tenant-scoped delete.

### `server/routes.ts`
| Route | Gate | Behavior |
|---|---|---|
| `GET /api/integrations/chatwoot/agents` | `chatwoot` read | `{ agents: ChatwootAgent[], links: {userId,chatwootAgentId,agentName}[], suggestions: {userId,agentId}[] }` - list agents (mapped), current links for this mitra, + email-match suggestions vs this mitra's users (`getUsersInMitra`/scoped). Chatwoot disabled → benign empty. |
| `PUT /api/integrations/chatwoot/users/:userId/agent` | `chatwoot_settings` write | body `{ agentId }`; **guard** target user ∈ active mitra (else 404); resolve agent name/email from a fresh `listAgents` (or accept from body); `setChatwootAgentLink`; audit `entityType:"chatwoot_agent_link"`. |
| `DELETE /api/integrations/chatwoot/users/:userId/agent` | `chatwoot_settings` write | guard user ∈ mitra; `deleteChatwootAgentLink`; audit. |

Use the established same-mitra user guard (the `requireUserInScope(req,res,userId)` helper added during the users-isolation work, or `getUserIdsInMitra` membership check) - 404 to hide cross-tenant existence.

## 4. Frontend

- `client/lib/chatwoot.ts`: `listAgents()`, `setUserAgent(userId, agentId)`, `clearUserAgent(userId)`.
- `client/hooks/useChatwoot.ts`: `useChatwootAgents()` (read), `useSetUserAgent()` / `useClearUserAgent()` (mutations, invalidate agents).
- `client/components/chatwoot/AgentSelector.tsx` - `Combobox` over agents (name + email), value = mapped agentId, suggestion marker.
- `client/pages/ChatwootAgentMapPage.tsx` (route `/integrations/chatwoot/agents`, gated `chatwoot_settings`): table of this mitra's users (name, email, role) × `AgentSelector`; suggestion chip "cocok via email"; per-row save/clear with toast. Reached from a link/button on the Chatwoot card in `/integrations`. Skeleton/empty/error states; mobile-first responsive (stacked rows on mobile).
  - Needs this mitra's users - reuse the existing `/api/users` (already tenant-scoped) query.

## 5. Security / isolation
Agent list account-scoped (Chatwoot enforces); mapping reads/writes tenant-scoped (table `mitra_id` + target-user-in-mitra guard); writes gated `chatwoot_settings` + audited. No token to client.

## 6. Testing
- Unit: `shared/chatwootAgent.test.ts` (mapAgent tolerance; suggest match/no-match/case/empty).
- Manual (staging, real Chatwoot): agent map page lists this account's agents + this mitra's users; email-matched users show suggestion; pick agent → saved (persists on reload); clear → removed; other mitra's users not listed/clearable (404); role without `chatwoot_settings` write → 403 on save; role without `chatwoot` read → no page.
- `npm run typecheck` 0 · `npx tsx --test` green · `npm run build` ok (verified by me).

## 7. File inventory
| File | New/Edit | Purpose |
|---|---|---|
| `shared/schema.ts` | edit | `chatwootAgentLinks` table + type |
| `server/storage.ts` | edit | startup CREATE TABLE + 3 link methods |
| `shared/chatwootAgent.ts` (+ test) | new | pure mapAgent + suggestAgentMatchesByEmail |
| `server/chatwoot.ts` | edit | `listAgents` |
| `server/routes.ts` | edit | GET agents + PUT/DELETE user agent (gated, guarded, audited) |
| `client/lib/chatwoot.ts` | edit | wrappers |
| `client/hooks/useChatwoot.ts` | edit | hooks |
| `client/components/chatwoot/AgentSelector.tsx` | new | combobox |
| `client/pages/ChatwootAgentMapPage.tsx` | new | mapping page |
| `client/App.tsx` | edit | lazy route (gated `chatwoot_settings`) |
| `client/pages/IntegrationPage.tsx` | edit | link to agent-map page from Chatwoot card |

## 8. Out of scope (later)
- Provisioning/inviting agents (platform API).
- Auto-routing tickets to mapped agents; using the map in the communications view.
- Syncing agent status/role back to Workspace.

## 9. Open risks
- **Chatwoot `/agents` shape** (`availability_status`, `role`, bare array vs `{payload}`) - verify at implementation; isolate in `mapAgent` + `listAgents`.
- **`users.email` completeness** - many users may lack email → no suggestion (manual pick still works).
- **Mitra-user listing** - ensure the page uses the tenant-scoped `/api/users` (default JABNET-scoped) and the write guard validates membership; don't leak cross-mitra users.
