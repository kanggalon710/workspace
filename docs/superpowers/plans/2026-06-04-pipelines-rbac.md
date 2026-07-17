# Pipelines Resource-Level RBAC (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pipeline-level, role-based access control: a per-pipeline "Batasi akses" toggle plus role grants (view/edit), enforced on every pipeline endpoint; default behaviour unchanged.

**Architecture:** New `pipeline_access` join table + `restricted` column on `pipelines` (created on startup). A pure `resolvePipelineLevel` helper + a backend `getPipelineLevel(req, pipelineId)` resolver gate every read (≥view) and mutation (edit). The per-mitra effective role id is surfaced onto `req.authUser`. React access-management dialog + list filtering (server-side) + board controls derived from the caller's level.

**Tech Stack:** Node 20 · Express 5 · Drizzle ORM (MySQL) · React 18 · TS · TanStack Query 5 · Wouter · Tailwind/shadcn. Tests via `node:test` (`npx tsx --test`).

**Spec:** `docs/superpowers/specs/2026-06-04-pipelines-rbac-design.md`

**CRITICAL conventions (Phase 1/2 lessons):**
- Every endpoint responds via `sendSuccess(res, data)` — never raw `res.json`.
- New table/column via startup `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` in `server/storage.ts` — NOT `db:push`.
- Every storage query filters `mitraId = getMitraId()`.
- **Security-critical phase:** the access resolver must gate EVERY pipeline read and mutation. A missed route = an access-control hole. Reviews will check every endpoint.

**Key reference points (verified):**
- `req.authUser` type: `server/routes.ts:26-36`. Assembled in `authMiddleware`: `server/routes.ts:192-204`. `computeAuthFlags`: `routes.ts:147-153`.
- `getUserEffectivePermissionsAtMitra`: `server/storage.ts:6756`; `_resolvePermsAtMitra` (6 return sites): `server/storage.ts:6782-6850`.
- Pipeline routes block: `server/routes.ts` ~4189–4455 (Phase 1+2). Guards `requirePermission`/`requireWritePermission` at `routes.ts:238-249`. `isJabnetRoot(req)` exists in routes.ts.
- Roles list endpoint: `GET /api/roles` (client `api.get("/roles")`).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `shared/schema.ts` | `pipeline_access` table, `restricted` col, types | Modify |
| `server/storage.ts` | startup migration; effectiveRoleId in perms; access storage methods | Modify |
| `server/pipeline-access-helpers.ts` (+test) | pure `resolvePipelineLevel` | Create |
| `server/routes.ts` | `effectiveRoleId` on authUser; `getPipelineLevel` resolver + guards; enforce on all pipeline routes; `/access` endpoints; list filter | Modify |
| `client/hooks/usePipelines.ts` | `usePipelineAccess` + `setAccess`; level on responses | Modify |
| `client/components/pipelines/PipelineAccessDialog.tsx` | access management UI | Create |
| `client/pages/PipelinesPage.tsx` | "Terbatas" badge | Modify |
| `client/pages/PipelineBoardPage.tsx` | derive `writable` from level; "Akses" button | Modify |

---

## Task 1: Schema — `pipeline_access` table + `restricted` column + startup migration

**Files:** Modify `shared/schema.ts`, `server/storage.ts`.

- [ ] **Step 1: schema.ts — add column + table + types** after the Phase-2 `pipelineCardValues` block. Add `restricted` to the EXISTING `pipelines` table definition (add the column line inside the existing `mysqlTable("pipelines", {...})`):
```ts
  restricted: int("restricted").notNull().default(0),
```
Then add the new table + types:
```ts
export const pipelineAccess = mysqlTable("pipeline_access", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  roleId: int("role_id").notNull(),
  level: varchar("level", { length: 8 }).notNull(), // "view" | "edit"
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byPipeline: index("idx_pipeline_access_mitra_pipeline").on(t.mitraId, t.pipelineId),
  uniqPipelineRole: uniqueIndex("uniq_pipeline_access_role").on(t.pipelineId, t.roleId),
}));

export type PipelineAccess = typeof pipelineAccess.$inferSelect;
export type PipelineAccessLevel = "view" | "edit";
```

- [ ] **Step 2: storage.ts — startup migration.** After the Phase-2 `pipeline_card_values` CREATE TABLE try/catch (search `pipelines custom fields setup failed`), add:
```ts
    // Pipelines Phase 3 — pipeline-level RBAC. Additive, idempotent.
    try {
      await this.db.execute(sql`ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS restricted INT NOT NULL DEFAULT 0`);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_access (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          role_id INT NOT NULL,
          level VARCHAR(8) NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE KEY uniq_pipeline_access_role (pipeline_id, role_id),
          KEY idx_pipeline_access_mitra_pipeline (mitra_id, pipeline_id)
        )
      `);
    } catch (e: any) {
      console.warn(`[migration] pipelines RBAC setup failed: ${e.message}`);
    }
```

- [ ] **Step 3:** `npm run typecheck` → 0 errors.
- [ ] **Step 4:** commit
```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): RBAC schema (pipeline_access + restricted) + startup migration"
```

---

## Task 2: Surface per-mitra `effectiveRoleId` onto `req.authUser`

**Files:** Modify `server/storage.ts`, `server/routes.ts`.

- [ ] **Step 1: storage.ts — add `roleId` to the resolver return.** In `_resolvePermsAtMitra` (`server/storage.ts:6782`), each of the SIX `return` objects must include `roleId`. The function already computes a local `roleId` variable. Update each returned object literal to add `roleId`:
  - the "user not found" empty (`roleId: null`),
  - the global-role result (`roleId`),
  - the legacy-admin result (`roleId: null`),
  - the no-role result (`roleId: null`),
  - the per-membership role result (`roleId`),
  - the orphan empty (`roleId: null`).
Also update BOTH return-type annotations (on `getUserEffectivePermissionsAtMitra` line 6759 and `_resolvePermsAtMitra` line 6785) from
`{ perms: ...; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }`
to
`{ perms: ...; canSeeAllData: boolean; roleName: string | null; isSystem: boolean; roleId: number | null }`.
The gating spread in `getUserEffectivePermissionsAtMitra` (`{ ...result, perms: ... }`) already passes `roleId` through.

- [ ] **Step 2: routes.ts — add the field to the type.** In the `req.authUser` interface (`server/routes.ts:26-36`), after `roleId: number | null;` add:
```ts
      effectiveRoleId: number | null;  // resolved per-mitra role id (distinct from global roleId)
```

- [ ] **Step 3: routes.ts — set it in authMiddleware.** In the `req.authUser = {...}` assembly (`routes.ts:192`), add:
```ts
        effectiveRoleId: eff.roleId,
```

- [ ] **Step 4:** `npm run typecheck` → 0 errors. (TS will flag any other caller of the perms function that destructures the return — there shouldn't be one needing change since it's an additive field.)
- [ ] **Step 5:** commit
```bash
git add server/storage.ts server/routes.ts
git commit -m "feat(pipelines): surface per-mitra effectiveRoleId on req.authUser"
```

---

## Task 3: Pure helper `resolvePipelineLevel` + tests

**Files:** Create `server/pipeline-access-helpers.ts`, `server/pipeline-access-helpers.test.ts`.

- [ ] **Step 1: failing test** (`server/pipeline-access-helpers.test.ts`):
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePipelineLevel } from "./pipeline-access-helpers.js";

test("admin always gets edit", () => {
  assert.equal(resolvePipelineLevel({ isAdmin: true, restricted: true, keyLevel: "none", grantLevel: "none" }), "edit");
});
test("unrestricted maps the pipelines key level", () => {
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: false, keyLevel: "write", grantLevel: "none" }), "edit");
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: false, keyLevel: "read", grantLevel: "none" }), "view");
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: false, keyLevel: "none", grantLevel: "none" }), "none");
});
test("restricted uses the grant, ignoring the key", () => {
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: true, keyLevel: "write", grantLevel: "view" }), "view");
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: true, keyLevel: "write", grantLevel: "edit" }), "edit");
});
test("restricted with no grant is none even if key is write", () => {
  assert.equal(resolvePipelineLevel({ isAdmin: false, restricted: true, keyLevel: "write", grantLevel: "none" }), "none");
});
```

- [ ] **Step 2:** run → FAIL (module missing). `npx tsx --test server/pipeline-access-helpers.test.ts`

- [ ] **Step 3: implement** (`server/pipeline-access-helpers.ts`):
```ts
/** Pure helper for pipeline-level RBAC — no DB. */
export type PipelineLevel = "none" | "view" | "edit";

export function resolvePipelineLevel(args: {
  isAdmin: boolean;
  restricted: boolean;
  keyLevel: "none" | "read" | "write";
  grantLevel: PipelineLevel;
}): PipelineLevel {
  const { isAdmin, restricted, keyLevel, grantLevel } = args;
  if (isAdmin) return "edit";
  if (!restricted) {
    if (keyLevel === "write") return "edit";
    if (keyLevel === "read") return "view";
    return "none";
  }
  return grantLevel === "edit" || grantLevel === "view" ? grantLevel : "none";
}
```

- [ ] **Step 4:** run → PASS. `npx tsx --test server/pipeline-access-helpers.test.ts`
- [ ] **Step 5:** commit
```bash
git add server/pipeline-access-helpers.ts server/pipeline-access-helpers.test.ts
git commit -m "feat(pipelines): resolvePipelineLevel pure helper with tests"
```

---

## Task 4: Storage — access methods

**Files:** Modify `server/storage.ts` (append to the pipelines section; extend schema imports with `pipelineAccess, type PipelineAccess`).

- [ ] **Step 1: add methods**
```ts
  async getPipelineAccess(pipelineId: number): Promise<{ restricted: boolean; grants: { roleId: number; level: string }[] }> {
    const mitraId = getMitraId();
    const [p] = await this.db.select().from(pipelines).where(and(eq(pipelines.id, pipelineId), eq(pipelines.mitraId, mitraId)));
    const rows = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId)));
    return { restricted: ((p as any)?.restricted ?? 0) === 1, grants: rows.map((r) => ({ roleId: r.roleId, level: r.level })) };
  }

  async setPipelineAccess(pipelineId: number, restricted: boolean, grants: { roleId: number; level: string }[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    await this.db.update(pipelines).set({ restricted: restricted ? 1 : 0, updatedAt: now } as any)
      .where(and(eq(pipelines.id, pipelineId), eq(pipelines.mitraId, mitraId)));
    await this.db.delete(pipelineAccess).where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId)));
    for (const g of grants) {
      if (g.level !== "view" && g.level !== "edit") continue;
      await this.db.insert(pipelineAccess).values({ mitraId, pipelineId, roleId: g.roleId, level: g.level, createdAt: now } as any);
    }
  }

  async getGrantLevelForRole(pipelineId: number, roleId: number): Promise<"none" | "view" | "edit"> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId), eq(pipelineAccess.roleId, roleId)));
    return (row?.level === "view" || row?.level === "edit") ? row.level : "none";
  }

  /** All grants for a role across the mitra: pipelineId -> level. One query (for list filtering). */
  async getGrantsForRole(roleId: number): Promise<Record<number, "view" | "edit">> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.roleId, roleId)));
    const out: Record<number, "view" | "edit"> = {};
    for (const r of rows) if (r.level === "view" || r.level === "edit") out[r.pipelineId] = r.level;
    return out;
  }
```

- [ ] **Step 2:** `npm run typecheck` → 0 errors.
- [ ] **Step 3:** commit
```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage access grants (get/set/per-role)"
```

---

## Task 5: Resolver + guards + `/access` endpoints + list filtering

**Files:** Modify `server/routes.ts`.

- [ ] **Step 1: import the helper** at top of routes.ts (check existing imports): `import { resolvePipelineLevel, type PipelineLevel } from "./pipeline-access-helpers.js";`

- [ ] **Step 2: add the resolver + guards** near the pipeline block (module scope, before the routes):
```ts
function isPipelineAdmin(req: Request): boolean {
  const au = req.authUser!;
  if (au.isSystemAdmin) return true;
  if (au.role === "admin" && !au.roleId && au.activeMitraId === 1) return true;
  return false;
}

async function getPipelineLevel(req: Request, pipelineId: number): Promise<PipelineLevel> {
  if (isPipelineAdmin(req)) return "edit";
  const p = await storage.getPipeline(pipelineId);
  if (!p) return "none";
  const restricted = (p as any).restricted === 1;
  let grantLevel: PipelineLevel = "none";
  if (restricted && req.authUser!.effectiveRoleId) {
    grantLevel = await storage.getGrantLevelForRole(pipelineId, req.authUser!.effectiveRoleId);
  }
  return resolvePipelineLevel({
    isAdmin: false, restricted,
    keyLevel: (req.authUser!.permLevels["pipelines"] ?? "none") as "none" | "read" | "write",
    grantLevel,
  });
}

/** Guard: require >= view on the pipeline. Returns false + 403 otherwise. */
async function requirePipelineView(req: Request, res: Response, pipelineId: number): Promise<boolean> {
  const lvl = await getPipelineLevel(req, pipelineId);
  if (lvl === "none") { sendError(res, "Akses ditolak untuk pipeline ini", 403); return false; }
  return true;
}
/** Guard: require edit on the pipeline. */
async function requirePipelineEdit(req: Request, res: Response, pipelineId: number): Promise<boolean> {
  const lvl = await getPipelineLevel(req, pipelineId);
  if (lvl !== "edit") { sendError(res, "Akses ditolak: hanya-baca untuk pipeline ini", 403); return false; }
  return true;
}
```

- [ ] **Step 3: list filtering.** Replace the `GET /api/pipelines` handler body so it filters by access and attaches `level`:
```ts
  router.get("/api/pipelines", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const includeArchived = req.query.archived === "1";
    const all = await storage.listPipelines(includeArchived);
    const admin = isPipelineAdmin(req);
    const grants = (!admin && req.authUser!.effectiveRoleId)
      ? await storage.getGrantsForRole(req.authUser!.effectiveRoleId) : {};
    const keyLevel = (req.authUser!.permLevels["pipelines"] ?? "none") as "none" | "read" | "write";
    const out = [] as any[];
    for (const p of all) {
      const lvl = admin ? "edit" : resolvePipelineLevel({
        isAdmin: false, restricted: (p as any).restricted === 1, keyLevel, grantLevel: grants[p.id] ?? "none",
      });
      if (lvl !== "none") out.push({ ...p, level: lvl });
    }
    sendSuccess(res, out);
  });
```

- [ ] **Step 4: `/access` endpoints** (register among the `/:id/...` routes, above `GET /:id`):
```ts
  router.get("/api/pipelines/:id/access", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    sendSuccess(res, await storage.getPipelineAccess(Number(req.params.id)));
  });
  router.put("/api/pipelines/:id/access", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    const { restricted, grants } = req.body ?? {};
    if (typeof restricted !== "boolean" || !Array.isArray(grants)) return sendError(res, "restricted (boolean) & grants (array) wajib", 400);
    await storage.setPipelineAccess(Number(req.params.id), restricted, grants.map((g: any) => ({ roleId: Number(g.roleId), level: String(g.level) })));
    sendSuccess(res, { ok: true });
  });
```

- [ ] **Step 5:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 6:** commit
```bash
git add server/routes.ts
git commit -m "feat(pipelines): access resolver, guards, /access endpoints, list filtering"
```

---

## Task 6: Enforce per-pipeline level on all read + mutation routes

**Files:** Modify `server/routes.ts` (the pipeline routes from Phase 1+2).

For EACH route below, add the guard as the line AFTER the existing `requirePermission`/`requireWritePermission` check. Pipeline id is `Number(req.params.id)` unless noted; for card/field/value routes resolve the card/field first to get its `pipelineId`. **A missed route is a security hole — every route in this list must be guarded.**

- [ ] **Step 1: pipeline + stage routes**
  - `GET /api/pipelines/:id` → add `if (!(await requirePipelineView(req, res, Number(req.params.id)))) return;` (after the existing perm check, before loading). Also attach the caller's level to the response: change its `sendSuccess(res, { ...pipeline, stages, fields })` to include `level: await getPipelineLevel(req, pipeline.id)`.
  - `PATCH /api/pipelines/:id`, `POST /api/pipelines/:id/archive` → `requirePipelineEdit(...:id)`.
  - `POST /api/pipelines/reorder` → admin/own-level: this reorders multiple pipelines; require `requireWritePermission("pipelines")` only (leave as-is — reordering the list is a per-user view concern; do NOT per-pipeline gate). (Note in code comment.)
  - `GET /api/pipelines/:id/stages` → `requirePipelineView(:id)`.
  - `POST /api/pipelines/:id/stages`, `PATCH/DELETE /api/pipelines/:id/stages/:stageId`, `POST /api/pipelines/:id/stages/reorder` → `requirePipelineEdit(:id)`.

- [ ] **Step 2: card routes**
  - `GET /api/pipelines/:id/cards` → `requirePipelineView(:id)`.
  - `POST /api/pipelines/:id/cards` → `requirePipelineEdit(:id)`.
  - `GET /api/pipelines/cards/:cardId` → resolve card first: `const card = await storage.getCard(Number(req.params.cardId)); if (!card) return sendError(res,"Kartu tidak ditemukan",404); if (!(await requirePipelineView(req,res,card.pipelineId))) return;` then proceed (reuse the loaded card; avoid double-load).
  - `PATCH /api/pipelines/cards/:cardId`, `POST .../move`, `DELETE /api/pipelines/cards/:cardId` → resolve card → `requirePipelineEdit(card.pipelineId)`.

- [ ] **Step 3: comment / follower / field / value routes**
  - `GET/POST /api/pipelines/cards/:cardId/comments`, `DELETE /api/pipelines/cards/comments/:id`, `GET/POST/DELETE followers` → resolve the card → view for GET, edit for POST/DELETE. (For `DELETE .../comments/:id`, load the comment's card via the comment row if available; if storage lacks a getComment, gate by `requireWritePermission("pipelines")` + note — but prefer: the delete-comment route is edit-level; resolve via the comment's cardId. If no getComment method exists, add a minimal `getCommentCardId(id)` to storage, OR keep the coarse write guard and document the gap.)
  - `GET /api/pipelines/:id/fields` → `requirePipelineView(:id)`. `POST/PATCH/DELETE/reorder fields` → `requirePipelineEdit(:id)`.
  - `PUT /api/pipelines/cards/:cardId/values` → resolve card → `requirePipelineEdit(card.pipelineId)` (in addition to the existing field-value validation).

- [ ] **Step 4: verify no double-load bugs** — where a route now loads the card both for the guard and for its logic, load once and reuse.

- [ ] **Step 5:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 6: manual API check on dev** (restart so the ALTER + table apply): as a non-admin role with `pipelines:read` and NO grant, `GET /api/pipelines/<restrictedId>` → 403; `GET /api/pipelines` omits it. As admin → full.
- [ ] **Step 7:** commit
```bash
git add server/routes.ts
git commit -m "feat(pipelines): enforce per-pipeline view/edit on all routes"
```

---

## Task 7: Frontend hooks — access + level

**Files:** Modify `client/hooks/usePipelines.ts`.

- [ ] **Step 1: extend types + add hooks**
```ts
export type PipelineAccessData = { restricted: boolean; grants: { roleId: number; level: "view" | "edit" }[] };
```
Add `level?: "view" | "edit"` to `PipelineWithStages` and to the list item type (the list now returns `level` per pipeline; if `usePipelines` is typed `Pipeline[]`, change to `(Pipeline & { level?: "view"|"edit" })[]`).
Add:
```ts
export function usePipelineAccess(pipelineId: number | null) {
  return useQuery({
    queryKey: [KEY, "access", pipelineId],
    queryFn: () => api.get<PipelineAccessData>(`/pipelines/${pipelineId}/access`),
    enabled: !!pipelineId,
  });
}
```
Add to `usePipelineMutations`:
```ts
    setAccess: useMutation({ mutationFn: ({ pipelineId: pid, restricted, grants }: any) => api.put(`/pipelines/${pid}/access`, { restricted, grants }), onSuccess: invalidate }),
```

- [ ] **Step 2:** `npm run typecheck` → 0 errors.
- [ ] **Step 3:** commit
```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): client hooks for access grants + level"
```

---

## Task 8: Frontend — access dialog + list badge + board controls

**Files:** Create `client/components/pipelines/PipelineAccessDialog.tsx`; modify `client/pages/PipelinesPage.tsx`, `client/pages/PipelineBoardPage.tsx`.

- [ ] **Step 1: PipelineAccessDialog.** Verify `Dialog`/`Switch`/`Combobox`/`Button` props (as in Phase 2). It loads roles via `api.get("/roles")` and current access via `usePipelineAccess`, lets the admin toggle `restricted` and set each role to none/view/edit, saves via `setAccess`.
```tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { usePipelineAccess, usePipelineMutations } from "@/hooks/usePipelines";
import { toast } from "sonner";

export function PipelineAccessDialog({ pipelineId, open, onClose }: { pipelineId: number; open: boolean; onClose: () => void }) {
  const { data: access } = usePipelineAccess(open ? pipelineId : null);
  const { data: roles } = useQuery({ queryKey: ["/api/roles"], queryFn: () => api.get<any[]>("/roles"), enabled: open });
  const m = usePipelineMutations(pipelineId);
  const [restricted, setRestricted] = useState(false);
  const [levels, setLevels] = useState<Record<number, "none" | "view" | "edit">>({});

  useEffect(() => {
    if (!access) return;
    setRestricted(access.restricted);
    const lv: Record<number, "none" | "view" | "edit"> = {};
    for (const g of access.grants) lv[g.roleId] = g.level;
    setLevels(lv);
  }, [access]);

  const save = async () => {
    const grants = Object.entries(levels).filter(([, l]) => l === "view" || l === "edit").map(([roleId, level]) => ({ roleId: Number(roleId), level }));
    try { await m.setAccess.mutateAsync({ pipelineId, restricted, grants }); toast.success("Akses disimpan"); onClose(); }
    catch (e: any) { toast.error(e?.message || "Gagal menyimpan akses"); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Akses Pipeline</DialogTitle></DialogHeader>
        <label className="flex items-center gap-2 text-sm mb-3">
          <Switch checked={restricted} onCheckedChange={setRestricted} /> Batasi akses (hanya role yang diberi izin)
        </label>
        {!restricted && <p className="text-xs text-muted-foreground mb-3">Akses terbuka: semua role dengan izin "Pipelines" bisa mengakses.</p>}
        {restricted && (
          <div className="space-y-2">
            {(roles ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 border rounded-lg p-2">
                <span className="text-sm font-medium truncate">{r.name}</span>
                <div className="w-32 shrink-0">
                  <Combobox options={[{ value: "none", label: "Tidak ada" }, { value: "view", label: "Lihat" }, { value: "edit", label: "Edit" }]}
                    value={levels[r.id] ?? "none"} onChange={(v) => setLevels((s) => ({ ...s, [r.id]: (v as any) || "none" }))} />
                </div>
              </div>
            ))}
            {!roles?.length && <p className="text-xs text-muted-foreground">Tidak ada role.</p>}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={save} loading={m.setAccess.isPending}>Simpan</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: PipelinesPage — "Terbatas" badge.** On each pipeline card, when `(p as any).restricted` is truthy, render a small badge (use existing `StatusBadge` or a `<span>` with muted styling): `Terbatas`. (The list response includes `restricted`.)

- [ ] **Step 3: PipelineBoardPage — derive writable from level + "Akses" button.**
  - `usePipeline(pid)` now returns `level` on the pipeline detail. Replace the board's `writable` derivation: `const writable = pipeline?.level === "edit";` (fall back to `false` while loading). Keep `canWrite("pipelines")` only as a coarse fallback if `level` is absent.
  - Add an "Akses" button next to "Kelola Field", shown only when `writable`: opens `PipelineAccessDialog`. Add `const [showAccess, setShowAccess] = useState(false);` and render `{showAccess && pid != null && <PipelineAccessDialog pipelineId={pid} open={showAccess} onClose={() => setShowAccess(false)} />}`.
  - Import: `import { PipelineAccessDialog } from "@/components/pipelines/PipelineAccessDialog";`

- [ ] **Step 4:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 5:** commit
```bash
git add client/components/pipelines/PipelineAccessDialog.tsx client/pages/PipelinesPage.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): access dialog + restricted badge + level-derived board controls"
```

---

## Task 9: Final verification + manual checklist + review

**Files:** none (verification only).

- [ ] **Step 1: tests** — `npx tsx --test server/pipeline-access-helpers.test.ts` (pass) + the Phase 1/2 helper tests still pass.
- [ ] **Step 2:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 3: manual e2e on dev** (`jabnet_fiber_dev`; restart so the ALTER + table apply):
  - Pipeline A, "Batasi akses" ON; grant role X=view, role Y=edit.
  - Login as X: A appears in list with read-only board (no add/edit/move, no Kelola Field/Akses), can open cards read-only; direct mutate via curl → 403.
  - Login as Y: full edit on A.
  - Login as Z (has `pipelines:read`, no grant): A absent from list; `GET /api/pipelines/<A>` → 403.
  - Admin/System-Admin: full access to A always; "Akses" button visible.
  - Pipeline B unrestricted: still follows the `pipelines` key for all roles (unchanged behaviour).
  - Cross-mitra: another mitra never sees A's grants/pipeline; guessing ids → 403/empty.
- [ ] **Step 4: whole-implementation review** (final reviewer). MUST verify: (a) EVERY pipeline read/mutation route calls a per-pipeline guard (enumerate them — no route left with only the coarse `requirePermission`); (b) `sendSuccess` everywhere; (c) startup ALTER+CREATE present; (d) `effectiveRoleId` correctly resolved per-mitra (not the global role); (e) admin/System-Admin bypass intact; (f) list filtering can't leak a restricted pipeline; (g) tenant isolation on all access queries. Then STOP — user merges to dev, pushes, restarts dev app, tests; prod only on explicit OK.

---

## Self-Review Notes (author)
- **Spec coverage:** schema+migration (T1), effectiveRoleId (T2), pure resolver (T3), storage access (T4), resolver+guards+/access+list-filter (T5), enforcement on all routes (T6), hooks (T7), dialog+badge+board (T8), verification (T9). Opt-in default = unrestricted falls through to key (T3 helper). Out-of-scope (stage/field/per-user) absent.
- **Phase 1/2 lessons:** sendSuccess on /access endpoints (T5) + list (T5); startup ALTER/CREATE (T1); review item (a)/(b)/(c) in T9.
- **Type consistency:** `resolvePipelineLevel`/`PipelineLevel` (T3) used in T5; storage `getPipelineAccess/setPipelineAccess/getGrantLevelForRole/getGrantsForRole` (T4) ↔ routes (T5/T6) ↔ hooks `usePipelineAccess/setAccess` (T7). `effectiveRoleId` defined T2, used T5. `level` attached in T5/T6, consumed T8.
- **Security focus:** T6 enumerates every route; T9 review item (a) re-verifies none was missed. The one acknowledged soft spot — `DELETE /cards/comments/:id` resolving its pipeline — is called out in T6 Step 3 with a concrete resolution (add `getCommentCardId` or document the coarse guard); implementer must pick the secure option.
- **Flagged adaptation points:** dialog component props (T8) verify-before-finalize; whether any existing caller destructures the perms-function return (T2 Step 4 — additive field, low risk).
