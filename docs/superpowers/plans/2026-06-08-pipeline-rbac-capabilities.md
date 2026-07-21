# Granular Pipeline RBAC - Role Capability Matrix (H1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic per-pipeline `edit` into a per-capability matrix granted per role, enforced on every pipeline route, with full back-compat for open pipelines and legacy view/edit grants.

**Architecture:** A pure `shared/pipelineCapabilities.ts` defines capability keys/labels + the resolver + legacy bridges. `pipeline_access` gains a `capabilities` JSON column. `routes.ts` gets `getPipelineCapabilities` + `requirePipelineCapability` and re-gates each mutation to its capability. The access dialog becomes a role × capability grid; the board gates toolbar buttons by capability. No per-user grants (that's H2).

**Tech Stack:** TypeScript, Drizzle (MySQL), React 18, TanStack Query, `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-08-pipeline-rbac-capabilities-design.md`.

**Coding standards:** pure shared module (client+server+tests agree); DRY (one resolver; one guard wraps it); semantic HTML5 grid; startup migration via info_schema guard + plain `ALTER` ([[reference-startup-add-column]]).

**Key facts (verified):** existing pure resolver `resolvePipelineLevel` (`server/pipeline-access-helpers.ts`); `getPipelineLevel`/`requirePipelineView`/`requirePipelineEdit`/`isPipelineAdmin` (`server/routes.ts:4221-4258`); storage `getPipelineAccess`/`setPipelineAccess`/`getGrantLevelForRole`/`getGrantsForRole` (`server/storage.ts:2196+`); `pipeline_access` schema (`shared/schema.ts:573`); list endpoint derives `level` per pipeline (`routes.ts:4389`); board `writable = pipeline?.level === "edit"` (`PipelineBoardPage.tsx:25`); access dialog uses a per-role view/edit Combobox.

---

## Task 1: Shared capability module + resolver (TDD)

**Files:**
- Create: `shared/pipelineCapabilities.ts`
- Test: `shared/pipelineCapabilities.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/pipelineCapabilities.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PIPELINE_CAPABILITIES, capabilitiesFromLevel, deriveLevel, parseCapabilities, resolvePipelineCapabilities,
} from "./pipelineCapabilities.js";

test("capabilitiesFromLevel bridges legacy view/edit", () => {
  assert.deepEqual(capabilitiesFromLevel("edit").sort(), [...ALL_PIPELINE_CAPABILITIES].sort());
  assert.deepEqual(capabilitiesFromLevel("view"), ["view"]);
  assert.deepEqual(capabilitiesFromLevel("none"), []);
});

test("deriveLevel: edit-class → edit, view → view, empty → none", () => {
  assert.equal(deriveLevel([...ALL_PIPELINE_CAPABILITIES]), "edit");
  assert.equal(deriveLevel(["cards"]), "edit");
  assert.equal(deriveLevel(["view"]), "view");
  assert.equal(deriveLevel([]), "none");
});

test("parseCapabilities: valid JSON array filtered to known keys; garbage → []", () => {
  assert.deepEqual(parseCapabilities(JSON.stringify(["view", "cards", "bogus"])), ["view", "cards"]);
  assert.deepEqual(parseCapabilities("not json"), []);
  assert.deepEqual(parseCapabilities(null), []);
});

test("resolvePipelineCapabilities: admin/creator → all", () => {
  const a = resolvePipelineCapabilities({ isAdmin: true, isCreator: false, restricted: true, keyLevel: "none", grantCapabilities: [] });
  assert.equal(a.size, ALL_PIPELINE_CAPABILITIES.length);
  const c = resolvePipelineCapabilities({ isAdmin: false, isCreator: true, restricted: true, keyLevel: "none", grantCapabilities: [] });
  assert.equal(c.size, ALL_PIPELINE_CAPABILITIES.length);
});

test("resolvePipelineCapabilities: open pipeline derives from global perm", () => {
  assert.equal(resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: false, keyLevel: "write", grantCapabilities: [] }).size, ALL_PIPELINE_CAPABILITIES.length);
  assert.deepEqual([...resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: false, keyLevel: "read", grantCapabilities: [] })], ["view"]);
  assert.equal(resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: false, keyLevel: "none", grantCapabilities: [] }).size, 0);
});

test("resolvePipelineCapabilities: restricted uses grant + implies view; empty → none", () => {
  const s = resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: true, keyLevel: "write", grantCapabilities: ["cards"] });
  assert.deepEqual([...s].sort(), ["cards", "view"]);
  assert.equal(resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: true, keyLevel: "write", grantCapabilities: [] }).size, 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test shared/pipelineCapabilities.test.ts`
Expected: FAIL - module missing.

- [ ] **Step 3: Implement `shared/pipelineCapabilities.ts`**

```ts
/** Pure pipeline RBAC capability model - no React, no DB. Shared by client + server + tests. */

export type PipelineCapability = "view" | "cards" | "stages" | "fields" | "automation" | "manage" | "delete";

export const ALL_PIPELINE_CAPABILITIES: PipelineCapability[] = [
  "view", "cards", "stages", "fields", "automation", "manage", "delete",
];

export const PIPELINE_CAPABILITY_LABELS: Record<PipelineCapability, string> = {
  view: "Lihat",
  cards: "Kelola Kartu",
  stages: "Kelola Stage",
  fields: "Kelola Field",
  automation: "Kelola Otomasi",
  manage: "Kelola Pipeline",
  delete: "Hapus Pipeline",
};

// Caps that imply the coarse legacy "edit" level (anything beyond read-only view).
const EDIT_CLASS: PipelineCapability[] = ["cards", "stages", "fields", "automation", "manage", "delete"];

/** Legacy bridge: a stored view/edit level → capability list. */
export function capabilitiesFromLevel(level: string): PipelineCapability[] {
  if (level === "edit") return [...ALL_PIPELINE_CAPABILITIES];
  if (level === "view") return ["view"];
  return [];
}

/** Coarse legacy level from a capability set (keeps board `writable` + legacy readers working). */
export function deriveLevel(caps: PipelineCapability[]): "none" | "view" | "edit" {
  if (caps.some((c) => EDIT_CLASS.includes(c))) return "edit";
  if (caps.includes("view")) return "view";
  return "none";
}

/** Parse a stored capabilities JSON string to a clean PipelineCapability[] (unknown keys dropped). */
export function parseCapabilities(json: string | null | undefined): PipelineCapability[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    if (!Array.isArray(a)) return [];
    return a.filter((x): x is PipelineCapability => (ALL_PIPELINE_CAPABILITIES as string[]).includes(x));
  } catch {
    return [];
  }
}

/** Resolve a user's effective capabilities on one pipeline. */
export function resolvePipelineCapabilities(args: {
  isAdmin: boolean;
  isCreator: boolean;
  restricted: boolean;
  keyLevel: "none" | "read" | "write";
  grantCapabilities: PipelineCapability[];
}): Set<PipelineCapability> {
  const { isAdmin, isCreator, restricted, keyLevel, grantCapabilities } = args;
  if (isAdmin || isCreator) return new Set(ALL_PIPELINE_CAPABILITIES);
  if (!restricted) {
    if (keyLevel === "write") return new Set(ALL_PIPELINE_CAPABILITIES);
    if (keyLevel === "read") return new Set<PipelineCapability>(["view"]);
    return new Set<PipelineCapability>();
  }
  const s = new Set<PipelineCapability>(grantCapabilities);
  if (s.size > 0) s.add("view");
  return s;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test shared/pipelineCapabilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/pipelineCapabilities.ts shared/pipelineCapabilities.test.ts
git commit -m "feat(pipelines): pure capability model + resolver (RBAC H1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Schema + storage (capabilities column + access methods)

**Files:**
- Modify: `shared/schema.ts` (`pipelineAccess` table)
- Modify: `server/storage.ts` (migration + access methods)

- [ ] **Step 1: Add the column to the schema**

In `shared/schema.ts`, in `pipelineAccess` (line ~573), add `capabilities` after `level`:

```ts
  level: varchar("level", { length: 8 }).notNull(), // "view" | "edit" (legacy/coarse)
  capabilities: text("capabilities"), // JSON array of PipelineCapability; null → derive from level
```

- [ ] **Step 2: Add the startup migration**

In `server/storage.ts`, find the `p4cColAdds` array (the pipeline column-migration list) and add an entry:

```ts
      { table: "pipeline_access", column: "capabilities", ddl: "TEXT NULL" },
```

- [ ] **Step 3: Update the access storage methods**

In `server/storage.ts`, add the import near the schema import:

```ts
import { capabilitiesFromLevel, deriveLevel, parseCapabilities, type PipelineCapability } from "../shared/pipelineCapabilities.js";
```

Replace `getPipelineAccess`, `setPipelineAccess`, and `getGrantLevelForRole` (and add a role-capabilities map for the list endpoint):

```ts
  async getPipelineAccess(pipelineId: number): Promise<{ restricted: boolean; grants: { roleId: number; capabilities: PipelineCapability[] }[] }> {
    const mitraId = getMitraId();
    const [p] = await this.db.select().from(pipelines).where(and(eq(pipelines.id, pipelineId), eq(pipelines.mitraId, mitraId)));
    const rows = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId)));
    return {
      restricted: ((p as any)?.restricted ?? 0) === 1,
      grants: rows.map((r) => ({
        roleId: r.roleId,
        capabilities: (r as any).capabilities ? parseCapabilities((r as any).capabilities) : capabilitiesFromLevel(r.level),
      })),
    };
  }

  async setPipelineAccess(pipelineId: number, restricted: boolean, grants: { roleId: number; capabilities: PipelineCapability[] }[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    await this.db.update(pipelines).set({ restricted: restricted ? 1 : 0, updatedAt: now } as any)
      .where(and(eq(pipelines.id, pipelineId), eq(pipelines.mitraId, mitraId)));
    await this.db.delete(pipelineAccess).where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId)));
    for (const g of grants) {
      const caps = parseCapabilities(JSON.stringify(g.capabilities));
      if (caps.length === 0) continue;
      await this.db.insert(pipelineAccess).values({
        mitraId, pipelineId, roleId: g.roleId,
        level: deriveLevel(caps), capabilities: JSON.stringify(caps), createdAt: now,
      } as any);
    }
  }

  /** Capabilities a role is granted on a pipeline (parsed, or derived from legacy level). */
  async getGrantCapabilitiesForRole(pipelineId: number, roleId: number): Promise<PipelineCapability[]> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId), eq(pipelineAccess.roleId, roleId)));
    if (!row) return [];
    return (row as any).capabilities ? parseCapabilities((row as any).capabilities) : capabilitiesFromLevel(row.level);
  }

  /** Map pipelineId → granted capabilities for a role (for the list endpoint). */
  async getGrantCapabilitiesMapForRole(roleId: number): Promise<Record<number, PipelineCapability[]>> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.roleId, roleId)));
    const out: Record<number, PipelineCapability[]> = {};
    for (const r of rows) out[r.pipelineId] = (r as any).capabilities ? parseCapabilities((r as any).capabilities) : capabilitiesFromLevel(r.level);
    return out;
  }
```

Keep `getGrantLevelForRole` and `getGrantsForRole` as-is (still used by `canUserAccessPipeline` / any legacy caller). Leave `canUserAccessPipeline` unchanged (view semantics unchanged).

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors. Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): pipeline_access capabilities column + capability-aware access storage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Routes - capability resolver, guard, re-gating, access API

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Imports + resolver + guard**

Add the import near the top (beside the existing `pipeline-access-helpers` import):

```ts
import { resolvePipelineCapabilities, deriveLevel, PIPELINE_CAPABILITY_LABELS, type PipelineCapability } from "../shared/pipelineCapabilities.js";
```

Just after the existing `requirePipelineEdit` definition (~line 4258), add:

```ts
async function getPipelineCapabilities(req: Request, pipelineId: number): Promise<Set<PipelineCapability>> {
  const isAdmin = isPipelineAdmin(req);
  const p = await storage.getPipeline(pipelineId);
  if (!p) return new Set();
  const isCreator = (p as any).createdBy === req.authUser!.id;
  const restricted = (p as any).restricted === 1;
  let grantCapabilities: PipelineCapability[] = [];
  if (restricted && req.authUser!.effectiveRoleId) {
    grantCapabilities = await storage.getGrantCapabilitiesForRole(pipelineId, req.authUser!.effectiveRoleId);
  }
  return resolvePipelineCapabilities({
    isAdmin, isCreator, restricted,
    keyLevel: (req.authUser!.permLevels["pipelines"] ?? "none") as "none" | "read" | "write",
    grantCapabilities,
  });
}

/** Guard: require a specific capability on the pipeline. */
async function requirePipelineCapability(req: Request, res: Response, pipelineId: number, cap: PipelineCapability): Promise<boolean> {
  const caps = await getPipelineCapabilities(req, pipelineId);
  if (!caps.has(cap)) { sendError(res, `Akses ditolak: butuh izin '${PIPELINE_CAPABILITY_LABELS[cap]}' pada pipeline ini`, 403); return false; }
  return true;
}
```

Rewrite `requirePipelineView` to use the capability set (any capability implies view):

```ts
async function requirePipelineView(req: Request, res: Response, pipelineId: number): Promise<boolean> {
  const caps = await getPipelineCapabilities(req, pipelineId);
  if (caps.size === 0) { sendError(res, "Akses ditolak untuk pipeline ini", 403); return false; }
  return true;
}
```

(Leave `getPipelineLevel` and `requirePipelineEdit` defined for now; Step 2 removes their call-sites. After Step 2, if `requirePipelineEdit` has no callers, delete it; `getPipelineLevel` may remain referenced by `requirePipelineEdit` only - delete both together. `resolvePipelineLevel` import stays only if the list endpoint still uses it - Step 3 removes that, so drop the now-unused import if the linter/types flag it.)

- [ ] **Step 2: Re-gate the mutation routes**

For each route below, replace the existing `if (!(await requirePipelineEdit(req, res, <id>))) return;` line with `if (!(await requirePipelineCapability(req, res, <id>, "<cap>"))) return;` using the SAME `<id>` expression already in that handler (e.g. `Number(req.params.id)` or `card.pipelineId`). Leave the outer `requireWritePermission(req, res, "pipelines")` line untouched. Leave all `requirePipelineView` call-sites as-is.

| Route (server/routes.ts) | New capability |
|---|---|
| PATCH `/api/pipelines/:id` (update) | `manage` |
| POST `/api/pipelines/:id/archive` | `manage` |
| DELETE `/api/pipelines/:id` (delete) | `delete` |
| POST `/api/pipelines/:id/stages` | `stages` |
| PATCH `/api/pipelines/:id/stages/:stageId` | `stages` |
| DELETE `/api/pipelines/:id/stages/:stageId` | `stages` |
| POST `/api/pipelines/:id/stages/reorder` | `stages` |
| POST `/api/pipelines/:id/cards` | `cards` |
| PATCH `/api/pipelines/cards/:cardId` | `cards` |
| POST `/api/pipelines/cards/:cardId/move` | `cards` |
| DELETE `/api/pipelines/cards/:cardId` | `cards` |
| POST `/api/pipelines/cards/:cardId/comments` | `cards` |
| DELETE `/api/pipelines/cards/comments/:id` | `cards` |
| POST `/api/pipelines/cards/:cardId/followers` | `cards` |
| DELETE `/api/pipelines/cards/:cardId/followers/:userId` | `cards` |
| PUT `/api/pipelines/cards/:cardId/values` | `cards` |
| POST `/api/pipelines/:id/fields` | `fields` |
| PATCH `/api/pipelines/:id/fields/:fieldId` | `fields` |
| DELETE `/api/pipelines/:id/fields/:fieldId` | `fields` |
| POST `/api/pipelines/:id/fields/reorder` | `fields` |
| GET `/api/pipelines/:id/rules` | `automation` |
| POST `/api/pipelines/:id/rules` | `automation` |
| PATCH `/api/pipelines/:id/rules/:ruleId` | `automation` |
| DELETE `/api/pipelines/:id/rules/:ruleId` | `automation` |
| GET `/api/pipelines/:id/access` | `manage` |
| PUT `/api/pipelines/:id/access` | `manage` |

Notes: the card-scoped routes resolve the pipeline id from the loaded card (they already call `requirePipelineEdit(req, res, card.pipelineId)` after fetching the card) - keep that same id expression. The rules GET currently uses `requirePipelineEdit`; it becomes `automation`. After this step, search `server/routes.ts` for `requirePipelineEdit(` - there should be **zero** remaining; then delete the now-unused `requirePipelineEdit` (and `getPipelineLevel` if only it referenced it).

- [ ] **Step 3: List endpoint → capabilities**

In `GET /api/pipelines` (~line 4389), switch from `getGrantsForRole` + `resolvePipelineLevel` to capabilities:

```ts
    if (!requirePermission(req, res, "pipelines")) return;
    const includeArchived = req.query.archived === "1";
    const all = await storage.listPipelines(includeArchived);
    const admin = isPipelineAdmin(req);
    const grantMap = (!admin && req.authUser!.effectiveRoleId)
      ? await storage.getGrantCapabilitiesMapForRole(req.authUser!.effectiveRoleId) : {};
    const keyLevel = (req.authUser!.permLevels["pipelines"] ?? "none") as "none" | "read" | "write";
    const out: any[] = [];
    for (const p of all) {
      const caps = resolvePipelineCapabilities({
        isAdmin: admin,
        isCreator: (p as any).createdBy === req.authUser!.id,
        restricted: (p as any).restricted === 1,
        keyLevel,
        grantCapabilities: (grantMap as any)[p.id] ?? [],
      });
      if (caps.size === 0) continue;
      out.push({ ...p, level: deriveLevel([...caps]), capabilities: [...caps] });
    }
    sendSuccess(res, out);
```

- [ ] **Step 4: Pipeline detail endpoint → level + capabilities**

`GET /api/pipelines/:id` (~line 4892) currently uses `getPipelineLevel` + `requirePipelineView`. Replace its body to resolve capabilities once and return both `level` and `capabilities` (the board reads `capabilities` for toolbar gating):

```ts
  router.get("/api/pipelines/:id", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const pipeline = await storage.getPipeline(Number(req.params.id));
    if (!pipeline) return sendError(res, "Pipeline tidak ditemukan", 404);
    const caps = await getPipelineCapabilities(req, pipeline.id);
    if (caps.size === 0) { sendError(res, "Akses ditolak untuk pipeline ini", 403); return; }
    const [stages, fields] = await Promise.all([
      storage.listStages(pipeline.id),
      storage.listFields(pipeline.id),
    ]);
    sendSuccess(res, { ...pipeline, stages, fields, level: deriveLevel([...caps]), capabilities: [...caps] });
  });
```

- [ ] **Step 5: Access GET/PUT payload shape**

The access routes already become `manage`-gated (Step 2). Update the PUT body parsing to capabilities:

```ts
  router.put("/api/pipelines/:id/access", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "manage"))) return;
    const { restricted, grants } = req.body ?? {};
    if (typeof restricted !== "boolean" || !Array.isArray(grants)) return sendError(res, "restricted (boolean) & grants (array) wajib", 400);
    await storage.setPipelineAccess(Number(req.params.id), restricted, grants.map((g: any) => ({
      roleId: Number(g.roleId),
      capabilities: Array.isArray(g.capabilities) ? g.capabilities.map(String) : [],
    })));
    sendSuccess(res, { ok: true });
  });
```

(`getPipelineAccess` already returns the capabilities shape from Task 2.)

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors. Run: `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): per-capability route gating + capability-aware list/access (RBAC H1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Client - access dialog grid + types + board gating

**Files:**
- Modify: `client/hooks/usePipelines.ts`
- Modify: `client/components/pipelines/PipelineAccessDialog.tsx`
- Modify: `client/pages/PipelineBoardPage.tsx`

- [ ] **Step 1: Update hook types**

In `client/hooks/usePipelines.ts`:
- Change `PipelineAccessData` to the capabilities shape:

```ts
export type PipelineAccessData = { restricted: boolean; grants: { roleId: number; capabilities: string[] }[] };
```

- Add `capabilities` to the list + detail types (so the board can read them):

```ts
export type PipelineWithStages = Pipeline & { stages: PipelineStage[]; fields: PipelineField[]; level?: "view" | "edit"; capabilities?: string[] };
```

and the `usePipelines` list query type:

```ts
    queryFn: () => api.get<(Pipeline & { level?: "view" | "edit"; restricted?: number; capabilities?: string[] })[]>(`/pipelines${includeArchived ? "?archived=1" : ""}`),
```

(`setAccess` mutation already forwards `{ restricted, grants }` - no change needed; grants now carry `capabilities`. The detail endpoint already returns `capabilities` from Task 3 Step 4.)

- [ ] **Step 2: Access dialog → role × capability grid**

Rewrite the role-matrix section of `client/components/pipelines/PipelineAccessDialog.tsx`:
- Replace the `levels: Record<number, AccessLevel>` state with `caps: Record<number, Set<PipelineCapability>>` (or `Record<number, PipelineCapability[]>`).
- Import the capability list/labels: `import { ALL_PIPELINE_CAPABILITIES, PIPELINE_CAPABILITY_LABELS, type PipelineCapability } from "@shared/pipelineCapabilities";`.
- Seed from `access.grants` (`{ roleId, capabilities }`).
- For each role row, render a `<fieldset>` of capability checkboxes (one per `ALL_PIPELINE_CAPABILITIES`); toggling a non-`view` capability auto-adds `view`; unchecking everything clears the role. Checking `view` alone = view-only.
- `save()` builds `grants = roles-with-≥1-cap → { roleId, capabilities: [...caps] }` and calls `m.setAccess.mutateAsync({ pipelineId, restricted, grants })`.

Keep the restricted toggle + the "Akses Terbuka" empty state unchanged. Use semantic `<label><input type="checkbox">` per capability (compact toggle-chips acceptable, but real checkboxes for a11y).

- [ ] **Step 3: Board toolbar gating by capability**

In `client/pages/PipelineBoardPage.tsx`, derive a capability set and gate the toolbar buttons (keep `writable` as the coarse fallback):

```tsx
  const caps = new Set(pipeline?.capabilities ?? []);
  const can = (c: string) => caps.has(c) || (writable && caps.size === 0); // fallback when capabilities absent
```

Then gate: "Field" button → `can("fields")`; "Akses" → `can("manage")`; "Otomasi" → `can("automation")`; settings/delete (the kebab/`PipelineSettingsDialog` trigger) → `can("manage")` (delete inside it already calls the `delete`-gated route). Leave card create/edit affordances under the existing `writable`/`cards`. The server remains the source of truth; this only hides buttons the user can't use.

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors. Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/PipelineAccessDialog.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): access dialog capability grid + capability-gated board toolbar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests**

Run: `npx tsx --test shared/pipelineCapabilities.test.ts`
Expected: PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck` → 0 errors. Run: `npm run build` → succeeds.

- [ ] **Step 3: Confirm no stale `requirePipelineEdit`**

Run: `grep -n "requirePipelineEdit" server/routes.ts`
Expected: only the (possibly deleted) definition; **no call-sites**. If the function is unused, it should have been removed in Task 3 Step 2.

- [ ] **Step 4: Manual checklist (record results)**

On dev:
- Open pipeline (not restricted): a `pipelines:write` role still does everything; `pipelines:read` is view-only.  (back-compat)
- Restrict a pipeline; in Akses, give role X only **Kelola Kartu**. As a user with role X: can add/edit cards; gets 403 on stage/field/automation/rename/delete; the Field/Otomasi/Akses/Settings buttons are hidden.
- Give role Y **Kelola Field + Kelola Stage** (not automation/delete): can manage fields + stages, 403 on automation + delete.
- A pipeline with a pre-existing `edit` grant (legacy row) still grants everything to that role (derived caps).
- Creator + System-Admin: full access regardless.

- [ ] **Step 5: Final commit (only if the manual pass required a fixup; otherwise skip)**

```bash
git add -A
git commit -m "chore(pipelines): RBAC H1 verification fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (author)

- **Spec coverage:** capability model + resolver + bridges → Task 1; storage capabilities + migration → Task 2; resolver/guard + re-gating + list + access API → Task 3; dialog grid + types + board gating → Task 4; verify → Task 5. Back-compat (open pipelines, legacy level rows, board `writable` via `deriveLevel`) handled. Per-user grants explicitly deferred to H2.
- **Type consistency:** `PipelineCapability`, `resolvePipelineCapabilities(args)`, `getGrantCapabilitiesForRole`, `getGrantCapabilitiesMapForRole`, `requirePipelineCapability(req,res,id,cap)`, access shape `{restricted, grants:[{roleId,capabilities}]}` consistent across shared/server/client.
- **Detail endpoint:** Task 4 Step 1 flags adding `capabilities` to `GET /api/pipelines/:id` (whichever task reaches it first) - needed for board gating.
- **No placeholders.**
