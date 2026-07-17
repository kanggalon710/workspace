# Spec — Scheduled Daily Billing Sync (auto-staggered per mitra)

> **Date:** 2026-06-03
> **Status:** Approved design, ready for implementation plan.

## Problem

Billing sync in prod is manual-only today (`WORKERS_ENABLED=false`, per memory
`reference-prod-billing-sync-manual`): data from `billing.jabnet.id` only refreshes
when an admin clicks "Sync Now". We want an unattended **daily sync at 03:00 WIB**
for **all active mitras**.

Because the billing API has rate limits, mitras must not all hit it at once — they
must be **staggered** (mitra A at 03:00, mitra B at 03:10, mitra C at 03:20, …).
The staggering must be **fully automatic**: adding or removing a mitra must require
**zero changes** from the user (no editing cron lines). 2 mitras → 03:00, 03:10;
4 mitras → 03:00, 03:10, 03:20, 03:30 — recomputed each night.

## Decisions (from brainstorming)

- **Schedule:** 03:00 WIB. Server is UTC, so cron hour = `0 20 * * *` (20:00 UTC).
- **Trigger model:** single daily cron → secret-authed HTTP endpoint → in-app
  background staggered sequence. (Chosen over per-mitra cron lines specifically
  because the user wants zero-maintenance auto-scaling to new mitras.)
- **Stagger interval:** 10 minutes between mitras.
- **`WORKERS_ENABLED=false` stays untouched** — the existing adaptive in-app worker
  scheduler remains off in prod. This feature is additive and external-cron-driven,
  consistent with the existing mirror + keep-alive cron ops model.

## Architecture

### Flow

```
cron  0 20 * * *  (03:00 WIB / 20:00 UTC)
  └─> POST https://fiber.jabnet.id/api/billing/sync/cron   (X-Cron-Secret header)
        └─> billingSyncWorker.runStaggeredAllMitras(staggerMs = 600_000)
              ├─ list active mitras at fire time
              ├─ computeStaggerSchedule(mitras, staggerMs) -> [{mitraId, slug, delayMs}]
              ├─ for each: setTimeout(() => withMitra(id, () => runOnce()), delayMs)
              └─ return schedule plan  (HTTP 200, also logged)
```

`fiber.jabnet.id` is confirmed as the cPanel prod app (the existing `*/4 * * * *`
keep-alive pings `https://fiber.jabnet.id/api/health`).

### Components

**1. `computeStaggerSchedule(mitras, staggerMs)` — pure helper**
- Input: array of active mitra `{id, slug}` (in list order), stagger in ms.
- Output: `[{mitraId, slug, delayMs}]` where `delayMs = index * staggerMs`.
- Pure and deterministic → unit-testable. No timers, no I/O.
- Empty input → empty output.

**2. `BillingSyncWorker.runStaggeredAllMitras(staggerMs = 600_000)`**
- Reject if a batch is already active (`cronBatchActive` in-memory flag) → return
  `{started: false, reason: "batch already in progress"}`.
- `const mitras = await storage.listMitras(false)` (active only).
- `const schedule = computeStaggerSchedule(mitras, staggerMs)`.
- For each entry: `setTimeout(() => withMitra(id, () => this.runOnce()).catch(log), delayMs)`.
  Reuses the existing per-mitra sync path verbatim (`runOnce` sees a caller mitra
  context → single-pass for that mitra; same code as "Sync Now").
- Set `cronBatchActive = true`; clear it after the last entry's run completes (or via
  a final `setTimeout` at `lastDelayMs + safety margin`).
- Return `{started: true, staggerMin, scheduled: [{mitraId, slug, fireInMin}]}`.
- Log each mitra's scheduled offset on dispatch, and start/finish per mitra (reuse
  existing `runOnce` logging).

**3. `POST /api/billing/sync/cron` — endpoint**
- No user session. Auth: compare `req.header("X-Cron-Secret")` to
  `process.env.BILLING_SYNC_CRON_TOKEN`.
  - Token env unset → 503 `{error: "cron token not configured"}`.
  - Header missing/mismatch → 403.
- On success: call `runStaggeredAllMitras()`, respond 200 with the schedule plan.
- Mounted on the main staff `router`. Not blocked by the portal-host middleware
  (prod is served on `fiber.jabnet.id`, not a portal host).
- No rate limiter needed (single daily caller; in-memory `cronBatchActive` guards
  accidental double-curl).

**4. Env var `BILLING_SYNC_CRON_TOKEN`**
- Added to `.env.example` with a comment.
- Set in prod `.env` (`JABNET_PRIVATE_ROOT/config/.env`). Per
  `feedback-credentials-in-db`, plain-text secret in env is fine.

**5. Cron line (prod, added via cPanel Cron Jobs / crontab)**
```
0 20 * * * /usr/bin/curl -s -X POST -H "X-Cron-Secret: <TOKEN>" "https://fiber.jabnet.id/api/billing/sync/cron" >> /home/jabnet/logs/billing-sync.log 2>&1
```

## Why fire-and-forget is safe on Passenger

Passenger keeps the Node process alive (long-running, not request-scoped), and the
`*/4 * * * *` keep-alive cron prevents idle spin-down — so background `setTimeout`s
across the ~N×10-min window survive. This is the same mechanism the existing
boost-expire (60s), SLA-escalation (5m), and CSAT (10m) timers rely on.

**Only loss case:** process restart mid-window (rare nightly deploy/crash) → that
day's *remaining* mitras skip until the next night. Manual "Sync Now" remains
available. Acceptable for a nightly job.

## Testing

- Unit-test `computeStaggerSchedule`:
  - 1 mitra → `[{delayMs: 0}]`.
  - 2 mitras → offsets `0, 600_000`.
  - 4 mitras → `0, 600_000, 1_200_000, 1_800_000`.
  - empty → `[]`.
  - custom staggerMs respected.
- Endpoint token auth: 503 when env unset, 403 missing/wrong header, 200 valid.
- Timer execution is **not** unit-tested (it wraps the already-working `runOnce`).
- `npm run typecheck` → 0 errors. `npm run build` → success.

## Ordering note (informational, no action)

Sync at 03:00 WIB runs ~6h *before* the mirror at 09:00 WIB (`0 2` UTC), so dev
picks up each day's fresh sync. If the mirror is later moved to true 02:00 WIB
(`0 19`), dev would lag one day on sync. Minor — noted only for awareness.

## Out of scope

- Changing the existing adaptive in-app worker / `WORKERS_ENABLED` behavior.
- Per-mitra sync status settings — stays global (last-writer-wins) as today.
- Persistent per-day idempotency — single daily cron + in-memory guard is enough.
- A UI to configure schedule/stagger — env + cron is sufficient for now.

## Consistency with memory

- `reference-prod-billing-sync-manual` — prod stays manual/external-driven; this adds
  an external cron trigger, does **not** flip `WORKERS_ENABLED`.
- `reference-tenant-isolation-gotchas` — each mitra sync wrapped in `withMitra`;
  reuses `runOnce` which already establishes per-mitra context correctly.
- `feedback-credentials-in-db` — cron secret in env plain-text is acceptable.
- `reference-dev-environment-cpanel` — cron added on prod; dev gets data via mirror.
