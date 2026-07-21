# Role Preset Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 5 hardcoded role presets into DB-managed, website-editable presets with `global`/`tenant` scope, managed from a Preset tab in `/roles`, with server-enforced tenant isolation.

**Architecture:** New `role_presets` table (mirrors `roles`), built-ins seeded as locked `scope=global` rows on startup. Scope/ownership enforced server-side in storage + a route auth helper. Client adds a `Role | Preset` toggle in `/roles`, a preset dialog, and a shared `<PermissionMatrixEditor>` reused by both dialogs; the role-create form sources presets from the API and pre-applies the default.

**Tech Stack:** Express 5 + Drizzle (MySQL) backend; React 18 + TanStack Query + shadcn frontend. Spec: `docs/superpowers/specs/2026-06-11-role-preset-management-design.md`.

**Verification convention:** pure logic (`shared/*`) is unit-tested via `npx tsx --test`; DB/route/UI code is verified via `npx tsc --noEmit` + `npm run build` + the manual pass in Task 7. Commit after each task.

---

### Task 1: Schema table + pure helpers (tested)

**Files:**
- Modify: `shared/schema.ts` (add `rolePresets` table; add `cleansePermissionMatrix`)
- Create: `shared/rolePresets.ts` (preset shape + `resolveDefaultPreset`)
- Create: `shared/rolePresets.test.ts`

- [ ] **Step 1: Write the failing test** - `shared/rolePresets.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDefaultPreset, type RolePresetLike } from "./rolePresets.js";
import { cleansePermissionMatrix, ALL_PERMISSION_KEYS } from "./schema.js";

const mk = (over: Partial<RolePresetLike>): RolePresetLike => ({
  id: 1, scope: "global", mitraId: 1, isActive: 1, isDefault: 0, permissions: {}, ...over,
});

test("resolveDefaultPreset: tenant default wins over global default", () => {
  const presets = [
    mk({ id: 1, scope: "global", isDefault: 1 }),
    mk({ id: 2, scope: "tenant", mitraId: 5, isDefault: 1 }),
  ];
  assert.equal(resolveDefaultPreset(presets, 5)?.id, 2);
});

test("resolveDefaultPreset: falls back to global default when tenant has none", () => {
  const presets = [mk({ id: 1, scope: "global", isDefault: 1 }), mk({ id: 2, scope: "tenant", mitraId: 5, isDefault: 0 })];
  assert.equal(resolveDefaultPreset(presets, 5)?.id, 1);
});

test("resolveDefaultPreset: ignores another tenant's default", () => {
  const presets = [mk({ id: 2, scope: "tenant", mitraId: 9, isDefault: 1 })];
  assert.equal(resolveDefaultPreset(presets, 5), null);
});

test("resolveDefaultPreset: null when no defaults", () => {
  assert.equal(resolveDefaultPreset([mk({ isDefault: 0 })], 5), null);
});

test("cleansePermissionMatrix: keeps valid levels, defaults unknown/invalid to none, no stray keys", () => {
  const m = cleansePermissionMatrix({ dashboard: "write", map: "read", bogus: "write", pops: "banana" } as any);
  assert.equal(m.dashboard, "write");
  assert.equal(m.map, "read");
  assert.equal(m.pops, "none");
  assert.equal((m as any).bogus, undefined);
  for (const k of ALL_PERMISSION_KEYS) assert.ok(["none", "read", "write"].includes(m[k]));
});

test("cleansePermissionMatrix: non-object → all none", () => {
  const m = cleansePermissionMatrix(undefined);
  for (const k of ALL_PERMISSION_KEYS) assert.equal(m[k], "none");
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx tsx --test shared/rolePresets.test.ts`
Expected: FAIL (modules/exports not found).

- [ ] **Step 3: Add `cleansePermissionMatrix` to `shared/schema.ts`**

Add right after `buildPermissionMatrixFromPreset` (which already exists near `PERMISSION_PRESETS`):

```ts
/**
 * Normalise an arbitrary permissions object into a full matrix: every canonical key present,
 * values constrained to "none"|"read"|"write", unknown keys dropped. Shared by role + preset
 * create/update so the cleanse logic lives in exactly one place.
 */
export function cleansePermissionMatrix(
  permissions: unknown,
): Record<string, PermissionLevel> {
  const out: Record<string, PermissionLevel> = {};
  const src = permissions && typeof permissions === "object" ? (permissions as Record<string, unknown>) : {};
  for (const key of ALL_PERMISSION_KEYS) {
    const v = src[key];
    out[key] = v === "read" || v === "write" ? v : "none";
  }
  return out;
}
```

- [ ] **Step 4: Create `shared/rolePresets.ts`**

```ts
import type { PermissionLevel } from "./schema.js";

export type PresetScope = "global" | "tenant";

/** Minimal shape needed for default resolution (server rows + client both satisfy it). */
export interface RolePresetLike {
  id: number;
  scope: PresetScope;
  mitraId: number;
  isActive: number;
  isDefault: number;
  permissions: Record<string, PermissionLevel>;
}

/**
 * Resolve which preset should pre-fill a NEW role form for a tenant.
 * Order: this tenant's active default → global active default → null.
 */
export function resolveDefaultPreset<T extends RolePresetLike>(
  presets: T[],
  mitraId: number,
): T | null {
  const tenant = presets.find(
    (p) => p.scope === "tenant" && p.mitraId === mitraId && p.isDefault === 1 && p.isActive === 1,
  );
  if (tenant) return tenant;
  const global = presets.find((p) => p.scope === "global" && p.isDefault === 1 && p.isActive === 1);
  return global ?? null;
}
```

- [ ] **Step 5: Add the `rolePresets` Drizzle table to `shared/schema.ts`**

Place near the `roles` table definition. (`mysqlTable`, `int`, `varchar`, `text` are already imported.)

```ts
export const rolePresets = mysqlTable("role_presets", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),       // owner; global presets owned by JABNET(1)
  scope: varchar("scope", { length: 8 }).notNull().default("tenant"), // "global" | "tenant"
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  icon: varchar("icon", { length: 48 }),
  color: varchar("color", { length: 16 }).notNull().default("primary"),
  permissions: text("permissions").notNull(),          // JSON Record<key, level>
  isSystem: int("is_system").notNull().default(0),     // 1 = seeded built-in (never deletable)
  isActive: int("is_active").notNull().default(1),
  isDefault: int("is_default").notNull().default(0),
  createdBy: int("created_by"),
  updatedBy: int("updated_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});
export type RolePreset = typeof rolePresets.$inferSelect;
export type InsertRolePreset = typeof rolePresets.$inferInsert;
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npx tsx --test shared/rolePresets.test.ts`
Expected: PASS (6 tests). Then `npx tsc --noEmit` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts shared/rolePresets.ts shared/rolePresets.test.ts
git commit -m "feat(role-presets): schema table + cleanse/default pure helpers (tested)"
```

---

### Task 2: Storage - table create, seed, CRUD

**Files:**
- Modify: `server/storage.ts` (IStorage interface + DatabaseStorage methods + startup wiring)

- [ ] **Step 1: Add method signatures to the `IStorage` interface**

Near the role signatures (e.g. after `seedAdminRoleForMitra`), add:

```ts
  seedRolePresetsIfNeeded(): Promise<void>;
  getApplicablePresets(mitraId: number): Promise<RolePreset[]>;
  getManageablePresets(opts: { mitraId: number; isSystemAdmin: boolean }): Promise<RolePreset[]>;
  getRolePresetById(id: number): Promise<RolePreset | undefined>;
  createRolePreset(data: InsertRolePreset): Promise<RolePreset>;
  updateRolePreset(id: number, data: Partial<InsertRolePreset>): Promise<RolePreset | undefined>;
  deleteRolePreset(id: number): Promise<boolean>;
  setDefaultRolePreset(id: number): Promise<void>;
```

Ensure `rolePresets`, `RolePreset`, `InsertRolePreset` are imported from `@shared/schema` (the file already imports `roles` etc. - add to that import). Also import `buildPermissionMatrixFromPreset`, `PERMISSION_PRESETS` if not present.

- [ ] **Step 2: Implement the methods in `DatabaseStorage`**

Add near the role methods (after `deleteRole`). Uses the established MySQL patterns (insert→reselect; `sql` raw for the CREATE TABLE; `and/eq/or` from drizzle - already imported).

```ts
  async seedRolePresetsIfNeeded(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS role_presets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitra_id INT NOT NULL DEFAULT 1,
        scope VARCHAR(8) NOT NULL DEFAULT 'tenant',
        name VARCHAR(255) NOT NULL,
        description VARCHAR(255),
        icon VARCHAR(48),
        color VARCHAR(16) NOT NULL DEFAULT 'primary',
        permissions TEXT NOT NULL,
        is_system INT NOT NULL DEFAULT 0,
        is_active INT NOT NULL DEFAULT 1,
        is_default INT NOT NULL DEFAULT 0,
        created_by INT,
        updated_by INT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        KEY idx_role_presets_scope_mitra (scope, mitra_id, is_active)
      )
    `);
    // Idempotent seed of the 5 built-ins as locked global presets.
    const meta: Record<string, { icon: string; color: string; isDefault: number }> = {
      admin:     { icon: "shield",  color: "primary", isDefault: 1 },
      operator:  { icon: "wrench",  color: "info",    isDefault: 0 },
      marketing: { icon: "megaphone", color: "violet", isDefault: 0 },
      billing:   { icon: "wallet",  color: "success", isDefault: 0 },
      viewer:    { icon: "eye",     color: "neutral", isDefault: 0 },
    };
    const now = new Date().toISOString();
    for (const key of Object.keys(PERMISSION_PRESETS)) {
      const def = PERMISSION_PRESETS[key];
      const existingRows: any = ((await this.db.execute(sql`
        SELECT id FROM role_presets WHERE scope = 'global' AND name = ${def.label} LIMIT 1
      `))[0] as any);
      if ((existingRows as any[])?.length) continue;
      const m = meta[key] ?? { icon: "shield", color: "primary", isDefault: 0 };
      await this.db.insert(rolePresets).values({
        mitraId: 1, scope: "global", name: def.label, description: null,
        icon: m.icon, color: m.color,
        permissions: JSON.stringify(buildPermissionMatrixFromPreset(key as any)),
        isSystem: 1, isActive: 1, isDefault: m.isDefault, createdBy: null, createdAt: now,
      });
    }
  }

  async getApplicablePresets(mitraId: number): Promise<RolePreset[]> {
    const rows = await this.db.select().from(rolePresets).where(
      and(
        eq(rolePresets.isActive, 1),
        or(
          eq(rolePresets.scope, "global"),
          and(eq(rolePresets.scope, "tenant"), eq(rolePresets.mitraId, mitraId)),
        ),
      ),
    );
    return this.sortPresets(rows);
  }

  async getManageablePresets(opts: { mitraId: number; isSystemAdmin: boolean }): Promise<RolePreset[]> {
    const rows = opts.isSystemAdmin
      ? await this.db.select().from(rolePresets).where(
          or(eq(rolePresets.scope, "global"), and(eq(rolePresets.scope, "tenant"), eq(rolePresets.mitraId, 1))),
        )
      : await this.db.select().from(rolePresets).where(
          and(eq(rolePresets.scope, "tenant"), eq(rolePresets.mitraId, opts.mitraId)),
        );
    return this.sortPresets(rows);
  }

  /** global first, then tenant; default first, then by name. */
  private sortPresets(rows: RolePreset[]): RolePreset[] {
    return [...rows].sort((a, b) =>
      (a.scope === b.scope ? 0 : a.scope === "global" ? -1 : 1) ||
      (b.isDefault - a.isDefault) ||
      a.name.localeCompare(b.name),
    );
  }

  async getRolePresetById(id: number): Promise<RolePreset | undefined> {
    const [row] = await this.db.select().from(rolePresets).where(eq(rolePresets.id, id));
    return row;
  }

  async createRolePreset(data: InsertRolePreset): Promise<RolePreset> {
    const now = new Date().toISOString();
    const result = await this.db.insert(rolePresets).values({ ...data, createdAt: now, updatedAt: now });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(rolePresets).where(eq(rolePresets.id, insertId));
    return row!;
  }

  async updateRolePreset(id: number, data: Partial<InsertRolePreset>): Promise<RolePreset | undefined> {
    const existing = await this.getRolePresetById(id);
    if (!existing) return undefined;
    await this.db.update(rolePresets).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(rolePresets.id, id));
    const [row] = await this.db.select().from(rolePresets).where(eq(rolePresets.id, id));
    return row;
  }

  async deleteRolePreset(id: number): Promise<boolean> {
    const result: any = await this.db.execute(sql`DELETE FROM role_presets WHERE id = ${id}`);
    return Number(result?.[0]?.affectedRows ?? 0) > 0;
  }

  /** Set is_default on one preset, clearing siblings in the same scope (+ same mitra for tenant). */
  async setDefaultRolePreset(id: number): Promise<void> {
    const target = await this.getRolePresetById(id);
    if (!target) return;
    if (target.scope === "global") {
      await this.db.execute(sql`UPDATE role_presets SET is_default = 0 WHERE scope = 'global'`);
    } else {
      await this.db.execute(sql`UPDATE role_presets SET is_default = 0 WHERE scope = 'tenant' AND mitra_id = ${target.mitraId}`);
    }
    await this.db.execute(sql`UPDATE role_presets SET is_default = 1 WHERE id = ${id}`);
  }
```

- [ ] **Step 3: Wire the seed into startup**

Find `await this.seedDefaultRolesIfNeeded();` (≈ line 6989) and add the next line:
```ts
    await this.seedRolePresetsIfNeeded();
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors. (If `or` is not imported from `drizzle-orm`, add it to the existing drizzle import in storage.ts.)

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "feat(role-presets): table create + idempotent built-in seed + CRUD storage"
```

---

### Task 3: Routes - API + scope/ownership gate

**Files:**
- Modify: `server/routes.ts` (auth helper + 5 endpoints; reuse `cleansePermissionMatrix`)

- [ ] **Step 1: Import the cleanse helper**

In the `@shared/schema` import in `server/routes.ts`, add `cleansePermissionMatrix` (and ensure `PermissionLevel`/`ALL_PERMISSION_KEYS` already imported). Refactor the existing `POST /api/roles` cleanse loop (≈ lines 1989-1997) to `const cleanPerms = cleansePermissionMatrix(permissions);` (DRY - remove the inline loop). Do the same in `PUT /api/roles/:id` if it has an equivalent loop.

- [ ] **Step 2: Add the authorization helper**

After `requireAdmin` (≈ line 1604) add:

```ts
/** Authorize a preset mutation. Returns null if allowed, else an Indonesian error string.
 *  - global preset: only System-Admin JABNET (isSystemAdmin).
 *  - tenant preset: only an admin of that same mitra.
 *  - is_system: never delete; edit only by System-Admin JABNET. */
function authorizePresetMutation(
  req: Request,
  preset: { scope: string; mitraId: number; isSystem: number },
  action: "update" | "delete",
): string | null {
  if (action === "delete" && preset.isSystem === 1) return "Preset bawaan tidak bisa dihapus";
  if (preset.scope === "global" || preset.isSystem === 1) {
    return isSystemAdmin(req) ? null : "Hanya System-Admin JABNET yang boleh mengubah preset global";
  }
  // tenant preset
  if (preset.mitraId !== (req.authUser!.activeMitraId ?? 1)) return "Preset milik mitra lain";
  return null;
}
```

- [ ] **Step 3: Add the endpoints**

Place near the `/api/roles` routes:

```ts
// GET /api/role-presets - apply set (active globals + own active tenant presets).
// ?manage=1 → manageable set (incl. inactive), gated to admins.
router.get("/api/role-presets", async (req: Request, res: Response) => {
  const manage = req.query.manage === "1";
  if (manage) {
    if (!requireAdmin(req, res)) return;
    const list = await storage.getManageablePresets({
      mitraId: req.authUser!.activeMitraId ?? 1,
      isSystemAdmin: isSystemAdmin(req),
    });
    return sendSuccess(res, list.map(parsePresetRow));
  }
  if (!requirePermission(req, res, "roles")) return;
  const list = await storage.getApplicablePresets(req.authUser!.activeMitraId ?? 1);
  sendSuccess(res, list.map(parsePresetRow));
});

router.post("/api/role-presets", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { name, description, icon, color, permissions, scope, isActive, isDefault } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length < 2) return sendError(res, "Nama preset wajib (min 2 karakter)");
  const wantGlobal = scope === "global";
  if (wantGlobal && !isSystemAdmin(req)) return sendError(res, "Hanya System-Admin JABNET yang boleh membuat preset global", 403);
  const mitraId = wantGlobal ? 1 : (req.authUser!.activeMitraId ?? 1);
  const preset = await storage.createRolePreset({
    mitraId, scope: wantGlobal ? "global" : "tenant",
    name: name.trim(), description: (description ?? "").toString().trim() || null,
    icon: icon ?? null, color: color || "primary",
    permissions: JSON.stringify(cleansePermissionMatrix(permissions)),
    isSystem: 0, isActive: isActive === 0 ? 0 : 1, isDefault: 0,
    createdBy: req.authUser!.id,
  } as any);
  if (isDefault) await storage.setDefaultRolePreset(preset.id);
  await logAudit(req, "CREATE", "role_preset", preset.id, preset.name);
  sendSuccess(res, parsePresetRow((await storage.getRolePresetById(preset.id))!), 201);
});

router.put("/api/role-presets/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const existing = await storage.getRolePresetById(Number(req.params.id));
  if (!existing) return sendError(res, "Preset tidak ditemukan", 404);
  const err = authorizePresetMutation(req, existing, "update");
  if (err) return sendError(res, err, 403);
  const { name, description, icon, color, permissions, isActive } = req.body ?? {};
  const patch: any = {};
  if (name !== undefined && existing.isSystem !== 1) patch.name = String(name).trim();  // built-in name locked
  if (description !== undefined) patch.description = String(description).trim() || null;
  if (icon !== undefined) patch.icon = icon ?? null;
  if (color !== undefined) patch.color = color || "primary";
  if (permissions !== undefined) patch.permissions = JSON.stringify(cleansePermissionMatrix(permissions));
  if (isActive !== undefined) patch.isActive = isActive ? 1 : 0;
  patch.updatedBy = req.authUser!.id;
  await storage.updateRolePreset(existing.id, patch);
  await logAudit(req, "UPDATE", "role_preset", existing.id, existing.name);
  sendSuccess(res, parsePresetRow((await storage.getRolePresetById(existing.id))!));
});

router.delete("/api/role-presets/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const existing = await storage.getRolePresetById(Number(req.params.id));
  if (!existing) return sendError(res, "Preset tidak ditemukan", 404);
  const err = authorizePresetMutation(req, existing, "delete");
  if (err) return sendError(res, err, 403);
  await storage.deleteRolePreset(existing.id);
  await logAudit(req, "DELETE", "role_preset", existing.id, existing.name);
  sendSuccess(res, { ok: true });
});

router.post("/api/role-presets/:id/default", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const existing = await storage.getRolePresetById(Number(req.params.id));
  if (!existing) return sendError(res, "Preset tidak ditemukan", 404);
  const err = authorizePresetMutation(req, existing, "update");
  if (err) return sendError(res, err, 403);
  await storage.setDefaultRolePreset(existing.id);
  sendSuccess(res, { ok: true });
});
```

Add this helper (parses the stored JSON matrix for the client) near the endpoints:
```ts
function parsePresetRow(p: any) {
  let permissions: Record<string, string> = {};
  try { permissions = JSON.parse(p.permissions || "{}"); } catch { permissions = {}; }
  return { ...p, permissions };
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(role-presets): CRUD API + scope/ownership gate; DRY role cleanse loop"
```

---

### Task 4: Client - extract `<PermissionMatrixEditor>`

**Files:**
- Create: `client/components/roles/PermissionMatrixEditor.tsx`
- Modify: `client/pages/RolesPage.tsx` (RoleFormDialog uses the new component; export `PermissionRow`/`LEVEL_CFG` if needed)

- [ ] **Step 1: Create the component**

Extract the matrix UI currently inline in `RoleFormDialog` (RolesPage.tsx lines ~509-562: the "Bulk actions" bar + the per-group matrix with `PermissionRow`). Move `PermissionRow` and `LEVEL_CFG` into this file (or export them from RolesPage and import - prefer moving `PermissionRow` here and importing it back into RolesPage if RolesPage still needs it for the read-only preview at line ~357).

```tsx
import { ALL_PERMISSIONS, ALL_PERMISSION_KEYS, type PermissionLevel } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Ban, Eye, Pencil } from "lucide-react";
// ...PermissionRow + LEVEL_CFG moved here (verbatim from RolesPage)...

interface Props {
  value: Record<string, PermissionLevel>;
  onChange: (next: Record<string, PermissionLevel>) => void;
  disabled?: boolean;
  showBulk?: boolean; // the All None/Read/Full bar - default true
}

export function PermissionMatrixEditor({ value, onChange, disabled, showBulk = true }: Props) {
  const groups = Array.from(new Set(ALL_PERMISSIONS.map((p) => p.group)));
  const setLevel = (key: string, level: PermissionLevel) => onChange({ ...value, [key]: level });
  const setAllInGroup = (group: string, level: PermissionLevel) => {
    const next = { ...value };
    for (const k of ALL_PERMISSIONS.filter((p) => p.group === group).map((p) => p.key)) next[k] = level;
    onChange(next);
  };
  const setAll = (level: PermissionLevel) => {
    const next: Record<string, PermissionLevel> = {};
    for (const k of ALL_PERMISSION_KEYS) next[k] = level;
    onChange(next);
  };
  return (
    <div className="space-y-4">
      {showBulk && (
        <div className="flex items-center justify-end gap-1.5 p-2 rounded-lg bg-muted/40 border">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAll("none")} disabled={disabled}><Ban className="h-3 w-3 mr-1" /> All None</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAll("read")} disabled={disabled}><Eye className="h-3 w-3 mr-1" /> All Read</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAll("write")} disabled={disabled}><Pencil className="h-3 w-3 mr-1" /> All Full</Button>
        </div>
      )}
      {groups.map((group) => {
        const items = ALL_PERMISSIONS.filter((p) => p.group === group);
        return (
          <fieldset key={group} className="border-0 p-0 m-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <legend className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{group}</legend>
              <div className="flex gap-1">
                <button type="button" onClick={() => setAllInGroup(group, "none")} className="text-[10px] px-2 py-0.5 rounded hover:bg-muted text-muted-foreground" disabled={disabled}>None</button>
                <button type="button" onClick={() => setAllInGroup(group, "read")} className="text-[10px] px-2 py-0.5 rounded hover:bg-sky-100 dark:hover:bg-sky-950/40 text-sky-600" disabled={disabled}>Read</button>
                <button type="button" onClick={() => setAllInGroup(group, "write")} className="text-[10px] px-2 py-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950/40 text-emerald-600" disabled={disabled}>Full</button>
              </div>
            </div>
            <div className="space-y-1 rounded-lg border overflow-hidden">
              {items.map((p) => (
                <PermissionRow key={p.key} label={p.label} keyName={p.key}
                  level={(value[p.key] ?? "none") as PermissionLevel}
                  onChange={(lvl) => setLevel(p.key, lvl)} disabled={disabled} />
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Refactor `RoleFormDialog` to use it**

In `RolesPage.tsx`, replace the inline bulk-bar + per-group matrix (lines ~509-562) with:
```tsx
          <PermissionMatrixEditor
            value={permissions}
            onChange={setPermissions}
            disabled={isSystem && (initial?.name === "System-Admin" || initial?.name === "Admin")}
          />
```
Keep the quick-presets block + the "stats" summary line as-is. Remove the now-dead local `setAllInGroup`/`setAllPermissions` if no longer referenced (keep `setLevel`/`setPermissions`). Import `PermissionMatrixEditor` (and `PermissionRow` if still used at line ~357 for the read-only preview - import it from the new file).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. The role dialog matrix looks/behaves identically.

- [ ] **Step 4: Commit**

```bash
git add client/components/roles/PermissionMatrixEditor.tsx client/pages/RolesPage.tsx
git commit -m "refactor(roles): extract reusable PermissionMatrixEditor"
```

---

### Task 5: Client - preset hooks, dialog, and Preset tab

**Files:**
- Create: `client/hooks/useRolePresets.ts`
- Create: `client/components/roles/RolePresetDialog.tsx`
- Modify: `client/pages/RolesPage.tsx` (segmented Role|Preset toggle + preset list)

- [ ] **Step 1: Create `client/hooks/useRolePresets.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PermissionLevel } from "@shared/schema";

export interface RolePresetDTO {
  id: number; mitraId: number; scope: "global" | "tenant";
  name: string; description: string | null; icon: string | null; color: string;
  permissions: Record<string, PermissionLevel>;
  isSystem: number; isActive: number; isDefault: number;
}

export function useApplicablePresets() {
  return useQuery<RolePresetDTO[]>({ queryKey: ["/api/role-presets"], queryFn: () => api.get("/role-presets") });
}
export function useManageablePresets(enabled: boolean) {
  return useQuery<RolePresetDTO[]>({ queryKey: ["/api/role-presets", "manage"], queryFn: () => api.get("/role-presets?manage=1"), enabled });
}
export function useRolePresetMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["/api/role-presets"] });
  return {
    create: useMutation({ mutationFn: (d: any) => api.post("/role-presets", d), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...d }: any) => api.put(`/role-presets/${id}`, d), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: number) => api.delete(`/role-presets/${id}`), onSuccess: inv }),
    setDefault: useMutation({ mutationFn: (id: number) => api.post(`/role-presets/${id}/default`, {}), onSuccess: inv }),
  };
}
```

- [ ] **Step 2: Create `client/components/roles/RolePresetDialog.tsx`**

A `<form>`-based dialog (follow the project dialog convention: `max-w-3xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-hidden flex flex-col p-0`). Fields:
- Name (`<Input>`, disabled when editing an `isSystem` preset), Description (`<Textarea>`).
- Icon + color picker: reuse the pattern from `client/components/pipelines/MetricsConfigDialog.tsx` (color chips via `METRIC_COLORS`/`COLOR_BG`; for icon, a small set - reuse `metricIcons` map or a short lucide list).
- Scope select: options `tenant` always; `global` ONLY when `auth.user.isSystemAdmin && auth.user.activeMitraId === 1` (else hide/lock to tenant). Disabled when editing (scope immutable).
- Active toggle (`<input type="checkbox">` + label). Default toggle (checkbox; on save, if checked call `setDefault` mutation after create/update).
- `<PermissionMatrixEditor value={permissions} onChange={setPermissions} disabled={isSystem && !auth.user.isSystemAdmin} />`.
- Submit builds `{ name, description, icon, color, scope, isActive, isDefault, permissions }` and calls create or update. Surface server errors via `toast.error(e.message)`.

Props: `{ open, onClose, initial?: RolePresetDTO | null, onSaved: () => void }`. Initialize state from `initial` on open (like `RoleFormDialog`'s useEffect), else blank (all-none matrix via the same `ALL_PERMISSION_KEYS` loop) with scope defaulting to `tenant`.

- [ ] **Step 3: Add the Preset tab to `RolesPage.tsx`**

- Add `const { user } = useAuth();` if not present and `const canManage = !!user?.isSystemAdmin || user?.roleName === "Admin" || user?.role === "admin";` (mirror requireAdmin).
- Add a segmented control near the page header (semantic `role="tablist"` with two `<button>`s): `Role` | `Preset`. The `Preset` tab button renders only when `canManage`. Track `const [view, setView] = useState<"roles"|"presets">("roles")`.
- When `view === "presets"`: render a grid of preset cards from `useManageablePresets(view === "presets")`. Each card: icon (color tinted), name, description, scope badge (`Global`/`Tenant`), `is_system` lock badge, an Active toggle (calls `update({id, isActive})`), a default star (calls `setDefault(id)`), Edit button (opens `RolePresetDialog`), Delete button (hidden when `isSystem`, confirm then `remove(id)`). A "Buat Preset" button opens the dialog with `initial=null`.
- Reuse `Card`, `Badge`, `Button`, `StatusBadge`/`EmptyState` per the design system. Mobile: cards stack; grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/useRolePresets.ts client/components/roles/RolePresetDialog.tsx client/pages/RolesPage.tsx
git commit -m "feat(role-presets): manage tab + preset dialog + hooks in /roles"
```

---

### Task 6: Client - role-create form sources presets from the API

**Files:**
- Modify: `client/pages/RolesPage.tsx` (RoleFormDialog quick-presets block + default pre-apply)

- [ ] **Step 1: Replace the hardcoded quick-preset buttons**

In `RoleFormDialog`, replace the `{Object.keys(PERMISSION_PRESETS).map(...)}` buttons (lines ~500-504) with buttons sourced from `useApplicablePresets()`:
```tsx
  const { data: applicablePresets = [] } = useApplicablePresets();
  // ...inside the Quick Presets block:
  {applicablePresets.map((p) => (
    <Button key={p.id} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPermissions({ ...p.permissions })}>
      {p.name}
    </Button>
  ))}
```
Applying = load the preset's stored matrix directly (no `buildPermissionMatrixFromPreset` in the form anymore). Remove the now-unused `PERMISSION_PRESETS`/`buildPermissionMatrixFromPreset` imports from RolesPage if nothing else uses them.

- [ ] **Step 2: Pre-apply the default preset on a NEW role form**

Import `resolveDefaultPreset` from `@shared/rolePresets` and use it in the `useEffect` that initialises a NEW role (the `else` branch at RolesPage.tsx ~405-411). After building the empty matrix, if a default resolves, apply it:
```tsx
        const def = resolveDefaultPreset(
          applicablePresets.map((p) => ({ id: p.id, scope: p.scope, mitraId: p.mitraId, isActive: p.isActive, isDefault: p.isDefault, permissions: p.permissions })),
          user?.activeMitraId ?? 1,
        );
        setPermissions(def ? { ...def.permissions } : empty);
```
Add `applicablePresets` to the effect deps (so it applies once presets load). Guard: only when `!initial` (new role).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/pages/RolesPage.tsx
git commit -m "feat(role-presets): role form uses DB presets + pre-applies default"
```

---

### Task 7: Manual acceptance + final verification

**Files:** none.

- [ ] **Step 1: Authoritative gate** - `npx tsc --noEmit && npm run build && npx tsx --test shared/rolePresets.test.ts shared/permissionPresets.test.ts` → 0 errors, build ok, all tests pass.

- [ ] **Step 2: Manual on dev** (spec §9). Requires a Node restart after deploy (new table created on startup).
  1. **Startup seed:** restart → `/roles` Preset tab (as System-Admin JABNET) shows the 5 built-ins as Global, `admin` marked default, all locked (no delete).
  2. **System-Admin JABNET:** create a global preset; edit it; toggle Active off → it disappears from a tenant's apply list; set a different default.
  3. **Tenant admin (Diar):** Preset tab shows ONLY Diar tenant presets (no global management); create a tenant preset → it appears in Diar's role-create picker alongside active globals.
  4. **Isolation:** as Diar admin, `PUT /api/role-presets/:id` on a global or another tenant's preset → 403; forging `scope:"global"` on create → 403.
  5. **Role form:** opening "Buat Role Baru" pre-applies the resolved default matrix; clicking any preset fills the matrix; save → reload → permissions correct.

- [ ] **Step 3: Commit any notes** (optional): `git commit --allow-empty -m "chore(role-presets): verified on dev"`.

---

## Self-Review notes (author)

- **Spec coverage:** §1 table → T1+T2; §2 visibility/access → T2 (storage filters) + T3 (gate); §3 default resolution → T1 (`resolveDefaultPreset`) + T2 (`setDefaultRolePreset`) + T6 (pre-apply); §4 API → T3; §5 storage → T2; §6 client (matrix editor/tab/dialog/role-form) → T4/T5/T6; §7 semantic/responsive → T4 (`fieldset`/`legend`) + T5 (form/tablist); §8 isolation → T2+T3; §9 testing → T1 + T7.
- **DRY wins:** `cleansePermissionMatrix` shared by role + preset create/update (removes the duplicated inline loop); `<PermissionMatrixEditor>` shared by role + preset dialogs; one `resolveDefaultPreset`.
- **Type consistency:** `RolePreset`/`InsertRolePreset` (T1) used in storage (T2); `RolePresetDTO` (T5 client) mirrors `parsePresetRow` output (T3, permissions parsed to object); `resolveDefaultPreset`/`RolePresetLike` (T1) consumed in T6. `authorizePresetMutation(req, preset, action)` defined once (T3).
- **No schema migration churn:** new table via `CREATE TABLE IF NOT EXISTS` on startup (seedRolePresetsIfNeeded); **needs a Node restart after deploy** (flagged in T7). No ALTER.
- **YAGNI:** no versioning/history/bulk-reapply/import-export (spec §10).
