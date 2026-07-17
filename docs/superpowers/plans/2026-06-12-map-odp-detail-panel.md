# ODP Mini-Dashboard on /map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking an ODP on /map opens a rich, lazy-loaded mini-dashboard: capacity/utilization, customer-count metrics, connected-customer list with status badges + link to the customer page, and per-customer ACS optical power (RX/TX, status, last inform, uptime) with configurable thresholds — mobile bottom-sheet, desktop dialog.

**Architecture:** Two new lazy endpoints (`/api/odps/:id/detail` = DB-only fast payload; `/api/odps/:id/ont-status` = ACS query, fetched second), pure shared helpers for status/optical classification (tested), an extracted DRY device-matching module reused by the existing `/api/customers/ont-status`, and one `OdpDetailPanel` component hosted responsively (BottomSheet on mobile, Dialog on desktop) replacing the cramped ODP InfoWindow. Search results gain customer→ODP relation + server-backed customer search.

**Tech Stack:** React 18 + TanStack Query 5 + @react-google-maps/api (client), Express 5 + Drizzle MySQL + GenieACS NBI (server). Tests: `npx tsx --test`.

**Branch:** `dev` directly; user pushes. Commits end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Verified background facts (do not re-derive)

- ODP click today: `MapPage.tsx:992` → `setSelectedInfo({type:"odp", data: odpWithUtil…})` → desktop `<InfoWindow>` line 1092 / mobile `<BottomSheet>` line 1280, both render shared `MapInfoWindowContent` (`client/components/map/MapInfoWindow.tsx`) — ODP branch shows Kode/Splitter/PortBar/list nama pelanggan (viewport-limited via `customersByOdp` memo at MapPage:845).
- `odps` schema (shared/schema.ts:53): `name, code, odcId, lat, lng, capacity (default 8), usedCapacity, splitterType, status, address, district, village, notes`.
- `customers` schema (shared/schema.ts:84+): `odpId, portNumber, customerId (text billing id), name, package, status (varchar default "active"), isIsolir (int), billingStatus, phone, address, pppoeUsername, ontSerialNumber, dueDate…` — index `idx_customers_odp_id` exists.
- `/api/odps/utilization` (routes.ts:2573) computes used = COUNT of customers per ODP (not `usedCapacity` column). Use the same semantics.
- GenieACS: `server/genieacs.ts` — `getDevices(config, query?, limit, skip)` light-parses devices incl. `rxPower` (lines 246–254, decode `>100 → (n/100)-40`), `lastInform`, `uptime` (line 225), `status` (online = lastInform < 300s), `serialNumber`, `ponSerialNumber`, `pppoeUsername`. **No `txPower` parsed yet.** `ParsedDevice` interface at line 44.
- Existing bulk matcher: `GET /api/customers/ont-status` (routes.ts:2966–3041) fetches up to 10 000 devices, builds `byPppoe/bySn/byPonSn` maps, matches each customer (pppoe → factory SN → PON SN). This matching block is what we extract to `server/ont-match.ts`.
- `getGenieConfig()` (routes.ts:10689) — settings keys `genieacs_host/port/username/password` via mitra-aware `pick()`. Settings UI lives in `client/pages/IntegrationPage.tsx` 1256–1365, saved via `PUT /api/settings/bulk` with `{settings:[{key,value,category,label}]}`.
- Hardcoded RX thresholds today: GenieAcsDevicesPage.tsx:166–180 and portal PortalDashboardPage.tsx:330–340 (`> -25` good, `-25…-28` warn, `< -28` bad). New configurable settings must default to the same numbers.
- Response cache util: `server/route-cache.ts` — `getCached<T>(key)`, `setCached(key, data, ttlMs)`.
- Customer page has NO `/customers/:id` route; it supports deep-link `/customers?q=<text>` (CustomersPage.tsx:863, already used by GenieACS page). Shortcut buttons must navigate there.
- Map search: `client/components/map/MapSearchBar.tsx` (187 lines) searches client-side over `data.{pops,odcs,odps,customers,…}`; customers are **viewport-only** (`useMapCustomers(bbox)`); `onResultClick(result)` pans/zooms (MapPage:837 `handleSearchResultClick`).
- Mobile sheet: `client/components/shared/BottomSheet.tsx` — props `{open, onClose, title?, height?: "sm"|"md"|"lg"|"full"}`.
- Desktop floating-panel precedent: `CableDetailPanel` (MapPage.tsx:399) = `<Dialog><DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">`.
- `useIsMobile`-style flag exists in MapPage as `isMobile`; permission guard for map routes: `requirePermission(req, res, "map")`.
- Tests run: `npx tsx --test shared/*.test.ts client/lib/*.test.ts client/components/pipelines/*.test.ts server/*.test.ts` (server has *.test.ts precedent: billing-admin-helpers.test.ts).

---

### Task 1: Shared customer-connection-status helper

**Files:**
- Create: `shared/customerStatus.ts`
- Create: `shared/customerStatus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/customerStatus.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { customerConnStatus, CUSTOMER_STATUS_META } from "./customerStatus.js";

test("isolir flag wins regardless of status text", () => {
  assert.equal(customerConnStatus({ isIsolir: 1, status: "active" }), "isolir");
  assert.equal(customerConnStatus({ isIsolir: 1, status: null }), "isolir");
});

test("status text classification", () => {
  assert.equal(customerConnStatus({ isIsolir: 0, status: "active" }), "active");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "Aktif" }), "active");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "suspend" }), "suspend");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "suspended" }), "suspend");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "terminated" }), "terminated");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "terminate" }), "terminated");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "isolir" }), "isolir");
});

test("default column value 'active' and unknown strings", () => {
  assert.equal(customerConnStatus({ isIsolir: 0, status: undefined }), "unknown");
  assert.equal(customerConnStatus({ isIsolir: 0, status: "weird" }), "unknown");
  assert.equal(customerConnStatus({}), "unknown");
});

test("every status has display meta", () => {
  for (const k of ["active", "isolir", "suspend", "terminated", "unknown"] as const) {
    assert.ok(CUSTOMER_STATUS_META[k].label.length > 0);
    assert.ok(CUSTOMER_STATUS_META[k].variant.length > 0);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test shared/customerStatus.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// shared/customerStatus.ts
/** Pure classification of a customer's connection status for badges/metrics.
 *  Shared client + server (ODP detail panel, map, counts). No React, no DB. */

export type CustomerConnStatus = "active" | "isolir" | "suspend" | "terminated" | "unknown";

const ACTIVE = new Set(["active", "aktif"]);
const SUSPEND = new Set(["suspend", "suspended"]);
const TERMINATED = new Set(["terminated", "terminate", "terminasi", "churn"]);

export function customerConnStatus(c: { isIsolir?: number | null; status?: string | null }): CustomerConnStatus {
  if ((c.isIsolir ?? 0) === 1) return "isolir";
  const s = c.status?.trim().toLowerCase();
  if (!s) return "unknown";
  if (ACTIVE.has(s)) return "active";
  if (s === "isolir") return "isolir";
  if (SUSPEND.has(s)) return "suspend";
  if (TERMINATED.has(s)) return "terminated";
  return "unknown";
}

/** Badge label + StatusBadge variant per status. */
export const CUSTOMER_STATUS_META: Record<CustomerConnStatus, { label: string; variant: "success" | "danger" | "warning" | "neutral" }> = {
  active:     { label: "Aktif",     variant: "success" },
  isolir:     { label: "Isolir",    variant: "danger" },
  suspend:    { label: "Suspend",   variant: "warning" },
  terminated: { label: "Terminasi", variant: "neutral" },
  unknown:    { label: "Unknown",   variant: "neutral" },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test shared/customerStatus.test.ts` → PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/customerStatus.ts shared/customerStatus.test.ts
git commit -m "feat(shared): customerConnStatus helper — klasifikasi status pelanggan untuk badge/metrics

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared optical-power classification helper (configurable thresholds)

**Files:**
- Create: `shared/opticalPower.ts`
- Create: `shared/opticalPower.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/opticalPower.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOpticalPower, DEFAULT_OPTICAL_THRESHOLDS, OPTICAL_LEVEL_META } from "./opticalPower.js";

const T = DEFAULT_OPTICAL_THRESHOLDS; // { warn: -25, crit: -28 }

test("defaults match existing hardcoded UI thresholds (-25 / -28)", () => {
  assert.equal(T.warn, -25);
  assert.equal(T.crit, -28);
});

test("classification with default thresholds", () => {
  assert.equal(classifyOpticalPower(-21.5, T), "good");
  assert.equal(classifyOpticalPower(-25, T), "good");      // boundary: >= warn is good
  assert.equal(classifyOpticalPower(-26.2, T), "warn");
  assert.equal(classifyOpticalPower(-28, T), "warn");      // boundary: >= crit is warn
  assert.equal(classifyOpticalPower(-30.1, T), "crit");
});

test("accepts string input (API returns rxPower as string)", () => {
  assert.equal(classifyOpticalPower("-21.5", T), "good");
  assert.equal(classifyOpticalPower("-29", T), "crit");
});

test("unknown for missing/garbage values", () => {
  assert.equal(classifyOpticalPower(null, T), "unknown");
  assert.equal(classifyOpticalPower(undefined, T), "unknown");
  assert.equal(classifyOpticalPower("", T), "unknown");
  assert.equal(classifyOpticalPower("abc", T), "unknown");
  assert.equal(classifyOpticalPower(0, T), "good"); // 0 dBm is a valid (hot) reading, not unknown
});

test("custom thresholds honored (per-ISP configurable)", () => {
  assert.equal(classifyOpticalPower(-24, { warn: -23, crit: -26 }), "warn");
  assert.equal(classifyOpticalPower(-27, { warn: -23, crit: -26 }), "crit");
});

test("every level has display meta", () => {
  for (const k of ["good", "warn", "crit", "unknown"] as const) {
    assert.ok(OPTICAL_LEVEL_META[k].label.length > 0);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test shared/opticalPower.test.ts` → FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// shared/opticalPower.ts
/** Pure optical-power (dBm) classification. Thresholds are CONFIGURABLE per ISP via
 *  app_settings (optical_rx_warn / optical_rx_crit) — never hardcode in UI; defaults
 *  mirror the legacy hardcoded values (-25 / -28) used by GenieACS page + portal. */

export type OpticalLevel = "good" | "warn" | "crit" | "unknown";
export type OpticalThresholds = { warn: number; crit: number };

export const DEFAULT_OPTICAL_THRESHOLDS: OpticalThresholds = { warn: -25, crit: -28 };

export function classifyOpticalPower(
  value: number | string | null | undefined,
  t: OpticalThresholds,
): OpticalLevel {
  if (value === null || value === undefined || value === "") return "unknown";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "unknown";
  if (n >= t.warn) return "good";
  if (n >= t.crit) return "warn";
  return "crit";
}

export const OPTICAL_LEVEL_META: Record<OpticalLevel, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  good:    { label: "Normal",   variant: "success" },
  warn:    { label: "Warning",  variant: "warning" },
  crit:    { label: "Critical", variant: "danger" },
  unknown: { label: "N/A",      variant: "neutral" },
};
```

- [ ] **Step 4: Run to verify pass** → `npx tsx --test shared/opticalPower.test.ts` PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/opticalPower.ts shared/opticalPower.test.ts
git commit -m "feat(shared): classifyOpticalPower — threshold configurable, default -25/-28 dBm

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: GenieACS — parse TX power

**Files:**
- Modify: `server/genieacs.ts` (ParsedDevice interface ~line 44–63; rx parse block ~246–254; return object ~374–378)

- [ ] **Step 1: Add `txPower` to the interface**

In the `ParsedDevice` interface, directly under `rxPower: string;` add:
```ts
  txPower: string;
```

- [ ] **Step 2: Parse TX next to the RX block**

The existing RX block is:
```ts
  let rxPower = "";
  const rxRaw = val(raw, "VirtualParameters.RXPower")
    || val(raw, "InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower");
```
Directly AFTER that whole rx block (after `rxPower` is assigned), add:
```ts
  // TX power — same decode rule as RX (value > 100 → (n/100) - 40 dBm)
  let txPower = "";
  const txRaw = val(raw, "VirtualParameters.TXPower")
    || val(raw, "InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.TXPower")
    || val(raw, "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower");
  if (txRaw !== undefined && txRaw !== null && txRaw !== "") {
    const num = Number(txRaw);
    if (Number.isFinite(num)) {
      txPower = num > 100 ? ((num / 100) - 40).toFixed(2) : String(num);
    } else {
      txPower = String(txRaw);
    }
  }
```
(Match the exact style of the rx block when editing — if the rx block guards differently, mirror it.)

- [ ] **Step 3: Return it**

In the return object where `rxPower` appears (`pppoeUsername, rxPower, temperature,` ~line 378), add `txPower,` next to `rxPower`.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add server/genieacs.ts
git commit -m "feat(acs): parse TX power dari GenieACS (VirtualParameters/X_CT-COM)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Extract DRY device-matching module + refactor existing endpoint

**Files:**
- Create: `server/ont-match.ts`
- Create: `server/ont-match.test.ts`
- Modify: `server/routes.ts:2966–3041` (`GET /api/customers/ont-status` uses the new module)

- [ ] **Step 1: Write the failing test**

```ts
// server/ont-match.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeviceIndexes, matchCustomerDevice } from "./ont-match.js";

const devices = [
  { deviceId: "d1", pppoeUsername: "yoga01", serialNumber: "ZTEG1234", ponSerialNumber: "ZTEGC1234567", status: "online", rxPower: "-21.5" },
  { deviceId: "d2", pppoeUsername: "", serialNumber: "FHTT9999", ponSerialNumber: "FHTT00AB12CD", status: "offline", rxPower: "" },
];

test("match by pppoe username (case-insensitive) wins first", () => {
  const idx = buildDeviceIndexes(devices as any);
  const m = matchCustomerDevice({ pppoeUsername: "YOGA01", ontSerialNumber: "FHTT9999" }, idx);
  assert.equal(m.matchBy, "pppoe");
  assert.equal(m.device?.deviceId, "d1");
});

test("fallback to factory serial then PON serial", () => {
  const idx = buildDeviceIndexes(devices as any);
  assert.equal(matchCustomerDevice({ ontSerialNumber: "fhtt9999" }, idx).matchBy, "sn");
  assert.equal(matchCustomerDevice({ ontSerialNumber: "FHTT00AB12CD" }, idx).matchBy, "pon_sn");
});

test("no match → null device", () => {
  const idx = buildDeviceIndexes(devices as any);
  const m = matchCustomerDevice({ pppoeUsername: "nobody" }, idx);
  assert.equal(m.device, null);
  assert.equal(m.matchBy, null);
});
```

- [ ] **Step 2: Run to verify it fails** → `npx tsx --test server/ont-match.test.ts` FAIL

- [ ] **Step 3: Implement (logic lifted VERBATIM from the ont-status handler)**

```ts
// server/ont-match.ts
/** DRY device↔customer matching shared by /api/customers/ont-status (all customers)
 *  and /api/odps/:id/ont-status (per-ODP panel). Pure — testable without GenieACS. */
import type { ParsedDevice } from "./genieacs.js";

export type DeviceIndexes = {
  byPppoe: Map<string, ParsedDevice>;
  bySn: Map<string, ParsedDevice>;
  byPonSn: Map<string, ParsedDevice>;
};

export function buildDeviceIndexes(devices: ParsedDevice[]): DeviceIndexes {
  const byPppoe = new Map<string, ParsedDevice>();
  const bySn = new Map<string, ParsedDevice>();
  const byPonSn = new Map<string, ParsedDevice>();
  for (const d of devices) {
    if (d.pppoeUsername) byPppoe.set(d.pppoeUsername.toLowerCase(), d);
    if (d.serialNumber) bySn.set(d.serialNumber.toLowerCase(), d);
    if (d.ponSerialNumber) byPonSn.set(d.ponSerialNumber.toLowerCase(), d);
  }
  return { byPppoe, bySn, byPonSn };
}

export type OntMatchBy = "pppoe" | "sn" | "pon_sn" | null;

export function matchCustomerDevice(
  c: { pppoeUsername?: string | null; ontSerialNumber?: string | null },
  idx: DeviceIndexes,
): { device: ParsedDevice | null; matchBy: OntMatchBy } {
  if (c.pppoeUsername) {
    const d = idx.byPppoe.get(c.pppoeUsername.toLowerCase());
    if (d) return { device: d, matchBy: "pppoe" };
  }
  if (c.ontSerialNumber) {
    const sn = c.ontSerialNumber.toLowerCase();
    const d = idx.bySn.get(sn);
    if (d) return { device: d, matchBy: "sn" };
    const dp = idx.byPonSn.get(sn);
    if (dp) return { device: dp, matchBy: "pon_sn" };
  }
  return { device: null, matchBy: null };
}
```

- [ ] **Step 4: Run to verify pass** → `npx tsx --test server/ont-match.test.ts` PASS (3 tests)

- [ ] **Step 5: Refactor `GET /api/customers/ont-status` to use it**

In routes.ts, add import near the genieacs import: `import { buildDeviceIndexes, matchCustomerDevice, type OntMatchBy } from "./ont-match.js";`

Replace the in-handler index-building block:
```ts
    const byPppoe = new Map<string, any>(); // pppoeUsername -> device
    const bySn = new Map<string, any>();    // serialNumber (factory) -> device
    const byPonSn = new Map<string, any>(); // ponSerialNumber (OLT format) -> device
    for (const d of devices) {
      if (d.pppoeUsername) byPppoe.set(d.pppoeUsername.toLowerCase(), d);
      if (d.serialNumber) bySn.set(d.serialNumber.toLowerCase(), d);
      if ((d as any).ponSerialNumber) byPonSn.set(((d as any).ponSerialNumber as string).toLowerCase(), d);
    }
```
with:
```ts
    const deviceIdx = buildDeviceIndexes(devices as any);
```
and replace the per-customer matching block:
```ts
      let device: any = null;
      let matchBy: "pppoe" | "sn" | "pon_sn" | null = null;

      // Try match by PPPoE username first
      if (c.pppoeUsername) {
        device = byPppoe.get(c.pppoeUsername.toLowerCase());
        if (device) matchBy = "pppoe";
      }
      // Fallback 1: match by factory SN
      if (!device && (c as any).ontSerialNumber) {
        const sn = ((c as any).ontSerialNumber as string).toLowerCase();
        device = bySn.get(sn);
        if (device) matchBy = "sn";
        // Fallback 2: customer DB store PON Serial dari OLT (yang format ZXICxxxx, FHTTxxxx, dst)
        if (!device) {
          device = byPonSn.get(sn);
          if (device) matchBy = "pon_sn";
        }
      }
```
with:
```ts
      const { device, matchBy } = matchCustomerDevice(c as any, deviceIdx);
```
(The `statuses[c.id] = {...}` body below stays unchanged — `device` / `matchBy` names match.)

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck` → 0. `npx tsx --test server/*.test.ts` → pass.

```bash
git add server/ont-match.ts server/ont-match.test.ts server/routes.ts
git commit -m "refactor(acs): ekstrak device-matching ke server/ont-match.ts (DRY untuk panel ODP)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Storage — customers by ODP + map customer search

**Files:**
- Modify: `server/storage.ts` (add 2 methods near other customer methods; find with `grep -n "async getCustomers(" server/storage.ts`)

- [ ] **Step 1: Add `getCustomersByOdp`**

```ts
  /** Pelanggan yang terhubung ke satu ODP (tenant-scoped, pakai idx_customers_odp_id). */
  async getCustomersByOdp(odpId: number): Promise<Customer[]> {
    const mitraId = getMitraId();
    return this.db.select().from(customers)
      .where(and(eq(customers.mitraId, mitraId), eq(customers.odpId, odpId)))
      .orderBy(asc(customers.portNumber), asc(customers.name));
  }
```

- [ ] **Step 2: Add `searchMapCustomers`** (server-backed map search — viewport-independent)

```ts
  /** Cari pelanggan untuk map search (nama / customer_id), light projection, max `limit`. */
  async searchMapCustomers(q: string, limit = 15): Promise<Array<{ id: number; name: string; customerId: string; lat: number | null; lng: number | null; odpId: number | null; status: string | null; isIsolir: number | null }>> {
    const mitraId = getMitraId();
    const needle = `%${q}%`;
    const rows = await this.db.select({
      id: customers.id, name: customers.name, customerId: customers.customerId,
      lat: customers.lat, lng: customers.lng, odpId: customers.odpId,
      status: customers.status, isIsolir: customers.isIsolir,
    }).from(customers)
      .where(and(
        eq(customers.mitraId, mitraId),
        or(like(customers.name, needle), like(customers.customerId, needle)),
      ))
      .limit(limit);
    return rows;
  }
```
Check the import line at the top of storage.ts already includes `or` and `like` from drizzle-orm (`grep -n 'from "drizzle-orm"' server/storage.ts`); add them to that import if missing.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add server/storage.ts
git commit -m "feat(storage): getCustomersByOdp + searchMapCustomers (light projection)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Server endpoints — ODP detail, ODP ont-status, map customer search

**Files:**
- Modify: `server/routes.ts` — add 3 routes. ⚠️ Register the two `/api/odps/:id/...` routes BEFORE `GET /api/odps/:id` (line ~2635) so Express doesn't capture them; the photos routes at 2675+ show the pattern (they're registered after — check: photos routes are AFTER `/api/odps/:id` and still work because the path has an extra segment; Express matches exact segment counts, so ordering vs `/api/odps/:id` is actually safe. Place the new routes next to the photos routes at ~2675 for cohesion.)

- [ ] **Step 1: Add `GET /api/odps/:id/detail`** (DB-only — fast, no ACS)

Place after the ODP photos routes block:

```ts
/** GET /api/odps/:id/detail — mini-dashboard ODP (lazy, dipanggil saat klik di map).
 *  DB-only supaya cepat; data ACS dipisah di /ont-status. */
router.get("/api/odps/:id/detail", async (req: Request, res: Response) => {
  if (!requirePermission(req, res, "map")) return;
  try {
    const id = Number(req.params.id);
    const odp = await storage.getOdp(id);
    if (!odp) return sendError(res, "ODP tidak ditemukan", 404);

    const custs = await storage.getCustomersByOdp(id);
    const capacity = odp.capacity || 8;
    const used = custs.length; // semantik sama dengan /api/odps/utilization
    const counts = { total: custs.length, active: 0, isolir: 0, suspend: 0, terminated: 0, unknown: 0 };
    const customersOut = custs.map((c) => {
      const st = customerConnStatus(c);
      counts[st]++;
      return {
        id: c.id, customerId: c.customerId, name: c.name, connStatus: st,
        package: c.package, portNumber: c.portNumber,
        ontSerialNumber: c.ontSerialNumber, phone: c.phone,
      };
    });

    sendSuccess(res, {
      odp: {
        id: odp.id, name: odp.name, code: odp.code, splitterType: odp.splitterType,
        status: odp.status, address: odp.address, district: odp.district, village: odp.village,
        lat: odp.lat, lng: odp.lng,
      },
      utilization: {
        capacity, used, available: Math.max(0, capacity - used),
        pct: capacity > 0 ? Math.min(Math.round((used / capacity) * 100), 100) : 0,
      },
      counts,
      customers: customersOut,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});
```
Add the shared import at the top of routes.ts (next to other ../shared imports): `import { customerConnStatus } from "../shared/customerStatus.js";`
Check `storage.getOdp` exists (`grep -n "async getOdp(" server/storage.ts`) — if it's named differently (e.g. `getOdpById`), use that name.

- [ ] **Step 2: Add `GET /api/odps/:id/ont-status`** (ACS — lazy second fetch)

```ts
/** GET /api/odps/:id/ont-status — optical power ONT semua pelanggan satu ODP.
 *  Device list GenieACS di-cache 60s per-mitra (klik ODP berurutan tidak refetch ACS). */
router.get("/api/odps/:id/ont-status", async (req: Request, res: Response) => {
  if (!requirePermission(req, res, "map")) return;
  try {
    const id = Number(req.params.id);
    const config = await getGenieConfig().catch(() => null);
    if (!config) return sendSuccess(res, { configured: false, thresholds: DEFAULT_OPTICAL_THRESHOLDS, byCustomer: {} });

    const custs = await storage.getCustomersByOdp(id);

    // Cached parsed-device list (per mitra) — pola sama dgn handler ont-status global tapi
    // tidak menghantam GenieACS tiap klik ODP.
    const mitraKey = `genieacs:devices:${req.authUser!.activeMitraId ?? 1}`;
    let devices = getCached<any[]>(mitraKey);
    if (!devices) {
      devices = await Promise.race([
        genieGetDevices(config, {}, 10000, 0).catch(() => [] as any[]),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 8000)),
      ]);
      if (devices.length > 0) setCached(mitraKey, devices, 60_000);
    }

    const idx = buildDeviceIndexes(devices as any);
    const thresholds = await getOpticalThresholds();
    const byCustomer: Record<number, {
      matched: boolean; status: "online" | "offline" | null;
      rxPower: string | null; txPower: string | null;
      lastInform: string | null; uptime: number | null;
      deviceId: string | null; model: string | null;
    }> = {};
    for (const c of custs) {
      const { device } = matchCustomerDevice(c as any, idx);
      byCustomer[c.id] = {
        matched: !!device,
        status: device?.status ?? null,
        rxPower: device?.rxPower || null,
        txPower: (device as any)?.txPower || null,
        lastInform: device?.lastInform ?? null,
        uptime: device?.uptime ?? null,
        deviceId: device?.deviceId ?? null,
        model: device?.productClass ?? null,
      };
    }
    sendSuccess(res, { configured: true, thresholds, byCustomer });
  } catch (e: any) { sendError(res, e.message, 500); }
});
```

Supporting pieces (place `getOpticalThresholds` near `getGenieConfig` at ~10689 — it reuses the same mitra-aware pick pattern; quote the existing `pick` inside getGenieConfig and mirror it):
```ts
/** Threshold optical power configurable per ISP (app_settings) — default -25/-28 dBm. */
async function getOpticalThresholds(): Promise<OpticalThresholds> {
  const mitraId = getMitraId();
  const pick = async (key: string): Promise<string | null> => {
    const v = await storage.getMitraSetting(mitraId, key);
    if (v != null && v !== "") return v;
    if (mitraId === 1) return storage.getSetting(key);
    return null;
  };
  const warn = Number(await pick("optical_rx_warn"));
  const crit = Number(await pick("optical_rx_crit"));
  return {
    warn: Number.isFinite(warn) && warn !== 0 ? warn : DEFAULT_OPTICAL_THRESHOLDS.warn,
    crit: Number.isFinite(crit) && crit !== 0 ? crit : DEFAULT_OPTICAL_THRESHOLDS.crit,
  };
}
```
⚠️ Mirror `getGenieConfig`'s actual pick/fallback logic and `getMitraId`/tenant-context import already present in routes.ts — verify with `sed -n '10689,10710p' server/routes.ts` before writing; adapt to exactly that pattern.

Imports to add at top of routes.ts: `import { DEFAULT_OPTICAL_THRESHOLDS, type OpticalThresholds } from "../shared/opticalPower.js";` plus `getCached, setCached` to the existing `./route-cache.js` import (check current names there) and ensure `genieGetDevices` alias matches existing import of `getDevices` (routes.ts already imports it for `/api/customers/integration-audit` — `grep -n "genieGetDevices\|getDevices" server/routes.ts | head -3` and reuse that exact alias).

- [ ] **Step 3: Add `GET /api/map-data/customer-search`**

Place next to `/api/map-data/infra` (~routes.ts:2414):
```ts
/** GET /api/map-data/customer-search?q= — cari pelanggan di luar viewport untuk map search.
 *  Hasil menyertakan odpId supaya search bisa menampilkan relasi pelanggan→ODP. */
router.get("/api/map-data/customer-search", async (req: Request, res: Response) => {
  if (!requirePermission(req, res, "map")) return;
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 3) return sendSuccess(res, { customers: [] });
    const customersFound = await storage.searchMapCustomers(q, 15);
    sendSuccess(res, { customers: customersFound });
  } catch (e: any) { sendError(res, e.message, 500); }
});
```

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck` → 0. `npx tsx --test server/*.test.ts shared/*.test.ts` → pass.

```bash
git add server/routes.ts
git commit -m "feat(map): endpoint lazy ODP detail + per-ODP ONT status (threshold configurable) + customer search

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Client hooks for the panel

**Files:**
- Create: `client/hooks/useOdpDetail.ts`

- [ ] **Step 1: Implement the hooks (lazy by design — only fetch when panel open)**

```ts
// client/hooks/useOdpDetail.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CustomerConnStatus } from "@shared/customerStatus";
import type { OpticalThresholds } from "@shared/opticalPower";

export type OdpDetail = {
  odp: { id: number; name: string; code: string; splitterType: string | null; status: string | null; address: string | null; district: string | null; village: string | null; lat: number | null; lng: number | null };
  utilization: { capacity: number; used: number; available: number; pct: number };
  counts: { total: number; active: number; isolir: number; suspend: number; terminated: number; unknown: number };
  customers: Array<{ id: number; customerId: string; name: string; connStatus: CustomerConnStatus; package: string | null; portNumber: number | null; ontSerialNumber: string | null; phone: string | null }>;
};

export type OdpOntStatus = {
  configured: boolean;
  thresholds: OpticalThresholds;
  byCustomer: Record<number, { matched: boolean; status: "online" | "offline" | null; rxPower: string | null; txPower: string | null; lastInform: string | null; uptime: number | null; deviceId: string | null; model: string | null }>;
};

/** Lazy: hanya fetch saat panel ODP terbuka (odpId != null). */
export function useOdpDetail(odpId: number | null) {
  return useQuery<OdpDetail>({
    queryKey: ["odp-detail", odpId],
    queryFn: () => api.get<OdpDetail>(`/odps/${odpId}/detail`),
    enabled: odpId != null,
    staleTime: 30_000,
  });
}

/** Lazy kedua: query ACS baru jalan SETELAH detail sukses (spec: jangan query ACS saat map load). */
export function useOdpOntStatus(odpId: number | null, enabled: boolean) {
  return useQuery<OdpOntStatus>({
    queryKey: ["odp-ont-status", odpId],
    queryFn: () => api.get<OdpOntStatus>(`/odps/${odpId}/ont-status`),
    enabled: odpId != null && enabled,
    staleTime: 60_000,
    retry: 0, // ACS lambat/timeout → jangan retry-badai
  });
}

export type MapCustomerSearchHit = { id: number; name: string; customerId: string; lat: number | null; lng: number | null; odpId: number | null; status: string | null; isIsolir: number | null };

/** Server-backed customer search untuk map (pelanggan di luar viewport tetap ketemu). */
export function useMapCustomerSearch(q: string) {
  const trimmed = q.trim();
  return useQuery<{ customers: MapCustomerSearchHit[] }>({
    queryKey: ["map-customer-search", trimmed],
    queryFn: () => api.get(`/map-data/customer-search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length >= 3,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add client/hooks/useOdpDetail.ts
git commit -m "feat(map): hooks lazy useOdpDetail/useOdpOntStatus/useMapCustomerSearch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Reusable UI pieces — OpticalPowerBadge, CapacityIndicator, OdpCustomerList, OdpDetailPanel

**Files:**
- Create: `client/components/map/OpticalPowerBadge.tsx`
- Create: `client/components/map/CapacityIndicator.tsx`
- Create: `client/components/map/OdpCustomerList.tsx`
- Create: `client/components/map/OdpDetailPanel.tsx`

These use Tailwind theme tokens (NOT hardcoded hex — design-system rule). `StatusBadge` exists at `client/components/ui/status-badge.tsx` (verify props with `grep -n "interface StatusBadgeProps" -A8 client/components/ui/status-badge.tsx`; it takes `variant`, `label`, `size`, `appearance`).

- [ ] **Step 1: OpticalPowerBadge**

```tsx
// client/components/map/OpticalPowerBadge.tsx
import { classifyOpticalPower, OPTICAL_LEVEL_META, type OpticalThresholds, DEFAULT_OPTICAL_THRESHOLDS } from "@shared/opticalPower";

const LEVEL_CLS: Record<string, string> = {
  good: "bg-success/10 text-success",
  warn: "bg-warning/15 text-warning",
  crit: "bg-destructive/15 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

/** Badge dBm dengan indikator warna hijau/kuning/merah — threshold dari server (configurable). */
export function OpticalPowerBadge({ value, kind, thresholds = DEFAULT_OPTICAL_THRESHOLDS }: {
  value: string | number | null | undefined;
  kind: "RX" | "TX";
  thresholds?: OpticalThresholds;
}) {
  // TX tidak diklasifikasikan kritis-nya seperti RX — tampil netral kalau ada.
  const level = kind === "RX" ? classifyOpticalPower(value, thresholds) : (value ? "good" : "unknown");
  const cls = kind === "RX" ? LEVEL_CLS[level] : "bg-muted text-foreground/80";
  const text = value !== null && value !== undefined && value !== "" ? `${value} dBm` : "—";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}
      title={kind === "RX" ? `RX ${text} · ${OPTICAL_LEVEL_META[level].label} (warn ≤ ${thresholds.warn}, crit ≤ ${thresholds.crit} dBm)` : `TX ${text}`}
    >
      {kind} {text}
    </span>
  );
}
```

- [ ] **Step 2: CapacityIndicator**

```tsx
// client/components/map/CapacityIndicator.tsx

/** Progress bar utilisasi ODP + angka used/total + persen (theme-aware, reusable). */
export function CapacityIndicator({ used, total, pct }: { used: number; total: number; pct: number }) {
  const barCls = pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-success";
  const txtCls = pct >= 90 ? "text-destructive" : pct >= 70 ? "text-warning" : "text-success";
  return (
    <div aria-label={`Utilisasi ${pct}%`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Utilisasi</span>
        <span className={`text-sm font-extrabold tabular-nums ${txtCls}`}>{used} / {total} · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
        <span><strong className="text-foreground">{used}</strong> terpakai</span>
        <span><strong className={txtCls}>{Math.max(0, total - used)}</strong> tersedia</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: OdpCustomerList** (semantic list, mobile-first cards, show-more pagination, per-customer ACS row + shortcut)

```tsx
// client/components/map/OdpCustomerList.tsx
import { useState } from "react";
import { ExternalLink, Wifi, WifiOff } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { CUSTOMER_STATUS_META } from "@shared/customerStatus";
import { OpticalPowerBadge } from "./OpticalPowerBadge";
import type { OdpDetail, OdpOntStatus } from "@/hooks/useOdpDetail";
import { formatRelativeTime } from "@/lib/dateFormat";

const PAGE = 10;

function uptimeLabel(s: number | null): string | null {
  if (!s || s <= 0) return null;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

/** Daftar pelanggan terhubung ke ODP — card list mobile-first, ACS info lazy-merge. */
export function OdpCustomerList({ customers, ont, onOpenCustomer }: {
  customers: OdpDetail["customers"];
  ont?: OdpOntStatus;
  onOpenCustomer: (customerId: string) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  if (customers.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Belum ada pelanggan terhubung.</p>;
  }
  const visible = customers.slice(0, shown);
  return (
    <section aria-label="Pelanggan terhubung">
      <ul className="space-y-2">
        {visible.map((c) => {
          const meta = CUSTOMER_STATUS_META[c.connStatus];
          const acs = ont?.byCustomer?.[c.id];
          const up = uptimeLabel(acs?.uptime ?? null);
          return (
            <li key={c.id}>
              <article className="rounded-lg border border-border/60 bg-card p-2.5">
                <header className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">{c.customerId}</p>
                  </div>
                  <StatusBadge variant={meta.variant} label={meta.label} size="sm" />
                </header>
                <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {c.package && <div><dt className="sr-only">Paket</dt><dd>{c.package}</dd></div>}
                  {c.portNumber != null && <div><dt className="sr-only">Port</dt><dd>Port {c.portNumber}</dd></div>}
                  {c.ontSerialNumber && <div><dt className="sr-only">ONT</dt><dd className="font-mono">{c.ontSerialNumber}</dd></div>}
                </dl>
                {/* Baris ACS — muncul kalau ont-status sudah ter-load & match */}
                {acs && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {acs.matched ? (
                      <>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${acs.status === "online" ? "text-success" : "text-destructive"}`}>
                          {acs.status === "online" ? <Wifi className="size-3" aria-hidden="true" /> : <WifiOff className="size-3" aria-hidden="true" />}
                          {acs.status === "online" ? "Online" : "Offline"}
                        </span>
                        <OpticalPowerBadge value={acs.rxPower} kind="RX" thresholds={ont!.thresholds} />
                        {acs.txPower && <OpticalPowerBadge value={acs.txPower} kind="TX" />}
                        {acs.lastInform && <span className="text-[10px] text-muted-foreground">Inform {formatRelativeTime(acs.lastInform)}</span>}
                        {up && <span className="text-[10px] text-muted-foreground">Up {up}</span>}
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/70 italic">ONT tidak terdaftar di ACS</span>
                    )}
                  </div>
                )}
                <footer className="mt-2">
                  <button
                    type="button"
                    onClick={() => onOpenCustomer(c.customerId)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline min-h-[24px]"
                  >
                    <ExternalLink className="size-3" aria-hidden="true" /> Lihat Detail
                  </button>
                </footer>
              </article>
            </li>
          );
        })}
      </ul>
      {customers.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)}
          className="mt-2 w-full rounded-md border border-input py-1.5 text-xs font-medium hover:bg-muted/40">
          Tampilkan {Math.min(PAGE, customers.length - shown)} lagi ({customers.length - shown} tersisa)
        </button>
      )}
    </section>
  );
}
```
⚠️ Verify `formatRelativeTime` exists in `client/lib/dateFormat.ts` (`grep -n "export" client/lib/dateFormat.ts`) — if the export is named differently (e.g. `timeAgo`/`relTime`), use that; if none exists, inline a small `relTime(iso)` helper in this file returning "x mnt lalu"/"x jam lalu" from `Date.now() - parse`.

- [ ] **Step 4: OdpDetailPanel** (responsive host: BottomSheet mobile / Dialog desktop; future-proof generic shell)

```tsx
// client/components/map/OdpDetailPanel.tsx
import { CircleDot, Pencil, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { useOdpDetail, useOdpOntStatus } from "@/hooks/useOdpDetail";
import { CapacityIndicator } from "./CapacityIndicator";
import { OdpCustomerList } from "./OdpCustomerList";

/** Shell panel detail aset map — responsive (BottomSheet di mobile, Dialog di desktop).
 *  Generik: aset lain (ODC/OLT/FAT) tinggal pakai shell yang sama tanpa redesign. */
export function MapAssetPanel({ open, onClose, isMobile, title, subtitle, children }: {
  open: boolean; onClose: () => void; isMobile: boolean;
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title={title} height="lg">
        {subtitle && <p className="text-[11px] text-muted-foreground -mt-1 mb-2">{subtitle}</p>}
        {children}
      </BottomSheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDot className="size-4 text-asset-odp" aria-hidden="true" />{title}
          </DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Mini-dashboard ODP: utilisasi, metrics pelanggan, daftar pelanggan + ACS optical power. */
export function OdpDetailPanel({ odpId, isMobile, onClose, onOpenCustomer, onEdit, onAddCustomerDrop }: {
  odpId: number;
  isMobile: boolean;
  onClose: () => void;
  onOpenCustomer: (customerId: string) => void;
  onEdit?: () => void;
  onAddCustomerDrop?: () => void;
}) {
  const { data, isLoading } = useOdpDetail(odpId);
  // Lazy kedua: ACS hanya di-query setelah detail (dan pelanggan > 0)
  const { data: ont, isLoading: ontLoading } = useOdpOntStatus(odpId, !!data && data.customers.length > 0);

  const region = data ? [data.odp.village, data.odp.district].filter(Boolean).join(", ") : "";
  return (
    <MapAssetPanel
      open
      onClose={onClose}
      isMobile={isMobile}
      title={data ? `${data.odp.name}` : "Memuat ODP…"}
      subtitle={data ? `${data.odp.code}${region ? ` · ${region}` : ""}${data.odp.splitterType ? ` · Splitter ${data.odp.splitterType}` : ""}` : undefined}
    >
      {isLoading || !data ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="space-y-4 pb-2">
          {/* Utilisasi */}
          <section aria-label="Utilisasi ODP">
            <CapacityIndicator used={data.utilization.used} total={data.utilization.capacity} pct={data.utilization.pct} />
          </section>

          {/* Customer metrics */}
          <section aria-label="Ringkasan pelanggan" className="grid grid-cols-4 gap-1.5 text-center">
            {([
              ["Total", data.counts.total, "text-foreground"],
              ["Aktif", data.counts.active, "text-success"],
              ["Isolir", data.counts.isolir, "text-destructive"],
              ["Suspend", data.counts.suspend, "text-warning"],
            ] as const).map(([label, n, cls]) => (
              <div key={label} className="rounded-lg bg-muted/40 py-1.5">
                <div className={`text-base font-extrabold tabular-nums ${cls}`}>{n}</div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </section>

          {/* Pelanggan terhubung + ACS */}
          <section aria-label="Pelanggan terhubung">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Pelanggan Terhubung ({data.counts.total})
              </h3>
              {ontLoading && <span className="text-[10px] text-muted-foreground animate-pulse">Memuat ACS…</span>}
              {ont && !ont.configured && <span className="text-[10px] text-muted-foreground/70">ACS tidak dikonfigurasi</span>}
            </div>
            <OdpCustomerList customers={data.customers} ont={ont} onOpenCustomer={onOpenCustomer} />
          </section>

          {/* Aksi (dipindah dari InfoWindow lama) */}
          {(onEdit || onAddCustomerDrop) && (
            <footer className="flex gap-2 pt-1 border-t border-border/40">
              {onEdit && (
                <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="size-3.5 mr-1" aria-hidden="true" /> Edit
                </Button>
              )}
              {onAddCustomerDrop && (
                <Button type="button" size="sm" className="flex-1" onClick={onAddCustomerDrop}>
                  <Link2 className="size-3.5 mr-1" aria-hidden="true" /> Tarik Kabel Pelanggan
                </Button>
              )}
            </footer>
          )}
        </div>
      )}
    </MapAssetPanel>
  );
}
```
⚠️ Verify `SkeletonList` export + props (`grep -n "SkeletonList" client/components/ui/skeleton.tsx`) — if its prop isn't `rows`, match the real signature; if absent, use 3 stacked `<Skeleton className="h-16 w-full" />`. Verify `text-asset-odp` class exists (`grep -n "asset-odp" client/index.css tailwind.config.*`) — else use `style={{color:"var(--asset-odp)"}}`-free fallback `text-success`.

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add client/components/map/OpticalPowerBadge.tsx client/components/map/CapacityIndicator.tsx client/components/map/OdpCustomerList.tsx client/components/map/OdpDetailPanel.tsx
git commit -m "feat(map): komponen OdpDetailPanel + CapacityIndicator + OpticalPowerBadge + OdpCustomerList

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Wire the panel into MapPage (ODP click → mini dashboard)

**Files:**
- Modify: `client/pages/MapPage.tsx`

- [ ] **Step 1: State + import**

Add import: `import { OdpDetailPanel } from "@/components/map/OdpDetailPanel";`
Near `const [selectedCable, setSelectedCable] = useState…` (line ~539) add:
```ts
  const [odpPanel, setOdpPanel] = useState<{ id: number; data: any } | null>(null);
```

- [ ] **Step 2: ODP marker click opens the panel (not InfoWindow)**

Replace the ODP Marker onClick (line ~992):
```tsx
                          onClick={() => { setSelectedInfo({ type: "odp", data: odpWithUtil, position: { lat: odp.lat!, lng: odp.lng! } }); if (isMobile) setMobileInfoSheet(true); }}
```
with:
```tsx
                          onClick={() => { setSelectedInfo(null); setMobileInfoSheet(false); setOdpPanel({ id: odp.id, data: odpWithUtil }); }}
```

- [ ] **Step 3: Render the panel** — next to the `{selectedCable && <CableDetailPanel …/>}` block (line ~1327) add:

```tsx
      {/* ODP mini-dashboard — lazy detail + ACS (menggantikan InfoWindow ODP) */}
      {odpPanel && (
        <OdpDetailPanel
          odpId={odpPanel.id}
          isMobile={isMobile}
          onClose={() => setOdpPanel(null)}
          onOpenCustomer={(customerId) => setLocation(`/customers?q=${encodeURIComponent(customerId)}`)}
          onEdit={!readOnly ? () => {
            const asset = odpPanel.data;
            setOdpPanel(null);
            setQuickForm({
              type: "odp", lat: asset.lat, lng: asset.lng,
              district: asset.district, village: asset.village, address: asset.address,
              isEdit: true, initialData: asset,
            } as any);
          } : undefined}
          onAddCustomerDrop={!readOnly ? () => {
            const odpId = odpPanel.id;
            setOdpPanel(null);
            setStartOdpId(odpId);
            setDrawMode("customer-drop");
            toast.info("Klik lokasi rumah pelanggan di peta untuk menarik kabel drop dari ODP ini.");
          } : undefined}
        />
      )}
```
(`setLocation` exists at line ~514 `const [, setLocation] = useLocation();`; `readOnly`, `setQuickForm`, `setStartOdpId`, `setDrawMode`, `toast` all already used by the existing InfoWindow handlers — reuse verbatim.)

- [ ] **Step 4: Esc-close** — in the existing keydown effect (line ~649 `else if (selectedInfo) setSelectedInfo(null);`) add a branch BEFORE it:
```ts
        else if (odpPanel) setOdpPanel(null);
```
and add `odpPanel` to that effect's dependency array (line ~654).

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add client/pages/MapPage.tsx
git commit -m "feat(map): klik ODP membuka mini-dashboard (panel lazy), aksi Edit/Tarik Kabel dipertahankan

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Search — customer→ODP relation + server-backed results

**Files:**
- Modify: `client/components/map/MapSearchBar.tsx`
- Modify: `client/pages/MapPage.tsx` (pass `onOpenOdp` + odps to search; handle result)

- [ ] **Step 1: Read the full current MapSearchBar (187 lines) before editing.** It filters `data.customers` (viewport-only) client-side with a `query` state.

- [ ] **Step 2: Merge server-backed customer results + show ODP relation**

In `MapSearchBar.tsx`:
(a) Import + call the hook (debounce via the hook's `enabled: ≥3 chars` + add a 300ms debounced state):
```ts
import { useEffect, useState } from "react"; // merge with existing react import
import { useMapCustomerSearch } from "@/hooks/useOdpDetail";
```
Inside the component:
```ts
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);
  const { data: serverHits } = useMapCustomerSearch(debouncedQ);
```
(`query` = the existing search-text state variable in this file; use its real name.)

(b) After the existing local results are assembled, merge server hits (dedupe by id) into the customer results:
```ts
  const localCustomerIds = new Set(results.filter((r) => r.type === "customer").map((r) => r.id));
  const merged = [
    ...results,
    ...(serverHits?.customers ?? [])
      .filter((c) => !localCustomerIds.has(c.id))
      .map((c) => ({ type: "customer" as const, id: c.id, name: c.name, subtitle: c.customerId, lat: c.lat, lng: c.lng, odpId: c.odpId })),
  ];
```
(Adapt the mapped object's keys to the file's actual `SearchResult` shape — extend that interface with `odpId?: number | null`.)

(c) In the result-row rendering for `type === "customer"`, add an ODP chip + zoom-to-ODP action when the customer has `odpId` and the ODP is known:
```tsx
  {item.type === "customer" && item.odpId != null && odpById.get(item.odpId) && (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpenOdp?.(item.odpId!); }}
      className="ml-auto shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success hover:bg-success/20"
      title="Zoom ke ODP & buka detail"
    >
      ODP {odpById.get(item.odpId)!.code ?? odpById.get(item.odpId)!.name}
    </button>
  )}
```
with new props on `MapSearchBarProps`:
```ts
  onOpenOdp?: (odpId: number) => void;
```
and a memo at top of component:
```ts
  const odpById = new Map<number, any>((data.odps ?? []).map((o: any) => [o.id, o]));
```

- [ ] **Step 3: MapPage passes the handler** — at the `<MapSearchBar` usage (line ~1173) add prop:
```tsx
          onOpenOdp={(odpId) => {
            const odp = data?.odps.find((o) => o.id === odpId);
            if (odp?.lat && odp?.lng && mapRef) { mapRef.panTo({ lat: odp.lat, lng: odp.lng }); mapRef.setZoom(18); }
            setShowSearch(false);
            setOdpPanel({ id: odpId, data: odp ?? {} });
          }}
```
(Verify how `handleSearchResultClick` pans — `sed -n '836,845p' client/pages/MapPage.tsx` — and mirror its pan/zoom calls exactly.)

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add client/components/map/MapSearchBar.tsx client/pages/MapPage.tsx
git commit -m "feat(map): search pelanggan tampilkan relasi ODP + zoom-ke-ODP, hasil server-backed di luar viewport

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Optical threshold settings UI (IntegrationPage, GenieACS section)

**Files:**
- Modify: `client/pages/IntegrationPage.tsx` (GenieACS card, ~lines 1256–1365)

- [ ] **Step 1: Read the GenieACS section first** (`sed -n '1256,1370p' client/pages/IntegrationPage.tsx`) — it keeps `genieHost/geniePort/genieUser/geniePass` state hydrated from `GET /api/settings?category=genieacs` and saves via `PUT /api/settings/bulk`.

- [ ] **Step 2: Add two inputs + state following the exact same pattern**

State (next to genieHost etc.):
```ts
  const [opticalWarn, setOpticalWarn] = useState("");
  const [opticalCrit, setOpticalCrit] = useState("");
```
Hydration: where existing settings are read into state (the effect/map over fetched settings), add:
```ts
  if (s.key === "optical_rx_warn") setOpticalWarn(s.value ?? "");
  if (s.key === "optical_rx_crit") setOpticalCrit(s.value ?? "");
```
Save payload: append to the bulk array in the GenieACS save handler:
```ts
  { key: "optical_rx_warn", value: opticalWarn, category: "genieacs", label: "Optical RX warning (dBm)" },
  { key: "optical_rx_crit", value: opticalCrit, category: "genieacs", label: "Optical RX critical (dBm)" },
```
UI (after the password input, same FormField/Input pattern as neighbors):
```tsx
  <div className="grid grid-cols-2 gap-2">
    <div>
      <Label className="text-xs">Threshold RX Warning (dBm)</Label>
      <Input type="number" step="0.5" placeholder="-25" value={opticalWarn} onChange={(e) => setOpticalWarn(e.target.value)} />
    </div>
    <div>
      <Label className="text-xs">Threshold RX Critical (dBm)</Label>
      <Input type="number" step="0.5" placeholder="-28" value={opticalCrit} onChange={(e) => setOpticalCrit(e.target.value)} />
    </div>
  </div>
  <p className="text-[10px] text-muted-foreground">Kosongkan untuk default (-25 / -28). Dipakai untuk indikator warna optical power di panel ODP map.</p>
```
(Adapt Label/Input imports to whatever the file already uses.)

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add client/pages/IntegrationPage.tsx
git commit -m "feat(integrations): setting threshold optical RX warning/critical (configurable per ISP)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Final verification — build, tests, live UI smoke (mobile + desktop)

- [ ] **Step 1: Full static verification**

Run: `npm run typecheck` → 0 errors.
Run: `npx tsx --test shared/*.test.ts client/lib/*.test.ts client/components/pipelines/*.test.ts server/*.test.ts` → all pass.
Run: `npm run build` → success.

- [ ] **Step 2: Live UI smoke using the established local recipe** (see memory `reference-local-ui-testing`): podman MySQL + `drizzle-kit push` + seed via API (create 1 ODP with lat/lng + 6 customers `POST /api/customers` with `odpId`, varied `status`/`isIsolir`) + `node dist/index.mjs` + puppeteer-core (390×844 mobile AND 1280×800 desktop):
  - Click ODP marker → panel opens; verify utilization bar, 4 metric chips, customer cards with badges (Aktif/Isolir), "Lihat Detail" buttons, "Memuat ACS…" → "ACS tidak dikonfigurasi" note (no ACS in test env).
  - Network tab assertion (puppeteer request log): `/api/odps/:id/detail` fired ONLY after click (lazy), never on map load.
  - Mobile: panel is a BottomSheet, scrollable one-handed; desktop: Dialog.
  - Search "05" (customer id prefix) → result shows ODP chip → click chip → map pans + ODP panel opens.
  - Screenshot both viewports; LOOK at them.

- [ ] **Step 3: Commit any smoke-test fixes, then update memory + hand off**

Final handoff (per convention): list commits, deploy steps (`git push origin dev` → cPanel Update from Remote → Restart), and what to QA manually on staging with real ACS (RX/TX values, thresholds from /integrations).

---

## Self-review notes (spec coverage map)

1. Detail ODP lengkap (nama/kode/wilayah/kapasitas/terpakai/tersedia/%) → Task 6 (`/detail`), Task 8 (panel header + CapacityIndicator). ✓
2. Pelanggan terhubung (nama, ID, status, paket, ONT, port) → Task 6 payload + Task 8 OdpCustomerList. ✓
3. Tombol per pelanggan → `Lihat Detail` → `/customers?q=<customerId>` (route detail per-id tidak ada; ini deep-link yang dipakai sistem). ✓
4. ACS RX/TX/Last Inform/Status/Uptime → Task 3 (txPower), Task 6 (`/ont-status`), Task 8 (ACS row). ✓
5. Indikator visual hijau/kuning/merah → Task 2 + OpticalPowerBadge. ✓
6. Threshold configurable, tidak hardcoded → app_settings `optical_rx_warn/crit` (Task 6 `getOpticalThresholds`, Task 11 UI), default = nilai legacy. ✓
7. Customer count metrics → counts di `/detail` + metric chips. ✓
8. Capacity monitoring progress bar + badge → CapacityIndicator. ✓
9. Search relasi pelanggan→ODP + zoom → Task 10. ✓
10. Lazy loading → dua endpoint terpisah, `enabled` gating, ACS hanya setelah detail; device cache 60s/mitra. ✓
11. Mobile bottom sheet / desktop dialog, semantic HTML (section/article/header/footer/ul/dl/button), DRY (ont-match extraction, shared helpers, satu panel utk 2 host), reusable components (5 komponen terpisah), pagination (show-more 10), memo ringan. ✓
12. Future expansion → `MapAssetPanel` shell generik. ✓
