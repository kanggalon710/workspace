# Public API Finance + Subscriber + Executive Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose aggregate revenue/billing, subscriber-base, and a one-shot executive report to the Public API (`/api/public/v1/*`) so AI can build daily→quarterly reports.

**Architecture:** New `kpi_snapshots` table written lazily (no worker — prod workers disabled) accumulates daily KPIs for MRR/subscriber trends; point-in-time + activation/recovery trends derive directly from `customers.install_date` and `collections` timestamps. Pure period-bucketing / delta / flag logic lives in a new isolated `server/reporting-helpers.ts` (unit-tested); DB aggregation lives in `server/storage.ts`; thin handlers in `server/public-api-routes.ts`. All endpoints tenant-scoped via `getMitraId()` and aggregate-only (no PII).

**Tech Stack:** Node 20 + Express 5 + Drizzle ORM (MySQL) + `tsx`/esbuild. Tests via `node:test` run with `tsx --test`. Spec: `docs/superpowers/specs/2026-06-02-public-api-finance-customers-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/schema.ts` (modify) | Add `kpiSnapshots` table + `KpiSnapshot` type |
| `server/reporting-helpers.ts` (create) | Pure logic: `Period` type, `computePeriodBuckets`, `assignCountToBuckets`, `lastValueInBuckets`, `deltaPct`, `buildExecutiveFlags`. No DB, no I/O. |
| `server/reporting-helpers.test.ts` (create) | `node:test` unit tests for every pure helper |
| `server/storage.ts` (modify) | `kpi_snapshots` startup migration + 7 methods: `ensureKpiSnapshotForToday`, `getFinanceOverview`, `getCustomersOverview`, `getFinanceTimeseries`, `getCustomersTimeseries`, `getCollectionsFinance`, `getExecutiveReport` |
| `server/public-api-routes.ts` (modify) | 2 new scopes + 6 endpoints + `/schema` doc entries |
| `client/pages/PublicApiPage.tsx` (modify) | Add `finance:read` + `customers:read` to `ALL_SCOPES` |

Convention reminders (from existing code):
- Tenant scope: `const mitraId = getMitraId();` then `eq(table.mitraId, mitraId)` (Drizzle) or `WHERE mitra_id = ${mitraId}` (raw `sql`).
- Raw query: `const [rows]: any = await this.db.execute(sql\`...\`);` — returns `[rows, fields]`.
- Public handler returns raw `res.json({...})`; on error `res.status(500).json({ error: "internal", message: e.message })`.
- MySQL migration idempotency: catch errno 1060 (dup column) / 1061 (dup index); `CREATE TABLE IF NOT EXISTS`.

---

## Task 1: Add `kpi_snapshots` schema

**Files:**
- Modify: `shared/schema.ts` (add table near other tables; add `bigint` to the `drizzle-orm/mysql-core` import if absent)

- [ ] **Step 1: Add the table + type**

Find the `mysql-core` import line (e.g. `import { mysqlTable, int, text, varchar, ... } from "drizzle-orm/mysql-core";`) and ensure `bigint` is included. Then add after the `collectionStages` table:

```ts
export const kpiSnapshots = mysqlTable("kpi_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  snapshotDate: varchar("snapshot_date", { length: 10 }).notNull(), // YYYY-MM-DD local
  activeCount: int("active_count").notNull().default(0),
  isolirCount: int("isolir_count").notNull().default(0),
  totalCount: int("total_count").notNull().default(0),
  mrr: bigint("mrr", { mode: "number" }).notNull().default(0),
  arpu: int("arpu").notNull().default(0),
  revenueAtRisk: bigint("revenue_at_risk", { mode: "number" }).notNull().default(0),
  newActivations: int("new_activations").notNull().default(0),
  collectionsOpen: int("collections_open").notNull().default(0),
  collectionsClosedToday: int("collections_closed_today").notNull().default(0),
  outstandingAmount: bigint("outstanding_amount", { mode: "number" }).notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export type KpiSnapshot = typeof kpiSnapshots.$inferSelect;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors (the table is defined but not yet used — that's fine).

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(schema): add kpi_snapshots table for finance/subscriber trends"
```

---

## Task 2: Pure helper — `computePeriodBuckets` (TDD)

**Files:**
- Create: `server/reporting-helpers.ts`
- Create: `server/reporting-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/reporting-helpers.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePeriodBuckets } from "./reporting-helpers.ts";

const NOW = new Date("2026-06-02T10:00:00"); // fixed anchor for determinism

test("monthly: default 12 calendar-month buckets ending current month", () => {
  const b = computePeriodBuckets("monthly", undefined, undefined, NOW);
  assert.equal(b.length, 12);
  assert.equal(b[11].key, "2026-06");
  assert.equal(b[0].key, "2025-07");
  // boundaries: bucket end is exclusive start of next bucket
  assert.equal(new Date(b[11].start).getMonth(), 5); // June = month 5
});

test("quarterly: default 8 buckets, current quarter last", () => {
  const b = computePeriodBuckets("quarterly", undefined, undefined, NOW);
  assert.equal(b.length, 8);
  assert.equal(b[7].key, "2026-Q2"); // Jun = Q2
});

test("daily: default 30 day buckets ending today", () => {
  const b = computePeriodBuckets("daily", undefined, undefined, NOW);
  assert.equal(b.length, 30);
  assert.equal(b[29].key, "2026-06-02");
});

test("weekly: default 12 rolling 7-day buckets", () => {
  const b = computePeriodBuckets("weekly", undefined, undefined, NOW);
  assert.equal(b.length, 12);
  // last bucket ends after NOW
  assert.ok(new Date(b[11].end).getTime() > NOW.getTime());
});

test("explicit from/to monthly clamps to range", () => {
  const b = computePeriodBuckets("monthly", "2026-01-01", "2026-03-31", NOW);
  assert.deepEqual(b.map((x) => x.key), ["2026-01", "2026-02", "2026-03"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `tsx --test server/reporting-helpers.test.ts`
Expected: FAIL — `Cannot find module './reporting-helpers.ts'` / `computePeriodBuckets is not a function`.

- [ ] **Step 3: Implement**

Create `server/reporting-helpers.ts`:

```ts
export type Period = "daily" | "weekly" | "monthly" | "quarterly";

/** A time bucket. `start`/`end` are ISO strings; range is [start, end). */
export interface Bucket {
  key: string;
  start: string;
  end: string;
}

const DEFAULT_COUNT: Record<Period, number> = { daily: 30, weekly: 12, monthly: 12, quarterly: 8 };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Build contiguous buckets ending at `to` (or `now`), going back either
 * DEFAULT_COUNT[period] buckets, or enough to cover `from` when given.
 */
export function computePeriodBuckets(period: Period, from?: string, to?: string, now: Date = new Date()): Bucket[] {
  const anchor = to ? new Date(to) : now;
  const buckets: Bucket[] = [];

  // Produce one bucket descriptor for the period containing `d`.
  const bucketOf = (d: Date): Bucket => {
    if (period === "daily") {
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const e = new Date(s); e.setDate(e.getDate() + 1);
      return { key: dayKey(s), start: s.toISOString(), end: e.toISOString() };
    }
    if (period === "weekly") {
      // rolling 7-day window aligned so the window CONTAINS `d`, ending at d+1day boundaries stepped by 7
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const e = new Date(s); e.setDate(e.getDate() + 7);
      return { key: dayKey(s), start: s.toISOString(), end: e.toISOString() };
    }
    if (period === "monthly") {
      const s = new Date(d.getFullYear(), d.getMonth(), 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      return { key: `${s.getFullYear()}-${pad(s.getMonth() + 1)}`, start: s.toISOString(), end: e.toISOString() };
    }
    // quarterly
    const q = Math.floor(d.getMonth() / 3);
    const s = new Date(d.getFullYear(), q * 3, 1);
    const e = new Date(d.getFullYear(), q * 3 + 3, 1);
    return { key: `${s.getFullYear()}-Q${q + 1}`, start: s.toISOString(), end: e.toISOString() };
  };

  const step = (d: Date): Date => {
    const x = new Date(d);
    if (period === "daily") x.setDate(x.getDate() - 1);
    else if (period === "weekly") x.setDate(x.getDate() - 7);
    else if (period === "monthly") x.setMonth(x.getMonth() - 1);
    else x.setMonth(x.getMonth() - 3);
    return x;
  };

  const fromTime = from ? new Date(from).getTime() : null;
  const maxCount = fromTime === null ? DEFAULT_COUNT[period] : 240; // safety cap
  let cursor = anchor;
  for (let i = 0; i < maxCount; i++) {
    const b = bucketOf(cursor);
    buckets.unshift(b);
    if (fromTime !== null && new Date(b.start).getTime() <= fromTime) break;
    cursor = step(new Date(new Date(b.start).getTime())); // move into previous bucket
  }
  // When a range is given, drop buckets fully before `from`.
  return fromTime === null ? buckets : buckets.filter((b) => new Date(b.end).getTime() > fromTime);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `tsx --test server/reporting-helpers.test.ts`
Expected: PASS (5 tests). If weekly alignment differs, adjust the test's structural assertions (length + last.end > NOW) — keep them structural, not date-exact.

- [ ] **Step 5: Commit**

```bash
git add server/reporting-helpers.ts server/reporting-helpers.test.ts
git commit -m "feat(reporting): pure period-bucketing helper + tests"
```

---

## Task 3: Pure helpers — bucket aggregation + `deltaPct` (TDD)

**Files:**
- Modify: `server/reporting-helpers.ts`
- Modify: `server/reporting-helpers.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `server/reporting-helpers.test.ts`:

```ts
import { assignCountToBuckets, lastValueInBuckets, deltaPct } from "./reporting-helpers.ts";

const NOW2 = new Date("2026-06-02T10:00:00");

test("assignCountToBuckets counts items per bucket by timestamp", () => {
  const buckets = computePeriodBuckets("monthly", "2026-04-01", "2026-06-30", NOW2);
  const items = [
    { t: "2026-04-10" }, { t: "2026-04-20" }, { t: "2026-06-01" },
    { t: "1900-01-01" }, // out of range -> ignored
  ];
  const out = assignCountToBuckets(items, (i) => i.t, buckets);
  assert.deepEqual(out.map((x) => x.value), [2, 0, 1]); // Apr=2, May=0, Jun=1
});

test("lastValueInBuckets picks latest snapshot value per bucket", () => {
  const buckets = computePeriodBuckets("monthly", "2026-05-01", "2026-06-30", NOW2);
  const snaps = [
    { d: "2026-05-05", v: 700 }, { d: "2026-05-28", v: 710 }, { d: "2026-06-01", v: 715 },
  ];
  const out = lastValueInBuckets(snaps, (s) => s.d, (s) => s.v, buckets);
  assert.deepEqual(out.map((x) => x.value), [710, 715]); // May -> last (710), Jun -> 715
});

test("deltaPct computes percentage change, null-safe", () => {
  assert.equal(deltaPct(110, 100), 10);
  assert.equal(deltaPct(90, 100), -10);
  assert.equal(deltaPct(5, 0), null);   // no baseline
  assert.equal(deltaPct(5, null), null);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `tsx --test server/reporting-helpers.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement**

Append to `server/reporting-helpers.ts`:

```ts
export interface BucketValue { key: string; value: number; }

/** Count items whose timestamp falls in each bucket. */
export function assignCountToBuckets<T>(items: T[], getTime: (i: T) => string | null | undefined, buckets: Bucket[]): BucketValue[] {
  const out = buckets.map((b) => ({ key: b.key, value: 0, _s: new Date(b.start).getTime(), _e: new Date(b.end).getTime() }));
  for (const it of items) {
    const raw = getTime(it);
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) continue;
    for (const b of out) if (t >= b._s && t < b._e) { b.value++; break; }
  }
  return out.map(({ key, value }) => ({ key, value }));
}

/** For point-in-time series: latest sample value within each bucket (0 if none). */
export function lastValueInBuckets<T>(samples: T[], getTime: (s: T) => string, getValue: (s: T) => number, buckets: Bucket[]): BucketValue[] {
  const sorted = [...samples].sort((a, b) => new Date(getTime(a)).getTime() - new Date(getTime(b)).getTime());
  return buckets.map((b) => {
    const s = new Date(b.start).getTime(), e = new Date(b.end).getTime();
    let val = 0;
    for (const smp of sorted) {
      const t = new Date(getTime(smp)).getTime();
      if (t >= s && t < e) val = getValue(smp);
    }
    return { key: b.key, value: val };
  });
}

/** Percentage change vs baseline. Returns null when baseline is null/0. */
export function deltaPct(value: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined || prev === 0) return null;
  return Math.round(((value - prev) / prev) * 1000) / 10;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `tsx --test server/reporting-helpers.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add server/reporting-helpers.ts server/reporting-helpers.test.ts
git commit -m "feat(reporting): bucket aggregation + deltaPct helpers + tests"
```

---

## Task 4: Pure helper — `buildExecutiveFlags` (TDD)

**Files:**
- Modify: `server/reporting-helpers.ts`
- Modify: `server/reporting-helpers.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `server/reporting-helpers.test.ts`:

```ts
import { buildExecutiveFlags } from "./reporting-helpers.ts";

test("buildExecutiveFlags raises red flag when revenueAtRisk >10% of MRR", () => {
  const { redFlags, greenLights } = buildExecutiveFlags({
    mrr: 100_000_000, revenueAtRisk: 16_000_000, isolirCount: 93,
    newActivationsDeltaPct: 18, recoveryPct: 80,
  });
  assert.ok(redFlags.some((f) => /risk/i.test(f)));
  assert.ok(greenLights.some((g) => /aktivasi/i.test(g)));
});

test("buildExecutiveFlags green when healthy, no false red flags", () => {
  const { redFlags } = buildExecutiveFlags({
    mrr: 100_000_000, revenueAtRisk: 2_000_000, isolirCount: 10,
    newActivationsDeltaPct: 5, recoveryPct: 95,
  });
  assert.equal(redFlags.length, 0);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `tsx --test server/reporting-helpers.test.ts`
Expected: FAIL — `buildExecutiveFlags` not exported.

- [ ] **Step 3: Implement**

Append to `server/reporting-helpers.ts`:

```ts
export interface ExecFlagInput {
  mrr: number;
  revenueAtRisk: number;
  isolirCount: number;
  newActivationsDeltaPct: number | null;
  recoveryPct: number | null;
}

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export function buildExecutiveFlags(i: ExecFlagInput): { redFlags: string[]; greenLights: string[] } {
  const redFlags: string[] = [];
  const greenLights: string[] = [];

  const riskPct = i.mrr > 0 ? (i.revenueAtRisk / i.mrr) * 100 : 0;
  if (riskPct > 10) {
    redFlags.push(`Revenue at risk ${rupiah(i.revenueAtRisk)} (${riskPct.toFixed(1)}% MRR) dari ${i.isolirCount} pelanggan isolir`);
  }
  if (i.recoveryPct !== null && i.recoveryPct < 60) {
    redFlags.push(`Collection recovery rate rendah: ${i.recoveryPct.toFixed(0)}%`);
  }
  if (i.newActivationsDeltaPct !== null && i.newActivationsDeltaPct <= -10) {
    redFlags.push(`Aktivasi baru turun ${Math.abs(i.newActivationsDeltaPct).toFixed(0)}% vs periode lalu`);
  }
  if (i.newActivationsDeltaPct !== null && i.newActivationsDeltaPct >= 10) {
    greenLights.push(`Aktivasi baru +${i.newActivationsDeltaPct.toFixed(0)}% vs periode lalu`);
  }
  if (i.recoveryPct !== null && i.recoveryPct >= 85) {
    greenLights.push(`Collection recovery sehat: ${i.recoveryPct.toFixed(0)}%`);
  }
  return { redFlags, greenLights };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `tsx --test server/reporting-helpers.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add server/reporting-helpers.ts server/reporting-helpers.test.ts
git commit -m "feat(reporting): executive red/green flag rules + tests"
```

---

## Task 5: Storage — `kpi_snapshots` migration + `ensureKpiSnapshotForToday`

**Files:**
- Modify: `server/storage.ts` (import; startup migration block; new method)

- [ ] **Step 1: Add imports**

In the `@shared/schema` import list in `storage.ts`, add `kpiSnapshots`. Ensure `getMitraId` and drizzle `sql`, `eq`, `and`, `desc` are already imported (they are, from prior tasks/usage).

- [ ] **Step 2: Add startup migration**

In `seedAdminIfNeeded` (the startup migration area, near the `collection_stages` CREATE TABLE added previously), add:

```ts
// kpi_snapshots — lazy daily KPI history for finance/subscriber trends
await this.db.execute(sql`
  CREATE TABLE IF NOT EXISTS kpi_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mitra_id INT NOT NULL DEFAULT 1,
    snapshot_date VARCHAR(10) NOT NULL,
    active_count INT NOT NULL DEFAULT 0,
    isolir_count INT NOT NULL DEFAULT 0,
    total_count INT NOT NULL DEFAULT 0,
    mrr BIGINT NOT NULL DEFAULT 0,
    arpu INT NOT NULL DEFAULT 0,
    revenue_at_risk BIGINT NOT NULL DEFAULT 0,
    new_activations INT NOT NULL DEFAULT 0,
    collections_open INT NOT NULL DEFAULT 0,
    collections_closed_today INT NOT NULL DEFAULT 0,
    outstanding_amount BIGINT NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE KEY uniq_kpi_snapshot_mitra_date (mitra_id, snapshot_date)
  )
`);
```

- [ ] **Step 3: Add `ensureKpiSnapshotForToday` + local-date helper**

Add a private helper and the method in the reporting section of `storage.ts`:

```ts
/** Local (server TZ) date as YYYY-MM-DD. */
private localDateStr(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Lazily write today's KPI snapshot for the active mitra if missing.
 * Cheap: one existence check + (at most once/day) one set of aggregates.
 */
async ensureKpiSnapshotForToday(): Promise<void> {
  const mitraId = getMitraId();
  const today = this.localDateStr();
  const existing: any = (await this.db.execute(
    sql`SELECT id FROM kpi_snapshots WHERE mitra_id = ${mitraId} AND snapshot_date = ${today} LIMIT 1`
  ))[0];
  if ((existing as any[]).length > 0) return;

  const agg: any = ((await this.db.execute(sql`
    SELECT
      COUNT(*) AS total_count,
      SUM(is_isolir = 1) AS isolir_count,
      SUM(is_isolir = 0) AS active_count,
      COALESCE(SUM(CASE WHEN is_isolir = 0 THEN billing_price ELSE 0 END), 0) AS mrr,
      COALESCE(SUM(CASE WHEN is_isolir = 1 THEN billing_price ELSE 0 END), 0) AS revenue_at_risk,
      SUM(install_date LIKE ${today + "%"}) AS new_activations
    FROM customers WHERE mitra_id = ${mitraId}
  `))[0] as any[])[0];

  const col: any = ((await this.db.execute(sql`
    SELECT
      SUM(closed_at IS NULL) AS open_count,
      COALESCE(SUM(CASE WHEN closed_at IS NULL THEN opened_amount ELSE 0 END), 0) AS outstanding,
      SUM(closed_at LIKE ${today + "%"}) AS closed_today
    FROM collections WHERE mitra_id = ${mitraId}
  `))[0] as any[])[0];

  const activeCount = Number(agg.active_count ?? 0);
  const mrr = Number(agg.mrr ?? 0);
  await this.db.execute(sql`
    INSERT INTO kpi_snapshots
      (mitra_id, snapshot_date, active_count, isolir_count, total_count, mrr, arpu,
       revenue_at_risk, new_activations, collections_open, collections_closed_today, outstanding_amount, created_at)
    VALUES (${mitraId}, ${today}, ${activeCount}, ${Number(agg.isolir_count ?? 0)}, ${Number(agg.total_count ?? 0)},
       ${mrr}, ${activeCount > 0 ? Math.round(mrr / activeCount) : 0}, ${Number(agg.revenue_at_risk ?? 0)},
       ${Number(agg.new_activations ?? 0)}, ${Number(col.open_count ?? 0)}, ${Number(col.closed_today ?? 0)},
       ${Number(col.outstanding ?? 0)}, ${new Date().toISOString()})
    ON DUPLICATE KEY UPDATE id = id
  `);
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "feat(storage): kpi_snapshots migration + lazy ensureKpiSnapshotForToday"
```

---

## Task 6: Storage — `getFinanceOverview` + `getCustomersOverview`

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Implement `getFinanceOverview`**

```ts
async getFinanceOverview(): Promise<any> {
  const mitraId = getMitraId();
  const cur: any = ((await this.db.execute(sql`
    SELECT
      COUNT(*) AS total,
      SUM(is_isolir = 0) AS active,
      SUM(is_isolir = 1) AS isolir,
      COALESCE(SUM(CASE WHEN is_isolir = 0 THEN billing_price ELSE 0 END),0) AS mrr,
      COALESCE(SUM(CASE WHEN is_isolir = 1 THEN billing_price ELSE 0 END),0) AS risk
    FROM customers WHERE mitra_id = ${mitraId}
  `))[0] as any[])[0];

  // yesterday snapshot for delta (may be absent)
  const prev: any = ((await this.db.execute(sql`
    SELECT mrr FROM kpi_snapshots WHERE mitra_id = ${mitraId} AND snapshot_date < ${this.localDateStr()}
    ORDER BY snapshot_date DESC LIMIT 1
  `))[0] as any[])[0];

  const byStatus: any[] = ((await this.db.execute(sql`
    SELECT COALESCE(billing_status,'unknown') AS k, COUNT(*) AS n FROM customers WHERE mitra_id = ${mitraId} GROUP BY billing_status
  `))[0] as any[]);
  const byPackage: any[] = ((await this.db.execute(sql`
    SELECT COALESCE(package,'-') AS k, COUNT(*) AS n, COALESCE(SUM(billing_price),0) AS mrr
    FROM customers WHERE mitra_id = ${mitraId} GROUP BY package ORDER BY n DESC
  `))[0] as any[]);
  const byType: any[] = ((await this.db.execute(sql`
    SELECT COALESCE(customer_type,'-') AS k, COUNT(*) AS n FROM customers WHERE mitra_id = ${mitraId} GROUP BY customer_type
  `))[0] as any[]);
  const byDistrict: any[] = ((await this.db.execute(sql`
    SELECT COALESCE(district,'-') AS k, COUNT(*) AS n, COALESCE(SUM(billing_price),0) AS mrr
    FROM customers WHERE mitra_id = ${mitraId} GROUP BY district ORDER BY n DESC
  `))[0] as any[]);

  const active = Number(cur.active ?? 0);
  const mrr = Number(cur.mrr ?? 0);
  return {
    asOf: new Date().toISOString(),
    mrr, mrrPrev: prev ? Number(prev.mrr) : null,
    arpu: active > 0 ? Math.round(mrr / active) : 0,
    activeCount: active, isolirCount: Number(cur.isolir ?? 0), totalCount: Number(cur.total ?? 0),
    revenueAtRisk: Number(cur.risk ?? 0),
    billingStatus: Object.fromEntries(byStatus.map((r) => [r.k, Number(r.n)])),
    byPackage: byPackage.map((r) => ({ package: r.k, count: Number(r.n), mrr: Number(r.mrr) })),
    byType: byType.map((r) => ({ type: r.k, count: Number(r.n) })),
    byDistrict: byDistrict.map((r) => ({ district: r.k, count: Number(r.n), mrr: Number(r.mrr) })),
  };
}
```

- [ ] **Step 2: Implement `getCustomersOverview`**

```ts
async getCustomersOverview(): Promise<any> {
  const mitraId = getMitraId();
  const cur: any = ((await this.db.execute(sql`
    SELECT COUNT(*) AS total, SUM(is_isolir=0) AS active, SUM(is_isolir=1) AS isolir
    FROM customers WHERE mitra_id = ${mitraId}
  `))[0] as any[])[0];

  const monthPrefix = this.localDateStr().slice(0, 7);          // YYYY-MM
  const today = this.localDateStr();
  const acts: any = ((await this.db.execute(sql`
    SELECT
      SUM(install_date LIKE ${today + "%"}) AS today,
      SUM(install_date LIKE ${monthPrefix + "%"}) AS this_month
    FROM customers WHERE mitra_id = ${mitraId} AND install_date >= '2000-01-01'
  `))[0] as any[])[0];

  const dims = async (col: string) =>
    ((await this.db.execute(sql`
      SELECT COALESCE(${sql.raw(col)},'-') AS k, COUNT(*) AS n FROM customers WHERE mitra_id = ${mitraId} GROUP BY ${sql.raw(col)} ORDER BY n DESC
    `))[0] as any[]).map((r) => ({ key: r.k, count: Number(r.n) }));

  return {
    asOf: new Date().toISOString(),
    total: Number(cur.total ?? 0), active: Number(cur.active ?? 0), isolir: Number(cur.isolir ?? 0),
    newActivations: { today: Number(acts.today ?? 0), thisMonth: Number(acts.this_month ?? 0) },
    byPackage: await dims("package"), byType: await dims("customer_type"),
    byDistrict: await dims("district"), byVillage: await dims("village"),
  };
}
```

> Note: `sql.raw(col)` is used only with the fixed literal column names above (`package`/`customer_type`/`district`/`village`) — never with request input.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(storage): getFinanceOverview + getCustomersOverview (aggregate, no PII)"
```

---

## Task 7: Storage — `getFinanceTimeseries` + `getCustomersTimeseries`

**Files:**
- Modify: `server/storage.ts` (import helpers from `./reporting-helpers.ts`)

- [ ] **Step 1: Add import**

At top of `storage.ts`:

```ts
import { computePeriodBuckets, assignCountToBuckets, lastValueInBuckets, type Period } from "./reporting-helpers.ts";
```

- [ ] **Step 2: Implement `getFinanceTimeseries`**

```ts
async getFinanceTimeseries(metric: "mrr" | "active" | "isolir" | "revenue_at_risk", period: Period, from?: string, to?: string): Promise<any> {
  const mitraId = getMitraId();
  const buckets = computePeriodBuckets(period, from, to);
  const col = { mrr: "mrr", active: "active_count", isolir: "isolir_count", revenue_at_risk: "revenue_at_risk" }[metric];
  const rows: any[] = ((await this.db.execute(sql`
    SELECT snapshot_date AS d, ${sql.raw(col)} AS v FROM kpi_snapshots
    WHERE mitra_id = ${mitraId} ORDER BY snapshot_date ASC
  `))[0] as any[]);
  const series = lastValueInBuckets(rows, (r) => r.d, (r) => Number(r.v), buckets);
  return { metric, period, buckets: series, coverage: rows.length ? `from ${rows[0].d}` : "no snapshots yet" };
}
```

- [ ] **Step 3: Implement `getCustomersTimeseries`**

```ts
async getCustomersTimeseries(metric: "new_activations" | "active" | "net_adds", period: Period, from?: string, to?: string): Promise<any> {
  const mitraId = getMitraId();
  const buckets = computePeriodBuckets(period, from, to);

  if (metric === "new_activations") {
    const rows: any[] = ((await this.db.execute(sql`
      SELECT install_date AS t FROM customers WHERE mitra_id = ${mitraId} AND install_date >= '2000-01-01'
    `))[0] as any[]);
    return { metric, period, buckets: assignCountToBuckets(rows, (r) => r.t, buckets), coverage: "from install_date" };
  }

  // active / net_adds from snapshots
  const snaps: any[] = ((await this.db.execute(sql`
    SELECT snapshot_date AS d, active_count AS v FROM kpi_snapshots WHERE mitra_id = ${mitraId} ORDER BY snapshot_date ASC
  `))[0] as any[]);
  const active = lastValueInBuckets(snaps, (r) => r.d, (r) => Number(r.v), buckets);
  if (metric === "active") return { metric, period, buckets: active, coverage: snaps.length ? `from ${snaps[0].d}` : "no snapshots yet" };
  // net_adds = diff vs previous bucket
  const net = active.map((b, i) => ({ key: b.key, value: i === 0 ? 0 : b.value - active[i - 1].value }));
  return { metric, period, buckets: net, coverage: snaps.length ? `from ${snaps[0].d}` : "no snapshots yet" };
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "feat(storage): finance + customers timeseries (snapshots + install_date)"
```

---

## Task 8: Storage — `getCollectionsFinance`

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Implement**

```ts
async getCollectionsFinance(period: Period, from?: string, to?: string): Promise<any> {
  const mitraId = getMitraId();
  const buckets = computePeriodBuckets(period, from, to);

  const all: any[] = ((await this.db.execute(sql`
    SELECT opened_at, closed_at, opened_amount, close_reason FROM collections WHERE mitra_id = ${mitraId}
  `))[0] as any[]);

  const opened = assignCountToBuckets(all, (r) => r.opened_at, buckets);
  const closedRows = all.filter((r) => r.closed_at);
  const closed = assignCountToBuckets(closedRows, (r) => r.closed_at, buckets);
  const recovery = buckets.map((b, i) => ({
    bucket: b.key, opened: opened[i].value, closed: closed[i].value,
    recoveryPct: opened[i].value > 0 ? Math.round((closed[i].value / opened[i].value) * 1000) / 10 : null,
  }));

  // point-in-time open + aging (by age from opened_at)
  const open = all.filter((r) => !r.closed_at);
  const now = Date.now();
  const ageDays = (r: any) => Math.floor((now - new Date(r.opened_at).getTime()) / 86400000);
  const aging = { d0_7: 0, d8_30: 0, d31plus: 0 };
  let outstanding = 0;
  for (const r of open) {
    outstanding += Number(r.opened_amount ?? 0);
    const a = ageDays(r);
    if (a <= 7) aging.d0_7++; else if (a <= 30) aging.d8_30++; else aging.d31plus++;
  }

  // avg days-to-pay over closed-in-range
  const paid = closedRows.filter((r) => {
    const t = new Date(r.closed_at).getTime();
    return t >= new Date(buckets[0].start).getTime();
  });
  const avgDaysToPay = paid.length
    ? Math.round((paid.reduce((s, r) => s + (new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / 86400000, 0) / paid.length) * 10) / 10
    : null;

  return { period, openNow: open.length, outstandingAmount: outstanding, recovery, aging, avgDaysToPay };
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(storage): collections finance — recovery, aging, days-to-pay"
```

---

## Task 9: Storage — `getExecutiveReport`

**Files:**
- Modify: `server/storage.ts` (import `buildExecutiveFlags`, `deltaPct`)

- [ ] **Step 1: Extend helper import**

Update the import added in Task 7 to also include `buildExecutiveFlags` and `deltaPct`:

```ts
import { computePeriodBuckets, assignCountToBuckets, lastValueInBuckets, buildExecutiveFlags, deltaPct, type Period } from "./reporting-helpers.ts";
```

- [ ] **Step 2: Implement**

```ts
async getExecutiveReport(period: Period, from?: string, to?: string): Promise<any> {
  const fin = await this.getFinanceOverview();
  const cust = await this.getCustomersOverview();
  const col = await this.getCollectionsFinance(period, from, to);
  const mrrTrend = await this.getFinanceTimeseries("mrr", period, from, to);
  const actTrend = await this.getCustomersTimeseries("new_activations", period, from, to);

  // newActivations delta: last vs previous bucket
  const ab = actTrend.buckets as { value: number }[];
  const actDelta = ab.length >= 2 ? deltaPct(ab[ab.length - 1].value, ab[ab.length - 2].value) : null;
  // recovery headline = latest bucket recoveryPct
  const rb = col.recovery as { recoveryPct: number | null }[];
  const recoveryPct = rb.length ? rb[rb.length - 1].recoveryPct : null;

  const flags = buildExecutiveFlags({
    mrr: fin.mrr, revenueAtRisk: fin.revenueAtRisk, isolirCount: fin.isolirCount,
    newActivationsDeltaPct: actDelta, recoveryPct,
  });

  return {
    period, range: { from: from ?? null, to: to ?? null },
    revenue: {
      mrr: { value: fin.mrr, prev: fin.mrrPrev, deltaPct: deltaPct(fin.mrr, fin.mrrPrev) },
      arpu: fin.arpu, revenueAtRisk: fin.revenueAtRisk, outstandingAmount: col.outstandingAmount,
    },
    subscribers: {
      active: fin.activeCount, isolir: fin.isolirCount,
      newActivations: { value: ab.length ? ab[ab.length - 1].value : 0, deltaPct: actDelta },
      churnNote: "needs accumulated snapshot history",
    },
    collections: { openNow: col.openNow, recoveryPct, avgDaysToPay: col.avgDaysToPay },
    operations: { note: "expanded in Fase 2 (operations:read)" },
    trend: { mrr: mrrTrend.buckets, newActivations: actTrend.buckets },
    redFlags: flags.redFlags, greenLights: flags.greenLights,
  };
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(storage): getExecutiveReport one-shot composite"
```

---

## Task 10: Routes — scopes + finance endpoints

**Files:**
- Modify: `server/public-api-routes.ts`

- [ ] **Step 1: Add a period parser near `parsePagination`**

```ts
function parsePeriod(req: any): { period: "daily"|"weekly"|"monthly"|"quarterly"; from?: string; to?: string } {
  const allowed = ["daily", "weekly", "monthly", "quarterly"] as const;
  const p = (req.query.period as string) || "monthly";
  const period = (allowed as readonly string[]).includes(p) ? p : "monthly";
  const iso = (v: any) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : undefined);
  return { period: period as any, from: iso(req.query.from), to: iso(req.query.to) };
}
```

- [ ] **Step 2: Add finance endpoints** (place near the other domain endpoints, before the `/schema`-referenced ones is fine):

```ts
publicApiRouter.get("/api/public/v1/finance/overview", requireScope("finance:read"), async (_req, res) => {
  try { await storage.ensureKpiSnapshotForToday(); res.json(await storage.getFinanceOverview()); }
  catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

publicApiRouter.get("/api/public/v1/finance/timeseries", requireScope("finance:read"), async (req, res) => {
  try {
    const { period, from, to } = parsePeriod(req);
    const allowed = ["mrr", "active", "isolir", "revenue_at_risk"];
    const metric = allowed.includes(req.query.metric as string) ? (req.query.metric as any) : "mrr";
    await storage.ensureKpiSnapshotForToday();
    res.json(await storage.getFinanceTimeseries(metric, period, from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

publicApiRouter.get("/api/public/v1/finance/collections", requireScope("finance:read"), async (req, res) => {
  try { const { period, from, to } = parsePeriod(req); res.json(await storage.getCollectionsFinance(period, from, to)); }
  catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/public-api-routes.ts
git commit -m "feat(public-api): finance endpoints (overview, timeseries, collections)"
```

---

## Task 11: Routes — customers + executive endpoints

**Files:**
- Modify: `server/public-api-routes.ts`

- [ ] **Step 1: Add endpoints**

```ts
publicApiRouter.get("/api/public/v1/customers/overview", requireScope("customers:read"), async (_req, res) => {
  try { await storage.ensureKpiSnapshotForToday(); res.json(await storage.getCustomersOverview()); }
  catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

publicApiRouter.get("/api/public/v1/customers/timeseries", requireScope("customers:read"), async (req, res) => {
  try {
    const { period, from, to } = parsePeriod(req);
    const allowed = ["new_activations", "active", "net_adds"];
    const metric = allowed.includes(req.query.metric as string) ? (req.query.metric as any) : "new_activations";
    await storage.ensureKpiSnapshotForToday();
    res.json(await storage.getCustomersTimeseries(metric, period, from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

publicApiRouter.get("/api/public/v1/reports/executive", requireScope("reports:read"), async (req, res) => {
  try { const { period, from, to } = parsePeriod(req); await storage.ensureKpiSnapshotForToday(); res.json(await storage.getExecutiveReport(period, from, to)); }
  catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/public-api-routes.ts
git commit -m "feat(public-api): customers + executive report endpoints"
```

---

## Task 12: Routes — `/schema` docs entries

**Files:**
- Modify: `server/public-api-routes.ts` (the `/api/public/v1/schema` handler — `scopes` array ~line 199, `endpoints` array ~line 209)

- [ ] **Step 1: Add scopes**

In the `scopes` array, add:

```ts
{ key: "finance:read", desc: "Revenue & billing (aggregate): MRR, ARPU, revenue-at-risk, billing status, collections recovery/aging. No PII." },
{ key: "customers:read", desc: "Subscriber base (aggregate): counts by status/package/type/district/village + activations. No PII." },
```

- [ ] **Step 2: Add endpoint docs**

In the `endpoints` array, add a `FINANCE & SUBSCRIBER` block:

```ts
{ method: "GET", path: "/finance/overview",     scope: "finance:read",   desc: "Point-in-time: MRR (+delta), ARPU, revenue-at-risk, billingStatus dist, breakdown by package/type/district" },
{ method: "GET", path: "/finance/timeseries",   scope: "finance:read",   desc: "Trend dari snapshot. Query: ?metric=mrr|active|isolir|revenue_at_risk&period=daily|weekly|monthly|quarterly&from=&to=" },
{ method: "GET", path: "/finance/collections",  scope: "finance:read",   desc: "Recovery rate, aging buckets, avg days-to-pay, outstanding. Query: ?period=&from=&to=" },
{ method: "GET", path: "/customers/overview",   scope: "customers:read", desc: "Subscriber counts by status/package/type/district/village + new activations" },
{ method: "GET", path: "/customers/timeseries", scope: "customers:read", desc: "Query: ?metric=new_activations|active|net_adds&period=&from=&to=" },
{ method: "GET", path: "/reports/executive",    scope: "reports:read",   desc: "⭐ ONE-SHOT untuk AI: revenue + subscriber + collections + ops-ringkas, semua + deltaPct + redFlags/greenLights + trend. Query: ?period=&from=&to=" },
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/public-api-routes.ts
git commit -m "docs(public-api): schema entries for finance/customers/executive"
```

---

## Task 13: UI — add scopes to API-key create dialog

**Files:**
- Modify: `client/pages/PublicApiPage.tsx` (the `ALL_SCOPES` array ~line 19)

- [ ] **Step 1: Add scope entries**

In `ALL_SCOPES`, add (after `marketing:read` or near `collections:read`):

```ts
{ key: "finance:read", label: "Revenue & Billing", desc: "MRR, ARPU, revenue-at-risk, billing status, collection recovery & aging. Agregat (tanpa PII). Untuk laporan keuangan harian→quarter.", icon: "💵" },
{ key: "customers:read", label: "Subscriber Base", desc: "Jumlah pelanggan by status/paket/wilayah, aktivasi baru, net adds. Agregat (tanpa PII).", icon: "👥" },
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds (Vite bundles the client).

- [ ] **Step 3: Commit**

```bash
git add client/pages/PublicApiPage.tsx
git commit -m "feat(api-keys): expose finance:read + customers:read scopes in create dialog"
```

---

## Task 14: End-to-end verification (local dev DB)

**Files:** none (verification only)

- [ ] **Step 1: Run full test + build**

Run: `tsx --test server/reporting-helpers.test.ts && npm run typecheck && npm run build`
Expected: all helper tests PASS, 0 type errors, build OK.

- [ ] **Step 2: Start dev server against dev DB**

Run: `JABNET_PRIVATE_ROOT=<dev private root> npm run dev` (or test on deployed dev). In `/api-keys` create a key with scopes `finance:read, customers:read, reports:read`. Export `KEY=jbk_live_...`.

- [ ] **Step 3: Probe endpoints + cross-check SQL**

```bash
BASE=http://localhost:5000/api/public/v1   # adjust port
curl -s -H "Authorization: Bearer $KEY" $BASE/finance/overview | jq '{mrr,arpu,activeCount,isolirCount,revenueAtRisk}'
curl -s -H "Authorization: Bearer $KEY" "$BASE/finance/collections?period=monthly" | jq '{openNow,outstandingAmount,avgDaysToPay,aging}'
curl -s -H "Authorization: Bearer $KEY" "$BASE/customers/timeseries?metric=new_activations&period=monthly" | jq '.buckets'
curl -s -H "Authorization: Bearer $KEY" "$BASE/reports/executive?period=monthly" | jq '{revenue,subscribers,redFlags,greenLights}'
```
Cross-check `finance/overview.mrr` ≈ `SELECT SUM(billing_price) FROM customers WHERE mitra_id=1 AND is_isolir=0;`.

- [ ] **Step 4: Verify lazy snapshot + idempotency**

After any probe: `SELECT * FROM kpi_snapshots WHERE snapshot_date = CURDATE();` → exactly 1 row per mitra. Probe again → still 1 (no dup).

- [ ] **Step 5: Verify NO PII leaked**

Run each endpoint response through: `... | jq 'tostring | test("phone|email|pppoe|ont_serial|customer_id|\"name\"")'` → expect `false` for every finance/customers/executive response.

- [ ] **Step 6: Verify schema doc**

`curl -s $BASE/schema | jq '.scopes[].key, (.endpoints[]|select(.path|test("finance|customers|executive")).path)'` → shows the 2 scopes + 6 endpoints.

- [ ] **Step 7: Final commit (if any doc tweaks)**

```bash
git add -A && git commit -m "test(public-api): verify finance/customers/executive endpoints" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:** `finance:read`/`customers:read` scopes (T10–13) ✓; `/finance/overview` (T6,10) ✓; `/finance/timeseries` (T7,10) ✓; `/finance/collections` (T8,10) ✓; `/customers/overview` (T6,11) ✓; `/customers/timeseries` (T7,11) ✓; `/reports/executive` (T9,11) ✓; `kpi_snapshots` + lazy writer (T1,5) ✓; uniform period param (T10) ✓; deltas (T3,9) ✓; redFlags/greenLights (T4,9) ✓; privacy/no-PII (T6 design + T14 step5 verify) ✓; schema docs (T12) ✓; UI scopes (T13) ✓.

**Out-of-scope honored:** no churn-rate-per-customer, YoY, CAC loop, network/ops endpoints.

**Type consistency:** `Period` type defined in T2, imported in T7/T9. Helper names consistent: `computePeriodBuckets`, `assignCountToBuckets`, `lastValueInBuckets`, `deltaPct`, `buildExecutiveFlags`. Storage method names match route usage: `ensureKpiSnapshotForToday`, `getFinanceOverview`, `getFinanceTimeseries`, `getCollectionsFinance`, `getCustomersOverview`, `getCustomersTimeseries`, `getExecutiveReport`. Column names snake_case match schema (`active_count`, `revenue_at_risk`, `snapshot_date`, `opened_amount`, `closed_at`, `install_date`).

**Note for implementer:** `.ts` extension in imports matches existing test files' style (`./reporting-helpers.ts`); if the bundler/tsconfig rejects explicit `.ts` in non-test source, drop the extension to `./reporting-helpers` to match neighboring `storage.ts` imports.
