# Design — Performance Optimization (Load Time + Maps)

**Date:** 2026-05-16
**Status:** Approved for implementation
**Scope:** Full optimization (Phase A-D)

## Reporting Protocol

Setiap perubahan yang dikerjakan WAJIB dilaporkan dengan format ini di pesan ke user:

```
✏️ Diubah: <file>:<line range or function>
   <ringkasan apa yang berubah>

⚠️ Potensi terdampak:
   - <feature/endpoint/page lain yang mungkin kena>
   - <perilaku yang bisa berubah dari user perspective>
   - <call site yang share code path ini>

✅ Verifikasi yang harus dijalankan:
   - <step manual test atau perintah cek>
```

Aturan untuk "Potensi terdampak":
- **Jika menyentuh storage.ts method**: list SEMUA route yang panggil method tersebut (grep di routes.ts + customer-portal-routes.ts + public-api-routes.ts + workers)
- **Jika menyentuh schema/index**: list query yang sekarang pakai kolom tsb (kalau index baru: efek positif; kalau ALTER kolom: efek breaking)
- **Jika menyentuh middleware/auth**: SELURUH endpoint authenticated terdampak
- **Jika menyentuh shared types**: list page/component yang import type tsb
- **Jika menyentuh React Query keys/staleTime**: list page yang invalidate atau consume key tsb

## Context

JABNET Workspace baru migrasi dari SQLite ke MySQL (cPanel). User report lambat saat:
1. Login (cold + warm)
2. Loading data (Dashboard, lists)
3. Google Maps page dengan ODP/leads/customer markers
4. Status perangkat real-time

### Bottleneck yang teridentifikasi (analisis pre-design)

- **Missing indexes**: `users.token` (auth middleware tiap request full scan), `customers.odp_id`, `customers.status`, `customers.(lat,lng)`, `audit_logs.created_at`, `audit_logs.user_id`, `cable_cores.cable_id`, `leads.(lat,lng)`, `collections.status`, `tickets.status`
- **N+1 di `getDashboardStats()`** (`storage.ts:4312`): loop ODPs lalu query utilization per ODP — ~18-20 queries total
- **`getMapData()` (`storage.ts:4686`)** SELECT * 6 tabel paralel, customers full row 25+ kolom termasuk pppoe credentials, tidak ada bbox filter
- **Read-back pattern setelah Phase 1B refactor**: setiap INSERT/UPDATE Pattern A/B = 2 roundtrip (insert/update → select by id). Login: 11 roundtrip total
- **Dashboard load 10 API call paralel** competing for MySQL pool (limit 10)
- **Passenger cold start di cPanel**: idle >5 min = spin-down, request pertama 2-5s
- **MapPage**: customer markers di luar MarkerClusterer (line 956) → 2000+ raw marker saat zoom out
- **React Query defaults**: staleTime 0 → setiap navigasi refetch

---

## Architecture

Optimisasi dipecah 4 phase yang di-deploy incremental. Setiap phase mandiri dan bisa di-rollback independent.

```
Phase A (DB Indexes)
    ↓
Phase B (Backend Query Refactor)
    ↓
Phase C (Map Viewport Loading)
    ↓
Phase D (Keep-alive + Cache + Skeleton)
```

Tidak ada parallel agent — sequential agar setiap phase verified sebelum next.

---

## Phase A — Database Indexes

### Goal
Eliminasi full-table scan di hot paths.

### Indexes baru

| Index | Tabel | Kolom | Manfaat |
|---|---|---|---|
| `idx_users_token` | `users` | `token` | Auth middleware tiap request — dari full scan jadi O(log n) |
| `idx_customers_odp_id` | `customers` | `odp_id` | ODP utilization & map filter |
| `idx_customers_status` | `customers` | `status` | Dashboard active count, filter UI |
| `idx_customers_lat_lng` | `customers` | `(lat, lng)` composite | Map viewport bbox query (Phase C) |
| `idx_audit_logs_created` | `audit_logs` | `created_at DESC` | Dashboard recent activity |
| `idx_audit_logs_user` | `audit_logs` | `user_id` | User activity timeline |
| `idx_cable_cores_cable` | `cable_cores` | `cable_id` | Cable detail page |
| `idx_leads_lat_lng` | `leads` | `(lat, lng)` | Map viewport bbox |
| `idx_collections_status` | `collections` | `status` | Pipeline & dashboard |
| `idx_tickets_status` | `tickets` | `status` | Dashboard ticket count |

### Implementation

1. Tambah `index("...").on(...)` di `shared/schema.ts` per table — Drizzle generate `CREATE INDEX` di migration
2. **Startup auto-migration block** di `server/storage.ts` atau `server/index.ts`:
   ```ts
   // Idempotent — gunakan IF NOT EXISTS pattern
   const indexes = [
     { table: "users", name: "idx_users_token", cols: "token" },
     { table: "customers", name: "idx_customers_odp_id", cols: "odp_id" },
     // ...
   ];
   for (const ix of indexes) {
     await pool.execute(
       `SELECT COUNT(*) AS c FROM information_schema.statistics
        WHERE table_schema=DATABASE() AND table_name=? AND index_name=?`,
       [ix.table, ix.name]
     ).then(([rows]) => {
       const exists = (rows as any)[0].c > 0;
       if (!exists) {
         return pool.execute(`CREATE INDEX ${ix.name} ON ${ix.table}(${ix.cols})`);
       }
     });
   }
   ```

3. Update `shared/schema.ts` `index()` definitions sehingga next clean install dapat indexes via Drizzle migration.

### Verification
- `SHOW INDEX FROM users` di cPanel phpMyAdmin → confirm `idx_users_token` exists
- `EXPLAIN SELECT * FROM users WHERE token='xxx'` → `type: ref`, `key: idx_users_token`

### Per-change impact analysis

| Index | Diubah | Potensi terdampak |
|---|---|---|
| `idx_users_token` | `users` table (read-only DDL) | **Positif:** seluruh authenticated endpoint (~150+). **Risk:** index build saat ALTER table — tabel kecil <100 row, instant |
| `idx_customers_odp_id` | `customers` table | **Positif:** ODP utilization, map filter, Dashboard. **Risk:** index build pada 1000+ row — ~<1s, blok ALTER tapi tidak crash |
| `idx_customers_status` | `customers` table | **Positif:** Dashboard count, Customer list filter. **Risk:** sama |
| `idx_customers_lat_lng` composite | `customers` table | **Positif:** Phase C bbox query. **Risk:** sama |
| `idx_audit_logs_created` | `audit_logs` table | **Positif:** Dashboard recent activity, UserDetailDrawer activity tab. **Risk:** audit_logs bisa besar — index build mungkin 1-2s lock |
| `idx_audit_logs_user` | `audit_logs` table | **Positif:** UserDetailDrawer, user-specific timeline. **Risk:** sama |
| `idx_cable_cores_cable` | `cable_cores` table | **Positif:** CableCoreManagerPage, core connection list. **Risk:** minimal |
| `idx_leads_lat_lng` | `leads` table | **Positif:** Map heatmap, lead viewport query (Phase C). **Risk:** minimal |
| `idx_collections_status` | `collections` table | **Positif:** Pipeline page, Dashboard. **Risk:** minimal |
| `idx_tickets_status` | `tickets` table | **Positif:** Tickets page, Dashboard. **Risk:** minimal |

**General risk:** kalau MySQL versi cPanel <5.7, online ALTER bisa lock table — tapi semua tabel target relatif kecil, downtime <5 detik per index. Deploy off-peak (malam) untuk safety.

---

## Phase B — Backend Query Refactor

### B.1 `getDashboardStats()` — N+1 → ~2 queries

**Current (`storage.ts:4312`):** ~18-20 query (loop ODPs × utilization).

**Refactored:**
```ts
async getDashboardStats(): Promise<DashboardStats> {
  const [[aggregate], [odpUsage]] = await Promise.all([
    this.pool.execute<RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(*) FROM customers) AS customer_total,
        (SELECT COUNT(*) FROM customers WHERE status='active' AND is_isolir=0) AS customer_active,
        (SELECT COUNT(*) FROM customers WHERE is_isolir=1) AS customer_isolir,
        (SELECT COUNT(*) FROM odps) AS odp_total,
        (SELECT COALESCE(SUM(capacity), 0) FROM odps) AS odp_capacity,
        (SELECT COUNT(*) FROM pops) AS pop_total,
        (SELECT COUNT(*) FROM odcs) AS odc_total,
        (SELECT COUNT(*) FROM tickets WHERE status='open') AS tickets_open,
        (SELECT COUNT(*) FROM collections WHERE status='open') AS collections_open,
        (SELECT COUNT(*) FROM leads WHERE status NOT IN ('won','lost')) AS leads_active
    `),
    this.pool.execute<RowDataPacket[]>(`
      SELECT odp_id, COUNT(*) as used
      FROM customers WHERE odp_id IS NOT NULL GROUP BY odp_id
    `),
  ]);
  // Compose response from rows...
}
```

Target: <200ms (dari ~1.5s).

**Diubah:** `server/storage.ts:4312` — `getDashboardStats()` body
**Potensi terdampak:**
- `GET /api/dashboard` (consumer: `Dashboard.tsx` via `useDashboard()` hook)
- Public API endpoint kalau ada (`/api/public/v1/marketing/overview` mungkin pakai aggregate yang sama — perlu cek)
- Shape `DashboardStats` di `shared/schema.ts` — kalau ada field yang dihilangkan akan break frontend
- **Risk perilaku:** angka `customer_active` sekarang exclude isolir secara eksplisit. Cek apakah Dashboard sebelumnya count beda.

### B.2 `getMapData()` — Light projection

**Current:** SELECT * dari 6 tabel.

**Refactored:**
```ts
async getMapData(): Promise<MapData> {
  const [allPops, allOdcs, rawOdps, allCustomers, allPoles, allCables] = await Promise.all([
    this.db.select({
      id: pops.id, name: pops.name, code: pops.code,
      lat: pops.lat, lng: pops.lng, status: pops.status
    }).from(pops),
    this.db.select({
      id: odcs.id, name: odcs.name, code: odcs.code,
      lat: odcs.lat, lng: odcs.lng, status: odcs.status, popId: odcs.popId
    }).from(odcs),
    this.db.select({
      id: odps.id, name: odps.name, code: odps.code,
      lat: odps.lat, lng: odps.lng, capacity: odps.capacity,
      odcId: odps.odcId, status: odps.status
    }).from(odps),
    // Customers — DROP pppoe credentials, notes, manual_overrides, etc.
    this.db.select({
      id: customers.id, name: customers.name, customerId: customers.customerId,
      lat: customers.lat, lng: customers.lng, status: customers.status,
      isIsolir: customers.isIsolir, odpId: customers.odpId
    }).from(customers),
    this.db.select({
      id: poles.id, name: poles.name, lat: poles.lat, lng: poles.lng, type: poles.type
    }).from(poles),
    this.db.select({
      id: cables.id, name: cables.name, code: cables.code,
      cableType: cables.cableType
    }).from(cables),
  ]);
  // ... usedCapacity compute as before
}
```

Payload reduction estimate: customer row ~800B → ~120B. 2000 customers: **1.6MB → 240KB**.

**Diubah:** `server/storage.ts:4686` — `getMapData()` SELECT projections
**Potensi terdampak:**
- `GET /api/map-data` (consumer: `MapPage.tsx` via `useMapData()`)
- `MapData` type di `shared/schema.ts` — kalau field di-drop tapi type masih ada, TS error
- Map info window display — saat ini mungkin pakai `customer.notes` / `customer.address` / `pppoe_username` di marker click. **PERLU CEK** `MapInfoWindow.tsx` apakah ada akses kolom yang di-drop.
- Sebelum perubahan: marker info popup punya akses semua data customer. Sesudah: cuma field minimal. **Solusi:** fetch full customer detail on-demand via `GET /api/customers/:id` saat marker di-click.

### B.3 `createAuditLog()` — Skip read-back + fire-and-forget

**Current:** INSERT + SELECT-by-id (Pattern A from Phase 1B).

**Refactored:**
```ts
async createAuditLog(data: InsertAuditLog): Promise<void> {
  // No return value needed - caller doesn't use it
  await this.db.insert(auditLogs).values(data);
}
```

Update call sites di `routes.ts`:
- Login flow, GET endpoints, side-effect actions: panggil tanpa await (`void this.storage.createAuditLog(...)`)
- Sisanya tetap await jika urutan kritis

Login estimate: **11 roundtrip → 5 roundtrip**.

**Diubah:** `server/storage.ts` `createAuditLog()` method + ALL call sites di `routes.ts`, `customer-portal-routes.ts`, `public-api-routes.ts`, workers
**Potensi terdampak:**
- Return type berubah dari `Promise<AuditLog>` jadi `Promise<void>` — kalau ada caller yang pakai return value akan break (perlu grep cek)
- Fire-and-forget: kalau insert gagal (DB down), error tidak ke-handle — perlu `.catch(err => console.error(...))` di call site
- Activity log timestamp: sebelum dapat real DB timestamp (autoincrement + DB clock), sesudah pakai input time. Kalau penting akurat, set `createdAt: new Date().toISOString()` di caller.
- **Audit log integrity:** untuk action sensitif (delete user, role change, manual override) — TETAP await, jangan fire-and-forget. Hanya hot-path read endpoint yang fire-and-forget.

### B.4 `getUserByToken()` — Pakai Phase A index

Sudah pakai `SELECT *` — biarkan, tapi pastikan via `idx_users_token` (Phase A). Optional: light projection di middleware (drop password, token).

**Diubah:** `server/storage.ts` `getUserByToken()` (mungkin) + Phase A `idx_users_token`
**Potensi terdampak:**
- Auth middleware di SEMUA endpoint authenticated — kalau projection di-thin, perlu cek apakah middleware butuh field yang di-drop (mis. `passwordHash`, `lastLogin`)
- Sebelum: `req.user` punya semua kolom user. Sesudah: cuma `id, username, role, isActive`. Cek `routes.ts` mana yang akses `req.user.X` field lain.

---

## Phase C — Map Viewport Loading

### C.1 Tier strategy

| Tier | Entity | Strategy |
|---|---|---|
| **Tier 1** (always loaded) | POPs, ODCs, ODPs, Poles, Cables | Light projection, full set (<500 entities total) |
| **Tier 2** (viewport-only) | Customers, Leads | Bbox query, max 500 results, fetched on map idle |

### C.2 New endpoints

```
GET /api/map-data
  → Returns Tier 1 only: { pops, odcs, odps, poles, cables }
  → Same shape as before but no customers

GET /api/map-data/customers?bbox=swLat,swLng,neLat,neLng
  → Returns Tier 2: customers in viewport, limit 500
  → SQL: WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 500
  → Uses idx_customers_lat_lng composite index

GET /api/map-data/leads?bbox=...
  → Same pattern for leads (if Map page exposes leads)
```

### C.3 Frontend changes (`client/pages/MapPage.tsx`)

1. Replace single `useMapData()` with:
   ```ts
   const { data: infra } = useMapInfra();  // Tier 1
   const [bbox, setBbox] = useState<Bbox | null>(null);
   const { data: customers } = useMapCustomers(bbox);  // Tier 2
   ```

2. Add `onIdle` handler to `<GoogleMap>`:
   ```tsx
   <GoogleMap
     onIdle={() => {
       const b = mapRef?.getBounds();
       if (!b) return;
       const sw = b.getSouthWest(); const ne = b.getNorthEast();
       const newBbox = { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() };
       setBbox(newBbox);  // useDebounce inside hook (300ms)
     }}
     ...
   />
   ```

3. New hook `useMapCustomers(bbox)`:
   ```ts
   export function useMapCustomers(bbox: Bbox | null) {
     return useQuery({
       queryKey: ['map', 'customers', bbox],
       queryFn: () => api.get(`/map-data/customers?bbox=${bbox!.swLat},${bbox!.swLng},${bbox!.neLat},${bbox!.neLng}`),
       enabled: !!bbox,
       staleTime: 30_000,
     });
   }
   ```

4. **Move customer markers INTO MarkerClusterer** (currently outside per line 956). Cluster up to zoom 14, individual marker from zoom 15+.

5. Skeleton state per tier: tier 1 loaded → show map immediately. Tier 2 loading → small spinner di corner-bottom-right.

### C.4 Device/PPP status batch

User mention "status perangkat saat ini". Current state:
- `customers.status` + `customers.isIsolir` sudah ada di customer row
- Real-time PPP status di `traffic_snapshots` table (worker poll 15min)

**New endpoint:**
```
POST /api/map-data/customers/status
Body: { ids: [1, 2, 3, ...] }
→ Returns: [{ id, pppOnline: true, rxPower: -22.3, lastSeen: "..." }]
→ Cached 30s server-side
```

Fetch only for customers IN viewport (max 500). Refresh on user click "Refresh status" — no auto-poll.

### C.5 Per-change impact analysis

**Diubah: `GET /api/map-data` (response shape)**
- **Potensi terdampak:** Map page hanya menerima Tier 1 sekarang (tanpa customers). MapPage WAJIB tambah `useMapCustomers()` call atau marker customer tidak akan muncul.
- **Backward-compat option:** kalau `?bbox=` tidak ada di query, tetap return customers (legacy). Default behavior baru: bbox-filtered.

**Diubah: `client/pages/MapPage.tsx` (1262 baris)**
- **Potensi terdampak:** 
  - File besar, banyak state — penambahan `bbox` state + `onIdle` handler harus tidak konflik dengan canvassing flow + cable drawing flow + snap preview yang sudah ada
  - MarkerClusterer yang sekarang hanya cluster ODP — sekarang juga cluster customer. Performa rendering bisa beda (positif: lebih cepat saat zoom out).
  - InfoWindow content: kalau sebelumnya tampilkan field lengkap customer (notes, package, dll), sekarang field minimal → harus fetch detail on-click via `GET /api/customers/:id`

**Diubah: `client/hooks/useAssets.ts` — split `useMapData` jadi `useMapInfra` + `useMapCustomers`**
- **Potensi terdampak:** 
  - SEMUA invalidation `queryKeys.mapData` di `useCrud` (line 56, 75, 93) — perlu tambah invalidate `['map', 'infra']` dan `['map', 'customers']`
  - Mutation di customer create/update/delete saat ini invalidate `mapData` — sekarang juga harus invalidate viewport query

**Diubah: New endpoint `/api/map-data/customers/status` (PPP batch)**
- **Potensi terdampak:**
  - Tambah load ke `traffic-snapshot-worker` data — read-only, tidak impact
  - Cache 30s server-side: pakai in-memory Map, tidak perlu Redis
  - Customer portal `/api/portal/traffic/live` (poll 3 detik) — TIDAK terpengaruh, beda endpoint beda customer

---

## Phase D — Keep-Alive + Cache + Skeleton

### D.1 Passenger keep-alive

New endpoint `GET /api/health`:
```ts
router.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
```

cPanel cron (user adds via cPanel UI):
```
*/4 * * * * curl -s https://fiber.jabnet.id/api/health > /dev/null
```

Every 4 min ping keeps Passenger from spinning down idle Node process.

### D.2 In-memory permission cache

```ts
// server/perm-cache.ts (new file)
const permCache = new Map<number, { perms: Record<string, "none"|"read"|"write">, expires: number }>();
const TTL = 60_000;
const MAX = 1000;

export function getCachedPerms(userId: number) {
  const hit = permCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.perms;
  return null;
}

export function setCachedPerms(userId: number, perms: any) {
  if (permCache.size >= MAX) {
    // Simple LRU: drop oldest entry
    const firstKey = permCache.keys().next().value;
    if (firstKey !== undefined) permCache.delete(firstKey);
  }
  permCache.set(userId, { perms, expires: Date.now() + TTL });
}

export function invalidatePermCache(userId?: number) {
  if (userId) permCache.delete(userId);
  else permCache.clear();
}
```

Wire into `storage.ts`:
- `getUserEffectivePermissions()` → check cache first, set on miss
- `updateRole()`, `updateUser()` (when role changes), `createUser()`, `deleteUser()` → invalidate

### D.3 Skeleton states

- Dashboard: `<SkeletonKPIGrid>` + `<SkeletonChart>` per chart slot (replace `<PageLoader>`)
- Map: empty map + corner spinner during tier-2 fetch
- Lists (Customers/Leads/Collections): `<SkeletonTable rows={8} />`

### D.4 React Query defaults

`client/lib/queryClient.ts`:
```ts
defaultOptions: {
  queries: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  }
}
```

### D.5 Per-change impact analysis

**Diubah: `GET /api/health` (new endpoint)**
- **Potensi terdampak:** Public, no auth. Risk: bisa di-DOS. Mitigasi: lightweight handler (return JSON langsung tanpa DB call), rate limit di Express middleware kalau sudah ada
- Setup cron manual di cPanel UI → tidak otomatis, user perlu klik

**Diubah: `server/perm-cache.ts` (new file) + wire ke `getUserEffectivePermissions()` + invalidation hooks**
- **Potensi terdampak:**
  - SEMUA endpoint authenticated yang cek permission via `hasPermission()` / `hasWritePermission()` middleware
  - Setelah admin ubah role user, user yang sedang login bisa lihat permissions LAMA selama max 60 detik (TTL). Acceptable trade-off untuk daily ops, tapi mungkin tidak untuk emergency revoke akses.
  - **Solusi emergency:** endpoint `POST /api/admin/perm-cache/invalidate` (admin only) untuk force-clear cache
  - Memory: 1000 entries × ~5KB per perm dict ≈ 5MB max — aman di Passenger worker

**Diubah: `client/lib/queryClient.ts` defaults**
- **Potensi terdampak:** SEMUA `useQuery` di seluruh app — efeknya:
  - User edit data, lalu navigasi page, lalu kembali → mungkin lihat data 30s lama (sebelum auto-refetch)
  - Mutation tetap invalidate manual — kalau pake `invalidateQueries` setelah mutation, data tetap fresh
  - **Risk:** ada page yang asumsi data selalu fresh tiap mount (mis. realtime dashboard). Override per-hook dengan `staleTime: 0` kalau perlu.
  - `refetchOnWindowFocus: false` — kalau user multi-tab + edit di tab lain, tab pertama tidak auto-refresh. Solusi: pakai TanStack Query devtools untuk debug, atau aktif kembali kalau ada complaint.

**Diubah: Skeleton states di Dashboard.tsx + MapPage.tsx + list pages**
- **Potensi terdampak:** pure visual — tidak ada perubahan logic/data. Tapi loading state behavior beda (skeleton vs spinner) → user familiar mungkin bingung sebentar.

---

## Expected Impact

| Metric | Before | After (estimated) |
|---|---|---|
| Login (warm) | 600-900ms | 250-400ms |
| Login (cold start) | 2.5-5s | 400-700ms (keep-alive eliminates cold) |
| Dashboard load | 1.5-3s | 400-700ms |
| Map load | 3-6s | 700ms-1.2s |
| Map pan/zoom | Full refetch | Debounced viewport fetch |
| Page navigation | Always refetch | Instant (cache) |

---

## Files Touched

| File | Phase | Changes |
|---|---|---|
| `shared/schema.ts` | A | Add `index()` defs |
| `server/storage.ts` | A, B, D | Add migration block, refactor `getDashboardStats`, `getMapData`, `createAuditLog`, wire perm cache |
| `server/routes.ts` | B, C, D | `/api/health`, new map endpoints, audit log call sites fire-and-forget |
| `server/perm-cache.ts` | D | New file |
| `client/pages/MapPage.tsx` | C | onIdle handler, viewport state, marker clusterer fix |
| `client/hooks/useAssets.ts` | C | `useMapInfra`, `useMapCustomers` hooks |
| `client/lib/queryClient.ts` | D | Defaults |
| `client/pages/Dashboard.tsx` | D | Skeleton states |

---

## Risk Assessment

| Phase | Risk | Mitigation |
|---|---|---|
| A — Indexes | Sangat rendah. ALTER TABLE CREATE INDEX safe di MySQL, idempotent | Test di local dulu, deploy off-peak |
| B — Query refactor | Rendah. Logic preserved, hanya optimasi | Test endpoint manually post-deploy |
| C — Map viewport | Medium. UX change — Map behavior berbeda saat pan | Keep fallback: `?bbox=` optional, kalau tidak ada return all (limit 1000) |
| D — Keep-alive + cache | Rendah. Cache invalidation paths tertentu, kalau ada bug user lihat stale perms <60s | Manual invalidate endpoint untuk debugging |

---

## Deploy Strategy

Incremental — commit/push setelah tiap phase:

1. **Phase A**: commit "perf: add DB indexes for hot paths" → push → GHA build → cPanel pull → restart → verify
2. **Phase B**: commit "perf: refactor dashboard + map queries, async audit logs" → ...
3. **Phase C**: commit "perf: map viewport-based loading" → ...
4. **Phase D**: commit "perf: keep-alive, perm cache, skeleton states" → ...

Setelah Phase D, user setup cPanel cron job manually (1 line, di cPanel UI).

---

## Verification per Phase

**Phase A:**
- `SHOW INDEX FROM users` shows `idx_users_token`
- `EXPLAIN SELECT * FROM users WHERE token=?` shows `type: ref`
- Login still works admin/Admin@1234

**Phase B:**
- Dashboard loads <700ms (browser DevTools Network)
- Map data response <500KB (was ~1.5MB)
- Audit logs masih masuk DB

**Phase C:**
- Map page load <1.5s pertama
- Pan/zoom debounced (tidak fetch tiap pixel)
- Customers di-cluster sampai zoom 14

**Phase D:**
- `/api/health` returns `{ ok: true }`
- Permission cache hit logs (optional debug)
- Skeleton visible saat first paint
- No regressions di TanStack Query staleness
