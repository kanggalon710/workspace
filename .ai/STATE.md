# STATE - JABNET Workspace
Updated: 2026-10-06 by Claude Fable 5 (Claude Code)

## What this is
Operational platform for JABNET FTTH. Backend: Node 20, Express 5, Drizzle/MySQL.
Frontend: React 18, Vite, Tailwind, shadcn/ui. Multi-tenant staff workspace plus public
coverage page and customer portal. Architecture and MySQL patterns are in `CLAUDE.md`.

## Run and verify
```bash
npx tsc --noEmit
npx tsx --test shared/*.test.ts server/*.test.ts   # 496 tests
npm run build
npm run dev
```
Local DB: `.env` points at `jabnet_fiber_v2_dev` on 127.0.0.1:3306 but those credentials
are REJECTED by the host MariaDB (pre-existing). Working local pattern: scratch MySQL 8
container on port 3307 + env overrides (`DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root
DB_PASSWORD=root DB_NAME=jabnet_fiber`), `npm run db:push` once, then `npm run dev`.
Deploy follows `WORKFLOW.md` (dev URL `workspace-dev.jabnet.id`). Never deploy
production without explicit user approval.

## Works
- Everything from the 2026-10-05 audit remediation (see PROGRESS) - live on workspace-dev.
- NEW (2026-10-06, local working tree on branch `main`, NOT yet committed):
  **Collection Mitra** - monthly payment tracking of partner ISPs (mitras) by JABNET root.
  Kanban at `/collections/mitra` (permission `collections_mitra`, root tenant only,
  server-enforced). Cards auto-created per active mitra per month (lazy on GET + nightly
  billing-sync hook), amount entered manually with prev-period prefill, fixed stages
  belum_bayar/dihubungi/janji_bayar/lunas/menunggak, activity log, WA CTA.
  All gates green: typecheck 0, 496/496 tests, build OK, live-verified on scratch MySQL +
  headless Chromium at 360/768/1280 (clean console, no overflow, 403 for non-root tenants).

## In progress
Nothing running. Next step: commit the Collection Mitra work (await user direction on
branch/commit) - the working tree holds it uncommitted on local `main`.

## Blocked, needs a human
- Commit/push/deploy of Collection Mitra: user decision (repo rule: no production deploy
  without explicit OK; local `main` differs from remote flow dev->main->deploy).
- Production promote reminders from 2026-10-05 entry still apply (no OTP_DEV_EXPOSE in
  prod, TRUST_PROXY default fine).

## Traps
1. `shared/routesManifest.ts` must list every SPA route in `client/App.tsx` (a drift-guard
   test fails otherwise and the server serves real 404 for unlisted paths).
2. "mitra" in schema = TENANT. The billed partner in `mitra_collections` is
   `subject_mitra_id`; the `mitra_id` column stays the owner-tenant convention (always 1).
   Never reuse the word "reseller" - `resellers = mitras` is a legacy alias.
3. Collection Mitra stages are FIXED constants in `shared/mitraCollection.ts` (no stage
   table, no Pipeline Manager) - deliberate YAGNI, see DECISIONS if that changes.
4. TEXT columns (repo convention for dates) cannot be part of a MySQL index - the
   mitra_collection_activities index is collection_id only for that reason.
5. verify-otp takes `{customerId, code}`; legacy `otpSessionId` fallback removal is due
   next release.
6. Remaining 6 npm advisories need semver-majors - deferred with owner approval (TODO).

## Recently touched
See `.ai/PROGRESS.md` 2026-10-06 entry (Collection Mitra) for the full file list.
By Claude Fable 5 (Claude Code).
