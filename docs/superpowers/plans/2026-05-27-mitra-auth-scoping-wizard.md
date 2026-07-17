# Mitra Authorization Scoping + Create-Mitra Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor permission model jadi per-membership role (`user_mitras.role_id`) + rename role `Administrator` → `System-Admin` (cross-tenant, mitra=1 only) + add `Admin` role (intra-mitra) + add create-mitra wizard step 2 yang wajib provision Admin user via transaction.

**Architecture:** Schema additive (`user_mitras.role_id` nullable). Permission resolver mengganti `getUserEffectivePermissions(userId)` → `getUserEffectivePermissionsAtMitra(userId, mitraId)` dengan cache split per-(user, mitra). authMiddleware menghitung `isSystemAdmin` via lookup role di mitra=1 (bukan role global). Migration backfill SQL preserve 4 known platform owners (yoga, admin, Mikhail Yazid Bustomi, Bah Yus) sebagai System-Admin di mitra=1; user lain dengan global "Administrator" di-downgrade ke "Admin" + per-membership di mitra non-1 juga.

**Tech Stack:** TypeScript + Node 20 + Express 5 + Drizzle ORM (MySQL dialect) + mysql2 + bcryptjs (existing) + React 18 + Vite + TanStack Query + shadcn/ui (existing patterns).

**Spec:** `docs/superpowers/specs/2026-05-27-mitra-auth-scoping-wizard-design.md`

**Test approach:** Project tidak punya jest/vitest scaffolding. Setiap task verify via `npm run build` + `npx tsc --noEmit` + manual smoke test endpoint. Final task = comprehensive manual verification matrix.

**Commit pattern:** Per-task atomic commit. Pesan format `feat(auth):` atau `refactor(auth):` atau `feat(mitra-wizard):` sesuai layer.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `shared/schema.ts` | Modify | Tambah `userMitras.roleId int("role_id")` nullable column |
| `server/storage.ts` | Modify | ALTER block + backfill SQL + `seedDefaultRolesIfNeeded` extension + `getUserEffectivePermissionsAtMitra` + cache split + `updateMitraMemberRole` |
| `server/routes.ts` | Modify | authMiddleware refactor + all `"Administrator"` string sweep + `PATCH /api/mitras/:mitraId/members/:userId` + `POST /api/mitras` extension untuk admin user creation transactional |
| `server/index.ts` | Modify | `"Administrator"` string sweep di SLA notification block |
| `client/pages/MitraPage.tsx` | Modify | MembersTab role selector per row + 2-step wizard create dialog |
| `client/pages/RolesPage.tsx` | Modify | `"Administrator"` sweep + System-Admin badge styling (red/danger variant) |
| `client/pages/ProfilePage.tsx` | Modify | Role label map: tambah `system-admin` + rename label |
| `client/pages/TicketCategoriesPage.tsx` | Modify | `"Administrator"` sweep (admin check) |
| `client/pages/UsersPage.tsx` | Modify | Display "Role di mitra primary" — sweep "Administrator" string |

---

## Task 1: Schema column + ALTER block + migration backfill SQL

**Files:**
- Modify: `shared/schema.ts:1002-1008` (add roleId to userMitras)
- Modify: `server/storage.ts:5248` (startup migration section) — tambah ALTER + backfill SQL

- [ ] **Step 1: Add `roleId` column ke `userMitras` schema**

Edit `shared/schema.ts` line 1002-1008:

```ts
// Phase B multi-tenant: user ↔ mitra membership (many-to-many).
// Staff bisa multi-tenant (mis. teknisi shared antar mitra). isPrimary=1 = default mitra at login.
export const userMitras = mysqlTable("user_mitras", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  mitraId: int("mitra_id").notNull(),
  isPrimary: int("is_primary").default(0),
  roleId: int("role_id"),     // per-membership role (nullable; fallback ke users.role_id global)
  createdAt: text("created_at").notNull(),
});
```

- [ ] **Step 2: Add ALTER block + backfill SQL ke startup migration**

Cari section ALTER TABLE existing di `server/storage.ts` (sekitar method `runStartupMigrations` atau di constructor/`init`). Grep dulu untuk lokasi yang tepat:

```bash
grep -n "ALTER TABLE\|runStartupMigrations\|seedDefaultRoles" server/storage.ts | head -20
```

Tambah block baru SEBELUM `seedDefaultRolesIfNeeded()` call (line ~5248). Cari method `init()` atau startup orchestrator dan tambah:

```ts
// Phase B+C — auth scoping migration (2026-05-27)
// Idempotent: re-run safe via IF NOT EXISTS dan WHERE guards.
try {
  await this.pool.execute(`ALTER TABLE user_mitras ADD COLUMN IF NOT EXISTS role_id INT NULL`);
} catch (e) {
  console.warn("[migration] ALTER user_mitras role_id:", (e as Error).message);
}
```

- [ ] **Step 3: Verify build + typecheck pass**

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors. Build success.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "$(cat <<'EOF'
feat(schema): add user_mitras.role_id column untuk per-membership role

Phase B persiapan — nullable column untuk override global users.role_id
saat resolve permission di context mitra tertentu. ALTER block idempotent
via IF NOT EXISTS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Seed "Admin" role + rename "Administrator" → "System-Admin"

**Files:**
- Modify: `server/storage.ts` `seedDefaultRolesIfNeeded()` (line ~5324) — extend untuk seed Admin role baru
- Modify: `server/storage.ts` `upgradePermissionsV412()` (line ~5403) — rename Administrator → System-Admin di logic
- Modify: `server/storage.ts` `updateRole()` guard (line ~5490) — replace string compare

- [ ] **Step 1: Extend `seedDefaultRolesIfNeeded()` untuk rename + seed Admin role**

Lokasi: `server/storage.ts:5324` (cari `async seedDefaultRolesIfNeeded`). Insert di awal method, sebelum loop seed existing roles:

```ts
async seedDefaultRolesIfNeeded(): Promise<void> {
  // === Phase B+C migration (2026-05-27) ===
  // 1. Rename Administrator → System-Admin (idempotent — if not exists yet, no-op)
  try {
    await this.db.execute(sql`UPDATE roles SET name = 'System-Admin' WHERE name = 'Administrator'`);
  } catch (e) {
    console.warn("[seed-roles] rename Administrator→System-Admin:", (e as Error).message);
  }

  // 2. Seed Admin role (clone permissions dari System-Admin, isSystem=1, canSeeAllData=0)
  try {
    const systemAdmin = await this.getRoleByName("System-Admin");
    if (systemAdmin) {
      const existingAdmin = await this.getRoleByName("Admin");
      if (!existingAdmin) {
        await this.db.execute(sql`
          INSERT INTO roles (name, description, permissions, is_system, can_see_all_data, created_at, updated_at)
          VALUES ('Admin', 'Akses penuh di satu mitra (intra-tenant)', ${systemAdmin.permissions}, 1, 0, NOW(), NOW())
        `);
      }
    }
  } catch (e) {
    console.warn("[seed-roles] seed Admin role:", (e as Error).message);
  }

  // 3. Backfill user_mitras.role_id dari users.role_id (per-membership default)
  try {
    await this.db.execute(sql`
      UPDATE user_mitras SET role_id = (SELECT role_id FROM users WHERE users.id = user_mitras.user_id)
      WHERE role_id IS NULL
    `);
  } catch (e) {
    console.warn("[seed-roles] backfill user_mitras.role_id:", (e as Error).message);
  }

  // 4. Preserve 4 known platform owners as System-Admin at mitra=1
  try {
    const [sysAdminRow]: any = await this.db.execute(sql`SELECT id FROM roles WHERE name = 'System-Admin' LIMIT 1`);
    const sysAdminId = sysAdminRow?.[0]?.id;
    if (sysAdminId) {
      // a. Ensure users.role_id = System-Admin untuk 4 known users (yoga, admin, Mikhail, Bah Yus)
      await this.db.execute(sql`
        UPDATE users SET role_id = ${sysAdminId}
        WHERE username IN ('yoga', 'admin')
           OR name LIKE '%Mikhail Yazid Bustomi%'
           OR name LIKE '%Bah Yus%'
      `);
      // b. Ensure mereka member di mitra=1
      await this.db.execute(sql`
        INSERT IGNORE INTO user_mitras (user_id, mitra_id, is_primary, role_id, created_at)
        SELECT u.id, 1, 1, ${sysAdminId}, NOW()
        FROM users u
        WHERE (u.username IN ('yoga', 'admin')
               OR u.name LIKE '%Mikhail Yazid Bustomi%'
               OR u.name LIKE '%Bah Yus%')
          AND NOT EXISTS (SELECT 1 FROM user_mitras um WHERE um.user_id = u.id AND um.mitra_id = 1)
      `);
      // c. Existing memberships di mitra=1 → upgrade role_id ke System-Admin
      await this.db.execute(sql`
        UPDATE user_mitras SET role_id = ${sysAdminId}
        WHERE mitra_id = 1
          AND user_id IN (
            SELECT id FROM users
            WHERE username IN ('yoga', 'admin')
               OR name LIKE '%Mikhail Yazid Bustomi%'
               OR name LIKE '%Bah Yus%'
          )
      `);
    }
  } catch (e) {
    console.warn("[seed-roles] preserve platform owners:", (e as Error).message);
  }

  // 5. Downgrade System-Admin → Admin di membership non-mitra-1
  try {
    const [adminRow]: any = await this.db.execute(sql`SELECT id FROM roles WHERE name = 'Admin' LIMIT 1`);
    const [sysAdminRow]: any = await this.db.execute(sql`SELECT id FROM roles WHERE name = 'System-Admin' LIMIT 1`);
    const adminId = adminRow?.[0]?.id;
    const sysAdminId = sysAdminRow?.[0]?.id;
    if (adminId && sysAdminId) {
      await this.db.execute(sql`
        UPDATE user_mitras SET role_id = ${adminId}
        WHERE role_id = ${sysAdminId} AND mitra_id != 1
      `);
      // 6. Downgrade users.role_id global untuk user yang bukan platform owner
      await this.db.execute(sql`
        UPDATE users SET role_id = ${adminId}
        WHERE role_id = ${sysAdminId}
          AND username NOT IN ('yoga', 'admin')
          AND name NOT LIKE '%Mikhail Yazid Bustomi%'
          AND name NOT LIKE '%Bah Yus%'
      `);
    }
  } catch (e) {
    console.warn("[seed-roles] downgrade non-platform users:", (e as Error).message);
  }

  // 7. Post-migration verification log
  try {
    const [verify]: any = await this.db.execute(sql`
      SELECT u.username, u.name FROM users u
      JOIN user_mitras um ON um.user_id = u.id AND um.mitra_id = 1
      JOIN roles r ON r.id = um.role_id
      WHERE r.name = 'System-Admin'
    `);
    const rows = (verify as any[]) ?? [];
    console.log(`[seed-roles] Platform owners (System-Admin di mitra=1): ${rows.length}`);
    for (const u of rows) console.log(`  - ${u.username} (${u.name})`);
  } catch (e) {
    console.warn("[seed-roles] verification log:", (e as Error).message);
  }

  // === Existing seed logic (rename Administrator references inside) ===
  // ... (rest of existing method)
```

**PENTING:** Existing body method `seedDefaultRolesIfNeeded` masih ada di bawah block migration ini. Pastikan rename string `"Administrator"` → `"System-Admin"` di:
- Line ~5329: `name: "Administrator",` → `name: "System-Admin",`
- Line ~5274, 5289: `getRoleByName("Administrator")` → `getRoleByName("System-Admin")`

- [ ] **Step 2: Update `upgradePermissionsV412()` rename references**

Lokasi: `server/storage.ts:5403`. Cari semua `r.name === "Administrator"` dan replace:

```ts
// Before
r.name === "Administrator" ? "write" :

// After
r.name === "System-Admin" || r.name === "Admin" ? "write" :
```

```ts
// Before
if (r.name === "Administrator") {

// After
if (r.name === "System-Admin" || r.name === "Admin") {
```

- [ ] **Step 3: Update `updateRole()` guard di line ~5490**

```ts
// Before
if (data.canSeeAllData !== undefined && existing.name !== "Administrator") allowed.canSeeAllData = data.canSeeAllData;

// After
if (data.canSeeAllData !== undefined && existing.name !== "System-Admin") allowed.canSeeAllData = data.canSeeAllData;
```

(Admin role doesn't have canSeeAllData=1, so guard hanya untuk System-Admin yang protected.)

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(auth): rename Administrator → System-Admin, seed new Admin role

Backfill migration (idempotent, jalan di seedDefaultRolesIfNeeded):
- Rename roles.name Administrator → System-Admin
- Insert Admin role (clone permissions System-Admin, isSystem=1, canSeeAllData=0)
- Backfill user_mitras.role_id dari users.role_id
- Preserve yoga, admin, Mikhail Yazid Bustomi, Bah Yus as System-Admin@mitra=1
- Downgrade other users: System-Admin → Admin (global + per-membership di non-mitra-1)
- Post-migration verification log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement `getUserEffectivePermissionsAtMitra` + cache split

**Files:**
- Modify: `server/storage.ts:268` interface (add new method signature)
- Modify: `server/storage.ts:5521-5557` (refactor `getUserEffectivePermissions` + add new method)

- [ ] **Step 1: Add new method signature ke `IStorage` interface**

Cari interface declaration di `server/storage.ts:268`:

```ts
// Before
getUserEffectivePermissions(userId: number): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }>;

// After (keep existing for backward compat + add new method)
getUserEffectivePermissions(userId: number): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }>;
getUserEffectivePermissionsAtMitra(userId: number, mitraId: number): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }>;
```

- [ ] **Step 2: Locate cache helpers + add per-mitra variant**

Grep:
```bash
grep -n "getCachedPerms\|setCachedPerms\|permCache" server/storage.ts | head -10
```

Existing cache likely a Map<number, ...> keyed by userId. Add per-mitra variant. Pattern (sesuaikan dengan existing helper names):

```ts
// Add near existing perm cache helpers (top of file or near getUserEffectivePermissions)
const permCacheAtMitra = new Map<string, { value: any; expiresAt: number }>();
const PERM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedPermsAtMitra(key: string): any | null {
  const entry = permCacheAtMitra.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    permCacheAtMitra.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedPermsAtMitra(key: string, value: any): void {
  permCacheAtMitra.set(key, { value, expiresAt: Date.now() + PERM_CACHE_TTL_MS });
}

export function invalidatePermCacheAtMitra(userId?: number, mitraId?: number): void {
  if (userId == null) {
    permCacheAtMitra.clear();
    return;
  }
  if (mitraId == null) {
    // Invalidate all keys starting with userId:
    const prefix = `${userId}:`;
    for (const k of permCacheAtMitra.keys()) if (k.startsWith(prefix)) permCacheAtMitra.delete(k);
    return;
  }
  permCacheAtMitra.delete(`${userId}:${mitraId}`);
}
```

- [ ] **Step 3: Implement `getUserEffectivePermissionsAtMitra` method**

Insert SETELAH existing `getUserEffectivePermissions` di `server/storage.ts:5557`:

```ts
async getUserEffectivePermissionsAtMitra(
  userId: number,
  mitraId: number
): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }> {
  const cacheKey = `${userId}:${mitraId}`;
  const cached = getCachedPermsAtMitra(cacheKey);
  if (cached) return cached;

  // 1. Try per-membership role_id at this mitra
  let roleId: number | null = null;
  try {
    const [rows]: any = await this.db.execute(sql`
      SELECT role_id FROM user_mitras WHERE user_id = ${userId} AND mitra_id = ${mitraId} LIMIT 1
    `);
    roleId = (rows as any[])[0]?.role_id ?? null;
  } catch {}

  // 2. Fallback ke users.role_id (global default) kalau membership tidak ada / role_id NULL
  if (!roleId) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    roleId = u?.roleId ?? null;
  }

  let result: { perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean };

  if (roleId) {
    const role = await this.getRoleById(roleId);
    if (role) {
      let parsed: Record<string, PermissionLevel> = {};
      try { parsed = JSON.parse(role.permissions); } catch { parsed = {}; }
      result = {
        perms: parsed,
        canSeeAllData: role.canSeeAllData === 1,
        roleName: role.name,
        isSystem: role.isSystem === 1,
      };
      setCachedPermsAtMitra(cacheKey, result);
      return result;
    }
  }

  // 3. Legacy fallback: users.role text = "admin"
  const [u2] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (u2?.role === "admin") {
    const obj: Record<string, PermissionLevel> = {};
    for (const k of ALL_PERMISSION_KEYS) obj[k] = "write";
    result = { perms: obj, canSeeAllData: true, roleName: "admin (legacy)", isSystem: true };
    setCachedPermsAtMitra(cacheKey, result);
    return result;
  }

  result = { perms: {}, canSeeAllData: false, roleName: u2?.role ?? null, isSystem: false };
  setCachedPermsAtMitra(cacheKey, result);
  return result;
}
```

- [ ] **Step 4: Hook cache invalidation ke role/membership mutation methods**

Cari method `updateRole()`, `updateUserRole()` (atau setUserRole), dan member-related methods (`addUserMitra`, `removeUserMitra`, dst):

```bash
grep -n "async updateRole\|async setUserRole\|async addUserMitra\|async removeUserMitra\|async updateUser\b" server/storage.ts
```

Tambah `invalidatePermCacheAtMitra()` call setelah mutation sukses. Contoh:
```ts
async updateRole(id, data) {
  // ... existing logic
  invalidatePermCacheAtMitra(); // bust all (role's perms can affect any user)
  return result;
}

async addUserMitra(userId, mitraId, isPrimary, roleId) {
  // ... existing logic
  invalidatePermCacheAtMitra(userId);
  return result;
}
```

Untuk existing per-user cache (kalau ada `invalidatePermCache(userId)`), tetap panggil — keep both caches consistent.

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors. Build success.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(auth): add getUserEffectivePermissionsAtMitra + per-mitra cache

Resolves permission dari user_mitras.role_id (per-membership) dengan
fallback ke users.role_id global, lalu fallback ke users.role text
legacy. Cache key per-(userId, mitraId), 5-min TTL. Cache invalidation
hook ke role/membership mutations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: authMiddleware refactor + sweep all `"Administrator"` string references

**Files:**
- Modify: `server/routes.ts:170-205` authMiddleware
- Modify: `server/routes.ts:587-680` user CRUD endpoints (3 references untuk isSystemAdmin)
- Modify: `server/routes.ts:1358, 1702, 1713` role-related string compares
- Modify: `server/routes.ts:7893, 7968, 8146, 8206` admin checks
- Modify: `server/index.ts:231, 241` SLA notification

- [ ] **Step 1: Refactor authMiddleware (server/routes.ts:170-192)**

```ts
// Find this block (line ~169-192):
if (token) {
  const user = await storage.getUserByToken(token);
  if (user && user.isActive) {
    // Resolve role-based permission levels (new system)
    const eff = await storage.getUserEffectivePermissions(user.id);
    const legacyPerms = Object.keys(eff.perms).filter(k => eff.perms[k] === "read" || eff.perms[k] === "write");
    // Phase B: load active mitra (validate user is still member; fallback to 1)
    let activeMitraId = Number((user as any).activeMitraId ?? 1);
    const isMember = await storage.isUserMemberOfMitra(user.id, activeMitraId);
    if (!isMember) {
      // ... fallback logic
    }
    req.authUser = {
      // ...
      roleName: eff.roleName,
      isSystemAdmin: eff.isSystem && eff.roleName === "Administrator",
      // ...
    };
  }
}

// Replace with:
if (token) {
  const user = await storage.getUserByToken(token);
  if (user && user.isActive) {
    // Phase B: load active mitra (validate user is still member; fallback to 1)
    let activeMitraId = Number((user as any).activeMitraId ?? 1);
    const isMember = await storage.isUserMemberOfMitra(user.id, activeMitraId);
    if (!isMember) {
      const memberships = await storage.getUserMitras(user.id);
      activeMitraId = memberships[0]?.id ?? 1;
    }
    // Determine cross-tenant bypass: System-Admin role specifically AT mitra=1
    const ownerEff = await storage.getUserEffectivePermissionsAtMitra(user.id, 1);
    const isSystemAdmin = ownerEff.roleName === "System-Admin" && ownerEff.isSystem;
    // Permission levels at current active mitra
    const eff = await storage.getUserEffectivePermissionsAtMitra(user.id, activeMitraId);
    const legacyPerms = Object.keys(eff.perms).filter(k => eff.perms[k] === "read" || eff.perms[k] === "write");
    req.authUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role ?? "operator",
      roleId: (user as any).roleId ?? null,
      roleName: eff.roleName,
      isSystemAdmin,
      canSeeAllData: eff.canSeeAllData,
      permLevels: eff.perms,
      permissions: legacyPerms,
      activeMitraId,
    };
  }
}
```

- [ ] **Step 2: Sweep `isSystemAdmin` computation di POST /login + /switch-mitra (lines 587-680)**

Cari semua 3 occurrence di routes.ts:

```bash
grep -n 'isSystemAdmin: eff.isSystem && eff.roleName === "Administrator"' server/routes.ts
```

Replace setiap dengan pattern yang sama dengan Step 1 (load ownerEff at mitra=1, derive isSystemAdmin, load eff at activeMitraId). Untuk konsistensi, extract helper:

```ts
// Add helper di server/routes.ts (top, near sendError/parseCookieHeader):
async function computeAuthFlags(userId: number, activeMitraId: number) {
  const ownerEff = await storage.getUserEffectivePermissionsAtMitra(userId, 1);
  const eff = await storage.getUserEffectivePermissionsAtMitra(userId, activeMitraId);
  return {
    eff,
    isSystemAdmin: ownerEff.roleName === "System-Admin" && ownerEff.isSystem,
  };
}
```

Lalu replace 4 occurrence (authMiddleware + 3 di login/switch-mitra/me) untuk pakai helper ini.

- [ ] **Step 3: Sweep string compare references di server/routes.ts**

```bash
grep -n '"Administrator"' server/routes.ts
```

Update tiap reference:

**Line ~1358** (kemungkinan seed/auto-grant):
```ts
const r = await storage.getRoleByName("Administrator");
// → ganti:
const r = await storage.getRoleByName("System-Admin");
```

**Line ~1702, 1713** (role guard di update endpoint):
```ts
if (canSeeAllData !== undefined && existing.name !== "Administrator") {
// → ganti:
if (canSeeAllData !== undefined && existing.name !== "System-Admin") {
```

```ts
if (existing.name === "Administrator") {
// → ganti:
if (existing.name === "System-Admin") {
```

**Line ~7893, 7968, 8206** (admin checks via legacy text role):
```ts
const isAdmin = req.authUser.role === "Administrator" || req.authUser.role === "admin";
// → ganti (expand untuk include both System-Admin + Admin):
const isAdmin = req.authUser.role === "System-Admin"
              || req.authUser.role === "Admin"
              || req.authUser.role === "admin"
              || req.authUser.isSystemAdmin;
```

**Line ~8146** (telegram notify role list):
```ts
await notifyRolesTelegram(["Administrator", "admin", "Supervisor"], "ticket_escalation", ...);
// → ganti:
await notifyRolesTelegram(["System-Admin", "Admin", "admin", "Supervisor"], "ticket_escalation", ...);
```

- [ ] **Step 4: Sweep server/index.ts SLA notification (line 231, 241)**

```ts
// Line 231:
const supervisorIds = supervisors.filter((u: any) => u.role === "Administrator" || u.role === "admin" || u.role === "Supervisor").map((u: any) => u.id);
// → ganti:
const supervisorIds = supervisors.filter((u: any) =>
  u.role === "System-Admin" || u.role === "Admin" || u.role === "Administrator" /* legacy */
  || u.role === "admin" || u.role === "Supervisor"
).map((u: any) => u.id);

// Line 241:
await notifyRolesTelegram(["Administrator", "admin", "Supervisor"], "sla_escalation", msg);
// → ganti:
await notifyRolesTelegram(["System-Admin", "Admin", "admin", "Supervisor"], "sla_escalation", msg);
```

(Untuk users yg belum di-migrate text role-nya, "Administrator" tetap fallback masuk filter.)

- [ ] **Step 5: Verify build + typecheck**

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors.

- [ ] **Step 6: Smoke test login flow di dev**

```bash
npm run dev
```

Di browser baru: login dengan default admin (username `admin`, password `Admin@1234` atau `admin123` atau `Galon@12345` per env). Inspect `localStorage.ftth_user`:
- `isSystemAdmin: true` (kalau admin user properly seeded as System-Admin di mitra=1)
- `roleName: "System-Admin"` atau "admin (legacy)" — kalau seed migration belum jalan, restart server

Login asaka_admin (kalau ada di local dev). Expect `isSystemAdmin: false`, `roleName: "Admin"`.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts server/index.ts
git commit -m "$(cat <<'EOF'
refactor(auth): per-mitra permission resolution + sweep Administrator strings

authMiddleware sekarang resolve isSystemAdmin via getUserEffectivePermissionsAtMitra(user, 1)
— cross-tenant bypass hanya untuk System-Admin role specifically AT mitra=1 (JABNET).
Permission eff loaded for active mitra. Helper computeAuthFlags() dedupe 4 call sites
(authMiddleware, login, switch-mitra, /me).

Sweep all "Administrator" string compares di server/routes.ts + server/index.ts.
Legacy text role checks expand jadi accept ["System-Admin", "Admin", "admin", "Administrator"]
untuk backward compat selama transition.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `PATCH /api/mitras/:mitraId/members/:userId` endpoint

**Files:**
- Modify: `server/storage.ts` — add `updateMitraMemberRole(mitraId, userId, roleId)` method
- Modify: `server/routes.ts` — add PATCH endpoint near existing `/api/mitras/:id/users` (line ~987)

- [ ] **Step 1: Add storage method `updateMitraMemberRole`**

Cari sekitar `getUserMitras` atau `addUserMitra` di storage.ts dan tambah:

```ts
async updateMitraMemberRole(mitraId: number, userId: number, roleId: number): Promise<UserMitra | null> {
  await this.db.execute(sql`
    UPDATE user_mitras SET role_id = ${roleId}
    WHERE user_id = ${userId} AND mitra_id = ${mitraId}
  `);
  invalidatePermCacheAtMitra(userId, mitraId);
  const [rows]: any = await this.db.execute(sql`
    SELECT * FROM user_mitras WHERE user_id = ${userId} AND mitra_id = ${mitraId} LIMIT 1
  `);
  return (rows as any[])[0] ?? null;
}

async countSystemAdminsAtMitra1(): Promise<number> {
  const [rows]: any = await this.db.execute(sql`
    SELECT COUNT(*) AS cnt FROM user_mitras um
    JOIN roles r ON r.id = um.role_id
    WHERE um.mitra_id = 1 AND r.name = 'System-Admin'
  `);
  return Number((rows as any[])[0]?.cnt ?? 0);
}
```

Tambah signature ke `IStorage` interface (cari `getUserMitras` di interface dan tambah method baru di section yang sama).

- [ ] **Step 2: Add PATCH endpoint di routes.ts (sebelum line 987 `POST /api/mitras/:id/users`)**

```ts
router.patch("/api/mitras/:mitraId/members/:userId", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const mitraId = Number(req.params.mitraId);
  const userId = Number(req.params.userId);
  const { roleId } = req.body ?? {};
  if (!Number.isFinite(mitraId) || !Number.isFinite(userId) || !Number.isFinite(roleId)) {
    return sendError(res, "Invalid params", 400);
  }
  // Authz: System-Admin atau (Admin di mitra yang sama dengan write permission)
  const isSelfMitra = req.authUser.activeMitraId === mitraId;
  const canManage = req.authUser.isSystemAdmin
                 || (isSelfMitra && (req.authUser.roleName === "Admin" || req.authUser.roleName === "System-Admin"));
  if (!canManage) return sendError(res, "Forbidden — only System-Admin or Admin in this mitra can change roles", 403);

  // Lookup target role
  const role = await storage.getRoleById(roleId);
  if (!role) return sendError(res, "Role tidak ditemukan", 404);

  // Only System-Admin can grant System-Admin role
  if (role.name === "System-Admin" && !req.authUser.isSystemAdmin) {
    return sendError(res, "Hanya System-Admin yang boleh grant role System-Admin", 403);
  }
  // System-Admin role hanya valid di mitra=1
  if (role.name === "System-Admin" && mitraId !== 1) {
    return sendError(res, "Role System-Admin hanya bisa di-assign di mitra JABNET (mitra=1)", 400);
  }

  // Protect minimum 1 System-Admin di mitra=1
  if (mitraId === 1) {
    const currentMembership = await storage.getUserMitraMembership(userId, 1);
    const currentRole = currentMembership?.roleId ? await storage.getRoleById(currentMembership.roleId) : null;
    if (currentRole?.name === "System-Admin" && role.name !== "System-Admin") {
      const count = await storage.countSystemAdminsAtMitra1();
      if (count <= 1) {
        return sendError(res, "Tidak bisa demote — minimal 1 System-Admin di JABNET wajib ada", 400);
      }
    }
  }

  // Verify target user is actually member of this mitra
  const isMember = await storage.isUserMemberOfMitra(userId, mitraId);
  if (!isMember) return sendError(res, "User bukan anggota mitra ini", 404);

  const updated = await storage.updateMitraMemberRole(mitraId, userId, roleId);
  await storage.createAuditLog({
    userId: req.authUser.id,
    action: "UPDATE_MITRA_MEMBER_ROLE",
    entityType: "user_mitras",
    entityId: userId,
    details: JSON.stringify({ mitraId, targetUserId: userId, newRoleId: roleId, newRoleName: role.name }),
  });
  return res.json({ ok: true, membership: updated });
});
```

**Catatan**: `getUserMitraMembership(userId, mitraId)` mungkin tidak ada — kalau tidak ada, tambah method storage:

```ts
async getUserMitraMembership(userId: number, mitraId: number): Promise<UserMitra | null> {
  const [rows]: any = await this.db.execute(sql`
    SELECT * FROM user_mitras WHERE user_id = ${userId} AND mitra_id = ${mitraId} LIMIT 1
  `);
  return (rows as any[])[0] ?? null;
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Manual smoke test endpoint via curl**

Login dulu untuk dapat token:
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@1234"}' | grep -oP '"token":"\K[^"]+')
echo "Token: $TOKEN"
```

PATCH role asaka_admin (asumsi userId=32, mitraId=3, roleId=Admin):
```bash
ADMIN_ROLE_ID=$(curl -s http://localhost:3001/api/roles -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; data=json.load(sys.stdin); print([r['id'] for r in data if r['name']=='Admin'][0])")
curl -X PATCH "http://localhost:3001/api/mitras/3/members/32" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"roleId\":$ADMIN_ROLE_ID}"
```

Expected: `{ ok: true, membership: { ..., roleId: $ADMIN_ROLE_ID } }`

Test System-Admin grant denial (login as asaka_admin, try grant System-Admin):
- Expected 403 "Hanya System-Admin yang boleh grant"

Test minimum-System-Admin protection: pretend only 1 System-Admin left, attempt demote → expected 400.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts server/routes.ts
git commit -m "$(cat <<'EOF'
feat(mitra): PATCH /api/mitras/:mitraId/members/:userId untuk role per-membership

Guards:
- System-Admin atau Admin di mitra yang sama bisa change role
- Hanya System-Admin yang boleh grant role System-Admin
- Role System-Admin hanya valid di mitra=1 (JABNET)
- Block demote terakhir System-Admin di mitra=1 (minimum 1 wajib)

Cache invalidate per-(userId, mitraId) sesudah update. Audit log via
createAuditLog dengan action UPDATE_MITRA_MEMBER_ROLE.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `POST /api/mitras` extension — transactional admin user creation

**Files:**
- Modify: `server/routes.ts:782-900` `POST /api/mitras` handler

- [ ] **Step 1: Read current POST handler untuk understanding shape**

```bash
grep -n "router.post(\"/api/mitras\"" server/routes.ts
```

Open `server/routes.ts` di sekitar line 782 + ~150 lines. Pahami current insert flow (mitra insert, seedMitraIntegrationDefaults, ensureMitraDirs).

- [ ] **Step 2: Extend POST handler dengan transactional admin user creation**

Replace existing handler (line ~782 sampai endpoint close) dengan refactored version. Key additions:

```ts
router.post("/api/mitras", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!req.authUser.isSystemAdmin) return sendError(res, "Hanya System-Admin yang boleh create mitra", 403);

  // Validate mitra body (existing zod schema)
  const parsed = insertMitraSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid mitra body", 400, parsed.error.flatten());
  const mitraData = parsed.data;

  // Validate admin body (NEW — wajib)
  const admin = req.body?.admin;
  if (!admin || typeof admin !== "object") {
    return sendError(res, "Field 'admin' wajib di body — setiap mitra butuh minimal 1 Admin", 400);
  }
  const { username, name, email, phone, password } = admin;
  if (!username || !name || !password) {
    return sendError(res, "Admin requires username, name, dan password", 400);
  }
  if (typeof password !== "string" || password.length < 8) {
    return sendError(res, "Password Admin minimal 8 karakter", 400);
  }

  // Pre-check username unique
  const existing = await storage.getUserByUsername(username);
  if (existing) return sendError(res, `Username '${username}' sudah dipakai`, 400);

  // Pre-resolve Admin role ID (built-in)
  const adminRole = await storage.getRoleByName("Admin");
  if (!adminRole) return sendError(res, "Internal: role Admin tidak ditemukan (seed issue)", 500);

  // Transaction
  const pool = (storage as any).pool;
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    // 1. Insert mitra
    const [mitraResult]: any = await conn.execute(
      `INSERT INTO mitras (name, slug, display_name, logo_url, features, primary_contact_name, primary_contact_phone, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        mitraData.name,
        mitraData.slug,
        mitraData.displayName ?? null,
        mitraData.logoUrl ?? null,
        mitraData.features ?? "{}",
        mitraData.primaryContactName ?? null,
        mitraData.primaryContactPhone ?? null,
      ]
    );
    const mitraId = Number(mitraResult.insertId);

    // 2. Bcrypt hash password
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Insert admin user
    const [userResult]: any = await conn.execute(
      `INSERT INTO users (username, name, password, email, phone, role, role_id, is_active, active_mitra_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, NOW())`,
      [username, name, passwordHash, email ?? null, phone ?? null, "Admin", mitraId]
    );
    const newUserId = Number(userResult.insertId);

    // 4. Insert user_mitras membership with Admin role
    await conn.execute(
      `INSERT INTO user_mitras (user_id, mitra_id, is_primary, role_id, created_at)
       VALUES (?, ?, 1, ?, NOW())`,
      [newUserId, mitraId, adminRole.id]
    );

    await conn.commit();

    // 5. Post-commit hooks (non-transactional)
    try { await storage.seedMitraIntegrationDefaults(mitraId); } catch (e) { console.warn("seed integrations:", e); }
    // Kalau ensureMitraDirs sudah implemented (dari plan filesystem-photo), jalankan:
    // try { const { ensureMitraDirs } = await import("./uploads.js"); await ensureMitraDirs(mitraData.slug); } catch {}

    invalidatePermCacheAtMitra(newUserId);

    await storage.createAuditLog({
      userId: req.authUser.id,
      action: "CREATE_MITRA",
      entityType: "mitras",
      entityId: mitraId,
      details: JSON.stringify({ mitraId, slug: mitraData.slug, adminUserId: newUserId, adminUsername: username }),
    });

    const mitra = await storage.getMitra(mitraId);
    return res.json({ ok: true, mitra, adminUser: { id: newUserId, username, name } });
  } catch (e: any) {
    await conn.rollback();
    console.error("[create-mitra] transaction failed:", e);
    return sendError(res, "Gagal create mitra: " + (e?.message ?? "unknown"), 500);
  } finally {
    conn.release();
  }
});
```

**Catatan**: 
- Adjust column list di INSERT statements sesuai actual schema (cek `mitras` table columns di shared/schema.ts).
- Field `displayName`, `logoUrl`, `features`, dst — sesuaikan kalau column berbeda nama atau optional.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manual smoke test via curl**

Login as admin (System-Admin):
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@1234"}' | grep -oP '"token":"\K[^"]+')
```

Test create with missing admin (expect 400):
```bash
curl -X POST http://localhost:3001/api/mitras \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Mitra","slug":"test-mitra"}'
# Expected: {"error":"Field 'admin' wajib di body ..."}
```

Test create with full body:
```bash
curl -X POST http://localhost:3001/api/mitras \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test Mitra",
    "slug":"test-mitra-1",
    "admin":{"username":"test_admin","name":"Test Admin","password":"Test@1234"}
  }'
# Expected: {"ok":true,"mitra":{...},"adminUser":{"id":N,"username":"test_admin",...}}
```

Verify di DB:
```bash
# Pakai sqlite/mysql client untuk inspect:
# - mitras table has new row dengan slug "test-mitra-1"
# - users table has new row username "test_admin"
# - user_mitras table has (user_id=newUserId, mitra_id=newMitraId, is_primary=1, role_id=Admin's id)
```

Cleanup:
```bash
# Local dev: hapus test row dari mysql/sqlite manual
```

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "$(cat <<'EOF'
feat(mitra-wizard): POST /api/mitras transactional admin user creation

Mitra wajib dibuat bersama 1 admin user dalam single transaction.
Body extended dengan field 'admin' { username, name, email?, phone?, password }.
Validation: password min 8 chars, username unique, Admin role exists.

Flow:
1. INSERT mitras
2. bcrypt hash password
3. INSERT users (role='Admin', active_mitra_id=newMitra)
4. INSERT user_mitras (is_primary=1, role_id=Admin)
5. Commit + post-hooks (seedMitraIntegrationDefaults, ensureMitraDirs)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend MembersTab — role selector per row + banner update

**Files:**
- Modify: `client/pages/MitraPage.tsx` `MembersTab` component (line ~775)

- [ ] **Step 1: Locate MembersTab + understand current shape**

```bash
grep -n "MembersTab\|function MembersTab" client/pages/MitraPage.tsx | head -5
```

Read sekitar `MembersTab` (estimasi 80-120 baris). Pahami current state:
- Cara list anggota (likely TanStack Query)
- Cara add member (dropdown user + button submit)
- Current row layout

- [ ] **Step 2: Fetch roles list (TanStack Query) di MembersTab**

Tambah di awal `MembersTab` function (setelah existing queries):

```tsx
const { data: roles = [] } = useQuery<{ id: number; name: string; isSystem: number }[]>({
  queryKey: ["roles"],
  queryFn: async () => {
    const res = await fetch("/api/roles", {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  },
});
```

(Sesuaikan dengan existing query pattern di file ini — kalau ada custom `apiFetch` helper, pakai itu.)

- [ ] **Step 3: Add update role mutation**

```tsx
const updateRoleMutation = useMutation({
  mutationFn: async ({ userId, roleId }: { userId: number; roleId: number }) => {
    const res = await fetch(`/api/mitras/${mitra.id}/members/${userId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roleId }),
    });
    if (!res.ok) throw new Error((await res.json())?.error ?? "Failed");
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["mitra-detail", mitra.id] });
    toast({ title: "Role di-update", variant: "default" });
  },
  onError: (e: any) => {
    toast({ title: "Gagal update role", description: e.message, variant: "destructive" });
  },
});
```

- [ ] **Step 4: Replace member list rendering dengan role selector per row**

Cari section `{members.map(...)}` atau equivalent. Replace dengan:

```tsx
{members.length === 0 ? (
  <div className="text-sm text-muted-foreground text-center py-8">Belum ada anggota</div>
) : (
  <div className="space-y-2">
    {members.map((m: any) => {
      const currentRoleId = m.roleId ?? null;
      // Filter roles: at non-mitra-1, hide System-Admin
      const availableRoles = roles.filter((r) =>
        mitra.id === 1 ? true : r.name !== "System-Admin"
      );
      // Disable role selector kalau current user bukan System-Admin AND target role is System-Admin
      const canEditThisRow = canEdit && (mitra.id === 1 || currentUser.isSystemAdmin);
      return (
        <div key={m.userId} className="flex items-center gap-2 p-2 rounded border bg-card">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{(m.name ?? m.username).slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{m.name ?? m.username}</div>
            <div className="text-xs text-muted-foreground truncate">@{m.username}</div>
          </div>
          <Select
            value={currentRoleId ? String(currentRoleId) : ""}
            onValueChange={(v) => updateRoleMutation.mutate({ userId: m.userId, roleId: Number(v) })}
            disabled={!canEditThisRow || updateRoleMutation.isPending}
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Pilih role" />
            </SelectTrigger>
            <SelectContent>
              {availableRoles.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                  {r.name === "System-Admin" && <span className="ml-1 text-[10px] text-red-500">⚠ cross-tenant</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {m.isPrimary ? <Badge variant="default">Primary</Badge> : null}
          {canEdit && (
            <Button variant="ghost" size="icon-sm" onClick={() => removeMutation.mutate(m.userId)}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      );
    })}
  </div>
)}
```

(Sesuaikan dengan struktur data sebenarnya dari `members` query — gunakan field name yang sesuai response GET /api/mitras/:id.)

- [ ] **Step 5: Update info banner text dari Part A**

Cari banner yang sudah ada (dari commit `af03a07`):

```bash
grep -n "Pastikan setiap mitra punya" client/pages/MitraPage.tsx
```

Update text:

```tsx
// Sebelum:
<span className="font-semibold">Tips:</span> Pastikan setiap mitra punya <strong>minimal 1 user dari JABNET dengan role Administrator</strong> sebagai entry point — biar mereka bisa kelola data + tambah user lain. Mitra baru tidak bisa diakses kalau belum ada admin assigned.

// Sesudah:
<span className="font-semibold">Tips:</span> Setiap mitra wajib punya minimal 1 user dengan role <strong>Admin</strong> sebagai entry point. Khusus mitra <strong>JABNET (mitra=1)</strong>, role yang dimaksud adalah <strong>System-Admin</strong> (cross-tenant). Mitra baru tidak bisa diakses tanpa Admin assigned.
```

- [ ] **Step 6: Update Add Member dropdown — add role selector**

Cari section "Tambah user via dropdown" atau add member form. Update jadi 2-dropdown:

```tsx
<div className="flex gap-2">
  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
    {/* existing user dropdown */}
  </Select>
  <Select value={selectedRoleId} onValueChange={setSelectedRoleId} defaultValue={String(roles.find(r => r.name === "Admin")?.id ?? "")}>
    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Role" /></SelectTrigger>
    <SelectContent>
      {roles.filter(r => mitra.id === 1 ? true : r.name !== "System-Admin").map(r => (
        <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
  <Button onClick={() => addMutation.mutate({ userId: selectedUserId, roleId: selectedRoleId })}>Tambah</Button>
</div>
```

Update addMutation body untuk include `roleId`. Update existing backend `POST /api/mitras/:id/users` untuk accept roleId field — sebelum task 7 commit, verify ini sudah handle atau extend.

```bash
grep -n 'router.post("/api/mitras/:id/users"' server/routes.ts
```

Read handler tersebut. Kalau belum accept roleId, extend:
```ts
// existing handler
const { userId, isPrimary } = req.body;
// extend:
const { userId, isPrimary, roleId } = req.body;
const finalRoleId = roleId ?? (await storage.getRoleByName("Admin"))?.id;
// pass finalRoleId ke INSERT user_mitras
```

- [ ] **Step 7: Verify build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 8: Manual UI smoke test**

```bash
npm run dev
```

Login as admin → /mitra → edit ASAKA → tab Anggota:
- Expected: list anggota tampil dengan dropdown role di samping nama
- Test: ubah role asaka_admin dari "Admin" ke "Operator" → expect toast success + refresh data
- Test: di dropdown, kalau active mitra=3 (ASAKA), option "System-Admin" tidak muncul (filtered out)
- Test (sebagai non-System-Admin): role selector disabled

- [ ] **Step 9: Commit**

```bash
git add client/pages/MitraPage.tsx server/routes.ts
git commit -m "$(cat <<'EOF'
feat(mitra-ui): role selector per anggota + filter System-Admin di non-mitra-1

MembersTab dapat role selector dropdown per row. Filter:
- Active mitra=1 (JABNET): semua role tersedia (termasuk System-Admin)
- Active mitra lain: option System-Admin disembunyikan
PATCH /api/mitras/:mitraId/members/:userId di-call onChange.

Add member form sekarang punya 2 dropdown (user + role), default role=Admin.
POST /api/mitras/:id/users extended untuk accept roleId field.

Info banner update: sebut System-Admin vs Admin distinction.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend create-mitra wizard step 2 (Admin user form)

**Files:**
- Modify: `client/pages/MitraPage.tsx` create dialog component

- [ ] **Step 1: Locate create dialog**

```bash
grep -n "Tambah Mitra\|Create Mitra\|create.*dialog\|CreateMitra" client/pages/MitraPage.tsx | head -10
```

Read dialog component yang ada (estimasi 100-150 baris).

- [ ] **Step 2: Add wizard state + step navigation**

Di komponen create dialog, tambah state:

```tsx
const [step, setStep] = useState<1 | 2>(1);
const [adminForm, setAdminForm] = useState({
  username: "",
  name: "",
  email: "",
  phone: "",
  password: "",
  passwordConfirm: "",
});
const [adminErrors, setAdminErrors] = useState<Record<string, string>>({});

// Auto-suggest username dari slug saat user move ke step 2
useEffect(() => {
  if (step === 2 && !adminForm.username && form.slug) {
    setAdminForm(prev => ({ ...prev, username: `${form.slug.replace(/-/g, "_")}_admin` }));
  }
}, [step, form.slug]);
```

- [ ] **Step 3: Wrap dialog content dengan step 1 / step 2 conditional**

```tsx
<DialogContent>
  <DialogHeader>
    <DialogTitle>Tambah Mitra {step === 2 && "— Step 2/2"}</DialogTitle>
    <DialogDescription>
      {step === 1 ? "Detail mitra & feature toggles" : "Akun Administrator (wajib)"}
    </DialogDescription>
  </DialogHeader>

  {step === 1 ? (
    <>
      {/* existing form fields: Nama, Slug, Display Name, Logo, Contact, Features */}
      ...
    </>
  ) : (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
        ℹ️ Setiap mitra wajib punya 1 Admin sebagai entry point. Password yang Anda set di sini bisa digunakan langsung untuk login.
      </div>
      <FormField label="Username" htmlFor="admin-username" required error={adminErrors.username}>
        <Input id="admin-username" value={adminForm.username}
          onChange={(e) => setAdminForm(p => ({ ...p, username: e.target.value }))}
          placeholder={`${form.slug?.replace(/-/g, "_") ?? "mitra"}_admin`} />
      </FormField>
      <FormField label="Nama Lengkap" htmlFor="admin-name" required error={adminErrors.name}>
        <Input id="admin-name" value={adminForm.name}
          onChange={(e) => setAdminForm(p => ({ ...p, name: e.target.value }))} />
      </FormField>
      <FormRow cols={2}>
        <FormField label="Email" htmlFor="admin-email">
          <Input id="admin-email" type="email" value={adminForm.email}
            onChange={(e) => setAdminForm(p => ({ ...p, email: e.target.value }))} />
        </FormField>
        <FormField label="Phone" htmlFor="admin-phone" hint="Untuk MPWA OTP">
          <Input id="admin-phone" value={adminForm.phone}
            onChange={(e) => setAdminForm(p => ({ ...p, phone: e.target.value }))} />
        </FormField>
      </FormRow>
      <FormField label="Password" htmlFor="admin-pw" required error={adminErrors.password} hint="Min 8 karakter">
        <Input id="admin-pw" type="password" value={adminForm.password}
          onChange={(e) => setAdminForm(p => ({ ...p, password: e.target.value }))} />
      </FormField>
      <FormField label="Konfirmasi Password" htmlFor="admin-pw2" required error={adminErrors.passwordConfirm}>
        <Input id="admin-pw2" type="password" value={adminForm.passwordConfirm}
          onChange={(e) => setAdminForm(p => ({ ...p, passwordConfirm: e.target.value }))} />
      </FormField>
    </div>
  )}

  <DialogFooter>
    {step === 1 ? (
      <Button onClick={validateStep1AndNext} disabled={!form.name || !form.slug}>Next →</Button>
    ) : (
      <>
        <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Membuat..." : "Buat Mitra + Admin"}
        </Button>
      </>
    )}
  </DialogFooter>
</DialogContent>
```

- [ ] **Step 4: Implement validation helpers**

```tsx
function validateStep1AndNext() {
  // existing slug/name validation
  if (!form.name?.trim()) return setStep1Error("name", "Wajib");
  if (!form.slug?.trim() || !/^[a-z0-9-]+$/.test(form.slug)) return setStep1Error("slug", "Format kebab-case");
  setStep(2);
}

function validateAdminAndSubmit(): boolean {
  const errs: Record<string, string> = {};
  if (!adminForm.username.trim()) errs.username = "Wajib";
  else if (!/^[a-zA-Z0-9_-]+$/.test(adminForm.username)) errs.username = "Hanya huruf, angka, _, -";
  if (!adminForm.name.trim()) errs.name = "Wajib";
  if (!adminForm.password) errs.password = "Wajib";
  else if (adminForm.password.length < 8) errs.password = "Min 8 karakter";
  if (adminForm.password !== adminForm.passwordConfirm) errs.passwordConfirm = "Tidak cocok";
  setAdminErrors(errs);
  return Object.keys(errs).length === 0;
}

function handleSubmit() {
  if (!validateAdminAndSubmit()) return;
  createMutation.mutate({
    ...form,
    admin: {
      username: adminForm.username,
      name: adminForm.name,
      email: adminForm.email || undefined,
      phone: adminForm.phone || undefined,
      password: adminForm.password,
    },
  });
}
```

- [ ] **Step 5: Update createMutation untuk send admin di body**

```tsx
const createMutation = useMutation({
  mutationFn: async (body: any) => {
    const res = await fetch("/api/mitras", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Failed");
    return data;
  },
  onSuccess: (data) => {
    toast({
      title: "Mitra dibuat",
      description: `Admin: ${data.adminUser.username} — bisa login sekarang.`,
    });
    queryClient.invalidateQueries({ queryKey: ["mitras"] });
    setStep(1);
    setOpen(false);
    // reset forms
    setAdminForm({ username: "", name: "", email: "", phone: "", password: "", passwordConfirm: "" });
  },
  onError: (e: any) => {
    toast({ title: "Gagal", description: e.message, variant: "destructive" });
  },
});
```

- [ ] **Step 6: Verify build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 7: Manual UI smoke test**

```bash
npm run dev
```

Login as admin → /mitra → button "Tambah Mitra":
- Step 1: fill Nama "Test Wizard", Slug "test-wizard" → Next
- Step 2: username auto-pre-filled "test_wizard_admin"
- Try short password (e.g. "12345") → expect inline error "Min 8 karakter"
- Try password mismatch → expect inline error "Tidak cocok"
- Fill valid: password "Test@1234" + confirm → Submit
- Expect: toast success, new mitra muncul di list
- Logout, login as `test_wizard_admin` / `Test@1234` → expect login success, active mitra = test-wizard

Cleanup: hapus test mitra via /mitra detail dialog → Delete (atau via SQL kalau soft delete).

- [ ] **Step 8: Commit**

```bash
git add client/pages/MitraPage.tsx
git commit -m "$(cat <<'EOF'
feat(mitra-wizard): 2-step create-mitra dialog dengan Admin user form

Step 1: existing mitra fields. Step 2 NEW (wajib):
- Username (auto-suggest dari slug, e.g. asaka → asaka_admin)
- Nama, Email (opsional), Phone (opsional)
- Password + konfirmasi, validasi min 8 chars + match

Submit kirim 1 POST /api/mitras dengan combined body { ...mitraFields,
admin: { username, name, email?, phone?, password } }. Backend handle
transaction (Task 6).

Toast post-create info "Admin: <username> — bisa login sekarang."

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend RolesPage + ProfilePage + TicketCategoriesPage sweep

**Files:**
- Modify: `client/pages/RolesPage.tsx:468, 504, 507` — replace "Administrator" guards
- Modify: `client/pages/ProfilePage.tsx:93` — role label map
- Modify: `client/pages/TicketCategoriesPage.tsx:127` — admin check

- [ ] **Step 1: Update RolesPage.tsx string references**

```bash
grep -n '"Administrator"' client/pages/RolesPage.tsx
```

Replace setiap occurrence:
```tsx
// Line 468 (canSeeAllData checkbox guard):
disabled={isSystem && initial?.name === "Administrator"}
// → ganti:
disabled={isSystem && initial?.name === "System-Admin"}

// Line 504 (setAllPermissions none button):
disabled={isSystem && initial?.name === "Administrator"}
// → ganti:
disabled={isSystem && (initial?.name === "System-Admin" || initial?.name === "Admin")}

// Line 507 (setAllPermissions read button):
disabled={isSystem && initial?.name === "Administrator"}
// → ganti:
disabled={isSystem && (initial?.name === "System-Admin" || initial?.name === "Admin")}
```

(System-Admin + Admin keduanya built-in, lock canSeeAllData + bulk-set permissions.)

- [ ] **Step 2: Update RolesPage badge styling**

Cari section yang render role card. Tambah special styling kalau `role.name === "System-Admin"`:

```tsx
// Cari render role item, biasanya ada className dynamic atau Badge:
<Badge variant={role.name === "System-Admin" ? "destructive" : (role.isSystem ? "default" : "secondary")}>
  {role.name}
  {role.name === "System-Admin" && " ⚠"}
</Badge>
```

Atau di card border:
```tsx
<Card className={cn(
  "p-4",
  role.name === "System-Admin" && "border-red-500/40 bg-red-50/30 dark:bg-red-950/10"
)}>
```

- [ ] **Step 3: Update ProfilePage.tsx role label map**

```tsx
// Line 93 (current):
const roleMap = {
  admin: { label: "Administrator", color: "text-red-600 dark:text-red-400", icon: ShieldCheck, desc: "Akses penuh semua fitur sistem" },
  // ...
};

// → ganti:
const roleMap = {
  admin: { label: "Administrator (legacy)", color: "text-red-600 dark:text-red-400", icon: ShieldCheck, desc: "Legacy admin — akan diganti System-Admin" },
  "System-Admin": { label: "System Admin", color: "text-red-600 dark:text-red-400", icon: ShieldCheck, desc: "Akses cross-tenant (JABNET pusat)" },
  "Admin": { label: "Admin", color: "text-blue-600 dark:text-blue-400", icon: Shield, desc: "Akses penuh di satu mitra" },
  // ...keep rest
};
```

Pastikan `roleMap[user.role]` access tetap aman — kalau key tidak ada, fallback ke object default.

- [ ] **Step 4: Update TicketCategoriesPage.tsx admin check**

```tsx
// Line 127:
const isAdmin = user?.role === "Administrator" || user?.role === "admin";
// → ganti:
const isAdmin = user?.role === "System-Admin" || user?.role === "Admin" || user?.role === "Administrator" /* legacy */ || user?.role === "admin";
```

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add client/pages/RolesPage.tsx client/pages/ProfilePage.tsx client/pages/TicketCategoriesPage.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): sweep Administrator → System-Admin/Admin di client pages

- RolesPage: canSeeAllData lock untuk System-Admin; bulk-set permission
  buttons disabled untuk System-Admin + Admin (both built-in)
- RolesPage: badge styling khusus System-Admin (destructive variant + ⚠)
- ProfilePage: role label map tambah entry System-Admin + Admin
- TicketCategoriesPage: isAdmin check expand jadi accept 4 role names

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Verification + manual test matrix + push

**Files:** No code changes — verification only.

- [ ] **Step 1: Full typecheck + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors, build success.

- [ ] **Step 2: Grep audit — ensure no stale "Administrator" string left in code**

```bash
grep -rn '"Administrator"' server/ client/ shared/ --include='*.ts' --include='*.tsx'
```

Expected: setiap occurrence yang masih ada harus DELIBERATE — either:
- Legacy backward-compat (e.g. `=== "Administrator"` di filter OR clause), OR
- Migration SQL string literal (sengaja untuk rename `WHERE name = 'Administrator'`)
- Comment / doc string

Tidak ada line baru yang `=== "Administrator"` tanpa juga include "System-Admin".

- [ ] **Step 3: Start dev server + manual test matrix**

```bash
npm run dev
```

Test sequence (semua via browser):

| # | Skenario | Expected | Pass/Fail |
|---|---|---|---|
| 1 | Login `admin` / `Admin@1234` | localStorage `ftth_user` punya `isSystemAdmin: true`, `roleName: "System-Admin"` | |
| 2 | /mitra → semua 3 mitra muncul | yoga, ASAKA, dst | |
| 3 | Edit JABNET (mitra=1) → tab Anggota | Tampil 4 platform owners (yoga, admin, Mikhail, Bah Yus) + lainnya, role selector di tiap row | |
| 4 | Edit ASAKA → tab Anggota | Tampil anggota ASAKA, role selector tanpa option "System-Admin" | |
| 5 | Tambah Mitra → step 1 fill → Next → step 2 form muncul, username auto-suggest | OK | |
| 6 | Step 2 password mismatch → submit | Inline error "Tidak cocok" | |
| 7 | Step 2 valid → submit | Toast success, mitra baru muncul di list | |
| 8 | Logout, login new admin (username dari step 7) | Login sukses, active mitra = mitra baru, data kosong | |
| 9 | Sebagai new admin, akses /mitra | 403 atau hide (bukan System-Admin) | |
| 10 | Sebagai new admin, akses /customers | Tampil 0 customers (mitra baru kosong) | |
| 11 | Logout, login `admin` → /roles | 2 role baru muncul: "System-Admin" (badge red ⚠) + "Admin" | |
| 12 | Click System-Admin role → preview | canSeeAllData checkbox locked (disabled) | |
| 13 | /mitra → edit mitra baru → Anggota → try assign System-Admin di dropdown | Option tidak muncul (filtered) | |

- [ ] **Step 4: Commit final + push**

```bash
git status  # confirm clean
git log --oneline -15  # confirm semua task commits ada
```

Push (user-triggered karena SSH key passphrase):
```
! git push origin main
```

(Atau: ask user to push manually.)

- [ ] **Step 5: User-triggered deploy ke cPanel**

Tunggu GHA build complete (cek di repo GitHub Actions tab).

User manually:
1. cPanel `Git Version Control` → `Update from Remote`
2. `Setup Node.js App` → `Restart`
3. Verify `curl https://workspace.jabnet.id/api/health` → `ok:true`
4. Login workspace.jabnet.id sebagai admin → manually verify dengan test matrix Step 3

Kalau ada issue saat startup migration (e.g. seedDefaultRolesIfNeeded gagal partial):
- SSH ke cPanel, cek log: `tail -100 ~/logs/nodejs/error.log`
- Inspect DB state: `mysql -u jabnet_crm_user -p'Galon@12345' jabnet_fiber -e "SELECT name FROM roles; SELECT u.username, r.name FROM users u JOIN user_mitras um ON um.user_id=u.id LEFT JOIN roles r ON r.id=um.role_id WHERE um.mitra_id=1;"`

---

## Self-Review Notes

**Spec coverage**:
- ✓ Schema change (Task 1)
- ✓ Role rename + Admin seed (Task 2)
- ✓ Permission resolution refactor (Task 3)
- ✓ authMiddleware + string sweep (Task 4)
- ✓ Members tab role PATCH endpoint (Task 5)
- ✓ POST /api/mitras transactional admin (Task 6)
- ✓ Frontend MembersTab role selector (Task 7)
- ✓ Wizard step 2 (Task 8)
- ✓ Frontend pages sweep (Task 9)
- ✓ Verification matrix (Task 10)

**Risk**:
- Startup migration block di production: kalau seedDefaultRolesIfNeeded throw partial (e.g. roles.name unique constraint violation), some user akan stuck. Mitigation: tiap step di-wrap try/catch dengan console.warn (Task 2 step 1). Worst case: rollback via SQL manual.
- Cache split bisa keep stale data kalau invalidation tidak dipanggil di semua mutation sites. Mitigasi: Task 3 step 4 sweep semua role/membership mutations. Final test step 13 verify role change instant reflect.
- Username auto-suggest collision: kalau slug == existing username (rare), fail with 400. UI catches error inline.
