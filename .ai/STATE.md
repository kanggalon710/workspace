# STATE - JABNET Workspace
Updated: 2026-10-04 by Codex (GPT-5)

## What this is
Operational platform for JABNET FTTH. Backend: Node 20, Express 5, Drizzle/MySQL.
Frontend: React 18, Vite, Tailwind, shadcn/ui. Multi-tenant staff workspace plus public
coverage and customer portal routes. Architecture and MySQL patterns are in `CLAUDE.md`.

## Run and verify
```bash
npx tsc --noEmit
npx tsx --test shared/*.test.ts
npm run build
npm run dev
```
Deploy follows `WORKFLOW.md`: feature -> dev -> main -> CI-built deploy branch. Never deploy
production without explicit user approval.

## Works
- `main`, `origin/main`, `dev`, and `origin/dev` all point to `1b5425e` as of 2026-10-04.
- PIC/assignee multi-filter is merged and previously confirmed in dev; production deploy is pending.
- Typecheck passed, 303 shared tests passed, and production build passed on 2026-10-04.
- Public `/coverage-check` rendered without horizontal overflow at 360, 768, and 1280 px in
  a real browser; browser console had no warnings/errors in that static local preview.

## In progress
No implementation is in progress. A read-only audit on 2026-10-04 found actionable security,
performance, accessibility/responsive, SEO, DRY, and type-safety debt recorded at the top of
`.ai/TODO.md`. Fixes were deliberately not made because the request was an audit, not remediation.

## Blocked, needs a human
- Dependency advisory status is unverified: `npm audit --omit=dev --json` could not establish
  a TLS connection to the npm advisory endpoint.
- Production deployment items in `.ai/TODO.md` still require explicit approval.

## Traps
1. `server/routes.ts` and `server/storage.ts` are both over 16k lines; do not split them casually.
2. `/api/dev/db-sync` is registered before `authMiddleware`, so its permission check cannot see
   `req.authUser` and the route cannot authorize while enabled (`server/routes.ts:179`).
3. First-run admin seeding has a known-password fallback (`server/storage.ts:10934`). Remove the
   fallback before any fresh install; require an environment-provided secret instead.
4. Production session cookies currently set `secure: false`, and the error handler returns raw
   exception messages (`server/index.ts:51-60`, `server/index.ts:117-120`).
5. Public coverage has two `h1` elements and undersized mobile inputs/controls; map camera controls
   intentionally shrink to 28px through forbidden `max-md:` classes.

## Recently touched
- `.ai/STATE.md`, `.ai/PROGRESS.md`, `.ai/TODO.md` by Codex (GPT-5), 2026-10-04 (audit handoff only).
- No application source files changed in the 2026-10-04 audit.
