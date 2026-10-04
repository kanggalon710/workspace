# STATE - JABNET Workspace
Updated: 2026-10-05 by Claude Fable 5 (Claude Code)

## What this is
Operational platform for JABNET FTTH. Backend: Node 20, Express 5, Drizzle/MySQL.
Frontend: React 18, Vite, Tailwind, shadcn/ui. Multi-tenant staff workspace plus public
coverage page and customer portal. Architecture and MySQL patterns are in `CLAUDE.md`.

## Run and verify
```bash
npx tsc --noEmit
npx tsx --test shared/*.test.ts server/*.test.ts   # 488 tests
npm run build
npm run dev
```
Deploy follows `WORKFLOW.md` (dev URL is `workspace-dev.jabnet.id` - fixed, was stale).
Never deploy production without explicit user approval.

## Works
- Branch `feature/audit-remediation-20261004` (from `origin/dev` @ 1b5425e) holds the FULL
  remediation of the 2026-10-04 audit: security (admin seed, sessions, OTP enumeration,
  dev/db-sync authz), performance (query-in-loop batching), SEO (robots/sitemap/noindex/404),
  a11y/responsive (coverage + map overlays, single h1, pinch-zoom), validated env boundary,
  npm audit fix (16 -> 6 advisories). Details: `.ai/PROGRESS.md` top entry + `.ai/TODO.md`.
- All gates green on the branch: typecheck 0, 488/488 tests, build OK. Live-verified locally
  (prod bundle + scratch MySQL container) incl. headless-Chrome checks at 360/768/1280.
- Fresh install now REQUIRES `ADMIN_DEFAULT_PASSWORD` env (server exits otherwise); default
  admin username is `chief0012` (env-overridable). No hardcoded password anywhere.

## In progress
Branch needs: PR -> `dev`, CI builds `deploy-dev`, cPanel DEV pull + restart, then the
dev-environment verification round on `https://workspace-dev.jabnet.id` (staff login/logout,
OTP uniformity, robots/sitemap/404, console). Local verification already done.

## Blocked, needs a human
- cPanel DEV "Update from Remote" + Restart after the dev merge (owner action), unless the
  in-app Pembaruan Aplikasi is used on workspace-dev.
- Production deploy of all of this: explicit owner approval required.
- IMPORTANT for dev/prod env: portal OTP debug is now gated - set `OTP_DEV_EXPOSE=true` ONLY
  on local dev. MPWA-disabled tenants NO LONGER return the OTP in responses (that was an
  account-takeover hole, closed on purpose).

## Traps
1. `shared/routesManifest.ts` must list every SPA route in `client/App.tsx`; unlisted paths
   are served with real HTTP 404 by the server catch-all (SPA still renders).
2. verify-otp now takes `{customerId, code}`; legacy `otpSessionId` body is a 1-release
   fallback - remove it next release.
3. `express-session` is GONE (was dead code). Do not reintroduce without a real `req.session`
   consumer. Staff cookie auth = `ftth_session` (routes.ts), portal = DB tokens.
4. Rate-limit keys use `req.ip` behind `trust proxy` (1 hop in prod, see `server/env.ts` /
   TRUST_PROXY). Don't parse X-Forwarded-For manually again.
5. Multi-row insert pattern: `chunkArray` (shared/batch.ts) + `conn.query("... VALUES ?")`.
   Pipeline-intake card INSERT deliberately stays per-row (masterCardId self-ref, see comment).
6. Remaining 6 npm advisories all need semver-major (drizzle-orm 0.45.3 SQLi fix + tailwind
   v4 chain) - deferred with owner approval, see TODO + DECISIONS.

## Recently touched
- See `.ai/PROGRESS.md` 2026-10-05 entry for the full file list (server security/perf core,
  coverage/map/portal client, shared pure modules + tests, docs). By Claude Fable 5.
