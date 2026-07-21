# Spec - Mitra Members Bug Fix + Help Text

**Date**: 2026-05-26
**Status**: Approved
**Scope**: Bug fix (Part A of 3-part mitra cleanup). Part B (authorization scoping) and Part C (create-mitra wizard) akan jadi spec terpisah.

## Bug

`GET /api/mitras/:id` di `server/routes.ts` line ~764 selalu mengembalikan `members: []` walaupun data ada di `user_mitras`. Root cause: SQL SELECT references `u.last_login_at AS lastLoginAt`, tapi kolom di tabel `users` bernama `last_login` (TEXT). Query throw `Unknown column 'u.last_login_at'`, di-catch oleh try/catch di line ~774 yang console.warn dan mengembalikan array kosong. Frontend `MembersTab` render empty state "Belum ada anggota" walaupun di prod cPanel sudah ada 19 user di mitra=1, 2 user di mitra=2, dan 5 user di mitra=3.

## Fix

**Backend** - `server/routes.ts:765`:
```sql
-- before
u.is_active AS isActive, u.last_login_at AS lastLoginAt,
-- after
u.is_active AS isActive, u.last_login AS lastLoginAt,
```

**Frontend** - `client/pages/MitraPage.tsx`, di komponen `MembersTab` (line ~775), tambah info banner singkat DI ATAS dropdown Add Member, visible hanya saat `canEdit`:

>  **Tips:** Pastikan setiap mitra punya **minimal 1 user dari JABNET dengan role Administrator** sebagai entry point - biar mereka bisa kelola data + tambah user lain. Mitra baru tidak bisa diakses kalau belum ada admin assigned.

Styling: `Card bg-violet-50/30 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800/50 p-3 rounded-lg`, icon `Info` (sudah ter-import dari lucide-react), `text-xs`.

## Out of Scope

- **Authorization scoping** (`isSystemAdmin` cross-tenant problem) - akan dibahas terpisah sebagai Spec B
- **Wizard create mitra dengan akun Administrator otomatis** - akan dibahas terpisah sebagai Spec C
- Restructure `MembersTab` lain (tampil role, status online, dll) - defer

## Verification

1. `npx tsc --noEmit` → 0 errors
2. `npm run build` → sukses
3. Manual: login admin → `/mitra` → edit mitra ASAKA (id=3) → tab Anggota → expected: 5 anggota tampil (admin, yoga, goblogbantuan002, asaka_admin sebagai is_primary, dst)
4. Manual: edit mitra baru tanpa anggota → expected: help text + empty state "Belum ada anggota"
5. Test mitra=1 (JABNET) → 19 anggota tampil

## Risk

Negligible - 1-character SQL fix + additive UI banner. Tidak ada schema change.
