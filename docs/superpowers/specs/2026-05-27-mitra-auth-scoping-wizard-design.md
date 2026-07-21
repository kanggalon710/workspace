# Spec - Mitra Authorization Scoping + Create-Mitra Wizard

**Date**: 2026-05-27
**Status**: Approved (B+C bundled)
**Scope**: Part B (per-membership role + role rename Administrator → System-Admin/Admin) + Part C (create-mitra wizard dengan akun Admin otomatis). Build di atas Part A (mitra members bug fix, sudah deployed di commit `af03a07`).

## Konteks

Current `isSystemAdmin` di `server/routes.ts:187` resolves ke `true` untuk semua user yang dapat role bawaan "Administrator", regardless mitra mana mereka member. Akibatnya:

- User created at mitra ASAKA dengan role Administrator → dapat cross-tenant bypass → bisa lihat data JABNET, mitra lain, dll.
- Tidak ada cara semantik untuk distinguish "platform owner" (yoga di JABNET) vs "tenant admin" (asaka_admin di ASAKA).
- Workflow create-mitra saat ini: form mitra → user manual ke Members tab → assign user → mudah lupa, mitra tanpa admin = tidak bisa diakses.

User intent (verbatim):
> "Role Administrator JABNET sudah ok, bisa akses integrations, users, role, dll untuk semua mitras tapi saya tidak ingin Administrator untuk mitra lain bisa akses data, settings, users mitra lain. Bila Administrator JABNET (yoga) create user A di mitra ASAKA dan beri akun tersebut role Administrator, seharusnya akun A punya akses full ke data, settings, integrations, users, dll HANYA untuk mitra ASAKA saja."

Pilihan implementasi: **per-membership role** (Option D) + rename role agar semantik jelas. **System-Admin** (cross-tenant, hanya valid di mitra=1 JABNET) vs **Admin** (intra-mitra, full access di 1 mitra).

---

## Schema Change

**Tambah kolom** `user_mitras.role_id INT NULL` (FK soft ke `roles.id`). Nullable untuk backward-compat: kalau NULL, fallback ke `users.role_id` (global) di permission resolver.

**Migration startup** di `server/storage.ts` ALTER block:
```sql
ALTER TABLE user_mitras ADD COLUMN IF NOT EXISTS role_id INT NULL;
```

**Tidak drop `users.role_id`** - tetap ada sebagai global default untuk seed/legacy paths + display di `/users` page sebagai "Role di mitra primary".

---

## Role Rename + Seed

**Roles DB changes**:
1. **Rename** existing role `Administrator` → `System-Admin` (cross-tenant bypass, `isSystem=1`, `canSeeAllData=1`)
2. **Insert** built-in role `Admin` (`isSystem=1`, `canSeeAllData=0`, permissions = all `write` - clone dari System-Admin tapi tanpa supervisor flag)
3. 4 role existing lain (View Only, Operator, Manager, Supervisor) **tetap tidak berubah**.

**Known Platform Owners** (cross-tenant System-Admin, sesuai user input 2026-05-27):
- `yoga`
- `admin` (default seed, currently `name = "Administrator"`)
- Mikhail Yazid Bustomi
- Bah Yus

Backfill **harus preserve** ke-4 user ini sebagai member mitra=1 dengan role System-Admin. Migration script defensive: kalau salah satu user ada tapi belum member mitra=1, auto-insert ke user_mitras.

**Backfill migration (startup, idempotent):**
```sql
-- 1. Rename Administrator → System-Admin (preserves FK by id, name change auto-propagate)
UPDATE roles SET name = 'System-Admin' WHERE name = 'Administrator';

-- 2. Insert Admin role (clone permissions dari System-Admin)
INSERT IGNORE INTO roles (name, description, permissions, is_system, can_see_all_data, created_at, updated_at)
SELECT 'Admin', 'Akses penuh di satu mitra (intra-tenant)',
       permissions, 1, 0, NOW(), NOW()
FROM roles WHERE name = 'System-Admin' LIMIT 1;

-- 3. Backfill user_mitras.role_id dari users.role_id (per-membership default)
UPDATE user_mitras SET role_id = (SELECT role_id FROM users WHERE users.id = user_mitras.user_id)
WHERE role_id IS NULL;

-- 4. PRESERVE platform owners: ensure 4 known users are at mitra=1 with System-Admin
--    Match by username (yoga, admin) atau by name LIKE (Mikhail, Bah Yus)
SET @system_admin_role := (SELECT id FROM roles WHERE name = 'System-Admin');

-- Ensure users.role_id = System-Admin untuk 4 known users
UPDATE users SET role_id = @system_admin_role
WHERE username IN ('yoga', 'admin')
   OR name LIKE '%Mikhail Yazid Bustomi%'
   OR name LIKE '%Bah Yus%';

-- Ensure mereka member di mitra=1 with role_id = System-Admin
INSERT IGNORE INTO user_mitras (user_id, mitra_id, is_primary, role_id, created_at)
SELECT u.id, 1, 1, @system_admin_role, NOW()
FROM users u
WHERE (u.username IN ('yoga', 'admin')
       OR u.name LIKE '%Mikhail Yazid Bustomi%'
       OR u.name LIKE '%Bah Yus%')
  AND NOT EXISTS (SELECT 1 FROM user_mitras um WHERE um.user_id = u.id AND um.mitra_id = 1);

-- Existing memberships di mitra=1 → upgrade role_id ke System-Admin
UPDATE user_mitras SET role_id = @system_admin_role
WHERE mitra_id = 1
  AND user_id IN (
    SELECT id FROM users
    WHERE username IN ('yoga', 'admin')
       OR name LIKE '%Mikhail Yazid Bustomi%'
       OR name LIKE '%Bah Yus%'
  );

-- 5. Downgrade System-Admin → Admin di membership non-mitra-1 (e.g. asaka_admin)
UPDATE user_mitras SET role_id = (SELECT id FROM roles WHERE name = 'Admin')
WHERE role_id = @system_admin_role
  AND mitra_id != 1;

-- 6. Downgrade users.role_id global untuk user yang bukan platform owner
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'Admin')
WHERE role_id = @system_admin_role
  AND username NOT IN ('yoga', 'admin')
  AND name NOT LIKE '%Mikhail Yazid Bustomi%'
  AND name NOT LIKE '%Bah Yus%';
```

**Post-migration verification** (logged ke console saat startup):
```sql
SELECT u.username, u.name, r.name AS role_at_mitra1
FROM users u
JOIN user_mitras um ON um.user_id = u.id AND um.mitra_id = 1
LEFT JOIN roles r ON r.id = um.role_id
WHERE r.name = 'System-Admin';
-- Expect 4 rows: yoga, admin, Mikhail Yazid Bustomi, Bah Yus
```

Kalau hasil < 4: log warning, tapi tetap proceed (mungkin ada user yang sudah dihapus). Kalau hasil > 4: log info nama-nama tambahan (legit kalau ada platform owner baru yang manually ditambahkan).

**Sweep code references** (sekitar 15 lokasi):
- `server/routes.ts` line 187, 607, 631, 667: `eff.roleName === "Administrator"` → `=== "System-Admin"`
- `seedDefaultRoles()` di `server/storage.ts`: tambah seed "Admin" role + rename "Administrator" → "System-Admin"
- `upgradePermissionsV412()` auto-grant logic: cari `name = "Administrator"` → `"System-Admin"`
- `client/pages/RolesPage.tsx`: hardcoded "Administrator" reference, badge styling
- Grep audit penuh: `grep -rn "Administrator" server/ client/ shared/` sebelum push.

---

## Permission Resolution Refactor

**New storage method** `getUserEffectivePermissionsAtMitra(userId, mitraId)` di `server/storage.ts`:

```ts
async getUserEffectivePermissionsAtMitra(
  userId: number,
  mitraId: number
): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }> {
  const cacheKey = `${userId}:${mitraId}`;
  const cached = getCachedPermsAtMitra(cacheKey);
  if (cached) return cached;

  // 1. Try per-membership role_id
  const [membership]: any = (await this.db.execute(sql`
    SELECT role_id FROM user_mitras WHERE user_id = ${userId} AND mitra_id = ${mitraId} LIMIT 1
  `))[0];
  let roleId = membership?.[0]?.role_id ?? null;

  // 2. Fallback ke users.role_id (global default)
  if (!roleId) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    roleId = u?.roleId ?? null;
  }

  if (roleId) {
    const role = await this.getRoleById(roleId);
    if (role) {
      let parsed: Record<string, PermissionLevel> = {};
      try { parsed = JSON.parse(role.permissions); } catch { parsed = {}; }
      const result = {
        perms: parsed,
        canSeeAllData: role.canSeeAllData === 1,
        roleName: role.name,
        isSystem: role.isSystem === 1,
      };
      setCachedPermsAtMitra(cacheKey, result);
      return result;
    }
  }

  // 3. Legacy fallback: users.role = "admin" text
  // ... (existing logic)
  return { perms: {}, canSeeAllData: false, roleName: null, isSystem: false };
}
```

**Cache** per-(userId, mitraId), TTL sama dengan existing (5 menit). Invalidate saat:
- User role di-update (any mitra)
- User_mitras row insert/delete/update
- Role permissions di-edit

**`authMiddleware` refactor** di `server/routes.ts:170-192`:
```ts
// Determine cross-tenant bypass: HANYA System-Admin di mitra=1
const ownerEff = await storage.getUserEffectivePermissionsAtMitra(user.id, 1);
const isSystemAdmin = ownerEff.roleName === "System-Admin";

// Permission for current active mitra
const eff = await storage.getUserEffectivePermissionsAtMitra(user.id, activeMitraId);
const legacyPerms = Object.keys(eff.perms).filter(k => eff.perms[k] === "read" || eff.perms[k] === "write");

req.authUser = {
  // ...existing fields
  roleName: eff.roleName,
  isSystemAdmin,
  canSeeAllData: eff.canSeeAllData,
  permLevels: eff.perms,
  // ...
};
```

**Behavioral matrix:**
| User | Role @ mitra=1 | Role @ ASAKA(3) | isSystemAdmin | Akses |
|---|---|---|---|---|
| yoga | System-Admin | - atau Admin | ✓ | Semua mitra |
| admin (default seed) | System-Admin | - | ✓ | Semua mitra |
| asaka_admin | (bukan member) | Admin | ✗ | Hanya ASAKA |
| user A baru di ASAKA, role Admin | (bukan member) | Admin | ✗ | Hanya ASAKA |
| Operator yoga di JABNET | Operator | - | ✗ | Hanya JABNET, terbatas |

---

## Mitra Members Tab UI

**Lokasi**: `client/pages/MitraPage.tsx` `MembersTab` (sekitar line 775).

**Current**: Add user dropdown + flat list anggota tanpa role context.

**New row layout**:
```
[Avatar] Nama (username)   [Role: <select> ▼]   [Primary  kalau true]   [Hapus]
```

- Role selector di tiap row → `PATCH /api/mitras/:mitraId/members/:userId` body `{ roleId }`
- Dropdown filter: kalau active mitra=1, semua role tersedia. Kalau active mitra≠1, role "System-Admin" disabled (greyed-out + tooltip "Cross-tenant - hanya untuk JABNET").
- Hanya `isSystemAdmin` yang bisa grant role "System-Admin" (mencegah Admin di mitra lain self-promote dengan abuse endpoint).

**Add member flow**:
```
[Dropdown: pilih user]  [Dropdown: pilih role (default: Admin)]  [Tambah]
```

**Backend endpoints**:
- `PATCH /api/mitras/:mitraId/members/:userId` - update `user_mitras.role_id`.
  - Guard: `requireSystemAdmin` OR (`hasPermission('mitra_admin', 'write')` di mitra yang sama).
  - Block: refuse demote terakhir System-Admin di mitra=1.
  - Body: `{ roleId: number }`
- `POST /api/mitras/:mitraId/members` - extend existing endpoint body `{ userId, roleId?, isPrimary? }`. Default `roleId` = ID role "Admin" kalau tidak provided.

**Info banner update** di MembersTab (sudah ada dari Part A) → revise text:
>  **Tips:** Setiap mitra wajib punya minimal 1 user dengan role **Admin** sebagai entry point. Khusus mitra **JABNET** (mitra=1), role yang dimaksud adalah **System-Admin** (akses cross-tenant).

---

## Create-Mitra Wizard

**Lokasi**: `client/pages/MitraPage.tsx` create dialog (existing POST `/api/mitras`).

**Step 1: Detail Mitra** (existing fields, tidak diubah)
- Nama, Slug (kebab-case), Display Name, Logo URL, Contact info, Features toggle

**Step 2: Akun Administrator** (NEW - **WAJIB diisi**, no skip)
```
ℹ Setiap mitra wajib punya 1 Admin sebagai entry point.

Username:  [______________]  *  (auto-suggest dari slug, e.g. asaka → asaka_admin)
Nama:      [______________]  *
Email:     [______________]  (opsional)
Phone:     [______________]  (opsional, untuk MPWA OTP)
Password:  [______________]  *  (min 8 chars)
Confirm:   [______________]  *
```

**Username auto-suggest**: pre-populate field dengan `<slug>_admin` saat user move dari step 1 ke step 2. User boleh ubah (e.g. `asaka_owner`, `john_admin`). Validation: unique check live.

**Validation** (frontend + backend):
- Username required, unique (existing `users.username` constraint)
- Password required, min 8 chars, hashed bcrypt cost 10
- Password confirm match
- Step 2 tidak bisa di-submit kalau ada validation error

**Backend transactional flow** - extend `POST /api/mitras`:
```ts
// Body extended:
// {
//   ...existing mitra fields,
//   admin?: { username, name, email?, phone?, password }
// }

const conn = await pool.getConnection();
await conn.beginTransaction();
try {
  // 1. Insert mitra → mitraId
  // 2. seedMitraIntegrationDefaults(mitraId)
  // 3. ensureMitraDirs(slug)  // dari plan filesystem photo storage (kalau sudah merged)
  // 4. WAJIB body.admin (validation di backend juga, double-check):
  //    a. bcrypt hash password
  //    b. INSERT users { username, name, password_hash, role_id=NULL, is_active=1, active_mitra_id=mitraId }
  //    c. INSERT user_mitras { user_id, mitra_id, is_primary=1, role_id=<Admin role id> }
  // 5. Commit
} catch { rollback; throw; }
```

**No skip** - backend reject 400 kalau `body.admin` tidak ada atau invalid. Mitra TIDAK boleh dibuat tanpa Admin user.

**Frontend changes**:
- Create dialog refactor jadi 2-step pakai `<Tabs>` atau wizard pattern dengan next/back button
- State: `step` (1 atau 2), validation per step sebelum next
- Submit di step 2: kirim 1 POST dengan combined body `{ ...mitraFields, admin: { ... } }`

**Tidak include billing password reuse** - sesuai keputusan user, password admin disimpan hashed di `users.password` saja. Integration billing API credentials tetap input terpisah di `/integrations`.

---

## Verification

**Automated (pre-deploy)**:
1. `npm run typecheck` → 0 errors
2. `npm run build` → bundle sukses
3. Schema migration idempotent: ALTER + UPDATE jalan 2x tanpa error

**Manual (post-deploy)**:

| # | Skenario | Expected |
|---|---|---|
| 1 | Login yoga → /mitra | Tampil semua mitra. Switcher bisa pindah. |
| 2 | yoga switch ke ASAKA → /customers | Customers ASAKA only, full write access. |
| 3 | asaka_admin → /mitra | 403 atau redirect (requireSystemAdmin). |
| 4 | asaka_admin → /customers | Customers ASAKA only. Edit boleh. |
| 5 | asaka_admin switcher API hack ke mitra=1 | Backend reject via `isUserMemberOfMitra(asaka_admin, 1)=false`, fallback ke active=3. |
| 6 | asaka_admin → /users | Users mitra ASAKA only. |
| 7 | asaka_admin → /integrations | Settings ASAKA only. JABNET data invisible. |
| 8 | Create mitra "TEST" + admin `test_admin/Test@1234` via wizard | Mitra+user+membership created in transaction. |
| 9 | Logout, login `test_admin` | Active mitra=TEST. Empty data. JABNET/ASAKA invisible. |
| 10 | asaka_admin assign role "System-Admin" di Members tab | Dropdown disabled atau backend reject 403. |
| 11 | Role change → next request | Cache invalidate kicks in, permission ter-update. |

**Edge cases:**

| Case | Handling |
|---|---|
| User dipromote saat login | Cache invalidate `userId:activeMitraId`. Next request pakai role baru. |
| Member di-remove dari mitra sementara active | authMiddleware existing check `isUserMemberOfMitra` → fallback primary lain. |
| Hanya 1 System-Admin tersisa, demote attempt | Backend refuse: "Minimal 1 System-Admin di JABNET wajib ada." |
| Create mitra skip step 2 | Mitra terbuat, banner warning di list. |
| Username admin duplikat | Pre-validate, 400 inline error di form. |
| String compare `"Administrator"` masih ada di code lain | Grep audit pre-push sweep semua. |

---

## Rollback

- ALTER + INSERT migration idempotent - re-run safe
- Schema change additive (`user_mitras.role_id` nullable) - code lama abaikan kolom
- Full rollback SQL:
  ```sql
  UPDATE roles SET name='Administrator' WHERE name='System-Admin';
  DELETE FROM roles WHERE name='Admin';
  -- Code revert + re-deploy
  ```
- Tidak data loss (semua additive).

---

## Out of Scope

- **Billing password reuse** (`integrations` credential = admin password) - sesuai pilihan user, integrasi billing tetap input terpisah
- **Drop `users.role_id` legacy column** - defer, masih useful untuk display dan fallback
- **Per-mitra role catalog** (mitra punya role custom sendiri) - defer, semua role shared di global roles table
- **`/roles` page filter by mitra ownership** - defer, semua user lihat semua role definitions (read-only)
- **System-Admin demote protection cascading** (e.g. minimum 2 system-admin di sistem) - defer, hanya minimum 1
- **Audit log untuk role grant/revoke** - defer (existing audit log infra cover ini secara general)

---

## Files Affected

| File | Change |
|---|---|
| `shared/schema.ts` | + `userMitras.roleId` column |
| `server/storage.ts` | + `getUserEffectivePermissionsAtMitra()`, cache split, `seedDefaultRoles` extend, ALTER block, backfill SQL |
| `server/routes.ts:170-205` | authMiddleware refactor (2 calls to `getUserEffectivePermissionsAtMitra`) |
| `server/routes.ts:187, 607, 631, 667` | rename `"Administrator"` → `"System-Admin"` string compare |
| `server/routes.ts` (mitra members endpoints) | + `PATCH /api/mitras/:mitraId/members/:userId`, extend POST body untuk roleId |
| `server/routes.ts:750-830` POST `/api/mitras` | transactional admin user creation block |
| `client/pages/MitraPage.tsx` MembersTab | role selector per row, disabled state untuk System-Admin di non-mitra-1, banner update |
| `client/pages/MitraPage.tsx` create dialog | 2-step wizard refactor |
| `client/pages/RolesPage.tsx` | sweep "Administrator" string, badge styling untuk System-Admin |
| `client/pages/UsersPage.tsx` | display "Role di mitra primary" - sweep "Administrator" |

---

## Related

- [[project-cpanel-deployment]] - production deploy flow
- [[feedback-credentials-in-db]] - credentials in DB plain-text OK (relevant kalau wizard simpan password)
- Part A predecessor: `docs/superpowers/specs/2026-05-26-mitra-members-bug-fix.md`
