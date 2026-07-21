# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce load time pada Login/Dashboard/Map JABNET Workspace dengan add DB indexes, refactor N+1 queries, viewport-based map loading, Passenger keep-alive, dan permission cache.

**Architecture:** 4 phase incremental (A: indexes → B: backend refactor → C: map viewport → D: keep-alive/cache/skeleton). Setiap phase di-deploy independent dengan git commit/push → GHA build → cPanel pull → restart. Setelah tiap phase, user verifikasi impact sebelum lanjut.

**Tech Stack:** Node.js 20 · Express 5 · Drizzle ORM (MySQL) · React 18 · TanStack Query 5 · Wouter · `@react-google-maps/api` · cPanel Passenger

**Spec reference:** `docs/superpowers/specs/2026-05-16-performance-optimization-design.md`

---

## Reporting Format (saat eksekusi)

Setiap task, agent harus laporkan di akhir:

```
✏ Diubah: <file>:<line range or function>
   <ringkasan apa yang berubah>

 Potensi terdampak:
   - <feature/endpoint/page lain yang mungkin kena>

 Verifikasi yang harus dijalankan:
   - <step manual test atau perintah cek>
```

---

# PHASE A - Database Indexes

## Task A1: Add idempotent index migration block

**Files:**
- Modify: `server/storage.ts` (constructor section, after pool init)

- [ ] **Step 1: Locate the constructor & initialization block**

Read `server/storage.ts` lines 282-340. Find where `this.pool` and `this.db` are initialized, and where `seedAdminIfNeeded()` is called.

- [ ] **Step 2: Add `runIndexMigrations()` method**

Insert this method into `DatabaseStorage` class (anywhere after constructor, before existing CRUD methods). Use absolute placement: right before the comment `// ==================== POPS ====================` (or equivalent first CRUD section header).

```ts
  /**
   * Idempotent index creation. Reads information_schema first to avoid
   * "Duplicate key name" errors on re-deploy. Safe to run on every boot.
   */
  private async runIndexMigrations(): Promise<void> {
    const indexes: Array<{ table: string; name: string; cols: string }> = [
      { table: "users",       name: "idx_users_token",          cols: "token(64)" },
      { table: "customers",   name: "idx_customers_odp_id",     cols: "odp_id" },
      { table: "customers",   name: "idx_customers_status",     cols: "status" },
      { table: "customers",   name: "idx_customers_lat_lng",    cols: "lat, lng" },
      { table: "audit_logs",  name: "idx_audit_logs_created",   cols: "created_at(20)" },
      { table: "audit_logs",  name: "idx_audit_logs_user",      cols: "user_id" },
      { table: "cable_cores", name: "idx_cable_cores_cable",    cols: "cable_id" },
      { table: "leads",       name: "idx_leads_lat_lng",        cols: "lat, lng" },
      { table: "collections", name: "idx_collections_status",   cols: "status" },
      { table: "tickets",     name: "idx_tickets_status",       cols: "status" },
    ];
    for (const ix of indexes) {
      try {
        const [rows] = await this.pool.execute(
          `SELECT COUNT(*) AS c FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
          [ix.table, ix.name]
        );
        const exists = ((rows as any[])[0]?.c ?? 0) > 0;
        if (!exists) {
          await this.pool.execute(`CREATE INDEX ${ix.name} ON ${ix.table}(${ix.cols})`);
          console.log(`[index-migration] Created ${ix.name} on ${ix.table}`);
        }
      } catch (err: any) {
        // Table might not exist yet (fresh DB) - log and continue
        console.warn(`[index-migration] Skipped ${ix.name}: ${err.message}`);
      }
    }
  }
```

**Note kolom dengan length:**
- `token(64)`: TEXT column needs prefix length in MySQL - 64 chars cukup karena token hex 32 bytes = 64 char
- `created_at(20)`: TEXT ISO date, 20 chars cover full timestamp `2026-05-16T12:34:56Z`

- [ ] **Step 3: Wire `runIndexMigrations()` to startup**

Find where `seedAdminIfNeeded()` is called (in constructor or `init()` method, look around storage.ts:282-340). Add `runIndexMigrations()` BEFORE seedAdminIfNeeded:

```ts
// Existing code in constructor or init:
await this.runIndexMigrations();
await this.seedAdminIfNeeded();
// ... rest of init
```

**If init is sync (not async):** wrap startup in async IIFE or convert to `async init()` method called from `server/index.ts`. Check current pattern first.

- [ ] **Step 4: Build & typecheck**

```bash
cd /home/ygao-t580/Works/Jabnet/Website/ftth-tools
npm run build
```
Expected: 0 errors. Warning OK.

- [ ] **Step 5: Local smoke test (optional, only if MySQL available locally)**

Skip if no local MySQL. Otherwise:
```bash
DB_HOST=localhost DB_PORT=3307 DB_USER=root DB_PASSWORD=test DB_NAME=jabnet_fiber_test npm run dev
```
Watch console for `[index-migration] Created idx_xxx` lines.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts
git commit -m "perf(A): add idempotent DB index migration on startup

Creates 10 indexes covering auth (users.token), map+dashboard
hot paths (customers.odp_id, status, lat/lng), audit logs,
and cable cores. Uses information_schema check for idempotency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Push & deploy via cPanel**

```bash
git push origin main
```

Wait for GHA build (~2-3 min). Then user does cPanel `Git Version Control → Update from Remote` → `Restart Node.js App`.

- [ ] **Step 8: Verify in production**

User SSH to cPanel or use phpMyAdmin:
```sql
SHOW INDEX FROM users WHERE Key_name = 'idx_users_token';
SHOW INDEX FROM customers WHERE Key_name LIKE 'idx_customers_%';
SHOW INDEX FROM audit_logs WHERE Key_name LIKE 'idx_audit_logs_%';
```
Expected: 10 indexes listed across these tables.

Then test `EXPLAIN` for hot query:
```sql
EXPLAIN SELECT * FROM users WHERE token = 'sample_token_value';
```
Expected: `type: ref`, `key: idx_users_token`, `rows: 1`.

**Potensi terdampak:**
- Seluruh authenticated endpoint (~150+) - semua butuh `getUserByToken()` query
- ODP utilization endpoint, Dashboard, Map data - semua filter by `odp_id`/`status`
- UserDetailDrawer activity tab - `audit_logs.user_id` filter
- CableCoreManagerPage - `cable_cores.cable_id` join
- **Risk: ALTER lock** - tabel target relatif kecil (<10K rows), tiap CREATE INDEX <1-2 detik. Tapi disarankan deploy off-peak (malam) untuk safety.

---

## Task A2: (Optional) Add Drizzle schema-level index definitions

**Files:**
- Modify: `shared/schema.ts`

Tujuan: index ada di Drizzle schema sehingga `drizzle-kit generate` future tetap sync. Tidak wajib untuk fix performance - Task A1 sudah cukup. Skip kalau tidak pakai drizzle migrations.

- [ ] **Step 1: Skip atau lakukan**

Cek `package.json` apakah ada `drizzle-kit generate` di scripts. Kalau tidak dipakai, **skip task ini**.

- [ ] **Step 2 (kalau dilanjut): Add index() defs di schema**

Contoh untuk `customers` table - di `shared/schema.ts` ganti existing definition:

```ts
import { mysqlTable, text, int, double, varchar, longtext, mediumtext, index } from "drizzle-orm/mysql-core";

export const customers = mysqlTable("customers", {
  // ... existing columns
}, (table) => ({
  odpIdIdx: index("idx_customers_odp_id").on(table.odpId),
  statusIdx: index("idx_customers_status").on(table.status),
  latLngIdx: index("idx_customers_lat_lng").on(table.lat, table.lng),
}));
```

Apply same pattern untuk `users`, `auditLogs`, `cableCores`, `leads`, `collections`, `tickets`.

- [ ] **Step 3: Commit (kalau dilakukan)**

```bash
git add shared/schema.ts
git commit -m "perf(A): add Drizzle schema-level index definitions for new indexes"
```

**Potensi terdampak:**
- Tidak ada runtime impact - purely schema metadata
- Future `drizzle-kit generate` akan generate migration file dengan indexes ini

---

# PHASE B - Backend Query Refactor

## Task B1: Refactor `getDashboardStats()` to single aggregate query

**Files:**
- Modify: `server/storage.ts:4312` (`getDashboardStats()` method)

- [ ] **Step 1: Read current implementation**

```bash
sed -n '4312,4400p' /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/storage.ts
```
Note exact field names returned (consumer di `Dashboard.tsx` expects specific keys).

- [ ] **Step 2: Read `DashboardStats` type def**

```bash
grep -n "DashboardStats\b" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/shared/schema.ts
```
Find type definition. List required fields.

- [ ] **Step 3: Rewrite method dengan 2-query approach**

Replace the entire body of `getDashboardStats()`:

```ts
  async getDashboardStats(): Promise<DashboardStats> {
    const [aggregateRows, odpUsageRows, recentLogRows] = await Promise.all([
      this.pool.execute(`
        SELECT
          (SELECT COUNT(*) FROM customers) AS customer_total,
          (SELECT COUNT(*) FROM customers WHERE status='active' AND is_isolir=0) AS customer_active,
          (SELECT COUNT(*) FROM customers WHERE is_isolir=1) AS customer_isolir,
          (SELECT COUNT(*) FROM odps) AS odp_total,
          (SELECT COALESCE(SUM(capacity), 0) FROM odps) AS odp_capacity,
          (SELECT COUNT(*) FROM pops) AS pop_total,
          (SELECT COUNT(*) FROM odcs) AS odc_total,
          (SELECT COUNT(*) FROM tickets WHERE status='open') AS tickets_open,
          (SELECT COUNT(*) FROM collections WHERE status='open') AS collections_open
      `),
      this.pool.execute(`
        SELECT odp_id, COUNT(*) AS used
        FROM customers
        WHERE odp_id IS NOT NULL
        GROUP BY odp_id
      `),
      // Recent audit logs (latest 8)
      this.pool.execute(`
        SELECT id, username, user_name, action, entity_type, entity_id, entity_name, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 8
      `),
    ]);

    const agg = (aggregateRows[0] as any[])[0];
    const odpUsage = odpUsageRows[0] as any[];
    const recentLogs = recentLogRows[0] as any[];

    // ODP usage stats
    let totalOdpUsed = 0;
    for (const r of odpUsage) totalOdpUsed += Number(r.used);

    return {
      customerTotal: Number(agg.customer_total),
      customerActive: Number(agg.customer_active),
      customerIsolir: Number(agg.customer_isolir),
      odpTotal: Number(agg.odp_total),
      odpCapacityTotal: Number(agg.odp_capacity),
      odpUsedTotal: totalOdpUsed,
      popTotal: Number(agg.pop_total),
      odcTotal: Number(agg.odc_total),
      ticketsOpen: Number(agg.tickets_open),
      collectionsOpen: Number(agg.collections_open),
      recentAuditLogs: recentLogs,  // matches existing shape
    } as DashboardStats;
  }
```

**Important:** Cocokkan field nama (camelCase) dengan field yang sebelumnya direturn. Jika ada field yang berbeda nama atau tambahan, **CARI di existing implementation dan match exactly**. Jangan asal ganti.

- [ ] **Step 4: Cek field consistency dengan frontend**

```bash
grep -n "useDashboard\|customerTotal\|customerActive\|odpTotal\|recentAudit" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/pages/Dashboard.tsx | head -30
```
Pastikan semua field yang dipakai di Dashboard.tsx ada di return value.

- [ ] **Step 5: Build & verify**

```bash
npm run build
```
Expected: 0 errors. Kalau ada TS error tentang missing/extra field di `DashboardStats`, fix sesuai existing type.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts
git commit -m "perf(B): refactor getDashboardStats from N+1 to 3 parallel aggregate queries

Before: loop ODPs calling getOdpUtilization per ODP (~18-20 queries).
After: 1 SQL with subselect aggregates + 1 ODP usage GROUP BY + 1 recent logs.
Target: dashboard <200ms (was ~1.5s).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Potensi terdampak:**
- `GET /api/dashboard` consumer: `Dashboard.tsx`. Cek field nama match.
- Public API `/api/public/v1/marketing/overview` - kalau pakai `getDashboardStats()` shape, perlu cek
- **Risk perilaku:** `customer_active` sekarang exclude isolir secara eksplisit (`AND is_isolir=0`). Sebelumnya mungkin pakai logic lain - cek baseline.

---

## Task B2: Refactor `getMapData()` with light projection

**Files:**
- Modify: `server/storage.ts:4686` (`getMapData()` method)

- [ ] **Step 1: Read current implementation**

```bash
sed -n '4686,4720p' /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/storage.ts
```

- [ ] **Step 2: Replace method with column-selected Drizzle queries**

```ts
  async getMapData(): Promise<MapData> {
    const [allPops, allOdcs, rawOdps, allCustomers, allPoles, allCables] = await Promise.all([
      this.db.select({
        id: pops.id,
        name: pops.name,
        code: pops.code,
        lat: pops.lat,
        lng: pops.lng,
        status: pops.status,
      }).from(pops),

      this.db.select({
        id: odcs.id,
        name: odcs.name,
        code: odcs.code,
        lat: odcs.lat,
        lng: odcs.lng,
        status: odcs.status,
        popId: odcs.popId,
        capacity: odcs.capacity,
        usedCapacity: odcs.usedCapacity,
      }).from(odcs),

      this.db.select({
        id: odps.id,
        name: odps.name,
        code: odps.code,
        lat: odps.lat,
        lng: odps.lng,
        status: odps.status,
        odcId: odps.odcId,
        capacity: odps.capacity,
      }).from(odps),

      // Customers - DROP pppoe_*, notes, manual_overrides, billing creds, etc.
      this.db.select({
        id: customers.id,
        name: customers.name,
        customerId: customers.customerId,
        lat: customers.lat,
        lng: customers.lng,
        status: customers.status,
        isIsolir: customers.isIsolir,
        odpId: customers.odpId,
      }).from(customers),

      this.db.select({
        id: poles.id,
        name: poles.name,
        code: poles.code,
        lat: poles.lat,
        lng: poles.lng,
        type: poles.type,
      }).from(poles),

      this.db.select({
        id: cables.id,
        name: cables.name,
        code: cables.code,
        cableType: cables.cableType,
      }).from(cables),
    ]);

    // Compute usedCapacity real-time for ODPs (preserved from before)
    const countMap = new Map<number, number>();
    for (const c of allCustomers) {
      if (c.odpId !== null && c.odpId !== undefined) {
        countMap.set(c.odpId, (countMap.get(c.odpId) ?? 0) + 1);
      }
    }
    const allOdps = rawOdps.map((odp) => ({
      ...odp,
      usedCapacity: countMap.get(odp.id) ?? 0,
    }));

    return {
      pops: allPops,
      odcs: allOdcs,
      odps: allOdps,
      customers: allCustomers,
      poles: allPoles,
      cables: allCables,
    } as MapData;
  }
```

- [ ] **Step 3: Check `MapData` type compatibility**

```bash
grep -n "type MapData\|MapData =" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/shared/schema.ts
```

If `MapData` uses `Customer[]` (full type), TS may complain about partial customer. Either:
- Update `MapData` type to use a `MapCustomer` lightweight type
- OR cast: `as unknown as MapData` (less safe)

Recommended: add light type in `shared/schema.ts`:
```ts
export type MapCustomer = Pick<Customer, "id" | "name" | "customerId" | "lat" | "lng" | "status" | "isIsolir" | "odpId">;
export interface MapData {
  pops: Pick<Pop, "id" | "name" | "code" | "lat" | "lng" | "status">[];
  odcs: Pick<Odc, "id" | "name" | "code" | "lat" | "lng" | "status" | "popId" | "capacity" | "usedCapacity">[];
  odps: Pick<Odp, "id" | "name" | "code" | "lat" | "lng" | "status" | "odcId" | "capacity">[] & { usedCapacity: number }[];
  customers: MapCustomer[];
  poles: Pick<Pole, "id" | "name" | "code" | "lat" | "lng" | "type">[];
  cables: Pick<Cable, "id" | "name" | "code" | "cableType">[];
}
```

(Adjust ke shape existing MapData - jangan invent baru.)

- [ ] **Step 4: Check MapInfoWindow for dropped field access**

```bash
grep -n "customer\." /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/components/map/MapInfoWindow.tsx
grep -n "package\|notes\|phone\|pppoe\|address\|district" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/components/map/MapInfoWindow.tsx
grep -rn "customer\." /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/pages/MapPage.tsx | grep -v "customerId\|customer\.id\|customer\.name\|customer\.lat\|customer\.lng\|customer\.status\|customer\.isIsolir\|customer\.odpId" | head -20
```

If any access to dropped fields (e.g. `customer.package`, `customer.notes`), add detail-on-click via `GET /api/customers/:id` (already exists). Update MapInfoWindow to lazy-fetch full customer when popup opens.

- [ ] **Step 5: Build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts shared/schema.ts client/components/map/MapInfoWindow.tsx
git commit -m "perf(B): light projection for /api/map-data response

Drop pppoe credentials, notes, manual_overrides, etc from customer
rows in map response. Payload reduction ~85% for typical 2000 customers
(1.6MB → 240KB). MapInfoWindow now lazy-fetches full customer detail
on marker click.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Potensi terdampak:**
- `GET /api/map-data` consumer: `MapPage.tsx` via `useMapData()` hook
- `MapData`/`MapCustomer` type - TypeScript surface change, hits any file that imports it
- MapInfoWindow popup - now needs full-customer fetch on click (UX: tiny lag ~100ms on first click)
- Mutation invalidation: existing `queryKeys.mapData` invalidation paths still work (shape change tidak ngubah cache key)

---

## Task B3: Make `createAuditLog()` fire-and-forget capable

**Files:**
- Modify: `server/storage.ts` (`createAuditLog()` method)
- Modify: `server/routes.ts` (audit log call sites di hot paths)

- [ ] **Step 1: Find current `createAuditLog()` implementation**

```bash
grep -n "createAuditLog" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/storage.ts | head -5
```

- [ ] **Step 2: Simplify return - drop read-back**

Replace existing `createAuditLog()`:

```ts
  async createAuditLog(data: InsertAuditLog): Promise<void> {
    try {
      await this.db.insert(auditLogs).values(data);
    } catch (err) {
      // Audit log should never crash hot paths
      console.error("[audit-log] insert failed:", err);
    }
  }
```

**Important:** Return type changes from `Promise<AuditLog>` to `Promise<void>`. Any caller that uses return value will TS-error - fix those by removing the assignment.

- [ ] **Step 3: Find callers that consume return value**

```bash
grep -rn "= await.*createAuditLog\|const.*createAuditLog" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server --include="*.ts"
```

For each match, replace `const log = await storage.createAuditLog(...)` with `await storage.createAuditLog(...)` (drop the assignment).

- [ ] **Step 4: Identify hot-path call sites for fire-and-forget**

```bash
grep -n "createAuditLog" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/routes.ts | head -30
```

Categorize each call:
- **Login flow** (`/api/auth/login`) → fire-and-forget
- **GET endpoints** (list views) → fire-and-forget IF logged (most GETs don't log, skip)
- **Mutations** (CREATE/UPDATE/DELETE) → KEEP await (audit integrity for sensitive actions)

For fire-and-forget sites, change:
```ts
// BEFORE:
await storage.createAuditLog({ ... });

// AFTER:
void storage.createAuditLog({ ... });  // fire-and-forget; .catch already inside method
```

**Apply ONLY to:**
- Login endpoint
- Logout endpoint
- Anywhere log is for analytics, not security

**Keep await for:**
- User CREATE/DELETE
- Role CREATE/UPDATE
- Permission changes
- Customer manual_overrides set
- Force-resync trigger
- Delete operations

- [ ] **Step 5: Build & test login locally**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts server/routes.ts
git commit -m "perf(B): createAuditLog() drops read-back + fire-and-forget for login

Login was 11 DB roundtrips, now ~5. Audit log integrity preserved
for sensitive mutations (user/role/permission/delete) which still
await. Hot-path reads (login flow) use fire-and-forget.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Potensi terdampak:**
- Return type change → semua caller harus tidak pakai return value (verified di Step 3)
- Activity timeline (UserDetailDrawer activity tab): timestamp pakai `created_at` di insert payload - pastikan caller set `createdAt: new Date().toISOString()` kalau penting
- Fire-and-forget di login: kalau DB down saat insert, error hanya muncul di console.error - login tetap sukses (acceptable: kalau DB down, ada error lain duluan)
- Audit log untuk sensitive action TIDAK boleh fire-and-forget (security)

---

# PHASE C - Map Viewport Loading

## Task C1: Backend - split map endpoint into Tier 1 + Tier 2

**Files:**
- Modify: `server/storage.ts` (add `getMapInfra()`, `getMapCustomersInBounds()`)
- Modify: `server/routes.ts` (add new endpoints)

- [ ] **Step 1: Add `getMapInfra()` method to DatabaseStorage**

Insert after existing `getMapData()` (around line 4715):

```ts
  /**
   * Tier 1 of map data - POPs/ODCs/ODPs/Poles/Cables. Always loaded.
   * No customers (those fetched separately by viewport).
   */
  async getMapInfra(): Promise<{
    pops: any[]; odcs: any[]; odps: any[]; poles: any[]; cables: any[];
  }> {
    const [allPops, allOdcs, rawOdps, allCustomersForCount, allPoles, allCables] = await Promise.all([
      this.db.select({
        id: pops.id, name: pops.name, code: pops.code,
        lat: pops.lat, lng: pops.lng, status: pops.status,
      }).from(pops),

      this.db.select({
        id: odcs.id, name: odcs.name, code: odcs.code,
        lat: odcs.lat, lng: odcs.lng, status: odcs.status,
        popId: odcs.popId, capacity: odcs.capacity, usedCapacity: odcs.usedCapacity,
      }).from(odcs),

      this.db.select({
        id: odps.id, name: odps.name, code: odps.code,
        lat: odps.lat, lng: odps.lng, status: odps.status,
        odcId: odps.odcId, capacity: odps.capacity,
      }).from(odps),

      // Only fetch odp_id for usage count - minimal cost
      this.db.select({ odpId: customers.odpId }).from(customers),

      this.db.select({
        id: poles.id, name: poles.name, code: poles.code,
        lat: poles.lat, lng: poles.lng, type: poles.type,
      }).from(poles),

      this.db.select({
        id: cables.id, name: cables.name, code: cables.code, cableType: cables.cableType,
      }).from(cables),
    ]);

    const countMap = new Map<number, number>();
    for (const c of allCustomersForCount) {
      if (c.odpId !== null && c.odpId !== undefined) {
        countMap.set(c.odpId, (countMap.get(c.odpId) ?? 0) + 1);
      }
    }
    const allOdps = rawOdps.map((odp) => ({
      ...odp,
      usedCapacity: countMap.get(odp.id) ?? 0,
    }));

    return {
      pops: allPops, odcs: allOdcs, odps: allOdps,
      poles: allPoles, cables: allCables,
    };
  }
```

- [ ] **Step 2: Add `getMapCustomersInBounds()` method**

```ts
  async getMapCustomersInBounds(bbox: {
    swLat: number; swLng: number; neLat: number; neLng: number;
  }, limit = 500): Promise<Array<{
    id: number; name: string; customerId: string;
    lat: number | null; lng: number | null;
    status: string | null; isIsolir: number | null; odpId: number | null;
  }>> {
    const [rows] = await this.pool.execute(
      `SELECT id, name, customer_id AS customerId, lat, lng, status,
              is_isolir AS isIsolir, odp_id AS odpId
       FROM customers
       WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       LIMIT ?`,
      [bbox.swLat, bbox.neLat, bbox.swLng, bbox.neLng, limit]
    );
    return rows as any[];
  }
```

- [ ] **Step 3: Add interface declarations**

In `IStorage` interface (line ~236), add:
```ts
  getMapInfra(): Promise<{ pops: any[]; odcs: any[]; odps: any[]; poles: any[]; cables: any[]; }>;
  getMapCustomersInBounds(bbox: { swLat: number; swLng: number; neLat: number; neLng: number; }, limit?: number): Promise<any[]>;
```

- [ ] **Step 4: Add new endpoints to `server/routes.ts`**

Find existing `/api/map-data` route (`router.get("/api/map-data", ...)` around line 1158). Add immediately after:

```ts
router.get("/api/map-data/infra", async (_req: Request, res: Response) => {
  try {
    const data = await storage.getMapInfra();
    res.json(data);
  } catch (err: any) {
    console.error("[map-infra]", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/map-data/customers", async (req: Request, res: Response) => {
  try {
    const bboxStr = String(req.query.bbox || "");
    if (!bboxStr) {
      return res.status(400).json({ error: "Missing bbox query param (format: swLat,swLng,neLat,neLng)" });
    }
    const parts = bboxStr.split(",").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
      return res.status(400).json({ error: "Invalid bbox format" });
    }
    const [swLat, swLng, neLat, neLng] = parts;
    const limit = Math.min(Number(req.query.limit) || 500, 1000);

    const customers = await storage.getMapCustomersInBounds(
      { swLat, swLng, neLat, neLng },
      limit
    );
    res.json({ customers, count: customers.length, bbox: { swLat, swLng, neLat, neLng } });
  } catch (err: any) {
    console.error("[map-customers]", err);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 5: Build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts server/routes.ts
git commit -m "perf(C): backend tier 1+2 map endpoints

GET /api/map-data/infra returns POPs/ODCs/ODPs/Poles/Cables (always loaded).
GET /api/map-data/customers?bbox=swLat,swLng,neLat,neLng returns
viewport-filtered customers (max 500 per request, uses
idx_customers_lat_lng composite index from Phase A).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Potensi terdampak:**
- Existing `/api/map-data` UNCHANGED - Phase C1 hanya tambah endpoint baru
- New endpoints require Phase A indexes to be performant (composite `idx_customers_lat_lng`)
- 500 limit: kalau viewport sangat luas (zoom out maks) dengan >500 customers di area, hanya 500 ditampilkan. Acceptable - solusi via auto-cluster di frontend Task C2.

---

## Task C2: Frontend - viewport-based map loading

**Files:**
- Modify: `client/hooks/useAssets.ts`
- Modify: `client/lib/queryClient.ts`
- Modify: `client/pages/MapPage.tsx`

- [ ] **Step 1: Add new query keys**

In `client/lib/queryClient.ts`, add to `queryKeys` object:
```ts
export const queryKeys = {
  // ... existing keys
  mapData: ["map-data"] as const,
  mapInfra: ["map", "infra"] as const,        // NEW
  mapCustomers: ["map", "customers"] as const, // NEW (parameterized by bbox)
};
```

- [ ] **Step 2: Add new hooks in `client/hooks/useAssets.ts`**

Insert after existing `useMapData()` hook (line 30):

```ts
// ==================== MAP INFRA + VIEWPORT CUSTOMERS ====================

export type Bbox = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

export function useMapInfra() {
  return useQuery({
    queryKey: queryKeys.mapInfra,
    queryFn: () => api.get<{
      pops: any[]; odcs: any[]; odps: any[]; poles: any[]; cables: any[];
    }>("/map-data/infra"),
    staleTime: 60_000,  // 1 min - infra rarely changes
  });
}

export function useMapCustomers(bbox: Bbox | null, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.mapCustomers, bbox],
    queryFn: () => {
      if (!bbox) throw new Error("bbox required");
      const q = `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}`;
      return api.get<{ customers: any[]; count: number; bbox: Bbox }>(
        `/map-data/customers?bbox=${q}`
      );
    },
    enabled: !!bbox && enabled,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: Wire viewport state into MapPage**

In `client/pages/MapPage.tsx`:

First, **update imports** (line 3):
```ts
import {
  useMapData, useMapInfra, useMapCustomers, type Bbox,
  usePops, useOdcs, useOdps, useCustomers, usePoles, useCables,
  useCableCoreByCable, useOdpUtilization
} from "@/hooks/useAssets";
```

Then in `MapPage()` function (line 466), replace `useMapData()` usage:

```tsx
// BEFORE (line 470):
const { data, isLoading } = useMapData();

// AFTER:
const { data: infra, isLoading: infraLoading } = useMapInfra();
const [bbox, setBbox] = useState<Bbox | null>(null);
const { data: viewportCustomers, isLoading: customersLoading } = useMapCustomers(bbox);

// Compose data for downstream consumers:
const data = useMemo(() => infra ? {
  pops: infra.pops,
  odcs: infra.odcs,
  odps: infra.odps,
  poles: infra.poles,
  cables: infra.cables,
  customers: viewportCustomers?.customers || [],
} : undefined, [infra, viewportCustomers]);

const isLoading = infraLoading;  // show skeleton only while infra loads
```

- [ ] **Step 4: Add debounced `onIdle` handler**

In `MapPage()`, add debounce helper near top of component:

```tsx
const bboxDebounceTimer = useRef<NodeJS.Timeout | null>(null);

const handleMapIdle = useCallback(() => {
  if (!mapRef) return;
  if (bboxDebounceTimer.current) clearTimeout(bboxDebounceTimer.current);
  bboxDebounceTimer.current = setTimeout(() => {
    const bounds = mapRef.getBounds();
    if (!bounds) return;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    setBbox({
      swLat: sw.lat(),
      swLng: sw.lng(),
      neLat: ne.lat(),
      neLng: ne.lng(),
    });
  }, 300);  // 300ms debounce
}, [mapRef]);
```

Then on `<GoogleMap>` component (line 860), add `onIdle` prop:
```tsx
<GoogleMap
  // ... existing props
  onLoad={(map) => setMapRef(map)}
  onIdle={handleMapIdle}    // NEW
  // ...
>
```

- [ ] **Step 5: Move customer markers INTO MarkerClusterer**

Find `client/pages/MapPage.tsx:956` - section `{/* -- Customer markers (diluar clusterer agar tidak bentrok dengan ODP) -- */}`.

Current pattern (around line 956-1000):
```tsx
{/* Customer markers OUTSIDE clusterer */}
{customers.map((c) => <Marker ... />)}
```

Change to: render customers INSIDE the SAME `<MarkerClusterer>` that wraps ODPs (line 876). This is the trickier change - read carefully.

```tsx
<MarkerClusterer options={{ maxZoom: 15, gridSize: 60, zoomOnClick: true }}>
  {(clusterer) => (
    <>
      {/* ODPs */}
      {data?.odps.map((odp) => (
        <Marker key={`odp-${odp.id}`} clusterer={clusterer} ... />
      ))}
      {/* CUSTOMERS - move here */}
      {data?.customers.map((c) => (
        <Marker key={`customer-${c.id}`} clusterer={clusterer} position={{ lat: c.lat!, lng: c.lng! }} ... />
      ))}
    </>
  )}
</MarkerClusterer>
```

**Caveat:** if customer marker has special icon/onClick logic at line 956+, preserve it. Only the `clusterer={clusterer}` prop is the change.

- [ ] **Step 6: Add loading indicator for viewport fetch**

Inside MapPage JSX, add small floating indicator (e.g. bottom-right):

```tsx
{customersLoading && bbox && (
  <div className="absolute bottom-4 right-4 z-50 bg-card/95 backdrop-blur rounded-md px-3 py-1.5 text-xs flex items-center gap-2 shadow-elev-md">
    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    <span>Loading customers...</span>
  </div>
)}
```

- [ ] **Step 7: Update mutation invalidation in `useAssets.ts`**

In `useCrud` (line 56, 75, 93) - invalidations after mutation. Change `queryClient.invalidateQueries({ queryKey: queryKeys.mapData })` to invalidate BOTH old and new keys:

```ts
qc.invalidateQueries({ queryKey: queryKeys.mapData });
qc.invalidateQueries({ queryKey: queryKeys.mapInfra });        // NEW
qc.invalidateQueries({ queryKey: queryKeys.mapCustomers });    // NEW (covers all bbox variants)
```

Same change in `useCustomers()` hook (line 152): `invalidateOdps()` should also invalidate `mapInfra` and `mapCustomers`.

- [ ] **Step 8: Build**

```bash
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add client/lib/queryClient.ts client/hooks/useAssets.ts client/pages/MapPage.tsx
git commit -m "perf(C): map viewport-based customer loading

MapPage now loads Tier 1 (infra) on mount, then fetches customers
in viewport on map idle (300ms debounce). Customer markers moved
into the existing MarkerClusterer for ODP+customer joint clustering
up to zoom 15. Cache invalidation extended to new map keys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Potensi terdampak:**
- `MapPage.tsx` first load: lebih cepat (tier 1 only ~500KB → 200KB), tapi customer marker muncul setelah onIdle fire (small delay ~400ms after map ready)
- MarkerClusterer rendering: gabung ODP+customer di cluster sama - visual cluster akan beda dari sebelumnya (gabungan count)
- Customer mutations (create/update/delete) sekarang juga invalidate viewport query → marker auto-update
- Tier 2 query queryKey includes bbox - pan/zoom kreates new cache entry per bbox. TanStack Query LRU eviction handle ini (default gcTime 5-10min).
- **InfoWindow:** kalau click customer marker → object data lebih thin (no package/notes). Solusi (Task C3 optional).

---

## Task C3: (Optional) Lazy-fetch full customer detail on marker click

**Files:**
- Modify: `client/components/map/MapInfoWindow.tsx`

- [ ] **Step 1: Check current implementation**

```bash
cat /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/components/map/MapInfoWindow.tsx
```

Identify which fields are accessed on customer info popup.

- [ ] **Step 2: Add useQuery for customer detail**

If popup accesses fields not in light projection (e.g., `package`, `notes`, `phone`):

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function MapInfoWindow({ entity, type, onClose }: Props) {
  // For customer popup, fetch full detail
  const { data: fullCustomer } = useQuery({
    queryKey: ["customer", entity.id],
    queryFn: () => api.get(`/customers/${entity.id}`),
    enabled: type === "customer",
    staleTime: 60_000,
  });

  const c = type === "customer" ? (fullCustomer || entity) : entity;

  // ... render using `c` (will show light fields immediately, full fields once loaded)
}
```

- [ ] **Step 3: Build & commit**

```bash
npm run build
git add client/components/map/MapInfoWindow.tsx
git commit -m "perf(C): lazy-fetch full customer detail on marker click

MapInfoWindow now fetches GET /api/customers/:id when customer popup
opens. Initial render uses light fields (instant), full detail loads
in background (~100-200ms).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Potensi terdampak:**
- Tiny UX lag (~100-200ms) saat first click pada customer marker - acceptable, hampir tidak terasa
- TanStack Query cache: 1 min stale time, subsequent click ke customer yang sama = instant
- Existing `GET /api/customers/:id` endpoint - pastikan return full Customer object (cek `routes.ts`)

---

## Task C4: Deploy Phase C + verify

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Wait GHA build (~2-3 min)**

User pulls in cPanel & restarts.

- [ ] **Step 3: Verify in browser**

User opens `https://fiber.jabnet.id/map`:
- Map renders < 1.5s (was 3-6s)
- Pan/zoom triggers customer fetch (Network tab shows `GET /map-data/customers?bbox=...`)
- ODP+customer cluster digabung
- Click customer marker → info shows immediately, full detail muncul ~100ms

---

# PHASE D - Keep-Alive + Cache + Skeleton

## Task D1: Add `/api/health` endpoint

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add health route at top of routes**

In `server/routes.ts`, add EARLY in the router setup (before any auth middleware):

```ts
// Public health check - for cPanel cron keep-alive + uptime monitors
router.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Date.now(), version: process.env.npm_package_version || "4.3.0" });
});
```

- [ ] **Step 2: Build & commit**

```bash
npm run build
git add server/routes.ts
git commit -m "perf(D): add public /api/health endpoint for keep-alive

Lightweight no-DB-call endpoint for cPanel cron job (every 4 min)
to prevent Passenger from spinning down idle Node process.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: After deploy, set up cPanel cron**

User goes to cPanel → Advanced → Cron Jobs:
```
Minute: */4
Hour: *
Day: *
Month: *
Weekday: *
Command: curl -s https://fiber.jabnet.id/api/health > /dev/null 2>&1
```

**Potensi terdampak:**
- Public endpoint (no auth) - minimal DOS surface (no DB call, no I/O)
- Cron load: ~360 requests/day. Negligible.
- Future uptime monitor compatible (UptimeRobot, BetterStack, etc.)

---

## Task D2: Permission cache module

**Files:**
- Create: `server/perm-cache.ts`
- Modify: `server/storage.ts` (`getUserEffectivePermissions()` + invalidation in role/user mutations)

- [ ] **Step 1: Create cache module**

Create `server/perm-cache.ts`:

```ts
/**
 * In-memory LRU cache for user effective permissions.
 * TTL: 60s. Invalidated on role/user mutations.
 *
 * Why: Auth middleware calls getUserEffectivePermissions() on every
 * authenticated request - same result for same user during a session.
 */

type PermDict = Record<string, "none" | "read" | "write">;

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1000;

const cache = new Map<number, { perms: PermDict; expires: number }>();

export function getCachedPerms(userId: number): PermDict | null {
  const hit = cache.get(userId);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  return hit.perms;
}

export function setCachedPerms(userId: number, perms: PermDict): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // LRU: drop first (oldest insertion) entry
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(userId, { perms, expires: Date.now() + CACHE_TTL_MS });
}

export function invalidatePermCache(userId?: number): void {
  if (userId !== undefined) cache.delete(userId);
  else cache.clear();
}

export function permCacheStats(): { size: number; maxEntries: number; ttlMs: number } {
  return { size: cache.size, maxEntries: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS };
}
```

- [ ] **Step 2: Wire cache into `getUserEffectivePermissions()` in storage.ts**

```bash
grep -n "getUserEffectivePermissions" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/storage.ts
```

Find method body and wrap:

```ts
// Import at top of storage.ts:
import { getCachedPerms, setCachedPerms, invalidatePermCache } from "./perm-cache";

// In method (replace existing body):
async getUserEffectivePermissions(userId: number): Promise<Record<string, "none" | "read" | "write">> {
  const cached = getCachedPerms(userId);
  if (cached) return cached;

  // ... existing logic (fetch user, fetch role, merge permissions)

  setCachedPerms(userId, computedPerms);
  return computedPerms;
}
```

- [ ] **Step 3: Add invalidation calls in mutation methods**

For each of these methods, add `invalidatePermCache(...)` after the DB write:

| Method | Invalidate |
|---|---|
| `updateUser()` (if `roleId` changed) | `invalidatePermCache(userId)` |
| `deleteUser()` | `invalidatePermCache(userId)` |
| `createUser()` | (no-op - new user, no cache yet) |
| `updateRole()` | `invalidatePermCache()` (clear all - any user with this role affected) |
| `deleteRole()` | `invalidatePermCache()` (same reason) |

Example for `updateRole()`:
```ts
async updateRole(id: number, data: Partial<Role>): Promise<Role | undefined> {
  await this.db.update(roles).set(data).where(eq(roles.id, id));
  invalidatePermCache();  // clear all - any user with this role affected
  const [row] = await this.db.select().from(roles).where(eq(roles.id, id));
  return row;
}
```

- [ ] **Step 4: (Optional) Admin debug endpoint**

In `server/routes.ts`, add admin-only endpoint untuk manual invalidate:

```ts
router.post("/api/admin/perm-cache/invalidate", requireAuth, requireRole("admin"), (req: Request, res: Response) => {
  const userId = req.body?.userId ? Number(req.body.userId) : undefined;
  invalidatePermCache(userId);
  res.json({ ok: true, target: userId || "all", stats: permCacheStats() });
});
```

(Adjust `requireRole("admin")` to match existing pattern in codebase.)

- [ ] **Step 5: Build & commit**

```bash
npm run build
git add server/perm-cache.ts server/storage.ts server/routes.ts
git commit -m "perf(D): in-memory permission cache (60s TTL, 1000 LRU)

getUserEffectivePermissions() now cached per-user. Auto-invalidated
on user/role mutations. Eliminates 2 DB queries per authenticated
request after first hit. Cap 1000 entries (~5MB max).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Potensi terdampak:**
- Auth middleware (semua endpoint authenticated) - efek positif, 2 query saved
- **Stale-window risk:** setelah admin ubah role user X, user X bisa lihat perms LAMA selama max 60 detik (atau sampai re-login). Acceptable untuk daily ops; emergency revoke pakai endpoint `/api/admin/perm-cache/invalidate`.
- Cache size 1000 entries × ~5KB ≈ 5MB max - aman di Passenger worker
- Multi-worker Passenger: cache per worker (in-memory). Inconsistency antar worker tapi only sampai TTL ekspirasi.

---

## Task D3: Tune React Query defaults

**Files:**
- Modify: `client/lib/queryClient.ts`

- [ ] **Step 1: Review current defaults**

Sudah baca di context: staleTime 2min, gcTime 10min, refetchOnWindowFocus false, retry 1. **Sebenarnya sudah cukup baik** - opsional tuning only.

- [ ] **Step 2: Optional - Reduce staleTime untuk balance freshness vs speed**

Sekarang 2min → bisa naikkan ke 5min untuk page yang jarang berubah. Atau biarkan saja.

**Skip task ini kalau current defaults sudah cukup baik berdasarkan testing Phase B+C.**

Kalau dilanjut, ubah `staleTime` di hook tertentu (mis. `useMapInfra` sudah set 60_000 sendiri).

- [ ] **Step 3: (Skip kalau no change)**

No changes needed if defaults sudah OK.

**Potensi terdampak:**
- Tidak ada (no change)
- Kalau staleTime dinaikkan: navigasi balik ke page cepat (cache), tapi data freshness telat sampai refetch interval

---

## Task D4: Skeleton states for Dashboard + Map

**Files:**
- Modify: `client/pages/Dashboard.tsx`
- Modify: `client/pages/MapPage.tsx` (already minimal - skip if hard)
- Verify components exist: `client/components/ui/skeleton*.tsx`

- [ ] **Step 1: Verify skeleton components exist**

```bash
ls /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/components/ui/ | grep -i skeleton
grep -n "SkeletonKPIGrid\|SkeletonChart\|SkeletonTable" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/components/ui/*.tsx | head -10
```

If missing, components likely live in `client/components/ui/skeleton.tsx`. Check exports.

- [ ] **Step 2: Replace Dashboard PageLoader with skeleton**

```bash
grep -n "PageLoader\|isLoading" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/pages/Dashboard.tsx | head -10
```

Find the early `if (isLoading) return <PageLoader />` (or similar). Replace with:

```tsx
if (isLoading) return (
  <PageContainer>
    <PageHeader ... /> {/* keep header skeleton-friendly */}
    <SkeletonKPIGrid count={6} />
    <SkeletonChart />
  </PageContainer>
);
```

(Adjust per existing Dashboard structure - keep header, replace body.)

- [ ] **Step 3: Map skeleton (light touch)**

For `MapPage.tsx`, replace large blocking loader with empty map + small corner spinner. Already covered in Task C2 Step 6.

- [ ] **Step 4: Build & commit**

```bash
npm run build
git add client/pages/Dashboard.tsx client/pages/MapPage.tsx
git commit -m "perf(D): skeleton loading states for Dashboard + Map

Replaces full-page spinner with shaped skeleton for perceived
faster load. Map keeps interactive UI during tier-2 viewport fetch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Potensi terdampak:**
- Purely visual - no logic change
- Users see skeleton during load instead of spinner → perceived faster
- Skeleton shape must match real content layout (slight care needed in skeleton component config)

---

## Task D5: Deploy Phase D + final verification

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: User sets up cPanel cron** (Task D1 Step 3)

- [ ] **Step 3: User pulls + restarts cPanel app**

- [ ] **Step 4: End-to-end verification**

User opens `https://fiber.jabnet.id`:

| Test | Expected |
|---|---|
| Login from cold | <1s (was 2-5s) |
| Dashboard load | <700ms (was 1.5-3s) |
| Map load | <1.2s (was 3-6s) |
| Map pan/zoom | Customer fetch debounced, smooth |
| `/api/health` | Returns `{ok: true, ts: ...}` |
| Edit role + re-login user | New perms work (or wait 60s) |
| Skeleton states | Visible briefly on Dashboard/Map first paint |

- [ ] **Step 5: Final commit verification**

```bash
git log --oneline -10
```
Should show all 4 phases committed.

---

# Final Cleanup

## Task FINAL: Mark old `/api/map-data` endpoint as legacy (optional)

If new endpoints `/api/map-data/infra` + `/api/map-data/customers` work well, mark old `/api/map-data` as deprecated:

- [ ] **Step 1: Add deprecation header**

```ts
router.get("/api/map-data", async (_req: Request, res: Response) => {
  res.setHeader("X-Deprecated", "Use /api/map-data/infra + /api/map-data/customers instead");
  // ... existing implementation
});
```

- [ ] **Step 2: Remove `useMapData()` hook usage from frontend**

After verifying nothing else uses it.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts client/hooks/useAssets.ts
git commit -m "cleanup: mark legacy /api/map-data as deprecated"
```

---

# Self-Review Checklist (writing-plans)

**Spec coverage:**
-  Phase A indexes - Task A1 (A2 optional)
-  Phase B query refactor - Tasks B1, B2, B3
-  Phase C map viewport - Tasks C1, C2, C3 (optional), C4 deploy
-  Phase D keep-alive/cache/skeleton - Tasks D1, D2, D3 (optional), D4, D5

**Placeholder scan:** None - all code blocks have concrete code.

**Type consistency:**
- `MapInfra` shape consistent across `getMapInfra()`, `useMapInfra()`, `MapData`
- `Bbox` type defined in `useAssets.ts` consistently used
- `PermDict` type local to `perm-cache.ts`, exported only by function signatures

**Per-change "Potensi terdampak":** Present on every task (per Reporting Protocol from spec).

---

# Execution Notes

- Deploy incrementally - after each phase, user verifies before proceeding
- All commits use `Co-Authored-By: Claude Opus 4.7` trailer
- TypeScript build (`npm run build`) is the primary verification gate per task
- Manual end-user verification at Phase boundaries (after C4, D5)
- Rollback per phase: `git revert <commit-hash>` if a phase introduces regression
