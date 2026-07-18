# JABNET Workspace — Claude Handoff Memory

> **One-liner**: Platform operasional terpadu untuk ISP fiber-to-the-home (PT Arkanova Cipta Inovasi / JABNET Garut).
> Versi: **v4.3.0** (cPanel MySQL port — LIVE di workspace.jabnet.id) · 51+ React pages · 39 permission keys · 6 system roles.
> Project di working directory ini adalah **copy untuk deploy ke cPanel** di `workspace.jabnet.id` dengan DB MySQL `jabnet_fiber`.
> **Setup cPanel:** lihat [CPANEL-SETUP.md](CPANEL-SETUP.md). Pola umum: [CPANEL-CONVENTIONS.md](CPANEL-CONVENTIONS.md).

## ✅ Status Migrasi cPanel + MySQL (v4.3.0 — COMPLETE)

| Komponen | Status |
|---|---|
| `drizzle.config.ts` → MySQL dialect dengan env loading | ✅ Phase 1A |
| `shared/schema.ts` → 65 tabel ported ke `mysqlTable` | ✅ Phase 1A |
| `package.json` → swap `better-sqlite3` → `mysql2`, add `dotenv` | ✅ Phase 1A |
| `server/index.ts` → dotenv from `JABNET_PRIVATE_ROOT` + worker gates | ✅ Phase 1A |
| `server/broadcast-worker.ts` → MySQL | ✅ Phase 1A |
| `tools/migrate-sqlite-to-mysql.mjs` → data migration script | ✅ Phase 1A |
| `.github/workflows/build.yml` → GHA build + deploy branch | ✅ Phase 1A |
| `.env.example`, `.gitignore` → MySQL vars + secret protection | ✅ Phase 1A |
| `CPANEL-SETUP.md` → step-by-step cPanel setup | ✅ Phase 1A |
| `server/storage.ts` refactor — hapus `.returning()` + raw sqlite | ✅ **Phase 1B done** (commit `31ab0e3`) |
| `server/storage.ts` cleanup — replace 88 broken `.all()`/`.run()` calls dengan `.execute()` | ✅ done (commit `1ffb4fc`) |
| Performance optimization Phase A-D (indexes, dashboard, map viewport, perm cache) | ✅ done (commits `d5c6209`…`006521e`) |
| Performance Phase E — N+1 query batching (dashboard, loyalty, reconcile, portal Mikrotik) | ✅ done (commits `b64215a`, `8a62acc`, `b658359`) |
| Performance Phase F — bundle split, pause-on-blur polling, server response cache | ✅ done (commits `2e63e27`, `0738f89`, `7857f97`) |
| Google Maps API key runtime via `/api/public-config` (no rebuild needed) | ✅ done |

**Build status:** `npm run build` ✓ sukses (esbuild bundle 1MB). `npm run typecheck`: **0 errors** (genuine, was previously stale at 88).
**Production status:** LIVE di `https://workspace.jabnet.id` — login/dashboard/map operasional.

**MySQL refactor pattern (untuk reference jika edit storage.ts):**

```ts
// INSERT → harus query ulang untuk dapat row (MySQL Drizzle tidak support .returning):
const result = await this.db.insert(pops).values(data);
const insertId = Number((result[0] as any).insertId);
const [row] = await this.db.select().from(pops).where(eq(pops.id, insertId));
return row!;

// Raw query via pool:
const [rows] = await this.pool.execute("SELECT * FROM x WHERE id = ?", [123]);
const row = (rows as any[])[0];

// Raw query via Drizzle sql`` template (preferred — auto-binds interpolations):
//   .all() / .run() / .get() DO NOT exist on MySQL Drizzle. Use .execute() yang return [rows, fields].
const rows: any = ((await this.db.execute(sql`SELECT * FROM x WHERE id = ${id}`))[0] as any);

// DELETE result → MySQL pakai affectedRows, bukan changes/rowsAffected:
const result: any = await this.db.execute(sql`DELETE FROM x WHERE ...`);
return Number(result?.[0]?.affectedRows ?? 0);

// Transaction:
const conn = await this.pool.getConnection();
await conn.beginTransaction();
try {
  for (const r of items) await conn.execute(sql, params);
  await conn.commit();
} catch (e) { await conn.rollback(); throw e; }
finally { conn.release(); }

// Batched lookup (anti N+1) — pakai inArray + Map. Pattern wajib untuk list endpoints:
async getOdpsByIds(odpIds: number[]): Promise<Map<number, Odp>> {
  const map = new Map<number, Odp>();
  if (odpIds.length === 0) return map;
  const rows = await this.db.select().from(odps).where(inArray(odps.id, odpIds));
  for (const r of rows) map.set(r.id, r);
  return map;
}
```

---

## Stack

- **Backend**: Node 20+ · Express 5 · Drizzle ORM (MySQL dialect) · mysql2 · bcryptjs · tsx (dev) · esbuild (prod bundle)
- **Frontend**: React 18 · TypeScript · Vite 5 · Tailwind 3 + shadcn/ui · TanStack Query 5 · Wouter (router) · Recharts · Lucide icons
- **Routing**: Wouter pattern. Client routes di `client/App.tsx`. API di `server/routes.ts` + 2 mounted sub-routers (portal pelanggan + public API).
- **DB**: MySQL 8 `jabnet_fiber` di cPanel `103.194.47.165` (user `jabnet_crm_user`). 65+ tables. Connection pool via `mysql2/promise` di `server/storage.ts`.
- **Build**: `npm run build` → `dist/public/` (Vite client) + `dist/index.mjs` (esbuild server bundle).
- **Run**: `npm run dev` (tsx watch + Vite middleware) atau `npm start` (production bundle).
- **Deploy**: GitHub push → GHA build → cPanel `Git Version Control → Update from Remote` → Restart Node.js App.

---

## Folder Structure

```
ftth-v411/
├─ client/              # React app
│  ├─ App.tsx           # Router + lazy routes (45+ pages)
│  ├─ main.tsx          # React entry
│  ├─ index.css         # Tailwind + design tokens (sky/blue primary)
│  ├─ pages/            # All page components
│  │  ├─ portal/        # Customer portal (PortalLogin/Verify/Dashboard)
│  │  ├─ UsersPage.tsx  # Enterprise user mgmt with detail drawer + bulk actions
│  │  ├─ RolesPage.tsx  # Role + permission matrix with preview dialog
│  │  ├─ LoyaltyAdminPage.tsx  # JABNET Sahabat program admin
│  │  ├─ PublicApiPage.tsx     # Open API key management
│  │  ├─ AnnouncementsPage.tsx # News/feature update broadcast
│  │  ├─ BugReportsPage.tsx    # In-app bug tracking
│  │  └─ … (Marketing, Collection, Map, etc.)
│  ├─ components/
│  │  ├─ layout/         # Sidebar, Layout, BottomNav
│  │  ├─ notifications/  # NotificationBell (top-right floating)
│  │  └─ ui/             # shadcn primitives
│  └─ context/AuthContext.tsx   # Auth via localStorage `ftth_user`
├─ server/
│  ├─ index.ts                  # Express bootstrap, mounts 3 routers
│  ├─ routes.ts                 # Main router (~3500 lines, all staff endpoints)
│  ├─ customer-portal-routes.ts # /api/portal/* (OTP-auth, lightweight)
│  ├─ public-api-routes.ts      # /api/public/v1/* (API key bearer auth)
│  ├─ storage.ts                # ALL DB access — single class DatabaseStorage (~5000 lines)
│  ├─ billing-sync-worker.ts    # Polls billing.jabnet.id every 60-600s
│  ├─ traffic-snapshot-worker.ts # Polls Mikrotik PPP every 15min
│  ├─ mpwa.ts                    # WhatsApp gateway adapter
│  └─ genieacs.ts                # ONT TR-069 (reboot, WiFi config)
├─ shared/schema.ts              # Drizzle table defs + ALL_PERMISSIONS list
├─ public/                       # Favicons, manifest.json, icons/
├─ tools/                        # backup scripts, db migrations
├─ index.html                    # Vite entry HTML — title "JABNET Workspace"
├─ vite.config.ts                # @ alias → ./client, @shared → ./shared
├─ tsconfig.json                 # Strict, paths matching vite alias
└─ package.json                  # name=jabnet-ftth-manager, version=4.1.10
```

---

## Auth Models (3 separate)

1. **Staff token** — header `Authorization: Bearer <hex token>`. Login via `POST /api/auth/login` (admin/admin123 default). Token disimpan di `users.token`, juga di localStorage `ftth_user` untuk SPA.
2. **Customer portal session** — bearer token dari `customer_portal_sessions` table. Login via `POST /api/portal/auth/request-otp` → `verify-otp`. OTP via MPWA WhatsApp gateway (dev mode: log ke console).
3. **Public API key** — header `Authorization: Bearer jbk_live_<32hex>`. Bcrypt hashed, scoped (`marketing:read`, `reports:read`, `leads:read`, `collections:read`, `sahabat:read`, `tickets:read`, `*`). Created via `POST /api/api-keys` (admin only).

---

## Key Features Implemented

### Asset Network Management
- POPs / ODCs / ODPs / Poles / Cables / OTBs / Bestrays / Splitters / Cable cores / Core connections
- Map view (Google Maps + Leaflet) dengan canvassing flow
- Power budget calculator, splitter chain visualizer

### Marketing CRM
- **Canvassing**: realtime GPS tracking, prospect-add, field reports dengan foto auto-compress
- **Lead pipeline**: Kanban dengan drag-drop, stage history, assignee tracking, photo evidence
- **Prospect database**: Google Places import dengan ODP coverage matching
- **Marketing Ads**: campaign tracking placeholder

### Billing & Operations
- **Billing sync**: pull dari `billing.jabnet.id` API, smart interval (60s peak / 600s off-peak)
- **Customer manual_overrides**: array of locked field names yang tidak ke-overwrite saat sync
- **Collection pipeline**: auto-open saat customer isolir, auto-close saat lunas, threshold-based aging
- **Reconciliation pass**: setiap cycle sync, auto-detect dan fix drift antara customer.isIsolir vs open collections
- **Force-resync per customer**: admin trigger via `POST /api/billing/sync/customer/:id/force`
- **Sync health**: `GET /api/billing/sync/health` returns drift count + stale sync count
- **Tickets / Work Orders**: dengan SLA tracking, technician dispatch
- **MikroTik integration**: PPP active sessions, interface counters, isolir profile switch
- **GenieACS / TR-069**: ONT WiFi config, reboot, RX power monitoring

### Customer Portal (`/portal/*`)
- Login pakai customerId (9-digit) → OTP via WhatsApp
- **Overview tab**: status koneksi, IP, uptime, ONT status, RX power, tagihan ringkas
- **Pemakaian tab**: live realtime speed (poll 3 detik via `/api/portal/traffic/live`, compute Mbps/Gbps), session bytes, 24h area chart dengan auto MB→GB formatting
- **Tagihan tab**: invoice-style dengan due date countdown, WhatsApp CS CTA
- **WiFi tab**: per-band SSID/password edit (TR-069), restart ONT (rate-limited 1x/jam)
- **Bantuan tab**: lapor ticket
- **Sahabat tab**: program loyalty (lihat di bawah)

### JABNET Sahabat (Loyalty Program)
- 3 tier: Pelanggan / RT-RW / Desa
- 5 level: Perunggu (5 ref) / Perak (10) / Emas (20) / Platinum (30) / Berlian (50) → Ambassador (100+)
- Kode format `SHB-<KEC3>-<NNN>` (e.g. `SHB-CLW-001` untuk Cilawu)
- Per-referral reward: Voucher Indomaret Rp 50.000 (default)
- Milestone bonus: Rp 200K + Speed Boost (Perunggu), GRATIS 12bln (Perak), GRATIS 24bln + speed upgrade (Emas), GRATIS 36bln + Cash Rp 2jt (Platinum), GRATIS 60bln + Cash Rp 5jt + Trainer (Berlian)
- Auto-link by phone match saat customer baru daftar via referral code
- MPWA notification per referral sukses + per level-up
- Admin page `/loyalty` dengan KPI tiles, level breakdown bar chart, leaderboard, referral list, discount queue

### Public Open API (untuk integrasi AI / BI)
- Base URL: `/api/public/v1/*`
- Scope `marketing:read` ⭐ (RECOMMENDED) — 13 endpoint untuk ops daily analysis
  - `/marketing/overview` ⭐ ONE-SHOT JSON dengan momentum, top performers, hot spots, pre-computed redFlags + greenLights
  - `/marketing/canvassing/sessions`, `/canvassing/performance`, `/canvassing/reports`
  - `/marketing/leads/funnel`, `/leads/attribution`, `/leads/performance`
  - `/marketing/coverage` (per district), `/heatmap` (GIS lat/lng)
  - `/marketing/sahabat/funnel`, `/marketing/prospects/stats`
- Other scopes: `reports:read`, `leads:read`, `collections:read`, `sahabat:read`, `tickets:read`
- Rate limit: 60 req/min default, configurable per key
- Usage logged ke `api_key_usage_logs` table, 30-day retention
- Admin page `/api-keys` dengan key list, create dialog (one-time full key display), usage log viewer, full docs dialog

### Design System v4.2.0 (TELCO PREMIUM — RULES CRITICAL)

**WAJIB IKUTI POLA INI** untuk konsistensi. Semua komponen di `client/components/ui/`, design tokens di `client/index.css`.

**Core Components (JANGAN recreate — PAKAI yang ada):**
- `<PageHeader icon title description accent actions onRefresh lastUpdated />` — wajib di top tiap page (accent: primary|success|warning|info|violet|rose)
- `<PageContainer>` + `<PageSection title description actions />` — wrapper standar
- `<StatTile icon label value description accent trend onClick />` — untuk KPI (accent: primary|success|warning|danger|info|violet|neutral)
- `<StatusBadge variant label size appearance />` — untuk status (variant: success|warning|danger|info|neutral|pending · appearance: subtle|solid|outline|dot)
- `<EmptyState icon title description action variant size />` — no generic "tidak ada data"
- `<Card variant padding>` — 6 variants (default, flat, elevated, ghost, glass, gradient) + padding presets
- `<Button variant size loading leftIcon rightIcon>` — 9 variants (+gradient, outline-primary, ghost-primary, success, warning), 7 sizes (+xs, xl, icon-sm/xs)
- `<Input inputSize leftIcon rightIcon error>` — size + icon slots + error state
- Skeletons: `<SkeletonKPIGrid>`, `<SkeletonCard>`, `<SkeletonTable>`, `<SkeletonChart>`, `<SkeletonList>` — gunakan instead of spinner

**Phase 2 Advanced:**
- `<DataTable columns data searchable onRowClick emptyTitle>` — TanStack table wrapper
- `<FormField label htmlFor required error hint><Input {...} /></FormField>` + `<FormRow cols>` + `<FormSection>` — zod compat
- `<Combobox options value onChange searchPlaceholder>` — searchable select
- `<Command>` primitives untuk command palette

**Layout:**
- `<TopBar>` — global header dengan breadcrumb + Cmd+K search + status lights + notif + user menu (integrated)
- `<Sidebar>` — gradient logo, permission-filtered, count badges, online profile dot
- `<BottomNav>` — mobile, gradient active indicator, asset tone colors
- `<FloatingMenuButton>` — untuk fullscreen pages (/map, /canvassing) di mobile
- `<BottomSheet>` — spring animation, swipe-to-dismiss

**Color System (WAJIB — JANGAN hardcoded hex):**
- Semantic: `bg-primary`, `bg-success`, `bg-warning`, `bg-destructive`, `bg-info`, `bg-muted`
- Chart palette: `chart-1` … `chart-8` (via CSS var, theme-aware)
- Asset topology: `asset-pop`, `asset-odc`, `asset-odp`, `asset-pole`, `asset-cable`
- Transparent variants: `bg-success/10 text-success`, `bg-destructive/15`, dll
- **NEVER**: `style={{color: "#22C55E"}}`, `#ff5f2e`, Terra tokens `{T.accent}`

**Typography:**
- Fonts: Inter 400-900 (sans) + JetBrains Mono (`.font-mono-tight` for IDs/codes)
- Display tracking: `tracking-tight-display` untuk h1/h2 premium headings
- Numbers: `tabular-nums` (auto-applied pada font-bold/black)
- Sizes: `text-2xs` (10px), `text-xs` (12px), standard scale

**Patterns:**
- Hero gradient: `bg-gradient-to-br from-sidebar via-sidebar/95 to-sky-900` + `bg-mesh` overlay + `bg-grid-pattern`
- Gradient text: `.text-gradient-brand` (sky → blue → violet)
- Elevation: `shadow-elev-sm` (cards), `shadow-elev-md` (hover), `shadow-elev-lg` (modals)
- Focus ring: auto via `:focus-visible` base style
- Live indicator: `.pulse-ring-success` / `.pulse-ring-warning` / `.pulse-ring-danger`

**Command Palette (⌘K):**
- Global via `<CommandPalette>` in TopBar
- 40+ routes grouped: Navigasi Utama, Aset Jaringan, Billing & Operations, Tools, Administrasi, Aksi Cepat
- Keyboard: ↑↓ nav, ⏎ pilih, esc tutup
- Permission-filtered automatically

**Error handling:**
- `<ErrorBoundary>` wraps ProtectedRouter
- `<PageLoader>` branded spinner for lazy routes
- 404 page with gradient hero + dual CTA

### Notifications + News + Bugs (v4.1.10)
- **NotificationBell**: floating top-right, badge unread count (poll 30s), 8 notif types dengan icon-coded
- **AnnouncementsPage** (`/announcements`): admin publish update fitur, broadcast ke semua staff via notif bell
- **BugReportsPage** (`/bugs`): semua user bisa lapor bug + screenshot, admin triage dengan status flow

### User & Role Management (Enterprise-grade)
- **UsersPage** (`/users`): KPI tiles, search/filter, bulk select + bulk action bar (activate/deactivate/set_role), avatar dengan gradient sesuai role + online dot
- **UserDetailDrawer** dengan 4 tabs: Overview / Produktivitas / Aktivitas (audit timeline) / Akses (granted permissions per group)
- **Backend endpoints**:
  - `GET /api/users/:id/activity` — audit timeline filtered
  - `GET /api/users/:id/stats` — productivity counters (logins, actions, tickets/leads/collections assigned, canvassing reports)
  - `POST /api/users/bulk-action` — activate/deactivate/set_role/delete
- **RolesPage** (`/roles`): 4 KPI tiles, role cards dengan user count, permission preview dialog (read-only mode), full edit dialog dengan per-group matrix + presets
- Auto-sync permission migration: setiap startup, semua role auto-grant permission keys terbaru. Administrator role paksa `write` untuk semua.
- Unique constraint `idx_users_username` mencegah duplicate user.

---

## Critical Gotchas / Things to Know

1. **Build flow tidak biasa**: Vite build client → static assets ke `dist/public/`. Esbuild bundle server → `dist/index.mjs`. Production = `node dist/index.mjs` (no tsx).
2. **Storage class adalah satu file gigantic** (~5000 lines). Methods di-organize per domain dengan section header `// ====================`. Hati-hati waktu edit — pakai Grep dulu cari method yang sudah ada.
3. **Permission system 3-level**: `none` / `read` / `write`. Check via `hasPermission(req, "key")` (read) atau `hasWritePermission(req, "key")` (write). Permission key didefine di `shared/schema.ts` `ALL_PERMISSIONS` array.
4. **Mobile UX pattern (consistent across pages)**:
   - Negative margin untuk full-bleed: `-m-4 md:-m-6 -mt-16 md:-mt-6 pb-20 md:pb-0`
   - Sticky header `pt-16 md:pt-6` (akomodasi hamburger)
   - Filter pills: `overflow-x-auto no-scrollbar -mx-4 md:mx-0 px-4 md:px-0`
   - Dialogs: `max-w-X w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0`
5. **Branding**: Title "JABNET Workspace", v4.1.10. Logo brand gradient sky-500 → blue-700. Login subtitle "Platform Operasional ISP". Favicon di `/public/favicon.svg` + `.ico` + PNG sizes.
6. **Default admin**: username `admin`, password `Admin@1234` (or `admin123` after testing). Auto-seeded saat DB kosong via `seedAdminIfNeeded`.
7. **MPWA WhatsApp gateway**: settings via `app_settings` table (`mpwa_url`, `mpwa_token`, `mpwa_enabled`). Dev mode (mpwa_enabled=false): OTP di-log ke console + return `debugOtp` di response.
8. **Lead API enrichment**: `/api/public/v1/leads` + `/collections` sekarang return `assignedToName`, `assignedToUsername`, `assignedToRole` via `_lookupUsers()` helper batch query.
9. **Customer fields mapping**: backend uses snake_case, frontend uses camelCase via Drizzle. `customer_id` (text, billing ID like "052500015") berbeda dengan `id` (autoincrement int).
10. **NEVER deploy to production tanpa user explicit OK** — production sekarang di `workspace.jabnet.id` (cPanel Passenger di `103.194.47.165`). Deploy: `git push origin main` → GHA build → user pull di cPanel `Git Version Control → Update from Remote` → Restart Node.js App. (Prod lama `fiber-tools.arkanova.id` masih co-existing dengan PM2.)
11. **Google Maps API key**: di-load runtime via `GET /api/public-config` (no auth, 60s in-memory cache) dari `app_settings.google_maps_api_key`. Set/ganti key di `/integrations` tanpa rebuild. Fallback chain: settings table → `VITE_GOOGLE_MAPS_API_KEY` env → hardcoded legacy key. Key WAJIB whitelist domain di GCP Console HTTP referrers.
12. **cPanel keep-alive**: cron `*/4 * * * * curl -s https://workspace.jabnet.id/api/health > /dev/null 2>&1` untuk cegah Passenger idle spin-down (~5 menit threshold).
13. **Server route cache** (`server/route-cache.ts`): generic TTL Map cache untuk endpoint read-heavy. Sekarang di-wire ke `/api/dashboard` + `/api/map-data/infra` (60s TTL). Auto-invalidate via router middleware saat mutation asset/customer sukses — pattern `/api/(pops|odcs|odps|poles|cables|cable-cores)` busts dashboard+map-infra, `/api/customers` busts dashboard only.
14. **Vendor bundle split** (`vite.config.ts`): manualChunks pisahkan react/radix/query/forms/motion/maps/chart ke chunk masing-masing. Map page hanya load `maps-vendor` (Leaflet+Google Maps) saat dibuka. Repeat visitor pakai vendor cache. JANGAN balikin ke single bundle — main `index-*.js` tetap di ~170KB.
15. **Polling pause-on-blur**: queryClient default `refetchIntervalInBackground: false` — semua `refetchInterval` auto pause saat tab blurred. Raw `setInterval` di portal traffic 3s tick pakai `document.visibilitychange` listener — wajib untuk mobile portal (phone lock screen). Kalau perlu keep-alive polling, override per-query dengan `refetchIntervalInBackground: true`.

---

## Common Tasks Pointers

- **Add new permission**: edit `ALL_PERMISSIONS` di `shared/schema.ts`. Auto-migration di `upgradePermissionsV412()` akan auto-grant ke admin + sync ke other roles dengan default level (`read` for Read Only, `none` for others).
- **Add new MPWA template**: edit `seedDefaultMpwaTemplates()` in storage.ts dengan `key`, `name`, `content` (placeholder syntax `{nama}`, `{otp}`, dst).
- **Add public API endpoint**: edit `server/public-api-routes.ts`, gunakan `requireScope("scope:read")` middleware. Update schema endpoint list di `/api/public/v1/schema` response.
- **New customer field**: ALTER TABLE customers di startup migration block + add to `BillingCustomerRecord` interface + decide if it's CRITICAL/INFO/ASSIGNMENT in `upsertCustomerFromBillingWhitelist`.
- **Type errors**: `npx tsc --noEmit` (need TypeScript installed). `npm run build` juga catches type errors via Vite/esbuild.
- **Cache a new endpoint**: pakai `getCached`/`setCached` dari `server/route-cache.ts`. Kalau read-result depend on mutations existing routes, tambahkan key ke middleware invalidation pattern di `routes.ts` (lihat `Router.use` block paling atas).
- **Batch a list endpoint enrichment** (anti N+1): kalau ada loop `for (item) { await getX(item.foreignId) }`, tambah method `getXByIds(ids: number[]): Promise<Map<number, X>>` di storage pakai `inArray()` (lihat `getOdpsByIds`, `getLeadActivitiesForLeads` sebagai reference). Lalu di route: extract unique IDs, batch lookup sekali, in-memory join.

---

## Recent Sync Bug Fix (v4.1.10)

User reported: customer data + collection data not always in sync. Fixed:

1. **Field-class whitelist** — billing-critical fields (isIsolir, billingStatus, dueDate, lastPaymentDate) ALWAYS sync. Info fields (name, phone, email, address) respect `manualOverrides` array.
2. **Manual override API**: `POST /api/customers/:id/manual-overrides` body `{lockedFields: ["address","phone"]}` — admin lock fields dari sync overwrite. Whitelist 10 field yang boleh di-lock.
3. **`updateCustomer` bug fix**: explicit `manualOverrides` di POST body tidak lagi ke-overwrite oleh auto-detect logic.
4. **Reconciliation pass per cycle**: `reconcileCollectionState()` cek 2 case — (a) isolir tapi no open collection → auto-open, (b) lunas tapi open collection → auto-close.
5. **Force-resync endpoint**: `POST /api/billing/sync/customer/:id/force` — bypass scheduler, sync 1 customer immediately, return before/after diff.
6. **Sync health endpoint**: `GET /api/billing/sync/health` returns `{customersTotal, isolirCount, openCollectionsCount, drift, staleSyncCount, oldestStaleSync, lastSyncAt}` untuk admin visibility.

---

## What's NOT Yet Done (Backlog)

- IntegrationPage UI untuk manual_overrides toggle per customer (backend done, UI belum)
- Sync health badge di Dashboard (banner kalau drift > 5)
- Webhook notifikasi billing → JABNET (push instead of poll)
- Customer payment online (integrasi payment gateway)
- Multi-customer per 1 nomor HP (family account)
- Customer portal mobile app PWA install prompt
- Marketing Ads module API exposure (placeholder return empty)

---

## Production Deploy (cPanel)

```bash
# di local:
npm run build       # verify build sukses
npm run typecheck   # 0 errors expected
git push origin main
```

GitHub Actions akan auto-build (workflow `.github/workflows/build.yml`).

Lalu manual step di cPanel `https://103.194.47.165:2083`:
1. **Git Version Control** → repo `ftth-tools` → **Update from Remote**
2. **Setup Node.js App** → **Restart**
3. Verify: `curl https://workspace.jabnet.id/api/health` → `ok:true`

**URL prod baru:** `https://workspace.jabnet.id` (cPanel Passenger)
**URL prod lama (still alive):** `https://fiber-tools.arkanova.id` (VPS PM2, 103.194.46.164)

**cPanel SSH (jika perlu debug):**
```bash
ssh -i ~/.ssh/access-jabnet-cpanel jabnet@103.194.47.165   # passphrase Zero1902!
mysql -u jabnet_crm_user -p'Galon@12345' jabnet_fiber      # DB CLI
```

---

## v5.2.0 — Teamspace + Struktur Divisi + Modul HR (Juli 2026)

Pengembangan besar setelah v4.3.0 — SEMUA sudah live di branch
`claude/fiber-jabnet-access-2nn8mp` (repo kanggalon710/workspace). Dokumen wajib baca:

| Dokumen | Isi |
|---|---|
| `PRD-JABNET-TEAMSPACE.md` | Teamspace (clone Cicle): tim, board tugas, chat+read-by, jadwal, check-in WA, dokumen, pengumuman, kinerja+AI, cheers |
| `AUDIT-RESPONSE.md` | 11 bug audit eksternal — semua fixed; keputusan scope |
| `KONSEP-DIVISI.md` | Restrukturisasi navigasi per DIVISI + status implementasi PRD-HR |
| `PRDHR.md` (upload) | PRD HR & Payroll (reverse-eng GajiHub) — HR-1 & HR-2 selesai, HR-3 sebagian |
| `LOCAL-DEV.md` | Cara run lokal (Docker MySQL → db:push → dev) |

Arsitektur singkat v5.x:
- **Navigasi berbasis divisi**: `client/lib/divisions.ts` = satu sumber kebenaran
  (Sidebar/Beranda/hub `/divisi/:key` semua baca dari sini). Dashboard lama → `/dashboard-jaringan` (NOC).
- **Teamspace**: board tim = pipeline dengan `pipelines.team_id`; header konsisten `TeamModuleNav`.
- **HR/SDM**: halaman HR `/hrd/sdm` (izin `hr_sdm`) + ESS `/hr/absen` (semua staff).
  Storage section "SDM / HRD" di storage.ts; endpoint prefix `/api/hr/*`.
  Payroll engine murni: `shared/payroll.ts` (TER PPh21 + BPJS, unit-tested) —
  VERIFIKASI tarif vs referensi resmi sebelum bayar gaji sungguhan.
- **Lead intake**: rule `lead_created` di-seed otomatis → lead canvassing langsung jadi kartu pipeline (dedup phone).
- Migrasi DB semuanya idempotent di startup (`runTeamspaceMigrations` + blok HR) — deploy tetap pull+build+restart.
- Test: `npx tsx --test shared/*.test.ts` (262 test). Typecheck & build wajib hijau sebelum push.
