# Chatwoot Agent Sync (Mapping) — Batch 2c Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Map Workspace users ↔ existing Chatwoot agents per mitra (list agents + link, with email-match suggestions). No agent provisioning.

**Architecture:** Reuse account-scoped `chatwootRequest` to list agents. Mapping stored in a new per-mitra `chatwoot_agent_links` table. Pure mapper/suggest in a tested `shared/` module. Reads gated `chatwoot`; writes gated `chatwoot_settings`, guarded so the target user ∈ active mitra.

**Tech Stack:** Express 5 + Drizzle (MySQL) · React 18 + TanStack Query + Wouter + shadcn/ui (`Combobox`) · `node:test`.

**Spec:** `docs/superpowers/specs/2026-06-13-chatwoot-agent-sync-design.md`
**Branch:** `dev`. Do not push/deploy.

**Confirmed conventions:**
- Tenant guard helper `requireUserInScope(req, res, targetUserId): Promise<boolean>` exists in `server/routes.ts` (404s cross-tenant). `storage.getUserIdsInMitra(mitraId): Promise<Set<number>>` for membership.
- Startup `CREATE TABLE IF NOT EXISTS` pattern: see `server/storage.ts` (e.g. `odp_photos` ~line 669).
- `Combobox` (`@/components/ui/combobox`): props `options: {value,label,description?}[]`, `value: string`, `onChange: (v: string) => void`, `clearable`, `placeholder`, `searchPlaceholder`.
- Client `/api/users` query key is `["/api/users"]` (tenant-scoped server-side).
- `req.params` values are `string|string[]` → wrap `Number(...)`.
- Run typecheck/build YOURSELF; don't trust a subagent's "0 errors" claim.

---

## Task A1: Schema table + startup migration + storage methods

**Files:** `shared/schema.ts`, `server/storage.ts`

- [ ] **Step 1: Add table to `shared/schema.ts`** (near the other `chatwoot*` tables, ~line 2360):
```ts
// Pemetaan Workspace user ↔ Chatwoot agent (per-mitra; agent per-account).
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
export type ChatwootAgentLink = typeof chatwootAgentLinks.$inferSelect;
```

- [ ] **Step 2: Startup CREATE TABLE in `server/storage.ts`**
Find the boot block with `CREATE TABLE IF NOT EXISTS odp_photos (...)` and add, following the same style (raw SQL via `this.pool.execute`, wrapped in the existing try/catch boot pattern):
```ts
await this.pool.execute(`CREATE TABLE IF NOT EXISTS chatwoot_agent_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mitra_id INT NOT NULL DEFAULT 1,
  user_id INT NOT NULL,
  chatwoot_agent_id VARCHAR(64) NOT NULL,
  agent_name TEXT NULL,
  agent_email TEXT NULL,
  created_at TEXT NULL,
  updated_at TEXT NULL,
  UNIQUE KEY uniq_chatwoot_agent_link (mitra_id, user_id)
)`);
```

- [ ] **Step 3: Storage methods** (add near other chatwoot storage methods, ~line 10130; ensure `chatwootAgentLinks` imported from schema — add to the existing schema import):
```ts
async listChatwootAgentLinks(): Promise<ChatwootAgentLink[]> {
  const mitraId = getMitraId();
  return this.db.select().from(chatwootAgentLinks).where(eq(chatwootAgentLinks.mitraId, mitraId));
}
async setChatwootAgentLink(userId: number, agentId: string, name: string | null, email: string | null): Promise<void> {
  const mitraId = getMitraId();
  const now = new Date().toISOString();
  await this.db.execute(sql`
    INSERT INTO chatwoot_agent_links (mitra_id, user_id, chatwoot_agent_id, agent_name, agent_email, created_at, updated_at)
    VALUES (${mitraId}, ${userId}, ${agentId}, ${name}, ${email}, ${now}, ${now})
    ON DUPLICATE KEY UPDATE chatwoot_agent_id = VALUES(chatwoot_agent_id), agent_name = VALUES(agent_name), agent_email = VALUES(agent_email), updated_at = VALUES(updated_at)
  `);
}
async deleteChatwootAgentLink(userId: number): Promise<number> {
  const mitraId = getMitraId();
  const result: any = await this.db.execute(sql`DELETE FROM chatwoot_agent_links WHERE mitra_id = ${mitraId} AND user_id = ${userId}`);
  return Number(result?.[0]?.affectedRows ?? 0);
}
```
(Add `ChatwootAgentLink` + `chatwootAgentLinks` to the schema import; `sql`, `eq`, `getMitraId` already imported.)

- [ ] **Step 4: Verify** `npm run typecheck` → 0 errors.

- [ ] **Step 5: Commit**
```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(chatwoot): chatwoot_agent_links table + per-mitra link storage methods"
```

---

## Task A2: Pure `shared/chatwootAgent.ts`

**Files:** Create `shared/chatwootAgent.ts` + `shared/chatwootAgent.test.ts`

- [ ] **Step 1: Failing test**
```ts
// shared/chatwootAgent.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAgent, suggestAgentMatchesByEmail } from "./chatwootAgent.js";

test("mapAgent maps fields + availability", () => {
  assert.deepEqual(
    mapAgent({ id: 7, name: "CS Sari", email: "sari@jabnet.id", role: "agent", availability_status: "online" }),
    { id: 7, name: "CS Sari", email: "sari@jabnet.id", role: "agent", available: true },
  );
  assert.equal(mapAgent({ id: 8, name: "X", availability_status: "offline" }).available, false);
  assert.equal(mapAgent({ id: 9, name: "Y" }).email, null);
});

test("suggestAgentMatchesByEmail matches case-insensitively, skips empty", () => {
  const agents = [
    { id: 1, name: "A", email: "Sari@Jabnet.id", role: null, available: true },
    { id: 2, name: "B", email: "budi@jabnet.id", role: null, available: false },
  ];
  const users = [
    { id: 10, email: "sari@jabnet.id" },
    { id: 11, email: null },
    { id: 12, email: "none@x.id" },
  ];
  assert.deepEqual(suggestAgentMatchesByEmail(agents, users), [{ userId: 10, agentId: 1 }]);
});
```

- [ ] **Step 2: Run → FAIL** `npx tsx --test shared/chatwootAgent.test.ts`

- [ ] **Step 3: Implement `shared/chatwootAgent.ts`**
```ts
/** Pure: Chatwoot agent payload → DTO + email-based user↔agent suggestions. No I/O — testable. */

export type ChatwootAgent = { id: number; name: string; email: string | null; role: string | null; available: boolean };

export function mapAgent(raw: any): ChatwootAgent {
  return {
    id: Number(raw?.id),
    name: String(raw?.name ?? raw?.available_name ?? ""),
    email: raw?.email ?? null,
    role: raw?.role ?? null,
    available: raw?.availability_status === "online",
  };
}

export function suggestAgentMatchesByEmail(
  agents: ChatwootAgent[],
  users: { id: number; email: string | null }[],
): { userId: number; agentId: number }[] {
  const byEmail = new Map<string, number>();
  for (const a of agents) {
    const e = (a.email ?? "").trim().toLowerCase();
    if (e && !byEmail.has(e)) byEmail.set(e, a.id);
  }
  const out: { userId: number; agentId: number }[] = [];
  for (const u of users) {
    const e = (u.email ?? "").trim().toLowerCase();
    if (!e) continue;
    const agentId = byEmail.get(e);
    if (agentId != null) out.push({ userId: u.id, agentId });
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS (2 tests)** `npx tsx --test shared/chatwootAgent.test.ts`

- [ ] **Step 5: Commit**
```bash
git add shared/chatwootAgent.ts shared/chatwootAgent.test.ts
git commit -m "feat(chatwoot): pure agent mapper + email-match suggestions (shared)"
```

---

## Task A3: Backend listAgents + routes

**Files:** `server/chatwoot.ts`, `server/routes.ts`

- [ ] **Step 1: `server/chatwoot.ts`** — append after the contact-sync functions:
```ts
/** List agents of the active mitra's account. Chatwoot returns a bare array (or {payload}). */
export async function listAgents(): Promise<any[]> {
  const res = await chatwootRequest("/agents");
  return Array.isArray(res) ? res : (Array.isArray(res?.payload) ? res.payload : []);
}
```

- [ ] **Step 2: `server/routes.ts`** — add after the contact-sync endpoints. Confirm `requireUserInScope` + `storage.getUserIdsInMitra` exist (they do).
```ts
/** Agent mapping (Batch 2c). List = chatwoot read; set/clear = chatwoot_settings write. */
router.get("/api/integrations/chatwoot/agents", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const { listAgents } = await import("./chatwoot.js");
    const { mapAgent, suggestAgentMatchesByEmail } = await import("../shared/chatwootAgent.js");
    const agents = (await listAgents()).map(mapAgent);
    const links = await storage.listChatwootAgentLinks();
    // this mitra's users (tenant-scoped) for suggestions
    const memberIds = await storage.getUserIdsInMitra(req.authUser.activeMitraId ?? 1);
    const allUsers = await storage.getAllUsers();
    const users = allUsers.filter((u: any) => memberIds.has(u.id)).map((u: any) => ({ id: u.id, email: u.email ?? null }));
    const suggestions = suggestAgentMatchesByEmail(agents, users);
    sendSuccess(res, { agents, links: links.map((l) => ({ userId: l.userId, chatwootAgentId: l.chatwootAgentId, agentName: l.agentName })), suggestions });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { agents: [], links: [], suggestions: [] });
    sendError(res, e.message, 500);
  }
});

router.put("/api/integrations/chatwoot/users/:userId/agent", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak (write)", 403);
  const userId = Number(req.params.userId);
  if (!(await requireUserInScope(req, res, userId))) return; // 404s cross-tenant
  try {
    const agentId = String(req.body?.agentId ?? "").trim();
    if (!agentId) return sendError(res, "agentId wajib", 400);
    const { listAgents } = await import("./chatwoot.js");
    const { mapAgent } = await import("../shared/chatwootAgent.js");
    const agent = (await listAgents()).map(mapAgent).find((a) => String(a.id) === agentId);
    if (!agent) return sendError(res, "Agent Chatwoot tidak ditemukan", 404);
    await storage.setChatwootAgentLink(userId, agentId, agent.name, agent.email);
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "UPDATE", entityType: "chatwoot_agent_link", entityId: userId, entityName: agent.name,
      details: JSON.stringify({ chatwootAgentId: agentId }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, { ok: true });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});

router.delete("/api/integrations/chatwoot/users/:userId/agent", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak (write)", 403);
  const userId = Number(req.params.userId);
  if (!(await requireUserInScope(req, res, userId))) return;
  try {
    await storage.deleteChatwootAgentLink(userId);
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "DELETE", entityType: "chatwoot_agent_link", entityId: userId, entityName: null,
      details: null, createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});
```
> Confirm `storage.getAllUsers()` exists (it does — used elsewhere). If a tenant-scoped user lister exists, prefer it; otherwise the `memberIds.has` filter above keeps it tenant-correct.

- [ ] **Step 3: Verify** `npm run typecheck` → 0 errors.

- [ ] **Step 4: Commit**
```bash
git add server/chatwoot.ts server/routes.ts
git commit -m "feat(chatwoot): agent list + user-agent mapping endpoints (guarded, audited)"
```

---

## Task A4: Client wrappers + hooks + AgentSelector

**Files:** `client/lib/chatwoot.ts`, `client/hooks/useChatwoot.ts`, create `client/components/chatwoot/AgentSelector.tsx`

- [ ] **Step 1: `client/lib/chatwoot.ts`** — add types + methods:
```ts
export type ChatwootAgent = { id: number; name: string; email: string | null; role: string | null; available: boolean };
export type AgentMapData = {
  agents: ChatwootAgent[];
  links: { userId: number; chatwootAgentId: string; agentName: string | null }[];
  suggestions: { userId: number; agentId: number }[];
};
// add to chatwootApi:
  listAgents: () => api.get<AgentMapData>("/integrations/chatwoot/agents"),
  setUserAgent: (userId: number, agentId: string) => api.put<{ ok: boolean }>(`/integrations/chatwoot/users/${userId}/agent`, { agentId }),
  clearUserAgent: (userId: number) => api.delete<{ ok: boolean }>(`/integrations/chatwoot/users/${userId}/agent`),
```
(Confirm `api.delete<T>(path)` exists — it does: `delete: <T>(path, body?)`.)

- [ ] **Step 2: `client/hooks/useChatwoot.ts`** — add:
```ts
export function useChatwootAgents() {
  return useQuery({ queryKey: ["chatwoot-agents"], queryFn: () => chatwootApi.listAgents(), staleTime: 60_000, retry: 0 });
}
export function useSetUserAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, agentId }: { userId: number; agentId: string }) => chatwootApi.setUserAgent(userId, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatwoot-agents"] }),
  });
}
export function useClearUserAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => chatwootApi.clearUserAgent(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatwoot-agents"] }),
  });
}
```

- [ ] **Step 3: `client/components/chatwoot/AgentSelector.tsx`**
```tsx
import { Combobox } from "@/components/ui/combobox";
import type { ChatwootAgent } from "@/lib/chatwoot";

export function AgentSelector({ agents, value, onChange, suggestedAgentId }: {
  agents: ChatwootAgent[];
  value: string | null;
  onChange: (agentId: string | null) => void;
  suggestedAgentId?: number | null;
}) {
  const options = agents.map((a) => ({
    value: String(a.id),
    label: a.name + (suggestedAgentId === a.id ? " · cocok via email" : ""),
    description: a.email ?? undefined,
  }));
  return (
    <Combobox
      options={options}
      value={value ?? undefined}
      onChange={(v) => onChange(v || null)}
      placeholder="Pilih agent Chatwoot…"
      searchPlaceholder="Cari agent…"
      size="sm"
    />
  );
}
```
> Verify `Combobox` accepts `value` as `string | undefined` and calls `onChange(value)` (clearing yields `""`). Adjust if its clear contract differs.

- [ ] **Step 4: Verify** `npm run typecheck` → 0 errors.

- [ ] **Step 5: Commit**
```bash
git add client/lib/chatwoot.ts client/hooks/useChatwoot.ts client/components/chatwoot/AgentSelector.tsx
git commit -m "feat(chatwoot): agent client wrappers + hooks + AgentSelector"
```

---

## Task A5: ChatwootAgentMapPage + route + IntegrationPage link

**Files:** create `client/pages/ChatwootAgentMapPage.tsx`; edit `client/App.tsx`, `client/pages/IntegrationPage.tsx`

- [ ] **Step 1: Page** `client/pages/ChatwootAgentMapPage.tsx`
```tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useChatwootAgents, useSetUserAgent, useClearUserAgent } from "@/hooks/useChatwoot";
import { AgentSelector } from "@/components/chatwoot/AgentSelector";

type StaffUser = { id: number; name: string; email: string | null; roleName?: string | null; role?: string | null };

export default function ChatwootAgentMapPage() {
  const { data, isLoading } = useChatwootAgents();
  const { data: users } = useQuery<StaffUser[]>({ queryKey: ["/api/users"], queryFn: () => api.get<StaffUser[]>("/users") });
  const setAgent = useSetUserAgent();
  const clearAgent = useClearUserAgent();

  const linkByUser = useMemo(() => new Map((data?.links ?? []).map((l) => [l.userId, l.chatwootAgentId])), [data?.links]);
  const suggestByUser = useMemo(() => new Map((data?.suggestions ?? []).map((s) => [s.userId, s.agentId])), [data?.suggestions]);
  const agents = data?.agents ?? [];

  return (
    <PageContainer>
      <PageHeader icon={Users} title="Pemetaan Agent Chatwoot" description="Hubungkan user Workspace dengan agent Chatwoot" accent="info" />
      <Card>
        <CardContent className="p-4">
          {isLoading ? <SkeletonTable /> : !users?.length ? (
            <EmptyState icon={Users} title="Tidak ada user" />
          ) : (
            <ul className="divide-y divide-border/50">
              {users.map((u) => {
                const current = linkByUser.get(u.id) ?? null;
                return (
                  <li key={u.id} className="flex flex-col md:flex-row md:items-center gap-2 py-2.5">
                    <div className="md:w-56 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email || "—"}</p>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1">
                        <AgentSelector
                          agents={agents}
                          value={current}
                          suggestedAgentId={suggestByUser.get(u.id) ?? null}
                          onChange={(agentId) => {
                            if (agentId) setAgent.mutate({ userId: u.id, agentId }, { onSuccess: () => toast.success("Agent dipetakan"), onError: (e: any) => toast.error(e.message) });
                            else clearAgent.mutate(u.id, { onSuccess: () => toast.success("Pemetaan dihapus"), onError: (e: any) => toast.error(e.message) });
                          }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
```
> Verify `SkeletonTable` exists (grep `Skeleton` in `client/components/ui/skeleton`); if not, use `SkeletonList`. Verify the `/api/users` response is the array shape used here (grep how UsersPage consumes it; adjust `.email`/`.name` field names if needed).

- [ ] **Step 2: `client/App.tsx`** — lazy import + route gated `chatwoot_settings`:
```tsx
const ChatwootAgentMapPage = lazy(() => import("@/pages/ChatwootAgentMapPage"));
```
```tsx
<Route path="/integrations/chatwoot/agents">{() => <WithPerm permission="chatwoot_settings"><ChatwootAgentMapPage /></WithPerm>}</Route>
```

- [ ] **Step 3: `client/pages/IntegrationPage.tsx`** — in the Chatwoot card, add a button (next to existing ones) to open the page: `useLocation` → `setLocation("/integrations/chatwoot/agents")`, label "Pemetaan Agent". Gate render on the chatwoot status being configured if convenient (optional; the route is permission-gated regardless).

- [ ] **Step 4: Verify** `npm run typecheck && npm run build` → 0 errors, build ok.

- [ ] **Step 5: Commit**
```bash
git add client/pages/ChatwootAgentMapPage.tsx client/App.tsx client/pages/IntegrationPage.tsx
git commit -m "feat(chatwoot): agent mapping page + route + integration link"
```

---

## Task A6: Verification + smoke

- [ ] **Step 1: Full suite** (run yourself):
`npm run typecheck && npx tsx --test shared/*.test.ts server/*.test.ts && npm run build`
Expected: 0 errors · all tests pass (incl. `chatwootAgent`) · build ok.

- [ ] **Step 2: Manual smoke (staging, real Chatwoot)**
1. `/integrations/chatwoot/agents` lists this mitra's users + a Chatwoot agent picker; users whose email matches an agent show "cocok via email".
2. Pick an agent → saved (persists on reload); clear → removed.
3. Only this account's agents appear; only this mitra's users listed.
4. Role without `chatwoot_settings` write → 403 on save; role without `chatwoot` read → no page/agent list.
5. Cross-mitra `userId` in PUT/DELETE → 404.
6. If `/agents` payload differs, fix only in `mapAgent`/`listAgents`.

- [ ] **Step 3: Commit any smoke fixes**

---

## Self-review notes
- **Spec coverage:** §1 table → A1; §2 pure → A2; §3 backend (listAgents + storage + routes) → A1,A3; §4 frontend → A4,A5; §5 isolation (account-scoped list, mitra-guarded writes, `chatwoot_settings`) → A3; §6 testing → A2,A6. Covered.
- **Type consistency:** `ChatwootAgent` defined in `shared/chatwootAgent.ts` (A2) and mirrored in `client/lib/chatwoot.ts` (A4) — keep in sync (or re-export from shared like the communications DTOs). `setChatwootAgentLink(userId, agentId:string, name, email)` consistent A1↔A3.
- **Deferred:** provisioning/invite, ticket auto-routing, status sync-back.
- **Verify-before-use:** `getAllUsers` name, `/api/users` response shape, `SkeletonTable` vs `SkeletonList`, `Combobox` clear contract, IntegrationPage `useLocation` import.
